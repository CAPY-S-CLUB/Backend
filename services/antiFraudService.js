const Redis = require('redis');
const crypto = require('crypto');
const NFTTransaction = require('../models/NFTTransaction');
const EventLog = require('../models/EventLog');
const BadgeRule = require('../models/BadgeRule');
const eventService = require('./eventService');

class AntiFraudService {
  constructor() {
    this.redis = null;
    this.rateLimits = {
      // Rate limits por usuário
      userMintPerHour: 5,
      userMintPerDay: 20,
      userEventsPerMinute: 10,
      
      // Rate limits globais
      globalMintPerMinute: 100,
      globalMintPerHour: 1000,
      
      // Rate limits por IP
      ipRequestsPerMinute: 60,
      ipRequestsPerHour: 500
    };
    
    this.fraudPatterns = {
      // Padrões suspeitos
      maxSameEventPerUser: 3, // Máximo do mesmo evento por usuário por hora
      maxFailedAttemptsPerUser: 10, // Máximo de tentativas falhadas por usuário por hora
      suspiciousVelocityThreshold: 5, // Eventos muito rápidos (por minuto)
      duplicateEventWindowMinutes: 5 // Janela para detectar eventos duplicados
    };
    
    this.blacklistedAddresses = new Set();
    this.whitelistedAddresses = new Set();
    this.suspiciousUsers = new Map(); // Cache de usuários suspeitos
  }

  /**
   * Inicializar o serviço anti-fraude
   * @param {Object} config - Configurações do serviço
   */
  async initialize(config = {}) {
    try {
      console.log('Initializing Anti-Fraud Service...');
      
      // Conectar ao Redis
      this.redis = Redis.createClient(config.redis || {});
      await this.redis.connect();
      
      // Configurar rate limits personalizados
      if (config.rateLimits) {
        this.rateLimits = { ...this.rateLimits, ...config.rateLimits };
      }
      
      // Configurar padrões de fraude personalizados
      if (config.fraudPatterns) {
        this.fraudPatterns = { ...this.fraudPatterns, ...config.fraudPatterns };
      }
      
      // Carregar listas de endereços
      if (config.blacklistedAddresses) {
        config.blacklistedAddresses.forEach(addr => this.blacklistedAddresses.add(addr.toLowerCase()));
      }
      
      if (config.whitelistedAddresses) {
        config.whitelistedAddresses.forEach(addr => this.whitelistedAddresses.add(addr.toLowerCase()));
      }
      
      console.log('Anti-Fraud Service initialized successfully');
      
    } catch (error) {
      console.error('Error initializing Anti-Fraud Service:', error);
      throw error;
    }
  }

