/**
 * Exemplos de uso dos mocks do Community Dashboard
 * Este arquivo demonstra como utilizar os objetos mock em diferentes cenários
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

/**
 * Exemplo 1: Simulação de resposta da API de métricas do dashboard
 * GET /api/communities/{communityId}/dashboard-metrics
 */
function simulateDashboardMetricsAPI() {
  console.log('\n=== EXEMPLO 1: API de Métricas do Dashboard ===');
  
  // Cenário 1: Comunidade ativa com dados em cache
  console.log('\n📊 Cenário 1: Comunidade Tech Innovators (dados em cache)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439011/dashboard-metrics');
  console.log('Response:', JSON.stringify(successfulResponseMocks[0], null, 2));
  
  // Cenário 2: Comunidade gaming com dados frescos
  console.log('\n🎮 Cenário 2: Comunidade GameFi (dados frescos)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439012/dashboard-metrics');
  console.log('Response:', JSON.stringify(successfulResponseMocks[1], null, 2));
  
  // Cenário 3: Comunidade de arte com cache desabilitado
  console.log('\n🎨 Cenário 3: Comunidade Digital Art (cache desabilitado)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439013/dashboard-metrics?use_cache=false');
  console.log('Response:', JSON.stringify(successfulResponseMocks[2], null, 2));
}

/**
 * Exemplo 2: Simulação de status do cache
 * GET /api/communities/{communityId}/dashboard-metrics/cache
 */
function simulateCacheStatusAPI() {
  console.log('\n=== EXEMPLO 2: API de Status do Cache ===');
  
  // Cenário 1: Cache ativo com TTL alto
  console.log('\n⚡ Cenário 1: Cache ativo (TTL: 245s)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439011/dashboard-metrics/cache');
  console.log('Response:', JSON.stringify(cacheStatusResponseMocks[0], null, 2));
  
  // Cenário 2: Cache expirando em breve
  console.log('\n⏰ Cenário 2: Cache expirando (TTL: 120s)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439012/dashboard-metrics/cache');
  console.log('Response:', JSON.stringify(cacheStatusResponseMocks[1], null, 2));
  
  // Cenário 3: Sem cache disponível
  console.log('\n❌ Cenário 3: Sem cache disponível');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439013/dashboard-metrics/cache');
  console.log('Response:', JSON.stringify(cacheStatusResponseMocks[2], null, 2));
}

/**
 * Exemplo 3: Simulação de invalidação de cache
 * DELETE /api/communities/{communityId}/dashboard-metrics/cache
 */
function simulateCacheInvalidationAPI() {
  console.log('\n=== EXEMPLO 3: API de Invalidação de Cache ===');
  
  // Cenário 1: Invalidação bem-sucedida
  console.log('\n🗑️ Cenário 1: Invalidação bem-sucedida');
  console.log('Request: DELETE /api/communities/507f1f77bcf86cd799439011/dashboard-metrics/cache');
  console.log('Response:', JSON.stringify(cacheInvalidationResponseMocks[0], null, 2));
  
  // Cenário 2: Invalidação quando não há cache
  console.log('\n🔄 Cenário 2: Invalidação sem cache existente');
  console.log('Request: DELETE /api/communities/507f1f77bcf86cd799439012/dashboard-metrics/cache');
  console.log('Response:', JSON.stringify(cacheInvalidationResponseMocks[1], null, 2));
  
  // Cenário 3: Confirmação de invalidação
  console.log('\n✅ Cenário 3: Confirmação de invalidação');
  console.log('Request: DELETE /api/communities/507f1f77bcf86cd799439013/dashboard-metrics/cache');
  console.log('Response:', JSON.stringify(cacheInvalidationResponseMocks[2], null, 2));
}

/**
 * Exemplo 4: Simulação de respostas de erro
 */
function simulateErrorResponses() {
  console.log('\n=== EXEMPLO 4: Respostas de Erro ===');
  
  // Erro 1: ID de comunidade inválido
  console.log('\n❌ Erro 1: ID de comunidade inválido (400)');
  console.log('Request: GET /api/communities/invalid-id/dashboard-metrics');
  console.log('Response:', JSON.stringify(errorResponseMocks[0], null, 2));
  
  // Erro 2: Não autenticado
  console.log('\n🔒 Erro 2: Não autenticado (401)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439011/dashboard-metrics (sem token)');
  console.log('Response:', JSON.stringify(errorResponseMocks[1], null, 2));
  
  // Erro 3: Acesso negado
  console.log('\n🚫 Erro 3: Acesso negado (403)');
  console.log('Request: GET /api/communities/507f1f77bcf86cd799439011/dashboard-metrics (usuário sem permissão)');
  console.log('Response:', JSON.stringify(errorResponseMocks[2], null, 2));
}

/**
 * Exemplo 5: Dados de modelo para testes
 */
