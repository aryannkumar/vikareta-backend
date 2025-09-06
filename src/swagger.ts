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
    { url: '/', description: 'Default server (current origin)' }
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
  // Mount Swagger UI only at the canonical production path
  const mounts = ['/api-docs'];
  for (const mountPath of mounts) {
    try {
      // CSP middleware: do not allow inline scripts/styles. Allow connect-src to
      // the request origin and any additional allowed hosts via env var.
      const cspMiddleware = (req: any, res: any, next: any) => {
        try {
          const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
          const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
          const reqOrigin = host ? `${proto}://${host}` : undefined;
          const connectSrc = [`'self'`];
          if (reqOrigin && !connectSrc.includes(reqOrigin)) connectSrc.push(reqOrigin);

          const scriptSrc = [`'self'`];
          const styleSrc = [`'self'`];

          const csp = `default-src 'self'; script-src ${scriptSrc.join(' ')}; style-src ${styleSrc.join(' ')}; connect-src ${connectSrc.join(' ')}; img-src 'self' data:;`;
          res.setHeader('Content-Security-Policy', csp);
        } catch (err) {
          console.warn('Failed to set CSP header for Swagger UI mount:', err);
        }
        next();
      };

      // Serve swagger static assets from the mount path
      app.use(mountPath, cspMiddleware, swaggerUi.serve);

      // Serve a non-inline HTML page that references an external initializer JS
      app.get(mountPath, cspMiddleware, (req: any, res: any) => {
        const basePath = mountPath.replace(/\/$/, '');
        const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vikareta API Docs</title>
    <link rel="stylesheet" type="text/css" href="${basePath}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${basePath}/swagger-ui-bundle.js"></script>
    <script src="${basePath}/swagger-ui-standalone-preset.js"></script>
    <script src="${basePath}/swagger-init.js"></script>
  </body>
</html>`;
        res.type('text/html').send(html);
      });

      // External initializer JS — points at the namespaced openapi.json
      app.get(`${mountPath}/swagger-init.js`, cspMiddleware, (req: any, res: any) => {
        const initUrl = `${mountPath}/openapi.json`;
        const js = `window.onload = function() {\n  const ui = SwaggerUIBundle({\n    url: '${initUrl}',\n    dom_id: '#swagger-ui',\n    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],\n    layout: 'BaseLayout',\n    deepLinking: true\n  });\n  window.ui = ui;\n};`;
        res.type('application/javascript').send(js);
      });
    } catch (err) {
      console.warn(`Failed to mount Swagger at ${mountPath}:`, err);
    }
  }

  // Serve OpenAPI JSON under the /api-docs namespace only
  const openapiPaths = ['/api-docs/openapi.json'];
  for (const p of openapiPaths) {
    try {
      app.get(p, (req, res) => {
        try {
          const spec = JSON.parse(JSON.stringify(swaggerSpec || defaultDefinition));
          const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
          const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
          const reqOrigin = host ? `${proto}://${host}` : undefined;
          spec.servers = [
            { url: reqOrigin || '/', description: 'Resolved server URL' }
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
  try {
    app.get(/api-docs\/openapi\.json$/, (req, res) => {
      try {
        const spec = JSON.parse(JSON.stringify(swaggerSpec || defaultDefinition));
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
        const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
        const reqOrigin = host ? `${proto}://${host}` : undefined;
        spec.servers = [
          { url: reqOrigin || '/', description: 'Resolved server URL' }
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
    console.warn('Using fallback OpenAPI spec — consider generating full spec during build for production');
  }
}

export default swaggerSpec;
