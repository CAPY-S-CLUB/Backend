const eventService = require('../services/eventService');
const badgeRuleEngine = require('../services/badgeRuleEngine');
const EventLog = require('../models/EventLog');
const NFTTransaction = require('../models/NFTTransaction');

class BadgeWorker {
  constructor() {
    this.isRunning = false;
    this.shouldStop = false;
    this.processedCount = 0;
    this.errorCount = 0;
    this.startTime = null;
    this.healthCheckInterval = null;
    this.retryFailedInterval = null;
    this.cleanupInterval = null;
  }

  /**
   * Iniciar o worker
   */
  async start() {
    if (this.isRunning) {
      console.log('Badge worker is already running');
      return;
    }

    try {
      console.log('Starting Badge Worker...');
      this.isRunning = true;
      this.shouldStop = false;
      this.startTime = new Date();
      this.processedCount = 0;
      this.errorCount = 0;

      // Configurar handlers de sinal para graceful shutdown
      this.setupSignalHandlers();

      // Iniciar intervalos de manutenção
      this.startMaintenanceIntervals();

      // Processar eventos pendentes primeiro
      await this.processUnprocessedEvents();

      // Iniciar consumo contínuo de eventos
      console.log('Badge Worker started successfully');
      await eventService.consumeEvents(
        this.processEvent.bind(this),
        10, // Processar 10 eventos por vez
        5000 // Timeout de 5 segundos
      );

    } catch (error) {
      console.error('Error starting Badge Worker:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Parar o worker
   */
  async stop() {
    console.log('Stopping Badge Worker...');
    this.shouldStop = true;

    // Parar intervalos de manutenção
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.retryFailedInterval) {
      clearInterval(this.retryFailedInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Aguardar um pouco para processar eventos em andamento
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.isRunning = false;
    console.log('Badge Worker stopped');
  }

  /**
   * Processar um evento individual
   * @param {Object} eventData - Dados do evento
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processEvent(eventData) {
    const startTime = Date.now();
    
    try {
      console.log(`Processing event: ${eventData.eventType} for user ${eventData.userId}`);

      // Processar evento através da rule engine
      const result = await badgeRuleEngine.processEvent(eventData);

      // Incrementar contador de sucesso
      this.processedCount++;

      const processingTime = Date.now() - startTime;
      console.log(`Event processed successfully in ${processingTime}ms: ${eventData.eventType}`);

      return result;

    } catch (error) {
      this.errorCount++;
      const processingTime = Date.now() - startTime;
      
      console.error(`Error processing event ${eventData.eventType} (${processingTime}ms):`, error);
      
      // Retornar erro para que o EventService possa lidar com retry
      throw error;
    }
  }

  /**
   * Processar eventos não processados do banco de dados
   */
  async processUnprocessedEvents() {
    try {
      console.log('Processing unprocessed events from database...');
      
      const unprocessedEvents = await EventLog.findUnprocessedEvents(50);
      
      if (unprocessedEvents.length === 0) {
        console.log('No unprocessed events found');
        return;
      }

      console.log(`Found ${unprocessedEvents.length} unprocessed events`);

      for (const eventLog of unprocessedEvents) {
        try {
          // Marcar como processando
          await eventLog.markAsProcessing();

          // Preparar dados do evento
          const eventData = {
            eventType: eventLog.eventType,
            userId: eventLog.userId,
            eventData: eventLog.eventData,
            metadata: eventLog.metadata,
            timestamp: eventLog.createdAt.getTime(),
            source: eventLog.source
          };

          // Processar evento
          const result = await badgeRuleEngine.processEvent(eventData);

          // Marcar como processado
          await eventLog.markAsProcessed(
            result.rulesMatched || [],
            result.nftTransactions || []
          );

          this.processedCount++;
          console.log(`Unprocessed event ${eventLog._id} processed successfully`);

        } catch (error) {
          console.error(`Error processing unprocessed event ${eventLog._id}:`, error);
          
          // Marcar como falhou
          await eventLog.markAsFailed(error.message);
          this.errorCount++;
        }
      }

      console.log(`Finished processing unprocessed events. Processed: ${unprocessedEvents.length}`);

    } catch (error) {
      console.error('Error processing unprocessed events:', error);
    }
  }

  /**
   * Configurar handlers de sinal para graceful shutdown
   */
  setupSignalHandlers() {
    const gracefulShutdown = async (signal) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGUSR2', gracefulShutdown); // Para nodemon
  }

  /**
   * Iniciar intervalos de manutenção
   */
  startMaintenanceIntervals() {
    // Health check a cada 30 segundos
    this.healthCheckInterval = setInterval(() => {
      this.logHealthStatus();
    }, 30000);

    // Retry de eventos falhados a cada 5 minutos
    this.retryFailedInterval = setInterval(async () => {
      await this.retryFailedEvents();
    }, 5 * 60 * 1000);

    // Cleanup de logs antigos a cada hora
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldLogs();
    }, 60 * 60 * 1000);
  }

  /**
   * Log do status de saúde do worker
   */
  logHealthStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const uptimeMinutes = Math.floor(uptime / 60000);
    
    console.log(`Badge Worker Health Check:`);
    console.log(`  Status: ${this.isRunning ? 'Running' : 'Stopped'}`);
    console.log(`  Uptime: ${uptimeMinutes} minutes`);
    console.log(`  Events Processed: ${this.processedCount}`);
    console.log(`  Errors: ${this.errorCount}`);
    console.log(`  Success Rate: ${this.processedCount > 0 ? ((this.processedCount / (this.processedCount + this.errorCount)) * 100).toFixed(2) : 0}%`);
  }

  /**
   * Retry de eventos falhados
   */
  async retryFailedEvents() {
    try {
      console.log('Retrying failed events...');
      
      // Buscar eventos falhados que podem ser retentados
      const failedEvents = await EventLog.find({
        status: 'failed',
        retryCount: { $lt: 3 },
        lastRetryAt: {
          $lt: new Date(Date.now() - 10 * 60 * 1000) // Último retry há mais de 10 minutos
        }
      }).limit(10);

      if (failedEvents.length === 0) {
        return;
      }

      console.log(`Found ${failedEvents.length} failed events to retry`);

      for (const eventLog of failedEvents) {
        try {
          // Incrementar retry count
          await eventLog.incrementRetry();

          // Preparar dados do evento
          const eventData = {
            eventType: eventLog.eventType,
            userId: eventLog.userId,
            eventData: eventLog.eventData,
            metadata: eventLog.metadata,
            timestamp: eventLog.createdAt.getTime(),
            source: eventLog.source
          };

          // Processar evento
          const result = await badgeRuleEngine.processEvent(eventData);

          // Marcar como processado
          await eventLog.markAsProcessed(
            result.rulesMatched || [],
            result.nftTransactions || []
          );

          console.log(`Failed event ${eventLog._id} retried successfully`);

        } catch (error) {
          console.error(`Error retrying failed event ${eventLog._id}:`, error);
          await eventLog.markAsFailed(`Retry failed: ${error.message}`);
        }
      }

    } catch (error) {
      console.error('Error retrying failed events:', error);
    }
  }

  /**
   * Cleanup de logs antigos
   */
  async cleanupOldLogs() {
    try {
      console.log('Cleaning up old logs...');
      
      // Remover logs de eventos processados com mais de 30 dias
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const deletedEvents = await EventLog.deleteMany({
        status: 'processed',
        createdAt: { $lt: thirtyDaysAgo }
      });

      // Remover transações NFT antigas confirmadas (manter por mais tempo)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      const deletedTransactions = await NFTTransaction.deleteMany({
        status: 'confirmed',
        createdAt: { $lt: ninetyDaysAgo }
      });

      if (deletedEvents.deletedCount > 0 || deletedTransactions.deletedCount > 0) {
        console.log(`Cleanup completed:`);
        console.log(`  Event logs deleted: ${deletedEvents.deletedCount}`);
        console.log(`  NFT transactions deleted: ${deletedTransactions.deletedCount}`);
      }

    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Obter estatísticas do worker
   */
  getStatistics() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: uptime,
      uptimeFormatted: this.formatUptime(uptime),
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      successRate: this.processedCount > 0 ? 
        ((this.processedCount / (this.processedCount + this.errorCount)) * 100).toFixed(2) : 0,
      eventsPerMinute: uptime > 0 ? 
        ((this.processedCount / (uptime / 60000)).toFixed(2)) : 0
    };
  }

  /**
   * Formatar tempo de uptime
   */
  formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / 60000) % 60;
    const hours = Math.floor(uptime / 3600000) % 24;
    const days = Math.floor(uptime / 86400000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Criar instância única do worker
const badgeWorker = new BadgeWorker();

// Se executado diretamente, iniciar o worker
if (require.main === module) {
  console.log('Starting Badge Worker as standalone process...');
  
  badgeWorker.start().catch(error => {
    console.error('Failed to start Badge Worker:', error);
    process.exit(1);
  });
}

module.exports = badgeWorker;