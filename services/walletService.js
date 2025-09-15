const Moralis = require('moralis').default;
const { EvmApi } = require('@moralisweb3/evm-api');
const { ethers } = require('ethers');

class WalletService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initialize Moralis SDK
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await Moralis.start({
        apiKey: process.env.MORALIS_API_KEY,
      });
      this.isInitialized = true;
      console.log('Moralis SDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Moralis SDK:', error);
      throw new Error('Wallet service initialization failed');
    }
  }

  /**
   * Create a new smart wallet for a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Wallet creation result
   */
  async createSmartWallet(userId) {
    try {
      await this.initialize();
      
      // Generate a new wallet using ethers
      const wallet = ethers.Wallet.createRandom();
      
      const walletData = {
        address: wallet.address,
        privateKey: wallet.privateKey, // In production, this should be encrypted and stored securely
        mnemonic: wallet.mnemonic?.phrase,
        userId: userId,
        createdAt: new Date(),
        network: 'ethereum', // Default network
        isActive: true
      };
      
      console.log(`Smart wallet created for user ${userId}: ${wallet.address}`);
      
      return {
        success: true,
        wallet: {
          address: walletData.address,
          network: walletData.network,
          createdAt: walletData.createdAt
        }
      };
    } catch (error) {
      console.error('Error creating smart wallet:', error);
      throw new Error(`Failed to create wallet for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Get wallet balance for a given address
   * @param {string} address - Wallet address
   * @param {string} chain - Blockchain network (default: eth)
   * @returns {Promise<Object>} Balance information
   */
  async getWalletBalance(address, chain = 'eth') {
    try {
      await this.initialize();
      
      const response = await EvmApi.balance.getNativeBalance({
        address,
        chain,
      });
      
      return {
        success: true,
        balance: {
          raw: response.result.balance,
          formatted: ethers.formatEther(response.result.balance),
          symbol: 'ETH',
          decimals: 18
        }
      };
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      return {
        success: false,
        error: error.message,
        balance: {
          raw: '0',
          formatted: '0',
          symbol: 'ETH',
          decimals: 18
        }
      };
    }
  }

  /**
   * Get ERC20 token balances for a wallet
   * @param {string} address - Wallet address
   * @param {string} chain - Blockchain network (default: eth)
   * @returns {Promise<Object>} Token balances
   */
  async getTokenBalances(address, chain = 'eth') {
    try {
      await this.initialize();
      
      const response = await EvmApi.token.getWalletTokenBalances({
        address,
        chain,
      });
      
      const tokens = response.result.map(token => ({
        name: token.name,
        symbol: token.symbol,
        balance: token.balance,
        decimals: token.decimals,
        contractAddress: token.tokenAddress
      }));
      
      return {
        success: true,
        tokens
      };
    } catch (error) {
      console.error('Error getting token balances:', error);
      return {
        success: false,
        error: error.message,
        tokens: []
      };
    }
  }

  /**
   * Get NFTs owned by a wallet
   * @param {string} address - Wallet address
   * @param {string} chain - Blockchain network (default: eth)
   * @returns {Promise<Object>} NFT collection
   */
  async getWalletNFTs(address, chain = 'eth') {
    try {
      await this.initialize();
      
      const response = await EvmApi.nft.getWalletNFTs({
        address,
        chain,
        limit: 100,
      });
      
      const nfts = response.result.map(nft => ({
        tokenId: nft.tokenId,
        name: nft.name,
        symbol: nft.symbol,
        contractAddress: nft.tokenAddress,
        tokenUri: nft.tokenUri,
        metadata: nft.metadata,
        amount: nft.amount
      }));
      
      return {
        success: true,
        nfts,
        total: response.result.length
      };
    } catch (error) {
      console.error('Error getting wallet NFTs:', error);
      return {
        success: false,
        error: error.message,
        nfts: [],
        total: 0
      };
    }
  }

  /**
   * Get comprehensive wallet information
   * @param {string} address - Wallet address
   * @param {string} chain - Blockchain network (default: eth)
   * @returns {Promise<Object>} Complete wallet data
   */
  async getWalletInfo(address, chain = 'eth') {
    try {
      const [balance, tokens, nfts] = await Promise.all([
        this.getWalletBalance(address, chain),
        this.getTokenBalances(address, chain),
        this.getWalletNFTs(address, chain)
      ]);
      
      return {
        success: true,
        wallet: {
          address,
          chain,
          balance: balance.balance,
          tokens: tokens.tokens,
          nfts: nfts.nfts,
          totalNFTs: nfts.total,
          lastUpdated: new Date()
        }
      };
    } catch (error) {
      console.error('Error getting wallet info:', error);
      throw new Error(`Failed to retrieve wallet information: ${error.message}`);
    }
  }

  /**
   * Validate wallet address format
   * @param {string} address - Wallet address to validate
   * @returns {boolean} Is valid address
   */
  isValidAddress(address) {
    try {
      return ethers.isAddress(address);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new WalletService();