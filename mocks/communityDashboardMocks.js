/**
 * Mock objects for Community Dashboard API endpoints
 * These mocks represent realistic data structures for testing and demonstration
 */

// Mock data for GET /api/communities/{communityId}/dashboard-metrics
const dashboardMetricsMocks = [
  {
    // Mock 1: Active tech community with high engagement
    community_id: "507f1f77bcf86cd799439011",
    community_name: "Tech Innovators Hub",
    total_members: 1250,
    active_members: 892,
    nft_stats: {
      total_nfts_minted: 5000,
      total_nfts_distributed: 4200,
      collections_count: 8,
      total_max_supply: 10000,
      distribution_rate: "84.00%"
    },
    last_updated: "2025-09-15T07:52:23.119Z",
    cache_ttl: 300,
    cached_at: "2025-09-15T07:52:23.119Z"
  },
  {
    // Mock 2: Growing gaming community with moderate activity
    community_id: "507f1f77bcf86cd799439012",
    community_name: "GameFi Legends",
    total_members: 750,
    active_members: 425,
    nft_stats: {
      total_nfts_minted: 2500,
      total_nfts_distributed: 1800,
      collections_count: 5,
      total_max_supply: 5000,
      distribution_rate: "72.00%"
    },
    last_updated: "2025-09-15T07:45:10.234Z",
    cache_ttl: 300,
    cached_at: "2025-09-15T07:45:10.234Z"
  },
  {
    // Mock 3: New art community with limited activity
    community_id: "507f1f77bcf86cd799439013",
    community_name: "Digital Art Collective",
    total_members: 320,
    active_members: 156,
    nft_stats: {
      total_nfts_minted: 800,
      total_nfts_distributed: 650,
      collections_count: 3,
      total_max_supply: 2000,
      distribution_rate: "81.25%"
    },
    last_updated: "2025-09-15T07:38:45.567Z",
    cache_ttl: 300,
    cached_at: "2025-09-15T07:38:45.567Z"
  }
];

// Mock data for GET /api/communities/{communityId}/dashboard-metrics/cache
const cacheStatusMocks = [
  {
    // Mock 1: Recently cached data with high TTL
    cached: true,
    ttl_seconds: 245,
    cache_key: "community:507f1f77bcf86cd799439011:dashboard:metrics"
  },
  {
    // Mock 2: Cached data with medium TTL
    cached: true,
    ttl_seconds: 120,
    cache_key: "community:507f1f77bcf86cd799439012:dashboard:metrics"
  },
  {
    // Mock 3: No cached data available
    cached: false,
    ttl_seconds: 0,
    cache_key: "community:507f1f77bcf86cd799439013:dashboard:metrics"
  }
];

// Mock responses for successful API calls
const successfulResponseMocks = [
  {
    // Mock 1: Successful dashboard metrics response with cache info
    success: true,
    message: "Dashboard metrics retrieved successfully",
    data: dashboardMetricsMocks[0],
    cache_info: {
      from_cache: true,
      cache_ttl: 245,
      cache_enabled: true
    }
  },
  {
    // Mock 2: Successful response without cache (fresh data)
    success: true,
    message: "Dashboard metrics retrieved successfully",
    data: dashboardMetricsMocks[1],
    cache_info: {
      from_cache: false,
      cache_ttl: null,
      cache_enabled: true
    }
  },
  {
    // Mock 3: Successful response with cache disabled
    success: true,
    message: "Dashboard metrics retrieved successfully",
    data: dashboardMetricsMocks[2],
    cache_info: {
      from_cache: false,
      cache_ttl: null,
      cache_enabled: false
    }
  }
];

// Mock responses for cache status endpoint
const cacheStatusResponseMocks = [
  {
    // Mock 1: Cache status with active cache
    success: true,
    message: "Cache status retrieved successfully",
    data: cacheStatusMocks[0]
  },
  {
    // Mock 2: Cache status with expiring cache
    success: true,
    message: "Cache status retrieved successfully",
    data: cacheStatusMocks[1]
  },
  {
    // Mock 3: Cache status with no cache
    success: true,
    message: "Cache status retrieved successfully",
    data: cacheStatusMocks[2]
  }
];

