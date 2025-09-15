const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Community = require('../models/Community');
const { ProductUploadService } = require('../services/productUploadService');
const { authenticateToken } = require('../middleware/auth');
const { validateCommunityAdmin } = require('../middleware/communityAuth');
const mongoose = require('mongoose');

// Middleware to validate product ownership
const validateProductOwnership = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    // Find the product
    const product = await Product.findById(productId).populate('community_id');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user is admin of the community that owns this product
    const community = product.community_id;
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    if (community.admin_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only modify products from your own community.'
      });
    }

    req.product = product;
    req.community = community;
    next();
  } catch (error) {
    console.error('Error validating product ownership:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// GET /products - List all products with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      community_id,
      exclusive_to_members,
      status = 'active',
      search,
      sort_by = 'created_at',
      sort_order = 'desc',
      min_price,
      max_price,
      tags
    } = req.query;

    // Build filter object
    const filter = { status };
    
    if (community_id) {
      if (!mongoose.Types.ObjectId.isValid(community_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid community ID format'
        });
      }
      filter.community_id = community_id;
    }
    
    if (exclusive_to_members !== undefined) {
      filter.exclusive_to_members = exclusive_to_members === 'true';
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    if (min_price || max_price) {
      filter.price = {};
      if (min_price) filter.price.$gte = parseFloat(min_price);
      if (max_price) filter.price.$lte = parseFloat(max_price);
    }
    
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      filter.tags = { $in: tagArray };
    }

    // Build sort object
    const sortOrder = sort_order === 'asc' ? 1 : -1;
    const sortObj = { [sort_by]: sortOrder };

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Execute query
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('community_id', 'name description')
        .populate('created_by', 'username email')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(filter)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: limitNum,
          has_next_page: hasNextPage,
          has_prev_page: hasPrevPage
        }
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// GET /products/:id - Get single product
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(productId)
      .populate('community_id', 'name description admin_id')
      .populate('created_by', 'username email');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment view count
    await Product.findByIdAndUpdate(productId, { $inc: { view_count: 1 } });

    res.json({
      success: true,
      data: { product }
    });

  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /products - Create new product with file uploads
