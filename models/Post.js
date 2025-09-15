const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const postSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  author_id: {
    type: String,
    required: true,
    ref: 'User'
  },
  community_id: {
    type: String,
    required: true,
    ref: 'Community'
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  media_urls: {
    type: [String],
    default: [],
    validate: {
      validator: function(urls) {
        return urls.length <= 10; // Limite de 10 mídias por post
      },
      message: 'Maximum 10 media URLs allowed per post'
    }
  },
  likes_count: {
    type: Number,
    default: 0,
    min: 0
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false
});

// Índices para otimização de consultas
postSchema.index({ community_id: 1, created_at: -1 }); // Para buscar posts por comunidade ordenados por data
postSchema.index({ author_id: 1 }); // Para buscar posts por autor
postSchema.index({ created_at: -1 }); // Para ordenação temporal

// Middleware para atualizar updated_at
postSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updated_at = new Date();
  }
  next();
});

// Método para incrementar likes de forma atômica
postSchema.methods.incrementLikes = function() {
  return this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { likes_count: 1 } },
    { new: true }
  );
};

// Método para decrementar likes de forma atômica
postSchema.methods.decrementLikes = function() {
  return this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { likes_count: -1 } },
    { new: true }
  );
};

// Método estático para buscar posts por comunidade com paginação
postSchema.statics.findByCommunityPaginated = function(communityId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  return this.find({ community_id: communityId })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('author_id', 'username avatar_url')
    .lean();
};

// Método estático para contar posts por comunidade
postSchema.statics.countByCommunity = function(communityId) {
  return this.countDocuments({ community_id: communityId });
};

module.exports = mongoose.model('Post', postSchema);