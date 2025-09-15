# Community Dashboard Mocks

Este diretório contém objetos mock e utilitários para testar os endpoints do Community Dashboard. Os mocks foram criados para facilitar o desenvolvimento, testes e demonstrações da funcionalidade.

## Arquivos Disponíveis

### 📁 `communityDashboardMocks.js`
Contém os objetos mock principais:
- **3 objetos mock** para métricas do dashboard
- **3 objetos mock** para status do cache
- **3 objetos mock** para respostas de sucesso
- **3 objetos mock** para respostas de erro
- **3 objetos mock** para dados de comunidade
- **3 objetos mock** para dados de usuário
- **3 objetos mock** para coleções NFT
- Funções utilitárias para gerar dados aleatórios

### 📁 `mockUsageExamples.js`
Exemplos práticos de como usar os mocks:
- Simulação de fluxos de teste
- Exemplos de integração com Jest
- Casos de uso para diferentes cenários
- Helpers para testes automatizados

### 📁 `mockConfig.js`
Configuração avançada e gerenciamento de mocks:
- Configurações para diferentes ambientes (unit, integration, load, development)
- Classe `CommunityDashboardMockManager` para gerenciar mocks
- Middleware `MockAPIMiddleware` para Express
- Utilitários para testes

### 📁 `userLoginMocks.js`
Mocks para testar funcionalidade de login de usuário:
- **3 usuários mock** (válido, admin, inativo)
- **8 cenários de requisição** de login
- **Funções de teste** automatizadas
- **Validação de senha** com bcrypt
- **Respostas esperadas** para cada cenário

## Como Usar

### 1. Uso Básico dos Mocks

```javascript
const {
  dashboardMetricsMocks,
  cacheStatusMocks,
  errorResponseMocks
} = require('./communityDashboardMocks');

// Usar o primeiro mock de métricas
const metrics = dashboardMetricsMocks[0];
console.log('Total de membros:', metrics.total_members);

// Usar mock de status do cache
const cacheStatus = cacheStatusMocks[1];
console.log('Cache ativo:', cacheStatus.cache_enabled);
```

### 2. Uso com Mock Manager

```javascript
const { CommunityDashboardMockManager } = require('./mockConfig');

// Criar manager para ambiente de desenvolvimento
const mockManager = new CommunityDashboardMockManager('development');

// Obter métricas para uma comunidade específica
const metrics = mockManager.getDashboardMetrics('507f1f77bcf86cd799439011');

// Obter resposta completa da API
const response = mockManager.getDashboardMetricsResponse(
  '507f1f77bcf86cd799439011',
  true // fromCache
);
```

### 3. Uso em Testes Jest

```javascript
const { testUtils } = require('./mockConfig');
const { mockDashboardFlow } = require('./mockUsageExamples');

describe('Community Dashboard', () => {
  let mockManager;
  
  beforeEach(() => {
    mockManager = testUtils.createMockManager('unit');
  });
  
  test('deve retornar métricas do dashboard', async () => {
    const communityId = '507f1f77bcf86cd799439011';
    const metrics = mockManager.getDashboardMetrics(communityId);
    
    expect(metrics).toHaveProperty('total_members');
    expect(metrics).toHaveProperty('active_members');
    expect(metrics).toHaveProperty('total_nfts');
  });
  
  test('deve simular fluxo completo', async () => {
    const result = await mockDashboardFlow('507f1f77bcf86cd799439011');
    expect(result.success).toBe(true);
  });
});
```

### 4. Uso como Middleware Express

```javascript
const express = require('express');
const { MockAPIMiddleware } = require('./mockConfig');

const app = express();
const mockAPI = new MockAPIMiddleware('development');

// Configurar rotas mock
app.get('/api/communities/:communityId/dashboard-metrics', 
  mockAPI.dashboardMetrics()
);

app.get('/api/communities/:communityId/dashboard-metrics/cache', 
  mockAPI.cacheStatus()
);

app.delete('/api/communities/:communityId/dashboard-metrics/cache', 
  mockAPI.cacheInvalidation()
);

app.listen(3001, () => {
  console.log('Mock API rodando na porta 3001');
});
```

