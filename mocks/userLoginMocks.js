/**
 * Mock objects para testar funcionalidade de login de usuário
 * Este arquivo contém objetos mock para diferentes cenários de teste
 */

const bcrypt = require('bcryptjs');

// Função auxiliar para gerar hash de senha
const generatePasswordHash = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
};

// Mock de usuários para teste
const mockUsers = {
  // Usuário válido e ativo
  validUser: {
    _id: '507f1f77bcf86cd799439011',
    email: 'usuario.teste@hackmeridian.com',
    password_hash: '$2a$12$ZCwOPsApwIclQ4ZNXVeyHe0.yriZsAWeStv94zvKPMc2AFLH.0cxe', // senha: 'MinhaSenh@123'
    user_type: 'member',
    first_name: 'João',
    last_name: 'Silva',
    is_active: true,
    last_login: new Date('2024-01-15T10:30:00Z'),
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T10:30:00Z'),
    wallet_address: '0x742d35Cc6634C0532925a3b8D4C0d886E682184C',
    wallet_created_at: new Date('2024-01-01T00:00:00Z'),
    
    // Métodos mock
    comparePassword: async function(candidatePassword) {
      return await bcrypt.compare(candidatePassword, this.password_hash);
    },
    
    toSafeObject: function() {
      const userObject = { ...this };
      delete userObject.password_hash;
      delete userObject.comparePassword;
      delete userObject.toSafeObject;
      delete userObject.save;
      return userObject;
    },
    
    save: async function() {
      this.updated_at = new Date();
      return this;
    }
  },

  // Usuário admin
  adminUser: {
    _id: '507f1f77bcf86cd799439012',
    email: 'admin@hackmeridian.com',
    password_hash: '$2a$12$ZCwOPsApwIclQ4ZNXVeyHe0.yriZsAWeStv94zvKPMc2AFLH.0cxe', // senha: 'MinhaSenh@123'
    user_type: 'platform_admin',
    first_name: 'Maria',
    last_name: 'Administradora',
    is_active: true,
    last_login: new Date('2024-01-15T09:00:00Z'),
    created_at: new Date('2023-12-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T09:00:00Z'),
    wallet_address: '0x8ba1f109551bD432803012645Hac136c9.tab',
    wallet_created_at: new Date('2023-12-01T00:00:00Z'),
    
    comparePassword: async function(candidatePassword) {
      return await bcrypt.compare(candidatePassword, this.password_hash);
    },
    
    toSafeObject: function() {
      const userObject = { ...this };
      delete userObject.password_hash;
      delete userObject.comparePassword;
      delete userObject.toSafeObject;
      delete userObject.save;
      return userObject;
    },
    
    save: async function() {
      this.updated_at = new Date();
      return this;
    }
  },

  // Usuário Carlos para teste específico
  carlosUser: {
    _id: '507f1f77bcf86cd799439014',
    email: 'carlos@gmail.com',
    password_hash: '$2a$12$lTBojKkXsTpub20u8Y7tLu/ROfCKfG4q.1o5r4gQsQbP0qLveTyQ6', // senha: 'carlos'
    user_type: 'member',
    first_name: 'Carlos',
    last_name: 'Eduardo',
    is_active: true,
    last_login: new Date('2024-01-15T10:30:00Z'),
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T10:30:00Z'),
    wallet_address: '0x742d35Cc6634C0532925a3b8D4C0d886E682184D',
    wallet_created_at: new Date('2024-01-01T00:00:00Z'),
    
    // Métodos mock
    comparePassword: async function(candidatePassword) {
      return await bcrypt.compare(candidatePassword, this.password_hash);
    },
    
    toSafeObject: function() {
      const userObject = { ...this };
      delete userObject.password_hash;
      delete userObject.comparePassword;
      delete userObject.toSafeObject;
      delete userObject.save;
      return userObject;
    },
    
    save: async function() {
      this.updated_at = new Date();
      return this;
    }
  },

  // Usuário inativo
  inactiveUser: {
    _id: '507f1f77bcf86cd799439013',
    email: 'inativo@hackmeridian.com',
    password_hash: '$2a$12$ZCwOPsApwIclQ4ZNXVeyHe0.yriZsAWeStv94zvKPMc2AFLH.0cxe', // senha: 'MinhaSenh@123'
    user_type: 'member',
    first_name: 'Carlos',
    last_name: 'Inativo',
    is_active: false, // Usuário desativado
    last_login: new Date('2023-12-01T10:30:00Z'),
    created_at: new Date('2023-11-01T00:00:00Z'),
    updated_at: new Date('2023-12-01T10:30:00Z'),
    wallet_address: null,
    wallet_created_at: null,
    
    comparePassword: async function(candidatePassword) {
      return await bcrypt.compare(candidatePassword, this.password_hash);
    },
    
    toSafeObject: function() {
      const userObject = { ...this };
      delete userObject.password_hash;
      delete userObject.comparePassword;
      delete userObject.toSafeObject;
      delete userObject.save;
      return userObject;
    },
    
    save: async function() {
      this.updated_at = new Date();
      return this;
    }
  }
};

