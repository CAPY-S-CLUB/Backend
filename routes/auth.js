const express = require('express');
const jwt = require('jsonwebtoken');
const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/User');
const Nonce = require('../models/Nonce');
const walletService = require('../services/walletService');
const crypto = require('crypto');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the user
 *         email:
 *           type: string
 *           description: The user's email
 *         first_name:
 *           type: string
 *           description: The user's first name
 *         last_name:
 *           type: string
 *           description: The user's last name
 *         user_type:
 *           type: string
 *           description: The user's type
 *         wallet_address:
 *           type: string
 *           description: The user's wallet address
 *         wallet_created_at:
 *           type: string
 *           format: date-time
 *           description: When the wallet was created
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             token:
 *               type: string
 *             user:
 *               $ref: '#/components/schemas/User'
 *             expires_in:
 *               type: string
 */

// JWT utility functions
const generateToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    user_type: user.user_type,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};



/**
 * @swagger
 * /auth/nonce/{address}:
 *   get:
 *     summary: Gerar nonce para autenticação Web3
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Endereço da carteira
 *     responses:
 *       200:
 *         description: Nonce gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 nonce:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Endereço inválido
 *       500:
 *         description: Erro interno do servidor
 */
// @route   GET /auth/nonce/:address
// @desc    Gerar nonce único para autenticação Web3
// @access  Public
router.get('/nonce/:address', [
  param('address')
    .isLength({ min: 10, max: 100 })
    .withMessage('Endereço da carteira deve ter entre 10 e 100 caracteres')
    .matches(/^(G[A-Z2-7]{55}|[a-zA-Z0-9]+)$/)
    .withMessage('Endereço deve ser um endereço Stellar válido (G...) ou alfanumérico')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validação falhou',
        errors: errors.array()
      });
    }

    const { address } = req.params;

    // Gerar novo nonce para o endereço (com fallback para demo)
    let nonceDoc;
    try {
      nonceDoc = await Nonce.createForAddress(address);
    } catch (dbError) {
      // Fallback para demo sem banco de dados
      const timestamp = Date.now();
      const randomBytes = crypto.randomBytes(16).toString('hex');
      const nonce = `${address}-${timestamp}-${randomBytes}`;
      nonceDoc = { nonce };
    }

    res.status(200).json({
      success: true,
      nonce: nonceDoc.nonce,
      message: `Assine esta mensagem para autenticar: ${nonceDoc.nonce}`
    });

  } catch (error) {
    console.error('Erro ao gerar nonce:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor ao gerar nonce'
    });
  }
});

/**
 * @swagger
 * /auth/wallet-verify:
 *   post:
 *     summary: Verificar assinatura e autenticar carteira
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *               - signature
 *             properties:
 *               address:
 *                 type: string
 *                 description: Endereço da carteira
 *               signature:
 *                 type: string
 *                 description: Assinatura da mensagem
 *     responses:
 *       200:
 *         description: Autenticação bem-sucedida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Assinatura inválida
 *       500:
 *         description: Erro interno do servidor
 */
// @route   POST /auth/wallet-verify
// @desc    Verificar assinatura e autenticar via carteira Web3
// @access  Public
router.post('/wallet-verify', [
  body('address')
    .isLength({ min: 10, max: 100 })
    .withMessage('Endereço da carteira deve ter entre 10 e 100 caracteres')
    .matches(/^(G[A-Z2-7]{55}|[a-zA-Z0-9]+)$/)
    .withMessage('Endereço deve ser um endereço Stellar válido (G...) ou alfanumérico'),
  body('signature')
    .isLength({ min: 10 })
    .withMessage('Assinatura deve ter pelo menos 10 caracteres')
], async (req, res) => {
  try {
    // Verificar erros de validação
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validação falhou',
        errors: errors.array()
      });
    }

    const { address, signature } = req.body;

    // TODO: Implementar verificação de assinatura real
    // Por enquanto, aceita qualquer assinatura para demonstração
    const isValidSignature = signature && signature.length > 10;
    
    if (!isValidSignature) {
      return res.status(401).json({
        success: false,
        message: 'Assinatura inválida'
      });
    }

    // Verificar se o banco está conectado
    let user;
    if (mongoose.connection.readyState === 1) {
      // Banco conectado - usar operações normais
      try {
        user = await User.findOne({ wallet_address: address.toLowerCase() });
        
        // Se usuário não existe, criar novo automaticamente
        if (!user) {
          user = new User({
            email: `${address.toLowerCase()}@wallet.local`,
            wallet_address: address.toLowerCase(),
            user_type: 'member',
            is_active: true,
            auth_method: 'wallet'
          });
          await user.save();
        }
        
        // Verificar se usuário está ativo
        if (!user.is_active) {
          return res.status(401).json({
            success: false,
            message: 'Conta desativada. Entre em contato com o suporte.'
          });
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Erro de banco de dados'
        });
      }
    } else {
      // Banco não conectado - usar usuário mock
      console.log('Database not connected, using mock user');
      user = {
        _id: 'mock_' + address.toLowerCase(),
        email: `${address.toLowerCase()}@wallet.local`,
        wallet_address: address.toLowerCase(),
        user_type: 'member',
        is_active: true,
        auth_method: 'wallet',
        toSafeObject: () => ({
          id: 'mock_' + address.toLowerCase(),
          email: `${address.toLowerCase()}@wallet.local`,
          wallet_address: address.toLowerCase(),
          user_type: 'member',
          auth_method: 'wallet'
        })
      };
    }

    // Gerar token JWT
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Autenticação Web3 bem-sucedida',
      data: {
        token,
        user: user.toSafeObject()
      }
    });

  } catch (error) {
    console.error('Erro na verificação da carteira:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor durante verificação'
    });
  }
});

module.exports = router;