/**
 * @swagger
 * components:
 *   schemas:
 *     PostInput:
 *       type: object
 *       required:
 *         - content
 *       properties:
 *         content:
 *           type: string
 *           maxLength: 2000
 *           description: Post content text
 *         media_urls:
 *           type: array
 *           items:
 *             type: string
 *             format: uri
 *           description: Array of media URLs
 *     CommentInput:
 *       type: object
 *       required:
 *         - content
 *       properties:
 *         content:
 *           type: string
 *           maxLength: 500
 *           description: Comment content text
 */

const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const { authenticateToken } = require('../middleware/auth');
const { requireCommunityMembership, requirePostOwnershipOrAdmin } = require('../middleware/communityAuth');
const { body, param, query, validationResult } = require('express-validator');

/**
 * @swagger
 * /posts:
 *   get:
 *     summary: Get timeline posts with pagination
 *     description: Retrieve posts from user's communities with pagination and filtering
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Posts per page
 *       - in: query
 *         name: community_id
 *         schema:
 *           type: string
 *           format: objectid
 *         description: Filter by specific community ID
 *     responses:
 *       200:
 *         description: Posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     posts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Post'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         total_posts:
 *                           type: integer
 *                         has_next:
 *                           type: boolean
 *                         has_prev:
 *                           type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/',
  authenticateToken,
  requireCommunityMembership(['MEMBER', 'COMMUNITY_ADMIN']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  async (req, res) => {
    try {
      // Validação dos parâmetros
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const { communityId } = req.userCommunity;

      // Buscar posts da comunidade com paginação
      const posts = await Post.findByCommunityPaginated(communityId, page, limit);
      const totalPosts = await Post.countByCommunity(communityId);
      const totalPages = Math.ceil(totalPosts / limit);

      // Buscar informações de likes para cada post (se o usuário curtiu)
      const postsWithLikeInfo = await Promise.all(
        posts.map(async (post) => {
          const userLiked = await Like.hasUserLiked(req.userCommunity.userId, post._id);
          return {
            ...post,
            user_liked: !!userLiked
          };
        })
      );

      res.json({
        success: true,
        data: {
          posts: postsWithLikeInfo,
          pagination: {
            current_page: page,
            total_pages: totalPages,
            total_posts: totalPosts,
            posts_per_page: limit,
            has_next: page < totalPages,
            has_prev: page > 1
          }
        }
      });
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching posts',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /posts:
 *   post:
 *     summary: Create a new post
 *     description: Create a new post in user's community (requires community membership)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PostInput'
 *           example:
 *             content: "This is my new post content!"
 *             media_urls: ["https://example.com/image1.jpg"]
 *     responses:
 *       201:
 *         description: Post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Post created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Post'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/',
  authenticateToken,
  requireCommunityMembership(['MEMBER', 'COMMUNITY_ADMIN']),
  [
    body('content')
      .notEmpty()
      .withMessage('Content is required')
      .isLength({ max: 5000 })
      .withMessage('Content must not exceed 5000 characters'),
    body('media_urls')
      .optional()
      .isArray()
      .withMessage('Media URLs must be an array')
      .custom((urls) => {
        if (urls && urls.length > 10) {
          throw new Error('Maximum 10 media URLs allowed');
        }
        if (urls) {
          urls.forEach(url => {
            if (typeof url !== 'string' || !url.match(/^https?:\/\/.+/)) {
              throw new Error('Invalid URL format');
            }
          });
        }
        return true;
      })
  ],
  async (req, res) => {
    try {
      // Validação dos dados
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { content, media_urls = [] } = req.body;
      const { userId, communityId } = req.userCommunity;

      // Criar o post
      const newPost = new Post({
        author_id: userId,
        community_id: communityId,
        content,
        media_urls
      });

      const savedPost = await newPost.save();

      // Buscar o post criado com informações do autor
      const populatedPost = await Post.findById(savedPost._id)
        .populate('author_id', 'username avatar_url')
        .lean();

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: {
          post: {
            ...populatedPost,
            user_liked: false
          }
        }
      });
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating post',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /posts/{id}:
 *   put:
 *     summary: Update a post
 *     description: Update post content (requires post ownership or community admin)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: Post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Updated post content
 *               media_urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Updated media URLs
 *           example:
 *             content: "Updated post content"
 *             media_urls: ["https://example.com/updated-image.jpg"]
 *     responses:
 *       200:
 *         description: Post updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Post updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Post'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/:id',
  authenticateToken,
  requirePostOwnershipOrAdmin,
  [
    param('id').notEmpty().withMessage('Post ID is required'),
    body('content')
      .optional()
      .isLength({ max: 5000 })
      .withMessage('Content must not exceed 5000 characters'),
    body('media_urls')
      .optional()
      .isArray()
      .withMessage('Media URLs must be an array')
      .custom((urls) => {
        if (urls && urls.length > 10) {
          throw new Error('Maximum 10 media URLs allowed');
        }
        return true;
      })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { content, media_urls } = req.body;
      const { post } = req.postAccess;

      // Preparar dados para atualização
      const updateData = {};
      if (content !== undefined) updateData.content = content;
      if (media_urls !== undefined) updateData.media_urls = media_urls;
      updateData.updated_at = new Date();

      // Atualizar o post
      const updatedPost = await Post.findByIdAndUpdate(
        post._id,
        updateData,
        { new: true }
      ).populate('author_id', 'username avatar_url');

      res.json({
        success: true,
        message: 'Post updated successfully',
        data: {
          post: updatedPost
        }
      });
    } catch (error) {
      console.error('Error updating post:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating post',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /posts/{id}:
 *   delete:
 *     summary: Delete a post
 *     description: Delete a post (requires post ownership or community admin)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Post deleted successfully"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/:id',
  authenticateToken,
  requirePostOwnershipOrAdmin,
  [
    param('id').notEmpty().withMessage('Post ID is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { post } = req.postAccess;

      // Deletar comentários relacionados
      await Comment.deleteMany({ post_id: post._id });
      
      // Deletar likes relacionados
      await Like.deleteMany({ post_id: post._id });
      
      // Deletar o post
      await Post.findByIdAndDelete(post._id);

      res.json({
        success: true,
        message: 'Post deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting post',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /posts/{id}/like:
 *   post:
 *     summary: Toggle like on a post
 *     description: Add or remove like from a post and update counter atomically
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Like toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Post liked successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     action:
 *                       type: string
 *                       description: Action performed (liked/unliked)
 *                     liked:
 *                       type: boolean
 *                       description: Whether the post is now liked
 *                     likes_count:
 *                       type: integer
 *                       description: Updated likes count
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/:id/like',
  authenticateToken,
  requireCommunityMembership(['MEMBER', 'COMMUNITY_ADMIN']),
  [
    param('id').notEmpty().withMessage('Post ID is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const postId = req.params.id;
      const { userId } = req.userCommunity;

      // Verificar se o post existe
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      // Verificar se o post pertence à mesma comunidade do usuário
      if (post.community_id !== req.userCommunity.communityId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only like posts from your community'
        });
      }

      // Toggle like
      const result = await Like.toggleLike(userId, postId);
      
      // Buscar o post atualizado
      const updatedPost = await Post.findById(postId);

      res.json({
        success: true,
        message: `Post ${result.action} successfully`,
        data: {
          action: result.action,
          liked: result.liked,
          likes_count: updatedPost.likes_count
        }
      });
    } catch (error) {
      console.error('Error toggling like:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing like',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /posts/{id}/comment:
 *   post:
 *     summary: Add a comment to a post
 *     description: Create a new comment on a post (requires authentication and post access)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: Post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CommentInput'
 *           example:
 *             content: "Great post! Thanks for sharing."
 *     responses:
 *       201:
 *         description: Comment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Comment added successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Comment'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/:id/comment',
  authenticateToken,
  requireCommunityMembership(['MEMBER', 'COMMUNITY_ADMIN']),
  [
    param('id').notEmpty().withMessage('Post ID is required'),
    body('content')
      .notEmpty()
      .withMessage('Comment content is required')
      .isLength({ max: 1000 })
      .withMessage('Comment must not exceed 1000 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const postId = req.params.id;
      const { content } = req.body;
      const { userId } = req.userCommunity;

      // Verificar se o post existe
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      // Verificar se o post pertence à mesma comunidade do usuário
      if (post.community_id !== req.userCommunity.communityId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only comment on posts from your community'
        });
      }

      // Criar o comentário
      const newComment = new Comment({
        post_id: postId,
        author_id: userId,
        content
      });

      const savedComment = await newComment.save();

      // Buscar o comentário criado com informações do autor
      const populatedComment = await Comment.findById(savedComment._id)
        .populate('author_id', 'username avatar_url')
        .lean();

      res.status(201).json({
        success: true,
        message: 'Comment added successfully',
        data: {
          comment: populatedComment
        }
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding comment',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /posts/{id}/comments:
 *   get:
 *     summary: Get comments for a post
 *     description: Retrieve comments for a specific post with pagination
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: Post ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Comments per page
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     comments:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Comment'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         total_comments:
 *                           type: integer
 *                         comments_per_page:
 *                           type: integer
 *                         has_next:
 *                           type: boolean
 *                         has_prev:
 *                           type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:id/comments',
  authenticateToken,
  requireCommunityMembership(['MEMBER', 'COMMUNITY_ADMIN']),
  [
    param('id').notEmpty().withMessage('Post ID is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const postId = req.params.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      // Verificar se o post existe e pertence à comunidade do usuário
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      if (post.community_id !== req.userCommunity.communityId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only view comments from posts in your community'
        });
      }

      // Buscar comentários com paginação
      const comments = await Comment.findByPostPaginated(postId, page, limit);
      const totalComments = await Comment.countByPost(postId);
      const totalPages = Math.ceil(totalComments / limit);

      res.json({
        success: true,
        data: {
          comments,
          pagination: {
            current_page: page,
            total_pages: totalPages,
            total_comments: totalComments,
            comments_per_page: limit,
            has_next: page < totalPages,
            has_prev: page > 1
          }
        }
      });
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching comments',
        error: error.message
      });
    }
  }
);

module.exports = router;