const NFTCollection = require('../models/NFTCollection');
const Brand = require('../models/Brand');
const blockchainService = require('./blockchainService');
const { Keypair, Asset } = require('@stellar/stellar-sdk');

class NFTCollectionService {
  async createNFTCollection(brandId, collectionData, userId) {
    try {
      // Validate brand exists and user has access
      const brand = await Brand.findById(brandId);
      if (!brand) {
        throw new Error('Brand not found');
      }
      
      // Check if user owns the brand (assuming brand has owner field)
      if (brand.owner && brand.owner.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this brand');
      }
      
      // Validate collection data
      this.validateCollectionData(collectionData);
      
      // Generate a unique issuer keypair for this collection
      const issuerKeypair = Keypair.random();
      
      // Create NFT collection record with pending status
      const nftCollection = new NFTCollection({
        name: collectionData.name,
        description: collectionData.description,
        symbol: collectionData.symbol,
        brand_id: brandId,
        contract_type: 'STELLAR_ASSET', // Stellar uses assets instead of contracts
        max_supply: collectionData.maxSupply,
        mint_price: collectionData.mintPrice || '0',
        network: collectionData.network || 'stellar-testnet',
        status: 'pending',
        metadata: {
          base_uri: collectionData.baseTokenURI,
          external_url: collectionData.externalUrl,
          image: collectionData.image,
          issuer_secret: issuerKeypair.secret(), // Store securely in production
          issuer_public: issuerKeypair.publicKey()
        },
        contract_address: issuerKeypair.publicKey() // In Stellar, the issuer address acts as the "contract"
      });
      
      await nftCollection.save();
      
      // Setup issuer account asynchronously
      this.setupIssuerAccountAsync(nftCollection._id, issuerKeypair)
        .catch(error => {
          console.error('Issuer account setup failed:', error);
          this.updateCollectionStatus(nftCollection._id, 'failed', { error: error.message });
        });
      
      return nftCollection;
    } catch (error) {
      console.error('Failed to create NFT collection:', error);
      throw error;
    }
  }
  
