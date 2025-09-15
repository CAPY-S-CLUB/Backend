const mongoose = require('mongoose');

const eventLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    index: true
  },
  eventName: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  source: {
    type: String,
    required: true, // 'api', 'webhook', 'internal', etc.
    index: true
  },
  status: {
    type: String,
    enum: ['received', 'processing', 'processed', 'failed'],
    default: 'received',
    index: true
  },
  processedAt: {
    type: Date
  },
  processingDuration: {
    type: Number // em millisegundos
  },
  rulesMatched: [{
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BadgeRule'
    },
    ruleName: String,
    matched: Boolean,
    reason: String
  }],
  nftTransactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NFTTransaction'
  }],
  errorMessage: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: {
    type: Date
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    requestId: String
  }
}, {
  timestamps: true
});

// Índices compostos para consultas eficientes
eventLogSchema.index({ userId: 1, eventType: 1 });
eventLogSchema.index({ eventType: 1, createdAt: -1 });
eventLogSchema.index({ status: 1, createdAt: 1 });
eventLogSchema.index({ source: 1, status: 1 });
eventLogSchema.index({ createdAt: -1 }); // Para consultas por data

// TTL index para auto-cleanup de logs antigos (opcional - 90 dias)
eventLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 dias

// Método para marcar como processando
eventLogSchema.methods.markAsProcessing = function() {
  this.status = 'processing';
  this.processedAt = new Date();
  return this.save();
};

// Método para marcar como processado
eventLogSchema.methods.markAsProcessed = function(rulesMatched = [], nftTransactions = []) {
  const now = new Date();
  this.status = 'processed';
  this.processedAt = now;
  this.processingDuration = now - this.createdAt;
  this.rulesMatched = rulesMatched;
  this.nftTransactions = nftTransactions;
  return this.save();
};

// Método para marcar como falhou
eventLogSchema.methods.markAsFailed = function(errorMessage) {
  const now = new Date();
  this.status = 'failed';
  this.processedAt = now;
  this.processingDuration = now - this.createdAt;
  this.errorMessage = errorMessage;
  return this.save();
};

// Método para incrementar retry
eventLogSchema.methods.incrementRetry = function() {
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  this.status = 'received'; // Reset para reprocessamento
  return this.save();
};

// Método estático para buscar eventos não processados
eventLogSchema.statics.findUnprocessedEvents = function(limit = 100) {
  return this.find({ 
    status: { $in: ['received', 'failed'] },
    retryCount: { $lt: 3 } // Máximo 3 tentativas
  })
  .sort({ createdAt: 1 })
  .limit(limit);
};

// Método estático para estatísticas de eventos
eventLogSchema.statics.getEventStats = function(startDate, endDate) {
  const pipeline = [
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$eventType',
          status: '$status'
        },
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingDuration' }
      }
    },
    {
      $group: {
        _id: '$_id.eventType',
        stats: {
          $push: {
            status: '$_id.status',
            count: '$count',
            avgProcessingTime: '$avgProcessingTime'
          }
        },
        totalEvents: { $sum: '$count' }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Método estático para buscar eventos por usuário
eventLogSchema.statics.findByUser = function(userId, eventType = null, limit = 50) {
  const query = { userId };
  if (eventType) {
    query.eventType = eventType;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username email')
    .populate('nftTransactions');
};

module.exports = mongoose.model('EventLog', eventLogSchema);