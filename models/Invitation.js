const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
  token_hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  community_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true,
    index: true
  },
  expiration_date: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'revoked'],
    default: 'pending',
    index: true
  },
  invited_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accepted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  accepted_at: {
    type: Date,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Índices compostos para otimização de consultas
invitationSchema.index({ community_id: 1, email: 1 });
invitationSchema.index({ community_id: 1, status: 1 });
invitationSchema.index({ expiration_date: 1, status: 1 });

// Método estático para gerar token seguro
invitationSchema.statics.generateSecureToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Método estático para criar hash do token
invitationSchema.statics.hashToken = function(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Método para verificar se o convite expirou
invitationSchema.methods.isExpired = function() {
  return new Date() > this.expiration_date;
};

// Método para verificar se o convite é válido
invitationSchema.methods.isValid = function() {
  return this.status === 'pending' && !this.isExpired();
};

// Método para aceitar o convite
invitationSchema.methods.accept = function(userId) {
  this.status = 'accepted';
  this.accepted_by = userId;
  this.accepted_at = new Date();
  return this.save();
};

// Método para revogar o convite
invitationSchema.methods.revoke = function() {
  this.status = 'revoked';
  return this.save();
};

// Middleware para atualizar convites expirados
invitationSchema.pre('find', function() {
  this.where({
    $or: [
      { status: { $ne: 'pending' } },
      { expiration_date: { $gt: new Date() } }
    ]
  });
});

// Middleware para marcar convites como expirados
invitationSchema.pre('save', function(next) {
  if (this.status === 'pending' && this.isExpired()) {
    this.status = 'expired';
  }
  next();
});

// Método para limpar convites expirados (para ser usado em cron job)
invitationSchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    {
      status: 'pending',
      expiration_date: { $lt: new Date() }
    },
    {
      status: 'expired'
    }
  );
  return result;
};

// Validação personalizada para evitar convites duplicados
invitationSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingInvite = await this.constructor.findOne({
      email: this.email,
      community_id: this.community_id,
      status: 'pending',
      expiration_date: { $gt: new Date() }
    });
    
    if (existingInvite) {
      const error = new Error('An active invitation already exists for this email in this community');
      error.code = 'DUPLICATE_INVITATION';
      return next(error);
    }
  }
  next();
});

const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = Invitation;