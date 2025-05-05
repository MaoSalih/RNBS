# 🪙 RNBS-Coin: Reputation-Based Stateless Digital Currency

A stateless, node-free decentralized coin system based on the concept of Rolling Network-Based Storage (RNBS). This project demonstrates how to build a trustless, ephemeral transaction protocol without a blockchain or global ledger, using witness quorum, Bloom filters, and reputation-based validation to prevent double spending.

## 🚀 Key Features

- **No Blockchain Required**: Operates without a permanent ledger
- **Witness Quorum Validation**: Transactions validated by multiple witnesses
- **Reputation-Based Consensus**: More trusted agents have higher influence
- **Bloom Filter Protection**: Efficient double-spend detection without full history 
- **Self-Contained Coins**: Each coin carries its own validation data
- **Coin Operations**: Split and merge functionality for flexible denominations
- **Fraud Detection**: Multiple layers of security mechanisms
- **Malicious Agent Protection**: Reputation penalties and banning systems

## 🧠 Concept Overview

Unlike blockchain-based cryptocurrencies, RNBS-Coin:

- Does **not store** balances or transaction history permanently
- Does **not require persistent nodes**
- Treats each **coin as a self-contained packet**
- Relies on **witness quorum** and **Bloom filter-based validation** for security
- Uses a **reputation system** to prioritize trusted validators

This approach offers several advantages:
- Lower resource requirements (no chain to store/sync)
- Higher privacy (minimal history retention)
- Greater scalability (no global consensus needed)
- Resilience against network partitioning

Ideal for environments like disaster recovery, censorship-resistant systems, or privacy-first offline coin transfer.

## 🏗️ Architecture

RNBS-Coin is built on four core components:

### 1. Wallet
- Generates and manages `public/private key pair`
- Holds owned coins in memory
- Signs and verifies transfers
- Manages transaction history
- Supports persistence with file-based key storage

### 2. Coin
- Self-contained value unit with unique `UUID`
- Tracks current `ownerId` (wallet public key)
- Supports multiple denominations/values
- Includes integrity verification via cryptographic hashing
- Contains a `history[]` of transfers (while active)
- Provides serialization for storage and transmission
- Supports splitting and merging operations
- Implements status tracking and expiry mechanism

### 3. Agent (Witness)
- Stateless validator of transactions
- Implements a reputation-based trust system
- Stores recently seen coin IDs in an optimized **Bloom Filter**
- Uses transaction caching for efficient double-spend detection
- Rejects suspected double-spend attempts
- Prevents zero-value transactions
- Detects coin value inflation attacks
- Includes wallet banning for malicious activity
- Supports persistence for long-running operation
- Collects comprehensive statistics

### 4. Network
- Connects agents together in a P2P model
- Implements reputation-based witness selection
- Manages peer discovery and connections
- Routes transactions to appropriate witnesses
- Implements witness selection and quorum validation
- Handles transaction lifecycle management
- Provides robust error handling and retry logic
- Collects and reports network statistics

For detailed architecture diagrams, see [architecture.md](./architecture.md).

## 📁 Code Structure

```
/src
  ├── Wallet.js    # Secure wallet implementation with key management
  ├── Coin.js      # Coin packet logic with integrity verification
  ├── Agent.js     # Witness with reputation system and Bloom filters
  └── Network.js   # Reputation-based P2P network implementation
/data
  ├── agents/      # Persistent agent states
  └── stats/       # Network statistics
index.js           # Basic simulation runner
large-simulation.js # Advanced simulation with security testing
```

### Key Components Explained

#### `Wallet.js`
Manages cryptographic keys, owned coins, and transaction signatures. Provides methods for:
- Key generation and storage
- Coin management
- Transaction signing and verification
- Balance calculation
- Transaction history tracking

#### `Coin.js`
Represents individual value units in the system. Features:
- Self-contained transaction history
- Cryptographic verification
- Value management
- Split and merge operations
- Status and expiry handling
- Serialization for network transport

#### `Agent.js`
The core validation component with reputation-based trust. Includes:
- Bloom filter implementation for efficient double-spend detection
- Reputation scoring system to track validator reliability
- Transaction caching for security
- Multi-layered validation checks
- Malicious activity detection and banning
- Persistent state management

