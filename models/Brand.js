const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
    maxlength: [100, 'Brand name cannot exceed 100 characters'],
    unique: true
  },
  description: {
    type: String,
    required: [true, 'Brand description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  logo_url: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // Allow empty string or valid URL
        if (!v) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Logo URL must be a valid HTTP/HTTPS URL'
    }
  },
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Admin ID is required'],
    validate: {
      validator: async function(v) {
        const User = mongoose.model('User');
        const user = await User.findById(v);
        return user && (user.user_type === 'platform_admin' || user.user_type === 'community_admin');
      },
      message: 'Admin must be a platform_admin or community_admin'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'pending'],
      message: 'Status must be active, inactive, or pending'
    },
    default: 'active'
  },
  website_url: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Website URL must be a valid HTTP/HTTPS URL'
    }
  },
  contact_email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
  },
  social_media: {
    facebook: {
      type: String,
      trim: true
    },
    twitter: {
      type: String,
      trim: true
    },
    instagram: {
      type: String,
      trim: true
    },
    linkedin: {
      type: String,
      trim: true
    }
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance
brandSchema.index({ name: 1 });
brandSchema.index({ admin_id: 1 });
brandSchema.index({ status: 1 });
brandSchema.index({ tags: 1 });
brandSchema.index({ created_at: -1 });

// Compound index for admin queries
brandSchema.index({ admin_id: 1, status: 1 });

// Pre-save middleware to update the updated_at field
brandSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Static method to find brands by admin
brandSchema.statics.findByAdmin = function(adminId, status = null) {
  const query = { admin_id: adminId };
  if (status) {
    query.status = status;
  }
  return this.find(query).populate('admin_id', 'email first_name last_name user_type');
};

// Static method to find active brands
brandSchema.statics.findActive = function() {
  return this.find({ status: 'active' }).populate('admin_id', 'email first_name last_name');
};

// Instance method to check if user can modify this brand
brandSchema.methods.canBeModifiedBy = function(user) {
  // Platform admins can modify any brand
  if (user.user_type === 'platform_admin') {
    return true;
  }
  
  // Community admins can only modify their own brands
  if (user.user_type === 'community_admin') {
    return this.admin_id.toString() === user._id.toString();
  }
  
  return false;
};

// Virtual for logo file name (extracted from URL)
brandSchema.virtual('logo_filename').get(function() {
  if (!this.logo_url) return null;
  const parts = this.logo_url.split('/');
  return parts[parts.length - 1];
});

// Ensure virtual fields are serialized
brandSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Brand', brandSchema);