  async setupIssuerAccountAsync(collectionId, issuerKeypair) {
    try {
      // Update status to deploying
      await this.updateCollectionStatus(collectionId, 'deploying');
      
      const collection = await NFTCollection.findById(collectionId);
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Create and fund the issuer account
      const setupResult = await blockchainService.createAndFundAccount(
        issuerKeypair.publicKey(),
        issuerKeypair.secret()
      );
      
      if (!setupResult.success) {
        throw new Error(`Failed to setup issuer account: ${setupResult.error}`);
      }
      
      // Update collection with deployment results
      await NFTCollection.findByIdAndUpdate(collectionId, {
        status: 'active',
        deployment_tx_hash: setupResult.transactionHash,
        deployment_ledger: setupResult.ledger,
        'metadata.account_funded': true,
        'metadata.starting_balance': setupResult.balance
      });
      
      console.log(`NFT Collection ${collection.name} issuer account setup completed`);
      console.log(`Issuer address: ${issuerKeypair.publicKey()}`);
      
    } catch (error) {
      console.error('Error setting up issuer account:', error);
      await this.updateCollectionStatus(collectionId, 'failed', {
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }
  
  async updateCollectionStatus(collectionId, status, additionalData = {}) {
    try {
      const updateData = { status, ...additionalData };
      await NFTCollection.findByIdAndUpdate(collectionId, updateData);
      console.log(`Collection ${collectionId} status updated to: ${status}`);
    } catch (error) {
      console.error('Error updating collection status:', error);
    }
  }
  
  validateCollectionData(data) {
    const requiredFields = ['name', 'symbol'];
    
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate Stellar asset code (max 12 characters, alphanumeric)
    if (data.symbol && (data.symbol.length > 12 || !/^[A-Z0-9]+$/.test(data.symbol))) {
      throw new Error('Symbol must be alphanumeric and max 12 characters for Stellar assets');
    }
    
    // Validate name length
    if (data.name && data.name.length > 100) {
      throw new Error('Collection name must be less than 100 characters');
    }
    
    // Validate description length
    if (data.description && data.description.length > 1000) {
      throw new Error('Description must be less than 1000 characters');
    }
    
    // Validate max supply
    if (data.maxSupply && (isNaN(data.maxSupply) || data.maxSupply <= 0)) {
      throw new Error('Max supply must be a positive number');
    }
    
    // Validate mint price
    if (data.mintPrice && (isNaN(data.mintPrice) || data.mintPrice < 0)) {
      throw new Error('Mint price must be a non-negative number');
    }
    
    // Validate URLs
    if (data.baseTokenURI && !this.isValidUrl(data.baseTokenURI)) {
      throw new Error('Invalid base token URI format');
    }
    
    if (data.externalUrl && !this.isValidUrl(data.externalUrl)) {
      throw new Error('Invalid external URL format');
    }
    
    if (data.image && !this.isValidUrl(data.image)) {
      throw new Error('Invalid image URL format');
    }
  }
  
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }
  
  async getCollectionsByBrand(brandId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      
      const collections = await NFTCollection.find({ brand_id: brandId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('brand_id', 'name logo')
        .lean();
      
      const total = await NFTCollection.countDocuments({ brand_id: brandId });
      
      return {
        collections,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Error fetching collections by brand:', error);
      throw error;
    }
  }
  
  async getCollectionById(collectionId) {
    try {
      const collection = await NFTCollection.findById(collectionId)
        .populate('brand_id', 'name logo description')
        .lean();
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Remove sensitive data before returning
      if (collection.metadata && collection.metadata.issuer_secret) {
        delete collection.metadata.issuer_secret;
      }
      
      return collection;
    } catch (error) {
      console.error('Error fetching collection by ID:', error);
      throw error;
    }
  }
  
  async updateCollection(collectionId, updateData, userId) {
    try {
      const collection = await NFTCollection.findById(collectionId).populate('brand_id');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Check if user owns the brand
      if (collection.brand_id.owner && collection.brand_id.owner.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this collection');
      }
      
      // Only allow certain fields to be updated
      const allowedUpdates = ['description', 'metadata.external_url', 'metadata.image'];
      const filteredUpdates = {};
      
      for (const key of allowedUpdates) {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          if (updateData[parent] && updateData[parent][child] !== undefined) {
            if (!filteredUpdates[parent]) filteredUpdates[parent] = {};
            filteredUpdates[parent][child] = updateData[parent][child];
          }
        } else if (updateData[key] !== undefined) {
          filteredUpdates[key] = updateData[key];
        }
      }
      
      // Validate updated data
      if (filteredUpdates.description) {
        this.validateCollectionData({ description: filteredUpdates.description });
      }
      
      const updatedCollection = await NFTCollection.findByIdAndUpdate(
        collectionId,
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      ).populate('brand_id', 'name logo');
      
      return updatedCollection;
    } catch (error) {
      console.error('Error updating collection:', error);
      throw error;
    }
  }
  
  async deleteCollection(collectionId, userId) {
    try {
      const collection = await NFTCollection.findById(collectionId).populate('brand_id');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Check if user owns the brand
      if (collection.brand_id.owner && collection.brand_id.owner.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this collection');
      }
      
      // Check if collection has any minted NFTs
      const NFTTransaction = require('../models/NFTTransaction');
      const mintedNFTs = await NFTTransaction.countDocuments({
        contractAddress: collection.contract_address,
        status: 'confirmed'
      });
      
      if (mintedNFTs > 0) {
        throw new Error('Cannot delete collection with minted NFTs');
      }
      
      await NFTCollection.findByIdAndDelete(collectionId);
      
      return { message: 'Collection deleted successfully' };
    } catch (error) {
      console.error('Error deleting collection:', error);
      throw error;
    }
  }
  
  async getCollectionStats(collectionId) {
    try {
      const collection = await NFTCollection.findById(collectionId);
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      const NFTTransaction = require('../models/NFTTransaction');
      
      // Get minting statistics
      const totalMinted = await NFTTransaction.countDocuments({
        contractAddress: collection.contract_address,
        status: 'confirmed'
      });
      
      const pendingMints = await NFTTransaction.countDocuments({
        contractAddress: collection.contract_address,
        status: 'pending'
      });
      
      const failedMints = await NFTTransaction.countDocuments({
        contractAddress: collection.contract_address,
        status: 'failed'
      });
      
      // Get unique holders
      const uniqueHolders = await NFTTransaction.distinct('toAddress', {
        contractAddress: collection.contract_address,
        status: 'confirmed'
      });
      
      return {
        collection: {
          id: collection._id,
          name: collection.name,
          symbol: collection.symbol,
          status: collection.status,
          maxSupply: collection.max_supply,
          issuerAddress: collection.contract_address
        },
        stats: {
          totalMinted,
          pendingMints,
          failedMints,
          uniqueHolders: uniqueHolders.length,
          mintingRate: totalMinted / (collection.max_supply || 1) * 100,
          remainingSupply: (collection.max_supply || 0) - totalMinted
        }
      };
    } catch (error) {
      console.error('Error fetching collection stats:', error);
      throw error;
    }
  }
  
  /**
   * Create a new asset for the collection
   */
  async createCollectionAsset(collectionId, assetCode, metadata = {}) {
    try {
      const collection = await NFTCollection.findById(collectionId);
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      if (collection.status !== 'active') {
        throw new Error('Collection must be active to create assets');
      }
      
      // Validate asset code for Stellar
      if (!assetCode || assetCode.length > 12 || !/^[A-Z0-9]+$/.test(assetCode)) {
        throw new Error('Asset code must be alphanumeric and max 12 characters');
      }
      
      const issuerKeypair = Keypair.fromSecret(collection.metadata.issuer_secret);
      
      // Create the asset
      const asset = new Asset(assetCode, issuerKeypair.publicKey());
      
      return {
        assetCode,
        issuer: issuerKeypair.publicKey(),
        asset,
        metadata
      };
    } catch (error) {
      console.error('Error creating collection asset:', error);
      throw error;
    }
  }
}

module.exports = new NFTCollectionService();