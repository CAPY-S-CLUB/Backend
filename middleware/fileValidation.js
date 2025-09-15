const { ProductUploadService } = require('../services/productUploadService');
const path = require('path');

// Advanced file validation middleware
const validateFileUploads = (options = {}) => {
  return (req, res, next) => {
    try {
      const {
        requireFiles = false,
        maxTotalSize = 500 * 1024 * 1024, // 500MB total
        allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm'],
        maxImageSize = 10 * 1024 * 1024, // 10MB
        maxVideoSize = 100 * 1024 * 1024, // 100MB
        maxImageCount = 10,
        maxVideoCount = 5
      } = options;

      // Check if files are required
      if (requireFiles && (!req.files || (!req.files.images && !req.files.videos))) {
        return res.status(400).json({
          success: false,
          message: 'At least one image or video file is required'
        });
      }

      // If no files uploaded and not required, continue
      if (!req.files || (!req.files.images && !req.files.videos)) {
        return next();
      }

      const errors = [];
      let totalSize = 0;
      let imageCount = 0;
      let videoCount = 0;

      // Validate images
      if (req.files.images) {
        imageCount = req.files.images.length;
        
        if (imageCount > maxImageCount) {
          errors.push(`Too many images. Maximum ${maxImageCount} images allowed.`);
        }

        req.files.images.forEach((file, index) => {
          totalSize += file.size;
          
          // Validate file type
          if (!allowedImageTypes.includes(file.mimetype)) {
            errors.push(`Image ${index + 1}: Invalid file type '${file.mimetype}'. Allowed types: ${allowedImageTypes.join(', ')}`);
          }
          
          // Validate file extension
          const extension = path.extname(file.originalname).toLowerCase();
          const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
          if (!validExtensions.includes(extension)) {
            errors.push(`Image ${index + 1}: Invalid file extension '${extension}'. Allowed extensions: ${validExtensions.join(', ')}`);
          }
          
          // Validate file size
          if (file.size > maxImageSize) {
            errors.push(`Image ${index + 1}: File too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is ${maxImageSize / (1024 * 1024)}MB.`);
          }
          
          // Validate file name
          if (!file.originalname || file.originalname.trim() === '') {
            errors.push(`Image ${index + 1}: Invalid file name.`);
          }
          
          // Check for potentially malicious file names
          if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
            errors.push(`Image ${index + 1}: Invalid characters in file name.`);
          }
          
          // Validate minimum file size (to avoid empty files)
          if (file.size < 100) { // 100 bytes minimum
            errors.push(`Image ${index + 1}: File too small. Minimum size is 100 bytes.`);
          }
        });
      }

      // Validate videos
      if (req.files.videos) {
        videoCount = req.files.videos.length;
        
        if (videoCount > maxVideoCount) {
          errors.push(`Too many videos. Maximum ${maxVideoCount} videos allowed.`);
        }

        req.files.videos.forEach((file, index) => {
          totalSize += file.size;
          
          // Validate file type
          if (!allowedVideoTypes.includes(file.mimetype)) {
            errors.push(`Video ${index + 1}: Invalid file type '${file.mimetype}'. Allowed types: ${allowedVideoTypes.join(', ')}`);
          }
          
          // Validate file extension
          const extension = path.extname(file.originalname).toLowerCase();
          const validExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'];
          if (!validExtensions.includes(extension)) {
            errors.push(`Video ${index + 1}: Invalid file extension '${extension}'. Allowed extensions: ${validExtensions.join(', ')}`);
          }
          
          // Validate file size
          if (file.size > maxVideoSize) {
            errors.push(`Video ${index + 1}: File too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is ${maxVideoSize / (1024 * 1024)}MB.`);
          }
          
          // Validate file name
          if (!file.originalname || file.originalname.trim() === '') {
            errors.push(`Video ${index + 1}: Invalid file name.`);
          }
          
          // Check for potentially malicious file names
          if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
            errors.push(`Video ${index + 1}: Invalid characters in file name.`);
          }
          
          // Validate minimum file size
          if (file.size < 1000) { // 1KB minimum for videos
            errors.push(`Video ${index + 1}: File too small. Minimum size is 1KB.`);
          }
        });
      }

      // Validate total upload size
      if (totalSize > maxTotalSize) {
        errors.push(`Total upload size too large (${(totalSize / (1024 * 1024)).toFixed(2)}MB). Maximum total size is ${maxTotalSize / (1024 * 1024)}MB.`);
      }

      // Check for duplicate file names
      const allFiles = [...(req.files.images || []), ...(req.files.videos || [])];
      const fileNames = allFiles.map(file => file.originalname.toLowerCase());
      const duplicateNames = fileNames.filter((name, index) => fileNames.indexOf(name) !== index);
      if (duplicateNames.length > 0) {
        errors.push(`Duplicate file names detected: ${[...new Set(duplicateNames)].join(', ')}`);
      }

      // If there are validation errors, return them
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'File validation failed',
          errors,
          details: {
            total_files: allFiles.length,
            image_count: imageCount,
            video_count: videoCount,
            total_size_mb: (totalSize / (1024 * 1024)).toFixed(2)
          }
        });
      }

      // Add file summary to request for logging
      req.fileValidation = {
        total_files: allFiles.length,
        image_count: imageCount,
        video_count: videoCount,
        total_size_mb: (totalSize / (1024 * 1024)).toFixed(2),
        validated_at: new Date().toISOString()
      };

      next();
    } catch (error) {
      console.error('File validation error:', error);
      res.status(500).json({
        success: false,
        message: 'File validation error',
        error: error.message
      });
    }
  };
};

