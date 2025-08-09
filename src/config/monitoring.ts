/**
 * Monitoring Configuration
 * Centralized configuration for all monitoring services
 */

export const monitoringConfig = {
  // Performance monitoring settings
  performance: {
    slowQueryThreshold: 1000, // 1 second
    memoryThreshold: 500 * 1024 * 1024, // 500MB
    cpuThreshold: 80, // 80%
    responseTimeThreshold: 2000, // 2 seconds
    errorRateThreshold: 0.05, // 5%
    metricsRetentionPeriod: 86400000, // 24 hours
    systemMetricsInterval: 30000, // 30 seconds
    alertCheckInterval: 60000 // 1 minute
  },

  // Cache configuration
  cache: {
    defaultTtl: 3600, // 1 hour
    maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
    evictionPolicy: 'allkeys-lru',
    keyspaceNotifications: true,
    compressionThreshold: 1024, // 1KB
    warmupOnStartup: true,
    warmupCategories: ['user', 'product', 'category', 'rfq'],
    statsCollectionInterval: 300000 // 5 minutes
  },

  // Error tracking settings
  errorTracking: {
    errorRetentionPeriod: 86400000, // 24 hours
    maxErrorsInMemory: 1000,
    maxPatternsInMemory: 500,
    fingerprintAlgorithm: 'md5',
    groupSimilarErrors: true,
    trackUserContext: true,
    trackRequestContext: true,
    alertThresholds: {
      errorSpike: 10, // errors per minute
      criticalErrorThreshold: 5, // critical errors per minute
      errorRateThreshold: 0.05, // 5% error rate
      patternThreshold: 5 // same error pattern count
    }
  },

  // Incident management
  incidents: {
    escalationLevels: [
      { level: 0, timeThreshold: 0, severity: 'low' },
      { level: 1, timeThreshold: 15 * 60 * 1000, severity: 'medium' }, // 15 minutes
      { level: 2, timeThreshold: 30 * 60 * 1000, severity: 'high' }, // 30 minutes
      { level: 3, timeThreshold: 60 * 60 * 1000, severity: 'critical' } // 1 hour
    ],
    autoResolveThreshold: 24 * 60 * 60 * 1000, // 24 hours
    maxActiveIncidents: 100,
    notificationChannels: {
      slack: {
        enabled: true,
        webhook: process.env.SLACK_WEBHOOK_URL,
        channel: '#alerts',
        mentionOnCritical: true
      },
      email: {
        enabled: true,
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        recipients: {
          low: ['dev-team@vikareta.com'],
          medium: ['dev-team@vikareta.com', 'ops-team@vikareta.com'],
          high: ['dev-team@vikareta.com', 'ops-team@vikareta.com', 'management@vikareta.com'],
          critical: ['dev-team@vikareta.com', 'ops-team@vikareta.com', 'management@vikareta.com', 'ceo@vikareta.com']
        }
      },
      pagerduty: {
        enabled: process.env.NODE_ENV === 'production',
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        severityMapping: {
          low: 'info',
          medium: 'warning',
          high: 'error',
          critical: 'critical'
        }
      },
      webhook: {
        enabled: false,
        url: process.env.WEBHOOK_URL,
        timeout: 5000,
        retries: 3
      }
    }
  },

  // Health check configuration
  healthChecks: {
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    checks: {
      database: {
        enabled: true,
        query: 'SELECT 1',
        timeout: 3000
      },
      redis: {
        enabled: true,
        command: 'ping',
        timeout: 1000
      },
      externalServices: {
        enabled: true,
        services: [
          {
            name: 'cashfree',
            url: 'https://api.cashfree.com/api/v1/order/info/status',
            timeout: 5000,
            expectedStatus: 200
          },
          {
            name: 'digilocker',
            url: 'https://api.digitallocker.gov.in/public/oauth2/1/authorize',
            timeout: 5000,
            expectedStatus: 200
          }
        ]
      },
      diskSpace: {
        enabled: true,
        threshold: 85, // 85%
        paths: ['/tmp', '/var/log']
      },
      memoryUsage: {
        enabled: true,
        threshold: 85 // 85%
      }
    }
  },

  // Metrics collection
  metrics: {
    collection: {
      enabled: true,
      interval: 15000, // 15 seconds
      batchSize: 100,
      compression: true
    },
    retention: {
      raw: 24 * 60 * 60 * 1000, // 24 hours
      aggregated: 7 * 24 * 60 * 60 * 1000, // 7 days
      summary: 30 * 24 * 60 * 60 * 1000 // 30 days
    },
    aggregation: {
      intervals: [
        { name: '1m', duration: 60 * 1000 },
        { name: '5m', duration: 5 * 60 * 1000 },
        { name: '15m', duration: 15 * 60 * 1000 },
        { name: '1h', duration: 60 * 60 * 1000 },
        { name: '1d', duration: 24 * 60 * 60 * 1000 }
      ]
    },
    business: {
      enabled: true,
      metrics: [
        'new_users',
        'new_products',
        'new_rfqs',
        'new_orders',
        'revenue',
        'active_users',
        'conversion_rates'
      ],
      updateInterval: 300000 // 5 minutes
    }
  },

  // Dashboard configuration
  dashboard: {
    refreshInterval: 30000, // 30 seconds
    autoRefresh: true,
    defaultTimeRange: '1h',
    maxDataPoints: 1000,
    charts: {
      responseTime: {
        type: 'line',
        metrics: ['avg', 'p50', 'p95', 'p99'],
        colors: ['#3498db', '#2ecc71', '#f39c12', '#e74c3c']
      },
      errorRate: {
        type: 'area',
        threshold: 5,
        color: '#e74c3c'
      },
      throughput: {
        type: 'bar',
        color: '#3498db'
      },
      systemMetrics: {
        type: 'gauge',
        thresholds: {
          memory: [70, 85],
          cpu: [70, 85],
          disk: [80, 90]
        }
      }
    },
    alerts: {
      showInDashboard: true,
      maxVisible: 10,
      autoHide: false,
      groupSimilar: true
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    timestamp: true,
    colorize: process.env.NODE_ENV !== 'production',
    maxFiles: 10,
    maxSize: '100MB',
    compress: true,
    datePattern: 'YYYY-MM-DD',
    auditFile: 'logs/audit.json',
    handleExceptions: true,
    handleRejections: true,
    exitOnError: false,
    transports: {
      console: {
        enabled: true,
        level: 'debug'
      },
      file: {
        enabled: true,
        level: 'info',
        filename: 'logs/combined.log'
      },
      error: {
        enabled: true,
        level: 'error',
        filename: 'logs/error.log'
      },
      http: {
        enabled: process.env.NODE_ENV === 'production',
        host: process.env.LOG_HOST,
        port: parseInt(process.env.LOG_PORT || '12201'),
        facility: 'vikareta-backend'
      }
    }
  },

  // Security monitoring
  security: {
    enabled: true,
    monitoring: {
      failedLogins: {
        threshold: 5,
        timeWindow: 300000, // 5 minutes
        action: 'block'
      },
      suspiciousActivity: {
        enabled: true,
        patterns: [
          'sql_injection',
          'xss_attempt',
          'path_traversal',
          'brute_force'
        ]
      },
      rateLimiting: {
        monitor: true,
        alertOnExceed: true
      }
    },
    compliance: {
      gdpr: {
        enabled: true,
        dataRetention: 365 * 24 * 60 * 60 * 1000, // 1 year
        anonymization: true
      },
      pciDss: {
        enabled: true,
        tokenization: true,
        encryption: 'AES-256'
      }
    }
  }
};

export default monitoringConfig;