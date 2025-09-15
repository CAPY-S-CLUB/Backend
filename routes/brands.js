const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');
const User = require('../models/User');
const { authenticateToken, requireRole, requirePlatformAdmin, loadBrandOwnership } = require('../middleware/auth');
const { UploadService, uploadLogo } = require('../services/uploadService');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validateBrandCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Brand name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_&.]+$/)
    .withMessage('Brand name contains invalid characters'),
  
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('website_url')
    .optional()
    .isURL()
    .withMessage('Website URL must be valid'),
  
  body('contact_email')
    .optional()
    .isEmail()
    .withMessage('Contact email must be valid'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
    .custom((tags) => {
      if (tags && tags.length > 10) {
        throw new Error('Maximum 10 tags allowed');
      }
      if (tags && tags.some(tag => typeof tag !== 'string' || tag.length > 30)) {
        throw new Error('Each tag must be a string with maximum 30 characters');
      }
      return true;
    }),
  
  body('social_media')
    .optional()
    .isObject()
    .withMessage('Social media must be an object')
    .custom((social) => {
      if (social) {
        const allowedPlatforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'];
        const platforms = Object.keys(social);
        
        if (platforms.some(platform => !allowedPlatforms.includes(platform))) {
          throw new Error('Invalid social media platform');
        }
        
        if (platforms.some(platform => typeof social[platform] !== 'string' || social[platform].length > 200)) {
          throw new Error('Social media URLs must be strings with maximum 200 characters');
        }
      }
      return true;
    })
];

const validateBrandUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Invalid brand ID'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Brand name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_&.]+$/)
    .withMessage('Brand name contains invalid characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('website_url')
    .optional()
    .isURL()
    .withMessage('Website URL must be valid'),
  
  body('contact_email')
    .optional()
    .isEmail()
    .withMessage('Contact email must be valid'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'pending', 'suspended'])
    .withMessage('Invalid status value'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
    .custom((tags) => {
      if (tags && tags.length > 10) {
        throw new Error('Maximum 10 tags allowed');
      }
      if (tags && tags.some(tag => typeof tag !== 'string' || tag.length > 30)) {
        throw new Error('Each tag must be a string with maximum 30 characters');
      }
      return true;
    }),
  
  body('social_media')
    .optional()
    .isObject()
    .withMessage('Social media must be an object')
    .custom((social) => {
      if (social) {
        const allowedPlatforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'];
        const platforms = Object.keys(social);
        
        if (platforms.some(platform => !allowedPlatforms.includes(platform))) {
          throw new Error('Invalid social media platform');
        }
        
        if (platforms.some(platform => typeof social[platform] !== 'string' || social[platform].length > 200)) {
          throw new Error('Social media URLs must be strings with maximum 200 characters');
        }
      }
      return true;
    })
];

const validateBrandId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid brand ID')
];

// Helper function to handle validation errors
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