  /**
   * Verificar rate limit para usuário
   * @param {string} userId - ID do usuário
   * @param {string} action - Ação sendo realizada
   * @param {string} timeWindow - Janela de tempo (hour, day, minute)
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkUserRateLimit(userId, action, timeWindow = 'hour') {
    try {
      const key = `rate_limit:user:${userId}:${action}:${timeWindow}`;
      const windowSeconds = this.getWindowSeconds(timeWindow);
      const limit = this.getUserLimit(action, timeWindow);
      
      const current = await this.redis.get(key);
      const count = current ? parseInt(current) : 0;
      
      if (count >= limit) {
        return {
          allowed: false,
          limit,
          current: count,
          resetTime: await this.redis.ttl(key),
          reason: `User rate limit exceeded for ${action} (${count}/${limit} per ${timeWindow})`
        };
      }
      
      // Incrementar contador
      const pipeline = this.redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      await pipeline.exec();
      
      return {
        allowed: true,
        limit,
        current: count + 1,
        remaining: limit - count - 1
      };
      
    } catch (error) {
      console.error('Error checking user rate limit:', error);
      // Em caso de erro, permitir a ação (fail-open)
      return { allowed: true, error: error.message };
    }
  }

  /**
   * Verificar rate limit global
   * @param {string} action - Ação sendo realizada
   * @param {string} timeWindow - Janela de tempo
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkGlobalRateLimit(action, timeWindow = 'minute') {
    try {
      const key = `rate_limit:global:${action}:${timeWindow}`;
      const windowSeconds = this.getWindowSeconds(timeWindow);
      const limit = this.getGlobalLimit(action, timeWindow);
      
      const current = await this.redis.get(key);
      const count = current ? parseInt(current) : 0;
      
      if (count >= limit) {
        return {
          allowed: false,
          limit,
          current: count,
          resetTime: await this.redis.ttl(key),
          reason: `Global rate limit exceeded for ${action} (${count}/${limit} per ${timeWindow})`
        };
      }
      
      // Incrementar contador
      const pipeline = this.redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      await pipeline.exec();
      
      return {
        allowed: true,
        limit,
        current: count + 1,
        remaining: limit - count - 1
      };
      
    } catch (error) {
      console.error('Error checking global rate limit:', error);
      return { allowed: true, error: error.message };
    }
  }

  /**
   * Verificar rate limit por IP
   * @param {string} ipAddress - Endereço IP
   * @param {string} timeWindow - Janela de tempo
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkIPRateLimit(ipAddress, timeWindow = 'minute') {
    try {
      const key = `rate_limit:ip:${ipAddress}:${timeWindow}`;
      const windowSeconds = this.getWindowSeconds(timeWindow);
      const limit = this.getIPLimit(timeWindow);
      
      const current = await this.redis.get(key);
      const count = current ? parseInt(current) : 0;
      
      if (count >= limit) {
        return {
          allowed: false,
          limit,
          current: count,
          resetTime: await this.redis.ttl(key),
          reason: `IP rate limit exceeded (${count}/${limit} per ${timeWindow})`
        };
      }
      
      // Incrementar contador
      const pipeline = this.redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      await pipeline.exec();
      
      return {
        allowed: true,
        limit,
        current: count + 1,
        remaining: limit - count - 1
      };
      
    } catch (error) {
      console.error('Error checking IP rate limit:', error);
      return { allowed: true, error: error.message };
    }
  }

  /**
   * Verificar se usuário pode receber um badge específico
   * @param {string} userId - ID do usuário
   * @param {string} badgeRuleId - ID da regra do badge
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkBadgeEligibility(userId, badgeRuleId) {
    try {
      // Verificar se o usuário já possui este badge
      const existingTransaction = await NFTTransaction.findOne({
        userId,
        badgeRuleId,
        status: { $in: ['confirmed', 'pending'] }
      });
      
      if (existingTransaction) {
        return {
          eligible: false,
          reason: 'User already has this badge or has a pending transaction for it',
          existingTransaction: existingTransaction._id
        };
      }
      
      // Buscar a regra do badge
      const badgeRule = await BadgeRule.findById(badgeRuleId);
      
      if (!badgeRule || !badgeRule.isActive) {
        return {
          eligible: false,
          reason: 'Badge rule not found or inactive'
        };
      }
      
      // Verificar se o badge é único (oneTimeOnly)
      if (badgeRule.oneTimeOnly) {
        const userBadgeCount = await NFTTransaction.countDocuments({
          userId,
          badgeRuleId,
          status: 'confirmed'
        });
        
        if (userBadgeCount > 0) {
          return {
            eligible: false,
            reason: 'This badge can only be earned once per user'
          };
        }
      }
      
      // Verificar limite de supply
      if (badgeRule.maxSupply && badgeRule.maxSupply > 0) {
        const totalMinted = await NFTTransaction.countDocuments({
          badgeRuleId,
          status: 'confirmed'
        });
        
        if (totalMinted >= badgeRule.maxSupply) {
          return {
            eligible: false,
            reason: 'Badge supply limit reached'
          };
        }
      }
      
      return {
        eligible: true,
        badgeRule
      };
      
    } catch (error) {
      console.error('Error checking badge eligibility:', error);
      return {
        eligible: false,
        reason: `Error checking eligibility: ${error.message}`
      };
    }
  }

  /**
   * Detectar padrões suspeitos de fraude
   * @param {string} userId - ID do usuário
   * @param {Object} eventData - Dados do evento
   * @returns {Promise<Object>} Resultado da análise
   */
  async detectFraudPatterns(userId, eventData) {
    try {
      const suspiciousActivities = [];
      const now = new Date();
      
      // 1. Verificar velocidade de eventos
      const recentEvents = await EventLog.find({
        userId,
        createdAt: {
          $gte: new Date(now.getTime() - 60 * 1000) // Último minuto
        }
      });
      
      if (recentEvents.length >= this.fraudPatterns.suspiciousVelocityThreshold) {
        suspiciousActivities.push({
          type: 'high_velocity',
          description: `${recentEvents.length} events in the last minute`,
          severity: 'medium'
        });
      }
      
      // 2. Verificar eventos duplicados
      const duplicateWindow = new Date(now.getTime() - this.fraudPatterns.duplicateEventWindowMinutes * 60 * 1000);
      const duplicateEvents = await EventLog.find({
        userId,
        eventType: eventData.eventType,
        createdAt: { $gte: duplicateWindow }
      });
      
      if (duplicateEvents.length > 0) {
        suspiciousActivities.push({
          type: 'duplicate_event',
          description: `Duplicate ${eventData.eventType} event within ${this.fraudPatterns.duplicateEventWindowMinutes} minutes`,
          severity: 'high'
        });
      }
      
      // 3. Verificar mesmo evento repetido
      const sameEventCount = await EventLog.countDocuments({
        userId,
        eventType: eventData.eventType,
        createdAt: {
          $gte: new Date(now.getTime() - 60 * 60 * 1000) // Última hora
        }
      });
      
      if (sameEventCount >= this.fraudPatterns.maxSameEventPerUser) {
        suspiciousActivities.push({
          type: 'repeated_event',
          description: `${sameEventCount} ${eventData.eventType} events in the last hour`,
          severity: 'high'
        });
      }
      
      // 4. Verificar tentativas falhadas
      const failedAttempts = await NFTTransaction.countDocuments({
        userId,
        status: 'failed',
        createdAt: {
          $gte: new Date(now.getTime() - 60 * 60 * 1000) // Última hora
        }
      });
      
      if (failedAttempts >= this.fraudPatterns.maxFailedAttemptsPerUser) {
        suspiciousActivities.push({
          type: 'excessive_failures',
          description: `${failedAttempts} failed transactions in the last hour`,
          severity: 'medium'
        });
      }
      
      // 5. Verificar endereço na blacklist
      if (eventData.walletAddress && this.blacklistedAddresses.has(eventData.walletAddress.toLowerCase())) {
        suspiciousActivities.push({
          type: 'blacklisted_address',
          description: 'Wallet address is blacklisted',
          severity: 'critical'
        });
      }
      
      // Calcular score de risco
      const riskScore = this.calculateRiskScore(suspiciousActivities);
      
      // Determinar ação recomendada
      const action = this.determineAction(riskScore, suspiciousActivities);
      
      return {
        riskScore,
        suspiciousActivities,
        action,
        timestamp: now.toISOString()
      };
      
    } catch (error) {
      console.error('Error detecting fraud patterns:', error);
      return {
        riskScore: 0,
        suspiciousActivities: [],
        action: 'allow',
        error: error.message
      };
    }
  }

