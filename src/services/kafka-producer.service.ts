import { kafka, kafkaTopics } from '@/config/kafka';
import { logger } from '@/utils/logger';
import { securityEventsCounter } from '@/observability/metrics';

class KafkaProducerService {
  private ready = false;
  private connecting: Promise<void> | null = null;
  private producer: any;

  private async init(): Promise<void> {
    if (!kafka) return;
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const producer = kafka.producer();
        await producer.connect();
        this.producer = producer;
        this.ready = true;
      } catch (err) {
        logger.error('Kafka producer init error', err);
      }
    })();
    return this.connecting;
  }

  async emit(topic: string, payload: Record<string, any>): Promise<void> {
    if (!kafka) return;
    await this.init();
    if (!this.ready) return;
    try {
      await this.producer.send({ topic, messages: [{ value: JSON.stringify({ ...payload, ts: Date.now() }) }] });
    } catch (err) {
      logger.error(`Kafka emit error topic=${topic}`, err);
    }
  }

  adImpression(data: { adId: string; campaignId?: string }) { return this.emit(kafkaTopics.AD_IMPRESSION, data); }
  adClick(data: { adId: string; campaignId?: string }) { return this.emit(kafkaTopics.AD_CLICK, data); }
  securityEvent(data: { userId: string; type: string; ip?: string; userAgent?: string }) {
    securityEventsCounter.inc({ eventType: data.type });
    return this.emit(kafkaTopics.SECURITY_EVENT, data);
  }
}

export const kafkaProducer = new KafkaProducerService();