// GET /brands - List all brands (public endpoint with filtering)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'active',
      search,
      tags,
      admin_id
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }
    
    if (admin_id) {
      filter.admin_id = admin_id;
    }

    // Calculate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const [brands, total] = await Promise.all([
      Brand.find(filter)
        .populate('admin_id', 'email user_type')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Brand.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        brands,
        pagination: {
          current_page: pageNum,
          total_pages: Math.ceil(total / limitNum),
          total_items: total,
          items_per_page: limitNum,
          has_next: pageNum < Math.ceil(total / limitNum),
          has_prev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /brands/:id - Get single brand
router.get('/:id', validateBrandId, handleValidationErrors, async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id)
      .populate('admin_id', 'email user_type');

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    res.json({
      success: true,
      data: brand
    });

  } catch (error) {
    console.error('Error fetching brand:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /brands - Create new brand (requires authentication)
router.post('/',
  authenticateToken,
  uploadLogo,
  validateBrandCreation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, description, website_url, contact_email, tags, social_media } = req.body;
      const userId = req.user._id;

      // Check if user can create brands
      if (req.user.user_type !== 'platform_admin' && req.user.user_type !== 'community_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can create brands'
        });
      }

      // Check if brand name already exists
      const existingBrand = await Brand.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
      });
      
      if (existingBrand) {
        // If file was uploaded, clean it up
        if (req.file && req.file.location) {
          await UploadService.deleteFile(req.file.location);
        }
        
        return res.status(409).json({
          success: false,
          message: 'Brand name already exists'
        });
      }

      // Prepare brand data
      const brandData = {
        name,
        description,
        admin_id: userId,
        website_url,
        contact_email,
        tags: tags || [],
        social_media: social_media || {},
        status: req.user.user_type === 'platform_admin' ? 'active' : 'pending'
      };

      // Add logo URL if file was uploaded
      if (req.file && req.file.location) {
        brandData.logo_url = req.file.location;
      }

      // Create brand
      const brand = new Brand(brandData);
      await brand.save();

      // Populate admin info for response
      await brand.populate('admin_id', 'email user_type');

      res.status(201).json({
        success: true,
        message: 'Brand created successfully',
        data: brand
      });

    } catch (error) {
      console.error('Error creating brand:', error);
      
      // Clean up uploaded file if error occurs
      if (req.file && req.file.location) {
        await UploadService.deleteFile(req.file.location);
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// PUT /brands/:id - Update brand (requires ownership or platform admin)
router.put('/:id',
  authenticateToken,
  loadBrandOwnership,
  uploadLogo,
  validateBrandUpdate,
  handleValidationErrors,
  async (req, res) => {
    try {
      const brandId = req.params.id;
      const updateData = req.body;
      const currentBrand = req.brand;

      // Check permissions
      if (!currentBrand.canBeModifiedBy(req.user)) {
        // Clean up uploaded file if no permission
        if (req.file && req.file.location) {
          await UploadService.deleteFile(req.file.location);
        }
        
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to modify this brand'
        });
      }

      // Check if new name conflicts with existing brands
      if (updateData.name) {
        const existingBrand = await Brand.findOne({
          name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
          _id: { $ne: brandId }
        });
        
        if (existingBrand) {
          // Clean up uploaded file if name conflict
          if (req.file && req.file.location) {
            await UploadService.deleteFile(req.file.location);
          }
          
          return res.status(409).json({
            success: false,
            message: 'Brand name already exists'
          });
        }
      }

      // Handle logo update
      if (req.file && req.file.location) {
        // Delete old logo if it exists
        if (currentBrand.logo_url) {
          await UploadService.deleteFile(currentBrand.logo_url);
        }
        updateData.logo_url = req.file.location;
      }

      // Only platform admins can change status
      if (updateData.status && req.user.user_type !== 'platform_admin') {
        delete updateData.status;
      }

      // Update brand
      const updatedBrand = await Brand.findByIdAndUpdate(
        brandId,
        { ...updateData, updated_at: new Date() },
        { new: true, runValidators: true }
      ).populate('admin_id', 'email user_type');

      res.json({
        success: true,
        message: 'Brand updated successfully',
        data: updatedBrand
      });

    } catch (error) {
      console.error('Error updating brand:', error);
      
      // Clean up uploaded file if error occurs
      if (req.file && req.file.location) {
        await UploadService.deleteFile(req.file.location);
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// DELETE /brands/:id - Delete brand (requires ownership or platform admin)
router.delete('/:id',
  authenticateToken,
  loadBrandOwnership,
  validateBrandId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const brandId = req.params.id;
      const currentBrand = req.brand;

      // Check permissions
      if (!currentBrand.canBeModifiedBy(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this brand'
        });
      }

      // Delete logo from S3 if it exists
      if (currentBrand.logo_url) {
        await UploadService.deleteFile(currentBrand.logo_url);
      }

      // Delete brand from database
      await Brand.findByIdAndDelete(brandId);

      res.json({
        success: true,
        message: 'Brand deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting brand:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// GET /brands/:id/stats - Get brand statistics (requires ownership or platform admin)
router.get('/:id/stats',
  authenticateToken,
  loadBrandOwnership,
  validateBrandId,
  handleValidationErrors,
  async (req, res) => {
    try {
      const currentBrand = req.brand;

      // Check permissions
      if (!currentBrand.canBeModifiedBy(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this brand statistics'
        });
      }

      // Here you would typically gather statistics from other collections
      // For now, return basic brand info
      const stats = {
        brand_id: currentBrand._id,
        name: currentBrand.name,
        status: currentBrand.status,
        created_at: currentBrand.created_at,
        updated_at: currentBrand.updated_at,
        // Add more statistics as needed
        // members_count: await Member.countDocuments({ brand_id: currentBrand._id }),
        // events_count: await Event.countDocuments({ brand_id: currentBrand._id }),
        // etc.
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error fetching brand statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

module.exports = router;