  /**
   * Calcular score de risco baseado nas atividades suspeitas
   * @param {Array} suspiciousActivities - Lista de atividades suspeitas
   * @returns {number} Score de risco (0-100)
   */
  calculateRiskScore(suspiciousActivities) {
    let score = 0;
    
    for (const activity of suspiciousActivities) {
      switch (activity.severity) {
        case 'critical':
          score += 50;
          break;
        case 'high':
          score += 30;
          break;
        case 'medium':
          score += 15;
          break;
        case 'low':
          score += 5;
          break;
      }
    }
    
    return Math.min(score, 100); // Máximo 100
  }

  /**
   * Determinar ação baseada no score de risco
   * @param {number} riskScore - Score de risco
   * @param {Array} suspiciousActivities - Atividades suspeitas
   * @returns {string} Ação recomendada
   */
  determineAction(riskScore, suspiciousActivities) {
    // Verificar se há atividades críticas
    const hasCritical = suspiciousActivities.some(a => a.severity === 'critical');
    
    if (hasCritical || riskScore >= 80) {
      return 'block';
    } else if (riskScore >= 50) {
      return 'review';
    } else if (riskScore >= 25) {
      return 'monitor';
    } else {
      return 'allow';
    }
  }

  /**
   * Verificar todas as proteções anti-fraude
   * @param {Object} params - Parâmetros da verificação
   * @returns {Promise<Object>} Resultado completo da verificação
   */
  async performComprehensiveCheck(params) {
    const { userId, ipAddress, eventData, badgeRuleId, action = 'mint' } = params;
    
    try {
      const results = {
        allowed: true,
        checks: {},
        riskAssessment: null,
        blockReasons: [],
        warnings: []
      };
      
      // 1. Rate limiting checks
      const [userRateLimit, globalRateLimit, ipRateLimit] = await Promise.all([
        this.checkUserRateLimit(userId, action, 'hour'),
        this.checkGlobalRateLimit(action, 'minute'),
        ipAddress ? this.checkIPRateLimit(ipAddress, 'minute') : { allowed: true }
      ]);
      
      results.checks.userRateLimit = userRateLimit;
      results.checks.globalRateLimit = globalRateLimit;
      results.checks.ipRateLimit = ipRateLimit;
      
      if (!userRateLimit.allowed) {
        results.allowed = false;
        results.blockReasons.push(userRateLimit.reason);
      }
      
      if (!globalRateLimit.allowed) {
        results.allowed = false;
        results.blockReasons.push(globalRateLimit.reason);
      }
      
      if (!ipRateLimit.allowed) {
        results.allowed = false;
        results.blockReasons.push(ipRateLimit.reason);
      }
      
      // 2. Badge eligibility check
      if (badgeRuleId) {
        const eligibility = await this.checkBadgeEligibility(userId, badgeRuleId);
        results.checks.badgeEligibility = eligibility;
        
        if (!eligibility.eligible) {
          results.allowed = false;
          results.blockReasons.push(eligibility.reason);
        }
      }
      
      // 3. Fraud pattern detection
      if (eventData) {
        const fraudAnalysis = await this.detectFraudPatterns(userId, eventData);
        results.riskAssessment = fraudAnalysis;
        
        if (fraudAnalysis.action === 'block') {
          results.allowed = false;
          results.blockReasons.push('High fraud risk detected');
        } else if (fraudAnalysis.action === 'review') {
          results.warnings.push('Transaction flagged for manual review');
        } else if (fraudAnalysis.action === 'monitor') {
          results.warnings.push('User activity being monitored');
        }
      }
      
      // 4. Log da verificação
      await this.logSecurityCheck({
        userId,
        ipAddress,
        action,
        results,
        timestamp: new Date()
      });
      
      return results;
      
    } catch (error) {
      console.error('Error performing comprehensive security check:', error);
      
      // Em caso de erro, registrar e permitir (fail-open)
      await this.logSecurityCheck({
        userId,
        ipAddress,
        action,
        error: error.message,
        timestamp: new Date()
      });
      
      return {
        allowed: true,
        error: error.message,
        checks: {},
        riskAssessment: null,
        blockReasons: [],
        warnings: ['Security check failed - allowing by default']
      };
    }
  }

