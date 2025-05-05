const crypto = require('crypto');
const { BloomFilter } = require('bloom-filters');
const fs = require('fs');
const path = require('path');
const Wallet = require('./Wallet');
const Coin = require('./Coin');

class Agent {
  constructor(id, persistencePath = null) {
    this.id = id;
    this.wallet = new Wallet();
    this.persistencePath = persistencePath;
    
    // Production-ready Bloom filter with optimized parameters
    // Size and hash functions calibrated for expected network volume
    this.seenCoins = new BloomFilter(10000000, 15); // 10M elements, 15 hash functions for < 0.01% false positive rate
    
    // For exact double-spend detection, maintain a cache of recently seen coins
    this.recentTransactionCache = new Map(); // coinId -> {timestamp, hash}
    this.maxCacheSize = 100000; // Larger cache size for production
    
    // For zero-balance prevention, track coin values
    this.validatedValues = new Map(); // coinId -> lastKnownValue
    
    // Counter for consecutive validation failures (for security banning)
    this.validationFailures = new Map(); // sender -> failureCount
    this.maxFailuresBeforeBan = 5;
    
    // List of banned wallets
    this.bannedWallets = new Set();
    
    // Public key directory - in production this would sync with a distributed directory service
    this.publicKeyDirectory = new Map(); // walletId -> publicKey
    
    // Reputation system
    this.reputation = {
      score: 100, // Initial reputation score (0-100)
      successfulValidations: 0,
      failedValidations: 0,
      lastUpdated: Date.now(),
      history: [] // Track reputation changes over time
    };
    
    // Load filter state if persistence is enabled
    if (persistencePath) {
      this._loadState();
    }
    
    // Stats for monitoring
    this.stats = {
      validationsPerformed: 0,
      doubleSpendsPrevented: 0,
      zeroBalancePrevented: 0,
      validSignatures: 0,
      invalidSignatures: 0,
      bannedWallets: 0,
      lastReset: Date.now()
    };
    
    // Set up automatic persistence (every 5 minutes)
    if (persistencePath) {
      this.persistenceInterval = setInterval(() => {
        this._saveState();
      }, 5 * 60 * 1000);
    }
  }

