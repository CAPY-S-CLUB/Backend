const BadgeRule = require('../models/BadgeRule');
const NFTTransaction = require('../models/NFTTransaction');
const nftMintService = require('./nftMintService');

class BadgeRuleEngine {
  constructor() {
    this.ruleCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutos
    this.lastCacheUpdate = 0;
  }

  /**
   * Processar evento e aplicar regras de badges
   * @param {Object} eventData - Dados do evento
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processEvent(eventData) {
    try {
      const { eventType, userId, eventData: data, metadata } = eventData;
      
      console.log(`Processing event ${eventType} for user ${userId}`);
      
      // Buscar regras ativas para o tipo de evento
      const rules = await this.getActiveRules(eventType);
      
      if (rules.length === 0) {
        console.log(`No rules found for event type: ${eventType}`);
        return {
          success: true,
          rulesMatched: [],
          nftTransactions: [],
          message: 'No applicable rules found'
        };
      }
      
      const rulesMatched = [];
      const nftTransactions = [];
      
      // Avaliar cada regra
      for (const rule of rules) {
        try {
          const ruleResult = await this.evaluateRule(rule, eventData);
          rulesMatched.push(ruleResult);
          
          if (ruleResult.matched) {
            // Verificar se usuário já possui este badge (se oneTimeOnly)
            if (rule.oneTimeOnly) {
              const existingNFT = await this.checkExistingBadge(userId, rule._id);
              if (existingNFT) {
                console.log(`User ${userId} already has badge ${rule.name}`);
                ruleResult.reason = 'User already owns this badge';
                ruleResult.matched = false;
                continue;
              }
            }
            
            // Verificar supply limit
            if (rule.maxSupply && rule.currentSupply >= rule.maxSupply) {
              console.log(`Badge ${rule.name} has reached max supply`);
              ruleResult.reason = 'Maximum supply reached';
              ruleResult.matched = false;
              continue;
            }
            
            // Mint NFT
            const mintResult = await this.mintBadgeNFT(rule, userId, eventData);
            if (mintResult.success) {
              nftTransactions.push(mintResult.nftTransactionId);
              await rule.incrementSupply();
              console.log(`Badge ${rule.name} minted for user ${userId}`);
            } else {
              ruleResult.reason = `Mint failed: ${mintResult.error}`;
              ruleResult.matched = false;
            }
          }
        } catch (error) {
          console.error(`Error evaluating rule ${rule.name}:`, error);
          rulesMatched.push({
            ruleId: rule._id,
            ruleName: rule.name,
            matched: false,
            reason: `Evaluation error: ${error.message}`
          });
        }
      }
      
      return {
        success: true,
        rulesMatched,
        nftTransactions,
        message: `Processed ${rules.length} rules, ${nftTransactions.length} NFTs minted`
      };
      
    } catch (error) {
      console.error('Error processing event in rule engine:', error);
      throw error;
    }
  }
  
  /**
   * Avaliar uma regra específica
   * @param {Object} rule - Regra do badge
   * @param {Object} eventData - Dados do evento
   * @returns {Object} Resultado da avaliação
   */
  async evaluateRule(rule, eventData) {
    const ruleResult = {
      ruleId: rule._id,
      ruleName: rule.name,
      matched: false,
      reason: ''
    };
    
    try {
      // Verificar se a regra está válida
      if (!rule.isValid()) {
        ruleResult.reason = 'Rule is not valid (inactive, expired, or max supply reached)';
        return ruleResult;
      }
      
      // Verificar condições da regra
      const conditionsMatch = rule.checkConditions(eventData.eventData);
      
      if (conditionsMatch) {
        ruleResult.matched = true;
        ruleResult.reason = 'All conditions met';
      } else {
        ruleResult.reason = 'Conditions not met';
      }
      
      return ruleResult;
      
    } catch (error) {
      ruleResult.reason = `Evaluation error: ${error.message}`;
      return ruleResult;
    }
  }
  
