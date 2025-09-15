const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

// Middleware to check user roles
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
        required_roles: allowedRoles,
        user_role: req.user.user_type
      });
    }

    next();
  };
};

// Middleware specifically for platform admins
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  if (req.user.user_type !== 'platform_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Platform admin privileges required.'
    });
  }

  next();
};

// Middleware for community admins and platform admins
const requireAdminAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const allowedRoles = ['platform_admin', 'community_admin'];
  if (!allowedRoles.includes(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  next();
};

// Middleware to check if user can modify a specific resource
const requireResourceOwnership = (resourceField = 'admin_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Platform admins can modify any resource
    if (req.user.user_type === 'platform_admin') {
      return next();
    }

    // For other users, check ownership
    const resourceOwnerId = req.resource && req.resource[resourceField];
    if (!resourceOwnerId) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found.'
      });
    }

    if (resourceOwnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only modify your own resources.'
      });
    }

    next();
  };
};

// Middleware to load and check brand ownership
const loadBrandAndCheckOwnership = async (req, res, next) => {
  try {
    const Brand = require('../models/Brand');
    const brandId = req.params.id;

    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: 'Brand ID is required.'
      });
    }

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.'
      });
    }

    // Check if user can modify this brand
    if (!brand.canBeModifiedBy(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only modify your own brands.'
      });
    }

    req.brand = brand;
    next();

  } catch (error) {
    console.error('Brand ownership check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during ownership verification.'
    });
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return next(); // Continue without user context
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user && user.is_active) {
      req.user = user;
    }

    next();

  } catch (error) {
    // Ignore token errors for optional auth
    next();
  }
};

module.exports = {
  authenticateToken,
  authorize,
  requirePlatformAdmin,
  requireAdminAccess,
  requireResourceOwnership,
  loadBrandAndCheckOwnership,
  optionalAuth
};