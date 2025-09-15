const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Product = require('../models/Product');
const Community = require('../models/Community');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

// Mock AWS S3 for testing
jest.mock('aws-sdk', () => {
  const mockS3 = {
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Location: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
        Key: 'test-file.jpg'
      })
    }),
    deleteObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    deleteObjects: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Contents: [],
        IsTruncated: false
      })
    })
  };

  return {
    S3: jest.fn(() => mockS3),
    config: {
      update: jest.fn()
    }
  };
});

// Mock multer-s3
jest.mock('multer-s3', () => {
  return jest.fn(() => ({
    _handleFile: (req, file, cb) => {
      cb(null, {
        location: `https://test-bucket.s3.amazonaws.com/${file.originalname}`,
        key: file.originalname,
        size: file.size || 1024
      });
    },
    _removeFile: (req, file, cb) => {
      cb(null);
    }
  }));
});

describe('Products API', () => {
  let testUser, testCommunity, testProduct, authToken, otherUser, otherAuthToken;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/hackmeridian_test');
    }
  });

  beforeEach(async () => {
    // Clean up database
    await Product.deleteMany({});
    await Community.deleteMany({});
    await User.deleteMany({});

    // Create test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword',
      wallet_address: '0x1234567890123456789012345678901234567890'
    });
    await testUser.save();

    // Create another user
    otherUser = new User({
      username: 'otheruser',
      email: 'other@example.com',
      password: 'hashedpassword',
      wallet_address: '0x0987654321098765432109876543210987654321'
    });
    await otherUser.save();

    // Create test community
    testCommunity = new Community({
      name: 'Test Community',
      description: 'A test community',
      admin_id: testUser._id,
      category: 'Technology',
      is_public: true
    });
    await testCommunity.save();

    // Create test product
    testProduct = new Product({
      name: 'Test Product',
      description: 'A test product',
      images_urls: ['https://test-bucket.s3.amazonaws.com/test-image.jpg'],
      videos_urls: [],
      details_json: { color: 'blue', size: 'large' },
      community_id: testCommunity._id,
      exclusive_to_members: false,
      created_by: testUser._id,
      status: 'active',
      price: 99.99,
      currency: 'USD',
      tags: ['test', 'product']
    });
    await testProduct.save();

    // Generate auth tokens
    authToken = jwt.sign(
      { userId: testUser._id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    otherAuthToken = jwt.sign(
      { userId: otherUser._id, email: otherUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /products', () => {
    it('should return all active products', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.products).toHaveLength(1);
      expect(response.body.data.products[0].name).toBe('Test Product');
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter products by community_id', async () => {
      const response = await request(app)
        .get(`/api/products?community_id=${testCommunity._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.products).toHaveLength(1);
    });

    it('should search products by name', async () => {
      const response = await request(app)
        .get('/api/products?search=Test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.products).toHaveLength(1);
    });

    it('should filter products by price range', async () => {
      const response = await request(app)
        .get('/api/products?min_price=50&max_price=150')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.products).toHaveLength(1);
    });

    it('should return empty results for out-of-range prices', async () => {
      const response = await request(app)
        .get('/api/products?min_price=200&max_price=300')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.products).toHaveLength(0);
    });

    it('should handle pagination correctly', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pagination.current_page).toBe(1);
      expect(response.body.data.pagination.items_per_page).toBe(1);
    });
  });

  describe('GET /products/:id', () => {
    it('should return a specific product', async () => {
      const response = await request(app)
        .get(`/api/products/${testProduct._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.name).toBe('Test Product');
      expect(response.body.data.product.community_id).toBeDefined();
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/products/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Product not found');
    });

    it('should return 400 for invalid product ID', async () => {
      const response = await request(app)
        .get('/api/products/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid product ID format');
    });
  });

  describe('POST /products', () => {
    it('should create a new product with files', async () => {
      // Create test image file
      const testImagePath = path.join(__dirname, 'test-image.jpg');
      const testImageBuffer = Buffer.from('fake-image-data');
      fs.writeFileSync(testImagePath, testImageBuffer);

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'New Test Product')
        .field('description', 'A new test product')
        .field('community_id', testCommunity._id.toString())
        .field('price', '149.99')
        .field('currency', 'USD')
        .field('tags', 'new,test,product')
        .field('details_json', JSON.stringify({ material: 'cotton', size: 'medium' }))
        .attach('images', testImagePath)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.name).toBe('New Test Product');
      expect(response.body.data.product.price).toBe(149.99);
      expect(response.body.data.product.tags).toEqual(['new', 'test', 'product']);
      expect(response.body.data.uploaded_files.images_count).toBe(1);

      // Clean up
      fs.unlinkSync(testImagePath);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/products')
        .field('name', 'Unauthorized Product')
        .field('description', 'Should not be created')
        .field('community_id', testCommunity._id.toString())
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require community admin privileges', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .field('name', 'Unauthorized Product')
        .field('description', 'Should not be created')
        .field('community_id', testCommunity._id.toString())
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Incomplete Product')
        // Missing description and community_id
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    it('should validate invalid JSON in details_json', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Invalid JSON Product')
        .field('description', 'Product with invalid JSON')
        .field('community_id', testCommunity._id.toString())
        .field('details_json', 'invalid-json')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid JSON format');
    });

    it('should validate price format', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Invalid Price Product')
        .field('description', 'Product with invalid price')
        .field('community_id', testCommunity._id.toString())
        .field('price', 'invalid-price')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('valid positive number');
    });
  });

  describe('PUT /products/:id', () => {
    it('should update a product', async () => {
      const response = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Updated Test Product')
        .field('description', 'Updated description')
        .field('price', '199.99')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.name).toBe('Updated Test Product');
      expect(response.body.data.product.price).toBe(199.99);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .field('name', 'Unauthorized Update')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require ownership', async () => {
      const response = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .field('name', 'Unauthorized Update')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });

    it('should handle file removal', async () => {
      const response = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('remove_images', testProduct.images_urls[0])
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.images_urls).toHaveLength(0);
      expect(response.body.data.changes.files_removed).toBe(1);
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/products/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Non-existent Product')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Product not found');
    });
  });

  describe('DELETE /products/:id', () => {
    it('should delete a product and its files', async () => {
      const response = await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted_product_id).toBe(testProduct._id.toString());
      expect(response.body.data.files_deleted).toBe(1);

      // Verify product is deleted from database
      const deletedProduct = await Product.findById(testProduct._id);
      expect(deletedProduct).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require ownership', async () => {
      const response = await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/products/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Product not found');
    });
  });

  describe('POST /products/:id/like', () => {
    it('should like a product', async () => {
      const response = await request(app)
        .post(`/api/products/${testProduct._id}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_liked).toBe(true);
      expect(response.body.data.product.like_count).toBe(1);
    });

    it('should unlike a product when already liked', async () => {
      // First like
      await request(app)
        .post(`/api/products/${testProduct._id}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      // Then unlike
      const response = await request(app)
        .post(`/api/products/${testProduct._id}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_liked).toBe(false);
      expect(response.body.data.product.like_count).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/products/${testProduct._id}/like`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('File Upload Validation', () => {
    it('should reject files that are too large', async () => {
      // Create a large test file (mock)
      const testImagePath = path.join(__dirname, 'large-image.jpg');
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      fs.writeFileSync(testImagePath, largeBuffer);

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Large File Product')
        .field('description', 'Product with large file')
        .field('community_id', testCommunity._id.toString())
        .attach('images', testImagePath)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('File too large');

      // Clean up
      fs.unlinkSync(testImagePath);
    });

    it('should reject invalid file types', async () => {
      // Create a text file with image extension
      const testFilePath = path.join(__dirname, 'fake-image.txt');
      fs.writeFileSync(testFilePath, 'This is not an image');

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Invalid File Product')
        .field('description', 'Product with invalid file')
        .field('community_id', testCommunity._id.toString())
        .attach('images', testFilePath)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid file type');

      // Clean up
      fs.unlinkSync(testFilePath);
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = [];
      
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/api/products')
            .expect(200)
        );
      }

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });
    });

    it('should handle large pagination requests efficiently', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/products?page=1&limit=100')
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file uploads gracefully', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'No Files Product')
        .field('description', 'Product without files')
        .field('community_id', testCommunity._id.toString())
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.images_urls).toHaveLength(0);
      expect(response.body.data.product.videos_urls).toHaveLength(0);
    });

    it('should handle special characters in product names', async () => {
      const specialName = 'Product with Special Characters: àáâãäåæçèéêë';
      
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', specialName)
        .field('description', 'Product with special characters')
        .field('community_id', testCommunity._id.toString())
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.name).toBe(specialName);
    });

    it('should handle very long descriptions', async () => {
      const longDescription = 'A'.repeat(2000); // 2000 character description
      
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .field('name', 'Long Description Product')
        .field('description', longDescription)
        .field('community_id', testCommunity._id.toString())
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.product.description).toBe(longDescription);
    });
  });
});