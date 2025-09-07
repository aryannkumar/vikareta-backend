import client from 'prom-client';
import { logger } from '@/utils/logger';

// Create a global registry
export const registry = new client.Registry();

// Default metrics
client.collectDefaultMetrics({ register: registry, prefix: 'vikareta_' });

// Application specific metrics
export const adImpressionsCounter = new client.Counter({
  name: 'vikareta_ad_impressions_total',
  help: 'Total ad impressions recorded (post-dedupe)',
  labelNames: ['adId', 'campaignId']
});
export const adClicksCounter = new client.Counter({
  name: 'vikareta_ad_clicks_total',
  help: 'Total ad clicks recorded (post-dedupe)',
  labelNames: ['adId', 'campaignId']
});
export const adDedupeSkipCounter = new client.Counter({
  name: 'vikareta_ad_event_dedupe_skips_total',
  help: 'Ad events skipped due to dedupe',
  labelNames: ['eventType']
});
export const securityEventsCounter = new client.Counter({
  name: 'vikareta_security_events_total',
  help: 'Security events emitted',
  labelNames: ['eventType']
});
export const kafkaMessagesConsumedCounter = new client.Counter({
  name: 'vikareta_kafka_messages_consumed_total',
  help: 'Kafka messages consumed',
  labelNames: ['topic']
});

export const webhookDeliveriesCounter = new client.Counter({
  name: 'vikareta_webhook_deliveries_total',
  help: 'Webhook delivery attempts',
  labelNames: ['webhookId', 'status'] // status: success | failure
});

export const inventoryMovementsCounter = new client.Counter({
  name: 'vikareta_inventory_movements_total',
  help: 'Inventory movement events',
  labelNames: ['type'] // in | out | adjustment | transfer
});

export const securityEventsErrorsCounter = new client.Counter({
  name: 'vikareta_security_events_errors_total',
  help: 'Security events query errors'
});

// HTTP metrics
export const httpRequestsCounter = new client.Counter({
  name: 'vikareta_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

export const httpRequestDurationHistogram = new client.Histogram({
  name: 'vikareta_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

export const notificationSentCounter = new client.Counter({
  name: 'vikareta_notifications_sent_total',
  help: 'Notifications processing outcomes',
  labelNames: ['channel', 'type', 'status'] // status: sent | failed | skipped
});

export const notificationBatchProcessedCounter = new client.Counter({
  name: 'vikareta_notification_batches_total',
  help: 'Notification batch lifecycle events',
  labelNames: ['status'] // created | completed | cancelled | retry_started
});

try {
  registry.registerMetric(adImpressionsCounter);
  registry.registerMetric(adClicksCounter);
  registry.registerMetric(adDedupeSkipCounter);
  registry.registerMetric(securityEventsCounter);
  registry.registerMetric(kafkaMessagesConsumedCounter);
  registry.registerMetric(webhookDeliveriesCounter);
  registry.registerMetric(inventoryMovementsCounter);
  registry.registerMetric(securityEventsErrorsCounter);
  registry.registerMetric(httpRequestsCounter);
  registry.registerMetric(httpRequestDurationHistogram);
  registry.registerMetric(notificationSentCounter);
  registry.registerMetric(notificationBatchProcessedCounter);
} catch (err) {
  logger.warn('Metric registration issue (possibly duplicate in hot reload):', (err as any)?.message);
}

export const metricsExporter = async () => {
  return await registry.metrics();
};
