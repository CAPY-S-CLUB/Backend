/**
 * Configuração e utilitários para mocks do Community Dashboard
 * Este arquivo fornece configurações e helpers para usar os mocks em diferentes ambientes
 */

const {
  dashboardMetricsMocks,
  successfulResponseMocks,
  cacheStatusMocks,
  cacheStatusResponseMocks,
  cacheInvalidationResponseMocks,
  errorResponseMocks,
  communityMocks,
  userMocks,
  nftCollectionMocks,
  generateRandomMetrics,
  generateCacheStatus
} = require('./communityDashboardMocks');

const {
  invitationMocks,
  membersMocks,
  testScenarios,
  generateRandomInvitation,
  generateRandomMember
} = require('./memberManagementMocks');

/**
 * Configurações para diferentes ambientes de teste
 */
const mockConfigs = {
  // Configuração para testes unitários
  unit: {
    useRandomData: false,
    cacheEnabled: true,
    defaultTTL: 300,
    simulateErrors: false,
    responseDelay: 0
  },
  
  // Configuração para testes de integração
  integration: {
    useRandomData: true,
    cacheEnabled: true,
    defaultTTL: 300,
    simulateErrors: true,
    responseDelay: 100
  },
  
  // Configuração para testes de carga
  load: {
    useRandomData: true,
    cacheEnabled: true,
    defaultTTL: 60,
    simulateErrors: false,
    responseDelay: 50
  },
  
  // Configuração para desenvolvimento
  development: {
    useRandomData: false,
    cacheEnabled: true,
    defaultTTL: 300,
    simulateErrors: true,
    responseDelay: 200
  }
};

/**
 * Classe para gerenciar mocks do Community Dashboard
 */
class CommunityDashboardMockManager {
  constructor(environment = 'unit') {
    this.config = mockConfigs[environment] || mockConfigs.unit;
    this.environment = environment;
  }
  
  /**
   * Obter métricas do dashboard com base na configuração
   * @param {string} communityId - ID da comunidade
   * @param {string} communityName - Nome da comunidade (opcional)
   * @returns {Object} Métricas do dashboard
   */
  getDashboardMetrics(communityId, communityName = null) {
    if (this.config.useRandomData) {
      return generateRandomMetrics(communityId, communityName || `Comunidade ${communityId.slice(-4)}`);
    }
    
    // Retornar mock baseado no ID
    const mockIndex = this._getMockIndex(communityId);
    return dashboardMetricsMocks[mockIndex];
  }
  
  /**
   * Obter resposta da API de métricas
   * @param {string} communityId - ID da comunidade
   * @param {boolean} fromCache - Se os dados vieram do cache
   * @returns {Object} Resposta da API
   */
  getDashboardMetricsResponse(communityId, fromCache = false) {
    const metrics = this.getDashboardMetrics(communityId);
    const mockIndex = this._getMockIndex(communityId);
    
    return {
      success: true,
      message: "Dashboard metrics retrieved successfully",
      data: metrics,
      cache_info: {
        from_cache: fromCache && this.config.cacheEnabled,
        cache_ttl: fromCache ? Math.floor(Math.random() * this.config.defaultTTL) : null,
        cache_enabled: this.config.cacheEnabled
      }
    };
  }
  
  /**
   * Obter status do cache
   * @param {string} communityId - ID da comunidade
   * @returns {Object} Status do cache
   */
  getCacheStatus(communityId) {
    if (this.config.useRandomData) {
      return generateCacheStatus(communityId, this.config.cacheEnabled);
    }
    
    const mockIndex = this._getMockIndex(communityId);
    return cacheStatusMocks[mockIndex];
  }
  
  /**
   * Obter resposta do status do cache
   * @param {string} communityId - ID da comunidade
   * @returns {Object} Resposta da API
   */
  getCacheStatusResponse(communityId) {
    return {
      success: true,
      message: "Cache status retrieved successfully",
      data: this.getCacheStatus(communityId)
    };
  }
  
