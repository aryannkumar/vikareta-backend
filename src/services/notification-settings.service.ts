import { prisma } from '@/config/database';

// Mapping helper: derive (channel, type) pairs from settings JSON structure.
// For now we treat generic categories and map them to individual types.
// This can be extended as product grows.
function expandSettingsToPreferences(userId: string, settings: any) {
  const rows: { userId: string; channel: string; type: string; enabled: boolean }[] = [];
  const pushPref = (channel: string, type: string, enabled: boolean) => {
    rows.push({ userId, channel, type, enabled });
  };
  const channels: Record<string, any> = {
    email: settings.email,
    sms: settings.sms,
    push: settings.push,
    in_app: settings.inApp,
  };
  const defaultTypes = ['general','marketing','order_update','payment','system'];
  for (const [channel, cfg] of Object.entries(channels)) {
    if (!cfg) continue;
    const enabled = cfg.enabled !== false; // default true
    const categories: string[] = Array.isArray(cfg.categories) && cfg.categories.length ? cfg.categories : defaultTypes;
    for (const cat of categories) {
      pushPref(channel === 'in_app' ? 'in_app' : channel, cat, enabled);
    }
  }
  return rows;
}

export class NotificationSettingsService {
  async get(userId: string) { return prisma.notificationSettings.findUnique({ where: { userId } }); }
  async upsert(userId: string, data: any) {
    // Persist settings first
    const saved = await prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, email: data.email || {}, sms: data.sms || {}, push: data.push || {}, inApp: data.inApp || {}, schedule: data.schedule || {}, preferences: data.preferences || {} },
      update: { email: data.email, sms: data.sms, push: data.push, inApp: data.inApp, schedule: data.schedule, preferences: data.preferences },
    });

    // Materialize preferences in a transaction for atomicity
    const prefRows = expandSettingsToPreferences(userId, saved);
    await prisma.$transaction(async tx => {
      // Fetch existing preference keys
      const existing = await tx.notificationPreference.findMany({ where: { userId }, select: { channel: true, type: true } });
      const existingSet = new Set(existing.map(e => `${e.channel}:${e.type}`));
      const incomingSet = new Set(prefRows.map(r => `${r.channel}:${r.type}`));

      // Upsert incoming rows
      for (const r of prefRows) {
        await tx.notificationPreference.upsert({
          where: { userId_channel_type: { userId, channel: r.channel, type: r.type } },
          update: { enabled: r.enabled },
          create: { userId, channel: r.channel, type: r.type, enabled: r.enabled },
        });
      }
      // Disable preferences not present anymore (soft disable instead of delete for auditability)
      const toDisable = [...existingSet].filter(k => !incomingSet.has(k));
      if (toDisable.length) {
        for (const key of toDisable) {
          const [channel, type] = key.split(':');
          await tx.notificationPreference.update({
            where: { userId_channel_type: { userId, channel, type } },
            data: { enabled: false },
          }).catch(() => {/* ignore if race created new */});
        }
      }
    });
    return saved;
  }
}
export const notificationSettingsService = new NotificationSettingsService();
