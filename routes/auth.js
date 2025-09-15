const express = require('express');
const jwt = require('jsonwebtoken');
const { body, param, validationResult } = require('express-validator');
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
 * /api/auth/nonce/{address}:
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
// @route   GET /api/auth/nonce/:address
// @desc    Gerar nonce único para autenticação Web3
// @access  Public
router.get('/nonce/:address', [
  param('address')
    .isLength({ min: 10, max: 100 })
    .withMessage('Endereço da carteira deve ter entre 10 e 100 caracteres')
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage('Endereço da carteira deve conter apenas caracteres alfanuméricos')
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

    // Gerar novo nonce para o endereço
    const nonceDoc = await Nonce.createForAddress(address);

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
 * /api/auth/wallet-verify:
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
 *               - nonce
 *               - signature
 *             properties:
 *               address:
 *                 type: string
 *                 description: Endereço da carteira
 *               nonce:
 *                 type: string
 *                 description: Nonce gerado anteriormente
 *               signature:
 *                 type: string
 *                 description: Assinatura da mensagem com nonce
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email do usuário (opcional para registro)
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
// @route   POST /api/auth/wallet-verify
// @desc    Verificar assinatura e autenticar via carteira Web3
// @access  Public
router.post('/wallet-verify', [
  body('address')
    .isLength({ min: 10, max: 100 })
    .withMessage('Endereço da carteira deve ter entre 10 e 100 caracteres')
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage('Endereço da carteira deve conter apenas caracteres alfanuméricos'),
  body('nonce')
    .isLength({ min: 10 })
    .withMessage('Nonce deve ter pelo menos 10 caracteres'),
  body('signature')
    .isLength({ min: 10 })
    .withMessage('Assinatura deve ter pelo menos 10 caracteres'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email deve ser válido')
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

    const { address, nonce, signature, email } = req.body;

    // Validar e marcar nonce como usado
    const nonceValidation = await Nonce.validateAndUse(address, nonce);
    if (!nonceValidation.valid) {
      return res.status(401).json({
        success: false,
        message: nonceValidation.error
      });
    }

    // TODO: Implementar verificação de assinatura real
    // Por enquanto, aceita qualquer assinatura para demonstração
    const isValidSignature = signature && signature.length > 10;
    
    if (!isValidSignature) {
      return res.status(401).json({
        success: false,
        message: 'Assinatura inválida'
      });
    }

    // Buscar usuário existente por endereço da carteira
    let user = await User.findOne({ wallet_address: address.toLowerCase() });

    // Se usuário não existe, criar novo (se email fornecido)
    if (!user) {
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email é obrigatório para novos usuários'
        });
      }

      // Verificar se email já está em uso
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email já está em uso'
        });
      }

      // Criar novo usuário
      user = new User({
        email: email,
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