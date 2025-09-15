const Community = require('../models/Community');
const mongoose = require('mongoose');

/**
 * Middleware to validate if the authenticated user is a community admin
 * This middleware should be used after authenticateToken middleware
 */
const validateCommunityAdmin = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const communityId = req.body.community_id || req.params.community_id;

    // Check if community_id is provided
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid community ID format'
      });
    }

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if user is the community admin
    if (community.admin_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You must be the community administrator to perform this action.'
      });
    }

    // Add community to request object for use in route handlers
    req.community = community;
    next();
  } catch (error) {
    console.error('Community admin validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during community validation'
    });
  }
};

/**
 * Middleware to validate if the authenticated user is a member of the community
 * This middleware should be used after authenticateToken middleware
 */
const validateCommunityMember = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const communityId = req.body.community_id || req.params.community_id;

    // Check if community_id is provided
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid community ID format'
      });
    }

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if user is a member or admin of the community
    const isMember = community.members && community.members.includes(userId);
    const isAdmin = community.admin_id.toString() === userId.toString();

    if (!isMember && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You must be a member of this community.'
      });
    }

    // Add community to request object for use in route handlers
    req.community = community;
    req.isAdmin = isAdmin;
    next();
  } catch (error) {
    console.error('Community member validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during community validation'
    });
  }
};

/**
 * Middleware to check if a community exists and is accessible
 * This middleware can be used without authentication for public access
 */
const validateCommunityExists = async (req, res, next) => {
  try {
    const communityId = req.body.community_id || req.params.community_id || req.query.community_id;

    // Check if community_id is provided
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid community ID format'
      });
    }

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Add community to request object for use in route handlers
    req.community = community;
    next();
  } catch (error) {
    console.error('Community validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during community validation'
    });
  }
};

/**
 * Middleware para verificar se o usuário é membro ou admin da comunidade
 * @param {Array} allowedRoles - Roles permitidos: ['MEMBER', 'COMMUNITY_ADMIN']
 */
const requireCommunityMembership = (allowedRoles = ['MEMBER', 'COMMUNITY_ADMIN']) => {
  return async (req, res, next) => {
    try {
      const User = require('../models/User');
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to access this resource'
        });
      }

      // Busca o usuário com informações da comunidade
      const user = await User.findById(userId).populate('community_id');
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Authenticated user not found in database'
        });
      }

      if (!user.community_id) {
        return res.status(403).json({
          error: 'No community membership',
          message: 'User is not a member of any community'
        });
      }

      // Verifica se o role do usuário está entre os permitidos
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
        });
      }

      // Adiciona informações do usuário e comunidade ao request
      req.userCommunity = {
        userId: user._id,
        communityId: user.community_id._id,
        userRole: user.role,
        community: user.community_id
      };

      next();
    } catch (error) {
      console.error('Community auth middleware error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Error verifying community membership'
      });
    }
  };
};

/**
 * Middleware para verificar se o usuário pode acessar/modificar um post específico
 */
const requirePostOwnershipOrAdmin = async (req, res, next) => {
  try {
    const Post = require('../models/Post');
    const User = require('../models/User');
    const postId = req.params.id;
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated'
      });
    }

    // Busca o post
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({
        error: 'Post not found',
        message: 'The requested post does not exist'
      });
    }

    // Busca o usuário
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Authenticated user not found'
      });
    }

    // Verifica se é o autor do post OU admin da comunidade
    const isAuthor = post.author_id === userId.toString();
    const isCommunityAdmin = user.role === 'COMMUNITY_ADMIN' && user.community_id.toString() === post.community_id;
    
    if (!isAuthor && !isCommunityAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the post author or community admin can perform this action'
      });
    }

    // Adiciona informações ao request
    req.postAccess = {
      post,
      isAuthor,
      isCommunityAdmin,
      userId,
      userRole: user.role
    };

    next();
  } catch (error) {
    console.error('Post ownership middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Error verifying post access permissions'
    });
  }
};

module.exports = {
  validateCommunityAdmin,
  validateCommunityMember,
  validateCommunityExists,
  requireCommunityMembership,
  requirePostOwnershipOrAdmin
};