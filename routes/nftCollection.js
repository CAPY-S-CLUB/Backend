const express = require('express');
const router = express.Router();
const nftCollectionService = require('../services/nftCollectionService');
const { authenticateToken, loadBrandAndCheckOwnership } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

/**
 * @swagger
 * components:
 *   schemas:
 *     NFTCollectionRequest:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - symbol
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the NFT collection
 *           maxLength: 100
 *           example: "Awesome NFT Collection"
 *         description:
 *           type: string
 *           description: Description of the NFT collection
 *           maxLength: 1000
 *           example: "A unique collection of digital art pieces"
 *         symbol:
 *           type: string
 *           description: Symbol for the NFT collection
 *           maxLength: 10
 *           example: "AWESOME"
 *         contractType:
           type: string
           enum: [STELLAR_ASSET]
           description: Type of Stellar asset
           example: "STELLAR_ASSET"
 *         maxSupply:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000000
 *           description: Maximum number of tokens that can be minted
 *           example: 10000
 *         mintPrice:
           type: string
           description: Price to mint each token (in XLM)
           example: "0.05"
 *         network:
           type: string
           enum: [stellar-mainnet, stellar-testnet]
           description: Stellar network for deployment
           example: "stellar-testnet"
 *         baseTokenURI:
 *           type: string
 *           description: Base URI for token metadata
 *           example: "https://api.example.com/metadata"
 *         externalUrl:
 *           type: string
 *           description: External URL for the collection
 *           example: "https://example.com/collection"
 *         image:
 *           type: string
 *           description: Collection image URL
 *           example: "https://example.com/collection-image.png"
 *     
 *     NFTCollection:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the collection
 *         name:
 *           type: string
 *           description: Name of the NFT collection
 *         description:
 *           type: string
 *           description: Description of the NFT collection
 *         symbol:
 *           type: string
 *           description: Symbol for the NFT collection
 *         contract_address:
           type: string
           description: Stellar asset issuer address
 *         brand_id:
 *           type: string
 *           description: Associated brand ID
 *         contract_type:
           type: string
           enum: [STELLAR_ASSET]
           description: Type of Stellar asset
 *         max_supply:
 *           type: integer
 *           description: Maximum number of tokens
 *         mint_price:
 *           type: string
 *           description: Price to mint each token
 *         network:
           type: string
           description: Stellar network
 *         status:
 *           type: string
 *           enum: [pending, deploying, deployed, failed]
 *           description: Deployment status
 *         deployment_tx_hash:
 *           type: string
 *           description: Deployment transaction hash
 *         deployment_block_number:
 *           type: integer
 *           description: Block number of deployment
 *         metadata:
 *           type: object
 *           properties:
 *             base_uri:
 *               type: string
 *             external_url:
 *               type: string
 *             image:
 *               type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         collection_url:
 *           type: string
 *           description: Blockchain explorer URL
 *     
 *     NFTCollectionList:
 *       type: object
 *       properties:
 *         collections:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NFTCollection'
 *         pagination:
 *           type: object
 *           properties:
 *             current_page:
 *               type: integer
 *             total_pages:
 *               type: integer
 *             total_items:
 *               type: integer
 *             items_per_page:
 *               type: integer
 *     
 *     NFTCollectionStats:
 *       type: object
 *       properties:
 *         total_supply:
 *           type: integer
 *           description: Current number of minted tokens
 *         max_supply:
 *           type: integer
 *           description: Maximum number of tokens
 *         mint_price:
 *           type: string
 *           description: Current mint price
 *         status:
 *           type: string
 *           description: Collection status
 *         contract_address:
 *           type: string
 *           description: Smart contract address
 *         network:
 *           type: string
 *           description: Blockchain network
 *         deployment_date:
 *           type: string
 *           format: date-time
 *         last_updated:
 *           type: string
 *           format: date-time
 */

// Validation middleware
const validateNFTCollection = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Symbol must be between 1 and 10 characters'),
  body('contractType')
    .optional()
    .isIn(['STELLAR_ASSET'])
    .withMessage('Contract type must be STELLAR_ASSET'),
  body('maxSupply')
    .optional()
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Max supply must be between 1 and 1,000,000'),
  body('mintPrice')
    .optional()
    .isDecimal()
    .withMessage('Mint price must be a valid decimal number'),
  body('network')
    .optional()
    .isIn(['stellar-mainnet', 'stellar-testnet'])
    .withMessage('Network must be stellar-mainnet or stellar-testnet'),
  body('baseTokenURI')
    .optional()
    .isURL()
    .withMessage('Base token URI must be a valid URL'),
  body('externalUrl')
    .optional()
    .isURL()
    .withMessage('External URL must be a valid URL'),
  body('image')
    .optional()
    .isURL()
    .withMessage('Image must be a valid URL')
];

const validateBrandId = [
  param('brandId')
    .isMongoId()
    .withMessage('Invalid brand ID format')
];

