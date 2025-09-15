const mongoose = require('mongoose');
const Redis = require('redis');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Configuração global para testes
let mongoServer;
let redisClient;

// Setup antes de todos os testes
before(async function() {
  this.timeout(60000); // 60 segundos para setup
  
  console.log('Setting up test environment...');
  
  // Configurar MongoDB em memória para testes
  if (process.env.NODE_ENV === 'test' && !process.env.MONGODB_TEST_URI) {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_TEST_URI = mongoUri;
    console.log(`MongoDB Memory Server started at: ${mongoUri}`);
  }
  
  // Configurar variáveis de ambiente para testes
  process.env.NODE_ENV = 'test';
  process.env.REDIS_TEST_HOST = process.env.REDIS_TEST_HOST || 'localhost';
  process.env.REDIS_TEST_PORT = process.env.REDIS_TEST_PORT || '6379';
  
  console.log('Test environment configured');
});

// Cleanup após todos os testes
after(async function() {
  this.timeout(30000); // 30 segundos para cleanup
  
  console.log('Cleaning up test environment...');
  
  // Fechar conexão MongoDB
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('MongoDB connection closed');
  }
  
  // Parar MongoDB Memory Server
  if (mongoServer) {
    await mongoServer.stop();
    console.log('MongoDB Memory Server stopped');
  }
  
  // Fechar conexão Redis se existir
  if (redisClient && redisClient.isOpen) {
    await redisClient.disconnect();
    console.log('Redis connection closed');
  }
  
  console.log('Test environment cleaned up');
});

// Configurações globais para Mocha
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Timeout padrão para testes
if (typeof global.it === 'function') {
  global.it.timeout = function(timeout) {
    this.timeout(timeout);
    return this;
  };
}

module.exports = {
  mongoServer,
  redisClient
};