  /**
   * Obter resposta de invalidação de cache
   * @returns {Object} Resposta da API
   */
  getCacheInvalidationResponse() {
    return {
      success: true,
      message: "Cache invalidated successfully"
    };
  }
  
  /**
   * Obter resposta de erro baseada no tipo
   * @param {string} errorType - Tipo do erro (validation, auth, access, notfound)
   * @returns {Object} Resposta de erro
   */
  getErrorResponse(errorType) {
    if (!this.config.simulateErrors) {
      return this.getDashboardMetricsResponse('507f1f77bcf86cd799439011');
    }
    
    const errorMap = {
      validation: errorResponseMocks[0],
      auth: errorResponseMocks[1],
      access: errorResponseMocks[2],
      notfound: {
        success: false,
        message: "Community not found"
      }
    };
    
    return errorMap[errorType] || errorMap.validation;
  }
  
  /**
   * Simular delay de resposta
   * @returns {Promise} Promise que resolve após o delay configurado
   */
  async simulateDelay() {
    if (this.config.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
    }
  }
  
  /**
   * Obter dados de comunidade mock
   * @param {string} communityId - ID da comunidade
   * @returns {Object} Dados da comunidade
   */
  getCommunityData(communityId) {
    const mockIndex = this._getMockIndex(communityId);
    return communityMocks[mockIndex];
  }
  
  /**
   * Obter dados de usuário mock
   * @param {string} userId - ID do usuário
   * @returns {Object} Dados do usuário
   */
  getUserData(userId) {
    const mockIndex = this._getMockIndex(userId);
    return userMocks[mockIndex];
  }
  
  /**
   * Obter dados de coleção NFT mock
   * @param {string} collectionId - ID da coleção
   * @returns {Object} Dados da coleção
   */
  getNFTCollectionData(collectionId) {
    const mockIndex = this._getMockIndex(collectionId);
    return nftCollectionMocks[mockIndex];
  }
  
  /**
   * Obter dados de convite mock
   * @param {string} invitationId - ID do convite
   * @returns {Object} Dados do convite
   */
  getInvitationData(invitationId) {
    const mockIndex = this._getMockIndex(invitationId);
    return invitationMocks[mockIndex];
  }

  /**
   * Obter lista de membros mock
   * @param {string} communityId - ID da comunidade
   * @param {Object} filters - Filtros para aplicar
   * @returns {Array} Lista de membros
   */
  getMembersData(communityId, filters = {}) {
    let members = [...membersMocks];
    
    // Aplicar filtros
    if (filters.name) {
      const nameFilter = filters.name.toLowerCase();
      members = members.filter(member => 
        member.first_name.toLowerCase().includes(nameFilter) ||
        member.last_name.toLowerCase().includes(nameFilter)
      );
    }
    
    if (filters.email) {
      const emailFilter = filters.email.toLowerCase();
      members = members.filter(member => 
        member.email.toLowerCase().includes(emailFilter)
      );
    }
    
    if (filters.join_date_from) {
      const fromDate = new Date(filters.join_date_from);
      members = members.filter(member => 
        new Date(member.created_at) >= fromDate
      );
    }
    
    if (filters.join_date_to) {
      const toDate = new Date(filters.join_date_to);
      members = members.filter(member => 
        new Date(member.created_at) <= toDate
      );
    }
    
    return members;
  }

  /**
   * Gerar resposta de criação de convite
   * @param {string} email - Email do convidado
   * @param {number} expirationHours - Horas até expiração
   * @returns {Object} Resposta da API
   */
  getInvitationCreationResponse(email, expirationHours = 24) {
    const invitation = generateRandomInvitation(
      '507f1f77bcf86cd799439011', // communityId
      '507f1f77bcf86cd799439021'  // invitedBy
    );
    
    invitation.email = email;
    invitation.expiration_date = new Date(
      Date.now() + expirationHours * 60 * 60 * 1000
    ).toISOString();
    
    return {
      success: true,
      message: 'Invitation created successfully',
      data: invitation
    };
  }