const validateCollectionId = [
  param('collectionId')
    .isMongoId()
    .withMessage('Invalid collection ID format')
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Error handling middleware
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
 * /brands/{brandId}/nft-collections:
 *   post:
 *     summary: Create a new NFT collection
 *     description: Creates a new NFT collection and deploys the smart contract
 *     tags: [NFT Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: brandId
 *         required: true
 *         schema:
 *           type: string
 *         description: Brand ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NFTCollectionRequest'
 *     responses:
 *       201:
 *         description: NFT collection created successfully
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
 *                   example: "NFT collection created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/NFTCollection'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Brand not found
 *       500:
 *         description: Internal server error
 */
router.post('/brands/:brandId/nft-collections', 
  authenticateToken, 
  loadBrandAndCheckOwnership, 
  validateBrandId, 
  validateNFTCollection, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const { brandId } = req.params;
      const collectionData = req.body;
      const userId = req.user.id;
      
      const collection = await nftCollectionService.createNFTCollection(
        brandId, 
        collectionData, 
        userId
      );
      
      res.status(201).json({
        success: true,
        message: 'NFT collection created successfully. Stellar asset issuer account setup is in progress.',
        data: collection
      });
    } catch (error) {
      console.error('Error creating NFT collection:', error);
      res.status(error.message.includes('not found') ? 404 : 
                error.message.includes('Unauthorized') ? 403 : 500).json({
        success: false,
        message: error.message || 'Failed to create NFT collection'
      });
    }
  }
);

/**
 * @swagger
 * /brands/{brandId}/nft-collections:
 *   get:
 *     summary: Get NFT collections for a brand
 *     description: Retrieves all NFT collections associated with a specific brand
 *     tags: [NFT Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: brandId
 *         required: true
 *         schema:
 *           type: string
 *         description: Brand ID
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
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Collections retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/NFTCollectionList'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Brand not found
 *       500:
 *         description: Internal server error
 */
router.get('/brands/:brandId/nft-collections', 
  authenticateToken, 
  loadBrandAndCheckOwnership, 
  validateBrandId, 
  validatePagination, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const { brandId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await nftCollectionService.getCollectionsByBrand(brandId, page, limit);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting NFT collections:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get NFT collections'
      });
    }
  }
);

/**
 * @swagger
 * /nft-collections/{collectionId}:
 *   get:
 *     summary: Get NFT collection by ID
 *     description: Retrieves a specific NFT collection by its ID
 *     tags: [NFT Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Collection ID
 *     responses:
 *       200:
 *         description: Collection retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/NFTCollection'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Internal server error
 */
router.get('/nft-collections/:collectionId', 
  authenticateToken, 
  validateCollectionId, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const { collectionId } = req.params;
      
      const collection = await nftCollectionService.getCollectionById(collectionId);
      
      res.json({
        success: true,
        data: collection
      });
    } catch (error) {
      console.error('Error getting NFT collection:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to get NFT collection'
      });
    }
  }
);

/**
 * @swagger
 * /nft-collections/{collectionId}/stats:
 *   get:
 *     summary: Get NFT collection statistics
 *     description: Retrieves statistics for a specific NFT collection
 *     tags: [NFT Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Collection ID
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/NFTCollectionStats'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Internal server error
 */
router.get('/nft-collections/:collectionId/stats', 
  authenticateToken, 
  validateCollectionId, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const { collectionId } = req.params;
      
      const stats = await nftCollectionService.getCollectionStats(collectionId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting collection stats:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to get collection statistics'
      });
    }
  }
);

/**
 * @swagger
 * /nft-collections/{collectionId}:
 *   put:
 *     summary: Update NFT collection
 *     description: Updates an existing NFT collection (limited fields after deployment)
 *     tags: [NFT Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Collection ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               metadata:
 *                 type: object
 *                 properties:
 *                   external_url:
 *                     type: string
 *                   image:
 *                     type: string
 *     responses:
 *       200:
 *         description: Collection updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/NFTCollection'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Internal server error
 */
router.put('/nft-collections/:collectionId', 
  authenticateToken, 
  validateCollectionId, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const { collectionId } = req.params;
      const updateData = req.body;
      const userId = req.user.id;
      
      const collection = await nftCollectionService.updateCollection(
        collectionId, 
        updateData, 
        userId
      );
      
      res.json({
        success: true,
        message: 'Collection updated successfully',
        data: collection
      });
    } catch (error) {
      console.error('Error updating NFT collection:', error);
      res.status(error.message.includes('not found') ? 404 : 
                error.message.includes('Unauthorized') ? 403 : 500).json({
        success: false,
        message: error.message || 'Failed to update NFT collection'
      });
    }
  }
);

/**
 * @swagger
 * /nft-collections/{collectionId}:
 *   delete:
 *     summary: Delete NFT collection
 *     description: Deletes an NFT collection (only if not deployed)
 *     tags: [NFT Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Collection ID
 *     responses:
 *       200:
 *         description: Collection deleted successfully
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
 *                   example: "Collection deleted successfully"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Collection not found
 *       500:
 *         description: Internal server error
 */
router.delete('/nft-collections/:collectionId', 
  authenticateToken, 
  validateCollectionId, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const { collectionId } = req.params;
      const userId = req.user.id;
      
      const result = await nftCollectionService.deleteCollection(collectionId, userId);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Error deleting NFT collection:', error);
      res.status(error.message.includes('not found') ? 404 : 
                error.message.includes('Unauthorized') ? 403 : 
                error.message.includes('Cannot delete') ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to delete NFT collection'
      });
    }
  }
);

module.exports = router;