const mongoose = require('mongoose');

const badgeRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  conditions: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  nftMetadata: {
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    imageUrl: {
      type: String,
      required: true
    },
    attributes: [{
      trait_type: {
        type: String,
        required: true
      },
      value: {
        type: String,
        required: true
      }
    }]
  },
  contractAddress: {
    type: String,
    required: true
  },
  tokenType: {
    type: String,
    enum: ['ERC721', 'ERC1155'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  maxSupply: {
    type: Number,
    default: null // null = unlimited
  },
  currentSupply: {
    type: Number,
    default: 0
  },
  oneTimeOnly: {
    type: Boolean,
    default: true // Usuário só pode receber uma vez
  },
  priority: {
    type: Number,
    default: 0 // Maior número = maior prioridade
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    default: null // null = sem expiração
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Índices para consultas eficientes
badgeRuleSchema.index({ eventType: 1, isActive: 1 });
badgeRuleSchema.index({ isActive: 1, priority: -1 });
badgeRuleSchema.index({ validFrom: 1, validUntil: 1 });

// Método para verificar se a regra está válida
badgeRuleSchema.methods.isValid = function() {
  const now = new Date();
  
  if (!this.isActive) return false;
  if (this.validFrom && this.validFrom > now) return false;
  if (this.validUntil && this.validUntil < now) return false;
  if (this.maxSupply && this.currentSupply >= this.maxSupply) return false;
  
  return true;
};

// Método para verificar se as condições são atendidas
badgeRuleSchema.methods.checkConditions = function(eventData) {
  try {
    // Função recursiva para avaliar condições
    const evaluateCondition = (condition, data) => {
      if (typeof condition === 'object' && condition !== null) {
        // Operadores lógicos
        if (condition.$and) {
          return condition.$and.every(cond => evaluateCondition(cond, data));
        }
        if (condition.$or) {
          return condition.$or.some(cond => evaluateCondition(cond, data));
        }
        if (condition.$not) {
          return !evaluateCondition(condition.$not, data);
        }
        
        // Operadores de comparação
        for (const [key, value] of Object.entries(condition)) {
          const dataValue = getNestedValue(data, key);
          
          if (typeof value === 'object' && value !== null) {
            if (value.$eq && dataValue !== value.$eq) return false;
            if (value.$ne && dataValue === value.$ne) return false;
            if (value.$gt && dataValue <= value.$gt) return false;
            if (value.$gte && dataValue < value.$gte) return false;
            if (value.$lt && dataValue >= value.$lt) return false;
            if (value.$lte && dataValue > value.$lte) return false;
            if (value.$in && !value.$in.includes(dataValue)) return false;
            if (value.$nin && value.$nin.includes(dataValue)) return false;
            if (value.$regex && !new RegExp(value.$regex, value.$options || '').test(dataValue)) return false;
          } else {
            if (dataValue !== value) return false;
          }
        }
      }
      return true;
    };
    
    // Função para acessar valores aninhados
    const getNestedValue = (obj, path) => {
      return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
      }, obj);
    };
    
    return evaluateCondition(this.conditions, eventData);
  } catch (error) {
    console.error('Error evaluating badge rule conditions:', error);
    return false;
  }
};

// Método para incrementar supply
badgeRuleSchema.methods.incrementSupply = function() {
  this.currentSupply += 1;
  return this.save();
};

// Método estático para buscar regras ativas por tipo de evento
badgeRuleSchema.statics.findActiveRulesByEventType = function(eventType) {
  const now = new Date();
  return this.find({
    eventType,
    isActive: true,
    $or: [
      { validFrom: { $lte: now } },
      { validFrom: null }
    ],
    $or: [
      { validUntil: { $gte: now } },
      { validUntil: null }
    ]
  }).sort({ priority: -1 });
};

module.exports = mongoose.model('BadgeRule', badgeRuleSchema);