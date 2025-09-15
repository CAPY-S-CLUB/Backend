const { ethers } = require('ethers');
const walletService = require('./walletService');
const NFTTransaction = require('../models/NFTTransaction');
const EventLog = require('../models/EventLog');

// ABIs para contratos ERC721 e ERC1155
const ERC721_ABI = [
  'function mint(address to, uint256 tokenId) external',
  'function safeMint(address to, uint256 tokenId) external',
  'function mintWithMetadata(address to, uint256 tokenId, string memory tokenURI) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function transferFrom(address from, address to, uint256 tokenId) external'
];

const ERC1155_ABI = [
  'function mint(address to, uint256 id, uint256 amount, bytes memory data) external',
  'function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes memory data) external'
];

class NFTMintService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.isInitialized = false;
    this.rateLimitMap = new Map(); // Para rate limiting
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 segundos
  }

  /**
   * Inicializa o serviço com provider e signer
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Configurar provider baseado na rede
      const network = process.env.BLOCKCHAIN_NETWORK || 'sepolia';
      const rpcUrl = process.env.RPC_URL || `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
      
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Configurar signer com chave privada do sistema
      const privateKey = process.env.SYSTEM_WALLET_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SYSTEM_WALLET_PRIVATE_KEY not configured');
      }
      
      this.signer = new ethers.Wallet(privateKey, this.provider);
      this.isInitialized = true;
      
      console.log(`NFT Mint Service initialized on ${network} network`);
      console.log(`System wallet address: ${this.signer.address}`);
    } catch (error) {
      console.error('Failed to initialize NFT Mint Service:', error);
      throw new Error('NFT Mint Service initialization failed');
    }
  }

  /**
   * Função principal para mint e transferência de NFT
   * @param {string} walletAddress - Endereço da carteira do destinatário
   * @param {string} tokenId - ID do token (para ERC721) ou ID do tipo (para ERC1155)
   * @param {string} contractAddress - Endereço do contrato NFT
   * @param {string} tokenType - Tipo do token ('ERC721' ou 'ERC1155')
   * @param {Object} metadata - Metadados do NFT
   * @param {string} userId - ID do usuário
   * @param {string} eventType - Tipo do evento que gerou o mint
   * @param {Object} eventData - Dados do evento
   * @param {number} amount - Quantidade (apenas para ERC1155)
   * @returns {Promise<Object>} Resultado da operação
   */
  async mintAndTransferNFT({
    walletAddress,
    tokenId,
    contractAddress,
    tokenType = 'ERC721',
    metadata = {},
    userId,
    eventType,
    eventData = {},
    amount = 1
  }) {
    try {
      await this.initialize();
      
      // Validações iniciais
      if (!walletService.isValidAddress(walletAddress)) {
        throw new Error('Invalid wallet address');
      }
      
      if (!walletService.isValidAddress(contractAddress)) {
        throw new Error('Invalid contract address');
      }
      
      // Verificar rate limiting
      if (this.isRateLimited(userId)) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      // Verificar se o usuário já possui este NFT (anti-fraude)
      const existingNFT = await this.checkExistingNFT(userId, contractAddress, tokenId, tokenType);
      if (existingNFT) {
        throw new Error('User already owns this NFT');
      }
      
      // Criar registro de transação
      const nftTransaction = new NFTTransaction({
        transactionHash: '', // Será preenchido após a transação
        fromAddress: this.signer.address,
        toAddress: walletAddress,
        contractAddress,
        tokenId: tokenId.toString(),
        tokenType,
        amount,
        status: 'pending',
        userId,
        eventType,
        eventData,
        metadata
      });
      
      await nftTransaction.save();
      
      // Executar mint baseado no tipo de token
      let transactionHash;
      if (tokenType === 'ERC721') {
        transactionHash = await this.mintERC721(contractAddress, walletAddress, tokenId, metadata);
      } else if (tokenType === 'ERC1155') {
        transactionHash = await this.mintERC1155(contractAddress, walletAddress, tokenId, amount, metadata);
      } else {
        throw new Error('Unsupported token type');
      }
      
      // Atualizar transação com hash
      nftTransaction.transactionHash = transactionHash;
      await nftTransaction.save();
      
      // Aplicar rate limiting
      this.applyRateLimit(userId);
      
      // Monitorar transação em background
      this.monitorTransaction(nftTransaction._id, transactionHash);
      
      return {
        success: true,
        transactionHash,
        nftTransactionId: nftTransaction._id,
        message: 'NFT mint transaction submitted successfully'
      };
      
    } catch (error) {
      console.error('Error in mintAndTransferNFT:', error);
      
      // Atualizar transação como falhou se existir
      if (nftTransaction && nftTransaction._id) {
        await nftTransaction.updateStatus('failed', { errorMessage: error.message });
      }
      
      throw error;
    }
  }
  
  /**
   * Mint ERC721 NFT
   */
  async mintERC721(contractAddress, toAddress, tokenId, metadata) {
    try {
      const contract = new ethers.Contract(contractAddress, ERC721_ABI, this.signer);
      
      // Verificar se o token já existe
      try {
        const owner = await contract.ownerOf(tokenId);
        if (owner !== ethers.ZeroAddress) {
          throw new Error(`Token ${tokenId} already exists`);
        }
      } catch (error) {
        // Token não existe, pode prosseguir
      }
      
      // Estimar gas
      const gasEstimate = await contract.mint.estimateGas(toAddress, tokenId);
      const gasLimit = gasEstimate * BigInt(120) / BigInt(100); // 20% buffer
      
      // Executar mint
      const tx = await contract.mint(toAddress, tokenId, {
        gasLimit,
        gasPrice: await this.provider.getFeeData().then(data => data.gasPrice)
      });
      
      console.log(`ERC721 mint transaction submitted: ${tx.hash}`);
      return tx.hash;
      
    } catch (error) {
      console.error('Error minting ERC721:', error);
      throw new Error(`Failed to mint ERC721: ${error.message}`);
    }
  }
  
  /**
   * Mint ERC1155 NFT
   */
  async mintERC1155(contractAddress, toAddress, tokenId, amount, metadata) {
    try {
      const contract = new ethers.Contract(contractAddress, ERC1155_ABI, this.signer);
      
      // Estimar gas
      const gasEstimate = await contract.mint.estimateGas(toAddress, tokenId, amount, '0x');
      const gasLimit = gasEstimate * BigInt(120) / BigInt(100); // 20% buffer
      
      // Executar mint
      const tx = await contract.mint(toAddress, tokenId, amount, '0x', {
        gasLimit,
        gasPrice: await this.provider.getFeeData().then(data => data.gasPrice)
      });
      
      console.log(`ERC1155 mint transaction submitted: ${tx.hash}`);
      return tx.hash;
      
    } catch (error) {
      console.error('Error minting ERC1155:', error);
      throw new Error(`Failed to mint ERC1155: ${error.message}`);
    }
  }
  
  /**
   * Monitorar transação em background
   */
  async monitorTransaction(nftTransactionId, transactionHash) {
    try {
      const receipt = await this.provider.waitForTransaction(transactionHash, 1, 300000); // 5 minutos timeout
      
      const nftTransaction = await NFTTransaction.findById(nftTransactionId);
      if (!nftTransaction) return;
      
      if (receipt.status === 1) {
        await nftTransaction.updateStatus('confirmed', {
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: receipt.gasPrice?.toString(),
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash
        });
        console.log(`Transaction ${transactionHash} confirmed`);
      } else {
        await nftTransaction.updateStatus('failed', {
          errorMessage: 'Transaction reverted'
        });
        console.log(`Transaction ${transactionHash} failed`);
      }
    } catch (error) {
      console.error(`Error monitoring transaction ${transactionHash}:`, error);
      
      const nftTransaction = await NFTTransaction.findById(nftTransactionId);
      if (nftTransaction) {
        await nftTransaction.updateStatus('failed', {
          errorMessage: `Monitoring failed: ${error.message}`
        });
      }
    }
  }
  
  /**
   * Verificar rate limiting
   */
  isRateLimited(userId) {
    const now = Date.now();
    const userLimits = this.rateLimitMap.get(userId);
    
    if (!userLimits) return false;
    
    // Limpar entradas antigas
    const oneHour = 60 * 60 * 1000;
    const validEntries = userLimits.filter(timestamp => now - timestamp < oneHour);
    
    if (validEntries.length === 0) {
      this.rateLimitMap.delete(userId);
      return false;
    }
    
    this.rateLimitMap.set(userId, validEntries);
    
    // Máximo 5 NFTs por hora por usuário
    return validEntries.length >= 5;
  }
  
  /**
   * Aplicar rate limiting
   */
  applyRateLimit(userId) {
    const now = Date.now();
    const userLimits = this.rateLimitMap.get(userId) || [];
    userLimits.push(now);
    this.rateLimitMap.set(userId, userLimits);
  }
  
  /**
   * Verificar se usuário já possui NFT (anti-fraude)
   */
  async checkExistingNFT(userId, contractAddress, tokenId, tokenType) {
    return await NFTTransaction.findOne({
      userId,
      contractAddress,
      tokenId: tokenId.toString(),
      tokenType,
      status: { $in: ['confirmed', 'pending'] }
    });
  }
  
  /**
   * Retry de transação falhada
   */
  async retryFailedTransaction(nftTransactionId) {
    try {
      const nftTransaction = await NFTTransaction.findById(nftTransactionId);
      if (!nftTransaction || nftTransaction.status !== 'failed') {
        throw new Error('Transaction not found or not in failed state');
      }
      
      if (nftTransaction.retryCount >= this.maxRetries) {
        throw new Error('Maximum retry attempts exceeded');
      }
      
      await nftTransaction.incrementRetry();
      
      // Retry mint
      return await this.mintAndTransferNFT({
        walletAddress: nftTransaction.toAddress,
        tokenId: nftTransaction.tokenId,
        contractAddress: nftTransaction.contractAddress,
        tokenType: nftTransaction.tokenType,
        metadata: nftTransaction.metadata,
        userId: nftTransaction.userId,
        eventType: nftTransaction.eventType,
        eventData: nftTransaction.eventData,
        amount: nftTransaction.amount
      });
      
    } catch (error) {
      console.error('Error retrying transaction:', error);
      throw error;
    }
  }
}

module.exports = new NFTMintService();