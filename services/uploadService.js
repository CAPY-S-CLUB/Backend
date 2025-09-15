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

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, GIF, WebP, SVG) are allowed!'), false);
  }
};

// Generate unique filename
const generateFileName = (originalname) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(6).toString('hex');
  const extension = path.extname(originalname);
  return `logos/${timestamp}-${randomString}${extension}`;
};

// Multer S3 configuration
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'public-read',
    key: function (req, file, cb) {
      const fileName = generateFileName(file.originalname);
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: req.user ? req.user._id.toString() : 'anonymous',
        uploadedAt: new Date().toISOString()
      });
    }
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only one file at a time
  }
});

// Upload middleware for single logo file
const uploadLogo = upload.single('logo');

// Service functions
class UploadService {
  // Upload logo with error handling
  static uploadLogoFile(req, res, next) {
    uploadLogo(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 5MB.'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Only one file is allowed.'
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

  // Delete file from S3
  static async deleteFile(fileUrl) {
    try {
      if (!fileUrl) return true;

      // Extract key from URL
      const urlParts = fileUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part.includes(process.env.S3_BUCKET_NAME));
      
      if (bucketIndex === -1) {
        console.warn('Could not extract S3 key from URL:', fileUrl);
        return false;
      }

      const key = urlParts.slice(bucketIndex + 1).join('/');

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key
      };

      await s3.deleteObject(params).promise();
      console.log('File deleted successfully:', key);
      return true;

    } catch (error) {
      console.error('Error deleting file from S3:', error);
      return false;
    }
  }

  // Get signed URL for private files (if needed)
  static getSignedUrl(key, expires = 3600) {
    try {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Expires: expires
      };

      return s3.getSignedUrl('getObject', params);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  // Validate S3 configuration
  static validateS3Config() {
    const requiredEnvVars = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'S3_BUCKET_NAME'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return true;
  }

  // Test S3 connection
  static async testS3Connection() {
    try {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME
      };

      await s3.headBucket(params).promise();
      console.log('S3 connection successful');
      return true;
    } catch (error) {
      console.error('S3 connection failed:', error.message);
      return false;
    }
  }

  // Get file info from S3
  static async getFileInfo(key) {
    try {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key
      };

      const data = await s3.headObject(params).promise();
      return {
        size: data.ContentLength,
        lastModified: data.LastModified,
        contentType: data.ContentType,
        metadata: data.Metadata
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  // List files in bucket (for admin purposes)
  static async listFiles(prefix = 'logos/', maxKeys = 100) {
    try {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      const data = await s3.listObjectsV2(params).promise();
      return data.Contents.map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`
      }));
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }
}

// Initialize and validate configuration on module load
try {
  UploadService.validateS3Config();
  console.log('S3 configuration validated successfully');
} catch (error) {
  console.warn('S3 configuration warning:', error.message);
  console.warn('File upload functionality may not work properly');
}

module.exports = {
  UploadService,
  uploadLogo: UploadService.uploadLogoFile
};