const Network = require('./src/Network');
const path = require('path');
const fs = require('fs');

// Configuration for large simulation
const config = {
  numAgents: 20,                 // Number of agents in the network
  requiredWitnesses: 5,          // Number of witnesses required per transaction 
  initialCoinsPerAgent: 10,      // Initial coins per agent
  simulationTransactions: 100,   // Number of transactions to simulate
  maliciousAgents: 3,            // Number of agents that will try malicious actions
  dataDir: path.join(__dirname, 'large-sim-data'),
  networkId: 'large-sim-reputation'
};

// Ensure data directory exists
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

// Create results directory
const resultsDir = path.join(config.dataDir, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Create a log file
const logFile = path.join(resultsDir, `simulation-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Logging function
function log(message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  console.log(formattedMessage);
  logStream.write(formattedMessage + '\n');
}

// Create the network
log('Creating network with configuration:');
log(JSON.stringify(config, null, 2));

const network = new Network({
  numAgents: config.numAgents,
  requiredWitnesses: config.requiredWitnesses,
  dataDir: config.dataDir,
  networkId: config.networkId
});

// Track simulation stats
const simulationStats = {
  startTime: Date.now(),
  totalTransactions: 0,
  successfulTransactions: 0,
  failedTransactions: 0,
  doubleSpendAttempts: 0,
  zeroValueAttempts: 0,
  coinSplits: 0,
  coinMerges: 0,
  maliciousAttempts: 0,
  bannedWallets: 0,
  witnessSelections: {}, // Track how often each agent is selected as witness
  reputationEvolution: {} // Track reputation changes over time
};

// Set up event listeners
network.on('transaction:confirmed', ({ txId, transaction, witnesses }) => {
  log(`Transaction ${txId.substring(0, 8)} confirmed with witnesses: ${witnesses.join(', ')}`);
  simulationStats.successfulTransactions++;
  
  // Track which agents were selected as witnesses
  if (witnesses) {
    witnesses.forEach(witnessId => {
      simulationStats.witnessSelections[witnessId] = 
        (simulationStats.witnessSelections[witnessId] || 0) + 1;
    });
  }
});

network.on('transaction:invalid', ({ txId, reason }) => {
  log(`Transaction ${txId.substring(0, 8)} invalid: ${reason}`);
  simulationStats.failedTransactions++;
  
  // Track specific failures
  if (reason.includes('double-spend')) {
    simulationStats.doubleSpendAttempts++;
  } else if (reason.includes('zero')) {
    simulationStats.zeroValueAttempts++;
  }
});

// Initialize network
log('🪙 Starting large RNBS-Coin network simulation with reputation-based witnesses');
network.initialize(config.initialCoinsPerAgent);

// Initialize reputation tracking stats
network.agents.forEach(agent => {
  simulationStats.reputationEvolution[agent.id] = [
    { timestamp: Date.now(), score: agent.getReputationScore() }
  ];
});

// Select some malicious agents
const allAgentIndices = Array.from({ length: config.numAgents }, (_, i) => i);
const maliciousAgentIndices = [];

for (let i = 0; i < config.maliciousAgents; i++) {
  // Select a random agent to be malicious
  const randomIndex = Math.floor(Math.random() * allAgentIndices.length);
  const agentIndex = allAgentIndices[randomIndex];
  maliciousAgentIndices.push(agentIndex);
  allAgentIndices.splice(randomIndex, 1);
  
  log(`Agent ${agentIndex} designated as malicious`);
}

// Track agent reputation changes
function trackReputationChanges() {
  network.agents.forEach(agent => {
    const agentId = agent.id;
    const currentScore = agent.getReputationScore();
    simulationStats.reputationEvolution[agentId].push({
      timestamp: Date.now(),
      score: currentScore
    });
  });
}

// Run the simulation
async function runSimulation() {
  log('\n--- Beginning Transaction Simulation ---');
  
  // Track reputation every 10 transactions
  const trackInterval = Math.max(5, Math.floor(config.simulationTransactions / 10));
  
  for (let i = 0; i < config.simulationTransactions; i++) {
    // Track reputation changes periodically
    if (i % trackInterval === 0) {
      trackReputationChanges();
    }
    
    // For most transactions, do a regular transfer
    if (Math.random() < 0.7) {
      // Regular transfer between random agents
      const fromAgent = Math.floor(Math.random() * config.numAgents);
      let toAgent = Math.floor(Math.random() * config.numAgents);
      
      // Make sure not sending to self
      if (toAgent === fromAgent) {
        toAgent = (toAgent + 1) % config.numAgents;
      }
      
      // Only proceed if the sender has coins
      if (network.agents[fromAgent].getWallet().getCoinCount() > 0) {
        const coinIndex = Math.floor(Math.random() * network.agents[fromAgent].getWallet().getCoinCount());
        log(`\n[TX ${i+1}/${config.simulationTransactions}] Regular transfer: Agent ${fromAgent} (rep: ${Math.round(network.agents[fromAgent].getReputationScore())}) -> Agent ${toAgent}, Coin index ${coinIndex}`);
        
        const result = await network.transferCoin(fromAgent, toAgent, coinIndex);
        simulationStats.totalTransactions++;
        
        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } 
    // Coin split operations
    else if (Math.random() < 0.5) {
      const agentIndex = Math.floor(Math.random() * config.numAgents);
      const agent = network.agents[agentIndex];
      
      if (agent.getWallet().getCoinCount() > 0) {
        const coinIndex = Math.floor(Math.random() * agent.getWallet().getCoinCount());
        const coin = agent.getWallet().coins[coinIndex];
        
        // Only split if coin has value > 1
        if (coin.value > 1) {
          const splitValue = Math.floor(coin.value / 2);
          
          log(`\n[TX ${i+1}/${config.simulationTransactions}] Coin split: Agent ${agentIndex} (rep: ${Math.round(agent.getReputationScore())}) splitting coin ${coin.id.substring(0, 8)} with value ${coin.value} -> ${splitValue}`);
          
          try {
            const newCoin = coin.split(splitValue);
            agent.getWallet().addCoin(newCoin);
            simulationStats.coinSplits++;
            log(`Coin split successful: Original coin now has value ${coin.value}, new coin ${newCoin.id.substring(0, 8)} has value ${newCoin.value}`);
          } catch (error) {
            log(`Coin split failed: ${error.message}`);
          }
        }
      }
      
      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    // Try some malicious behaviors
    else if (Math.random() < 0.3 && maliciousAgentIndices.length > 0) {
      // Pick a random malicious agent
      const maliciousIndex = maliciousAgentIndices[Math.floor(Math.random() * maliciousAgentIndices.length)];
      const maliciousAgent = network.agents[maliciousIndex];
      
      // Random malicious behavior
      const behavior = Math.random();
      
      // Double spend attempt
      if (behavior < 0.5 && maliciousAgent.getWallet().getCoinCount() > 0) {
        log(`\n[TX ${i+1}/${config.simulationTransactions}] ⚠️ MALICIOUS: Double-spend attempt by Agent ${maliciousIndex} (rep: ${Math.round(maliciousAgent.getReputationScore())})`);
        simulationStats.maliciousAttempts++;
        
        // Attempt a double spend 
        const doubleSpendResult = await network.simulateDoubleSpend(maliciousIndex, 0);
        simulationStats.totalTransactions += 2; // Count both attempts
        simulationStats.doubleSpendAttempts++;
        
        // Track reputation after malicious attempt
        trackReputationChanges();
      }
      // Zero value attack
      else if (maliciousAgent.getWallet().getCoinCount() > 0) {
        log(`\n[TX ${i+1}/${config.simulationTransactions}] ⚠️ MALICIOUS: Zero-value attack attempt by Agent ${maliciousIndex} (rep: ${Math.round(maliciousAgent.getReputationScore())})`);
        simulationStats.maliciousAttempts++;
        simulationStats.zeroValueAttempts++;
        
        // Try to transfer, but first corrupt the coin value to 0
        const coinIndex = Math.floor(Math.random() * maliciousAgent.getWallet().getCoinCount());
        const coin = maliciousAgent.getWallet().coins[coinIndex];
        
        // Save original value
        const originalValue = coin.value;
        
        try {
          // Corrupt the coin by forcing zero value
          coin.value = 0;
          
          // Try to transfer
          const toAgent = (maliciousIndex + 1) % config.numAgents;
          const result = await network.transferCoin(maliciousIndex, toAgent, coinIndex);
          simulationStats.totalTransactions++;
          
          // Restore value regardless of outcome
          coin.value = originalValue;
        } catch (error) {
          // Restore value if an error occurred
          coin.value = originalValue;
          log(`Zero-value attack failed with error: ${error.message}`);
        }
        
        // Track reputation after malicious attempt
        trackReputationChanges();
      }
      
      // Larger delay after malicious behavior
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Final reputation tracking
  trackReputationChanges();
  
  // Log final agent balances
  log('\n--- Final Coin Distribution ---');
  network.agents.forEach(agent => {
    log(`Agent ${agent.id} (rep: ${Math.round(agent.getReputationScore())}): ${agent.getWallet().getCoinCount()} coins, total value: ${agent.getWallet().getBalance()}`);
  });
  
  // Log agent stats
  log('\n--- Witness Performance and Reputation ---');
  network.agents.forEach(agent => {
    const stats = agent.getStats();
    const timesSelected = simulationStats.witnessSelections[agent.id] || 0;
    log(`Agent ${agent.id}: Reputation ${Math.round(agent.getReputationScore())}, Selected ${timesSelected} times, ${stats.validationsPerformed} validations, ${stats.doubleSpendsPrevented} double-spends prevented`);
  });
  
  // Create reputation histogram
  log('\n--- Reputation Distribution ---');
  const reputationRanges = {
    'excellent (90-100)': 0,
    'good (75-89)': 0,
    'average (50-74)': 0,
    'poor (25-49)': 0,
    'bad (0-24)': 0
  };
  
  network.agents.forEach(agent => {
    const reputation = agent.getReputationScore();
    if (reputation >= 90) reputationRanges['excellent (90-100)']++;
    else if (reputation >= 75) reputationRanges['good (75-89)']++;
    else if (reputation >= 50) reputationRanges['average (50-74)']++;
    else if (reputation >= 25) reputationRanges['poor (25-49)']++;
    else reputationRanges['bad (0-24)']++;
  });
  
  Object.entries(reputationRanges).forEach(([range, count]) => {
    log(`${range}: ${count} agents`);
  });
  
  // Check if malicious agents have lower reputation
  log('\n--- Malicious Agent Reputation Impact ---');
  let avgMaliciousRep = 0;
  let avgNonMaliciousRep = 0;
  
  maliciousAgentIndices.forEach(idx => {
    avgMaliciousRep += network.agents[idx].getReputationScore();
  });
  avgMaliciousRep /= maliciousAgentIndices.length;
  
  const honestAgents = network.agents.filter(
    (_, idx) => !maliciousAgentIndices.includes(idx)
  );
  avgNonMaliciousRep = honestAgents.reduce((sum, agent) => 
    sum + agent.getReputationScore(), 0) / honestAgents.length;
  
  log(`Average reputation of malicious agents: ${Math.round(avgMaliciousRep)}`);
  log(`Average reputation of honest agents: ${Math.round(avgNonMaliciousRep)}`);
  log(`Reputation difference: ${Math.round(avgNonMaliciousRep - avgMaliciousRep)}`);
  
  // Log simulation stats
  simulationStats.endTime = Date.now();
  simulationStats.duration = (simulationStats.endTime - simulationStats.startTime) / 1000;
  simulationStats.successRate = simulationStats.successfulTransactions / simulationStats.totalTransactions;
  
  log('\n--- Simulation Summary ---');
  log(JSON.stringify({
    ...simulationStats,
    reputationEvolution: Object.keys(simulationStats.reputationEvolution).length + ' agents tracked',
    witnessSelections: Object.keys(simulationStats.witnessSelections).length + ' witnesses used',
    avgMaliciousRep,
    avgNonMaliciousRep
  }, null, 2));
  
  // Save full simulation results including reputation evolution
  fs.writeFileSync(
    path.join(resultsDir, `stats-${Date.now()}.json`), 
    JSON.stringify(simulationStats, null, 2)
  );
  
  // Gracefully shutdown network
  log('\nShutting down network...');
  network.shutdown();
  
  // Close the log stream before the final console log
  logStream.end();
  
  // Use console.log directly instead of the log function for the final message
  // since the log stream is now closed
  console.log('Simulation complete!');
}

// Start the simulation
runSimulation().catch(error => {
  console.error(`Simulation error: ${error.message}`);
  network.shutdown();
  
  // Don't call logStream.end() here as it might already be closed
  process.exit(1);
}); 