# Capy's Club Backend - Overview

## 🚀 About the Project

The **HackMeridian Backend** is a robust and scalable API developed in Node.js/Express that serves as the backbone of a community management platform with advanced blockchain, NFT, and exclusive content access control features.

## 🏗️ System Architecture

### Technology Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (with Mongoose ODM)
- **Cache:** Redis
- **Authentication:** JWT (JSON Web Tokens)
- **Blockchain:** Ethers.js, Hardhat
- **Documentation:** Swagger/OpenAPI
- **Testing:** Jest + Supertest
- **File Upload:** AWS S3 + Multer
- **Security:** Helmet, CORS

### Folder Structure

```
backend-hackmeridian/
├── config/          # Configurations (Redis, Swagger)
├── contracts/       # Solidity Smart Contracts
├── docs/           # API Documentation
├── middleware/     # Custom Middlewares
├── mocks/          # Test and simulation data
├── models/         # Data Models (Mongoose)
├── routes/         # API Route definitions
├── services/       # Business logic and services
├── tests/          # Automated tests
├── workers/        # Background processing
└── server.js       # Application entry point
```

## 🔧 Main Features

### 1. **Authentication and Authorization System**
- User registration and login
- JWT authentication with refresh tokens
- Role-based access control (admin, moderator, member)
- Route protection middleware

### 2. **Community Management**
- Community creation and administration
- Invitation and affiliation system
- Administrative dashboard
- Member and permission control

### 3. **Exclusive Content System**
- Premium content access control
- Sequential validation (authentication → affiliation → delivery)
- Different access levels (member, moderator, admin)
- View tracking and engagement

### 4. **Blockchain and NFT Integration**
- NFT collection creation and management (ERC-721 and ERC-1155)
- NFT-based reward system
- Web3 wallet integration
- Blockchain transaction monitoring
- Automated minting services

### 5. **Posts and Interactions System**
- Post creation, editing, and deletion
- Like and comment system
- Community-personalized feed
- Content moderation

### 6. **Product Management**
- Digital product catalog
- Media upload and processing
- Categorization system
- Payment integration

### 7. **Badge and Gamification System**
- Automatic badge rule engine
- Achievement and reward system
- Background processing
- Engagement metrics

## 🛡️ Security and Middleware

### Security Layers
- **Helmet:** Protection against common vulnerabilities
- **CORS:** Cross-origin control
- **Rate Limiting:** Spam and attack prevention
- **Input Validation:** Express-validator for sanitization
- **JWT Authentication:** Secure tokens with expiration

### Custom Middleware
- `auth.js` - JWT authentication verification
- `communityAuth.js` - Community affiliation validation
- `contentAccess.js` - Exclusive content access control
- `fileValidation.js` - File upload validation

## 📊 Data Models

### Main Entities
- **User:** Platform users with roles and affiliations
- **Community:** Communities with settings and members
- **Content:** Exclusive content with access control
- **Post:** Public posts with interactions
- **Product:** Digital and physical products
- **NFTCollection:** NFT collections with metadata
- **BadgeRule:** Rules for automatic badge achievement

## 🔄 Services and Integrations

### Core Services
- **walletService:** Web3 wallet integration
- **blockchainService:** Smart contract interaction
- **nftMintService:** Automated NFT creation
- **uploadService:** S3 file management
- **cacheService:** Redis optimization
- **eventService:** Event and notification system

### External Integrations
- **AWS S3:** File and media storage
- **Moralis:** Blockchain and Web3 APIs
- **Redis:** Cache and sessions
- **MongoDB:** Data persistence
- **Nodemailer:** Email sending

## 📚 API Documentation

### Swagger/OpenAPI
- Interactive documentation available at `/api-docs`
- Detailed schemas for all entities
- Request and response examples
- Integrated authentication for testing

### Main Endpoints
- `POST /api/auth/login` - User authentication
- `GET /api/content/{id}` - Exclusive content access
- `POST /api/nft/mint` - NFT creation
- `GET /api/community/dashboard` - Community dashboard
- `POST /api/posts` - Post creation

## 🧪 Testing and Quality

### Testing Strategy
- **Unit Tests:** Individual function validation
- **Integration Tests:** Complete API flows
- **Middleware Tests:** Authentication and authorization validation
- **Mocks:** External service simulation

### Test Coverage
- Authentication and authorization system
- Exclusive content access control
- Blockchain and NFT integration
- Community management
- File upload and processing

## 🚀 Deploy and Environment

### Environment Configuration
- **Development:** `npm run dev` (nodemon)
- **Production:** `npm start`
- **Testing:** `npm test`

### Environment Variables
```env
MONGODB_URI=mongodb://localhost:27017/hackmeridian
JWT_SECRET=your-secret-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
REDIS_URL=redis://localhost:6379
CLIENT_URL=http://localhost:3000
```

## 🔮 Advanced Features

### Anti-Fraud System
- Suspicious behavior detection
- Blockchain transaction validation
- Anomalous activity monitoring

### Intelligent Cache
- Frequent query caching
- Automatic invalidation
- Performance optimization

### Asynchronous Processing
- Workers for heavy tasks
- Background badge processing
- Blockchain transaction monitoring

## 📈 Metrics and Monitoring

### Logs and Auditing
- Structured logs with Morgan
- Access tracking
- Critical action auditing

### Health Checks
- `/health` endpoint for monitoring
- Service connectivity verification
- Uptime and performance metrics

## 🤝 Contribution

This backend was developed following best practices of:
- **Clean Architecture:** Clear separation of responsibilities
- **RESTful APIs:** Consistent endpoint patterns
- **Security First:** Security at all layers
- **Scalability:** Architecture prepared for growth
- **Maintainability:** Clean and well-documented code

---

**Version:** 1.0.0  
**Last Update:** September 2025  
**Technology:** Node.js + Express + MongoDB + Blockchain
