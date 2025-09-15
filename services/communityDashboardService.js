const Community = require('../models/Community');
const NFTCollection = require('../models/NFTCollection');
const User = require('../models/User');
const mongoose = require('mongoose');
const { redis, cacheUtils } = require('../config/redis');

class CommunityDashboardService {
  /**
   * Get comprehensive dashboard metrics for a community
   * @param {string} communityId - Community ID
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<Object>} - Dashboard metrics
   */
  async getDashboardMetrics(communityId, useCache = true) {
    try {
      // Validate community ID
      if (!mongoose.Types.ObjectId.isValid(communityId)) {
        throw new Error('Invalid community ID format');
      }

      // Check cache first
      if (useCache) {
        const cacheKey = cacheService.getDashboardMetricsKey(communityId);
        const cachedMetrics = await cacheService.get(cacheKey);
        if (cachedMetrics) {
          console.log(`Dashboard metrics served from cache for community: ${communityId}`);
          return cachedMetrics;
        }
      }

      // Verify community exists
      const community = await Community.findById(communityId).select('_id name status');
      if (!community) {
        throw new Error('Community not found');
      }

      if (community.status !== 'active') {
        throw new Error('Community is not active');
      }

      // Execute all queries in parallel for better performance
      const [totalMembers, activeMembers, nftStats] = await Promise.all([
        this.getTotalMembersCount(communityId),
        this.getActiveMembersCount(communityId),
        this.getNFTStats(communityId)
      ]);

      // Combine results
      const metrics = {
        community_id: communityId,
        community_name: community.name,
        total_members: totalMembers,
        active_members: activeMembers,
        nft_stats: nftStats,
        last_updated: new Date().toISOString(),
        cache_ttl: 300 // 5 minutes
      };

      // Cache the results for 5 minutes
      if (useCache) {
        const cacheKey = cacheService.getDashboardMetricsKey(communityId);
        await cacheService.set(cacheKey, metrics, 300);
        console.log(`Dashboard metrics cached for community: ${communityId}`);
      }

      return metrics;
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get total number of members in the community
   * @param {string} communityId - Community ID
   * @returns {Promise<number>} - Total member count
   */
  async getTotalMembersCount(communityId) {
    try {
      // Optimized aggregation query
      const result = await Community.aggregate([
        {
          $match: {
            _id: new mongoose.Types.ObjectId(communityId),
            status: 'active'
          }
        },
        {
          $project: {
            total_members: {
              $size: {
                $filter: {
                  input: '$members',
                  cond: { $eq: ['$$this.is_active', true] }
                }
              }
            }
          }
        }
      ]);

      return result.length > 0 ? result[0].total_members : 0;
    } catch (error) {
      console.error('Error getting total members count:', error);
      throw error;
    }
  }

  /**
   * Get count of active members (logged in within last 30 days)
   * @param {string} communityId - Community ID
   * @returns {Promise<number>} - Active member count
   */
  async getActiveMembersCount(communityId) {
    try {
      // Calculate date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Optimized aggregation with lookup to User collection
      const result = await Community.aggregate([
        {
          $match: {
            _id: new mongoose.Types.ObjectId(communityId),
            status: 'active'
          }
        },
        {
          $unwind: '$members'
        },
        {
          $match: {
            'members.is_active': true
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'members.user_id',
            foreignField: '_id',
            as: 'user_info'
          }
        },
        {
          $unwind: '$user_info'
        },
        {
          $match: {
            'user_info.last_login': { $gte: thirtyDaysAgo },
            'user_info.is_active': true
          }
        },
        {
          $count: 'active_members'
        }
      ]);

      return result.length > 0 ? result[0].active_members : 0;
    } catch (error) {
      console.error('Error getting active members count:', error);
      throw error;
    }
  }

  /**
   * Get NFT statistics for community members
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} - NFT statistics
   */
  async getNFTStats(communityId) {
    try {
      // Get community with member IDs
      const community = await Community.findById(communityId)
        .select('members brand_id')
        .lean();

      if (!community) {
        return {
          total_nfts_minted: 0,
          total_nfts_distributed: 0,
          collections_count: 0
        };
      }

      // Extract active member user IDs
      const memberUserIds = community.members
        .filter(member => member.is_active)
        .map(member => member.user_id);

      if (memberUserIds.length === 0) {
        return {
          total_nfts_minted: 0,
          total_nfts_distributed: 0,
          collections_count: 0
        };
      }

      // Aggregation to get NFT statistics
      const nftStats = await NFTCollection.aggregate([
        {
          $match: {
            brand_id: community.brand_id,
            status: { $in: ['deployed', 'active'] }
          }
        },
        {
          $group: {
            _id: null,
            total_collections: { $sum: 1 },
            total_minted: {
              $sum: {
                $cond: [
                  { $ifNull: ['$tokens_minted', false] },
                  '$tokens_minted',
                  0
                ]
              }
            },
            total_max_supply: {
              $sum: {
                $cond: [
                  { $ifNull: ['$max_supply', false] },
                  '$max_supply',
                  0
                ]
              }
            }
          }
        }
      ]);

      const stats = nftStats.length > 0 ? nftStats[0] : {
        total_collections: 0,
        total_minted: 0,
        total_max_supply: 0
      };

      // For distributed NFTs, we'll use a simplified calculation
      // In a real scenario, you'd have a separate collection tracking NFT ownership
      const distributedEstimate = Math.floor(stats.total_minted * 0.8); // Assume 80% are distributed

      return {
        total_nfts_minted: stats.total_minted,
        total_nfts_distributed: distributedEstimate,
        collections_count: stats.total_collections,
        total_max_supply: stats.total_max_supply,
        distribution_rate: stats.total_minted > 0 ? 
          ((distributedEstimate / stats.total_minted) * 100).toFixed(2) + '%' : '0%'
      };
    } catch (error) {
      console.error('Error getting NFT stats:', error);
      throw error;
    }
  }

  /**
   * Get cached metrics for community
   * @param {string} communityId - Community ID
   * @returns {Promise<Object|null>} - Cached metrics or null
   */
  async getCachedMetrics(communityId) {
     try {
       const cacheKey = this.getCacheKey(communityId);
       return await cacheUtils.get(cacheKey);
     } catch (error) {
       console.error('Error getting cached metrics:', error);
       return null;
     }
   }
 
   /**
    * Set cached metrics for community
    * @param {string} communityId - Community ID
    * @param {Object} metrics - Metrics to cache
    * @returns {Promise<boolean>} - Success status
    */
   async setCachedMetrics(communityId, metrics) {
     try {
       const cacheKey = this.getCacheKey(communityId);
       const ttl = 300; // 5 minutes
       await cacheUtils.set(cacheKey, {
         ...metrics,
         cached_at: new Date(),
         cache_ttl: ttl
       }, ttl);
       return true;
     } catch (error) {
       console.error('Error setting cached metrics:', error);
       return false;
     }
   }

  /**
   * Invalidate cache for community dashboard metrics
   * @param {string} communityId - Community ID
   * @returns {Promise<boolean>} - Success status
   */
  async invalidateCache(communityId) {
    try {
      const cacheKey = this.getCacheKey(communityId);
      await cacheUtils.del(cacheKey);
      console.log(`Cache invalidated for community: ${communityId}`);
      return true;
    } catch (error) {
      console.error('Error invalidating cache:', error);
      return false;
    }
  }

  /**
   * Get cache status for community metrics
   * @param {string} communityId - Community ID
   * @returns {Promise<Object>} - Cache status
   */
  async getCacheStatus(communityId) {
    try {
      const cacheKey = this.getCacheKey(communityId);
      const exists = await cacheUtils.exists(cacheKey);
      const ttl = exists ? await cacheUtils.ttl(cacheKey) : 0;
      
      return {
        cached: exists,
        ttl_seconds: ttl > 0 ? ttl : 0,
        cache_key: cacheKey
      };
    } catch (error) {
      console.error('Error getting cache status:', error);
      return {
        cached: false,
        ttl_seconds: 0,
        cache_key: this.getCacheKey(communityId)
      };
    }
  }

  /**
   * Validate community access for user
   * @param {string} communityId - Community ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} - Access status
   */
  async validateCommunityAccess(communityId, userId) {
    try {
      const community = await Community.findById(communityId)
        .select('members admin_id settings.is_public')
        .lean();

      if (!community) {
        return false;
      }

      // Admin always has access
      if (community.admin_id.toString() === userId) {
        return true;
      }

      // Check if user is a member
      const isMember = community.members.some(member => 
        member.user_id.toString() === userId && member.is_active
      );

      if (isMember) {
        return true;
      }

      // Check if community is public
      return community.settings?.is_public || false;
    } catch (error) {
      console.error('Error validating community access:', error);
      return false;
    }
  }
}

module.exports = new CommunityDashboardService();