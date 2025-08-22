# Vikareta Backend API

Node.js/Express API service for the Vikareta B2B marketplace platform.

## CI/CD Pipeline Status
- ✅ Centralized Helm Chart Integration
- ✅ ArgoCD Image Updater Support
- ✅ Automatic Deployment Pipeline
- ✅ Health Checks Configured

## Features
- RESTful API endpoints
- Database integration with Prisma
- Authentication and authorization
- Health monitoring endpoints
- Production-ready logging

## Tech Stack
- Node.js 18+
- Express.js
- Prisma ORM
- MySQL/PostgreSQL
- JWT Authentication

## Observability: Jaeger Tracing

This service emits OpenTelemetry traces to Jaeger. Configuration is environment-driven:

- `JAEGER_ENDPOINT`: The Jaeger Collector HTTP endpoint. If you have the Jaeger UI URL (e.g., `http://jaeger:16686`), you can set that and the app will internally normalize it to the collector endpoint `http://jaeger:14268/api/traces`.
- `JAEGER_SERVICE_NAME`: Logical service name. Defaults to `vikareta-backend`.

The SDK also sets `OTEL_SERVICE_NAME` and includes the package version in `OTEL_RESOURCE_ATTRIBUTES` automatically.

Example (Docker/Coolify):

```
JAEGER_ENDPOINT=http://jaeger:16686
JAEGER_SERVICE_NAME=vikareta-backend
```

At startup, you'll see a log similar to:

```
OpenTelemetry tracing initialized { jaegerEndpoint: 'http://jaeger:14268/api/traces', serviceName: 'vikareta-backend' }
```

Jaeger UI is typically available at `http://jaeger:16686`. Search for service `vikareta-backend`.
<!-- Build trigger: Sat Aug  9 23:35:00 IST 2025 -->
<!-- Force new Docker image build to test CI/CD pipeline -->
