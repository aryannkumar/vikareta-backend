"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const logger_1 = require("../src/utils/logger");
const prisma = new client_1.PrismaClient();
async function main() {
    logger_1.logger.info('🌱 Starting database seeding...');
    const categories = await Promise.all([
        prisma.category.upsert({
            where: { slug: 'electronics' },
            update: {},
            create: {
                name: 'Electronics',
                slug: 'electronics',
                description: 'Electronic devices and components',
                isActive: true,
                sortOrder: 1,
            },
        }),
        prisma.category.upsert({
            where: { slug: 'machinery' },
            update: {},
            create: {
                name: 'Machinery',
                slug: 'machinery',
                description: 'Industrial machinery and equipment',
                isActive: true,
                sortOrder: 2,
            },
        }),
        prisma.category.upsert({
            where: { slug: 'textiles' },
            update: {},
            create: {
                name: 'Textiles',
                slug: 'textiles',
                description: 'Textile products and materials',
                isActive: true,
                sortOrder: 3,
            },
        }),
        prisma.category.upsert({
            where: { slug: 'services' },
            update: {},
            create: {
                name: 'Services',
                slug: 'services',
                description: 'Professional and business services',
                isActive: true,
                sortOrder: 4,
            },
        }),
    ]);
    await Promise.all([
        prisma.category.upsert({
            where: { slug: 'mobile-phones' },
            update: {},
            create: {
                name: 'Mobile Phones',
                slug: 'mobile-phones',
                description: 'Smartphones and mobile devices',
                parentId: categories[0]?.id,
                isActive: true,
                sortOrder: 1,
            },
        }),
        prisma.category.upsert({
            where: { slug: 'laptops' },
            update: {},
            create: {
                name: 'Laptops',
                slug: 'laptops',
                description: 'Laptop computers and accessories',
                parentId: categories[0]?.id,
                isActive: true,
                sortOrder: 2,
            },
        }),
        prisma.category.upsert({
            where: { slug: 'construction-machinery' },
            update: {},
            create: {
                name: 'Construction Machinery',
                slug: 'construction-machinery',
                description: 'Heavy construction equipment',
                parentId: categories[1]?.id,
                isActive: true,
                sortOrder: 1,
            },
        }),
        prisma.category.upsert({
            where: { slug: 'consulting' },
            update: {},
            create: {
                name: 'Consulting',
                slug: 'consulting',
                description: 'Business and technical consulting services',
                parentId: categories[3]?.id,
                isActive: true,
                sortOrder: 1,
            },
        }),
    ]);
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
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
                expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                isActive: true,
            },
        }),
    ]);
    logger_1.logger.info('✅ Database seeding completed successfully!');
}
main()
    .catch((e) => {
    logger_1.logger.error('❌ Database seeding failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map