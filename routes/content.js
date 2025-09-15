const express = require('express');
const router = express.Router();
const Content = require('../models/Content');
const { requireContentAccess, logContentAccess } = require('../middleware/contentAccess');

/**
 * @swagger
 * components:
 *   schemas:
 *     Content:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the content
 *         title:
 *           type: string
 *           description: Content title
 *         text:
 *           type: string
 *           description: Content text body
 *         mediaLinks:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [image, video, audio, document]
 *               url:
 *                 type: string
 *               filename:
 *                 type: string
 *               size:
 *                 type: number
 *         community_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             name:
 *               type: string
 *         author_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             username:
 *               type: string
 *         contentType:
 *           type: string
 *           enum: [exclusive, premium, vip]
 *         accessLevel:
 *           type: string
 *           enum: [member, admin, moderator]
 *         viewCount:
 *           type: number
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         metadata:
 *           type: object
 *           properties:
 *             category:
 *               type: string
 *             subcategory:
 *               type: string
 *             difficulty:
 *               type: string
 *               enum: [beginner, intermediate, advanced]
 *             estimatedReadTime:
 *               type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     ContentError:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *         message:
 *           type: string
 *         code:
 *           type: string
 *         details:
 *           type: object
 */

/**
 * @swagger
 * /content/{content_id}:
 *   get:
 *     summary: Get exclusive content by ID
 *     description: |
 *       Retrieves exclusive content with strict access control.
 *       
 *       **Access Flow:**
 *       1. **Authentication Check**: Validates JWT token from Authorization header
 *       2. **Community Affiliation**: Verifies user belongs to content's community
 *       3. **Content Delivery**: Returns full content details if authorized
 *       
 *       **Security Features:**
 *       - JWT token validation with expiration check
 *       - Community membership verification
 *       - Role-based access control
 *       - Content availability validation
 *     tags: [Exclusive Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: content_id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId of the content
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Content'
 *                 access:
 *                   type: object
 *                   properties:
 *                     community:
 *                       type: string
 *                     userRole:
 *                       type: string
 *                     accessLevel:
 *                       type: string
 *             examples:
 *               exclusive_content:
 *                 summary: Exclusive content example
 *                 value:
 *                   success: true
 *                   data:
 *                     _id: "507f1f77bcf86cd799439011"
 *                     title: "Advanced Trading Strategies"
 *                     text: "This exclusive content covers advanced trading techniques..."
 *                     mediaLinks:
 *                       - type: "video"
 *                         url: "https://example.com/video.mp4"
 *                         filename: "trading_strategies.mp4"
 *                         size: 15728640
 *                     community_id:
 *                       _id: "507f1f77bcf86cd799439012"
 *                       name: "Crypto Traders Community"
 *                     author_id:
 *                       _id: "507f1f77bcf86cd799439013"
 *                       username: "expert_trader"
 *                     contentType: "exclusive"
 *                     accessLevel: "member"
 *                     viewCount: 1247
 *                     tags: ["trading", "cryptocurrency", "advanced"]
 *                     createdAt: "2024-01-15T10:30:00Z"
 *                   access:
 *                     community: "Crypto Traders Community"
 *                     userRole: "member"
 *                     accessLevel: "member"
 *       401:
 *         description: Unauthorized - Invalid or missing JWT token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentError'
 *             examples:
 *               missing_token:
 *                 summary: Missing authorization token
 *                 value:
 *                   error: "Unauthorized"
 *                   message: "Access token is required"
 *                   code: "MISSING_TOKEN"
 *               invalid_token:
 *                 summary: Invalid or expired token
 *                 value:
 *                   error: "Unauthorized"
 *                   message: "Invalid or expired token"
 *                   code: "INVALID_TOKEN"
 *               user_not_found:
 *                 summary: User not found
 *                 value:
 *                   error: "Unauthorized"
 *                   message: "User not found"
 *                   code: "USER_NOT_FOUND"
 *       403:
 *         description: Forbidden - User not authorized to access this content
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentError'
 *             examples:
 *               community_mismatch:
 *                 summary: User belongs to different community
 *                 value:
 *                   error: "Forbidden"
 *                   message: "Access denied. Content belongs to a different community"
 *                   code: "COMMUNITY_MISMATCH"
 *                   details:
 *                     userCommunity: "Tech Innovators"
 *                     contentCommunity: "Crypto Traders Community"
 *               insufficient_permissions:
 *                 summary: Insufficient role permissions
 *                 value:
 *                   error: "Forbidden"
 *                   message: "Insufficient permissions to access this content"
 *                   code: "INSUFFICIENT_PERMISSIONS"
 *                   details:
 *                     requiredLevel: "admin"
 *                     userRole: "member"
 *               no_community:
 *                 summary: User not member of any community
 *                 value:
 *                   error: "Forbidden"
 *                   message: "User must be a member of a community to access exclusive content"
 *                   code: "NO_COMMUNITY_MEMBERSHIP"
 *       404:
 *         description: Not Found - Content does not exist or is inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentError'
 *             examples:
 *               content_not_found:
 *                 summary: Content not found
 *                 value:
 *                   error: "Not Found"
 *                   message: "Content not found"
 *                   code: "CONTENT_NOT_FOUND"
 *               content_inactive:
 *                 summary: Content is inactive
 *                 value:
 *                   error: "Not Found"
 *                   message: "Content is no longer available"
 *                   code: "CONTENT_INACTIVE"
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContentError'
 *             examples:
 *               server_error:
 *                 summary: Internal server error
 *                 value:
 *                   error: "Internal Server Error"
 *                   message: "Content retrieval service unavailable"
 *                   code: "SERVICE_ERROR"
 */
