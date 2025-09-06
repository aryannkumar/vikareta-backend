import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

const defaultDefinition: any = {
  openapi: '3.0.3',
  info: {
    title: 'Vikareta Backend API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Vikareta B2B Marketplace backend API documentation',
  },
  servers: [
    { url: process.env.API_URL || '/', description: 'Default server (current origin or API_URL)' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            currency: { type: 'string' },
            images: { type: 'array', items: { type: 'string', format: 'uri' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Service: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            currency: { type: 'string' },
            images: { type: 'array', items: { type: 'string', format: 'uri' } },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            businessName: { type: 'string' }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            totalAmount: { type: 'number' },
            currency: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            status: { type: 'string' }
          }
        }
      }
    },
  security: [{ bearerAuth: [] }],
  paths: {},
};

const apisPatterns = [
  'src/routes/**/*.ts',
  'src/controllers/**/*.ts',
  'src/services/**/*.ts',
  'dist/routes/**/*.js',
  'dist/controllers/**/*.js',
  'dist/services/**/*.js',
];

let swaggerSpec: any;
let usedFallback = false;
try {
  const options: any = { definition: defaultDefinition, apis: apisPatterns };
  swaggerSpec = swaggerJSDoc(options);
} catch (err) {
  // If swagger-jsdoc fails (common when running from compiled output), fall back to minimal spec
  console.warn('swagger-jsdoc generation failed, using fallback spec:', err);
  swaggerSpec = defaultDefinition;
  usedFallback = true;
}

export function setupSwagger(app: Express) {
  // Mount Swagger UI on several common paths to support different deployment prefixes
  const mounts = ['/api-docs', '/docs', '/api/v1/docs', '/api/v1/api-docs', '/api/api-docs', '/api/docs'];
  for (const mountPath of mounts) {
    try {
      // Configure the UI to load the OpenAPI spec from a stable, absolute path
      app.use(mountPath, swaggerUi.serve, swaggerUi.setup(undefined as any, {
        swaggerOptions: { url: '/openapi.json' }
      } as any));
    } catch (err) {
      // ignore per-mount failures
      console.warn(`Failed to mount Swagger at ${mountPath}:`, err);
    }
  }

  // Serve OpenAPI JSON on several common paths
  const openapiPaths = ['/openapi.json', '/api/v1/openapi.json', '/api/openapi.json', '/docs/openapi.json'];
  for (const p of openapiPaths) {
    try {
      app.get(p, (req, res) => {
        try {
          const spec = JSON.parse(JSON.stringify(swaggerSpec || defaultDefinition));
          // Prefer the request origin (respecting reverse proxy headers) so the UI
          // uses the same host/scheme as the browser. Fall back to API_URL or '/'.
          const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
          const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
          const reqOrigin = host ? `${proto}://${host}` : undefined;
          spec.servers = [
            { url: reqOrigin || process.env.API_URL || '/', description: 'Resolved server URL' }
          ];
          return res.json(spec);
        } catch (err) {
          console.warn('Failed to prepare dynamic OpenAPI JSON, falling back to static spec:', err);
          return res.json(swaggerSpec);
        }
      });
    } catch (err) {
      console.warn(`Failed to register OpenAPI JSON at ${p}:`, err);
    }
  }

  // Also register a catch-all route for any path ending with openapi.json
  // This covers deployments where a reverse proxy / base path prefixes requests.
  try {
    app.get(/openapi\.json$/, (req, res) => {
      try {
        const spec = JSON.parse(JSON.stringify(swaggerSpec || defaultDefinition));
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
        const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
        const reqOrigin = host ? `${proto}://${host}` : undefined;
        spec.servers = [
          { url: reqOrigin || process.env.API_URL || '/', description: 'Resolved server URL' }
        ];
        return res.json(spec);
      } catch (err) {
        console.warn('Failed to prepare dynamic OpenAPI JSON for regex route, falling back to static spec:', err);
        return res.json(swaggerSpec);
      }
    });
  } catch (err) {
    console.warn('Failed to register regex OpenAPI JSON route:', err);
  }

  if (usedFallback) {
    // warn that the spec is minimal and recommend building/generating openapi.json during CI
    console.warn('Using fallback OpenAPI spec — consider generating full spec during build for production');
  }
}

export default swaggerSpec;