#### `Network.js`
Connects the system components and implements the P2P architecture:
- Reputation-based witness selection algorithm
- Transaction routing and lifecycle management
- Peer discovery and management
- Witness quorum verification
- Event-based communication system
- Statistics collection and reporting

## 🔐 Security Features

- ✅ **Reputation-Based Witness Selection**  
  Prioritizes witnesses with higher trust scores for critical validations.

- ✅ **Witness Quorum**  
  A transaction is only valid if signed by N (e.g., 5) witnesses, selected primarily by reputation.

- ✅ **Bloom Filters**  
  Each witness remembers previously seen coin IDs efficiently and blocks re-use.

- ✅ **Zero-Value Prevention**  
  Prevents transfers of coins with zero or negative value.

- ✅ **Value Inflation Detection**  
  Tracks coin values to prevent malicious inflation of coin value.

- ✅ **Coin Integrity Verification**  
  Coins include cryptographic hash chains to prevent tampering.

- ✅ **Malicious Activity Detection**  
  Tracks validation failures and reduces reputation scores for suspicious activity.

- ✅ **Cryptographic Signatures**  
  Transactions are signed using sender's private key and verified by all witnesses.

- ✅ **Replay Prevention**  
  Duplicate transaction hashes are rejected.

- ✅ **Denominations & Value Operations**  
  Support for coins of different values/denominations, including split and merge operations.

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/rnbs-coin
cd rnbs-coin

# Install dependencies
npm install
```

## 🏃‍♂️ Running the System

### Basic Simulation
```bash
npm start
```

### Large-Scale Simulation with Security Testing
```bash
npm run simulate
```

### Example Output

```
🪙 RNBS-Coin Simulation Started 🪙
[2025-05-05T13:39:02.535Z] Agent 0 (rep: 100) initialized with coin f9ccef... (value: 4)
[2025-05-05T13:39:02.535Z] Agent 1 (rep: 87) initialized with coin d07c3e... (value: 2)
...
[2025-05-05T13:39:02.548Z] Agent 4 designated as malicious
...
Selected 5 witnesses with reputation scores: 1(87), 8(69), 7(69), 10(97), 0(100)
...
[2025-05-05T13:39:07.641Z] 
--- Reputation Distribution ---
[2025-05-05T13:39:07.641Z] excellent (90-100): 4 agents
[2025-05-05T13:39:07.641Z] good (75-89): 5 agents
[2025-05-05T13:39:07.641Z] average (50-74): 11 agents
...
```

## 🔍 Key Implementation Details

### Reputation System

The reputation system is based on a 0-100 score that changes based on witness behavior:

```javascript
// Update reputation based on validation outcome
updateReputation(wasSuccessful, importance = 1) {
  // Increase reputation for good actions
  if (wasSuccessful) {
    this.reputation.successfulValidations++;
    const increase = importance * (0.5 + ((100 - this.reputation.score) / 200));
    this.reputation.score = Math.min(100, this.reputation.score + increase);
  } 
  // Decrease reputation for failures
  else {
    this.reputation.failedValidations++;
    const decrease = importance * (0.5 + (this.reputation.score / 200));
    this.reputation.score = Math.max(0, this.reputation.score - decrease * 2);
  }
}
```

### Witness Selection Algorithm

Witnesses are selected using a weighted probability approach that favors higher-reputation agents:

```javascript
// Select witnesses based on their reputation scores
_getReputationBasedWitnesses(availableAgents, count) {
  // 70% reputation-based, 30% random to prevent centralization
  const reputationBasedCount = Math.ceil(count * 0.7);
  const randomCount = count - reputationBasedCount;
  
  // First select by reputation (weighted)
  // ...weighted selection logic...
  
  // Then add some random agents for diversity
  // ...random selection logic...
}
```

### Bloom Filter Double-Spend Protection

```javascript
// Double-spend check with Bloom filter
if (this.seenCoins.has(coin.id)) {
  // Double check in our exact cache for confirmation
  if (this.recentTransactionCache.has(coin.id)) {
    const previous = this.recentTransactionCache.get(coin.id);
    this.stats.doubleSpendsPrevented++;
    this.recordValidationFailure(sender);
    
    // Update reputation - catching double-spends is important
    this.updateReputation(true, 2);
    
    return {
      valid: false, 
      reason: `confirmed double-spend detected`
    };
  }
}
```

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request. 
