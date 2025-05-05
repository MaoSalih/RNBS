const Agent = require('./Agent');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const Coin = require('./Coin');

class Network extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Default options
    this.options = {
      requiredWitnesses: 3,
      numAgents: 5,
      dataDir: path.join(process.cwd(), 'data'),
      networkId: 'main',
      peerTimeout: 30000, // 30 seconds
      maxRetries: 3,
      ...options
    };
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.options.dataDir)) {
      fs.mkdirSync(this.options.dataDir, { recursive: true });
    }
    
    // Create agents directory
    const agentsDir = path.join(this.options.dataDir, 'agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
    
    // Network state
    this.agents = [];
    this.peers = new Map(); // Connected peers: id -> {address, lastSeen, status}
    this.pendingTransactions = new Map(); // txId -> {transaction, witnesses, retries}
    this.networkId = this.options.networkId;
    this.startTime = Date.now();
    
    // Create agents with persistence
    for (let i = 0; i < this.options.numAgents; i++) {
      const agentPath = path.join(agentsDir, `agent-${i}.json`);
      this.agents.push(new Agent(i, agentPath));
    }
    
    // Set up periodic network tasks
    this._setupNetworkTasks();
  }

  // Set up periodic tasks for network maintenance
  _setupNetworkTasks() {
    // Clean up stale peers
    this.peerCleanupInterval = setInterval(() => {
      this._cleanupStalePeers();
    }, 60000); // Every minute
    
    // Retry pending transactions
    this.retryInterval = setInterval(() => {
      this._retryPendingTransactions();
    }, 15000); // Every 15 seconds
    
    // Periodic statistics
    this.statsInterval = setInterval(() => {
      this._collectNetworkStats();
    }, 5 * 60000); // Every 5 minutes
  }

  // Clean up disconnected peers
  _cleanupStalePeers() {
    const now = Date.now();
    const timeout = this.options.peerTimeout;
    
    let removed = 0;
    for (const [peerId, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > timeout) {
        this.peers.delete(peerId);
        removed++;
        this.emit('peer:disconnect', { peerId, reason: 'timeout' });
      }
    }
    
    if (removed > 0) {
      console.log(`Removed ${removed} stale peers`);
    }
  }

  // Retry transactions that are still pending
  async _retryPendingTransactions() {
    for (const [txId, tx] of this.pendingTransactions.entries()) {
      if (tx.retries >= this.options.maxRetries) {
        // Transaction failed after max retries
        this.pendingTransactions.delete(txId);
        this.emit('transaction:failed', { 
          txId, 
          reason: 'max retries exceeded',
          transaction: tx.transaction
        });
        continue;
      }
      
      // Increment retry count
      tx.retries++;
      
      // Try to get more witness validations
      await this._processTransaction(tx.transaction);
    }
  }

  // Collect and log network statistics
  _collectNetworkStats() {
    const stats = {
      agents: this.agents.length,
      activePeers: this.peers.size,
      pendingTransactions: this.pendingTransactions.size,
      witnessStats: this.agents.map(agent => agent.getStats()),
      timestamp: Date.now()
    };
    
    this.emit('network:stats', stats);
    
    // Save stats to file
    try {
      const statsDir = path.join(this.options.dataDir, 'stats');
      if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
      }
      
      const filename = path.join(statsDir, `stats-${new Date().toISOString().replace(/:/g, '-')}.json`);
      fs.writeFileSync(filename, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('Error saving stats:', error);
    }
  }

  // Connect to a peer
  connectToPeer(peerId, peerInfo) {
    if (this.peers.has(peerId)) {
      // Update existing peer
      const peer = this.peers.get(peerId);
      peer.lastSeen = Date.now();
      peer.status = 'connected';
      this.peers.set(peerId, {
        ...peer,
        ...peerInfo
      });
      
      this.emit('peer:updated', { peerId, peer: this.peers.get(peerId) });
    } else {
      // New peer
      this.peers.set(peerId, {
        ...peerInfo,
        lastSeen: Date.now(),
        status: 'connected',
        connectedAt: Date.now()
      });
      
      this.emit('peer:connected', { peerId, peer: this.peers.get(peerId) });
    }
    
    return this.peers.get(peerId);
  }

  // Disconnect from a peer
  disconnectFromPeer(peerId, reason = 'manual') {
    if (this.peers.has(peerId)) {
      const peer = this.peers.get(peerId);
      this.peers.delete(peerId);
      this.emit('peer:disconnect', { peerId, reason, peer });
      return true;
    }
    return false;
  }

  // Get a random subset of agents to act as witnesses
  getRandomWitnesses(count, exclude = []) {
    const availableAgents = this.agents.filter(agent => 
      !exclude.includes(agent.id));
    
    if (availableAgents.length <= count) {
      return availableAgents;
    }
    
    // Use reputation-based selection
    return this._getReputationBasedWitnesses(availableAgents, count);
  }
  
  // Select witnesses based on their reputation scores
  _getReputationBasedWitnesses(availableAgents, count) {
    if (availableAgents.length <= count) {
      return availableAgents;
    }
    
    // Calculate total reputation points for weighted selection
    const totalReputationPoints = availableAgents.reduce(
      (sum, agent) => sum + agent.getReputationScore(), 0
    );
    
    // Mix of reputation-based and random selection
    // 70% reputation-based, 30% random to prevent centralization
    const reputationBasedCount = Math.ceil(count * 0.7);
    const randomCount = count - reputationBasedCount;
    
    // First select by reputation (weighted)
    const selectedWitnesses = [];
    const remainingAgents = [...availableAgents];
    
    // Select agents based on weighted probability of their reputation
    for (let i = 0; i < reputationBasedCount && remainingAgents.length > 0; i++) {
      // Calculate weighted probabilities
      const weights = remainingAgents.map(agent => 
        agent.getReputationScore() / totalReputationPoints
      );
      
      // Select an agent using weighted random selection
      const selectedIndex = this._weightedRandomSelection(weights);
      selectedWitnesses.push(remainingAgents[selectedIndex]);
      remainingAgents.splice(selectedIndex, 1);
    }
    
    // Then add some random agents for diversity
    if (randomCount > 0 && remainingAgents.length > 0) {
      // Shuffle remaining agents
      const shuffled = [...remainingAgents].sort(() => 0.5 - Math.random());
      selectedWitnesses.push(...shuffled.slice(0, randomCount));
    }
    
    return selectedWitnesses;
  }
  
  // Helper for weighted random selection
  _weightedRandomSelection(weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(weight => weight / sum);
    
    let random = Math.random();
    for (let i = 0; i < normalizedWeights.length; i++) {
      random -= normalizedWeights[i];
      if (random <= 0) {
        return i;
      }
    }
    
    // Fallback to the last item if there's any floating-point precision issue
    return normalizedWeights.length - 1;
  }

  // Process an incoming transaction through the network
  async _processTransaction(transaction) {
    const { coin, signature, sender, recipient, timestamp } = transaction;
    
    // Generate transaction ID
    const txId = crypto.createHash('sha256')
      .update(`${coin.id}-${sender}-${recipient}-${timestamp}`)
      .digest('hex');
    
    // If the transaction is new, add to pending
    if (!this.pendingTransactions.has(txId)) {
      this.pendingTransactions.set(txId, {
        transaction,
        witnesses: [],
        validations: [],
        timestamp: Date.now(),
        retries: 0
      });
      
      this.emit('transaction:new', { txId, transaction });
    }
    
    // Get the pending transaction record
    const pendingTx = this.pendingTransactions.get(txId);
    
    // Skip if we already have enough validations
    if (pendingTx.validations.filter(v => v.valid).length >= this.options.requiredWitnesses) {
      return txId;
    }
    
    // Get witnesses for this transaction (excluding sender and recipient agents)
    const senderAgentIndex = this.agents.findIndex(a => a.getWallet().getId() === sender);
    const recipientAgentIndex = this.agents.findIndex(a => a.getWallet().getId() === recipient);
    
    // Get witnesses we haven't tried yet
    const usedWitnessIds = new Set(pendingTx.witnesses.map(w => w.id));
    const witnesses = this.getRandomWitnesses(
      this.options.requiredWitnesses,
      [senderAgentIndex, recipientAgentIndex, ...Array.from(usedWitnessIds)]
    );
    
    // Log witness selection with their reputation scores
    if (witnesses.length > 0) {
      console.log(`Selected ${witnesses.length} witnesses with reputation scores: ${
        witnesses.map(w => `${w.id}(${Math.round(w.getReputationScore())})`).join(', ')
      }`);
    }
    
    // Have all witnesses validate the transfer
    for (const witness of witnesses) {
      // Add to the list of witnesses we've tried
      pendingTx.witnesses.push({ id: witness.id, timestamp: Date.now() });
      
      // Get validation result - now async
      const validation = await witness.validateTransfer(transaction);
      
      // Record the validation
      pendingTx.validations.push({
        ...validation,
        witnessId: witness.id,
        timestamp: Date.now()
      });
      
      // If the validation is negative (double-spend), we can stop right away
      if (!validation.valid) {
        this.emit('transaction:invalid', { 
          txId, 
          reason: validation.reason,
          transaction
        });
        
        // Keep the transaction in pending for stats/reference, but mark as failed
        pendingTx.status = 'failed';
        pendingTx.failReason = validation.reason;
        
        return txId;
      }
    }
    
    // Check if we have enough valid witness signatures
    const validWitnesses = pendingTx.validations.filter(v => v.valid);
    
    if (validWitnesses.length >= this.options.requiredWitnesses) {
      // Transaction is valid! Complete it
      const witnessIds = validWitnesses.map(v => v.witnessId);
      
      // Complete the transfer and update coin ownership
      transaction.coin.transfer(recipient, transaction.signature, witnessIds);
      
      // Find recipient agent (if it's in our network)
      const recipientAgent = this.agents.find(a => a.getWallet().getId() === recipient);
      if (recipientAgent) {
        // If in our network, add to their wallet
        recipientAgent.getWallet().addCoin(transaction.coin);
      }
      
      // Remove from pending
      this.pendingTransactions.delete(txId);
      
      // Emit success event
      this.emit('transaction:confirmed', { 
        txId, 
        transaction,
        witnesses: witnessIds
      });
      
      console.log(`✅ Coin ${transaction.coin.id.substring(0, 6)}... transferred from ${sender.substring(0, 8)} to ${recipient.substring(0, 8)}`);
      
      return { txId, status: 'confirmed', witnesses: witnessIds };
    }
    
    // Not enough valid witnesses yet
    return { txId, status: 'pending', validations: validWitnesses.length };
  }

  // Transfer a coin between two agents with witness verification
  async transferCoin(fromAgentId, toAgentId, coinIndex) {
    const sender = this.agents[fromAgentId];
    const recipient = this.agents[toAgentId];
    
    if (!sender || !recipient) {
      console.log("❌ Invalid agent IDs");
      return { success: false, reason: 'invalid agent IDs' };
    }
    
    // Get the recipient's wallet ID
    const recipientId = recipient.getWallet().getId();
    
    // Perform the transfer from sender's wallet
    const transfer = sender.getWallet().transferCoin(coinIndex, recipientId);
    
    if (!transfer) {
      console.log(`❌ Agent ${fromAgentId} does not have a coin at index ${coinIndex}`);
      return { success: false, reason: 'coin not found' };
    }
    
    // Process the transaction through the network
    const result = await this._processTransaction(transfer);
    
    // If the transfer failed, return the coin to the sender
    if (result && result.status === 'failed') {
      sender.getWallet().addCoin(transfer.coin);
      return { success: false, reason: result.failReason || 'transaction failed' };
    }
    
    return { success: true, txId: result.txId };
  }

  // Simulate a double-spend attempt (advanced version)
  async simulateDoubleSpend(fromAgentId, coinIndex) {
    const sender = this.agents[fromAgentId];
    if (!sender || coinIndex >= sender.getWallet().getCoinCount()) {
      console.log("Cannot simulate double-spend: invalid agent or coin");
      return { success: false, reason: 'invalid parameters' };
    }
    
    // Save original coin for double-spend attempt
    const originalCoin = sender.getWallet().coins[coinIndex];
    const originalCoinId = originalCoin.id;
    
    console.log("\n--- Attempting first transfer (should succeed) ---");
    
    // First recipient
    const firstRecipient = this.agents[(fromAgentId + 1) % this.agents.length];
    
    // First transfer - use the actual transferCoin method for the first transfer
    const firstResult = await this.transferCoin(fromAgentId, (fromAgentId + 1) % this.agents.length, coinIndex);
    
    if (firstResult.success) {
      console.log("\n--- Attempting double-spend (should fail) ---");
      
      // Second recipient
      const secondRecipient = this.agents[(fromAgentId + 2) % this.agents.length];
      
      // For the second transfer, create a new coin with the same ID
      // This simulates a double-spend attack
      const fakeCoin = new Coin(
        sender.getWallet().getId(),
        originalCoin.value || 1,
        originalCoinId
      );
      
      // Add the fake coin to the sender's wallet temporarily
      sender.getWallet().coins.push(fakeCoin);
      
      // Now try to transfer this coin (should be caught as double-spend)
      const doubleSpendIndex = sender.getWallet().coins.length - 1;
      const secondResult = await this.transferCoin(
        fromAgentId, 
        (fromAgentId + 2) % this.agents.length, 
        doubleSpendIndex
      );
      
      // Remove the fake coin
      sender.getWallet().coins.pop();
      
      return { 
        firstTransfer: firstResult,
        doubleSpend: secondResult 
      };
    }
    
    return { 
      success: false, 
      reason: 'first transfer failed', 
      details: firstResult 
    };
  }
  
  // Initialize the network with some coins and varying reputations
  initialize(coinsPerAgent = 2) {
    // Assign varying initial reputations to create diversity
    this.agents.forEach((agent, index) => {
      // Vary initial reputation between 60-100 to create a realistic network
      // In a real network, agents would have varying reputations based on history
      if (index > 0) { // Leave agent 0 at default 100 reputation
        const initialReputation = 60 + Math.floor(Math.random() * 40);
        
        // Directly modify the reputation score (simplified for simulation)
        agent.reputation.score = initialReputation;
        
        // Add some history to make it realistic
        const successRate = initialReputation / 100;
        agent.reputation.successfulValidations = Math.floor(50 * successRate);
        agent.reputation.failedValidations = Math.floor(50 * (1 - successRate));
      }
      
      // Create coins
      for (let i = 0; i < coinsPerAgent; i++) {
        // Random value between 1 and 10
        const value = Math.floor(Math.random() * 10) + 1;
        
        // Create a coin directly
        const coin = new Coin(agent.getWallet().getId(), value);
        
        // Register agent's public key for validation
        const walletId = agent.getWallet().getId();
        const publicKey = agent.getWallet().publicKey;
        
        // Register this public key with all agents
        this.agents.forEach(otherAgent => {
          otherAgent.registerPublicKey(walletId, publicKey);
        });
        
        // Add the coin to the wallet
        agent.getWallet().addCoin(coin);
        
        console.log(`Agent ${agent.id} (rep: ${Math.round(agent.getReputationScore())}) initialized with coin ${coin.id.substring(0, 6)}... (value: ${value})`);
      }
    });
    
    console.log(`Initialized network with ${this.agents.length} agents and ${coinsPerAgent} coins each`);
    this.emit('network:initialized', { agents: this.agents.length, coinsPerAgent });
  }

  // Shutdown the network gracefully
  shutdown() {
    // Clear intervals
    clearInterval(this.peerCleanupInterval);
    clearInterval(this.retryInterval);
    clearInterval(this.statsInterval);
    
    // Cleanup agents
    this.agents.forEach(agent => agent.destroy());
    
    console.log('Network shutdown complete');
    this.emit('network:shutdown');
  }

  // Get network statistics with reputation data
  getNetworkStats() {
    return {
      networkId: this.networkId,
      agents: this.agents.length,
      peers: this.peers.size,
      pendingTransactions: this.pendingTransactions.size,
      requiredWitnesses: this.options.requiredWitnesses,
      uptime: Date.now() - this.startTime,
      agentReputations: this.agents.map(agent => ({
        id: agent.id,
        reputation: agent.getReputationScore()
      }))
    };
  }
}

module.exports = Network; 
