const { Server, Keypair, Asset, Operation, TransactionBuilder, Networks, BASE_FEE } = require('@stellar/stellar-sdk');
const walletService = require('./walletService');
const NFTTransaction = require('../models/NFTTransaction');
const EventLog = require('../models/EventLog');

class NFTMintService {
  constructor() {
    this.server = null;
    this.issuerKeypair = null;
    this.isInitialized = false;
    this.rateLimitMap = new Map(); // Para rate limiting
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 segundos
  }

  /**
   * Inicializa o serviço com Stellar server e issuer keypair
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Configurar Stellar server baseado na rede
      const network = process.env.STELLAR_NETWORK || 'testnet';
      const horizonUrl = network === 'mainnet' 
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
      
      this.server = new Server(horizonUrl);
      
      // Configurar issuer keypair com chave privada do sistema
      const issuerSecret = process.env.STELLAR_ISSUER_SECRET_KEY;
      if (!issuerSecret) {
        throw new Error('STELLAR_ISSUER_SECRET_KEY not configured');
      }
      
      this.issuerKeypair = Keypair.fromSecret(issuerSecret);
      this.isInitialized = true;
      
      console.log(`NFT Mint Service initialized on Stellar ${network} network`);
      console.log(`Issuer account: ${this.issuerKeypair.publicKey()}`);
    } catch (error) {
      console.error('Failed to initialize NFT Mint Service:', error);
      throw new Error('NFT Mint Service initialization failed');
    }
  }

  /**
   * Função principal para criar e transferir NFT no Stellar
   * @param {string} walletAddress - Endereço da carteira do destinatário
   * @param {string} assetCode - Código do asset NFT
   * @param {string} assetIssuer - Endereço do emissor do asset (opcional)
   * @param {string} tokenType - Tipo do token ('STELLAR_NFT')
   * @param {Object} metadata - Metadados do NFT
   * @param {string} userId - ID do usuário
   * @param {string} eventType - Tipo do evento que gerou o mint
   * @param {Object} eventData - Dados do evento
   * @param {string} amount - Quantidade (geralmente '1' para NFTs)
   * @returns {Promise<Object>} Resultado da operação
   */
  async mintAndTransferNFT({
    walletAddress,
    assetCode,
    assetIssuer,
    tokenType = 'STELLAR_NFT',
    metadata = {},
    userId,
    eventType,
    eventData = {},
    amount = '1'
  }) {
    try {
      await this.initialize();
      
      // Validações iniciais
      if (!walletService.isValidStellarAddress(walletAddress)) {
        throw new Error('Invalid Stellar wallet address');
      }
      
      // Verificar rate limiting
      if (this.isRateLimited(userId)) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      
      // Verificar se o usuário já possui este NFT (anti-fraude)
      const existingNFT = await this.checkExistingNFT(userId, assetCode, assetIssuer, tokenType);
      if (existingNFT) {
        throw new Error('User already owns this NFT');
      }
      
      // Usar o issuer configurado se não fornecido
      const finalIssuer = assetIssuer || this.issuerKeypair.publicKey();
      
      // Criar registro de transação
      const nftTransaction = new NFTTransaction({
        transactionHash: '', // Será preenchido após a transação
        fromAddress: this.issuerKeypair.publicKey(),
        toAddress: walletAddress,
        contractAddress: finalIssuer, // No Stellar, usamos o issuer como "contrato"
        tokenId: assetCode,
        tokenType,
        amount: parseFloat(amount),
        status: 'pending',
        userId,
        eventType,
        eventData,
        metadata
      });
      
      await nftTransaction.save();
      
      // Executar mint e transferência no Stellar
      const transactionHash = await this.mintStellarNFT(
        walletAddress, 
        assetCode, 
        finalIssuer, 
        amount, 
        metadata
      );
      
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
        assetCode,
        assetIssuer: finalIssuer,
        message: 'Stellar NFT mint transaction submitted successfully'
      };
      
    } catch (error) {
      console.error('Error in mintAndTransferNFT:', error);
      
      // Atualizar transação como falhou se existir
      if (nftTransaction && nftTransaction._id) {
        await nftTransaction.updateStatus('failed', {
          errorMessage: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Cria e transfere um NFT no Stellar
   */
  async mintStellarNFT(destinationAddress, assetCode, assetIssuer, amount, metadata) {
    try {
      // Carregar conta do destinatário
      const destinationAccount = await this.server.loadAccount(destinationAddress);
      
      // Criar o asset NFT
      const nftAsset = new Asset(assetCode, assetIssuer);
      
      // Verificar se a conta de destino já tem trustline para o asset
      const hasTrustline = destinationAccount.balances.some(
        balance => balance.asset_code === assetCode && balance.asset_issuer === assetIssuer
      );
      
      let transaction;
      
      if (!hasTrustline) {
        // Criar trustline e transferir em uma única transação
        transaction = new TransactionBuilder(destinationAccount, {
          fee: BASE_FEE,
          networkPassphrase: process.env.STELLAR_NETWORK === 'mainnet' 
            ? Networks.PUBLIC 
            : Networks.TESTNET
        })
        .addOperation(Operation.changeTrust({
          asset: nftAsset,
          limit: amount // Limitar a quantidade que pode ser recebida
        }))
        .setTimeout(300)
        .build();
        
        // Assinar com a chave do destinatário (isso requer que tenhamos acesso)
        // Em um cenário real, isso seria feito pelo frontend/wallet do usuário
        transaction.sign(Keypair.fromPublicKey(destinationAddress));
        
        // Submeter trustline transaction
        await this.server.submitTransaction(transaction);
        
        // Recarregar conta após trustline
        const updatedDestinationAccount = await this.server.loadAccount(destinationAddress);
        
        // Agora criar transação de payment do issuer
        const issuerAccount = await this.server.loadAccount(assetIssuer);
        
        const paymentTransaction = new TransactionBuilder(issuerAccount, {
          fee: BASE_FEE,
          networkPassphrase: process.env.STELLAR_NETWORK === 'mainnet' 
            ? Networks.PUBLIC 
            : Networks.TESTNET
        })
        .addOperation(Operation.payment({
          destination: destinationAddress,
          asset: nftAsset,
          amount: amount
        }))
        .setTimeout(300)
        .build();
        
        paymentTransaction.sign(this.issuerKeypair);
        
        const result = await this.server.submitTransaction(paymentTransaction);
        return result.hash;
        
      } else {
        // Apenas transferir se trustline já existe
        const issuerAccount = await this.server.loadAccount(assetIssuer);
        
        transaction = new TransactionBuilder(issuerAccount, {
          fee: BASE_FEE,
          networkPassphrase: process.env.STELLAR_NETWORK === 'mainnet' 
            ? Networks.PUBLIC 
            : Networks.TESTNET
        })
        .addOperation(Operation.payment({
          destination: destinationAddress,
          asset: nftAsset,
          amount: amount
        }))
        .setTimeout(300)
        .build();
        
        transaction.sign(this.issuerKeypair);
        
        const result = await this.server.submitTransaction(transaction);
        return result.hash;
      }
      
    } catch (error) {
      console.error('Error minting Stellar NFT:', error);
      throw new Error(`Failed to mint Stellar NFT: ${error.message}`);
    }
  }

  /**
   * Monitora uma transação Stellar
   */
  async monitorTransaction(nftTransactionId, transactionHash) {
    try {
      // Aguardar confirmação da transação
      const transaction = await this.server.transactions().transaction(transactionHash).call();
      
      const nftTransaction = await NFTTransaction.findById(nftTransactionId);
      if (!nftTransaction) return;
      
      if (transaction.successful) {
        await nftTransaction.updateStatus('confirmed', {
          ledger: transaction.ledger,
          createdAt: transaction.created_at,
          operationCount: transaction.operation_count
        });
        console.log(`Stellar transaction ${transactionHash} confirmed`);
      } else {
        await nftTransaction.updateStatus('failed', {
          errorMessage: 'Transaction failed'
        });
        console.log(`Stellar transaction ${transactionHash} failed`);
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
   * Verifica rate limiting
   */
  isRateLimited(userId) {
    const now = Date.now();
    const userLimit = this.rateLimitMap.get(userId);
    
    if (!userLimit) return false;
    
    // Permitir 1 mint por minuto por usuário
    const timeLimit = 60 * 1000; // 1 minuto
    return (now - userLimit.lastMint) < timeLimit;
  }

  /**
   * Aplica rate limiting
   */
  applyRateLimit(userId) {
    this.rateLimitMap.set(userId, {
      lastMint: Date.now(),
      count: (this.rateLimitMap.get(userId)?.count || 0) + 1
    });
  }

  /**
   * Verifica se o usuário já possui um NFT específico
   */
  async checkExistingNFT(userId, assetCode, assetIssuer, tokenType) {
    return await NFTTransaction.findOne({
      userId,
      contractAddress: assetIssuer,
      tokenId: assetCode,
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
      
      // Incrementar contador de retry
      await nftTransaction.incrementRetry();
      
      // Tentar novamente
      const result = await this.mintAndTransferNFT({
        walletAddress: nftTransaction.toAddress,
        assetCode: nftTransaction.tokenId,
        assetIssuer: nftTransaction.contractAddress,
        tokenType: nftTransaction.tokenType,
        metadata: nftTransaction.metadata,
        userId: nftTransaction.userId,
        eventType: nftTransaction.eventType,
        eventData: nftTransaction.eventData,
        amount: nftTransaction.amount.toString()
      });
      
      return result;
      
    } catch (error) {
      console.error('Error retrying failed transaction:', error);
      throw error;
    }
  }
}

module.exports = new NFTMintService();