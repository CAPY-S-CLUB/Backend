/**
 * Mock objects for Member Management API endpoints
 * These mocks represent realistic data structures for testing invitation and member management
 */

// Mock data for POST /api/communities/{communityId}/invites
const invitationMocks = [
  {
    // Mock 1: Successful invitation creation
    _id: "507f1f77bcf86cd799439051",
    token_hash: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    email: "newmember@example.com",
    community_id: "507f1f77bcf86cd799439011",
    expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    status: "pending",
    invited_by: "507f1f77bcf86cd799439021",
    accepted_by: null,
    accepted_at: null,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    // Mock 2: Accepted invitation
    _id: "507f1f77bcf86cd799439052",
    token_hash: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
    email: "activemember@example.com",
    community_id: "507f1f77bcf86cd799439011",
    expiration_date: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
    status: "accepted",
    invited_by: "507f1f77bcf86cd799439021",
    accepted_by: "507f1f77bcf86cd799439025",
    accepted_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000)
  },
  {
    // Mock 3: Expired invitation
    _id: "507f1f77bcf86cd799439053",
    token_hash: "c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
    email: "expired@example.com",
    community_id: "507f1f77bcf86cd799439012",
    expiration_date: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago (expired)
    status: "expired",
    invited_by: "507f1f77bcf86cd799439024",
    accepted_by: null,
    accepted_at: null,
    created_at: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
    updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000)
  }
];

// Mock data for GET /api/communities/{communityId}/members
const membersMocks = [
  {
    // Mock 1: Community admin
    _id: "507f1f77bcf86cd799439021",
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    user_type: "community_admin",
    is_active: true,
    created_at: new Date("2024-01-15T10:30:00.000Z"),
    last_login: new Date("2025-01-15T08:45:00.000Z")
  },
  {
    // Mock 2: Regular member
    _id: "507f1f77bcf86cd799439022",
    first_name: "Jane",
    last_name: "Smith",
    email: "jane.smith@example.com",
    user_type: "member",
    is_active: true,
    created_at: new Date("2024-02-20T14:15:00.000Z"),
    last_login: new Date("2025-01-14T16:30:00.000Z")
  },
  {
    // Mock 3: Recently joined member
    _id: "507f1f77bcf86cd799439023",
    first_name: "Mike",
    last_name: "Johnson",
    email: "mike.johnson@example.com",
    user_type: "member",
    is_active: true,
    created_at: new Date("2025-01-10T09:20:00.000Z"),
    last_login: new Date("2025-01-15T07:15:00.000Z")
  },
  {
    // Mock 4: Inactive member (for testing filters)
    _id: "507f1f77bcf86cd799439024",
    first_name: "Sarah",
    last_name: "Wilson",
    email: "sarah.wilson@example.com",
    user_type: "member",
    is_active: false,
    created_at: new Date("2024-03-10T11:45:00.000Z"),
    last_login: new Date("2024-12-20T13:20:00.000Z")
  },
  {
    // Mock 5: Member with partial name (for testing name filters)
    _id: "507f1f77bcf86cd799439025",
    first_name: "Alex",
    last_name: "",
    email: "alex@example.com",
    user_type: "member",
    is_active: true,
    created_at: new Date("2024-06-15T16:30:00.000Z"),
    last_login: new Date("2025-01-13T10:45:00.000Z")
  }
];

// Mock pagination response for members
const membersPaginationMock = {
  success: true,
  data: {
    members: membersMocks.slice(0, 3), // First 3 members
    pagination: {
      current_page: 1,
      total_pages: 2,
      total_count: 5,
      limit: 3,
      has_next_page: true,
      has_prev_page: false
    }
  }
};

// Mock success responses
const successResponseMocks = [
  {
    // Mock 1: Invitation created successfully
    success: true,
    message: "Invitation created successfully",
    data: {
      invitation_id: "507f1f77bcf86cd799439051",
      email: "newmember@example.com",
      expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "pending"
    }
  },
  {
    // Mock 2: Member removed successfully
    success: true,
    message: "Member removed successfully",
    data: {
      removed_member: {
        id: "507f1f77bcf86cd799439023",
        email: "mike.johnson@example.com",
        name: "Mike Johnson"
      }
    }
  },
  {
    // Mock 3: Members retrieved successfully
    success: true,
    data: {
      members: membersMocks.filter(m => m.is_active),
      pagination: {
        current_page: 1,
        total_pages: 1,
        total_count: 4,
        limit: 20,
        has_next_page: false,
        has_prev_page: false
      }
    }
  }
];

// Mock error responses
const errorResponseMocks = [
  {
    // Mock 1: Validation error for invitation
    success: false,
    message: "Validation failed",
    errors: [
      {
        field: "email",
        message: "Please provide a valid email address",
        value: "invalid-email",
        location: "body"
      }
    ]
  },
  {
    // Mock 2: Duplicate invitation error
    success: false,
    message: "An active invitation already exists for this email in this community"
  },
  {
    // Mock 3: Member not found error
    success: false,
    message: "Member not found in this community"
  },
  {
    // Mock 4: Cannot remove admin error
    success: false,
    message: "Cannot remove community administrator"
  },
  {
    // Mock 5: Authentication error
    success: false,
    message: "Access denied. No token provided."
  },
  {
    // Mock 6: Authorization error
    success: false,
    message: "Access denied. You do not have permission to manage this community."
  }
];