  // Save current filter state to disk
  _saveState() {
    if (!this.persistencePath) return;
    
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const state = {
        id: this.id,
        filter: this.seenCoins.saveAsJSON(),
        recentTransactions: Array.from(this.recentTransactionCache.entries()),
        validatedValues: Array.from(this.validatedValues.entries()),
        bannedWallets: Array.from(this.bannedWallets),
        publicKeyDirectory: Array.from(this.publicKeyDirectory.entries()),
        reputation: this.reputation,
        stats: this.stats,
        timestamp: Date.now()
      };
      
      fs.writeFileSync(
        this.persistencePath, 
        JSON.stringify(state, null, 2)
      );
    } catch (error) {
      console.error(`Failed to save agent state: ${error.message}`);
    }
  }

  // Load filter state from disk
  _loadState() {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    
    try {
      const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8'));
      
      // Restore Bloom filter
      if (data.filter) {
        this.seenCoins = BloomFilter.fromJSON(data.filter);
      }
      
      // Restore recent transactions cache
      if (data.recentTransactions) {
        this.recentTransactionCache = new Map(data.recentTransactions);
        // Prune old entries after loading
        this._pruneCache();
      }
      
      // Restore validated values cache
      if (data.validatedValues) {
        this.validatedValues = new Map(data.validatedValues);
      }
      
      // Restore banned wallets
      if (data.bannedWallets) {
        this.bannedWallets = new Set(data.bannedWallets);
      }
      
      // Restore public key directory
      if (data.publicKeyDirectory) {
        this.publicKeyDirectory = new Map(data.publicKeyDirectory);
      }
      
      // Restore reputation data
      if (data.reputation) {
        this.reputation = data.reputation;
      }
      
      // Restore stats
      if (data.stats) {
        this.stats = data.stats;
      }
    } catch (error) {
      console.error(`Failed to load agent state: ${error.message}`);
    }
  }

  // Register a public key for a wallet
  registerPublicKey(walletId, publicKey) {
    this.publicKeyDirectory.set(walletId, publicKey);
    return true;
  }

  // Check if a wallet is banned
  isWalletBanned(walletId) {
    return this.bannedWallets.has(walletId);
  }

  // Record a validation failure for a wallet
  recordValidationFailure(walletId) {
    if (!this.validationFailures.has(walletId)) {
      this.validationFailures.set(walletId, 1);
    } else {
      const currentCount = this.validationFailures.get(walletId);
      this.validationFailures.set(walletId, currentCount + 1);
      
      // Check if we need to ban this wallet
      if (currentCount + 1 >= this.maxFailuresBeforeBan) {
        this.bannedWallets.add(walletId);
        this.stats.bannedWallets++;
      }
    }
  }

  // Reset validation failures for a wallet
  resetValidationFailures(walletId) {
    this.validationFailures.delete(walletId);
  }

  // Get the public key for a wallet
  async getPublicKeyForWallet(walletId) {
    // First check local directory
    if (this.publicKeyDirectory.has(walletId)) {
      return this.publicKeyDirectory.get(walletId);
    }
    
    // In a production environment, this would query a distributed directory service
    // Or using DHT (Distributed Hash Table) to find the key
    
    // Implementation could use: 
    // 1. REST API call to a directory service
    // 2. DHT lookup
    // 3. Peer-to-peer network query
    
    try {
      // Example of a network request to a directory service
      // const response = await fetch(`https://directory.rnbs-coin.net/keys/${walletId}`);
      // if (response.ok) {
      //   const data = await response.json();
      //   const publicKey = data.publicKey;
      //   
      //   // Cache the key
      //   this.publicKeyDirectory.set(walletId, publicKey);
      //   
      //   return publicKey;
      // }
      
      // This would be replaced with actual directory lookup
      // For now, we'll check if the wallet is our own (for compatibility)
      if (this.wallet.getId() === walletId) {
        this.publicKeyDirectory.set(walletId, this.wallet.publicKey);
        return this.wallet.publicKey;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching public key for ${walletId}: ${error.message}`);
      return null;
    }
  }

  // Get the current agent reputation score
  getReputationScore() {
    return this.reputation.score;
  }

  // Update reputation based on validation outcome
  updateReputation(wasSuccessful, importance = 1) {
    const now = Date.now();
    const lastUpdated = this.reputation.lastUpdated;
    
    // Record the change
    const reputationChange = {
      timestamp: now,
      wasSuccessful,
      previousScore: this.reputation.score,
      importance
    };
    
    // Update success/failure counts
    if (wasSuccessful) {
      this.reputation.successfulValidations++;
      
      // Increase reputation score (with diminishing returns as score gets higher)
      const increase = importance * (0.5 + ((100 - this.reputation.score) / 200));
      this.reputation.score = Math.min(100, this.reputation.score + increase);
    } else {
      this.reputation.failedValidations++;
      
      // Decrease reputation score (penalties get more severe for higher reputation agents)
      const decrease = importance * (0.5 + (this.reputation.score / 200));
      this.reputation.score = Math.max(0, this.reputation.score - decrease * 2);
    }
    
    // Calculate and record final change
    reputationChange.newScore = this.reputation.score;
    reputationChange.change = reputationChange.newScore - reputationChange.previousScore;
    
    // Keep history manageable
    if (this.reputation.history.length > 100) {
      this.reputation.history = this.reputation.history.slice(-100);
    }
    
    this.reputation.history.push(reputationChange);
    this.reputation.lastUpdated = now;
    
    return this.reputation.score;
  }

  // Validate a coin transfer as a witness
  async validateTransfer(transfer) {
    this.stats.validationsPerformed++;
    let validationSuccessful = false;
    
    try {
      const { coin, signature, sender, recipient, timestamp, value } = transfer;
      
      // Basic validation
      if (!coin || !signature || !sender || !recipient) {
        return {
          valid: false, 
          reason: 'missing required transfer data'
        };
      }
      
      // 0. Check if the sender is banned
      if (this.isWalletBanned(sender)) {
        return {
          valid: false,
          reason: 'sender wallet is banned due to suspicious activity'
        };
      }
      
      // 1. Verify coin integrity
      if (!coin.verifyIntegrity()) {
        this.recordValidationFailure(sender);
        return {
          valid: false,
          reason: 'coin integrity check failed'
        };
      }
      
      // 2. Check coin status
      if (coin.status !== 'active') {
        this.recordValidationFailure(sender);
        return {
          valid: false,
          reason: `coin status is ${coin.status}, not active`
        };
      }
      
      // 3. Zero balance check
      if (coin.value <= 0) {
        this.stats.zeroBalancePrevented++;
        this.recordValidationFailure(sender);
        return {
          valid: false,
          reason: 'zero or negative value coin detected'
        };
      }
      
      // 4. Ensure the coin value hasn't been inflated - compare with our last known value
      if (this.validatedValues.has(coin.id)) {
        const lastKnownValue = this.validatedValues.get(coin.id);
        if (coin.value > lastKnownValue) {
          this.recordValidationFailure(sender);
          return {
            valid: false,
            reason: `coin value has been inflated from ${lastKnownValue} to ${coin.value}`
          };
        }
      }
      
      // 5. Double-spend check with Bloom filter
      if (this.seenCoins.has(coin.id)) {
        // Double check in our exact cache for confirmation and details
        if (this.recentTransactionCache.has(coin.id)) {
          const previous = this.recentTransactionCache.get(coin.id);
          
          this.stats.doubleSpendsPrevented++;
          this.recordValidationFailure(sender);
          
          // Update reputation - catching double-spends is important, so higher importance
          this.updateReputation(true, 2);
          
          return {
            valid: false, 
            reason: `confirmed double-spend detected (previous transfer: ${new Date(previous.timestamp).toISOString()})`,
            previousTimestamp: previous.timestamp
          };
        }
        
        // Still reject if in Bloom filter but not in cache (older transaction)
        this.stats.doubleSpendsPrevented++;
        this.recordValidationFailure(sender);
        
        // Update reputation
        this.updateReputation(true, 1.5);
        
        return {
          valid: false, 
          reason: 'possible double-spend detected'
        };
      }
      
      // 6. Verify coin hasn't expired
      if (coin.expiryDate && Date.now() > coin.expiryDate) {
        return {
          valid: false,
          reason: 'coin has expired'
        };
      }
      
      // 7. Generate transaction hash to prevent replay attacks
      const txHash = crypto.createHash('sha256')
        .update(`${coin.id}-${sender}-${recipient}-${signature}-${timestamp}-${coin.value}`)
        .digest('hex');
        
      if (this.recentTransactionCache.has(txHash)) {
        this.recordValidationFailure(sender);
        return {
          valid: false,
          reason: 'transaction replay detected'
        };
      }
      
      // 8. Verify signature with sender's public key
      try {
        // Get sender's public key
        const senderPublicKey = await this.getPublicKeyForWallet(sender);
        
        if (!senderPublicKey) {
          return {
            valid: false,
            reason: 'unable to retrieve sender public key'
          };
        }
        
        // Real implementation of signature verification
        const signatureValid = this.wallet.verifySignature(
          coin.getSignatureData(recipient, timestamp),
          signature,
          senderPublicKey
        );
        
        if (!signatureValid) {
          this.stats.invalidSignatures++;
          this.recordValidationFailure(sender);
          return {
            valid: false,
            reason: 'invalid signature'
          };
        }
        
        this.stats.validSignatures++;
      } catch (err) {
        this.stats.invalidSignatures++;
        this.recordValidationFailure(sender);
        return {
          valid: false,
          reason: `signature verification error: ${err.message}`
        };
      }
      
      // 9. All checks passed, add to seen coins and recent transactions
      this.seenCoins.add(coin.id);
      
      this.recentTransactionCache.set(coin.id, {
        timestamp: Date.now(),
        hash: txHash,
        sender,
        recipient,
        value: coin.value
      });
      
      this.recentTransactionCache.set(txHash, {
        timestamp: Date.now(),
        coinId: coin.id
      });
      
      // Track this value for future inflation checks
      this.validatedValues.set(coin.id, coin.value);
      
      // 10. Prune cache if needed
      this._pruneCache();
      
      // 11. Reset validation failures for this wallet on successful validation
      this.resetValidationFailures(sender);
      
      // Update reputation for successful validation
      validationSuccessful = true;
      this.updateReputation(true, 1);
      
      return { 
        valid: true,
        witnessId: this.wallet.getId(),
        timestamp: Date.now(),
        reputationScore: this.reputation.score
      };
    } catch (error) {
      console.error(`Validation error: ${error.message}`);
      
      // Update reputation for failed validation (system error, not fraud, so less severe)
      if (!validationSuccessful) {
        this.updateReputation(false, 0.5);
      }
      
      return {
        valid: false,
        reason: `validation error: ${error.message}`
      };
    }
  }

  // Prune old entries from the transaction cache
  _pruneCache() {
    if (this.recentTransactionCache.size <= this.maxCacheSize) {
      return;
    }
    
    // Sort by timestamp and remove oldest entries
    const entries = Array.from(this.recentTransactionCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest entries to get below max size
    const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
    toRemove.forEach(([key]) => {
      this.recentTransactionCache.delete(key);
    });
  }

  // Get the agent's wallet
  getWallet() {
    return this.wallet;
  }

  // Get agent statistics
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.recentTransactionCache.size,
      bannedWalletsCount: this.bannedWallets.size,
      uptime: Date.now() - this.stats.lastReset,
      reputation: {
        score: this.reputation.score,
        successfulValidations: this.reputation.successfulValidations,
        failedValidations: this.reputation.failedValidations
      }
    };
  }

  // Reset stats
  resetStats() {
    this.stats = {
      validationsPerformed: 0,
      doubleSpendsPrevented: 0,
      zeroBalancePrevented: 0,
      validSignatures: 0,
      invalidSignatures: 0,
      bannedWallets: 0,
      lastReset: Date.now()
    };
  }

  // Unban a wallet
  unbanWallet(walletId) {
    if (this.bannedWallets.has(walletId)) {
      this.bannedWallets.delete(walletId);
      this.validationFailures.delete(walletId);
      return true;
    }
    return false;
  }

  // Clean up resources
  destroy() {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this._saveState(); // Final save
    }
  }
}

module.exports = Agent; 