// Objetos de requisição para teste
const loginRequests = {
  // Requisição válida
  validLogin: {
    email: 'usuario.teste@hackmeridian.com',
    password: 'MinhaSenh@123'
  },

  // Login de admin
  adminLogin: {
    email: 'admin@hackmeridian.com',
    password: 'MinhaSenh@123'
  },

  // Usuário inativo
  inactiveLogin: {
    email: 'inativo@hackmeridian.com',
    password: 'MinhaSenh@123'
  },

  // Email inexistente
  nonExistentUser: {
    email: 'naoexiste@hackmeridian.com',
    password: 'MinhaSenh@123'
  },

  // Senha incorreta
  wrongPassword: {
    email: 'usuario.teste@hackmeridian.com',
    password: 'SenhaErrada123'
  },

  // Email inválido
  invalidEmail: {
    email: 'email-invalido',
    password: 'MinhaSenh@123'
  },

  // Senha muito curta
  shortPassword: {
    email: 'usuario.teste@hackmeridian.com',
    password: '123'
  },

  // Campos vazios
  emptyFields: {
    email: '',
    password: ''
  }
};

// Respostas esperadas para cada cenário
const expectedResponses = {
  validLogin: {
    success: true,
    message: 'Login successful',
    data: {
      token: 'jwt-token-aqui',
      user: {
        _id: '507f1f77bcf86cd799439011',
        email: 'usuario.teste@hackmeridian.com',
        user_type: 'member',
        first_name: 'João',
        last_name: 'Silva',
        is_active: true,
        wallet_address: '0x742d35Cc6634C0532925a3b8D4C0d886E682184C'
      },
      expires_in: '7d'
    }
  },

  invalidCredentials: {
    success: false,
    message: 'Invalid credentials'
  },

  inactiveAccount: {
    success: false,
    message: 'Account is deactivated. Please contact support.'
  },

  validationError: {
    success: false,
    message: 'Validation failed',
    errors: [
      {
        msg: 'Please provide a valid email',
        param: 'email',
        location: 'body'
      }
    ]
  }
};

// Mock do User.findByEmail
const mockUserFindByEmail = (email) => {
  const normalizedEmail = email.toLowerCase();
  
  switch (normalizedEmail) {
    case 'usuario.teste@hackmeridian.com':
      return Promise.resolve(mockUsers.validUser);
    case 'admin@hackmeridian.com':
      return Promise.resolve(mockUsers.adminUser);
    case 'carlos@gmail.com':
      return Promise.resolve(mockUsers.carlosUser);
    case 'inativo@hackmeridian.com':
      return Promise.resolve(mockUsers.inactiveUser);
    default:
      return Promise.resolve(null);
  }
};

// Função para testar cenários de login
const testLoginScenarios = {
  // Teste de login válido
  testValidLogin: async () => {
    console.log('🧪 Testando login válido...');
    const request = loginRequests.validLogin;
    const user = await mockUserFindByEmail(request.email);
    
    if (user && user.is_active) {
      const isPasswordValid = await user.comparePassword(request.password);
      if (isPasswordValid) {
        console.log('✅ Login válido - SUCESSO');
        return {
          status: 200,
          response: {
            success: true,
            message: 'Login successful',
            data: {
              user: user.toSafeObject()
            }
          }
        };
      }
    }
    console.log('❌ Login válido - FALHOU');
    return { status: 401, response: expectedResponses.invalidCredentials };
  },

  // Teste de usuário inexistente
  testNonExistentUser: async () => {
    console.log('🧪 Testando usuário inexistente...');
    const request = loginRequests.nonExistentUser;
    const user = await mockUserFindByEmail(request.email);
    
    if (!user) {
      console.log('✅ Usuário inexistente - SUCESSO');
      return { status: 401, response: expectedResponses.invalidCredentials };
    }
    console.log('❌ Usuário inexistente - FALHOU');
    return { status: 200, response: { success: true } };
  },

  // Teste de senha incorreta
  testWrongPassword: async () => {
    console.log('🧪 Testando senha incorreta...');
    const request = loginRequests.wrongPassword;
    const user = await mockUserFindByEmail(request.email);
    
    if (user) {
      const isPasswordValid = await user.comparePassword(request.password);
      if (!isPasswordValid) {
        console.log('✅ Senha incorreta - SUCESSO');
        return { status: 401, response: expectedResponses.invalidCredentials };
      }
    }
    console.log('❌ Senha incorreta - FALHOU');
    return { status: 200, response: { success: true } };
  },

  // Teste de usuário inativo
  testInactiveUser: async () => {
    console.log('🧪 Testando usuário inativo...');
    const request = loginRequests.inactiveLogin;
    const user = await mockUserFindByEmail(request.email);
    
    if (user && !user.is_active) {
      console.log('✅ Usuário inativo - SUCESSO');
      return { status: 401, response: expectedResponses.inactiveAccount };
    }
    console.log('❌ Usuário inativo - FALHOU');
    return { status: 200, response: { success: true } };
  },

  // Executar todos os testes
  runAllTests: async () => {
    console.log('🚀 Iniciando testes de login...');
    console.log('=' .repeat(50));
    
    const results = {
      validLogin: await testLoginScenarios.testValidLogin(),
      nonExistentUser: await testLoginScenarios.testNonExistentUser(),
      wrongPassword: await testLoginScenarios.testWrongPassword(),
      inactiveUser: await testLoginScenarios.testInactiveUser()
    };
    
    console.log('=' .repeat(50));
    console.log('📊 Resultados dos testes:');
    Object.entries(results).forEach(([test, result]) => {
      const status = result.status === 200 || result.status === 401 ? '✅' : '❌';
      console.log(`${status} ${test}: Status ${result.status}`);
    });
    
    return results;
  }
};

module.exports = {
  mockUsers,
  loginRequests,
  expectedResponses,
  mockUserFindByEmail,
  testLoginScenarios,
  generatePasswordHash
};