const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const likeSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  user_id: {
    type: String,
    required: true,
    ref: 'User'
  },
  post_id: {
    type: String,
    required: true,
    ref: 'Post'
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at' },
  versionKey: false
});

// Índice composto único para evitar likes duplicados
likeSchema.index({ user_id: 1, post_id: 1 }, { unique: true });

// Índices para otimização de consultas
likeSchema.index({ post_id: 1 }); // Para contar likes por post
likeSchema.index({ user_id: 1 }); // Para buscar likes por usuário
likeSchema.index({ created_at: -1 }); // Para ordenação temporal

// Método estático para verificar se usuário já curtiu o post
likeSchema.statics.hasUserLiked = function(userId, postId) {
  return this.findOne({ user_id: userId, post_id: postId });
};

// Método estático para contar likes por post
likeSchema.statics.countByPost = function(postId) {
  return this.countDocuments({ post_id: postId });
};

// Método estático para buscar posts curtidos por usuário
likeSchema.statics.findLikedPostsByUser = function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  return this.find({ user_id: userId })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('post_id')
    .lean();
};

// Método estático para buscar usuários que curtiram um post
likeSchema.statics.findUsersByPost = function(postId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  return this.find({ post_id: postId })
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user_id', 'username avatar_url')
    .lean();
};

// Método estático para toggle like (curtir/descurtir)
likeSchema.statics.toggleLike = async function(userId, postId) {
  const Post = mongoose.model('Post');
  
  try {
    // Verifica se já existe o like
    const existingLike = await this.findOne({ user_id: userId, post_id: postId });
    
    if (existingLike) {
      // Remove o like e decrementa o contador
      await this.deleteOne({ _id: existingLike._id });
      await Post.findByIdAndUpdate(postId, { $inc: { likes_count: -1 } });
      return { action: 'unliked', liked: false };
    } else {
      // Adiciona o like e incrementa o contador
      await this.create({ user_id: userId, post_id: postId });
      await Post.findByIdAndUpdate(postId, { $inc: { likes_count: 1 } });
      return { action: 'liked', liked: true };
    }
  } catch (error) {
    if (error.code === 11000) {
      // Erro de duplicação - like já existe
      throw new Error('Like already exists');
    }
    throw error;
  }
};

module.exports = mongoose.model('Like', likeSchema);