  /**
   * Gerar resposta de listagem de membros com paginação
   * @param {string} communityId - ID da comunidade
   * @param {number} page - Página atual
   * @param {number} limit - Limite por página
   * @param {Object} filters - Filtros aplicados
   * @returns {Object} Resposta da API
   */
  getMembersListResponse(communityId, page = 1, limit = 20, filters = {}) {
    const allMembers = this.getMembersData(communityId, filters);
    const totalCount = allMembers.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const members = allMembers.slice(startIndex, endIndex);
    
    return {
      success: true,
      message: 'Members retrieved successfully',
      data: {
        members,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_count: totalCount,
          limit,
          has_next_page: page < totalPages,
          has_prev_page: page > 1
        },
        filters_applied: filters
      }
    };
  }

  /**
   * Gerar resposta de remoção de membro
   * @param {string} memberId - ID do membro
   * @returns {Object} Resposta da API
   */
  getMemberRemovalResponse(memberId) {
    const member = membersMocks.find(m => m._id === memberId) || membersMocks[0];
    
    return {
      success: true,
      message: 'Member removed successfully',
      data: {
        removed_member: {
          id: member._id,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          removed_at: new Date().toISOString()
        }
      }
    };
  }
  
  /**
   * Método privado para obter índice do mock baseado no ID
   * @param {string} id - ID para calcular o índice
   * @returns {number} Índice do mock (0-2)
   */
  _getMockIndex(id) {
    // Usar o último caractere do ID para determinar qual mock usar
    const lastChar = id.slice(-1);
    const charCode = lastChar.charCodeAt(0);
    return charCode % 3;
  }
}

/**
 * Middleware para Express que simula as APIs do Community Dashboard
 */
class MockAPIMiddleware {
  constructor(environment = 'development') {
    this.mockManager = new CommunityDashboardMockManager(environment);
  }
  
  /**
   * Middleware para GET /api/communities/:communityId/dashboard-metrics
   */
  dashboardMetrics() {
    return async (req, res, next) => {
      try {
        const { communityId } = req.params;
        const useCache = req.query.use_cache !== 'false';
        
        // Simular validação
        if (!this._isValidObjectId(communityId)) {
          return res.status(400).json(this.mockManager.getErrorResponse('validation'));
        }
        
        // Simular autenticação
        if (!req.headers.authorization) {
          return res.status(401).json(this.mockManager.getErrorResponse('auth'));
        }
        
        // Simular delay
        await this.mockManager.simulateDelay();
        
        // Simular chance de erro (5%)
        if (Math.random() < 0.05 && this.mockManager.config.simulateErrors) {
          return res.status(403).json(this.mockManager.getErrorResponse('access'));
        }
        
        // Retornar dados mock
        const response = this.mockManager.getDashboardMetricsResponse(communityId, useCache);
        res.json(response);
        
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }
    };
  }
  
  /**
   * Middleware para GET /api/communities/:communityId/dashboard-metrics/cache
   */
  cacheStatus() {
    return async (req, res, next) => {
      try {
        const { communityId } = req.params;
        
        if (!this._isValidObjectId(communityId)) {
          return res.status(400).json(this.mockManager.getErrorResponse('validation'));
        }
        
        await this.mockManager.simulateDelay();
        
        const response = this.mockManager.getCacheStatusResponse(communityId);
        res.json(response);
        
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }
    };
  }
  
