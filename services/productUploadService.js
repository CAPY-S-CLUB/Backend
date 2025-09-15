const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const crypto = require('crypto');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();

// File type configurations
const FILE_TYPES = {
  images: {
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    extensions: /\.(jpg|jpeg|png|gif|webp)$/i,
    maxSize: 10 * 1024 * 1024, // 10MB
    maxCount: 10,
    folder: 'products/images'
  },
  videos: {
    mimeTypes: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm'],
    extensions: /\.(mp4|avi|mov|wmv|flv|webm)$/i,
    maxSize: 100 * 1024 * 1024, // 100MB
    maxCount: 5,
    folder: 'products/videos'
  }
};

// Enhanced file filter function
const createFileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    const isValidMimeType = allowedTypes.mimeTypes.includes(file.mimetype);
    const isValidExtension = allowedTypes.extensions.test(path.extname(file.originalname).toLowerCase());
    
    if (isValidMimeType && isValidExtension) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.mimeTypes.join(', ')}`), false);
    }
  };
};

// Generate unique filename with proper folder structure
const generateFileName = (originalname, folder, productId) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname).toLowerCase();
  const sanitizedName = path.basename(originalname, extension).replace(/[^a-zA-Z0-9]/g, '-');
  
  return `${folder}/${productId}/${timestamp}-${randomString}-${sanitizedName}${extension}`;
};

// Create multer configuration for different file types
const createMulterConfig = (fileType) => {
  const typeConfig = FILE_TYPES[fileType];
  
  return multer({
    storage: multerS3({
      s3: s3,
      bucket: process.env.S3_BUCKET_NAME,
      acl: 'public-read',
      key: function (req, file, cb) {
        const productId = req.params.id || req.body.productId || 'temp';
        const fileName = generateFileName(file.originalname, typeConfig.folder, productId);
        cb(null, fileName);
      },
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function (req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
          originalName: file.originalname,
          fileType: fileType,
          uploadedBy: req.user ? req.user._id.toString() : 'anonymous',
          uploadedAt: new Date().toISOString(),
          productId: req.params.id || req.body.productId || 'temp'
        });
      }
    }),
    fileFilter: createFileFilter(typeConfig),
    limits: {
      fileSize: typeConfig.maxSize,
      files: typeConfig.maxCount
    }
  });
};

// Create upload middleware for images and videos
const uploadImages = createMulterConfig('images').array('images', FILE_TYPES.images.maxCount);
const uploadVideos = createMulterConfig('videos').array('videos', FILE_TYPES.videos.maxCount);

// Combined upload middleware for both images and videos
const uploadProductMedia = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'public-read',
    key: function (req, file, cb) {
      const productId = req.params.id || req.body.productId || 'temp';
      let folder;
      
      // Determine folder based on file type
      if (FILE_TYPES.images.mimeTypes.includes(file.mimetype)) {
        folder = FILE_TYPES.images.folder;
      } else if (FILE_TYPES.videos.mimeTypes.includes(file.mimetype)) {
        folder = FILE_TYPES.videos.folder;
      } else {
        return cb(new Error('Unsupported file type'), null);
      }
      
      const fileName = generateFileName(file.originalname, folder, productId);
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      const fileType = FILE_TYPES.images.mimeTypes.includes(file.mimetype) ? 'image' : 'video';
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        fileType: fileType,
        uploadedBy: req.user ? req.user._id.toString() : 'anonymous',
        uploadedAt: new Date().toISOString(),
        productId: req.params.id || req.body.productId || 'temp'
      });
    }
  }),
  fileFilter: (req, file, cb) => {
    const isImage = FILE_TYPES.images.mimeTypes.includes(file.mimetype) && 
                   FILE_TYPES.images.extensions.test(path.extname(file.originalname).toLowerCase());
    const isVideo = FILE_TYPES.videos.mimeTypes.includes(file.mimetype) && 
                   FILE_TYPES.videos.extensions.test(path.extname(file.originalname).toLowerCase());
    
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  },
  limits: {
    fileSize: Math.max(FILE_TYPES.images.maxSize, FILE_TYPES.videos.maxSize),
    files: FILE_TYPES.images.maxCount + FILE_TYPES.videos.maxCount
  }
}).fields([
  { name: 'images', maxCount: FILE_TYPES.images.maxCount },
  { name: 'videos', maxCount: FILE_TYPES.videos.maxCount }
]);

class ProductUploadService {
  // Upload product media with error handling
  static uploadProductMediaFiles(req, res, next) {
    uploadProductMedia(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 100MB for videos and 10MB for images.'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 10 images and 5 videos allowed.'
          });
        }
        if (err.code === 'LIMIT_FIELD_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many fields in the request.'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  }

  // Process uploaded files and return organized URLs
  static processUploadedFiles(req) {
    const result = {
      images_urls: [],
      videos_urls: [],
      uploadedFiles: []
    };

    if (req.files) {
      // Process images
      if (req.files.images) {
        req.files.images.forEach(file => {
          result.images_urls.push(file.location);
          result.uploadedFiles.push({
            type: 'image',
            url: file.location,
            key: file.key,
            size: file.size,
            originalName: file.originalname
          });
        });
      }

      // Process videos
      if (req.files.videos) {
        req.files.videos.forEach(file => {
          result.videos_urls.push(file.location);
          result.uploadedFiles.push({
            type: 'video',
            url: file.location,
            key: file.key,
            size: file.size,
            originalName: file.originalname
          });
        });
      }
    }

    return result;
  }

  // Delete multiple files from S3
  static async deleteMultipleFiles(fileUrls) {
    if (!fileUrls || fileUrls.length === 0) return true;

    const deletePromises = fileUrls.map(url => this.deleteFile(url));
    const results = await Promise.allSettled(deletePromises);
    
    const failedDeletions = results.filter(result => result.status === 'rejected');
    if (failedDeletions.length > 0) {
      console.warn(`Failed to delete ${failedDeletions.length} files:`, failedDeletions);
    }

    return failedDeletions.length === 0;
  }

  // Delete single file from S3
  static async deleteFile(fileUrl) {
    try {
      if (!fileUrl) return true;

      // Extract key from URL
      const urlParts = fileUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part.includes(process.env.S3_BUCKET_NAME));
      
      if (bucketIndex === -1) {
        // Try alternative URL format
        const amazonIndex = urlParts.findIndex(part => part.includes('amazonaws.com'));
        if (amazonIndex === -1) {
          console.warn('Could not extract S3 key from URL:', fileUrl);
          return false;
        }
        
        // Extract key from amazonaws.com URL format
        const key = urlParts.slice(amazonIndex + 1).join('/');
        return await this.deleteFileByKey(key);
      }

      const key = urlParts.slice(bucketIndex + 1).join('/');
      return await this.deleteFileByKey(key);

    } catch (error) {
      console.error('Error deleting file from S3:', error);
      return false;
    }
  }

  // Delete file by S3 key
  static async deleteFileByKey(key) {
    try {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key
      };

      await s3.deleteObject(params).promise();
      console.log('File deleted successfully:', key);
      return true;

    } catch (error) {
      console.error('Error deleting file by key:', error);
      return false;
    }
  }

  // Delete all files in a product folder
  static async deleteProductFolder(productId) {
    try {
      const folders = ['products/images', 'products/videos'];
      const deletePromises = folders.map(folder => this.deleteFolderContents(`${folder}/${productId}/`));
      
      const results = await Promise.allSettled(deletePromises);
      const failedDeletions = results.filter(result => result.status === 'rejected');
      
      return failedDeletions.length === 0;
    } catch (error) {
      console.error('Error deleting product folder:', error);
      return false;
    }
  }

  // Delete all files in a folder
  static async deleteFolderContents(prefix) {
    try {
      const listParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: prefix
      };

      const listedObjects = await s3.listObjectsV2(listParams).promise();
      
      if (listedObjects.Contents.length === 0) return true;

      const deleteParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Delete: {
          Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
        }
      };

      await s3.deleteObjects(deleteParams).promise();
      console.log(`Deleted ${listedObjects.Contents.length} files from ${prefix}`);
      
      // If there are more objects, recursively delete them
      if (listedObjects.IsTruncated) {
        await this.deleteFolderContents(prefix);
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting folder contents:', error);
      return false;
    }
  }

  // Validate file types and sizes
  static validateFiles(files) {
    const errors = [];
    
    if (!files || (!files.images && !files.videos)) {
      return { isValid: false, errors: ['No files provided'] };
    }

    // Validate images
    if (files.images) {
      if (files.images.length > FILE_TYPES.images.maxCount) {
        errors.push(`Too many images. Maximum ${FILE_TYPES.images.maxCount} allowed.`);
      }
      
      files.images.forEach((file, index) => {
        if (file.size > FILE_TYPES.images.maxSize) {
          errors.push(`Image ${index + 1} is too large. Maximum size is ${FILE_TYPES.images.maxSize / (1024 * 1024)}MB.`);
        }
      });
    }

    // Validate videos
    if (files.videos) {
      if (files.videos.length > FILE_TYPES.videos.maxCount) {
        errors.push(`Too many videos. Maximum ${FILE_TYPES.videos.maxCount} allowed.`);
      }
      
      files.videos.forEach((file, index) => {
        if (file.size > FILE_TYPES.videos.maxSize) {
          errors.push(`Video ${index + 1} is too large. Maximum size is ${FILE_TYPES.videos.maxSize / (1024 * 1024)}MB.`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Get file type configuration
  static getFileTypeConfig() {
    return FILE_TYPES;
  }
}

module.exports = {
  ProductUploadService,
  uploadProductMedia: ProductUploadService.uploadProductMediaFiles,
  FILE_TYPES
};