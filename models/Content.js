const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  text: {
    type: String,
    required: true,
    maxlength: 10000
  },
  mediaLinks: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    }
  }],
  community_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true,
    index: true
  },
  author_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentType: {
    type: String,
    enum: ['exclusive', 'premium', 'vip'],
    default: 'exclusive',
    required: true
  },
  accessLevel: {
    type: String,
    enum: ['member', 'admin', 'moderator'],
    default: 'member',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    category: String,
    subcategory: String,
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced']
    },
    estimatedReadTime: Number // em minutos
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices compostos para otimização de consultas
contentSchema.index({ community_id: 1, contentType: 1 });
contentSchema.index({ community_id: 1, isActive: 1 });
contentSchema.index({ author_id: 1, createdAt: -1 });

// Virtual para URL completa do conteúdo
contentSchema.virtual('contentUrl').get(function() {
  return `/content/${this._id}`;
});

// Middleware para incrementar viewCount
contentSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Método para verificar se usuário tem acesso ao conteúdo
contentSchema.methods.hasAccess = function(userRole, userCommunityId) {
  // Verifica se o usuário pertence à mesma comunidade
  if (!userCommunityId || userCommunityId.toString() !== this.community_id.toString()) {
    return false;
  }

  // Verifica se o conteúdo está ativo
  if (!this.isActive) {
    return false;
  }

  // Verifica nível de acesso baseado no papel do usuário
  const accessHierarchy = {
    'member': ['member'],
    'moderator': ['member', 'moderator'],
    'admin': ['member', 'moderator', 'admin']
  };

  return accessHierarchy[userRole] && accessHierarchy[userRole].includes(this.accessLevel);
};

// Método estático para buscar conteúdo com validação de acesso
contentSchema.statics.findByIdWithAccess = async function(contentId, userId, userCommunityId, userRole) {
  const content = await this.findById(contentId)
    .populate('community_id', 'name description')
    .populate('author_id', 'username email');

  if (!content) {
    return null;
  }

  if (!content.hasAccess(userRole, userCommunityId)) {
    throw new Error('FORBIDDEN');
  }

  return content;
};

// Middleware pre-save para validações
contentSchema.pre('save', function(next) {
  // Validar que pelo menos um tipo de conteúdo está presente
  if (!this.text && (!this.mediaLinks || this.mediaLinks.length === 0)) {
    return next(new Error('Content must have either text or media links'));
  }
  next();
});

module.exports = mongoose.model('Content', contentSchema);