  /**
   * Middleware para DELETE /api/communities/:communityId/dashboard-metrics/cache
   */
  cacheInvalidation() {
    return async (req, res, next) => {
      try {
        const { communityId } = req.params;
        
        if (!this._isValidObjectId(communityId)) {
          return res.status(400).json(this.mockManager.getErrorResponse('validation'));
        }
        
        await this.mockManager.simulateDelay();
        
        const response = this.mockManager.getCacheInvalidationResponse();
        res.json(response);
        
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error"
        });
      }
    };
  }
  
  /**
   * Validar se é um ObjectId válido
   * @param {string} id - ID para validar
   * @returns {boolean} True se válido
   */
  _isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
}

/**
 * Utilitários para testes
 */
const testUtils = {
  /**
   * Criar um mock manager para testes
   * @param {string} environment - Ambiente de teste
   * @returns {CommunityDashboardMockManager} Mock manager
   */
  createMockManager(environment = 'unit') {
    return new CommunityDashboardMockManager(environment);
  },
  
  /**
   * Criar middleware mock para Express
   * @param {string} environment - Ambiente
   * @returns {MockAPIMiddleware} Middleware mock
   */
  createMockMiddleware(environment = 'development') {
    return new MockAPIMiddleware(environment);
  },
  
  /**
   * Gerar dados de teste completos
   * @param {number} count - Número de conjuntos de dados
   * @returns {Object} Dados de teste
   */
  generateTestData(count = 3) {
    const testData = {
      communities: [],
      users: [],
      nftCollections: [],
      dashboardMetrics: []
    };
    
    for (let i = 0; i < count; i++) {
      const communityId = `507f1f77bcf86cd79943901${i}`;
      const userId = `507f1f77bcf86cd79943902${i}`;
      const collectionId = `507f1f77bcf86cd79943903${i}`;
      
      testData.communities.push({
        ...communityMocks[i % communityMocks.length],
        _id: communityId
      });
      
      testData.users.push({
        ...userMocks[i % userMocks.length],
        _id: userId
      });
      
      testData.nftCollections.push({
        ...nftCollectionMocks[i % nftCollectionMocks.length],
        _id: collectionId,
        communityId: communityId
      });
      
      testData.dashboardMetrics.push(
        generateRandomMetrics(communityId, `Test Community ${i + 1}`)
      );
    }
    
    return testData;
  },
  
  /**
   * Validar estrutura de resposta da API
   * @param {Object} response - Resposta para validar
   * @param {string} type - Tipo de resposta (metrics, cache, error)
   * @returns {boolean} True se válida
   */
  validateResponse(response, type) {
    const schemas = {
      metrics: ['success', 'message', 'data', 'cache_info'],
      cache: ['success', 'message', 'data'],
      error: ['success', 'message']
    };
    
    const requiredFields = schemas[type] || schemas.error;
    return requiredFields.every(field => response.hasOwnProperty(field));
  }
};

// Exportar todas as funcionalidades
module.exports = {
  mockConfigs,
  CommunityDashboardMockManager,
  MockAPIMiddleware,
  testUtils
};

// Exemplo de uso
if (require.main === module) {
  console.log('🔧 CONFIGURAÇÃO DE MOCKS DO COMMUNITY DASHBOARD');
  console.log('=' .repeat(50));
  
  // Demonstrar diferentes ambientes
  Object.keys(mockConfigs).forEach(env => {
    console.log(`\n📋 Ambiente: ${env.toUpperCase()}`);
    console.log(JSON.stringify(mockConfigs[env], null, 2));
  });
  
  // Demonstrar mock manager
  console.log('\n🎯 Exemplo de Mock Manager:');
  const mockManager = new CommunityDashboardMockManager('development');
  const metrics = mockManager.getDashboardMetrics('507f1f77bcf86cd799439011');
  console.log('Métricas:', JSON.stringify(metrics, null, 2));
  
  // Demonstrar geração de dados de teste
  console.log('\n🧪 Dados de Teste Gerados:');
  const testData = testUtils.generateTestData(2);
  console.log(`Gerados: ${testData.communities.length} comunidades, ${testData.users.length} usuários, ${testData.nftCollections.length} coleções`);
}