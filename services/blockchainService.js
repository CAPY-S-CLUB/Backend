const { 
  Horizon, 
  Keypair, 
  TransactionBuilder, 
  Networks, 
  Operation, 
  Asset, 
  Account,
  BASE_FEE,
  TimeoutInfinite
} = require('@stellar/stellar-sdk');
const fs = require('fs');
const path = require('path');

class BlockchainService {
  constructor() {
    // Stellar network servers
    this.servers = {
      mainnet: new Horizon.Server('https://horizon.stellar.org'),
      testnet: new Horizon.Server('https://horizon-testnet.stellar.org')
    };
    
    // Network passphrases
    this.networks = {
      mainnet: Networks.PUBLIC,
      testnet: Networks.TESTNET
    };
    
    this.keypair = null;
    this.initializeKeypair();
  }
  
  initializeKeypair() {
    const secretKey = process.env.STELLAR_SECRET_KEY;
    if (!secretKey) {
      console.warn('STELLAR_SECRET_KEY not found in environment variables');
      return;
    }
    
    try {
      this.keypair = Keypair.fromSecret(secretKey);
      console.log('Stellar keypair initialized:', this.keypair.publicKey());
    } catch (error) {
      console.error('Failed to initialize Stellar keypair:', error.message);
    }
  }
  
  getServer(network = 'testnet') {
    return this.servers[network] || this.servers.testnet;
  }
  
  getNetwork(network = 'testnet') {
    return this.networks[network] || this.networks.testnet;
  }
  
  getKeypair() {
    if (!this.keypair) {
      throw new Error('Keypair not initialized. Please set STELLAR_SECRET_KEY environment variable.');
    }
    return this.keypair;
  }

  /**
   * Create and fund a new Stellar account
   * @param {string} network - Network to use (mainnet/testnet)
   * @returns {Promise<Object>} Account creation result
   */
  async createAccount(network = 'testnet') {
    try {
      const server = this.getServer(network);
      const sourceKeypair = this.getKeypair();
      
      // Generate new keypair for the account
      const newKeypair = Keypair.random();
      
      // Load source account
      const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
      
      // Build transaction to create account
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetwork(network)
      })
        .addOperation(Operation.createAccount({
          destination: newKeypair.publicKey(),
          startingBalance: '10' // Starting balance in XLM
        }))
        .setTimeout(TimeoutInfinite)
        .build();
      
      // Sign and submit transaction
      transaction.sign(sourceKeypair);
      const result = await server.submitTransaction(transaction);
      
