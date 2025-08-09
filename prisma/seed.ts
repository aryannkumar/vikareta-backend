import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';
import { seedCategories } from '../src/scripts/seed-categories';

const prisma = new PrismaClient();

async function main() {
  logger.info('🌱 Starting database seeding...');

  // Seed categories and subcategories
  await seedCategories();

  // Create sample coupons
  await Promise.all([
    prisma.coupon.upsert({
      where: { code: 'WELCOME10' },
      update: {},
      create: {
        code: 'WELCOME10',
        discountType: 'percentage',
        discountValue: 10,
        minOrderAmount: 1000,
        maxDiscount: 500,
        usageLimit: 1000,
        usedCount: 0,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        isActive: true,
      },
    }),
    prisma.coupon.upsert({
      where: { code: 'SAVE500' },
      update: {},
      create: {
        code: 'SAVE500',
        discountType: 'fixed',
        discountValue: 500,
        minOrderAmount: 5000,
        usageLimit: 500,
        usedCount: 0,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        isActive: true,
      },
    }),
  ]);

  logger.info('✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    logger.error('❌ Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });