import { prisma } from '@/config/database';

export class SecuritySettingsService {
  async get(userId: string) {
    return prisma.securitySettings.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: any) {
    return prisma.securitySettings.upsert({
      where: { userId },
      create: { userId, twoFactorAuth: data.twoFactorAuth || { enabled: false }, passwordPolicy: data.passwordPolicy || {}, loginSecurity: data.loginSecurity || {}, notifications: data.notifications || {} },
      update: { twoFactorAuth: data.twoFactorAuth, passwordPolicy: data.passwordPolicy, loginSecurity: data.loginSecurity, notifications: data.notifications },
    });
  }
}

export const securitySettingsService = new SecuritySettingsService();
