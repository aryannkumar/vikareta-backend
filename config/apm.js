
// APM Configuration for Vikareta Backend
const apm = require('elastic-apm-node').start({
  serviceName: 'vikareta-backend',
  environment: 'development',
  sampleRate: 1,
  captureBody: 'all',
  captureHeaders: true,
  
  // Performance settings
  transactionSampleRate: 1.0,
  spanFramesMinDuration: '5ms',
  stackTraceLimit: 50,
  
  // Error tracking
  captureExceptions: true,
  captureErrorLogStackTraces: 'always',
  
  // Custom metrics
  customMetrics: true,
  
  // Distributed tracing
  distributedTracingOrigins: ['*'],
  
  // Server configuration
  serverUrl: process.env.ELASTIC_APM_SERVER_URL,
  secretToken: process.env.ELASTIC_APM_SECRET_TOKEN,
  
  // Logging
  logLevel: 'info',
  logger: console
});

module.exports = apm;
