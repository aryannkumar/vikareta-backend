import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

const options: any = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Vikareta Backend API',
      version: process.env.npm_package_version || '1.0.0',
      description: 'Vikareta B2B Marketplace backend API documentation',
    },
    servers: [
      { url: process.env.API_URL || 'http://localhost:5001', description: 'Local server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
      ,
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            businessName: { type: 'string' },
            phone: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: { $ref: '#/components/schemas/User' }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Service: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            totalPages: { type: 'integer' }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  // Scan source files for JSDoc/openapi annotations
  apis: ['src/routes/**/*.ts', 'src/controllers/**/*.ts', 'src/services/**/*.ts'],
};

const swaggerSpec = swaggerJSDoc(options);

export function setupSwagger(app: Express) {
  // Mount Swagger UI on several common paths to support different deployment prefixes
  const mounts = ['/api-docs', '/api/v1/docs', '/api/v1/api-docs', '/api/api-docs'];
  for (const mountPath of mounts) {
    app.use(mountPath, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  // Serve OpenAPI JSON on both root and API-prefixed paths
  app.get('/openapi.json', (req, res) => res.json(swaggerSpec));
  app.get('/api/v1/openapi.json', (req, res) => res.json(swaggerSpec));
}

export default swaggerSpec;
