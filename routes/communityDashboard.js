const express = require('express');
const router = express.Router();
const communityDashboardService = require('../services/communityDashboardService');
const { authenticateToken, loadBrandAndCheckOwnership, requireAdminAccess } = require('../middleware/auth');
const { param, query, body, validationResult } = require('express-validator');
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Validation middleware
const validateCommunityId = [
  param('communityId')
    .isMongoId()
    .withMessage('Invalid community ID format')
];

const validateCacheQuery = [
  query('use_cache')
    .optional()
    .isBoolean()
    .withMessage('use_cache must be a boolean value')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Validation for invitation creation
const validateInviteCreation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('expiration_hours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Expiration hours must be between 1 and 168 (7 days)')
];

// Validation for member listing
const validateMemberQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name filter must be between 1 and 100 characters'),
  query('email')
    .optional()
    .isEmail()
    .withMessage('Email filter must be a valid email'),
  query('join_date_from')
    .optional()
    .isISO8601()
    .withMessage('Join date from must be a valid ISO date'),
  query('join_date_to')
    .optional()
    .isISO8601()
    .withMessage('Join date to must be a valid ISO date')
];

// Validation for member ID
const validateMemberId = [
  param('memberId')
    .isMongoId()
    .withMessage('Invalid member ID format')
];

// Email configuration (should be moved to environment variables)
const createEmailTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'localhost',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Helper function to send invitation email
const sendInvitationEmail = async (email, token, communityName, inviterName) => {
  const transporter = createEmailTransporter();
  const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/invite/${token}`;
  
  const mailOptions = {
    from: process.env.FROM_EMAIL || 'noreply@hackmeridian.com',
    to: email,
    subject: `Invitation to join ${communityName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to join ${communityName}</h2>
        <p>Hello,</p>
        <p>${inviterName} has invited you to join the <strong>${communityName}</strong> community on HackMeridian.</p>
        <p>Click the button below to accept your invitation:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${inviteUrl}</p>
        <p><small>This invitation will expire in 24 hours.</small></p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
};

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardMetrics:
 *       type: object
 *       properties:
 *         community_id:
 *           type: string
 *           description: Community ID
 *           example: "507f1f77bcf86cd799439011"
 *         community_name:
 *           type: string
 *           description: Community name
 *           example: "Tech Enthusiasts"
 *         total_members:
 *           type: integer
 *           description: Total number of active members
 *           example: 150
 *         active_members:
 *           type: integer
 *           description: Members active in last 30 days
 *           example: 89
 *         nft_stats:
 *           type: object
 *           properties:
 *             total_nfts_minted:
 *               type: integer
 *               description: Total NFTs minted for this community
 *               example: 500
 *             total_nfts_distributed:
 *               type: integer
 *               description: Total NFTs distributed to members
 *               example: 400
 *             collections_count:
 *               type: integer
 *               description: Number of NFT collections
 *               example: 5
 *             total_max_supply:
 *               type: integer
 *               description: Total maximum supply across all collections
 *               example: 1000
 *             distribution_rate:
 *               type: string
 *               description: Percentage of NFTs distributed
 *               example: "80.00%"
 *         last_updated:
 *           type: string
 *           format: date-time
 *           description: When metrics were last calculated
 *         cache_ttl:
 *           type: integer
 *           description: Cache time-to-live in seconds
 *           example: 300
 *     
 *     CacheStatus:
 *       type: object
 *       properties:
 *         cached:
 *           type: boolean
 *           description: Whether data is currently cached
 *           example: true
 *         ttl_seconds:
 *           type: integer
 *           description: Remaining cache time in seconds
 *           example: 245
 *         cache_key:
 *           type: string
 *           description: Redis cache key
 *           example: "community:507f1f77bcf86cd799439011:dashboard:metrics"
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Error message"
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *               message:
 *                 type: string
 */

/**
 * @swagger
 * /api/communities/{communityId}/dashboard-metrics:
 *   get:
 *     summary: Get community dashboard metrics
 *     description: |
 *       Retrieve comprehensive dashboard metrics for a community including:
 *       - Total member count
 *       - Active members (logged in within 30 days)
 *       - NFT statistics (minted, distributed, collections)
 *       
 *       **Caching**: Results are cached for 5 minutes to optimize performance.
 *       
 *       **Access Control**: Requires authentication and community access permissions.
 *     tags: [Community Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId of the community
 *         example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: use_cache
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to use cached data (default true)
 *         example: true
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
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
 *                   example: "Dashboard metrics retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/DashboardMetrics'
 *                 cache_info:
 *                   type: object
 *                   properties:
 *                     from_cache:
 *                       type: boolean
 *                       example: true
 *                     cache_ttl:
 *                       type: integer
 *                       example: 245
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Access denied - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Community not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/communities/:communityId/dashboard-metrics',
  authenticateToken,
  validateCommunityId,
  validateCacheQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const useCache = req.query.use_cache !== 'false'; // Default to true
      const userId = req.user.id;

      // Check if user has access to this community
      const hasAccess = await communityDashboardService.validateCommunityAccess(communityId, userId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to view this community\'s dashboard.'
        });
      }

      // Get cache status before fetching metrics
      const cacheStatus = await communityDashboardService.getCacheStatus(communityId);
      
      // Get dashboard metrics
      const metrics = await communityDashboardService.getDashboardMetrics(communityId, useCache);

      res.status(200).json({
        success: true,
        message: 'Dashboard metrics retrieved successfully',
        data: metrics,
        cache_info: {
          from_cache: cacheStatus.cached && useCache,
          cache_ttl: cacheStatus.ttl_seconds > 0 ? cacheStatus.ttl_seconds : null,
          cache_enabled: useCache
        }
      });

    } catch (error) {
      console.error('Error in dashboard metrics endpoint:', error);
      
      if (error.message === 'Community not found') {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }
      
      if (error.message === 'Community is not active') {
        return res.status(403).json({
          success: false,
          message: 'Community is not active'
        });
      }
      
      if (error.message === 'Invalid community ID format') {
        return res.status(400).json({
          success: false,
          message: 'Invalid community ID format'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error while retrieving dashboard metrics'
      });
    }
  }
);

/**
 * @swagger
 * /api/communities/{communityId}/dashboard-metrics/cache:
 *   get:
 *     summary: Get cache status for community dashboard metrics
 *     description: Check the current cache status for community dashboard metrics
 *     tags: [Community Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId of the community
 *     responses:
 *       200:
 *         description: Cache status retrieved successfully
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
 *                   example: "Cache status retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/CacheStatus'
 */
router.get('/communities/:communityId/dashboard-metrics/cache',
  authenticateToken,
  validateCommunityId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;

      // Check if user has access to this community
      const hasAccess = await communityDashboardService.validateCommunityAccess(communityId, userId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to view this community\'s cache status.'
        });
      }

      const cacheStatus = await communityDashboardService.getCacheStatus(communityId);

      res.status(200).json({
        success: true,
        message: 'Cache status retrieved successfully',
        data: cacheStatus
      });

    } catch (error) {
      console.error('Error getting cache status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while retrieving cache status'
      });
    }
  }
);

