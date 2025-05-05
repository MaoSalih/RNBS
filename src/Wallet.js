const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class Wallet {
  constructor(keyPath = null) {
    this.coins = []; // Array to hold owned coins
    this.transactions = []; // History of transactions
    
    if (keyPath && fs.existsSync(keyPath)) {
      // Load existing keys
      try {
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        this.publicKey = keyData.publicKey;
        
        // In a real implementation, this would be encrypted and require a password
        this.privateKey = keyData.privateKey;
        console.log(`Wallet loaded from ${keyPath}`);
      } catch (err) {
        console.error('Error loading wallet:', err);
        this._generateNewKeys();
      }
    } else {
      this._generateNewKeys();
    }
  }

  // Generate new key pair
  _generateNewKeys() {
    // Generate a strong keypair for the wallet
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048, // Higher for production
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  // Save wallet to file (in a real app, this would be encrypted)
  saveToFile(filePath) {
    const keyData = {
      publicKey: this.publicKey,
      privateKey: this.privateKey
    };
    
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // In a real implementation, this would be encrypted with a password
    fs.writeFileSync(filePath, JSON.stringify(keyData, null, 2));
    return filePath;
  }

  // Get wallet identifier (public key hash)
  getId() {
    return crypto.createHash('sha256')
      .update(this.publicKey)
      .digest('hex')
      .substring(0, 16); // Longer ID for more uniqueness
  }

  // Add a coin to the wallet
  addCoin(coin) {
    // Verify ownership
    if (coin.ownerId === this.getId()) {
      this.coins.push(coin);
      // Record in transaction history
      this._recordTransaction('receive', coin, null);
      return true;
    }
    return false;
  }

  // Transfer a coin to another wallet
  transferCoin(coinIndex, recipientPublicKey) {
    if (coinIndex >= 0 && coinIndex < this.coins.length) {
      const coin = this.coins[coinIndex];
      
      // Create signature for the transfer
      const signData = `${coin.id}-${this.getId()}-${recipientPublicKey}-${Date.now()}`;
      const signature = crypto.sign('sha256', Buffer.from(signData), this.privateKey);
      
      // Remove coin from this wallet
      this.coins.splice(coinIndex, 1);
      
      // Record in transaction history
      this._recordTransaction('send', coin, recipientPublicKey);
      
      return {
        coin,
        signature: signature.toString('base64'),
        sender: this.getId(),
        recipient: recipientPublicKey,
        timestamp: Date.now()
      };
    }
    return null;
  }

  // Record transaction in history
  _recordTransaction(type, coin, recipient) {
    const transaction = {
      type,
      coinId: coin.id,
      timestamp: Date.now(),
      recipient: recipient || 'self',
      value: coin.value || 1
    };
    
    this.transactions.push(transaction);
    return transaction;
  }

  // Get all transactions for this wallet
  getTransactionHistory() {
    return [...this.transactions].sort((a, b) => b.timestamp - a.timestamp);
  }

  // Verify a received signature
  verifySignature(data, signature, publicKey) {
    try {
      const verify = crypto.createVerify('sha256');
      verify.update(data);
      verify.end();
      return verify.verify(publicKey, Buffer.from(signature, 'base64'));
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  }

  // Get the number of coins in this wallet
  getBalance() {
    return this.coins.reduce((total, coin) => total + (coin.value || 1), 0);
  }

  // Get count of coins
  getCoinCount() {
    return this.coins.length;
  }
}

module.exports = Wallet; 
