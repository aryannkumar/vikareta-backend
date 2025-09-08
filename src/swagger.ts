import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

const defaultDefinition: any = {
  openapi: '3.0.3',
  info: {
    title: 'Vikareta Backend API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Vikareta B2B Marketplace backend API documentation',
    contact: {
      name: 'Vikareta Support',
      email: 'support@vikareta.com'
    }
  },
  servers: [
    { url: '/', description: 'Default server (current origin)' },
    { url: 'https://api.vikareta.com', description: 'Production API' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { 
        type: 'http', 
        scheme: 'bearer', 
        bearerFormat: 'JWT',
        description: 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
      }
    },
    schemas: {
        Product: {
          type: 'object',
          required: ['title', 'description', 'price'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique product identifier' },
            title: { type: 'string', description: 'Product title' },
            description: { type: 'string', description: 'Product description' },
            price: { type: 'number', minimum: 0, description: 'Product price' },
            currency: { type: 'string', default: 'INR', description: 'Currency code' },
            images: { type: 'array', items: { type: 'string', format: 'uri' }, description: 'Product images' },
            category: { type: 'string', description: 'Product category' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Product tags' },
            createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
          }
        },
        Service: {
          type: 'object',
          required: ['title', 'description', 'price'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique service identifier' },
            title: { type: 'string', description: 'Service title' },
            description: { type: 'string', description: 'Service description' },
            price: { type: 'number', minimum: 0, description: 'Service price' },
            currency: { type: 'string', default: 'INR', description: 'Currency code' },
            images: { type: 'array', items: { type: 'string', format: 'uri' }, description: 'Service images' },
            category: { type: 'string', description: 'Service category' },
            createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
          }
        },
        User: {
          type: 'object',
          required: ['email'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique user identifier' },
            firstName: { type: 'string', description: 'User first name' },
            lastName: { type: 'string', description: 'User last name' },
            email: { type: 'string', format: 'email', description: 'User email address' },
            phone: { type: 'string', description: 'User phone number' },
            businessName: { type: 'string', description: 'Business name' },
            role: { type: 'string', enum: ['buyer', 'seller', 'admin'], description: 'User role' },
            isVerified: { type: 'boolean', description: 'Email verification status' },
            createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
          }
        },
        Order: {
          type: 'object',
          required: ['totalAmount'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique order identifier' },
            totalAmount: { type: 'number', minimum: 0, description: 'Order total amount' },
            currency: { type: 'string', default: 'INR', description: 'Currency code' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'], description: 'Order status' },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' }, description: 'Order items' },
            createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
          }
        },
        OrderItem: {
          type: 'object',
          properties: {
            productId: { type: 'string', format: 'uuid', description: 'Product identifier' },
            quantity: { type: 'integer', minimum: 1, description: 'Item quantity' },
            price: { type: 'number', minimum: 0, description: 'Item price' }
          }
        },
        Payment: {
          type: 'object',
          required: ['amount'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique payment identifier' },
            amount: { type: 'number', minimum: 0, description: 'Payment amount' },
            currency: { type: 'string', default: 'INR', description: 'Currency code' },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'refunded'], description: 'Payment status' },
            method: { type: 'string', enum: ['card', 'upi', 'netbanking', 'wallet'], description: 'Payment method' },
            createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: false, description: 'Success status' },
            error: { type: 'string', description: 'Error message' },
            message: { type: 'string', description: 'Detailed error message' },
            code: { type: 'string', description: 'Error code' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: true, description: 'Success status' },
            data: { type: 'object', description: 'Response data' },
            message: { type: 'string', description: 'Success message' }
          }
        }
      }
    },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/v1/auth/login': {
      post: {
        summary: 'User login',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        token: { type: 'string' },
                        refreshToken: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'User registration',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'businessName'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  businessName: { type: 'string' },
                  phone: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Registration successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/User' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/api/v1/products': {
      get: {
        summary: 'List products',
        tags: ['Products'],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Page number'
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            description: 'Items per page'
          },
          {
            name: 'category',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by category'
          },
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string' },
            description: 'Search query'
          }
        ],
        responses: {
          200: {
            description: 'Products list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        products: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Product' }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total: { type: 'integer' },
                            pages: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create product',
        tags: ['Products'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Product' }
            }
          }
        },
        responses: {
          201: {
            description: 'Product created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Product' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/api/v1/orders': {
      get: {
        summary: 'List user orders',
        tags: ['Orders'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Orders list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Order' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create order',
        tags: ['Orders'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/OrderItem' }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Order created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/Order' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

const apisPatterns = [
  // Source files (development)
  'src/routes/**/*.ts',
  'src/controllers/**/*.ts',
  'src/middleware/**/*.ts',
  'src/validation/**/*.ts',
  'src/**/*.ts',
  // Compiled files (production) - prioritize these for production
  'dist/routes/**/*.js',
  'dist/controllers/**/*.js',
  'dist/middleware/**/*.js',
  'dist/validation/**/*.js',
  'dist/**/*.js',
  // Allow relative paths
  './src/routes/**/*.ts',
  './src/controllers/**/*.ts',
  './dist/routes/**/*.js',
  './dist/controllers/**/*.js',
];

let swaggerSpec: any;
let usedFallback = false;
try {
  const options: any = { 
    definition: defaultDefinition, 
    apis: apisPatterns,
    // Additional swagger-jsdoc options for better reliability
    failOnErrors: false, // Don't fail on parsing errors
    verbose: process.env.NODE_ENV === 'development',
    swaggerDefinition: {
      openapi: '3.0.3',
      ...defaultDefinition
    }
  };
  
  console.log('Attempting to generate Swagger spec from patterns:', apisPatterns);
  console.log('Current working directory:', process.cwd());
  console.log('NODE_ENV:', process.env.NODE_ENV);
  
  swaggerSpec = swaggerJSDoc(options);
  
  // Check if we actually found any paths
  const pathCount = Object.keys(swaggerSpec?.paths || {}).length;
  console.log(`Swagger spec generated with ${pathCount} API paths`);
  
  if (pathCount === 0) {
    console.warn('No API paths found in generated spec, this might indicate a path resolution issue');
    console.warn('Available files in routes directory:');
    // Log available route files for debugging
    try {
      const fs = require('fs');
      const path = require('path');
      const routesDir = path.join(process.cwd(), 'src', 'routes');
      if (fs.existsSync(routesDir)) {
        const files = fs.readdirSync(routesDir);
        console.warn('Route files found:', files);
      }
    } catch (err) {
      console.warn('Could not list route files:', err);
    }
  } else {
    console.log('Successfully generated Swagger spec with paths:', Object.keys(swaggerSpec.paths));
  }
  
} catch (err: any) {
  // If swagger-jsdoc fails (common when running from compiled output), fall back to minimal spec
  console.error('swagger-jsdoc generation failed, using fallback spec:', err);
  console.error('Error details:', {
    message: err?.message || 'Unknown error',
    stack: err?.stack || 'No stack trace',
    cwd: process.cwd()
  });
  swaggerSpec = defaultDefinition;
  usedFallback = true;
}

export function setupSwagger(app: Express) {
  // Use standard swagger-ui-express with local files (CSP compliant)
  const swaggerOptions = {
    explorer: true,
    swaggerOptions: {
      url: '/api-docs/openapi.json',
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      syntaxHighlight: {
        activate: true,
        theme: 'arta'
      }
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #3b4151 }
    `,
    customSiteTitle: 'Vikareta API Documentation',
    customfavIcon: '/favicon.ico'
  };

  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(swaggerSpec || defaultDefinition, swaggerOptions));

  // Serve OpenAPI JSON
  app.get('/api-docs/openapi.json', (req, res) => {
    try {
      const spec = JSON.parse(JSON.stringify(swaggerSpec || defaultDefinition));
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const reqOrigin = host ? `${proto}://${host}` : undefined;
      spec.servers = [
        { url: reqOrigin || '/', description: 'Current server' },
        { url: 'https://api.vikareta.com', description: 'Production API' }
      ];
      res.json(spec);
    } catch (err) {
      console.error('Error serving OpenAPI spec:', err);
      res.status(500).json({ error: 'Failed to generate API documentation' });
    }
  });

  console.log(`✅ Swagger UI available at: /api-docs`);
  console.log(`✅ OpenAPI JSON available at: /api-docs/openapi.json`);
  console.log(`📊 Generated ${Object.keys(swaggerSpec?.paths || {}).length} API paths`);

  if (usedFallback) {
    console.log(`⚠️  Using enhanced fallback documentation (automatic generation failed)`);
  }
}

export default swaggerSpec;
