const mongoose = require('mongoose');

const nftTransactionSchema = new mongoose.Schema({
  transactionHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        // Stellar transaction hash validation (64 characters, hex)
        return /^[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid Stellar transaction hash format'
    }
  },
  fromAddress: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Stellar address validation (56 characters, starts with G)
        return /^G[A-Z2-7]{55}$/.test(v);
      },
      message: 'Invalid Stellar from address format'
    }
  },
  toAddress: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Stellar address validation (56 characters, starts with G)
        return /^G[A-Z2-7]{55}$/.test(v);
      },
      message: 'Invalid Stellar to address format'
    }
  },
  contractAddress: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Stellar issuer address validation (56 characters, starts with G)
        return /^G[A-Z2-7]{55}$/.test(v);
      },
      message: 'Invalid Stellar issuer address format'
    }
  },
  assetCode: {
    type: String,
    required: true,
    maxlength: [12, 'Asset code cannot exceed 12 characters']
  },
  tokenType: {
    type: String,
    enum: ['STELLAR_ASSET'],
    required: true,
    default: 'STELLAR_ASSET'
  },
  amount: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  },
  feeCharged: {
    type: String,
    description: 'Fee charged for the transaction in stroops'
  },
  ledger: {
    type: Number,
    description: 'Stellar ledger number'
  },
  ledgerCloseTime: {
    type: Date,
    description: 'Time when the ledger was closed'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: {
    type: Date
  },
  errorMessage: {
    type: String
  },
  metadata: {
    badgeName: String,
    badgeDescription: String,
    imageUrl: String,
    attributes: [{
      trait_type: String,
      value: String
    }]
  }
}, {
  timestamps: true
});

// Índices compostos para consultas eficientes
nftTransactionSchema.index({ userId: 1, status: 1 });
nftTransactionSchema.index({ contractAddress: 1, assetCode: 1 });
nftTransactionSchema.index({ eventType: 1, createdAt: -1 });
nftTransactionSchema.index({ status: 1, createdAt: -1 });
nftTransactionSchema.index({ ledger: 1 });

// Método para atualizar status da transação
nftTransactionSchema.methods.updateStatus = function(status, additionalData = {}) {
  this.status = status;
  Object.assign(this, additionalData);
  return this.save();
};

// Método para incrementar retry count
nftTransactionSchema.methods.incrementRetry = function() {
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  return this.save();
};

// Método estático para buscar transações pendentes
nftTransactionSchema.statics.findPendingTransactions = function() {
  return this.find({ status: 'pending' }).sort({ createdAt: 1 });
};

// Método estático para buscar transações por usuário
nftTransactionSchema.statics.findByUser = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username email');
};

module.exports = mongoose.model('NFTTransaction', nftTransactionSchema);