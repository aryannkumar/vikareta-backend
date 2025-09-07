import crypto from 'crypto';
import { BaseService } from '@/services/base.service';

interface SSOTokenData {
  userId: string;
  targetApp: string;
  createdAt: number;
}

export class SSOService extends BaseService {
  private ttlSeconds = 120; // 2 minutes validity
  private prefix = 'sso';

  async createToken(userId: string, targetApp: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const data: SSOTokenData = { userId, targetApp, createdAt: Date.now() };
    await this.cache.setex(`${this.prefix}:${token}`, this.ttlSeconds, data);
    this.logOperation('sso.createToken', { userId, targetApp });
    return token;
  }

  async exchange(token: string) {
    const key = `${this.prefix}:${token}`;
    const data = await this.cache.get<SSOTokenData>(key);
    if (!data) {
      throw new Error('Invalid or expired SSO token');
    }
    // one-time use
    await this.cache.del(key);
    this.logOperation('sso.exchange', { userId: data.userId, targetApp: data.targetApp });
    return data;
  }
}

export const ssoService = new SSOService();
