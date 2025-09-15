const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Load the products API documentation
let productsApiDoc = {};
try {
  const productsYamlPath = path.join(__dirname, '../docs/products-api.yaml');
  if (fs.existsSync(productsYamlPath)) {
    const productsYamlContent = fs.readFileSync(productsYamlPath, 'utf8');
    productsApiDoc = yaml.load(productsYamlContent);
    console.log('✅ Products API documentation loaded successfully');
  } else {
    console.warn('⚠️  Products API YAML file not found, using basic configuration');
  }
} catch (error) {
  console.warn('⚠️  Could not load products API documentation:', error.message);
}

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HackMeridian Backend API',
      version: '1.0.0',
      description: 'Complete API documentation for HackMeridian platform with wallet integration, community management, and product management',
      contact: {
        name: 'HackMeridian Team',
        email: 'support@hackmeridian.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Development server',
      },
      {
        url: 'https://api.hackmeridian.com/api',
        description: 'Production server',
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication'
        },
      },
      schemas: {
        // Merge schemas from products API if available
        ...(productsApiDoc.components?.schemas || {}),
        
        // Common schemas
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'objectid',
              description: 'User unique identifier'
            },
            username: {
              type: 'string',
              description: 'Username'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            wallet_address: {
              type: 'string',
              description: 'Blockchain wallet address'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp'
            }
          }
        },
        
        Community: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'objectid',
              description: 'Community unique identifier'
            },
            name: {
              type: 'string',
              description: 'Community name'
            },
            description: {
              type: 'string',
              description: 'Community description'
            },
            admin_id: {
              type: 'string',
              format: 'objectid',
              description: 'Community administrator user ID'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Community creation timestamp'
            }
          }
        },

        Post: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'objectid',
              description: 'Post unique identifier'
            },
            author_id: {
              type: 'string',
              format: 'objectid',
              description: 'Author user ID'
            },
            community_id: {
              type: 'string',
              format: 'objectid',
              description: 'Community ID where post belongs'
            },
            content: {
              type: 'string',
              description: 'Post content text',
              maxLength: 2000
            },
            media_urls: {
              type: 'array',
              items: {
                type: 'string',
                format: 'uri'
              },
              description: 'Array of media URLs attached to post'
            },
            likes_count: {
              type: 'integer',
              minimum: 0,
              description: 'Number of likes on the post'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Post creation timestamp'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Post last update timestamp'
            }
          },
          required: ['author_id', 'community_id', 'content']
        },

        Comment: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'objectid',
              description: 'Comment unique identifier'
            },
            post_id: {
              type: 'string',
              format: 'objectid',
              description: 'Post ID that comment belongs to'
            },
            author_id: {
              type: 'string',
              format: 'objectid',
              description: 'Comment author user ID'
            },
            content: {
              type: 'string',
              description: 'Comment content text',
              maxLength: 500
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Comment creation timestamp'
            }
          },
          required: ['post_id', 'author_id', 'content']
        },

        Like: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              format: 'objectid',
              description: 'Like unique identifier'
            },
            user_id: {
              type: 'string',
              format: 'objectid',
              description: 'User who liked the post'
            },
            post_id: {
              type: 'string',
              format: 'objectid',
              description: 'Post that was liked'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Like creation timestamp'
            }
          },
          required: ['user_id', 'post_id']
        },
        
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              description: 'Error message'
            },
            errors: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Detailed error messages'
            }
          }
        }
      },
      
      responses: {
        // Merge responses from products API if available
        ...(productsApiDoc.components?.responses || {}),
        
        BadRequest: {
          description: 'Bad request - Invalid input parameters',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Validation failed',
                errors: ['Field is required', 'Invalid format']
              }
            }
          }
        },
        
        Unauthorized: {
          description: 'Unauthorized - Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Authentication required'
              }
            }
          }
        },
        
        Forbidden: {
          description: 'Forbidden - Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Access denied'
              }
            }
          }
        },
        
        NotFound: {
          description: 'Not found - Resource does not exist',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Resource not found'
              }
            }
          }
        },
        
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Internal server error'
              }
            }
          }
        }
      }
    },
    
    // Merge paths from products API if available
    paths: {
      ...(productsApiDoc.paths || {})
    },
    
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Users',
        description: 'User management and wallet operations'
      },
      {
        name: 'Communities',
        description: 'Community management operations'
      },
      {
        name: 'Products',
        description: 'Product management operations'
      },
      {
        name: 'NFT Collections',
        description: 'NFT collection management'
      },
      {
        name: 'Brands',
        description: 'Brand management operations'
      },
      {
        name: 'Posts',
        description: 'Timeline and exclusive wall posts management'
      }
    ]
  },
  apis: [
    './routes/*.js',
    './docs/*.yaml'
  ], // paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(swaggerOptions);

module.exports = {
  swaggerOptions,
  specs
};