// Mock responses for cache invalidation endpoint
const cacheInvalidationResponseMocks = [
  {
    // Mock 1: Successful cache invalidation
    success: true,
    message: "Cache invalidated successfully"
  },
  {
    // Mock 2: Cache invalidation when no cache exists
    success: true,
    message: "Cache invalidated successfully"
  },
  {
    // Mock 3: Cache invalidation with confirmation
    success: true,
    message: "Cache invalidated successfully"
  }
];

// Mock error responses
const errorResponseMocks = [
  {
    // Mock 1: Validation error for invalid community ID
    success: false,
    message: "Validation failed",
    errors: [
      {
        field: "communityId",
        message: "Invalid community ID format",
        value: "invalid-id",
        location: "params"
      }
    ]
  },
  {
    // Mock 2: Authentication error
    success: false,
    message: "Authentication required",
    error: "No token provided"
  },
  {
    // Mock 3: Access denied error
    success: false,
    message: "Access denied. You do not have permission to view this community's dashboard."
  }
];

// Mock community data for testing
const communityMocks = [
  {
    // Mock 1: Large active community
    _id: "507f1f77bcf86cd799439011",
    name: "Tech Innovators Hub",
    description: "A vibrant community of technology enthusiasts and innovators",
    owner: "507f1f77bcf86cd799439021",
    members: [
      "507f1f77bcf86cd799439021",
      "507f1f77bcf86cd799439022",
      "507f1f77bcf86cd799439023"
    ],
    isActive: true,
    settings: {
      isPublic: true,
      allowMemberInvites: true,
      requireApproval: false
    },
    stats: {
      totalMembers: 1250,
      activeMembers: 892,
      totalNFTs: 5000
    },
    createdAt: "2024-01-15T10:30:00.000Z",
    updatedAt: "2025-09-15T07:52:23.119Z"
  },
  {
    // Mock 2: Medium gaming community
    _id: "507f1f77bcf86cd799439012",
    name: "GameFi Legends",
    description: "Gaming community focused on blockchain games and NFTs",
    owner: "507f1f77bcf86cd799439024",
    members: [
      "507f1f77bcf86cd799439024",
      "507f1f77bcf86cd799439025",
      "507f1f77bcf86cd799439026"
    ],
    isActive: true,
    settings: {
      isPublic: true,
      allowMemberInvites: true,
      requireApproval: true
    },
    stats: {
      totalMembers: 750,
      activeMembers: 425,
      totalNFTs: 2500
    },
    createdAt: "2024-03-20T14:15:00.000Z",
    updatedAt: "2025-09-15T07:45:10.234Z"
  },
  {
    // Mock 3: Small art community
    _id: "507f1f77bcf86cd799439013",
    name: "Digital Art Collective",
    description: "A creative space for digital artists and NFT creators",
    owner: "507f1f77bcf86cd799439027",
    members: [
      "507f1f77bcf86cd799439027",
      "507f1f77bcf86cd799439028",
      "507f1f77bcf86cd799439029"
    ],
    isActive: true,
    settings: {
      isPublic: false,
      allowMemberInvites: false,
      requireApproval: true
    },
    stats: {
      totalMembers: 320,
      activeMembers: 156,
      totalNFTs: 800
    },
    createdAt: "2024-06-10T09:45:00.000Z",
    updatedAt: "2025-09-15T07:38:45.567Z"
  }
];

// Mock user data for testing
const userMocks = [
  {
    // Mock 1: Community owner with high activity
    _id: "507f1f77bcf86cd799439021",
    username: "techleader",
    email: "leader@techinnovators.com",
    walletAddress: "0x1234567890123456789012345678901234567890",
    lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    isActive: true,
    communities: ["507f1f77bcf86cd799439011"],
    createdAt: "2024-01-15T10:30:00.000Z"
  },
  {
    // Mock 2: Active community member
    _id: "507f1f77bcf86cd799439022",
    username: "gamemaster",
    email: "gamer@gamefilegends.com",
    walletAddress: "0x2345678901234567890123456789012345678901",
    lastLogin: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    isActive: true,
    communities: ["507f1f77bcf86cd799439012"],
    createdAt: "2024-03-20T14:15:00.000Z"
  },
  {
    // Mock 3: Inactive community member
    _id: "507f1f77bcf86cd799439023",
    username: "artist_creator",
    email: "artist@digitalart.com",
    walletAddress: "0x3456789012345678901234567890123456789012",
    lastLogin: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago (inactive)
    isActive: true,
    communities: ["507f1f77bcf86cd799439013"],
    createdAt: "2024-06-10T09:45:00.000Z"
  }
];

