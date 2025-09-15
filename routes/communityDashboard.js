const express = require('express');
const router = express.Router();
const communityDashboardService = require('../services/communityDashboardService');
const { authenticateToken, loadBrandAndCheckOwnership } = require('../middleware/auth');
const { param, query, validationResult } = require('express-validator');

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

module.exports = router;