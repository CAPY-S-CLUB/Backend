const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    maxlength: [1000, 'Product description cannot exceed 1000 characters']
  },
  images_urls: {
    type: [String],
    default: [],
    validate: {
      validator: function(urls) {
        return urls.length <= 10; // Maximum 10 images
      },
      message: 'Cannot have more than 10 images'
    }
  },
  videos_urls: {
    type: [String],
    default: [],
    validate: {
      validator: function(urls) {
        return urls.length <= 5; // Maximum 5 videos
      },
      message: 'Cannot have more than 5 videos'
    }
  },
  details_json: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    validate: {
      validator: function(details) {
        // Validate that details_json is a valid object and not too large
        return typeof details === 'object' && JSON.stringify(details).length <= 10000;
      },
      message: 'Product details must be a valid object and cannot exceed 10KB'
    }
  },
  community_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: [true, 'Community ID is required'],
    index: true
  },
  exclusive_to_members: {
    type: Boolean,
    default: false
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator ID is required']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
    default: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'BRL', 'XLM']
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function(tags) {
        return tags.length <= 20; // Maximum 20 tags
      },
      message: 'Cannot have more than 20 tags'
    }
  },
  view_count: {
    type: Number,
    default: 0,
    min: 0
  },
  like_count: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
productSchema.index({ community_id: 1, status: 1 });
productSchema.index({ created_by: 1 });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ tags: 1 });
productSchema.index({ createdAt: -1 });

// Virtual for total media count
productSchema.virtual('total_media_count').get(function() {
  return this.images_urls.length + this.videos_urls.length;
});

// Virtual for community reference
productSchema.virtual('community', {
  ref: 'Community',
  localField: 'community_id',
  foreignField: '_id',
  justOne: true
});

// Virtual for creator reference
productSchema.virtual('creator', {
  ref: 'User',
  localField: 'created_by',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to validate URLs
productSchema.pre('save', function(next) {
  // Validate image URLs
  const imageUrlRegex = /\.(jpg|jpeg|png|gif|webp)$/i;
  for (const url of this.images_urls) {
    if (!imageUrlRegex.test(url) && !url.includes('amazonaws.com')) {
      return next(new Error('Invalid image URL format'));
    }
  }
  
  // Validate video URLs
  const videoUrlRegex = /\.(mp4|avi|mov|wmv|flv|webm)$/i;
  for (const url of this.videos_urls) {
    if (!videoUrlRegex.test(url) && !url.includes('amazonaws.com')) {
      return next(new Error('Invalid video URL format'));
    }
  }
  
  next();
});

// Static method to find products by community
productSchema.statics.findByCommunity = function(communityId, options = {}) {
  const query = { community_id: communityId, status: 'active' };
  
  if (options.exclusive_to_members !== undefined) {
    query.exclusive_to_members = options.exclusive_to_members;
  }
  
  return this.find(query)
    .populate('creator', 'username email')
    .sort({ createdAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Static method to search products
productSchema.statics.searchProducts = function(searchTerm, communityId, options = {}) {
  const query = {
    $and: [
      { community_id: communityId },
      { status: 'active' },
      {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { tags: { $in: [new RegExp(searchTerm, 'i')] } }
        ]
      }
    ]
  };
  
  return this.find(query)
    .populate('creator', 'username email')
    .sort({ createdAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0);
};

// Instance method to increment view count
productSchema.methods.incrementViewCount = function() {
  this.view_count += 1;
  return this.save();
};

// Instance method to increment like count
productSchema.methods.incrementLikeCount = function() {
  this.like_count += 1;
  return this.save();
};

// Instance method to check if user can modify this product
productSchema.methods.canUserModify = function(userId, userRole, userCommunityId) {
  // Creator can always modify
  if (this.created_by.toString() === userId.toString()) {
    return true;
  }
  
  // Community admin can modify products in their community
  if (userRole === 'community_admin' && this.community_id.toString() === userCommunityId.toString()) {
    return true;
  }
  
  // Platform admin can modify any product
  if (userRole === 'admin') {
    return true;
  }
  
  return false;
};

module.exports = mongoose.model('Product', productSchema);