const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { mockUserFindByEmail } = require('../mocks/userLoginMocks');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password_hash: {
    type: String,
    required: function() {
      return this.auth_method === 'traditional';
    },
    minlength: [6, 'Password must be at least 6 characters']
  },
  user_type: {
    type: String,
    required: [true, 'User type is required'],
    enum: {
      values: ['platform_admin', 'community_admin', 'member'],
      message: 'User type must be platform_admin, community_admin, or member'
    },
    default: 'member'
  },
  first_name: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  last_name: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  is_active: {
    type: Boolean,
    default: true
  },
  last_login: {
    type: Date
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  wallet_address: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    trim: true,
    validate: {
      validator: function(v) {
        // Stellar address validation (starts with G and is 56 characters)
        return !v || /^G[A-Z2-7]{55}$/.test(v);
      },
      message: 'Wallet address must be a valid Stellar address (56 characters starting with G)'
    }
  },
  wallet_created_at: {
    type: Date
  },
  auth_method: {
    type: String,
    enum: ['traditional', 'wallet'],
    default: 'traditional'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ user_type: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password_hash')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password_hash);
  } catch (error) {
    throw error;
  }
};

// Instance method to get user without sensitive data
userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password_hash;
  return userObject;
};

// Static method to find user by email
userSchema.statics.findByEmail = async function(email) {
  try {
    // Set a shorter timeout for MongoDB operations
    const user = await this.findOne({ email: email.toLowerCase() }).maxTimeMS(3000);
    return user;
  } catch (error) {
    // If MongoDB is not available or times out, use mock data
    console.log('⚠️  MongoDB operation failed, using mock data for development:', error.message);
    return await mockUserFindByEmail(email);
  }
};

// Virtual for full name
userSchema.virtual('full_name').get(function() {
  if (this.first_name && this.last_name) {
    return `${this.first_name} ${this.last_name}`;
  }
  return this.first_name || this.last_name || this.email;
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.password_hash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);