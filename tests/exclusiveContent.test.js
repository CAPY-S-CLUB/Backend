const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../models/User');
const Community = require('../models/Community');
const Content = require('../models/Content');

describe('Exclusive Content Access Control', () => {
  let testUser1, testUser2, testCommunity1, testCommunity2, testContent;
  let validToken1, validToken2, expiredToken;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/hackmeridian_test';
    await mongoose.connect(mongoUri);
  });

  beforeEach(async () => {
    // Clean database
    await User.deleteMany({});
    await Community.deleteMany({});
    await Content.deleteMany({});

    // Create test communities
    testCommunity1 = await Community.create({
      name: 'Crypto Traders',
      description: 'Community for crypto trading enthusiasts'
    });

    testCommunity2 = await Community.create({
      name: 'Tech Innovators',
      description: 'Community for technology innovators'
    });

    // Create test users
    testUser1 = await User.create({
      username: 'trader_user',
      email: 'trader@example.com',
      password: 'password123',
      community_id: testCommunity1._id,
      role: 'member',
      isActive: true
    });

    testUser2 = await User.create({
      username: 'tech_user',
      email: 'tech@example.com',
      password: 'password123',
      community_id: testCommunity2._id,
      role: 'member',
      isActive: true
    });

    // Create test content
    testContent = await Content.create({
      title: 'Advanced Trading Strategies',
      text: 'This is exclusive content about advanced trading strategies...',
      community_id: testCommunity1._id,
      author_id: testUser1._id,
      contentType: 'exclusive',
      accessLevel: 'member',
      isActive: true,
      tags: ['trading', 'crypto', 'advanced'],
      metadata: {
        category: 'education',
        difficulty: 'advanced',
        estimatedReadTime: 15
      }
    });

    // Generate JWT tokens
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    
    validToken1 = jwt.sign(
      { id: testUser1._id, username: testUser1.username },
      jwtSecret,
      { expiresIn: '1h' }
    );

    validToken2 = jwt.sign(
      { id: testUser2._id, username: testUser2.username },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // Create expired token
    expiredToken = jwt.sign(
      { id: testUser1._id, username: testUser1.username },
      jwtSecret,
      { expiresIn: '-1h' } // Already expired
    );
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /api/content/:content_id', () => {
    describe('Authentication Tests', () => {
      test('should return 401 when no token provided', async () => {
        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .expect(401);

        expect(response.body).toMatchObject({
          error: 'Unauthorized',
          message: 'Access token is required',
          code: 'MISSING_TOKEN'
        });
      });

      test('should return 401 when invalid token format provided', async () => {
        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', 'InvalidToken')
          .expect(401);

        expect(response.body).toMatchObject({
          error: 'Unauthorized',
          message: 'Access token is required',
          code: 'MISSING_TOKEN'
        });
      });

      test('should return 401 when expired token provided', async () => {
        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(401);

        expect(response.body).toMatchObject({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      });

      test('should return 401 when token with invalid signature provided', async () => {
        const invalidToken = jwt.sign(
          { id: testUser1._id, username: testUser1.username },
          'wrong-secret',
          { expiresIn: '1h' }
        );

        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${invalidToken}`)
          .expect(401);

        expect(response.body).toMatchObject({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      });
    });

    describe('Content Existence Tests', () => {
      test('should return 404 when content does not exist', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        
        const response = await request(app)
          .get(`/api/content/${nonExistentId}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(404);

        expect(response.body).toMatchObject({
          error: 'Not Found',
          message: 'Content not found',
          code: 'CONTENT_NOT_FOUND'
        });
      });

      test('should return 400 when invalid content ID format provided', async () => {
        const response = await request(app)
          .get('/api/content/invalid-id')
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'Bad Request',
          message: 'Invalid content ID format',
          code: 'INVALID_CONTENT_ID'
        });
      });

      test('should return 404 when content is inactive', async () => {
        // Make content inactive
        await Content.findByIdAndUpdate(testContent._id, { isActive: false });

        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(404);

        expect(response.body).toMatchObject({
          error: 'Not Found',
          message: 'Content is no longer available',
          code: 'CONTENT_INACTIVE'
        });
      });
    });

    describe('Community Affiliation Tests', () => {
      test('should return 403 when user belongs to different community', async () => {
        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken2}`) // User from different community
          .expect(403);

        expect(response.body).toMatchObject({
          error: 'Forbidden',
          message: 'Access denied. Content belongs to a different community',
          code: 'COMMUNITY_MISMATCH',
          details: {
            userCommunity: 'Tech Innovators',
            contentCommunity: 'Crypto Traders'
          }
        });
      });

      test('should return 403 when user has no community membership', async () => {
        // Remove user's community membership
        await User.findByIdAndUpdate(testUser1._id, { community_id: null });

        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(403);

        expect(response.body).toMatchObject({
          error: 'Forbidden',
          message: 'User must be a member of a community to access exclusive content',
          code: 'NO_COMMUNITY_MEMBERSHIP'
        });
      });

      test('should return 403 when user has insufficient permissions', async () => {
        // Create admin-only content
        const adminContent = await Content.create({
          title: 'Admin Only Content',
          text: 'This content is only for administrators',
          community_id: testCommunity1._id,
          author_id: testUser1._id,
          contentType: 'exclusive',
          accessLevel: 'admin', // Requires admin role
          isActive: true
        });

        const response = await request(app)
          .get(`/api/content/${adminContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`) // User is only a member
          .expect(403);

        expect(response.body).toMatchObject({
          error: 'Forbidden',
          message: 'Insufficient permissions to access this content',
          code: 'INSUFFICIENT_PERMISSIONS',
          details: {
            requiredLevel: 'admin',
            userRole: 'member'
          }
        });
      });
    });

    describe('Successful Access Tests', () => {
      test('should return 200 and content when user has valid access', async () => {
        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            _id: testContent._id.toString(),
            title: 'Advanced Trading Strategies',
            text: 'This is exclusive content about advanced trading strategies...',
            contentType: 'exclusive',
            accessLevel: 'member',
            tags: ['trading', 'crypto', 'advanced'],
            community_id: {
              _id: testCommunity1._id.toString(),
              name: 'Crypto Traders'
            },
            author_id: {
              _id: testUser1._id.toString(),
              username: 'trader_user'
            }
          },
          access: {
            community: 'Crypto Traders',
            userRole: 'member',
            accessLevel: 'member'
          },
          meta: {
            contentType: 'exclusive'
          }
        });

        // Verify view count was incremented
        const updatedContent = await Content.findById(testContent._id);
        expect(updatedContent.viewCount).toBe(1);
      });

      test('should increment view count on each access', async () => {
        // First access
        await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(200);

        // Second access
        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(200);

        expect(response.body.meta.viewCount).toBe(2);
      });
    });

    describe('Role-based Access Tests', () => {
      test('admin should access member-level content', async () => {
        // Update user to admin role
        await User.findByIdAndUpdate(testUser1._id, { role: 'admin' });

        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.access.userRole).toBe('admin');
      });

      test('moderator should access member-level content', async () => {
        // Update user to moderator role
        await User.findByIdAndUpdate(testUser1._id, { role: 'moderator' });

        const response = await request(app)
          .get(`/api/content/${testContent._id}`)
          .set('Authorization', `Bearer ${validToken1}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.access.userRole).toBe('moderator');
      });
    });
  });

  describe('GET /api/content (List Content)', () => {
    beforeEach(async () => {
      // Create additional test content
      await Content.create([
        {
          title: 'Premium Trading Tips',
          text: 'Premium content for advanced traders',
          community_id: testCommunity1._id,
          author_id: testUser1._id,
          contentType: 'premium',
          accessLevel: 'member',
          isActive: true,
          metadata: { category: 'tips' }
        },
        {
          title: 'VIP Market Analysis',
          text: 'VIP content with market analysis',
          community_id: testCommunity1._id,
          author_id: testUser1._id,
          contentType: 'vip',
          accessLevel: 'admin',
          isActive: true,
          metadata: { category: 'analysis' }
        }
      ]);
    });

    test('should return paginated content list for community member', async () => {
      const response = await request(app)
        .get('/api/content?page=1&limit=10')
        .set('Authorization', `Bearer ${validToken1}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        pagination: {
          page: 1,
          limit: 10,
          total: 2, // Only member-accessible content
          pages: 1
        },
        filters: {
          community: 'Crypto Traders',
          contentType: 'all',
          category: 'all',
          accessLevel: 'member'
        }
      });

      expect(response.body.data).toHaveLength(2);
    });

    test('should filter content by type', async () => {
      const response = await request(app)
        .get('/api/content?contentType=premium')
        .set('Authorization', `Bearer ${validToken1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].contentType).toBe('premium');
    });

    test('should filter content by category', async () => {
      const response = await request(app)
        .get('/api/content?category=tips')
        .set('Authorization', `Bearer ${validToken1}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Premium Trading Tips');
    });

    test('should return 401 when no authentication provided', async () => {
      const response = await request(app)
        .get('/api/content')
        .expect(401);

      expect(response.body.code).toBe('MISSING_TOKEN');
    });
  });
});