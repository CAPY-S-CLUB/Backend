const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const commentSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  post_id: {
    type: String,
    required: true,
    ref: 'Post'
  },
  author_id: {
    type: String,
    required: true,
    ref: 'User'
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at' },
  versionKey: false
});

// Índices para otimização de consultas
commentSchema.index({ post_id: 1, created_at: 1 }); // Para buscar comentários por post ordenados por data
commentSchema.index({ author_id: 1 }); // Para buscar comentários por autor
commentSchema.index({ created_at: -1 }); // Para ordenação temporal

// Método estático para buscar comentários por post com paginação
commentSchema.statics.findByPostPaginated = function(postId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  return this.find({ post_id: postId })
    .sort({ created_at: 1 }) // Comentários mais antigos primeiro
    .skip(skip)
    .limit(limit)
    .populate('author_id', 'username avatar_url')
    .lean();
};

// Método estático para contar comentários por post
commentSchema.statics.countByPost = function(postId) {
  return this.countDocuments({ post_id: postId });
};

// Método estático para buscar comentários recentes por autor
commentSchema.statics.findRecentByAuthor = function(authorId, limit = 10) {
  return this.find({ author_id: authorId })
    .sort({ created_at: -1 })
    .limit(limit)
    .populate('post_id', 'content community_id')
    .lean();
};

module.exports = mongoose.model('Comment', commentSchema);