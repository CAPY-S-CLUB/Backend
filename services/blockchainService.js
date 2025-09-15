const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

class BlockchainService {
  constructor() {
    this.providers = {
      ethereum: new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your-project-id'),
      polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.infura.io/v3/your-project-id'),
      bsc: new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'),
      arbitrum: new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc')
    };
    
    this.testnetProviders = {
      ethereum: new ethers.JsonRpcProvider(process.env.ETHEREUM_TESTNET_RPC_URL || 'https://sepolia.infura.io/v3/your-project-id'),
      polygon: new ethers.JsonRpcProvider(process.env.POLYGON_TESTNET_RPC_URL || 'https://rpc-mumbai.maticvigil.com/'),
      bsc: new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/'),
      arbitrum: new ethers.JsonRpcProvider(process.env.ARBITRUM_TESTNET_RPC_URL || 'https://goerli-rollup.arbitrum.io/rpc')
    };
    
    this.wallet = null;
    this.initializeWallet();
  }
  
  initializeWallet() {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      console.warn('DEPLOYER_PRIVATE_KEY not found in environment variables');
      return;
    }
    
    try {
      this.wallet = new ethers.Wallet(privateKey);
    } catch (error) {
      console.error('Failed to initialize wallet:', error.message);
    }
  }
  
  getProvider(network = 'ethereum', testnet = false) {
    const providers = testnet ? this.testnetProviders : this.providers;
    return providers[network] || providers.ethereum;
  }
  
  getConnectedWallet(network = 'ethereum', testnet = false) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please set DEPLOYER_PRIVATE_KEY environment variable.');
    }
    
    const provider = this.getProvider(network, testnet);
    return this.wallet.connect(provider);
  }
  
  async estimateGasPrice(network = 'ethereum', testnet = false) {
    try {
      const provider = this.getProvider(network, testnet);
      const feeData = await provider.getFeeData();
      
      return {
        gasPrice: feeData.gasPrice,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      };
    } catch (error) {
      console.error('Failed to estimate gas price:', error);
      throw new Error('Failed to estimate gas price');
    }
  }
  
  async getContractBytecode(contractType) {
    try {
      const contractPath = path.join(__dirname, '..', 'contracts', `${contractType}.sol`);
      
      if (!fs.existsSync(contractPath)) {
        throw new Error(`Contract file not found: ${contractType}.sol`);
      }
      
      // In a real implementation, you would compile the Solidity contract
      // For now, we'll return a placeholder that indicates compilation is needed
      return {
        bytecode: null,
        abi: null,
        needsCompilation: true,
        contractPath
      };
    } catch (error) {
      console.error('Failed to get contract bytecode:', error);
      throw error;
    }
  }
  
  async deployContract(contractData, network = 'ethereum', testnet = true) {
    try {
      const connectedWallet = this.getConnectedWallet(network, testnet);
      
      // Get gas estimation
      const gasData = await this.estimateGasPrice(network, testnet);
      
      // For demonstration, we'll create a mock deployment
      // In a real implementation, you would use the compiled contract
      const mockContractFactory = {
        deploy: async (...args) => {
          // Simulate contract deployment
          const mockTx = {
            hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
            wait: async () => ({
              contractAddress: '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
              blockNumber: Math.floor(Math.random() * 1000000) + 15000000,
              gasUsed: ethers.parseUnits('2000000', 'wei'),
              effectiveGasPrice: gasData.gasPrice || ethers.parseUnits('20', 'gwei')
            })
          };
          
          return {
            deployTransaction: mockTx,
            address: await mockTx.wait().then(receipt => receipt.contractAddress)
          };
        }
      };
      
      // Deploy contract with gas optimization
      const deploymentArgs = [
        contractData.name,
        contractData.symbol,
        contractData.maxSupply || 10000,
        ethers.parseEther(contractData.mintPrice || '0'),
        contractData.baseTokenURI || '',
        contractData.owner || connectedWallet.address
      ];
      
      console.log('Deploying contract with args:', deploymentArgs);
      
      const contract = await mockContractFactory.deploy(...deploymentArgs);
      const deploymentReceipt = await contract.deployTransaction.wait();
      
      return {
        contractAddress: deploymentReceipt.contractAddress,
        transactionHash: contract.deployTransaction.hash,
        blockNumber: deploymentReceipt.blockNumber,
        gasUsed: deploymentReceipt.gasUsed.toString(),
        gasPrice: deploymentReceipt.effectiveGasPrice.toString(),
        network,
        testnet
      };
    } catch (error) {
      console.error('Contract deployment failed:', error);
      throw new Error(`Contract deployment failed: ${error.message}`);
    }
  }
  
  async deployNFTCollection721(collectionData, network = 'ethereum', testnet = true) {
    try {
      const contractData = {
        name: collectionData.name,
        symbol: collectionData.symbol,
        maxSupply: collectionData.maxSupply,
        mintPrice: collectionData.mintPrice || '0',
        baseTokenURI: collectionData.baseTokenURI || '',
        owner: collectionData.owner
      };
      
      return await this.deployContract(contractData, network, testnet);
    } catch (error) {
      console.error('ERC721 deployment failed:', error);
      throw error;
    }
  }
  
  async deployNFTCollection1155(collectionData, network = 'ethereum', testnet = true) {
    try {
      const contractData = {
        name: collectionData.name,
        symbol: collectionData.symbol,
        baseTokenURI: collectionData.baseTokenURI || '',
        owner: collectionData.owner
      };
      
      return await this.deployContract(contractData, network, testnet);
    } catch (error) {
      console.error('ERC1155 deployment failed:', error);
      throw error;
    }
  }
  
  async getTransactionStatus(txHash, network = 'ethereum', testnet = false) {
    try {
      const provider = this.getProvider(network, testnet);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { status: 'pending' };
      }
      
      return {
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        contractAddress: receipt.contractAddress
      };
    } catch (error) {
      console.error('Failed to get transaction status:', error);
      return { status: 'error', error: error.message };
    }
  }
  
  async validateContractAddress(address, network = 'ethereum', testnet = false) {
    try {
      if (!ethers.isAddress(address)) {
        return { valid: false, reason: 'Invalid address format' };
      }
      
      const provider = this.getProvider(network, testnet);
      const code = await provider.getCode(address);
      
      return {
        valid: code !== '0x',
        isContract: code !== '0x',
        reason: code === '0x' ? 'Address is not a contract' : 'Valid contract address'
      };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }
  
  formatEther(wei) {
    return ethers.formatEther(wei);
  }
  
  parseEther(ether) {
    return ethers.parseEther(ether.toString());
  }
}

module.exports = new BlockchainService();