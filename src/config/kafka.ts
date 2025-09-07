import { Kafka, logLevel } from 'kafkajs';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

const brokers = (process.env.KAFKA_BROKERS || '').split(',').filter(Boolean);

export const kafka = brokers.length
  ? new Kafka({
      clientId: 'vikareta-backend',
      brokers,
      ssl: process.env.KAFKA_SSL === 'true' ? true : undefined,
      sasl: process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD ? {
        mechanism: (process.env.KAFKA_SASL_MECHANISM as any) || 'plain',
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD,
      } : undefined,
      logLevel: logLevel.NOTHING,
    })
  : null;

export const kafkaTopics = {
  AD_IMPRESSION: 'ad_impression',
  AD_CLICK: 'ad_click',
  NOTIFICATION_EVENT: 'notification_event',
  SECURITY_EVENT: 'security_event',
} as const;

export async function ensureKafkaTopics(): Promise<void> {
  if (!kafka) return;
  try {
    const admin = kafka.admin();
    await admin.connect();
    const existing = await admin.listTopics();
    const needed = Object.values(kafkaTopics).filter(t => !existing.includes(t));
    if (needed.length) {
      await admin.createTopics({ topics: needed.map(t => ({ topic: t, numPartitions: 3 })) });
      logger.info(`Kafka topics created: ${needed.join(', ')}`);
    }
    await admin.disconnect();
  } catch (err) {
    logger.error('Error ensuring Kafka topics', err);
  }
}