router.post('/', 
  authenticateToken,
  validateCommunityAdmin,
  ProductUploadService.uploadProductMediaFiles,
  async (req, res) => {
    try {
      const {
        name,
        description,
        details_json,
        community_id,
        exclusive_to_members = false,
        price,
        currency = 'USD',
        tags
      } = req.body;

      // Validate required fields
      if (!name || !description || !community_id) {
        // Clean up uploaded files if validation fails
        if (req.files) {
          const uploadedFiles = ProductUploadService.processUploadedFiles(req);
          await ProductUploadService.deleteMultipleFiles([
            ...uploadedFiles.images_urls,
            ...uploadedFiles.videos_urls
          ]);
        }
        
        return res.status(400).json({
          success: false,
          message: 'Name, description, and community_id are required'
        });
      }

      // Validate community_id format
      if (!mongoose.Types.ObjectId.isValid(community_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid community ID format'
        });
      }

      // Verify community exists and user is admin
      const community = await Community.findById(community_id);
      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found'
        });
      }

      if (community.admin_id.toString() !== req.user._id.toString()) {
        // Clean up uploaded files if authorization fails
        if (req.files) {
          const uploadedFiles = ProductUploadService.processUploadedFiles(req);
          await ProductUploadService.deleteMultipleFiles([
            ...uploadedFiles.images_urls,
            ...uploadedFiles.videos_urls
          ]);
        }
        
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only create products for your own community.'
        });
      }

      // Process uploaded files
      const uploadedFiles = ProductUploadService.processUploadedFiles(req);

      // Parse details_json if provided
      let parsedDetails = {};
      if (details_json) {
        try {
          parsedDetails = typeof details_json === 'string' ? JSON.parse(details_json) : details_json;
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid JSON format in details_json'
          });
        }
      }

      // Parse tags if provided
      let parsedTags = [];
      if (tags) {
        if (typeof tags === 'string') {
          parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        } else if (Array.isArray(tags)) {
          parsedTags = tags;
        }
      }

      // Create product
      const productData = {
        name: name.trim(),
        description: description.trim(),
        images_urls: uploadedFiles.images_urls,
        videos_urls: uploadedFiles.videos_urls,
        details_json: parsedDetails,
        community_id,
        exclusive_to_members: exclusive_to_members === 'true' || exclusive_to_members === true,
        created_by: req.user._id,
        status: 'active',
        tags: parsedTags
      };

      // Add price if provided
      if (price !== undefined && price !== null && price !== '') {
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
          return res.status(400).json({
            success: false,
            message: 'Price must be a valid positive number'
          });
        }
        productData.price = numPrice;
        productData.currency = currency;
      }

      const product = new Product(productData);
      await product.save();

      // Populate the created product
      const populatedProduct = await Product.findById(product._id)
        .populate('community_id', 'name description')
        .populate('created_by', 'username email');

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: {
          product: populatedProduct,
          uploaded_files: {
            images_count: uploadedFiles.images_urls.length,
            videos_count: uploadedFiles.videos_urls.length,
            total_files: uploadedFiles.uploadedFiles.length
          }
        }
      });

    } catch (error) {
      console.error('Error creating product:', error);
      
      // Clean up uploaded files on error
      if (req.files) {
        try {
          const uploadedFiles = ProductUploadService.processUploadedFiles(req);
          await ProductUploadService.deleteMultipleFiles([
            ...uploadedFiles.images_urls,
            ...uploadedFiles.videos_urls
          ]);
        } catch (cleanupError) {
          console.error('Error cleaning up files:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// PUT /products/:id - Update product
router.put('/:id',
  authenticateToken,
  validateProductOwnership,
  ProductUploadService.uploadProductMediaFiles,
  async (req, res) => {
    try {
      const {
        name,
        description,
        details_json,
        exclusive_to_members,
        price,
        currency,
        tags,
        status,
        remove_images,
        remove_videos
      } = req.body;

      const product = req.product;
      const updateData = {};

      // Update basic fields
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description.trim();
      if (exclusive_to_members !== undefined) {
        updateData.exclusive_to_members = exclusive_to_members === 'true' || exclusive_to_members === true;
      }
      if (status !== undefined && ['active', 'inactive', 'draft'].includes(status)) {
        updateData.status = status;
      }

      // Update price
      if (price !== undefined) {
        if (price === null || price === '') {
          updateData.price = undefined;
          updateData.currency = undefined;
        } else {
          const numPrice = parseFloat(price);
          if (isNaN(numPrice) || numPrice < 0) {
            return res.status(400).json({
              success: false,
              message: 'Price must be a valid positive number'
            });
          }
          updateData.price = numPrice;
          updateData.currency = currency || 'USD';
        }
      }

      // Parse and update details_json
      if (details_json !== undefined) {
        try {
          updateData.details_json = typeof details_json === 'string' ? JSON.parse(details_json) : details_json;
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid JSON format in details_json'
          });
        }
      }

      // Parse and update tags
      if (tags !== undefined) {
        if (typeof tags === 'string') {
          updateData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        } else if (Array.isArray(tags)) {
          updateData.tags = tags;
        }
      }

      // Handle file removals
      let imagesToRemove = [];
      let videosToRemove = [];
      
      if (remove_images) {
        imagesToRemove = typeof remove_images === 'string' ? 
          remove_images.split(',').map(url => url.trim()) : 
          remove_images;
        
        updateData.images_urls = product.images_urls.filter(url => !imagesToRemove.includes(url));
      }
      
      if (remove_videos) {
        videosToRemove = typeof remove_videos === 'string' ? 
          remove_videos.split(',').map(url => url.trim()) : 
          remove_videos;
        
        updateData.videos_urls = product.videos_urls.filter(url => !videosToRemove.includes(url));
      }

      // Process new uploaded files
      const uploadedFiles = ProductUploadService.processUploadedFiles(req);
      
      if (uploadedFiles.images_urls.length > 0) {
        updateData.images_urls = [...(updateData.images_urls || product.images_urls), ...uploadedFiles.images_urls];
      }
      
      if (uploadedFiles.videos_urls.length > 0) {
        updateData.videos_urls = [...(updateData.videos_urls || product.videos_urls), ...uploadedFiles.videos_urls];
      }

      // Update the product
      updateData.updated_at = new Date();
      const updatedProduct = await Product.findByIdAndUpdate(
        product._id,
        updateData,
        { new: true, runValidators: true }
      ).populate('community_id', 'name description')
       .populate('created_by', 'username email');

      // Delete removed files from S3
      const filesToDelete = [...imagesToRemove, ...videosToRemove];
      if (filesToDelete.length > 0) {
        await ProductUploadService.deleteMultipleFiles(filesToDelete);
      }

      res.json({
        success: true,
        message: 'Product updated successfully',
        data: {
          product: updatedProduct,
          changes: {
            files_added: uploadedFiles.uploadedFiles.length,
            files_removed: filesToDelete.length,
            images_count: updatedProduct.images_urls.length,
            videos_count: updatedProduct.videos_urls.length
          }
        }
      });

    } catch (error) {
      console.error('Error updating product:', error);
      
      // Clean up newly uploaded files on error
      if (req.files) {
        try {
          const uploadedFiles = ProductUploadService.processUploadedFiles(req);
          await ProductUploadService.deleteMultipleFiles([
            ...uploadedFiles.images_urls,
            ...uploadedFiles.videos_urls
          ]);
        } catch (cleanupError) {
          console.error('Error cleaning up files:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// DELETE /products/:id - Delete product and associated files
router.delete('/:id',
  authenticateToken,
  validateProductOwnership,
  async (req, res) => {
    try {
      const product = req.product;
      
      // Collect all file URLs to delete
      const filesToDelete = [
        ...product.images_urls,
        ...product.videos_urls
      ];

      // Delete the product from database
      await Product.findByIdAndDelete(product._id);

      // Delete all associated files from S3
      let filesDeleted = false;
      if (filesToDelete.length > 0) {
        filesDeleted = await ProductUploadService.deleteMultipleFiles(filesToDelete);
        
        // Also try to delete the entire product folder
        await ProductUploadService.deleteProductFolder(product._id.toString());
      }

      res.json({
        success: true,
        message: 'Product deleted successfully',
        data: {
          deleted_product_id: product._id,
          files_deleted: filesToDelete.length,
          cloud_cleanup_success: filesDeleted
        }
      });

    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// POST /products/:id/like - Like/unlike product
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Toggle like
    const isLiked = product.liked_by && product.liked_by.includes(userId);
    
    if (isLiked) {
      // Unlike
      await Product.findByIdAndUpdate(productId, {
        $pull: { liked_by: userId },
        $inc: { like_count: -1 }
      });
    } else {
      // Like
      await Product.findByIdAndUpdate(productId, {
        $addToSet: { liked_by: userId },
        $inc: { like_count: 1 }
      });
    }

    const updatedProduct = await Product.findById(productId)
      .populate('community_id', 'name')
      .select('name like_count liked_by');

    res.json({
      success: true,
      message: isLiked ? 'Product unliked' : 'Product liked',
      data: {
        product: updatedProduct,
        is_liked: !isLiked
      }
    });

  } catch (error) {
    console.error('Error toggling product like:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;