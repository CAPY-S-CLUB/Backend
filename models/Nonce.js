const mongoose = require('mongoose');

const nonceSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  },
  nonce: {
    type: String,
    required: true,
    unique: true
  },
  used: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now,
    expires: 300 // Expira em 5 minutos (300 segundos)
  }
}, {
  timestamps: true
});

// Índice composto para otimizar consultas
nonceSchema.index({ address: 1, used: 1 });

// Método estático para gerar novo nonce
nonceSchema.statics.generateNonce = function(address) {
  const crypto = require('crypto');
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return `${address}-${timestamp}-${randomBytes}`;
};

// Método estático para criar nonce para endereço
nonceSchema.statics.createForAddress = async function(address) {
  try {
    // Remove nonces antigos não utilizados para este endereço (com timeout)
    await Promise.race([
      this.deleteMany({ address: address.toLowerCase(), used: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout')), 3000))
    ]);
  } catch (error) {
    console.warn('Falha ao limpar nonces antigos:', error.message);
    // Continua mesmo se a limpeza falhar
  }
  
  // Gera novo nonce
  const nonce = this.generateNonce(address);
  
  try {
    // Cria e salva novo registro
    const nonceDoc = new this({
      address: address.toLowerCase(),
      nonce: nonce
    });
    
    await Promise.race([
      nonceDoc.save(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout')), 3000))
    ]);
    return nonceDoc;
  } catch (error) {
    console.warn('Falha ao salvar nonce no banco:', error.message);
    // Retorna objeto simples como fallback
    return {
      address: address.toLowerCase(),
      nonce: nonce,
      used: false,
      created_at: new Date()
    };
  }
};

// Método estático para validar e marcar nonce como usado
nonceSchema.statics.validateAndUse = async function(address, nonce) {
  const nonceDoc = await this.findOne({
    address: address.toLowerCase(),
    nonce: nonce,
    used: false
  });
  
  if (!nonceDoc) {
    return { valid: false, error: 'Nonce inválido ou expirado' };
  }
  
  // Marca como usado
  nonceDoc.used = true;
  await nonceDoc.save();
  
  return { valid: true, nonce: nonceDoc };
};

module.exports = mongoose.model('Nonce', nonceSchema);