const request = require('supertest');
const mongoose = require('mongoose');
const Redis = require('redis');
const { expect } = require('chai');
const sinon = require('sinon');

// Services
const eventService = require('../../services/eventService');
const badgeRuleEngine = require('../../services/badgeRuleEngine');
const nftMintService = require('../../services/nftMintService');
const antiFraudService = require('../../services/antiFraudService');
const transactionMonitorService = require('../../services/transactionMonitorService');
const badgeWorker = require('../../workers/badgeWorker');

// Models
const NFTTransaction = require('../../models/NFTTransaction');
const BadgeRule = require('../../models/BadgeRule');
const EventLog = require('../../models/EventLog');
const User = require('../../models/User');

describe('NFT Reward System - Integration Tests', function() {
  this.timeout(30000); // 30 segundos timeout para testes de integração
  
  let redisClient;
  let testUser;
  let testBadgeRule;
  let mockWalletService;
  
  before(async function() {
    // Conectar ao banco de teste
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/hackmeridian_test';
    await mongoose.connect(mongoUri);
    
    // Conectar ao Redis de teste
    redisClient = Redis.createClient({
      host: process.env.REDIS_TEST_HOST || 'localhost',
      port: process.env.REDIS_TEST_PORT || 6379,
      db: 1 // Usar database 1 para testes
    });
    await redisClient.connect();
    
    // Inicializar serviços
    await eventService.initialize({ redis: { db: 1 } });
    await antiFraudService.initialize({ redis: { db: 1 } });
    await transactionMonitorService.initialize();
    
    // Mock do WalletService
    mockWalletService = {
      mintNFT: sinon.stub(),
      transferNFT: sinon.stub(),
      getWalletBalance: sinon.stub(),
      isValidAddress: sinon.stub().returns(true)
    };
    
    // Substituir WalletService no nftMintService
    nftMintService.walletService = mockWalletService;
    
    console.log('Test environment initialized');
  });
  
  after(async function() {
    // Limpar dados de teste
    await Promise.all([
      NFTTransaction.deleteMany({}),
      BadgeRule.deleteMany({}),
      EventLog.deleteMany({}),
      User.deleteMany({ email: { $regex: /test.*@test\.com/ } })
    ]);
    
    // Fechar conexões
    await redisClient.flushDb(); // Limpar Redis de teste
    await redisClient.disconnect();
    await mongoose.disconnect();
    
    console.log('Test environment cleaned up');
  });
  
  beforeEach(async function() {
    // Limpar dados antes de cada teste
    await Promise.all([
      NFTTransaction.deleteMany({}),
      BadgeRule.deleteMany({}),
      EventLog.deleteMany({}),
      redisClient.flushDb()
    ]);
    
    // Criar usuário de teste
    testUser = await User.create({
      email: 'test.user@test.com',
      username: 'testuser',
      walletAddress: '0x1234567890123456789012345678901234567890',
      isActive: true
    });
    
    // Criar regra de badge de teste
    testBadgeRule = await BadgeRule.create({
      name: 'Test Attendee Badge',
      description: 'Badge for test event attendance',
      eventType: 'user_attended_event',
      conditions: {
        eventId: 'test_event_2025'
      },
      nftMetadata: {
        name: 'Test Event Attendee',
        description: 'You attended the test event!',
        image: 'https://example.com/test-badge.svg',
        attributes: [
          { trait_type: 'Event', value: 'Test Event 2025' },
          { trait_type: 'Type', value: 'Attendance' }
        ]
      },
      contractAddress: '0xTestContract123456789012345678901234567890',
      isActive: true,
      oneTimeOnly: true
    });
    
    // Reset mocks
    mockWalletService.mintNFT.reset();
    mockWalletService.transferNFT.reset();
    mockWalletService.getWalletBalance.reset();
  });
  
  describe('End-to-End NFT Reward Flow', function() {
    
    it('should complete full reward flow: event -> rule matching -> NFT mint', async function() {
      // Configurar mock para mint bem-sucedido
      mockWalletService.mintNFT.resolves({
        success: true,
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        tokenId: '1',
        gasUsed: '150000'
      });
      
      // 1. Publicar evento de participação
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025',
          attendedAt: new Date().toISOString(),
          location: 'Test Venue'
        },
        source: 'test_system'
      };
      
      await eventService.publishEvent(eventData);
      
      // 2. Processar evento através da rule engine
      const ruleResult = await badgeRuleEngine.processEvent(eventData);
      
      // Verificar que a regra foi matched
      expect(ruleResult.success).to.be.true;
      expect(ruleResult.rulesMatched).to.have.length(1);
      expect(ruleResult.rulesMatched[0].ruleId.toString()).to.equal(testBadgeRule._id.toString());
      
      // 3. Verificar que a transação NFT foi criada
      const nftTransaction = await NFTTransaction.findOne({
        userId: testUser._id,
        badgeRuleId: testBadgeRule._id
      });
      
      expect(nftTransaction).to.not.be.null;
      expect(nftTransaction.status).to.equal('pending');
      expect(nftTransaction.transactionHash).to.equal('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
      
      // 4. Verificar que o mint foi chamado
      expect(mockWalletService.mintNFT.calledOnce).to.be.true;
      
      const mintCall = mockWalletService.mintNFT.getCall(0);
      expect(mintCall.args[0]).to.equal(testUser.walletAddress);
      expect(mintCall.args[1]).to.equal(testBadgeRule.contractAddress);
      
      // 5. Verificar que o evento foi registrado
      const eventLog = await EventLog.findOne({
        userId: testUser._id,
        eventType: 'user_attended_event'
      });
      
      expect(eventLog).to.not.be.null;
      expect(eventLog.status).to.equal('processed');
    });
    
    it('should prevent duplicate badge minting for same user', async function() {
      // Criar transação NFT existente
      await NFTTransaction.create({
        userId: testUser._id,
        badgeRuleId: testBadgeRule._id,
        transactionHash: '0xexisting123',
        status: 'confirmed',
        contractAddress: testBadgeRule.contractAddress,
        tokenId: '1'
      });
      
      // Tentar processar evento novamente
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025'
        },
        source: 'test_system'
      };
      
      const ruleResult = await badgeRuleEngine.processEvent(eventData);
      
      // Verificar que não foi criada nova transação
      expect(ruleResult.success).to.be.true;
      expect(ruleResult.rulesMatched).to.have.length(0);
      expect(ruleResult.skippedRules).to.have.length(1);
      expect(ruleResult.skippedRules[0].reason).to.include('already has this badge');
      
      // Verificar que mint não foi chamado
      expect(mockWalletService.mintNFT.called).to.be.false;
    });
    
    it('should handle mint failures gracefully', async function() {
      // Configurar mock para falha no mint
      mockWalletService.mintNFT.rejects(new Error('Insufficient gas'));
      
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025'
        },
        source: 'test_system'
      };
      
      const ruleResult = await badgeRuleEngine.processEvent(eventData);
      
      // Verificar que o erro foi tratado
      expect(ruleResult.success).to.be.false;
      expect(ruleResult.errors).to.have.length(1);
      expect(ruleResult.errors[0]).to.include('Insufficient gas');
      
      // Verificar que a transação foi marcada como falhada
      const nftTransaction = await NFTTransaction.findOne({
        userId: testUser._id,
        badgeRuleId: testBadgeRule._id
      });
      
      expect(nftTransaction).to.not.be.null;
      expect(nftTransaction.status).to.equal('failed');
      expect(nftTransaction.errorMessage).to.include('Insufficient gas');
    });
  });
  
  describe('Anti-Fraud System Integration', function() {
    
    it('should block rapid successive events from same user', async function() {
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025'
        },
        source: 'test_system'
      };
      
      // Publicar múltiplos eventos rapidamente
      for (let i = 0; i < 6; i++) {
        await eventService.publishEvent({
          ...eventData,
          eventData: {
            ...eventData.eventData,
            sequence: i
          }
        });
      }
      
      // Verificar rate limiting
      const rateLimitCheck = await antiFraudService.checkUserRateLimit(
        testUser._id.toString(),
        'events',
        'minute'
      );
      
      expect(rateLimitCheck.allowed).to.be.false;
      expect(rateLimitCheck.reason).to.include('rate limit exceeded');
    });
    
    it('should detect and flag suspicious patterns', async function() {
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025',
          walletAddress: testUser.walletAddress
        },
        source: 'test_system'
      };
      
      // Criar padrão suspeito - múltiplos eventos do mesmo tipo
      for (let i = 0; i < 4; i++) {
        await EventLog.create({
          eventType: 'user_attended_event',
          userId: testUser._id,
          eventData: eventData.eventData,
          status: 'processed',
          createdAt: new Date(Date.now() - (i * 10 * 60 * 1000)) // 10 minutos de diferença
        });
      }
      
      const fraudAnalysis = await antiFraudService.detectFraudPatterns(
        testUser._id.toString(),
        eventData
      );
      
      expect(fraudAnalysis.riskScore).to.be.greaterThan(0);
      expect(fraudAnalysis.suspiciousActivities).to.have.length.greaterThan(0);
      expect(fraudAnalysis.action).to.be.oneOf(['monitor', 'review', 'block']);
    });
    
    it('should perform comprehensive security check', async function() {
      const checkParams = {
        userId: testUser._id.toString(),
        ipAddress: '192.168.1.100',
        eventData: {
          eventType: 'user_attended_event',
          walletAddress: testUser.walletAddress
        },
        badgeRuleId: testBadgeRule._id.toString(),
        action: 'mint'
      };
      
      const securityCheck = await antiFraudService.performComprehensiveCheck(checkParams);
      
      expect(securityCheck).to.have.property('allowed');
      expect(securityCheck).to.have.property('checks');
      expect(securityCheck).to.have.property('riskAssessment');
      expect(securityCheck.checks).to.have.property('userRateLimit');
      expect(securityCheck.checks).to.have.property('globalRateLimit');
      expect(securityCheck.checks).to.have.property('badgeEligibility');
    });
  });
  
  describe('Transaction Monitoring Integration', function() {
    
    it('should monitor and update transaction status', async function() {
      // Criar transação pendente
      const transaction = await NFTTransaction.create({
        userId: testUser._id,
        badgeRuleId: testBadgeRule._id,
        transactionHash: '0xpending123456789012345678901234567890123456789012345678901234',
        status: 'pending',
        contractAddress: testBadgeRule.contractAddress,
        tokenId: '1'
      });
      
      // Mock do provider para simular transação confirmada
      const mockProvider = {
        getTransactionReceipt: sinon.stub().resolves({
          status: 1,
          blockNumber: 12345,
          gasUsed: { toString: () => '150000' }
        })
      };
      
      // Substituir provider no serviço
      transactionMonitorService.providers.set('ethereum', mockProvider);
      
      // Verificar status da transação
      await transactionMonitorService.checkTransactionStatus(transaction);
      
      // Recarregar transação do banco
      await transaction.reload();
      
      expect(transaction.status).to.equal('confirmed');
      expect(mockProvider.getTransactionReceipt.calledOnce).to.be.true;
    });
    
    it('should detect stale transactions', async function() {
      // Criar transação antiga pendente
      const oldTransaction = await NFTTransaction.create({
        userId: testUser._id,
        badgeRuleId: testBadgeRule._id,
        transactionHash: '0xstale1234567890123456789012345678901234567890123456789012345678',
        status: 'pending',
        contractAddress: testBadgeRule.contractAddress,
        tokenId: '1',
        createdAt: new Date(Date.now() - 45 * 60 * 1000) // 45 minutos atrás
      });
      
      await transactionMonitorService.checkStaleTransactions();
      
      // Verificar que alerta foi enviado (através de eventos)
      const alertEvent = await EventLog.findOne({
        eventType: 'alert_transaction_timeout'
      });
      
      expect(alertEvent).to.not.be.null;
    });
  });
  
  describe('Badge Worker Integration', function() {
    
    it('should process unprocessed events from database', async function() {
      // Criar evento não processado
      await EventLog.create({
        eventType: 'user_attended_event',
        userId: testUser._id,
        eventData: {
          eventId: 'test_event_2025'
        },
        status: 'pending',
        source: 'test_system'
      });
      
      // Configurar mock para mint bem-sucedido
      mockWalletService.mintNFT.resolves({
        success: true,
        transactionHash: '0xworker123456789012345678901234567890123456789012345678901234',
        tokenId: '1'
      });
      
      // Processar eventos não processados
      await badgeWorker.processUnprocessedEvents();
      
      // Verificar que evento foi processado
      const processedEvent = await EventLog.findOne({
        userId: testUser._id,
        eventType: 'user_attended_event'
      });
      
      expect(processedEvent.status).to.equal('processed');
      
      // Verificar que transação NFT foi criada
      const nftTransaction = await NFTTransaction.findOne({
        userId: testUser._id,
        badgeRuleId: testBadgeRule._id
      });
      
      expect(nftTransaction).to.not.be.null;
      expect(nftTransaction.status).to.equal('pending');
    });
    
    it('should retry failed events', async function() {
      // Criar evento falhado
      const failedEvent = await EventLog.create({
        eventType: 'user_attended_event',
        userId: testUser._id,
        eventData: {
          eventId: 'test_event_2025'
        },
        status: 'failed',
        retryCount: 1,
        lastRetryAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutos atrás
        source: 'test_system'
      });
      
      // Configurar mock para mint bem-sucedido no retry
      mockWalletService.mintNFT.resolves({
        success: true,
        transactionHash: '0xretry1234567890123456789012345678901234567890123456789012345',
        tokenId: '1'
      });
      
      // Tentar novamente eventos falhados
      await badgeWorker.retryFailedEvents();
      
      // Recarregar evento
      await failedEvent.reload();
      
      expect(failedEvent.status).to.equal('processed');
      expect(failedEvent.retryCount).to.equal(2);
    });
  });
  
  describe('Performance and Load Testing', function() {
    
    it('should handle multiple concurrent events efficiently', async function() {
      const concurrentEvents = 10;
      const eventPromises = [];
      
      // Configurar mock para múltiplos mints
      mockWalletService.mintNFT.resolves({
        success: true,
        transactionHash: '0xconcurrent123456789012345678901234567890123456789012345678',
        tokenId: '1'
      });
      
      // Criar múltiplas regras de badge
      const badgeRules = [];
      for (let i = 0; i < concurrentEvents; i++) {
        const rule = await BadgeRule.create({
          name: `Concurrent Badge ${i}`,
          eventType: 'user_concurrent_test',
          conditions: { testId: i },
          nftMetadata: {
            name: `Concurrent Test ${i}`,
            description: 'Concurrent test badge'
          },
          contractAddress: `0xConcurrent${i.toString().padStart(38, '0')}`,
          isActive: true
        });
        badgeRules.push(rule);
      }
      
      // Processar eventos concorrentemente
      for (let i = 0; i < concurrentEvents; i++) {
        const eventData = {
          eventType: 'user_concurrent_test',
          userId: testUser._id.toString(),
          eventData: {
            testId: i,
            timestamp: Date.now()
          },
          source: 'concurrent_test'
        };
        
        eventPromises.push(badgeRuleEngine.processEvent(eventData));
      }
      
      const results = await Promise.all(eventPromises);
      
      // Verificar que todos os eventos foram processados
      results.forEach((result, index) => {
        expect(result.success).to.be.true;
        expect(result.rulesMatched).to.have.length(1);
      });
      
      // Verificar que todas as transações foram criadas
      const transactions = await NFTTransaction.find({
        userId: testUser._id
      });
      
      expect(transactions).to.have.length(concurrentEvents);
    });
  });
  
  describe('Error Handling and Recovery', function() {
    
    it('should handle database connection errors gracefully', async function() {
      // Simular erro de conexão
      const originalFind = BadgeRule.find;
      BadgeRule.find = sinon.stub().rejects(new Error('Database connection lost'));
      
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025'
        },
        source: 'test_system'
      };
      
      const result = await badgeRuleEngine.processEvent(eventData);
      
      expect(result.success).to.be.false;
      expect(result.errors).to.have.length(1);
      expect(result.errors[0]).to.include('Database connection lost');
      
      // Restaurar método original
      BadgeRule.find = originalFind;
    });
    
    it('should handle Redis connection errors gracefully', async function() {
      // Desconectar Redis temporariamente
      await redisClient.disconnect();
      
      const eventData = {
        eventType: 'user_attended_event',
        userId: testUser._id.toString(),
        eventData: {
          eventId: 'test_event_2025'
        },
        source: 'test_system'
      };
      
      // Tentar publicar evento (deve falhar graciosamente)
      try {
        await eventService.publishEvent(eventData);
      } catch (error) {
        expect(error.message).to.include('Redis');
      }
      
      // Reconectar Redis
      await redisClient.connect();
    });
  });
});

// Helper para aguardar processamento assíncrono
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}