  /**
   * Registrar verificação de segurança
   * @param {Object} logData - Dados do log
   */
  async logSecurityCheck(logData) {
    try {
      await eventService.publishEvent({
        eventType: 'security_check_performed',
        userId: logData.userId,
        eventData: {
          action: logData.action,
          ipAddress: logData.ipAddress,
          allowed: logData.results?.allowed,
          riskScore: logData.results?.riskAssessment?.riskScore,
          blockReasons: logData.results?.blockReasons,
          warnings: logData.results?.warnings,
          error: logData.error
        },
        source: 'anti_fraud_service'
      });
    } catch (error) {
      console.error('Error logging security check:', error);
    }
  }

  /**
   * Adicionar endereço à blacklist
   * @param {string} address - Endereço para blacklist
   * @param {string} reason - Motivo
   */
  async addToBlacklist(address, reason) {
    this.blacklistedAddresses.add(address.toLowerCase());
    
    await eventService.publishEvent({
      eventType: 'address_blacklisted',
      eventData: {
        address: address.toLowerCase(),
        reason,
        timestamp: new Date().toISOString()
      },
      source: 'anti_fraud_service'
    });
    
    console.log(`Address ${address} added to blacklist: ${reason}`);
  }

  /**
   * Remover endereço da blacklist
   * @param {string} address - Endereço para remover
   */
  async removeFromBlacklist(address) {
    this.blacklistedAddresses.delete(address.toLowerCase());
    
    await eventService.publishEvent({
      eventType: 'address_removed_from_blacklist',
      eventData: {
        address: address.toLowerCase(),
        timestamp: new Date().toISOString()
      },
      source: 'anti_fraud_service'
    });
    
    console.log(`Address ${address} removed from blacklist`);
  }

