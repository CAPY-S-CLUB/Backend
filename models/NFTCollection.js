const mongoose = require('mongoose');

const nftCollectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Collection name is required'],
    trim: true,
    maxlength: [100, 'Collection name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Collection description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  contract_address: {
    type: String,
    required: [true, 'Contract address is required'],
    unique: true,
    validate: {
      validator: function(v) {
        // Ethereum address validation (42 characters, starts with 0x)
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum contract address format'
    }
  },
  brand_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: [true, 'Brand ID is required']
  },
  contract_type: {
    type: String,
    enum: ['ERC721', 'ERC1155'],
    required: [true, 'Contract type is required']
  },
  symbol: {
    type: String,
    required: [true, 'Collection symbol is required'],
    trim: true,
    maxlength: [10, 'Symbol cannot exceed 10 characters']
  },
  max_supply: {
    type: Number,
    min: [1, 'Max supply must be at least 1'],
    max: [1000000, 'Max supply cannot exceed 1,000,000']
  },
  mint_price: {
    type: String, // Store as string to handle precise decimal values
    default: '0'
  },
  deployment_tx_hash: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^0x[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'Invalid transaction hash format'
    }
  },
  deployment_block_number: {
    type: Number,
    min: 0
  },
  network: {
    type: String,
    enum: ['ethereum', 'polygon', 'bsc', 'arbitrum'],
    default: 'ethereum'
  },
  status: {
    type: String,
    enum: ['pending', 'deploying', 'deployed', 'failed'],
    default: 'pending'
  },
  metadata: {
    base_uri: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v) || /^ipfs:\/\/.+/.test(v);
        },
        message: 'Base URI must be a valid HTTP or IPFS URL'
      }
    },
    external_url: String,
    image: String
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

// Indexes for performance
nftCollectionSchema.index({ brand_id: 1 });
nftCollectionSchema.index({ contract_address: 1 }, { unique: true });
nftCollectionSchema.index({ status: 1 });
nftCollectionSchema.index({ created_at: -1 });

// Update the updated_at field before saving
nftCollectionSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Virtual for getting collection URL
nftCollectionSchema.virtual('collection_url').get(function() {
  if (this.network === 'ethereum') {
    return `https://etherscan.io/address/${this.contract_address}`;
  } else if (this.network === 'polygon') {
    return `https://polygonscan.com/address/${this.contract_address}`;
  }
  return null;
});

// Ensure virtual fields are serialized
nftCollectionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('NFTCollection', nftCollectionSchema);