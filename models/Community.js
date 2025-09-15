const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  brand_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true
  },
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  members: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joined_at: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin'],
      default: 'member'
    },
    is_active: {
      type: Boolean,
      default: true
    }
  }],
  settings: {
    is_public: {
      type: Boolean,
      default: true
    },
    allow_member_invites: {
      type: Boolean,
      default: false
    },
    require_approval: {
      type: Boolean,
      default: false
    }
  },
  stats: {
    total_members: {
      type: Number,
      default: 0
    },
    total_nfts_distributed: {
      type: Number,
      default: 0
    },
    last_activity: {
      type: Date,
      default: Date.now
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance optimization
communitySchema.index({ brand_id: 1, status: 1 });
communitySchema.index({ 'members.user_id': 1 });
communitySchema.index({ 'members.joined_at': 1 });
communitySchema.index({ created_at: -1 });

// Pre-save hook to update timestamps
communitySchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Virtual for member count
communitySchema.virtual('member_count').get(function() {
  return this.members ? this.members.filter(member => member.is_active).length : 0;
});

// Virtual for community URL
communitySchema.virtual('community_url').get(function() {
  return `/communities/${this._id}`;
});

// Method to add member
communitySchema.methods.addMember = function(userId, role = 'member') {
  const existingMember = this.members.find(member => 
    member.user_id.toString() === userId.toString()
  );
  
  if (!existingMember) {
    this.members.push({
      user_id: userId,
      role: role,
      joined_at: new Date(),
      is_active: true
    });
    this.stats.total_members = this.members.filter(m => m.is_active).length;
  }
  
  return this.save();
};

// Method to remove member
communitySchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(member => 
    member.user_id.toString() !== userId.toString()
  );
  this.stats.total_members = this.members.filter(m => m.is_active).length;
  return this.save();
};

// Method to get active members
communitySchema.methods.getActiveMembers = function() {
  return this.members.filter(member => member.is_active);
};

// Static method to find communities by brand
communitySchema.statics.findByBrand = function(brandId) {
  return this.find({ brand_id: brandId, status: 'active' });
};

// Configure JSON output
communitySchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Community', communitySchema);