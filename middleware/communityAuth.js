const Community = require('../models/Community');
const mongoose = require('mongoose');

/**
 * Middleware to validate if the authenticated user is a community admin
 * This middleware should be used after authenticateToken middleware
 */
const validateCommunityAdmin = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const communityId = req.body.community_id || req.params.community_id;

    // Check if community_id is provided
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid community ID format'
      });
    }

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if user is the community admin
    if (community.admin_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You must be the community administrator to perform this action.'
      });
    }

    // Add community to request object for use in route handlers
    req.community = community;
    next();
  } catch (error) {
    console.error('Community admin validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during community validation'
    });
  }
};

/**
 * Middleware to validate if the authenticated user is a member of the community
 * This middleware should be used after authenticateToken middleware
 */
const validateCommunityMember = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const communityId = req.body.community_id || req.params.community_id;

    // Check if community_id is provided
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid community ID format'
      });
    }

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Check if user is a member or admin of the community
    const isMember = community.members && community.members.includes(userId);
    const isAdmin = community.admin_id.toString() === userId.toString();

    if (!isMember && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You must be a member of this community.'
      });
    }

    // Add community to request object for use in route handlers
    req.community = community;
    req.isAdmin = isAdmin;
    next();
  } catch (error) {
    console.error('Community member validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during community validation'
    });
  }
};

/**
 * Middleware to check if a community exists and is accessible
 * This middleware can be used without authentication for public access
 */
const validateCommunityExists = async (req, res, next) => {
  try {
    const communityId = req.body.community_id || req.params.community_id || req.query.community_id;

    // Check if community_id is provided
    if (!communityId) {
      return res.status(400).json({
        success: false,
        message: 'Community ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid community ID format'
      });
    }

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Add community to request object for use in route handlers
    req.community = community;
    next();
  } catch (error) {
    console.error('Community validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during community validation'
    });
  }
};

module.exports = {
  validateCommunityAdmin,
  validateCommunityMember,
  validateCommunityExists
};