const NFTCollection = require('../models/NFTCollection');
const Brand = require('../models/Brand');
const blockchainService = require('./blockchainService');

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
      
      // Create NFT collection record with pending status
      const nftCollection = new NFTCollection({
        name: collectionData.name,
        description: collectionData.description,
        symbol: collectionData.symbol,
        brand_id: brandId,
        contract_type: collectionData.contractType || 'ERC721',
        max_supply: collectionData.maxSupply,
        mint_price: collectionData.mintPrice || '0',
        network: collectionData.network || 'ethereum',
        status: 'pending',
        metadata: {
          base_uri: collectionData.baseTokenURI,
          external_url: collectionData.externalUrl,
          image: collectionData.image
        },
        contract_address: '0x0000000000000000000000000000000000000000' // Temporary placeholder
      });
      
      await nftCollection.save();
      
      // Deploy smart contract asynchronously
      this.deployContractAsync(nftCollection._id, collectionData)
        .catch(error => {
          console.error('Contract deployment failed:', error);
          this.updateCollectionStatus(nftCollection._id, 'failed', { error: error.message });
        });
      
      return nftCollection;
    } catch (error) {
      console.error('Failed to create NFT collection:', error);
      throw error;
    }
  }
  
  async deployContractAsync(collectionId, collectionData) {
    try {
      // Update status to deploying
      await this.updateCollectionStatus(collectionId, 'deploying');
      
      const collection = await NFTCollection.findById(collectionId);
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Prepare deployment data
      const deploymentData = {
        name: collection.name,
        symbol: collection.symbol,
        maxSupply: collection.max_supply,
        mintPrice: collection.mint_price,
        baseTokenURI: collection.metadata.base_uri || `https://api.example.com/metadata/${collectionId}`,
        owner: process.env.CONTRACT_OWNER_ADDRESS || '0x742d35Cc6634C0532925a3b8D0C9C0E3C5C0C0C0'
      };
      
      let deploymentResult;
      
      // Deploy based on contract type
      if (collection.contract_type === 'ERC721') {
        deploymentResult = await blockchainService.deployNFTCollection721(
          deploymentData,
          collection.network,
          process.env.NODE_ENV !== 'production' // Use testnet for non-production
        );
      } else if (collection.contract_type === 'ERC1155') {
        deploymentResult = await blockchainService.deployNFTCollection1155(
          deploymentData,
          collection.network,
          process.env.NODE_ENV !== 'production'
        );
      } else {
        throw new Error(`Unsupported contract type: ${collection.contract_type}`);
      }
      
      // Update collection with deployment results
      await NFTCollection.findByIdAndUpdate(collectionId, {
        contract_address: deploymentResult.contractAddress,
        deployment_tx_hash: deploymentResult.transactionHash,
        deployment_block_number: deploymentResult.blockNumber,
        status: 'deployed',
        updated_at: new Date()
      });
      
      console.log(`Contract deployed successfully for collection ${collectionId}:`, deploymentResult);
      return deploymentResult;
    } catch (error) {
      console.error('Contract deployment failed:', error);
      await this.updateCollectionStatus(collectionId, 'failed', { error: error.message });
      throw error;
    }
  }
  
  async updateCollectionStatus(collectionId, status, additionalData = {}) {
    try {
      const updateData = {
        status,
        updated_at: new Date(),
        ...additionalData
      };
      
      await NFTCollection.findByIdAndUpdate(collectionId, updateData);
    } catch (error) {
      console.error('Failed to update collection status:', error);
    }
  }
  
  validateCollectionData(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length === 0) {
      errors.push('Collection name is required');
    }
    
    if (!data.description || data.description.trim().length === 0) {
      errors.push('Collection description is required');
    }
    
    if (!data.symbol || data.symbol.trim().length === 0) {
      errors.push('Collection symbol is required');
    }
    
    if (data.symbol && data.symbol.length > 10) {
      errors.push('Symbol cannot exceed 10 characters');
    }
    
    if (data.maxSupply && (data.maxSupply < 1 || data.maxSupply > 1000000)) {
      errors.push('Max supply must be between 1 and 1,000,000');
    }
    
    if (data.mintPrice && isNaN(parseFloat(data.mintPrice))) {
      errors.push('Mint price must be a valid number');
    }
    
    if (data.contractType && !['ERC721', 'ERC1155'].includes(data.contractType)) {
      errors.push('Contract type must be either ERC721 or ERC1155');
    }
    
    if (data.network && !['ethereum', 'polygon', 'bsc', 'arbitrum'].includes(data.network)) {
      errors.push('Network must be one of: ethereum, polygon, bsc, arbitrum');
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
  }
  
  async getCollectionsByBrand(brandId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      
      const collections = await NFTCollection.find({ brand_id: brandId })
        .populate('brand_id', 'name description')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await NFTCollection.countDocuments({ brand_id: brandId });
      
      return {
        collections,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_items: total,
          items_per_page: limit
        }
      };
    } catch (error) {
      console.error('Failed to get collections by brand:', error);
      throw error;
    }
  }
  
  async getCollectionById(collectionId) {
    try {
      const collection = await NFTCollection.findById(collectionId)
        .populate('brand_id', 'name description owner');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      return collection;
    } catch (error) {
      console.error('Failed to get collection by ID:', error);
      throw error;
    }
  }
  
  async updateCollection(collectionId, updateData, userId) {
    try {
      const collection = await NFTCollection.findById(collectionId)
        .populate('brand_id');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Check if user owns the brand
      if (collection.brand_id.owner && collection.brand_id.owner.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this brand');
      }
      
      // Only allow certain fields to be updated after deployment
      const allowedUpdates = ['description', 'metadata'];
      const filteredUpdates = {};
      
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key) || collection.status === 'pending') {
          filteredUpdates[key] = updateData[key];
        }
      });
      
      filteredUpdates.updated_at = new Date();
      
      const updatedCollection = await NFTCollection.findByIdAndUpdate(
        collectionId,
        filteredUpdates,
        { new: true, runValidators: true }
      );
      
      return updatedCollection;
    } catch (error) {
      console.error('Failed to update collection:', error);
      throw error;
    }
  }
  
  async deleteCollection(collectionId, userId) {
    try {
      const collection = await NFTCollection.findById(collectionId)
        .populate('brand_id');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      // Check if user owns the brand
      if (collection.brand_id.owner && collection.brand_id.owner.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this brand');
      }
      
      // Only allow deletion if not deployed
      if (collection.status === 'deployed') {
        throw new Error('Cannot delete deployed collections');
      }
      
      await NFTCollection.findByIdAndDelete(collectionId);
      return { message: 'Collection deleted successfully' };
    } catch (error) {
      console.error('Failed to delete collection:', error);
      throw error;
    }
  }
  
  async getCollectionStats(collectionId) {
    try {
      const collection = await this.getCollectionById(collectionId);
      
      // In a real implementation, you would fetch on-chain data
      const stats = {
        total_supply: 0,
        max_supply: collection.max_supply,
        mint_price: collection.mint_price,
        status: collection.status,
        contract_address: collection.contract_address,
        network: collection.network,
        deployment_date: collection.created_at,
        last_updated: collection.updated_at
      };
      
      return stats;
    } catch (error) {
      console.error('Failed to get collection stats:', error);
      throw error;
    }
  }
}

module.exports = new NFTCollectionService();