// Middleware to validate file content (basic security check)
const validateFileContent = (req, res, next) => {
  try {
    if (!req.files || (!req.files.images && !req.files.videos)) {
      return next();
    }

    const allFiles = [...(req.files.images || []), ...(req.files.videos || [])];
    const suspiciousPatterns = [
      /<script[^>]*>/i,
      /<iframe[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i
    ];

    for (const file of allFiles) {
      // Check file name for suspicious patterns
      const fileName = file.originalname.toLowerCase();
      
      // Check for executable extensions
      const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.php', '.asp', '.jsp'];
      const hasDoubleExtension = fileName.split('.').length > 2;
      const hasDangerousExtension = dangerousExtensions.some(ext => fileName.endsWith(ext));
      
      if (hasDangerousExtension) {
        return res.status(400).json({
          success: false,
          message: `Potentially dangerous file detected: ${file.originalname}. Executable files are not allowed.`
        });
      }
      
      if (hasDoubleExtension) {
        return res.status(400).json({
          success: false,
          message: `Suspicious file name detected: ${file.originalname}. Files with multiple extensions are not allowed.`
        });
      }
      
      // For text-based files, check content for suspicious patterns
      if (file.buffer) {
        const content = file.buffer.toString('utf8', 0, Math.min(file.buffer.length, 1024)); // Check first 1KB
        
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(content)) {
            return res.status(400).json({
              success: false,
              message: `Potentially malicious content detected in file: ${file.originalname}`
            });
          }
        }
      }
    }

    next();
  } catch (error) {
    console.error('File content validation error:', error);
    res.status(500).json({
      success: false,
      message: 'File content validation error'
    });
  }
};

// Middleware to log file upload attempts
const logFileUploads = (req, res, next) => {
  if (req.files && (req.files.images || req.files.videos)) {
    const imageCount = req.files.images ? req.files.images.length : 0;
    const videoCount = req.files.videos ? req.files.videos.length : 0;
    const totalSize = [...(req.files.images || []), ...(req.files.videos || [])]
      .reduce((sum, file) => sum + file.size, 0);
    
    console.log(`File upload attempt:`, {
      user_id: req.user ? req.user._id : 'anonymous',
      endpoint: req.originalUrl,
      method: req.method,
      image_count: imageCount,
      video_count: videoCount,
      total_size_mb: (totalSize / (1024 * 1024)).toFixed(2),
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress
    });
  }
  
  next();
};

// Combined validation middleware for products
const validateProductFiles = [
  logFileUploads,
  validateFileContent,
  validateFileUploads({
    requireFiles: false, // Files are optional for updates
    maxTotalSize: 500 * 1024 * 1024, // 500MB total
    maxImageCount: 10,
    maxVideoCount: 5
  })
];

// Validation for required files (e.g., new product creation)
const validateRequiredProductFiles = [
  logFileUploads,
  validateFileContent,
  validateFileUploads({
    requireFiles: true, // At least one file required
    maxTotalSize: 500 * 1024 * 1024, // 500MB total
    maxImageCount: 10,
    maxVideoCount: 5
  })
];

module.exports = {
  validateFileUploads,
  validateFileContent,
  logFileUploads,
  validateProductFiles,
  validateRequiredProductFiles
};