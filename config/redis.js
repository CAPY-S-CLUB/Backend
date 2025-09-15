const Redis = require('ioredis');
require('dotenv').config();

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  family: 4, // 4 (IPv4) or 6 (IPv6)
};

// Create Redis client
const redis = new Redis(redisConfig);

// Redis event handlers
redis.on('connect', () => {
  console.log('Redis client connected successfully');
});

redis.on('ready', () => {
  console.log('Redis client ready to receive commands');
});

redis.on('error', (err) => {
  console.error('Redis client error:', err);
});

redis.on('close', () => {
  console.log('Redis client connection closed');
});

redis.on('reconnecting', () => {
  console.log('Redis client reconnecting...');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Redis connection...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing Redis connection...');
  await redis.quit();
  process.exit(0);
});

// Cache utility functions
const cacheUtils = {
  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (will be JSON stringified)
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<string>} Redis response
   */
  async set(key, value, ttlSeconds = 300) {
    try {
      const serializedValue = JSON.stringify(value);
      return await redis.setex(key, ttlSeconds, serializedValue);
    } catch (error) {
      console.error('Cache set error:', error);
      throw error;
    }
  },

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Parsed value or null if not found
   */
  async get(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   * @returns {Promise<number>} Number of keys deleted
   */
  async del(key) {
    try {
      return await redis.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
      throw error;
    }
  },

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async exists(key) {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  },

  /**
   * Get TTL (time to live) for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
   */
  async ttl(key) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -2;
    }
  },

  /**
   * Delete keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'user:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  async deletePattern(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length === 0) return 0;
      return await redis.del(...keys);
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      throw error;
    }
  },

  /**
   * Get cache statistics
   * @returns {Promise<object>} Cache statistics
   */
  async getStats() {
    try {
      const info = await redis.info('memory');
      const keyspace = await redis.info('keyspace');
      
      return {
        memory_usage: info,
        keyspace_info: keyspace,
        connected: redis.status === 'ready'
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }
};

module.exports = {
  redis,
  cacheUtils
};