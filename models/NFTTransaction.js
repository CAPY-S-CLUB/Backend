const mongoose = require('mongoose');

const nftTransactionSchema = new mongoose.Schema({
  transactionHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fromAddress: {
    type: String,
    required: true
  },
  toAddress: {
    type: String,
    required: true
  },
  contractAddress: {
    type: String,
    required: true
  },
  tokenId: {
    type: String,
    required: true
  },
  tokenType: {
    type: String,
    enum: ['ERC721', 'ERC1155'],
    required: true
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
  gasUsed: {
    type: Number
  },
  gasPrice: {
    type: String
  },
  blockNumber: {
    type: Number
  },
  blockHash: {
    type: String
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
nftTransactionSchema.index({ contractAddress: 1, tokenId: 1 });
nftTransactionSchema.index({ eventType: 1, createdAt: -1 });
nftTransactionSchema.index({ status: 1, createdAt: -1 });

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