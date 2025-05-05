const Network = require('./src/Network');
const path = require('path');

// Set up application options
const options = {
  numAgents: 5,
  requiredWitnesses: 3,
  dataDir: path.join(__dirname, 'data'),
  networkId: 'main'
};

// Create a network
const network = new Network(options);

// Set up event listeners
network.on('transaction:confirmed', ({ txId, transaction }) => {
  console.log(`Transaction ${txId.substring(0, 8)} confirmed`);
});

network.on('transaction:invalid', ({ txId, reason }) => {
  console.log(`Transaction ${txId.substring(0, 8)} invalid: ${reason}`);
});

network.on('network:stats', (stats) => {
  console.log(`Network stats: ${stats.agents} agents, ${stats.pendingTransactions} pending transactions`);
});

console.log('🪙 RNBS-Coin Simulation Started 🪙');

// Initialize each agent with random coins
network.initialize(2);

// Wait for some time to visualize
setTimeout(() => {
  console.log('\n--- Regular Transfer ---');
  // Transfer a coin from agent 0 to agent 1
  const result1 = network.transferCoin(0, 1, 0);
  
  // Wait a bit and try another transfer
  setTimeout(() => {
    console.log('\n--- Another Transfer ---');
    const result2 = network.transferCoin(1, 2, 0);
    
    // Now simulate a double spend attempt
    setTimeout(() => {
      console.log('\n--- Double Spend Simulation ---');
      const doubleSpendResult = network.simulateDoubleSpend(2, 0);
      
      // Show final coin distribution
      setTimeout(() => {
        console.log('\n--- Final State ---');
        network.agents.forEach(agent => {
          console.log(`Agent ${agent.id} has ${agent.getWallet().getCoinCount()} coins (value: ${agent.getWallet().getBalance()})`);
        });
        
        // Print validation stats
        console.log('\n--- Witness Stats ---');
        network.agents.forEach(agent => {
          const stats = agent.getStats();
          console.log(`Agent ${agent.id}: ${stats.validationsPerformed} validations, ${stats.doubleSpendsPrevented} double-spends prevented`);
        });
        
        // Gracefully shutdown
        setTimeout(() => {
          network.shutdown();
          console.log('Simulation complete!');
        }, 500);
      }, 500);
    }, 500);
  }, 500);
}, 500);

console.log('\nSimulation running...');

// Handle shutdown signals
process.on('SIGINT', () => {
  console.log('Received shutdown signal, cleaning up...');
  network.shutdown();
  process.exit(0);
}); 