/**
 * @swagger
 * /api/communities/{communityId}/dashboard-metrics/cache:
 *   delete:
 *     summary: Invalidate cache for community dashboard metrics
 *     description: Force refresh of cached dashboard metrics data
 *     tags: [Community Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: MongoDB ObjectId of the community
 *     responses:
 *       200:
 *         description: Cache invalidated successfully
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
 *                   example: "Cache invalidated successfully"
 */
router.delete('/communities/:communityId/dashboard-metrics/cache',
  authenticateToken,
  validateCommunityId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const userId = req.user.id;

      // Check if user has access to this community
      const hasAccess = await communityDashboardService.validateCommunityAccess(communityId, userId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to invalidate this community\'s cache.'
        });
      }

      await communityDashboardService.invalidateCache(communityId);

      res.status(200).json({
        success: true,
        message: 'Cache invalidated successfully'
      });

    } catch (error) {
      console.error('Error invalidating cache:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while invalidating cache'
      });
    }
  }
);

/**
 * @swagger
 * /api/communities/{communityId}/invites:
 *   post:
 *     summary: Create a new invitation for a community
 *     tags: [Community Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *         description: Community ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to invite
 *               expiration_hours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 168
 *                 default: 24
 *                 description: Hours until invitation expires
 *     responses:
 *       201:
 *         description: Invitation created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not community admin
 *       409:
 *         description: Active invitation already exists
 */
