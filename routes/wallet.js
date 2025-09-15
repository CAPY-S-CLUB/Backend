const express = require('express');
const { param, validationResult } = require('express-validator');
const User = require('../models/User');
const walletService = require('../services/walletService');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     WalletInfo:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *         wallet:
 *           type: object
 *           properties:
 *             address:
 *               type: string
 *               description: Wallet address
 *             balance:
 *               type: object
 *               properties:
 *                 formatted:
 *                   type: string
 *                 symbol:
 *                   type: string
 *             tokens:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   token_address:
 *                     type: string
 *                   name:
 *                     type: string
 *                   symbol:
 *                     type: string
 *                   balance:
 *                     type: string
 *             nfts:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *     WalletBalance:
 *       type: object
 *       properties:
 *         address:
 *           type: string
 *         balance:
 *           type: object
 *           properties:
 *             formatted:
 *               type: string
 *             symbol:
 *               type: string
 *     WalletCreated:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             wallet_address:
 *               type: string
 *             wallet_created_at:
 *               type: string
 *               format: date-time
 */

// Validation middleware
const userIdValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID format')
];

// Middleware to check wallet ownership
const checkWalletOwnership = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    
    // Allow access if user is requesting their own wallet or is an admin
    if (userId === requestingUserId || 
        req.user.user_type === 'platform_admin' || 
        req.user.user_type === 'community_admin') {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own wallet information.'
    });
  } catch (error) {
    console.error('Wallet ownership check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * @swagger
 * /api/users/{userId}/wallet:
 *   get:
 *     summary: Get comprehensive wallet information
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Wallet information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/WalletInfo'
 *       403:
 *         description: Access denied - can only access own wallet
 *       404:
 *         description: User not found or wallet not created
 *       500:
 *         description: Server error
 */
// @route   GET /api/users/:userId/wallet
// @desc    Get user's wallet information including address, balances, and NFTs
// @access  Private (Owner or Admin only)
router.get('/:userId/wallet', 
  authenticateToken,
  userIdValidation,
  checkWalletOwnership,
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { userId } = req.params;
      const { chain = 'eth' } = req.query;

      // Find user and check if wallet exists
      const user = await User.findById(userId).select('wallet_address wallet_created_at email first_name last_name');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.wallet_address) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found for this user. Please create a wallet first.'
        });
      }

      // Validate wallet address format
      if (!walletService.isValidAddress(user.wallet_address)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid wallet address format'
        });
      }

      // Get comprehensive wallet information
      const walletInfo = await walletService.getWalletInfo(user.wallet_address, chain);
      
      if (!walletInfo.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to retrieve wallet information',
          error: walletInfo.error
        });
      }

      // Prepare response data
      const responseData = {
        user: {
          id: user._id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A'
        },
        wallet: {
          address: user.wallet_address,
          createdAt: user.wallet_created_at,
          chain: walletInfo.wallet.chain,
          balance: walletInfo.wallet.balance,
          tokens: walletInfo.wallet.tokens,
          nfts: {
            items: walletInfo.wallet.nfts,
            total: walletInfo.wallet.totalNFTs
          },
          lastUpdated: walletInfo.wallet.lastUpdated
        }
      };

      res.status(200).json({
        success: true,
        message: 'Wallet information retrieved successfully',
        data: responseData
      });

    } catch (error) {
      console.error('Get wallet info error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/{userId}/wallet:
 *   post:
 *     summary: Create wallet for user (if not exists)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       201:
 *         description: Wallet created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WalletCreated'
 *       400:
 *         description: Wallet already exists
 *       403:
 *         description: Access denied - can only create own wallet
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// @route   POST /api/users/:userId/wallet
// @desc    Create a wallet for a user (if not exists)
// @access  Private (Owner or Admin only)
router.post('/:userId/wallet',
  authenticateToken,
  userIdValidation,
  checkWalletOwnership,
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { userId } = req.params;

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if wallet already exists
      if (user.wallet_address) {
        return res.status(409).json({
          success: false,
          message: 'Wallet already exists for this user',
          data: {
            wallet_address: user.wallet_address,
            created_at: user.wallet_created_at
          }
        });
      }

      // Create new wallet
      const walletResult = await walletService.createSmartWallet(userId);
      
      if (!walletResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create wallet'
        });
      }

      // Update user with wallet information
      user.wallet_address = walletResult.wallet.address;
      user.wallet_created_at = walletResult.wallet.createdAt;
      await user.save();

      res.status(201).json({
        success: true,
        message: 'Wallet created successfully',
        data: {
          wallet: {
            address: walletResult.wallet.address,
            network: walletResult.wallet.network,
            createdAt: walletResult.wallet.createdAt
          }
        }
      });

    } catch (error) {
      console.error('Create wallet error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @swagger
 * /api/users/{userId}/wallet/balance:
 *   get:
 *     summary: Get wallet balance only
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Wallet balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/WalletBalance'
 *       403:
 *         description: Access denied - can only access own wallet
 *       404:
 *         description: User not found or wallet not created
 *       500:
 *         description: Server error
 */
// @route   GET /api/users/:userId/wallet/balance
// @desc    Get wallet balance only (lighter endpoint)
// @access  Private (Owner or Admin only)
router.get('/:userId/wallet/balance',
  authenticateToken,
  userIdValidation,
  checkWalletOwnership,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { userId } = req.params;
      const { chain = 'eth' } = req.query;

      const user = await User.findById(userId).select('wallet_address');
      if (!user || !user.wallet_address) {
        return res.status(404).json({
          success: false,
          message: 'User or wallet not found'
        });
      }

      const balanceResult = await walletService.getWalletBalance(user.wallet_address, chain);
      
      res.status(200).json({
        success: true,
        message: 'Wallet balance retrieved successfully',
        data: {
          address: user.wallet_address,
          balance: balanceResult.balance,
          chain
        }
      });

    } catch (error) {
      console.error('Get wallet balance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;