  /**
   * Mint NFT badge para usuário
   * @param {Object} rule - Regra do badge
   * @param {string} userId - ID do usuário
   * @param {Object} eventData - Dados do evento
   * @returns {Promise<Object>} Resultado do mint
   */
  async mintBadgeNFT(rule, userId, eventData) {
    try {
      // Buscar endereço da carteira do usuário
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user || !user.walletAddress) {
        throw new Error('User wallet address not found');
      }
      
      // Gerar token ID único
      const tokenId = await this.generateTokenId(rule);
      
      // Preparar metadados do NFT
      const metadata = {
        ...rule.nftMetadata,
        attributes: [
          ...rule.nftMetadata.attributes,
          {
            trait_type: 'Event Type',
            value: eventData.eventType
          },
          {
            trait_type: 'Earned Date',
            value: new Date().toISOString()
          },
          {
            trait_type: 'Badge Rule',
            value: rule.name
          }
        ]
      };
      
      // Mint NFT
      const mintResult = await nftMintService.mintAndTransferNFT({
        walletAddress: user.walletAddress,
        tokenId,
        contractAddress: rule.contractAddress,
        tokenType: rule.tokenType,
        metadata,
        userId,
        eventType: eventData.eventType,
        eventData: eventData.eventData,
        amount: 1
      });
      
      return mintResult;
      
    } catch (error) {
      console.error('Error minting badge NFT:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Gerar token ID único
   * @param {Object} rule - Regra do badge
   * @returns {Promise<string>} Token ID
   */
  async generateTokenId(rule) {
    if (rule.tokenType === 'ERC721') {
      // Para ERC721, cada token deve ter ID único
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      return `${timestamp}${random}`;
    } else {
      // Para ERC1155, pode usar ID baseado na regra
      return rule._id.toString().slice(-8); // Últimos 8 caracteres do ID da regra
    }
  }
  
  /**
   * Verificar se usuário já possui badge
   * @param {string} userId - ID do usuário
   * @param {string} ruleId - ID da regra
   * @returns {Promise<boolean>} Se já possui
   */
  async checkExistingBadge(userId, ruleId) {
    const existingTransaction = await NFTTransaction.findOne({
      userId,
      'metadata.ruleId': ruleId,
      status: { $in: ['confirmed', 'pending'] }
    });
    
    return !!existingTransaction;
  }
  
  /**
   * Buscar regras ativas com cache
   * @param {string} eventType - Tipo do evento
   * @returns {Promise<Array>} Lista de regras
   */
  async getActiveRules(eventType) {
    const now = Date.now();
    const cacheKey = `rules_${eventType}`;
    
    // Verificar cache
    if (this.ruleCache.has(cacheKey) && (now - this.lastCacheUpdate) < this.cacheExpiry) {
      return this.ruleCache.get(cacheKey);
    }
    
    // Buscar do banco
    const rules = await BadgeRule.findActiveRulesByEventType(eventType);
    
    // Atualizar cache
    this.ruleCache.set(cacheKey, rules);
    this.lastCacheUpdate = now;
    
    return rules;
  }
  
  /**
   * Limpar cache de regras
   */
  clearRuleCache() {
    this.ruleCache.clear();
    this.lastCacheUpdate = 0;
    console.log('Rule cache cleared');
  }
  
  /**
   * Criar regra de badge
   * @param {Object} ruleData - Dados da regra
   * @returns {Promise<Object>} Regra criada
   */
  async createBadgeRule(ruleData) {
    try {
      const rule = new BadgeRule(ruleData);
      await rule.save();
      
      // Limpar cache para forçar reload
      this.clearRuleCache();
      
      console.log(`Badge rule created: ${rule.name}`);
      return rule;
      
    } catch (error) {
      console.error('Error creating badge rule:', error);
      throw error;
    }
  }
  
  /**
   * Atualizar regra de badge
   * @param {string} ruleId - ID da regra
   * @param {Object} updateData - Dados para atualizar
   * @returns {Promise<Object>} Regra atualizada
   */
  async updateBadgeRule(ruleId, updateData) {
    try {
      const rule = await BadgeRule.findByIdAndUpdate(ruleId, updateData, { new: true });
      
      if (!rule) {
        throw new Error('Badge rule not found');
      }
      
      // Limpar cache
      this.clearRuleCache();
      
      console.log(`Badge rule updated: ${rule.name}`);
      return rule;
      
    } catch (error) {
      console.error('Error updating badge rule:', error);
      throw error;
    }
  }
  
  /**
   * Desativar regra de badge
   * @param {string} ruleId - ID da regra
   * @returns {Promise<Object>} Regra desativada
   */
  async deactivateBadgeRule(ruleId) {
    try {
      const rule = await BadgeRule.findByIdAndUpdate(
        ruleId, 
        { isActive: false }, 
        { new: true }
      );
      
      if (!rule) {
        throw new Error('Badge rule not found');
      }
      
      // Limpar cache
      this.clearRuleCache();
      
      console.log(`Badge rule deactivated: ${rule.name}`);
      return rule;
      
    } catch (error) {
      console.error('Error deactivating badge rule:', error);
      throw error;
    }
  }
  
  /**
   * Listar todas as regras
   * @param {Object} filters - Filtros opcionais
   * @returns {Promise<Array>} Lista de regras
   */
  async listBadgeRules(filters = {}) {
    try {
      const query = {};
      
      if (filters.eventType) {
        query.eventType = filters.eventType;
      }
      
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }
      
      if (filters.tokenType) {
        query.tokenType = filters.tokenType;
      }
      
      const rules = await BadgeRule.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .populate('createdBy', 'username email');
      
      return rules;
      
    } catch (error) {
      console.error('Error listing badge rules:', error);
      throw error;
    }
  }
  
  /**
   * Obter estatísticas de regras
   * @returns {Promise<Object>} Estatísticas
   */
  async getRuleStatistics() {
    try {
      const stats = await BadgeRule.aggregate([
        {
          $group: {
            _id: null,
            totalRules: { $sum: 1 },
            activeRules: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
            },
            totalSupply: { $sum: '$currentSupply' },
            avgSupply: { $avg: '$currentSupply' }
          }
        },
        {
          $project: {
            _id: 0,
            totalRules: 1,
            activeRules: 1,
            inactiveRules: { $subtract: ['$totalRules', '$activeRules'] },
            totalSupply: 1,
            avgSupply: { $round: ['$avgSupply', 2] }
          }
        }
      ]);
      
      const eventTypeStats = await BadgeRule.aggregate([
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            totalSupply: { $sum: '$currentSupply' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);
      
      return {
        general: stats[0] || {
          totalRules: 0,
          activeRules: 0,
          inactiveRules: 0,
          totalSupply: 0,
          avgSupply: 0
        },
        byEventType: eventTypeStats
      };
      
    } catch (error) {
      console.error('Error getting rule statistics:', error);
      throw error;
    }
  }
}

module.exports = new BadgeRuleEngine();