  /**
   * Obter segundos para janela de tempo
   * @param {string} timeWindow - Janela de tempo
   * @returns {number} Segundos
   */
  getWindowSeconds(timeWindow) {
    switch (timeWindow) {
      case 'minute': return 60;
      case 'hour': return 3600;
      case 'day': return 86400;
      default: return 3600;
    }
  }

  /**
   * Obter limite do usuário
   * @param {string} action - Ação
   * @param {string} timeWindow - Janela de tempo
   * @returns {number} Limite
   */
  getUserLimit(action, timeWindow) {
    const key = `user${action.charAt(0).toUpperCase() + action.slice(1)}Per${timeWindow.charAt(0).toUpperCase() + timeWindow.slice(1)}`;
    return this.rateLimits[key] || 10;
  }

  /**
   * Obter limite global
   * @param {string} action - Ação
   * @param {string} timeWindow - Janela de tempo
   * @returns {number} Limite
   */
  getGlobalLimit(action, timeWindow) {
    const key = `global${action.charAt(0).toUpperCase() + action.slice(1)}Per${timeWindow.charAt(0).toUpperCase() + timeWindow.slice(1)}`;
    return this.rateLimits[key] || 100;
  }

  /**
   * Obter limite de IP
   * @param {string} timeWindow - Janela de tempo
   * @returns {number} Limite
   */
  getIPLimit(timeWindow) {
    const key = `ipRequestsPer${timeWindow.charAt(0).toUpperCase() + timeWindow.slice(1)}`;
    return this.rateLimits[key] || 60;
  }

  /**
   * Obter estatísticas de rate limiting
   * @returns {Promise<Object>} Estatísticas
   */
  async getRateLimitStatistics() {
    try {
      const keys = await this.redis.keys('rate_limit:*');
      const stats = {
        totalKeys: keys.length,
        userLimits: 0,
        globalLimits: 0,
        ipLimits: 0
      };
      
      for (const key of keys) {
        if (key.includes(':user:')) stats.userLimits++;
        else if (key.includes(':global:')) stats.globalLimits++;
        else if (key.includes(':ip:')) stats.ipLimits++;
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting rate limit statistics:', error);
      return { error: error.message };
    }
  }
}

module.exports = new AntiFraudService();