## Configurações de Ambiente

### Unit Testing
```javascript
{
  useRandomData: false,
  cacheEnabled: true,
  defaultTTL: 300,
  simulateErrors: false,
  responseDelay: 0
}
```

### Integration Testing
```javascript
{
  useRandomData: true,
  cacheEnabled: true,
  defaultTTL: 300,
  simulateErrors: true,
  responseDelay: 100
}
```

### Load Testing
```javascript
{
  useRandomData: true,
  cacheEnabled: true,
  defaultTTL: 60,
  simulateErrors: false,
  responseDelay: 50
}
```

### Development
```javascript
{
  useRandomData: false,
  cacheEnabled: true,
  defaultTTL: 300,
  simulateErrors: true,
  responseDelay: 200
}
```

## Estrutura dos Mocks

### Dashboard Metrics Mock
```javascript
{
  community_id: "507f1f77bcf86cd799439011",
  community_name: "Crypto Enthusiasts",
  total_members: 1250,
  active_members: 890,
  total_nfts: 3420,
  total_collections: 15,
  recent_activity: {
    new_members_last_7_days: 45,
    new_nfts_last_7_days: 123,
    active_traders_last_7_days: 234
  },
  top_collections: [...],
  member_growth: [...],
  nft_activity: [...]
}
```

### Cache Status Mock
```javascript
{
  community_id: "507f1f77bcf86cd799439011",
  cache_enabled: true,
  cache_hit: true,
  cache_key: "dashboard_metrics:507f1f77bcf86cd799439011",
  ttl_seconds: 245,
  last_updated: "2024-01-15T10:30:00Z",
  cache_size_bytes: 2048
}
```

### Error Response Mock
```javascript
{
  success: false,
  message: "Validation failed",
  errors: [
    {
      field: "communityId",
      message: "Invalid community ID format"
    }
  ]
}
```

## Utilitários Disponíveis

### Geração de Dados Aleatórios
```javascript
const { generateRandomMetrics, generateCacheStatus } = require('./communityDashboardMocks');

// Gerar métricas aleatórias
const randomMetrics = generateRandomMetrics(
  '507f1f77bcf86cd799439011',
  'Minha Comunidade'
);

// Gerar status de cache aleatório
const randomCacheStatus = generateCacheStatus(
  '507f1f77bcf86cd799439011',
  true // cacheEnabled
);
```

### Validação de Respostas
```javascript
const { testUtils } = require('./mockConfig');

// Validar estrutura de resposta
const isValid = testUtils.validateResponse(response, 'metrics');
console.log('Resposta válida:', isValid);
```

### Geração de Dados de Teste
```javascript
const { testUtils } = require('./mockConfig');

// Gerar conjunto completo de dados de teste
const testData = testUtils.generateTestData(5);
console.log('Dados gerados:', {
  comunidades: testData.communities.length,
  usuários: testData.users.length,
  coleções: testData.nftCollections.length,
  métricas: testData.dashboardMetrics.length
});
```

## Exemplos de Cenários de Teste

### Teste de Cache Hit/Miss
```javascript
const mockManager = new CommunityDashboardMockManager('integration');

// Simular cache hit
const responseFromCache = mockManager.getDashboardMetricsResponse(
  '507f1f77bcf86cd799439011',
  true
);

// Simular cache miss
const responseFromDB = mockManager.getDashboardMetricsResponse(
  '507f1f77bcf86cd799439011',
  false
);
```

### Teste de Diferentes Tipos de Erro
```javascript
const mockManager = new CommunityDashboardMockManager('unit');

// Erro de validação
const validationError = mockManager.getErrorResponse('validation');

// Erro de autenticação
const authError = mockManager.getErrorResponse('auth');

// Erro de acesso
const accessError = mockManager.getErrorResponse('access');

// Comunidade não encontrada
const notFoundError = mockManager.getErrorResponse('notfound');
```