function showModelMocks() {
  console.log('\n=== EXEMPLO 5: Dados de Modelo para Testes ===');
  
  // Comunidades mock
  console.log('\n🏘️ Comunidades Mock:');
  communityMocks.forEach((community, index) => {
    console.log(`\nComunidade ${index + 1}: ${community.name}`);
    console.log(`- ID: ${community._id}`);
    console.log(`- Membros: ${community.stats.totalMembers}`);
    console.log(`- NFTs: ${community.stats.totalNFTs}`);
    console.log(`- Público: ${community.settings.isPublic ? 'Sim' : 'Não'}`);
  });
  
  // Usuários mock
  console.log('\n👥 Usuários Mock:');
  userMocks.forEach((user, index) => {
    const daysSinceLogin = Math.floor((Date.now() - new Date(user.lastLogin)) / (1000 * 60 * 60 * 24));
    console.log(`\nUsuário ${index + 1}: ${user.username}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Último login: ${daysSinceLogin} dias atrás`);
    console.log(`- Status: ${daysSinceLogin <= 30 ? 'Ativo' : 'Inativo'}`);
  });
  
  // Coleções NFT mock
  console.log('\n🎨 Coleções NFT Mock:');
  nftCollectionMocks.forEach((collection, index) => {
    const distributionRate = ((collection.distributedCount / collection.mintedCount) * 100).toFixed(2);
    console.log(`\nColeção ${index + 1}: ${collection.name}`);
    console.log(`- Símbolo: ${collection.symbol}`);
    console.log(`- Mintados: ${collection.mintedCount}/${collection.maxSupply}`);
    console.log(`- Distribuídos: ${collection.distributedCount} (${distributionRate}%)`);
  });
}

/**
 * Exemplo 6: Geração de dados aleatórios
 */
function demonstrateRandomGeneration() {
  console.log('\n=== EXEMPLO 6: Geração de Dados Aleatórios ===');
  
  // Gerar métricas aleatórias
  console.log('\n🎲 Métricas Aleatórias:');
  for (let i = 1; i <= 3; i++) {
    const randomMetrics = generateRandomMetrics(
      `507f1f77bcf86cd79943901${i}`,
      `Comunidade Teste ${i}`
    );
    console.log(`\nComunidade ${i}:`);
    console.log(`- Nome: ${randomMetrics.community_name}`);
    console.log(`- Membros totais: ${randomMetrics.total_members}`);
    console.log(`- Membros ativos: ${randomMetrics.active_members}`);
    console.log(`- NFTs mintados: ${randomMetrics.nft_stats.total_nfts_minted}`);
    console.log(`- Taxa de distribuição: ${randomMetrics.nft_stats.distribution_rate}`);
  }
  
  // Gerar status de cache aleatório
  console.log('\n💾 Status de Cache Aleatório:');
  for (let i = 1; i <= 3; i++) {
    const randomCache = generateCacheStatus(
      `507f1f77bcf86cd79943901${i}`,
      Math.random() > 0.3 // 70% chance de ter cache
    );
    console.log(`\nComunidade ${i}:`);
    console.log(`- Cache ativo: ${randomCache.cached ? 'Sim' : 'Não'}`);
    console.log(`- TTL: ${randomCache.ttl_seconds}s`);
    console.log(`- Chave: ${randomCache.cache_key}`);
  }
}

/**
 * Exemplo 7: Simulação de fluxo completo de teste
 */
function simulateCompleteTestFlow() {
  console.log('\n=== EXEMPLO 7: Fluxo Completo de Teste ===');
  
  const communityId = '507f1f77bcf86cd799439011';
  
  console.log(`\n🔄 Simulando fluxo completo para comunidade: ${communityId}`);
  
  // Passo 1: Verificar status do cache
  console.log('\n1️⃣ Verificando status do cache...');
  console.log('Response:', JSON.stringify(cacheStatusResponseMocks[2], null, 2)); // Sem cache
  
  // Passo 2: Buscar métricas (primeira vez - sem cache)
  console.log('\n2️⃣ Buscando métricas (primeira vez)...');
  console.log('Response:', JSON.stringify(successfulResponseMocks[1], null, 2)); // Dados frescos
  
  // Passo 3: Verificar status do cache novamente
  console.log('\n3️⃣ Verificando status do cache após primeira busca...');
  console.log('Response:', JSON.stringify(cacheStatusResponseMocks[0], null, 2)); // Cache ativo
  
  // Passo 4: Buscar métricas novamente (com cache)
  console.log('\n4️⃣ Buscando métricas (segunda vez - com cache)...');
  console.log('Response:', JSON.stringify(successfulResponseMocks[0], null, 2)); // Dados em cache
  
  // Passo 5: Invalidar cache
  console.log('\n5️⃣ Invalidando cache...');
  console.log('Response:', JSON.stringify(cacheInvalidationResponseMocks[0], null, 2));
  
  // Passo 6: Verificar status após invalidação
  console.log('\n6️⃣ Verificando status após invalidação...');
  console.log('Response:', JSON.stringify(cacheStatusResponseMocks[2], null, 2)); // Sem cache
}

/**
 * Função principal para executar todos os exemplos
 */
function runAllExamples() {
  console.log('🚀 DEMONSTRAÇÃO DOS MOCKS DO COMMUNITY DASHBOARD');
  console.log('=' .repeat(60));
  
  simulateDashboardMetricsAPI();
  simulateCacheStatusAPI();
  simulateCacheInvalidationAPI();
  simulateErrorResponses();
  showModelMocks();
  demonstrateRandomGeneration();
  simulateCompleteTestFlow();
  
  console.log('\n✅ Demonstração concluída!');
  console.log('\n💡 Dicas de uso:');
  console.log('- Use estes mocks em seus testes unitários');
  console.log('- Adapte os dados conforme necessário para seus cenários');
  console.log('- Use as funções de geração aleatória para testes de carga');
  console.log('- Combine diferentes mocks para simular fluxos complexos');
}

// Exportar funções para uso em outros arquivos
module.exports = {
  simulateDashboardMetricsAPI,
  simulateCacheStatusAPI,
  simulateCacheInvalidationAPI,
  simulateErrorResponses,
  showModelMocks,
  demonstrateRandomGeneration,
  simulateCompleteTestFlow,
  runAllExamples
};

// Executar exemplos se este arquivo for executado diretamente
if (require.main === module) {
  runAllExamples();
}