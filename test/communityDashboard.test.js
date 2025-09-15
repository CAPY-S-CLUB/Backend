const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Community = require('../models/Community');
const User = require('../models/User');
const NFTCollection = require('../models/NFTCollection');
const jwt = require('jsonwebtoken');
const { cacheUtils } = require('../config/redis');

describe('Community Dashboard API', () => {
  let authToken;
  let testUser;
  let testCommunity;
  let testNFTCollection;

  beforeAll(async () => {
    // Create test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      walletAddress: 'GCKFBEIYTKP6JY4Q2F3LCKPC2OCDGTB5YYQADHV6HQMVQGQGQGQGQGQG',
      lastLogin: new Date()
    });
    await testUser.save();

    // Generate auth token
    authToken = jwt.sign(
      { id: testUser._id, username: testUser.username },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test community
    testCommunity = new Community({
      name: 'Test Community',
      description: 'A test community for dashboard metrics',
      owner: testUser._id,
      members: [testUser._id],
      isActive: true,
      settings: {
        isPublic: true,
        allowMemberInvites: true
      }
    });
    await testCommunity.save();

    // Create test NFT collection
    testNFTCollection = new NFTCollection({
      name: 'Test NFT Collection',
      symbol: 'TNC',
      description: 'Test collection for dashboard metrics',
      maxSupply: 1000,
      mintedCount: 500,
      distributedCount: 300,
      communityId: testCommunity._id,
      createdBy: testUser._id,
      contractAddress: 'GDCKFBEIYTKP6JY4Q2F3LCKPC2OCDGTB5YYQADHV6HQMVQGQGQGQGQGQG',
      isActive: true
    });
    await testNFTCollection.save();
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: 'test@example.com' });
    await Community.deleteMany({ name: 'Test Community' });
    await NFTCollection.deleteMany({ name: 'Test NFT Collection' });
    
    // Clear cache
    await cacheUtils.deletePattern('community:*:dashboard:metrics');
    
    // Close database connection
    await mongoose.connection.close();
  });

  describe('GET /api/communities/:communityId/dashboard-metrics', () => {
    it('should return dashboard metrics for valid community', async () => {
      const response = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Dashboard metrics retrieved successfully');
      expect(response.body.data).toHaveProperty('community_id');
      expect(response.body.data).toHaveProperty('community_name');
      expect(response.body.data).toHaveProperty('total_members');
      expect(response.body.data).toHaveProperty('active_members');
      expect(response.body.data).toHaveProperty('nft_stats');
      expect(response.body.data).toHaveProperty('last_updated');
      expect(response.body.cache_info).toHaveProperty('from_cache');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid community ID format', async () => {
      const response = await request(app)
        .get('/api/communities/invalid-id/dashboard-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 404 for non-existent community', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/communities/${nonExistentId}/dashboard-metrics`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Community not found');
    });

    it('should use cache on second request', async () => {
      // First request - should cache the result
      const firstResponse = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(firstResponse.body.cache_info.from_cache).toBe(false);

      // Second request - should use cached result
      const secondResponse = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(secondResponse.body.cache_info.from_cache).toBe(true);
      expect(secondResponse.body.cache_info.cache_ttl).toBeGreaterThan(0);
    });

    it('should bypass cache when use_cache=false', async () => {
      const response = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics?use_cache=false`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.cache_info.cache_enabled).toBe(false);
    });
  });

  describe('GET /api/communities/:communityId/dashboard-metrics/cache', () => {
    it('should return cache status', async () => {
      const response = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics/cache`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('cached');
      expect(response.body.data).toHaveProperty('ttl_seconds');
      expect(response.body.data).toHaveProperty('cache_key');
    });
  });

  describe('DELETE /api/communities/:communityId/dashboard-metrics/cache', () => {
    it('should invalidate cache successfully', async () => {
      // First, ensure there's cached data
      await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics`)
        .set('Authorization', `Bearer ${authToken}`);

      // Then invalidate cache
      const response = await request(app)
        .delete(`/api/communities/${testCommunity._id}/dashboard-metrics/cache`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Cache invalidated successfully');

      // Verify cache is cleared
      const cacheStatusResponse = await request(app)
        .get(`/api/communities/${testCommunity._id}/dashboard-metrics/cache`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(cacheStatusResponse.body.data.cached).toBe(false);
    });
  });
});

// Manual testing helper functions
const manualTests = {
  async testDashboardMetrics() {
    console.log('\n=== Manual Dashboard Metrics Test ===');
    
    try {
      // Test basic endpoint
      const response = await request(app)
        .get('/api/communities/507f1f77bcf86cd799439011/dashboard-metrics')
        .set('Authorization', 'Bearer test-token');
      
      console.log('Status:', response.status);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      
    } catch (error) {
      console.error('Test error:', error.message);
    }
  },

  async testCacheStatus() {
    console.log('\n=== Manual Cache Status Test ===');
    
    try {
      const response = await request(app)
        .get('/api/communities/507f1f77bcf86cd799439011/dashboard-metrics/cache')
        .set('Authorization', 'Bearer test-token');
      
      console.log('Status:', response.status);
      console.log('Response:', JSON.stringify(response.body, null, 2));
      
    } catch (error) {
      console.error('Test error:', error.message);
    }
  }
};

// Export for manual testing
if (require.main === module) {
  // Run manual tests if this file is executed directly
  (async () => {
    await manualTests.testDashboardMetrics();
    await manualTests.testCacheStatus();
    process.exit(0);
  })();
}

module.exports = { manualTests };