import { kafka, kafkaTopics } from '@/config/kafka';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';
import { adAnalyticsService } from './ad-analytics.service';
import { kafkaMessagesConsumedCounter } from '@/observability/metrics';

type Handler = (payload: any) => Promise<void>;

class KafkaConsumerService {
  private handlers: Record<string, Handler[]> = {};
  private started = false;

  register(topic: string, handler: Handler) {
    if (!this.handlers[topic]) this.handlers[topic] = [];
    this.handlers[topic].push(handler);
  }

  async start(): Promise<void> {
    if (this.started || !kafka) return;
    this.started = true;
    const consumer = kafka.consumer({ groupId: 'vikareta-consumers' });
    await consumer.connect();
    const topics = Object.values(kafkaTopics);
    for (const t of topics) await consumer.subscribe({ topic: t, fromBeginning: false });

    // Built-in handlers for ad impression and click topics if user code hasn't registered overrides
    if (!this.handlers[kafkaTopics.AD_IMPRESSION]) {
      this.register(kafkaTopics.AD_IMPRESSION, async (payload) => {
        const { adId, campaignId } = payload;
        if (!adId) return;
        try {
          // Persist raw impression record lazily (can be expanded later)
          await prisma.impressionRecord.create({ data: { advertisementId: adId } });
          if (campaignId) await adAnalyticsService.incrementImpression(campaignId);
        } catch (err) {
          logger.warn('Impression handler failed', err);
        }
      });
    }
    if (!this.handlers[kafkaTopics.AD_CLICK]) {
      this.register(kafkaTopics.AD_CLICK, async (payload) => {
        const { adId, campaignId } = payload;
        if (!adId) return;
        try {
          await prisma.clickRecord.create({ data: { advertisementId: adId } });
          if (campaignId) await adAnalyticsService.incrementClick(campaignId);
        } catch (err) {
          logger.warn('Click handler failed', err);
        }
      });
    }
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const v = message.value?.toString();
          if (!v) return;
          const payload = JSON.parse(v);
          kafkaMessagesConsumedCounter.inc({ topic });
          const hs = this.handlers[topic] || [];
          for (const h of hs) {
            // eslint-disable-next-line no-await-in-loop
            await h(payload);
          }
        } catch (err) {
          logger.error('Kafka consumer handler error', err);
        }
      },
    });
    logger.info('Kafka consumer started');
  }
}

export const kafkaConsumer = new KafkaConsumerService();