      return {
        success: true,
        publicKey: newKeypair.publicKey(),
        secretKey: newKeypair.secret(),
        transactionHash: result.hash,
        message: 'Account created successfully'
      };
    } catch (error) {
      console.error('Error creating account:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create account'
      };
    }
  }

  /**
   * Get account information
   * @param {string} publicKey - Account public key
   * @param {string} network - Network to use
   * @returns {Promise<Object>} Account information
   */
  async getAccountInfo(publicKey, network = 'testnet') {
    try {
      const server = this.getServer(network);
      const account = await server.loadAccount(publicKey);
      
      return {
        success: true,
        account: {
          id: account.id,
          sequence: account.sequence,
          balances: account.balances,
          signers: account.signers,
          data: account.data,
          flags: account.flags,
          thresholds: account.thresholds
        },
        message: 'Account information retrieved successfully'
      };
    } catch (error) {
      console.error('Error getting account info:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get account information'
      };
    }
  }

  /**
   * Send payment between accounts
   * @param {string} destinationPublicKey - Destination account
   * @param {string} amount - Amount to send
   * @param {string} assetCode - Asset code (default: XLM)
   * @param {string} assetIssuer - Asset issuer (for non-native assets)
   * @param {string} network - Network to use
   * @returns {Promise<Object>} Payment result
   */
  async sendPayment(destinationPublicKey, amount, assetCode = 'XLM', assetIssuer = null, network = 'testnet') {
    try {
      const server = this.getServer(network);
      const sourceKeypair = this.getKeypair();
      
      // Load source account
      const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
      
      // Determine asset
      const asset = assetCode === 'XLM' ? Asset.native() : new Asset(assetCode, assetIssuer);
      
      // Build transaction
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetwork(network)
      })
        .addOperation(Operation.payment({
          destination: destinationPublicKey,
          asset: asset,
          amount: amount
        }))
        .setTimeout(TimeoutInfinite)
        .build();
      
      // Sign and submit transaction
      transaction.sign(sourceKeypair);
      const result = await server.submitTransaction(transaction);
      
      return {
        success: true,
        transactionHash: result.hash,
        amount: amount,
        asset: assetCode,
        destination: destinationPublicKey,
        message: 'Payment sent successfully'
      };
    } catch (error) {
      console.error('Error sending payment:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to send payment'
      };
    }
  }

  /**
   * Create a custom asset
   * @param {string} assetCode - Asset code
   * @param {string} limit - Trust limit
   * @param {string} network - Network to use
   * @returns {Promise<Object>} Asset creation result
   */
  async createAsset(assetCode, limit = '1000000', network = 'testnet') {
    try {
      const server = this.getServer(network);
      const issuerKeypair = this.getKeypair();
      
      // Create distributor account
      const distributorKeypair = Keypair.random();
      
      // First, create the distributor account
      const createAccountResult = await this.createAccount(network);
      if (!createAccountResult.success) {
        throw new Error('Failed to create distributor account');
      }
      
      // Load accounts
      const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
      const distributorAccount = await server.loadAccount(distributorKeypair.publicKey());
      
      // Create asset
      const asset = new Asset(assetCode, issuerKeypair.publicKey());
      
      // Build transaction for distributor to trust the asset
      const trustTransaction = new TransactionBuilder(distributorAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetwork(network)
      })
        .addOperation(Operation.changeTrust({
          asset: asset,
          limit: limit
        }))
        .setTimeout(TimeoutInfinite)
        .build();
      
      // Sign and submit trust transaction
      trustTransaction.sign(distributorKeypair);
      await server.submitTransaction(trustTransaction);
      
      // Issue the asset
      const issueTransaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetwork(network)
      })
        .addOperation(Operation.payment({
          destination: distributorKeypair.publicKey(),
          asset: asset,
          amount: limit
        }))
        .setTimeout(TimeoutInfinite)
        .build();
      
      // Sign and submit issue transaction
      issueTransaction.sign(issuerKeypair);
      const result = await server.submitTransaction(issueTransaction);
      
      return {
        success: true,
        assetCode: assetCode,
        issuer: issuerKeypair.publicKey(),
        distributor: distributorKeypair.publicKey(),
        distributorSecret: distributorKeypair.secret(),
        limit: limit,
        transactionHash: result.hash,
        message: 'Asset created successfully'
      };
    } catch (error) {
      console.error('Error creating asset:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create asset'
      };
    }
  }

  /**
   * Get transaction details
   * @param {string} transactionHash - Transaction hash
   * @param {string} network - Network to use
   * @returns {Promise<Object>} Transaction details
   */
  async getTransactionStatus(transactionHash, network = 'testnet') {
    try {
      const server = this.getServer(network);
      const transaction = await server.transactions().transaction(transactionHash).call();
      
      return {
        success: true,
        transaction: {
          hash: transaction.hash,
          ledger: transaction.ledger,
          createdAt: transaction.created_at,
          sourceAccount: transaction.source_account,
          operationCount: transaction.operation_count,
          successful: transaction.successful
        },
        message: 'Transaction details retrieved successfully'
      };
    } catch (error) {
      console.error('Error getting transaction status:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get transaction status'
      };
    }
  }

  /**
   * Validate Stellar public key
   * @param {string} publicKey - Public key to validate
   * @returns {boolean} True if valid
   */
  validatePublicKey(publicKey) {
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate Stellar secret key
   * @param {string} secretKey - Secret key to validate
   * @returns {boolean} True if valid
   */
  validateSecretKey(secretKey) {
    try {
      Keypair.fromSecret(secretKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert XLM to stroops (smallest unit)
   * @param {string} xlm - XLM amount
   * @returns {string} Stroops amount
   */
  xlmToStroops(xlm) {
    return (parseFloat(xlm) * 10000000).toString();
  }

  /**
   * Convert stroops to XLM
   * @param {string} stroops - Stroops amount
   * @returns {string} XLM amount
   */
  stroopsToXlm(stroops) {
    return (parseInt(stroops) / 10000000).toString();
  }

  /**
   * Get current network info
   * @param {string} network - Network to check
   * @returns {Promise<Object>} Network information
   */
  async getNetworkInfo(network = 'testnet') {
    try {
      const server = this.getServer(network);
      const ledger = await server.ledgers().order('desc').limit(1).call();
      
      return {
        success: true,
        network: network,
        latestLedger: ledger.records[0].sequence,
        networkPassphrase: this.getNetwork(network),
        serverUrl: server.serverURL.toString(),
        message: 'Network information retrieved successfully'
      };
    } catch (error) {
      console.error('Error getting network info:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get network information'
      };
    }
  }
}

module.exports = new BlockchainService();