// Mock NFT collection data for testing
const nftCollectionMocks = [
  {
    // Mock 1: Large successful collection
    _id: "507f1f77bcf86cd799439031",
    name: "Tech Innovators Badge",
    symbol: "TIB",
    description: "Exclusive badges for tech community members",
    maxSupply: 5000,
    mintedCount: 3500,
    distributedCount: 3200,
    communityId: "507f1f77bcf86cd799439011",
    createdBy: "507f1f77bcf86cd799439021",
    contractAddress: "0x1111111111111111111111111111111111111111",
    isActive: true,
    createdAt: "2024-02-01T12:00:00.000Z"
  },
  {
    // Mock 2: Gaming collection with moderate success
    _id: "507f1f77bcf86cd799439032",
    name: "GameFi Warriors",
    symbol: "GFW",
    description: "Warrior NFTs for gaming community",
    maxSupply: 2000,
    mintedCount: 1200,
    distributedCount: 1000,
    communityId: "507f1f77bcf86cd799439012",
    createdBy: "507f1f77bcf86cd799439024",
    contractAddress: "0x2222222222222222222222222222222222222222",
    isActive: true,
    createdAt: "2024-04-15T16:30:00.000Z"
  },
  {
    // Mock 3: Art collection with limited edition
    _id: "507f1f77bcf86cd799439033",
    name: "Digital Masterpieces",
    symbol: "DMP",
    description: "Limited edition digital art pieces",
    maxSupply: 500,
    mintedCount: 300,
    distributedCount: 280,
    communityId: "507f1f77bcf86cd799439013",
    createdBy: "507f1f77bcf86cd799439027",
    contractAddress: "0x3333333333333333333333333333333333333333",
    isActive: true,
    createdAt: "2024-07-01T11:15:00.000Z"
  }
];

// Export all mocks for use in tests and development
module.exports = {
  // Dashboard metrics mocks
  dashboardMetricsMocks,
  successfulResponseMocks,
  
  // Cache-related mocks
  cacheStatusMocks,
  cacheStatusResponseMocks,
  cacheInvalidationResponseMocks,
  
  // Error response mocks
  errorResponseMocks,
  
  // Data model mocks
  communityMocks,
  userMocks,
  nftCollectionMocks,
  
  // Helper functions for generating mock data
  generateRandomMetrics: (communityId, communityName) => {
    const totalMembers = Math.floor(Math.random() * 2000) + 100;
    const activeMembers = Math.floor(totalMembers * (0.4 + Math.random() * 0.4));
    const totalNFTs = Math.floor(Math.random() * 10000) + 500;
    const distributedNFTs = Math.floor(totalNFTs * (0.6 + Math.random() * 0.3));
    
    return {
      community_id: communityId,
      community_name: communityName,
      total_members: totalMembers,
      active_members: activeMembers,
      nft_stats: {
        total_nfts_minted: totalNFTs,
        total_nfts_distributed: distributedNFTs,
        collections_count: Math.floor(Math.random() * 10) + 1,
        total_max_supply: Math.floor(totalNFTs * (1.2 + Math.random() * 0.8)),
        distribution_rate: `${((distributedNFTs / totalNFTs) * 100).toFixed(2)}%`
      },
      last_updated: new Date().toISOString(),
      cache_ttl: 300
    };
  },
  
  generateCacheStatus: (communityId, cached = true) => {
    return {
      cached,
      ttl_seconds: cached ? Math.floor(Math.random() * 300) : 0,
      cache_key: `community:${communityId}:dashboard:metrics`
    };
  }
};

// Usage examples for testing:
/*
const { dashboardMetricsMocks, successfulResponseMocks } = require('./communityDashboardMocks');

// Use in tests:
console.log('Sample dashboard metrics:', dashboardMetricsMocks[0]);
console.log('Sample API response:', successfulResponseMocks[0]);

// Generate random data:
const randomMetrics = generateRandomMetrics('507f1f77bcf86cd799439999', 'Test Community');
console.log('Random metrics:', randomMetrics);
*/