router.post('/communities/:communityId/invites',
  authenticateToken,
  requireAdminAccess,
  validateCommunityId,
  validateInviteCreation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { email, expiration_hours = 24 } = req.body;
      const inviterId = req.user._id;
      
      // Generate secure token
      const token = Invitation.generateSecureToken();
      const tokenHash = Invitation.hashToken(token);
      
      // Calculate expiration date
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + expiration_hours);
      
      // Create invitation
      const invitation = new Invitation({
        token_hash: tokenHash,
        email,
        community_id: communityId,
        expiration_date: expirationDate,
        invited_by: inviterId
      });
      
      await invitation.save();
      
      // Send invitation email
      try {
        const inviterName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email;
        await sendInvitationEmail(email, token, 'Community', inviterName);
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Continue execution - invitation is created even if email fails
      }
      
      res.status(201).json({
        success: true,
        message: 'Invitation created successfully',
        data: {
          invitation_id: invitation._id,
          email: invitation.email,
          expiration_date: invitation.expiration_date,
          status: invitation.status
        }
      });
      
    } catch (error) {
      console.error('Error creating invitation:', error);
      
      if (error.code === 'DUPLICATE_INVITATION') {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error while creating invitation'
      });
    }
  }
);

/**
 * @swagger
 * /api/communities/{communityId}/members:
 *   get:
 *     summary: Get paginated list of community members
 *     tags: [Community Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *         description: Community ID
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
 *           default: 20
 *         description: Number of members per page
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by member name
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         description: Filter by member email
 *       - in: query
 *         name: join_date_from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter members who joined after this date
 *       - in: query
 *         name: join_date_to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter members who joined before this date
 *     responses:
 *       200:
 *         description: Members retrieved successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/communities/:communityId/members',
  authenticateToken,
  validateCommunityId,
  validateMemberQuery,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const {
        page = 1,
        limit = 20,
        name,
        email,
        join_date_from,
        join_date_to
      } = req.query;
      
      // Build filter query
      const filter = { community_id: communityId, is_active: true };
      
      if (name) {
        filter.$or = [
          { first_name: { $regex: name, $options: 'i' } },
          { last_name: { $regex: name, $options: 'i' } }
        ];
      }
      
      if (email) {
        filter.email = { $regex: email, $options: 'i' };
      }
      
      if (join_date_from || join_date_to) {
        filter.created_at = {};
        if (join_date_from) {
          filter.created_at.$gte = new Date(join_date_from);
        }
        if (join_date_to) {
          filter.created_at.$lte = new Date(join_date_to);
        }
      }
      
      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Execute query with pagination
      const [members, totalCount] = await Promise.all([
        User.find(filter)
          .select('first_name last_name email user_type created_at last_login')
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(filter)
      ]);
      
      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / parseInt(limit));
      const hasNextPage = parseInt(page) < totalPages;
      const hasPrevPage = parseInt(page) > 1;
      
      res.json({
        success: true,
        data: {
          members,
          pagination: {
            current_page: parseInt(page),
            total_pages: totalPages,
            total_count: totalCount,
            limit: parseInt(limit),
            has_next_page: hasNextPage,
            has_prev_page: hasPrevPage
          }
        }
      });
      
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while fetching members'
      });
    }
  }
);

/**
 * @swagger
 * /api/communities/{communityId}/members/{memberId}:
 *   delete:
 *     summary: Remove a member from the community
 *     tags: [Community Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *         description: Community ID
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: Member ID to remove
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not community admin
 *       404:
 *         description: Member not found
 */
router.delete('/communities/:communityId/members/:memberId',
  authenticateToken,
  requireAdminAccess,
  validateCommunityId,
  validateMemberId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { communityId, memberId } = req.params;
      
      // Find the member
      const member = await User.findOne({
        _id: memberId,
        community_id: communityId,
        is_active: true
      });
      
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Member not found in this community'
        });
      }
      
      // Prevent removing community admin (assuming community_admin role)
      if (member.user_type === 'community_admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot remove community administrator'
        });
      }
      
      // Soft delete - deactivate the member
      await User.findByIdAndUpdate(memberId, {
        is_active: false,
        updated_at: new Date()
      });
      
      res.json({
        success: true,
        message: 'Member removed successfully',
        data: {
          removed_member: {
            id: member._id,
            email: member.email,
            name: `${member.first_name || ''} ${member.last_name || ''}`.trim()
          }
        }
      });
      
    } catch (error) {
      console.error('Error removing member:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while removing member'
      });
    }
  }
);

module.exports = router;