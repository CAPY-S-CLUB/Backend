const request = require('supertest');
const app = require('../server');
const {
  invitationMocks,
  membersMocks,
  testScenarios,
  generateRandomInvitation,
  generateRandomMember
} = require('../mocks/memberManagementMocks');

describe('Member Management API', () => {
  const communityId = '507f1f77bcf86cd799439011';
  const validToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  const adminToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

  describe('POST /api/communities/:communityId/invites', () => {
    const endpoint = `/api/communities/${communityId}/invites`;

    test('should create invitation successfully with valid data', async () => {
      const scenario = testScenarios.invitation.validCreation;
      
      const response = await request(app)
        .post(endpoint)
        .set('Authorization', adminToken)
        .send(scenario.request)
        .expect(scenario.expectedStatus);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Invitation created successfully');
      expect(response.body.data).toHaveProperty('invitation_id');
      expect(response.body.data).toHaveProperty('email', scenario.request.email);
      expect(response.body.data).toHaveProperty('expiration_date');
      expect(response.body.data).toHaveProperty('status', 'pending');
    });

    test('should create invitation with custom expiration hours', async () => {
      const requestData = {
        email: 'custom@example.com',
        expiration_hours: 72
      };

      const response = await request(app)
        .post(endpoint)
        .set('Authorization', adminToken)
        .send(requestData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(requestData.email);
      
      // Check that expiration date is approximately 72 hours from now
      const expirationDate = new Date(response.body.data.expiration_date);
      const expectedExpiration = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const timeDiff = Math.abs(expirationDate.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(60000); // Within 1 minute tolerance
    });

    test('should reject invitation with invalid email format', async () => {
      const scenario = testScenarios.invitation.invalidEmail;
      
      const response = await request(app)
        .post(endpoint)
        .set('Authorization', adminToken)
        .send(scenario.request)
        .expect(scenario.expectedStatus);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].field).toBe('email');
    });

    test('should reject invitation with invalid expiration hours', async () => {
      const requestData = {
        email: 'valid@example.com',
        expiration_hours: 200 // Exceeds maximum of 168
      };

      const response = await request(app)
        .post(endpoint)
        .set('Authorization', adminToken)
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    test('should reject invitation without authentication', async () => {
      const requestData = {
        email: 'test@example.com',
        expiration_hours: 24
      };

      const response = await request(app)
        .post(endpoint)
        .send(requestData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });

    test('should reject invitation from non-admin user', async () => {
      const requestData = {
        email: 'test@example.com',
        expiration_hours: 24
      };

      const response = await request(app)
        .post(endpoint)
        .set('Authorization', validToken) // Non-admin token
        .send(requestData)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('should handle duplicate invitation gracefully', async () => {
      const requestData = {
        email: 'duplicate@example.com',
        expiration_hours: 24
      };

      // First invitation should succeed
      await request(app)
        .post(endpoint)
        .set('Authorization', adminToken)
        .send(requestData)
        .expect(201);

      // Second invitation should fail with 409
      const response = await request(app)
        .post(endpoint)
        .set('Authorization', adminToken)
        .send(requestData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('active invitation already exists');
    });
  });

  describe('GET /api/communities/:communityId/members', () => {
    const endpoint = `/api/communities/${communityId}/members`;

    test('should return paginated list of members', async () => {
      const response = await request(app)
        .get(endpoint)
        .set('Authorization', validToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('members');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.members)).toBe(true);
      
      const pagination = response.body.data.pagination;
      expect(pagination).toHaveProperty('current_page');
      expect(pagination).toHaveProperty('total_pages');
      expect(pagination).toHaveProperty('total_count');
      expect(pagination).toHaveProperty('limit');
      expect(pagination).toHaveProperty('has_next_page');
      expect(pagination).toHaveProperty('has_prev_page');
    });

    test('should filter members by name', async () => {
      const response = await request(app)
        .get(endpoint)
        .query({ name: 'John' })
        .set('Authorization', validToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      const members = response.body.data.members;
      
      // All returned members should have 'John' in first or last name
      members.forEach(member => {
        const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
        expect(fullName).toContain('john');
      });
    });

    test('should filter members by email', async () => {
      const response = await request(app)
        .get(endpoint)
        .query({ email: 'example.com' })
        .set('Authorization', validToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      const members = response.body.data.members;
      
      // All returned members should have 'example.com' in email
      members.forEach(member => {
        expect(member.email.toLowerCase()).toContain('example.com');
      });
    });

    test('should filter members by join date range', async () => {
      const fromDate = '2024-01-01T00:00:00.000Z';
      const toDate = '2024-12-31T23:59:59.999Z';
      
      const response = await request(app)
        .get(endpoint)
        .query({ 
          join_date_from: fromDate,
          join_date_to: toDate
        })
        .set('Authorization', validToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      const members = response.body.data.members;
      
      // All returned members should have joined within the date range
      members.forEach(member => {
        const joinDate = new Date(member.created_at);
        expect(joinDate.getTime()).toBeGreaterThanOrEqual(new Date(fromDate).getTime());
        expect(joinDate.getTime()).toBeLessThanOrEqual(new Date(toDate).getTime());
      });
    });

    test('should handle pagination correctly', async () => {
      const page1Response = await request(app)
        .get(endpoint)
        .query({ page: 1, limit: 2 })
        .set('Authorization', validToken)
        .expect(200);

      const page2Response = await request(app)
        .get(endpoint)
        .query({ page: 2, limit: 2 })
        .set('Authorization', validToken)
        .expect(200);

      expect(page1Response.body.data.pagination.current_page).toBe(1);
      expect(page2Response.body.data.pagination.current_page).toBe(2);
      
      // Members on different pages should be different
      const page1Members = page1Response.body.data.members.map(m => m._id);
      const page2Members = page2Response.body.data.members.map(m => m._id);
      
      const intersection = page1Members.filter(id => page2Members.includes(id));
      expect(intersection).toHaveLength(0);
    });

    test('should reject invalid pagination parameters', async () => {
      const response = await request(app)
        .get(endpoint)
        .query({ page: 0, limit: 150 }) // Invalid values
        .set('Authorization', validToken)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get(endpoint)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('DELETE /api/communities/:communityId/members/:memberId', () => {
    const memberId = '507f1f77bcf86cd799439023';
    const adminMemberId = '507f1f77bcf86cd799439021';
    const endpoint = `/api/communities/${communityId}/members`;

    test('should remove member successfully', async () => {
      const response = await request(app)
        .delete(`${endpoint}/${memberId}`)
        .set('Authorization', adminToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Member removed successfully');
      expect(response.body.data).toHaveProperty('removed_member');
      expect(response.body.data.removed_member).toHaveProperty('id', memberId);
      expect(response.body.data.removed_member).toHaveProperty('email');
      expect(response.body.data.removed_member).toHaveProperty('name');
    });

    test('should prevent removing community administrator', async () => {
      const response = await request(app)
        .delete(`${endpoint}/${adminMemberId}`)
        .set('Authorization', adminToken)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Cannot remove community administrator');
    });

    test('should return 404 for non-existent member', async () => {
      const nonExistentId = '507f1f77bcf86cd799439999';
      
      const response = await request(app)
        .delete(`${endpoint}/${nonExistentId}`)
        .set('Authorization', adminToken)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Member not found in this community');
    });

    test('should reject invalid member ID format', async () => {
      const invalidId = 'invalid-id';
      
      const response = await request(app)
        .delete(`${endpoint}/${invalidId}`)
        .set('Authorization', adminToken)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    test('should require admin authentication', async () => {
      const response = await request(app)
        .delete(`${endpoint}/${memberId}`)
        .set('Authorization', validToken) // Non-admin token
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete(`${endpoint}/${memberId}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete invitation flow', async () => {
      const email = 'integration@example.com';
      
      // 1. Create invitation
      const inviteResponse = await request(app)
        .post(`/api/communities/${communityId}/invites`)
        .set('Authorization', adminToken)
        .send({ email, expiration_hours: 24 })
        .expect(201);

      expect(inviteResponse.body.success).toBe(true);
      const invitationId = inviteResponse.body.data.invitation_id;

      // 2. Verify invitation exists (this would typically be done via a separate endpoint)
      // For now, we'll just verify the response structure
      expect(invitationId).toBeDefined();
      expect(inviteResponse.body.data.email).toBe(email);
      expect(inviteResponse.body.data.status).toBe('pending');
    });

    test('should handle complete member management flow', async () => {
      // 1. List members
      const listResponse = await request(app)
        .get(`/api/communities/${communityId}/members`)
        .set('Authorization', validToken)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      const initialCount = listResponse.body.data.pagination.total_count;

      // 2. Remove a member (assuming we have a removable member)
      const removableMemberId = '507f1f77bcf86cd799439023';
      
      const removeResponse = await request(app)
        .delete(`/api/communities/${communityId}/members/${removableMemberId}`)
        .set('Authorization', adminToken)
        .expect(200);

      expect(removeResponse.body.success).toBe(true);

      // 3. Verify member count decreased
      const updatedListResponse = await request(app)
        .get(`/api/communities/${communityId}/members`)
        .set('Authorization', validToken)
        .expect(200);

      const updatedCount = updatedListResponse.body.data.pagination.total_count;
      expect(updatedCount).toBe(initialCount - 1);
    });
  });

  describe('Performance Tests', () => {
    test('should handle large member list efficiently', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get(`/api/communities/${communityId}/members`)
        .query({ limit: 100 })
        .set('Authorization', validToken)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });

    test('should handle multiple concurrent requests', async () => {
      const requests = Array(10).fill().map(() => 
        request(app)
          .get(`/api/communities/${communityId}/members`)
          .set('Authorization', validToken)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});

// Helper function to generate test data
function generateTestInvitations(count = 5) {
  return Array(count).fill().map(() => 
    generateRandomInvitation('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439021')
  );
}

function generateTestMembers(count = 10) {
  return Array(count).fill().map(() => 
    generateRandomMember('507f1f77bcf86cd799439011')
  );
}

module.exports = {
  generateTestInvitations,
  generateTestMembers
};