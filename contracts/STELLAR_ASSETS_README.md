# Stellar Assets - Substituição dos Contratos Smart Contracts

## Visão Geral

No Stellar, não utilizamos contratos smart contracts tradicionais como Solidity/Ethereum. Em vez disso, utilizamos **Assets Stellar** que são tokens nativos da rede Stellar com funcionalidades similares aos NFTs.

## Migração de Contratos Ethereum para Stellar

### Antes (Ethereum/Solidity)
- **NFTCollection721.sol**: Contrato ERC-721 para NFTs únicos
- **NFTCollection1155.sol**: Contrato ERC-1155 para NFTs semi-fungíveis

### Depois (Stellar)
- **Assets Stellar**: Tokens personalizados emitidos por contas específicas
- **Trustlines**: Mecanismo para aceitar e transferir assets
- **Operações nativas**: Mint, transfer, burn através de operações Stellar

## Funcionalidades Equivalentes

### ERC-721 → Stellar Asset Único
```javascript
// Criação de asset único no Stellar
const asset = new Asset('NFT001', issuerKeypair.publicKey());

// Mint (criar e transferir)
const transaction = new TransactionBuilder(issuerAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.PUBLIC
})
.addOperation(Operation.payment({
  destination: recipientPublicKey,
  asset: asset,
  amount: '1'
}))
.setTimeout(30)
.build();
```

### ERC-1155 → Stellar Asset Semi-Fungível
```javascript
// Asset com quantidade específica
const asset = new Asset('COLLECTION_TOKEN_001', issuerKeypair.publicKey());

// Mint múltiplas unidades
const transaction = new TransactionBuilder(issuerAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.PUBLIC
})
.addOperation(Operation.payment({
  destination: recipientPublicKey,
  asset: asset,
  amount: '10' // Quantidade desejada
}))
.setTimeout(30)
.build();
```

## Vantagens do Stellar

1. **Sem Gas Fees**: Taxas fixas e baixas
2. **Velocidade**: Confirmações em 3-5 segundos
3. **Simplicidade**: Sem necessidade de contratos complexos
4. **Interoperabilidade**: Assets podem ser trocados nativamente
5. **Compliance**: Controles de autorização e congelamento nativos

## Implementação nos Serviços

Os serviços foram atualizados para trabalhar com Stellar:

- **nftMintService.js**: Cria e transfere assets Stellar
- **nftCollectionService.js**: Gerencia contas emissoras e assets
- **blockchainService.js**: Operações nativas do Stellar
- **walletService.js**: Integração com Stellar Wallet Kit

## Metadados e URIs

No Stellar, os metadados são armazenados:
1. **Data Entries**: Na própria conta emissora
2. **IPFS**: Para metadados maiores (imagens, descrições)
3. **Stellar.toml**: Para informações da organização

```javascript
// Exemplo de data entry para metadados
const transaction = new TransactionBuilder(issuerAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.PUBLIC
})
.addOperation(Operation.manageData({
  name: 'NFT_METADATA_001',
  value: JSON.stringify({
    name: 'My NFT',
    description: 'Description',
    image: 'ipfs://...',
    attributes: []
  })
}))
.setTimeout(30)
.build();
```

## Controle de Acesso

No Stellar, o controle é feito através de:

1. **Signers**: Múltiplas chaves para autorização
2. **Thresholds**: Pesos mínimos para operações
3. **Flags**: Controles de autorização, revogação e congelamento

```javascript
// Configurar flags de controle
const transaction = new TransactionBuilder(issuerAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.PUBLIC
})
.addOperation(Operation.setOptions({
  setFlags: AuthRequiredFlag | AuthRevocableFlag
}))
.setTimeout(30)
.build();
```

## Migração Completa

Todos os contratos Solidity foram substituídos por:
1. Lógica de assets Stellar nos serviços
2. Operações nativas da rede Stellar
3. Integração com Stellar Wallet Kit
4. Armazenamento de metadados otimizado

Esta abordagem oferece maior simplicidade, menor custo e melhor performance comparado aos contratos Ethereum tradicionais.