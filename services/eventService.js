const Redis = require('redis');
const EventLog = require('../models/EventLog');

class EventService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.streamName = 'nft-badge-events';
    this.consumerGroup = 'badge-processors';
    this.consumerName = `processor-${process.pid}`;
    this.eventTypes = {
      USER_ATTENDED_EVENT: 'user_attended_event',
      USER_MADE_FIRST_POST: 'user_made_first_post',
      USER_COMPLETED_PROFILE: 'user_completed_profile',
      USER_JOINED_COMMUNITY: 'user_joined_community',
      USER_INVITED_FRIEND: 'user_invited_friend',
      USER_PURCHASED_PRODUCT: 'user_purchased_product',
      USER_SHARED_CONTENT: 'user_shared_content',
      USER_REACHED_MILESTONE: 'user_reached_milestone'
    };
  }

  /**
   * Inicializar conexão com Redis
   */
  async initialize() {
    if (this.isConnected) return;

    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3
      };

      this.client = Redis.createClient(redisConfig);

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
      });

      this.client.on('ready', () => {
        console.log('Redis client ready');
        this.isConnected = true;
      });

      await this.client.connect();
      
      // Criar consumer group se não existir
      await this.createConsumerGroup();
      
      console.log('Event Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Event Service:', error);
      throw new Error('Event Service initialization failed');
    }
  }

  /**
   * Criar consumer group para o stream
   */
  async createConsumerGroup() {
    try {
      await this.client.xGroupCreate(this.streamName, this.consumerGroup, '0', {
        MKSTREAM: true
      });
      console.log(`Consumer group '${this.consumerGroup}' created`);
    } catch (error) {
      if (error.message.includes('BUSYGROUP')) {
        console.log(`Consumer group '${this.consumerGroup}' already exists`);
      } else {
        console.error('Error creating consumer group:', error);
        throw error;
      }
    }
  }

  /**
   * Publicar evento no stream
   * @param {string} eventType - Tipo do evento
   * @param {string} userId - ID do usuário
   * @param {Object} eventData - Dados do evento
   * @param {Object} metadata - Metadados adicionais
   * @returns {Promise<string>} ID do evento no stream
   */
  async publishEvent(eventType, userId, eventData = {}, metadata = {}) {
    try {
      await this.initialize();

      // Validar tipo de evento
      if (!Object.values(this.eventTypes).includes(eventType)) {
        throw new Error(`Invalid event type: ${eventType}`);
      }

      // Preparar dados do evento
      const eventPayload = {
        eventType,
        userId,
        eventData: JSON.stringify(eventData),
        metadata: JSON.stringify(metadata),
        timestamp: Date.now().toString(),
        source: metadata.source || 'api'
      };

      // Publicar no Redis Stream
      const streamId = await this.client.xAdd(this.streamName, '*', eventPayload);

      // Salvar no banco de dados para auditoria
      const eventLog = new EventLog({
        eventType,
        eventName: eventType,
        userId,
        eventData,
        source: metadata.source || 'api',
        status: 'received',
        metadata: {
          streamId,
          ...metadata
        }
      });

      await eventLog.save();

      console.log(`Event published: ${eventType} for user ${userId} with stream ID ${streamId}`);
      
      return {
        success: true,
        streamId,
        eventLogId: eventLog._id,
        message: 'Event published successfully'
      };

    } catch (error) {
      console.error('Error publishing event:', error);
      throw new Error(`Failed to publish event: ${error.message}`);
    }
  }

  /**
   * Consumir eventos do stream
   * @param {Function} processor - Função para processar eventos
   * @param {number} count - Número de eventos para consumir por vez
   * @param {number} blockTime - Tempo de bloqueio em ms
   */
  async consumeEvents(processor, count = 10, blockTime = 5000) {
    try {
      await this.initialize();

      console.log(`Starting event consumer: ${this.consumerName}`);

      while (true) {
        try {
          // Ler eventos do stream
          const messages = await this.client.xReadGroup(
            this.consumerGroup,
            this.consumerName,
            [{
              key: this.streamName,
              id: '>'
            }],
            {
              COUNT: count,
              BLOCK: blockTime
            }
          );

          if (messages && messages.length > 0) {
            for (const stream of messages) {
              for (const message of stream.messages) {
                await this.processMessage(message, processor);
              }
            }
          }
        } catch (error) {
          console.error('Error consuming events:', error);
          // Aguardar antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } catch (error) {
      console.error('Fatal error in event consumer:', error);
      throw error;
    }
  }

  /**
   * Processar mensagem individual
   */
  async processMessage(message, processor) {
    const { id: messageId, message: messageData } = message;
    
    try {
      // Parse dos dados da mensagem
      const eventData = {
        streamId: messageId,
        eventType: messageData.eventType,
        userId: messageData.userId,
        eventData: JSON.parse(messageData.eventData || '{}'),
        metadata: JSON.parse(messageData.metadata || '{}'),
        timestamp: parseInt(messageData.timestamp),
        source: messageData.source
      };

      console.log(`Processing event: ${eventData.eventType} for user ${eventData.userId}`);

      // Atualizar status no banco
      const eventLog = await EventLog.findOne({ 
        'metadata.streamId': messageId 
      });
      
      if (eventLog) {
        await eventLog.markAsProcessing();
      }

      // Processar evento
      const result = await processor(eventData);

      // Marcar como processado
      if (eventLog) {
        await eventLog.markAsProcessed(
          result.rulesMatched || [],
          result.nftTransactions || []
        );
      }

      // Confirmar processamento no Redis
      await this.client.xAck(this.streamName, this.consumerGroup, messageId);

      console.log(`Event processed successfully: ${messageId}`);

    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);

      // Marcar como falhou no banco
      const eventLog = await EventLog.findOne({ 
        'metadata.streamId': messageId 
      });
      
      if (eventLog) {
        await eventLog.markAsFailed(error.message);
      }

      // Não fazer ACK para permitir reprocessamento
      // O Redis irá tentar redelivery automaticamente
    }
  }

  /**
   * Obter informações do stream
   */
  async getStreamInfo() {
    try {
      await this.initialize();

      const streamInfo = await this.client.xInfoStream(this.streamName);
      const groupInfo = await this.client.xInfoGroups(this.streamName);
      const consumerInfo = await this.client.xInfoConsumers(this.streamName, this.consumerGroup);

      return {
        stream: {
          length: streamInfo.length,
          firstEntry: streamInfo['first-entry'],
          lastEntry: streamInfo['last-entry']
        },
        groups: groupInfo,
        consumers: consumerInfo
      };
    } catch (error) {
      console.error('Error getting stream info:', error);
      return null;
    }
  }

  /**
   * Limpar mensagens antigas do stream
   * @param {number} maxLength - Comprimento máximo do stream
   */
  async trimStream(maxLength = 10000) {
    try {
      await this.initialize();
      
      const result = await this.client.xTrim(this.streamName, 'MAXLEN', '~', maxLength);
      console.log(`Stream trimmed, removed ${result} entries`);
      
      return result;
    } catch (error) {
      console.error('Error trimming stream:', error);
      throw error;
    }
  }

  /**
   * Reprocessar mensagens pendentes
   */
  async reprocessPendingMessages(processor) {
    try {
      await this.initialize();

      // Buscar mensagens pendentes
      const pendingMessages = await this.client.xPending(
        this.streamName,
        this.consumerGroup
      );

      if (pendingMessages.total > 0) {
        console.log(`Found ${pendingMessages.total} pending messages`);

        // Buscar detalhes das mensagens pendentes
        const pendingDetails = await this.client.xPendingRange(
          this.streamName,
          this.consumerGroup,
          '-',
          '+',
          100
        );

        for (const pending of pendingDetails) {
          const messageId = pending.id;
          
          // Claim da mensagem
          const claimedMessages = await this.client.xClaim(
            this.streamName,
            this.consumerGroup,
            this.consumerName,
            60000, // 1 minuto
            [messageId]
          );

          // Processar mensagens claimed
          for (const message of claimedMessages) {
            await this.processMessage(message, processor);
          }
        }
      }
    } catch (error) {
      console.error('Error reprocessing pending messages:', error);
    }
  }

  /**
   * Fechar conexão
   */
  async close() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Event Service connection closed');
    }
  }

  /**
   * Métodos de conveniência para eventos específicos
   */
  async publishUserAttendedEvent(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_ATTENDED_EVENT, userId, eventData);
  }

  async publishUserMadeFirstPost(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_MADE_FIRST_POST, userId, eventData);
  }

  async publishUserCompletedProfile(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_COMPLETED_PROFILE, userId, eventData);
  }

  async publishUserJoinedCommunity(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_JOINED_COMMUNITY, userId, eventData);
  }

  async publishUserInvitedFriend(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_INVITED_FRIEND, userId, eventData);
  }

  async publishUserPurchasedProduct(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_PURCHASED_PRODUCT, userId, eventData);
  }

  async publishUserSharedContent(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_SHARED_CONTENT, userId, eventData);
  }

  async publishUserReachedMilestone(userId, eventData) {
    return this.publishEvent(this.eventTypes.USER_REACHED_MILESTONE, userId, eventData);
  }
}

module.exports = new EventService();