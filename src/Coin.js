const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class Coin {
  constructor(initialOwnerId, value = 1, id = null, metadata = {}) {
    // If ID is provided, use it (for loading existing coins), otherwise generate new
    this.id = id || uuidv4();
    this.ownerId = initialOwnerId; // Current owner's wallet ID
    this.value = value; // Denomination/value of the coin
    this.history = []; // Transaction history (temporary, only while active)
    this.created = Date.now();
    this.lastTransferred = this.created;
    this.metadata = metadata; // Additional coin properties
    this.version = "1.0.0"; // For future compatibility
    this.status = "active"; // Status: active, spent, frozen, revoked
    this.expiryDate = metadata.expiryDate || null; // Optional expiry date
    
    // Validate the value
    if (typeof this.value !== 'number' || this.value <= 0) {
      throw new Error('Coin value must be a positive number');
    }
    
    // Hash of the coin for integrity verification
    this.updateHash();
  }

  // Transfer ownership to a new wallet
  transfer(newOwnerId, signature, witnesses) {
    // Validate inputs
    if (!newOwnerId || typeof newOwnerId !== 'string') {
      throw new Error('Invalid recipient ID');
    }
    
    if (!signature) {
      throw new Error('Signature required for transfer');
    }
    
    // Check if coin is active and has value
    if (this.status !== "active") {
      throw new Error(`Cannot transfer coin with status: ${this.status}`);
    }
    
    if (this.value <= 0) {
      throw new Error('Cannot transfer coin with zero or negative value');
    }
    
    // Check if coin has expired
    if (this.expiryDate && Date.now() > this.expiryDate) {
      this.status = "expired";
      throw new Error('Cannot transfer expired coin');
    }
    
    // Record the transfer in history
    const transfer = {
      from: this.ownerId,
      to: newOwnerId,
      timestamp: Date.now(),
      signature: signature,
      witnesses: witnesses || [], // Array of witness IDs who validated this transfer
      hash: this.hash, // Include previous hash for verification chain
      value: this.value
    };
    
    this.history.push(transfer);
    this.ownerId = newOwnerId;
    this.lastTransferred = transfer.timestamp;
    
    // Update the coin's hash after transfer
    this.updateHash();
    
    return this;
  }

  // Split a coin into two coins of lesser value
  split(newValue) {
    // Validate new value
    if (typeof newValue !== 'number' || newValue <= 0 || newValue >= this.value) {
      throw new Error('Split value must be positive and less than the coin value');
    }
    
    // Create new coin with the specified value
    const newCoin = new Coin(
      this.ownerId,
      newValue,
      null, // New UUID will be generated
      this.metadata
    );
    
    // Record split in both coins' histories
    const splitEvent = {
      type: 'split',
      timestamp: Date.now(),
      parentCoinId: this.id,
      childCoinId: newCoin.id,
      parentValue: this.value,
      childValue: newValue
    };
    
    // Reduce this coin's value
    this.value -= newValue;
    
    // Add split event to history
    this.history.push(splitEvent);
    newCoin.history.push(splitEvent);
    
    // Update hashes
    this.updateHash();
    newCoin.updateHash();
    
    return newCoin;
  }

  // Merge this coin with another coin to create a higher value
  merge(otherCoin) {
    // Validate other coin is owned by the same person
    if (this.ownerId !== otherCoin.ownerId) {
      throw new Error('Can only merge coins owned by the same wallet');
    }
    
    // Validate other coin is active
    if (otherCoin.status !== "active" || this.status !== "active") {
      throw new Error('Can only merge active coins');
    }
    
    // Record merge in history
    const mergeEvent = {
      type: 'merge',
      timestamp: Date.now(),
      coinId1: this.id,
      coinId2: otherCoin.id,
      value1: this.value,
      value2: otherCoin.value
    };
    
    // Increase this coin's value
    this.value += otherCoin.value;
    
    // Mark other coin as spent
    otherCoin.status = "merged";
    otherCoin.history.push(mergeEvent);
    
    // Add merge event to this coin's history
    this.history.push(mergeEvent);
    
    // Update hash
    this.updateHash();
    otherCoin.updateHash();
    
    return this;
  }

  // Check if coin has sufficient value for a transaction
  hasSufficientValue(requiredValue) {
    return this.value >= requiredValue && this.status === "active";
  }

  // Update the hash of the coin for integrity verification
  updateHash() {
    const data = JSON.stringify({
      id: this.id,
      ownerId: this.ownerId,
      value: this.value,
      created: this.created,
      lastTransferred: this.lastTransferred,
      historyLength: this.history.length,
      status: this.status,
      // Include the last history item's hash if it exists
      lastHash: this.history.length > 0 ? this.history[this.history.length - 1].hash : null
    });
    
    this.hash = crypto.createHash('sha256').update(data).digest('hex');
    return this.hash;
  }

  // Get the current owner ID
  getOwner() {
    return this.ownerId;
  }

  // Get coin details as string for signing/verification
  getSignatureData(recipientId, timestamp = Date.now()) {
    return `${this.id}-${this.ownerId}-${recipientId}-${timestamp}-${this.value}-${this.hash}-${this.status}`;
  }

  // Serialize the coin to JSON
  toJSON() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      value: this.value,
      created: this.created,
      lastTransferred: this.lastTransferred,
      hash: this.hash,
      history: this.history,
      metadata: this.metadata,
      version: this.version,
      status: this.status,
      expiryDate: this.expiryDate
    };
  }

  // Create a coin from serialized data
  static fromJSON(data) {
    const coin = new Coin(
      data.ownerId,
      data.value || 1,
      data.id,
      data.metadata || {}
    );
    
    coin.created = data.created || Date.now();
    coin.lastTransferred = data.lastTransferred || coin.created;
    coin.history = data.history || [];
    coin.hash = data.hash;
    coin.version = data.version || "1.0.0";
    coin.status = data.status || "active";
    coin.expiryDate = data.expiryDate || null;
    
    // Verify integrity
    const calculatedHash = coin.updateHash();
    if (calculatedHash !== data.hash) {
      console.warn('Coin hash mismatch - possible tampering detected');
    }
    
    return coin;
  }

  // Verify the coin's integrity
  verifyIntegrity() {
    const calculatedHash = this.updateHash();
    return calculatedHash === this.hash;
  }

  // Get compact representation of the coin
  toString() {
    return `Coin ${this.id.substring(0, 8)}... (${this.value}) owned by ${this.ownerId}`;
  }
}

module.exports = Coin; 
