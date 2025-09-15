/**
 * Script de teste para verificar se o login funciona usando objetos mock
 * Execute com: node test-login.js
 */

const { testLoginScenarios, loginRequests, mockUsers } = require('./mocks/userLoginMocks');

// Função principal de teste
async function testUserLogin() {
  console.log('🔐 TESTE DE LOGIN - HackMeridian Backend');
  console.log('=' .repeat(60));
  
  try {
    // Executar todos os cenários de teste
    await testLoginScenarios.runAllTests();
    
    console.log('\n📋 DADOS MOCK DISPONÍVEIS:');
    console.log('=' .repeat(60));
    
    // Mostrar usuários mock disponíveis
    console.log('👥 Usuários Mock:');
    Object.entries(mockUsers).forEach(([key, user]) => {
      console.log(`  • ${key}:`);
      console.log(`    - Email: ${user.email}`);
      console.log(`    - Tipo: ${user.user_type}`);
      console.log(`    - Ativo: ${user.is_active}`);
      console.log(`    - Nome: ${user.first_name} ${user.last_name}`);
      console.log('');
    });
    
    // Mostrar requisições de teste
    console.log('📝 Requisições de Teste:');
    Object.entries(loginRequests).forEach(([key, request]) => {
      console.log(`  • ${key}:`);
      console.log(`    - Email: ${request.email}`);
      console.log(`    - Password: ${request.password}`);
      console.log('');
    });
    
    console.log('\n🧪 COMO USAR OS MOCKS:');
    console.log('=' .repeat(60));
    console.log('1. Importe o arquivo: const { mockUsers, loginRequests } = require("./mocks/userLoginMocks");');
    console.log('2. Use os objetos mock em seus testes');
    console.log('3. Teste diferentes cenários (usuário válido, inativo, senha errada, etc.)');
    console.log('\n📡 TESTE COM CURL:');
    console.log('=' .repeat(60));
    console.log('# Login válido:');
    console.log('curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{');
    console.log('    "email": "usuario.teste@hackmeridian.com",');
    console.log('    "password": "MinhaSenh@123"');
    console.log('  }\'');
    
    console.log('\n# Login com senha errada:');
    console.log('curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{');
    console.log('    "email": "usuario.teste@hackmeridian.com",');
    console.log('    "password": "SenhaErrada123"');
    console.log('  }\'');
    
    console.log('\n# Usuário inexistente:');
    console.log('curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{');
    console.log('    "email": "naoexiste@hackmeridian.com",');
    console.log('    "password": "MinhaSenh@123"');
    console.log('  }\'');
    
    console.log('\n✅ Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    process.exit(1);
  }
}

// Executar teste se o script for chamado diretamente
if (require.main === module) {
  testUserLogin();
}

module.exports = { testUserLogin };