const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Content = require('../models/Content');

/**
 * Middleware para verificar acesso a conteúdo exclusivo
 * Implementa o fluxo: Autenticação JWT → Verificação de Comunidade → Autorização de Acesso
 */

/**
 * Middleware de autenticação JWT específico para conteúdo
 * Extrai e valida o token JWT, carregando dados do usuário
 */
const authenticateContentAccess = async (req, res, next) => {
  try {
    // Extrair token do header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is required',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // Verificar e decodificar o token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (jwtError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Buscar usuário no banco de dados
    const user = await User.findById(decoded.id)
      .select('_id username email community_id role isActive')
      .populate('community_id', '_id name');

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User account is inactive',
        code: 'INACTIVE_USER'
      });
    }

    // Adicionar dados do usuário ao request
    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      community_id: user.community_id?._id,
      community_name: user.community_id?.name,
      role: user.role
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication service unavailable',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Middleware para verificar afiliação à comunidade do conteúdo
 * Valida se o usuário pertence à mesma comunidade do conteúdo solicitado
 */
const validateCommunityAffiliation = async (req, res, next) => {
  try {
    const { content_id } = req.params;
    const { user } = req;

    // Validar formato do content_id
    if (!content_id || !content_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid content ID format',
        code: 'INVALID_CONTENT_ID'
      });
    }

    // Buscar o conteúdo no banco de dados
    const content = await Content.findById(content_id)
      .select('_id community_id contentType accessLevel isActive')
      .populate('community_id', '_id name');

    if (!content) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Content not found',
        code: 'CONTENT_NOT_FOUND'
      });
    }

    // Verificar se o conteúdo está ativo
    if (!content.isActive) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Content is no longer available',
        code: 'CONTENT_INACTIVE'
      });
    }

    // Verificar se o usuário pertence a uma comunidade
    if (!user.community_id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User must be a member of a community to access exclusive content',
        code: 'NO_COMMUNITY_MEMBERSHIP'
      });
    }

    // Verificar afiliação à comunidade
    if (user.community_id.toString() !== content.community_id._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied. Content belongs to a different community',
        code: 'COMMUNITY_MISMATCH',
        details: {
          userCommunity: user.community_name,
          contentCommunity: content.community_id.name
        }
      });
    }

    // Verificar nível de acesso baseado no papel do usuário
    const hasAccess = content.hasAccess(user.role, user.community_id);
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to access this content',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          requiredLevel: content.accessLevel,
          userRole: user.role
        }
      });
    }

    // Adicionar dados do conteúdo ao request para uso posterior
    req.content = {
      id: content._id,
      community_id: content.community_id._id,
      community_name: content.community_id.name,
      contentType: content.contentType,
      accessLevel: content.accessLevel
    };

    next();
  } catch (error) {
    console.error('Community affiliation validation error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Content access validation service unavailable',
      code: 'VALIDATION_SERVICE_ERROR'
    });
  }
};

/**
 * Middleware combinado para controle completo de acesso a conteúdo
 * Executa autenticação e verificação de comunidade em sequência
 */
const requireContentAccess = [
  authenticateContentAccess,
  validateCommunityAffiliation
];

/**
 * Middleware para logging de acesso a conteúdo (opcional)
 */
const logContentAccess = (req, res, next) => {
  const { user, content } = req;
  const timestamp = new Date().toISOString();
  
  console.log(`[${timestamp}] Content Access: User ${user.username} (${user.id}) accessed content ${content.id} from community ${content.community_name}`);
  
  next();
};

module.exports = {
  authenticateContentAccess,
  validateCommunityAffiliation,
  requireContentAccess,
  logContentAccess
};