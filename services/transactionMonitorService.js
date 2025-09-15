const NFTTransaction = require('../models/NFTTransaction');
const EventLog = require('../models/EventLog');
const eventService = require('./eventService');
const { ethers } = require('ethers');

class TransactionMonitorService {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.alertThresholds = {
      pendingTimeoutMinutes: 30, // Alertar se transação estiver pendente por mais de 30 minutos
      maxRetries: 3, // Máximo de tentativas antes de marcar como falha permanente
      batchSize: 50 // Número de transações para processar por vez
    };
    this.providers = new Map(); // Cache de providers por rede
    this.alertCallbacks = new Map(); // Callbacks para diferentes tipos de alerta
  }

  /**
   * Inicializar o serviço de monitoramento
   * @param {Object} config - Configurações do serviço
   */
  async initialize(config = {}) {
    try {
      console.log('Initializing Transaction Monitor Service...');
      
      // Configurar thresholds personalizados
      if (config.alertThresholds) {
        this.alertThresholds = { ...this.alertThresholds, ...config.alertThresholds };
      }

      // Configurar providers para diferentes redes
      if (config.networks) {
        for (const [networkName, rpcUrl] of Object.entries(config.networks)) {
          this.providers.set(networkName, new ethers.JsonRpcProvider(rpcUrl));
        }
      }

      // Configurar callbacks de alerta
      this.setupDefaultAlertCallbacks();

      console.log('Transaction Monitor Service initialized successfully');
      
    } catch (error) {
      console.error('Error initializing Transaction Monitor Service:', error);
      throw error;
    }
  }

  /**
   * Iniciar monitoramento contínuo
   * @param {number} intervalMs - Intervalo de monitoramento em milissegundos (padrão: 60 segundos)
   */
  startMonitoring(intervalMs = 60000) {
    if (this.isMonitoring) {
      console.log('Transaction monitoring is already running');
      return;
    }

    console.log(`Starting transaction monitoring with ${intervalMs}ms interval`);
    this.isMonitoring = true;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorPendingTransactions();
        await this.checkStaleTransactions();
        await this.retryFailedTransactions();
      } catch (error) {
        console.error('Error during transaction monitoring cycle:', error);
        await this.sendAlert('monitoring_error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }, intervalMs);

    console.log('Transaction monitoring started');
  }

  /**
   * Parar monitoramento
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('Transaction monitoring is not running');
      return;
    }

    console.log('Stopping transaction monitoring');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('Transaction monitoring stopped');
  }

  /**
   * Monitorar transações pendentes
   */
  async monitorPendingTransactions() {
    try {
      const pendingTransactions = await NFTTransaction.findPendingTransactions(
        this.alertThresholds.batchSize
      );

      if (pendingTransactions.length === 0) {
        return;
      }

      console.log(`Monitoring ${pendingTransactions.length} pending transactions`);

      for (const transaction of pendingTransactions) {
        try {
          await this.checkTransactionStatus(transaction);
        } catch (error) {
          console.error(`Error checking transaction ${transaction.transactionHash}:`, error);
          
          // Incrementar retry count
          await transaction.incrementRetry();
          
          // Se excedeu o máximo de tentativas, marcar como falha
          if (transaction.retryCount >= this.alertThresholds.maxRetries) {
            await transaction.updateStatus('failed', `Max retries exceeded: ${error.message}`);
            
            await this.sendAlert('transaction_failed', {
              transactionHash: transaction.transactionHash,
              userId: transaction.userId,
              error: error.message,
              retryCount: transaction.retryCount
            });
          }
        }
      }

    } catch (error) {
      console.error('Error monitoring pending transactions:', error);
      throw error;
    }
  }

  /**
   * Verificar status de uma transação específica
   * @param {Object} transaction - Documento da transação
   */
  async checkTransactionStatus(transaction) {
    try {
      const provider = this.getProviderForNetwork(transaction.network || 'ethereum');
      
      if (!provider) {
        throw new Error(`No provider configured for network: ${transaction.network}`);
      }

      // Buscar receipt da transação
      const receipt = await provider.getTransactionReceipt(transaction.transactionHash);
      
      if (receipt) {
        // Transação foi minerada
        if (receipt.status === 1) {
          // Sucesso
          await transaction.updateStatus('confirmed', 'Transaction confirmed on blockchain');
          
          // Publicar evento de confirmação
          await eventService.publishEvent({
            eventType: 'nft_transaction_confirmed',
            userId: transaction.userId,
            eventData: {
              transactionHash: transaction.transactionHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              contractAddress: transaction.contractAddress,
              tokenId: transaction.tokenId
            },
            source: 'transaction_monitor'
          });

          console.log(`Transaction ${transaction.transactionHash} confirmed`);
          
        } else {
          // Falha
          await transaction.updateStatus('failed', 'Transaction failed on blockchain');
          
          await this.sendAlert('transaction_failed', {
            transactionHash: transaction.transactionHash,
            userId: transaction.userId,
            blockNumber: receipt.blockNumber,
            reason: 'Transaction reverted'
          });

          console.log(`Transaction ${transaction.transactionHash} failed`);
        }
      } else {
        // Transação ainda não foi minerada, verificar se está muito antiga
        const transactionAge = Date.now() - transaction.createdAt.getTime();
        const timeoutMs = this.alertThresholds.pendingTimeoutMinutes * 60 * 1000;
        
        if (transactionAge > timeoutMs) {
          await this.sendAlert('transaction_timeout', {
            transactionHash: transaction.transactionHash,
            userId: transaction.userId,
            ageMinutes: Math.floor(transactionAge / 60000),
            thresholdMinutes: this.alertThresholds.pendingTimeoutMinutes
          });
        }
      }

    } catch (error) {
      // Se for erro de transação não encontrada, pode ter sido dropada
      if (error.code === 'TRANSACTION_NOT_FOUND' || error.message.includes('not found')) {
        const transactionAge = Date.now() - transaction.createdAt.getTime();
        
        // Se a transação tem mais de 1 hora e não foi encontrada, considerar como dropada
        if (transactionAge > 60 * 60 * 1000) {
          await transaction.updateStatus('failed', 'Transaction not found - likely dropped from mempool');
          
          await this.sendAlert('transaction_dropped', {
            transactionHash: transaction.transactionHash,
            userId: transaction.userId,
            ageHours: Math.floor(transactionAge / 3600000)
          });
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Verificar transações que estão há muito tempo pendentes
   */
  async checkStaleTransactions() {
    try {
      const staleThreshold = new Date(Date.now() - (this.alertThresholds.pendingTimeoutMinutes * 60 * 1000));
      
      const staleTransactions = await NFTTransaction.find({
        status: 'pending',
        createdAt: { $lt: staleThreshold },
        lastAlertAt: {
          $lt: new Date(Date.now() - 10 * 60 * 1000) // Último alerta há mais de 10 minutos
        }
      }).limit(10);

      for (const transaction of staleTransactions) {
        await this.sendAlert('transaction_stale', {
          transactionHash: transaction.transactionHash,
          userId: transaction.userId,
          ageMinutes: Math.floor((Date.now() - transaction.createdAt.getTime()) / 60000)
        });

        // Atualizar timestamp do último alerta
        transaction.lastAlertAt = new Date();
        await transaction.save();
      }

    } catch (error) {
      console.error('Error checking stale transactions:', error);
    }
  }

  /**
   * Tentar novamente transações falhadas que podem ser recuperadas
   */
  async retryFailedTransactions() {
    try {
      const retryableTransactions = await NFTTransaction.find({
        status: 'failed',
        retryCount: { $lt: this.alertThresholds.maxRetries },
        lastRetryAt: {
          $lt: new Date(Date.now() - 15 * 60 * 1000) // Último retry há mais de 15 minutos
        },
        errorMessage: {
          $not: /permanent|reverted|insufficient funds/i // Não retry erros permanentes
        }
      }).limit(5);

      for (const transaction of retryableTransactions) {
        try {
          console.log(`Retrying failed transaction: ${transaction.transactionHash}`);
          
          // Verificar status novamente
          await this.checkTransactionStatus(transaction);
          
        } catch (error) {
          console.error(`Error retrying transaction ${transaction.transactionHash}:`, error);
          await transaction.incrementRetry();
        }
      }

    } catch (error) {
      console.error('Error retrying failed transactions:', error);
    }
  }

  /**
   * Obter provider para uma rede específica
   * @param {string} network - Nome da rede
   * @returns {ethers.Provider} Provider da rede
   */
  getProviderForNetwork(network) {
    return this.providers.get(network);
  }

  /**
   * Configurar callbacks padrão de alerta
   */
  setupDefaultAlertCallbacks() {
    // Alerta para transações falhadas
    this.alertCallbacks.set('transaction_failed', async (data) => {
      console.error(`🚨 ALERT: Transaction failed - ${data.transactionHash}`);
      console.error(`User: ${data.userId}, Error: ${data.error}`);
      
      // Publicar evento de alerta
      await eventService.publishEvent({
        eventType: 'alert_transaction_failed',
        userId: data.userId,
        eventData: data,
        source: 'transaction_monitor'
      });
    });

    // Alerta para transações timeout
    this.alertCallbacks.set('transaction_timeout', async (data) => {
      console.warn(`⏰ ALERT: Transaction timeout - ${data.transactionHash}`);
      console.warn(`User: ${data.userId}, Age: ${data.ageMinutes} minutes`);
      
      await eventService.publishEvent({
        eventType: 'alert_transaction_timeout',
        userId: data.userId,
        eventData: data,
        source: 'transaction_monitor'
      });
    });

    // Alerta para transações dropadas
    this.alertCallbacks.set('transaction_dropped', async (data) => {
      console.warn(`📉 ALERT: Transaction dropped - ${data.transactionHash}`);
      console.warn(`User: ${data.userId}, Age: ${data.ageHours} hours`);
      
      await eventService.publishEvent({
        eventType: 'alert_transaction_dropped',
        userId: data.userId,
        eventData: data,
        source: 'transaction_monitor'
      });
    });

    // Alerta para transações stale
    this.alertCallbacks.set('transaction_stale', async (data) => {
      console.warn(`🐌 ALERT: Stale transaction - ${data.transactionHash}`);
      console.warn(`User: ${data.userId}, Age: ${data.ageMinutes} minutes`);
    });

    // Alerta para erros de monitoramento
    this.alertCallbacks.set('monitoring_error', async (data) => {
      console.error(`💥 ALERT: Monitoring error - ${data.error}`);
      console.error(`Timestamp: ${data.timestamp}`);
    });
  }

  /**
   * Enviar alerta
   * @param {string} alertType - Tipo do alerta
   * @param {Object} data - Dados do alerta
   */
  async sendAlert(alertType, data) {
    try {
      const callback = this.alertCallbacks.get(alertType);
      
      if (callback) {
        await callback(data);
      } else {
        console.warn(`No alert callback configured for type: ${alertType}`);
      }

    } catch (error) {
      console.error(`Error sending alert ${alertType}:`, error);
    }
  }

  /**
   * Registrar callback personalizado de alerta
   * @param {string} alertType - Tipo do alerta
   * @param {Function} callback - Função callback
   */
  registerAlertCallback(alertType, callback) {
    this.alertCallbacks.set(alertType, callback);
  }

  /**
   * Obter estatísticas de transações
   * @param {Object} filters - Filtros opcionais
   * @returns {Object} Estatísticas
   */
  async getTransactionStatistics(filters = {}) {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const baseQuery = { ...filters };

      const [total, pending, confirmed, failed, last24hCount, last7dCount] = await Promise.all([
        NFTTransaction.countDocuments(baseQuery),
        NFTTransaction.countDocuments({ ...baseQuery, status: 'pending' }),
        NFTTransaction.countDocuments({ ...baseQuery, status: 'confirmed' }),
        NFTTransaction.countDocuments({ ...baseQuery, status: 'failed' }),
        NFTTransaction.countDocuments({ ...baseQuery, createdAt: { $gte: last24h } }),
        NFTTransaction.countDocuments({ ...baseQuery, createdAt: { $gte: last7d } })
      ]);

      const successRate = total > 0 ? ((confirmed / total) * 100).toFixed(2) : 0;
      const failureRate = total > 0 ? ((failed / total) * 100).toFixed(2) : 0;

      return {
        total,
        pending,
        confirmed,
        failed,
        successRate: parseFloat(successRate),
        failureRate: parseFloat(failureRate),
        last24h: last24hCount,
        last7d: last7dCount,
        isMonitoring: this.isMonitoring,
        alertThresholds: this.alertThresholds
      };

    } catch (error) {
      console.error('Error getting transaction statistics:', error);
      throw error;
    }
  }

  /**
   * Obter transações com problemas
   * @returns {Object} Transações problemáticas
   */
  async getProblematicTransactions() {
    try {
      const staleThreshold = new Date(Date.now() - (this.alertThresholds.pendingTimeoutMinutes * 60 * 1000));
      
      const [stalePending, recentFailed, highRetryCount] = await Promise.all([
        NFTTransaction.find({
          status: 'pending',
          createdAt: { $lt: staleThreshold }
        }).limit(10).sort({ createdAt: 1 }),
        
        NFTTransaction.find({
          status: 'failed',
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).limit(10).sort({ createdAt: -1 }),
        
        NFTTransaction.find({
          retryCount: { $gte: 2 }
        }).limit(10).sort({ retryCount: -1 })
      ]);

      return {
        stalePending,
        recentFailed,
        highRetryCount
      };

    } catch (error) {
      console.error('Error getting problematic transactions:', error);
      throw error;
    }
  }
}

module.exports = new TransactionMonitorService();