### Teste de Performance com Delay
```javascript
const mockManager = new CommunityDashboardMockManager('load');

// Simular delay de resposta
const startTime = Date.now();
await mockManager.simulateDelay();
const endTime = Date.now();

console.log(`Delay simulado: ${endTime - startTime}ms`);
```

## Integração com Ferramentas de Teste

### Jest
```javascript
// jest.config.js
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/mocks/jest.setup.js']
};

// mocks/jest.setup.js
const { testUtils } = require('./mockConfig');

global.mockManager = testUtils.createMockManager('unit');
```

### Supertest
```javascript
const request = require('supertest');
const app = require('../server');
const { MockAPIMiddleware } = require('./mockConfig');

// Configurar mocks para testes de integração
const mockAPI = new MockAPIMiddleware('integration');
app.use('/mock', mockAPI.dashboardMetrics());

describe('API Integration Tests', () => {
  test('GET /mock/communities/:id/dashboard-metrics', async () => {
    const response = await request(app)
      .get('/mock/communities/507f1f77bcf86cd799439011/dashboard-metrics')
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('total_members');
  });
});
```

## Dicas de Uso

1. **Escolha o ambiente certo**: Use 'unit' para testes rápidos, 'integration' para testes mais realistas
2. **Use dados aleatórios**: Para testes de carga, ative `useRandomData: true`
3. **Simule erros**: Em desenvolvimento, ative `simulateErrors: true` para testar tratamento de erros
4. **Configure delays**: Use `responseDelay` para simular latência de rede
5. **Valide respostas**: Use `testUtils.validateResponse()` para garantir estrutura correta

## Contribuindo

Para adicionar novos mocks ou funcionalidades:

1. Adicione novos objetos mock em `communityDashboardMocks.js`
2. Crie exemplos de uso em `mockUsageExamples.js`
3. Atualize configurações em `mockConfig.js` se necessário
4. Documente as mudanças neste README

## Mocks de Login de Usuário

### Usuários Mock Disponíveis

```javascript
const { mockUsers, loginRequests, testLoginScenarios } = require('./userLoginMocks');

// Usuário válido
const validUser = mockUsers.validUser;
console.log('Email:', validUser.email); // usuario.teste@hackmeridian.com
console.log('Senha:', 'MinhaSenh@123');

// Usuário admin
const adminUser = mockUsers.adminUser;
console.log('Email:', adminUser.email); // admin@hackmeridian.com

// Usuário inativo
const inactiveUser = mockUsers.inactiveUser;
console.log('Ativo:', inactiveUser.is_active); // false
```

### Testes de Login

```bash
# Executar todos os testes
node test-login.js

# Teste manual com curl - Login válido
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "usuario.teste@hackmeridian.com", "password": "MinhaSenh@123"}'

# Teste com senha incorreta
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "usuario.teste@hackmeridian.com", "password": "SenhaErrada123"}'
```

### Cenários de Teste Disponíveis

1. **Login válido** - Usuário ativo com credenciais corretas
2. **Usuário inexistente** - Email não cadastrado
3. **Senha incorreta** - Email válido, senha errada
4. **Usuário inativo** - Conta desativada
5. **Email inválido** - Formato de email incorreto
6. **Senha muito curta** - Menos de 6 caracteres
7. **Campos vazios** - Email e senha em branco
8. **Login de admin** - Usuário com privilégios administrativos

## Troubleshooting

### Problema: Mock não está sendo usado
**Solução**: Verifique se está importando do arquivo correto e se o ambiente está configurado adequadamente.

### Problema: Erro de timeout no login
**Solução**: Este erro é esperado quando o MongoDB está desabilitado. Use os mocks para testes offline.

### Problema: Dados aleatórios não estão sendo gerados
**Solução**: Certifique-se de que `useRandomData: true` está configurado no ambiente.

### Problema: Erros não estão sendo simulados
**Solução**: Verifique se `simulateErrors: true` está ativo na configuração do ambiente.

### Problema: Delay muito alto nos testes
**Solução**: Use ambiente 'unit' para testes rápidos ou configure `responseDelay: 0`.