const Redis = require('ioredis');

class CacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      // Initialize Redis connection
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      this.redis.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        console.error('Redis connection error:', error);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('Redis connection closed');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null
   */
  async get(key) {
    try {
      if (!this.isConnected) {
        console.warn('Redis not connected, skipping cache get');
        return null;
      }

      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with expiration
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value, ttl = 300) {
    try {
      if (!this.isConnected) {
        console.warn('Redis not connected, skipping cache set');
        return false;
      }

      const serializedValue = JSON.stringify(value);
      await this.redis.setex(key, ttl, serializedValue);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async del(key) {
    try {
      if (!this.isConnected) {
        console.warn('Redis not connected, skipping cache delete');
        return false;
      }

      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern - Key pattern (e.g., 'community:*')
   * @returns {Promise<boolean>} - Success status
   */
  async delPattern(pattern) {
    try {
      if (!this.isConnected) {
        console.warn('Redis not connected, skipping pattern delete');
        return false;
      }

      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Cache pattern delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Existence status
   */
  async exists(key) {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} - TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
   */
  async ttl(key) {
    try {
      if (!this.isConnected) {
        return -2;
      }

      return await this.redis.ttl(key);
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -2;
    }
  }

  /**
   * Generate cache key for community dashboard metrics
   * @param {string} communityId - Community ID
   * @returns {string} - Cache key
   */
  getDashboardMetricsKey(communityId) {
    return `community:${communityId}:dashboard:metrics`;
  }

  /**
   * Generate cache key for community member count
   * @param {string} communityId - Community ID
   * @returns {string} - Cache key
   */
  getMemberCountKey(communityId) {
    return `community:${communityId}:members:count`;
  }

  /**
   * Generate cache key for community active members
   * @param {string} communityId - Community ID
   * @returns {string} - Cache key
   */
  getActiveMembersKey(communityId) {
    return `community:${communityId}:members:active`;
  }

  /**
   * Generate cache key for community NFT stats
   * @param {string} communityId - Community ID
   * @returns {string} - Cache key
   */
  getNFTStatsKey(communityId) {
    return `community:${communityId}:nfts:stats`;
  }

  /**
   * Close Redis connection
   */
  async close() {
    try {
      if (this.redis) {
        await this.redis.quit();
        this.isConnected = false;
      }
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
}

// Export singleton instance
module.exports = new CacheService();