router.get('/:content_id', requireContentAccess, logContentAccess, async (req, res) => {
  try {
    const { content_id } = req.params;
    const { user } = req;

    // Buscar conteúdo completo com dados relacionados
    const content = await Content.findById(content_id)
      .populate('community_id', '_id name description')
      .populate('author_id', '_id username email')
      .select('-__v'); // Excluir campo de versioning

    if (!content) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Content not found',
        code: 'CONTENT_NOT_FOUND'
      });
    }

    // Incrementar contador de visualizações
    await content.incrementViewCount();

    // Preparar resposta com dados de acesso
    const response = {
      success: true,
      data: content,
      access: {
        community: user.community_name,
        userRole: user.role,
        accessLevel: content.accessLevel,
        accessGrantedAt: new Date().toISOString()
      },
      meta: {
        viewCount: content.viewCount,
        contentType: content.contentType,
        estimatedReadTime: content.metadata?.estimatedReadTime || null
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Content retrieval error:', error);
    
    // Tratar erros específicos do middleware
    if (error.message === 'FORBIDDEN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this content',
        code: 'ACCESS_DENIED'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Content retrieval service unavailable',
      code: 'SERVICE_ERROR'
    });
  }
});

/**
 * @swagger
 * /content:
 *   get:
 *     summary: List community exclusive content
 *     description: |
 *       Retrieves a paginated list of exclusive content for the user's community.
 *       Only shows content that the user has permission to access.
 *     tags: [Exclusive Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: contentType
 *         schema:
 *           type: string
 *           enum: [exclusive, premium, vip]
 *         description: Filter by content type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by content category
 *     responses:
 *       200:
 *         description: Content list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Content'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/', requireContentAccess, async (req, res) => {
  try {
    const { user } = req;
    const {
      page = 1,
      limit = 10,
      contentType,
      category
    } = req.query;

    // Construir filtros
    const filters = {
      community_id: user.community_id,
      isActive: true
    };

    if (contentType) {
      filters.contentType = contentType;
    }

    if (category) {
      filters['metadata.category'] = category;
    }

    // Filtrar por nível de acesso baseado no papel do usuário
    const accessLevels = {
      'member': ['member'],
      'moderator': ['member', 'moderator'],
      'admin': ['member', 'moderator', 'admin']
    };

    filters.accessLevel = { $in: accessLevels[user.role] || ['member'] };

    // Executar consulta com paginação
    const skip = (page - 1) * limit;
    const [contents, total] = await Promise.all([
      Content.find(filters)
        .populate('author_id', '_id username')
        .select('_id title contentType accessLevel viewCount tags metadata createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Content.countDocuments(filters)
    ]);

    const response = {
      success: true,
      data: contents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        community: user.community_name,
        contentType: contentType || 'all',
        category: category || 'all',
        accessLevel: user.role
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Content list retrieval error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Content list service unavailable',
      code: 'SERVICE_ERROR'
    });
  }
});

module.exports = router;