// Mock request bodies for testing
const requestBodyMocks = [
  {
    // Mock 1: Valid invitation request
    email: "newuser@example.com",
    expiration_hours: 24
  },
  {
    // Mock 2: Invitation with custom expiration
    email: "developer@example.com",
    expiration_hours: 72
  },
  {
    // Mock 3: Invitation with minimum expiration
    email: "tester@example.com",
    expiration_hours: 1
  },
  {
    // Mock 4: Invalid email format
    email: "invalid-email",
    expiration_hours: 24
  },
  {
    // Mock 5: Invalid expiration hours
    email: "valid@example.com",
    expiration_hours: 200 // Exceeds maximum of 168
  }
];

// Mock query parameters for member filtering
const memberQueryMocks = [
  {
    // Mock 1: Basic pagination
    page: 1,
    limit: 20
  },
  {
    // Mock 2: Filter by name
    page: 1,
    limit: 10,
    name: "John"
  },
  {
    // Mock 3: Filter by email
    page: 1,
    limit: 10,
    email: "jane"
  },
  {
    // Mock 4: Filter by join date range
    page: 1,
    limit: 10,
    join_date_from: "2024-01-01T00:00:00.000Z",
    join_date_to: "2024-12-31T23:59:59.999Z"
  },
  {
    // Mock 5: Combined filters
    page: 2,
    limit: 5,
    name: "Mike",
    join_date_from: "2025-01-01T00:00:00.000Z"
  },
  {
    // Mock 6: Invalid pagination parameters
    page: 0, // Invalid
    limit: 150 // Exceeds maximum
  }
];

// Utility functions for generating test data
const generateRandomInvitation = (communityId, inviterId) => {
  const emails = [
    'user1@example.com',
    'user2@example.com', 
    'developer@test.com',
    'admin@company.com',
    'member@community.org'
  ];
  
  const statuses = ['pending', 'accepted', 'expired', 'revoked'];
  const randomEmail = emails[Math.floor(Math.random() * emails.length)];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  return {
    _id: new Date().getTime().toString(),
    token_hash: require('crypto').randomBytes(32).toString('hex'),
    email: randomEmail,
    community_id: communityId,
    expiration_date: new Date(Date.now() + (Math.random() * 168 + 1) * 60 * 60 * 1000),
    status: randomStatus,
    invited_by: inviterId,
    accepted_by: randomStatus === 'accepted' ? new Date().getTime().toString() : null,
    accepted_at: randomStatus === 'accepted' ? new Date() : null,
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    updated_at: new Date()
  };
};

const generateRandomMember = (communityId) => {
  const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'Alex', 'Emily', 'David', 'Lisa'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  const userTypes = ['member', 'community_admin'];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
  
  return {
    _id: new Date().getTime().toString(),
    first_name: firstName,
    last_name: lastName,
    email: email,
    user_type: userTypes[Math.floor(Math.random() * userTypes.length)],
    is_active: Math.random() > 0.1, // 90% chance of being active
    created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
    last_login: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
  };
};

// Test scenarios for automated testing
const testScenarios = {
  invitation: {
    validCreation: {
      description: "Should create invitation successfully",
      request: requestBodyMocks[0],
      expectedStatus: 201,
      expectedResponse: successResponseMocks[0]
    },
    duplicateEmail: {
      description: "Should reject duplicate invitation for same email",
      request: requestBodyMocks[0],
      expectedStatus: 409,
      expectedResponse: errorResponseMocks[1]
    },
    invalidEmail: {
      description: "Should reject invalid email format",
      request: requestBodyMocks[3],
      expectedStatus: 400,
      expectedResponse: errorResponseMocks[0]
    },
    invalidExpiration: {
      description: "Should reject invalid expiration hours",
      request: requestBodyMocks[4],
      expectedStatus: 400
    }
  },
  members: {
    listMembers: {
      description: "Should return paginated list of members",
      query: memberQueryMocks[0],
      expectedStatus: 200,
      expectedResponse: successResponseMocks[2]
    },
    filterByName: {
      description: "Should filter members by name",
      query: memberQueryMocks[1],
      expectedStatus: 200
    },
    filterByEmail: {
      description: "Should filter members by email",
      query: memberQueryMocks[2],
      expectedStatus: 200
    },
    filterByDateRange: {
      description: "Should filter members by join date range",
      query: memberQueryMocks[3],
      expectedStatus: 200
    },
    invalidPagination: {
      description: "Should reject invalid pagination parameters",
      query: memberQueryMocks[5],
      expectedStatus: 400
    }
  },
  memberRemoval: {
    validRemoval: {
      description: "Should remove member successfully",
      memberId: "507f1f77bcf86cd799439023",
      expectedStatus: 200,
      expectedResponse: successResponseMocks[1]
    },
    memberNotFound: {
      description: "Should return 404 for non-existent member",
      memberId: "507f1f77bcf86cd799439999",
      expectedStatus: 404,
      expectedResponse: errorResponseMocks[2]
    },
    cannotRemoveAdmin: {
      description: "Should prevent removing community admin",
      memberId: "507f1f77bcf86cd799439021",
      expectedStatus: 403,
      expectedResponse: errorResponseMocks[3]
    }
  }
};

module.exports = {
  invitationMocks,
  membersMocks,
  membersPaginationMock,
  successResponseMocks,
  errorResponseMocks,
  requestBodyMocks,
  memberQueryMocks,
  testScenarios,
  generateRandomInvitation,
  generateRandomMember
};