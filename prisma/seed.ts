import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting essential B2B marketplace seeding...');

  // ================================
  // SYSTEM ADMIN USER
  // ================================
  console.log('Creating system admin...');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@vikareta.com' },
    update: {},
    create: {
      email: 'admin@vikareta.com',
      phone: '+919876543210',
      passwordHash: '$2b$10$hashedpasswordforadmin', // In real app, use proper hashing
      firstName: 'System',
      lastName: 'Administrator',
      businessName: 'Vikareta Admin',
      userType: 'admin',
      role: 'super_admin',
      verificationTier: 'verified',
      isVerified: true,
      isActive: true,
      avatar: 'https://storage.vikareta.com/avatars/admin.jpg',
      bio: 'System Administrator for Vikareta B2B Marketplace',
      website: 'https://vikareta.com',
      location: 'Mumbai, India',
      latitude: 19.0760,
      longitude: 72.8777,
      address: '123 Business District, Mumbai, Maharashtra 400001',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '400001',
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      twoFactorBackupCodes: ['12345678', '87654321'],
    },
  });

  // ================================
  // CATEGORIES SEEDING - INDIAN SMALL BUSINESS FOCUS
  // ================================
  console.log('Creating categories for Indian small businesses...');

  const categories = [
    // Essential Daily Business Categories
    { name: 'Kirana & General Store', slug: 'kirana-general-store', icon: '🏪', featured: true, sortOrder: 1 },
    { name: 'Stationery & Books', slug: 'stationery-books', icon: '📚', featured: true, sortOrder: 2 },
    { name: 'Mobile & Accessories', slug: 'mobile-accessories', icon: '📱', featured: true, sortOrder: 3 },
    { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', icon: '💄', featured: true, sortOrder: 4 },
    { name: 'Home & Kitchen', slug: 'home-kitchen', icon: '�', featured: true, sortOrder: 5 },

    // Healthcare & Medical
  { name: 'Pharmacy & Medical', slug: 'pharmacy-medical', icon: '💊', featured: true, sortOrder: 6 },
  { name: 'Ayurvedic & Herbal', slug: 'ayurvedic-herbal', icon: '🌿', featured: false, sortOrder: 7 },

    // Fashion & Lifestyle
  { name: 'Fashion & Clothing', slug: 'fashion-clothing', icon: '👗', featured: true, sortOrder: 8 },
  { name: 'Jewelry & Accessories', slug: 'jewelry-accessories', icon: '💍', featured: false, sortOrder: 9 },
  { name: 'Footwear & Bags', slug: 'footwear-bags', icon: '�', featured: false, sortOrder: 10 },

    // Food & Beverages
  { name: 'Food & Groceries', slug: 'food-groceries', icon: '🛒', featured: true, sortOrder: 11 },
  { name: 'Snacks & Sweets', slug: 'snacks-sweets', icon: '🍬', featured: false, sortOrder: 12 },
  { name: 'Beverages & Drinks', slug: 'beverages-drinks', icon: '🥤', featured: false, sortOrder: 13 },

    // Electronics & Appliances
  { name: 'Electronics & Gadgets', slug: 'electronics-gadgets', icon: '�', featured: true, sortOrder: 14 },
  { name: 'Home Appliances', slug: 'home-appliances', icon: '🧺', featured: false, sortOrder: 15 },

    // Hardware & Construction
  { name: 'Hardware & Tools', slug: 'hardware-tools', icon: '�️', featured: true, sortOrder: 16 },
  { name: 'Building Materials', slug: 'building-materials', icon: '🏗️', featured: false, sortOrder: 17 },
  { name: 'Paints & Hardware', slug: 'paints-hardware', icon: '🎨', featured: false, sortOrder: 18 },

    // Automotive & Transportation
  { name: 'Automotive Parts', slug: 'automotive-parts', icon: '🚗', featured: false, sortOrder: 19 },
  { name: 'Two Wheeler Accessories', slug: 'two-wheeler-accessories', icon: '🏍️', featured: false, sortOrder: 20 },

    // Agriculture & Farming
  { name: 'Agriculture & Seeds', slug: 'agriculture-seeds', icon: '🌾', featured: false, sortOrder: 21 },
  { name: 'Fertilizers & Pesticides', slug: 'fertilizers-pesticides', icon: '🧪', featured: false, sortOrder: 22 },

    // Business & Services
  { name: 'Office Supplies', slug: 'office-supplies', icon: '�️', featured: false, sortOrder: 23 },
  { name: 'Packaging Materials', slug: 'packaging-materials', icon: '📦', featured: false, sortOrder: 24 },
  { name: 'Business Services', slug: 'business-services', icon: '🏢', featured: false, sortOrder: 25 },

    // Specialty Categories
    { name: 'Sports & Fitness', slug: 'sports-fitness', icon: '🏅', featured: false, sortOrder: 26 },
    { name: 'Toys & Games', slug: 'toys-games', icon: '🧸', featured: false, sortOrder: 27 },
    { name: 'Pet Supplies', slug: 'pet-supplies', icon: '🐾', featured: false, sortOrder: 28 },
    { name: 'Religious & Pooja Items', slug: 'religious-pooja-items', icon: '🛕', featured: false, sortOrder: 29 },
    { name: 'Party & Event Supplies', slug: 'party-event-supplies', icon: '🎉', featured: false, sortOrder: 30 },
  ];

  const createdCategories = [];
  for (const category of categories) {
    const created = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { icon: category.icon, featured: category.featured },
      create: category,
    });
    createdCategories.push(created);
  }

  // ================================
  // SUBCATEGORIES SEEDING - INDIAN SMALL BUSINESS FOCUS
  // ================================
  console.log('Creating subcategories for Indian small businesses...');

  const subcategories = [
    // Kirana & General Store (15 subcategories)
    { categoryId: createdCategories[0].id, name: 'Rice & Grains', slug: 'rice-grains', sortOrder: 1 },
    { categoryId: createdCategories[0].id, name: 'Pulses & Lentils', slug: 'pulses-lentils', sortOrder: 2 },
    { categoryId: createdCategories[0].id, name: 'Spices & Masalas', slug: 'spices-masalas', sortOrder: 3 },
    { categoryId: createdCategories[0].id, name: 'Oils & Ghee', slug: 'oils-ghee', sortOrder: 4 },
    { categoryId: createdCategories[0].id, name: 'Sugar & Sweets', slug: 'sugar-sweets', sortOrder: 5 },
    { categoryId: createdCategories[0].id, name: 'Tea & Coffee', slug: 'tea-coffee', sortOrder: 6 },
    { categoryId: createdCategories[0].id, name: 'Cleaning Products', slug: 'cleaning-products', sortOrder: 7 },
    { categoryId: createdCategories[0].id, name: 'Household Items', slug: 'household-items', sortOrder: 8 },
    { categoryId: createdCategories[0].id, name: 'Batteries & Candles', slug: 'batteries-candles', sortOrder: 9 },
    { categoryId: createdCategories[0].id, name: 'Plastic Items', slug: 'plastic-items', sortOrder: 10 },
    { categoryId: createdCategories[0].id, name: 'Paper Products', slug: 'paper-products', sortOrder: 11 },
    { categoryId: createdCategories[0].id, name: 'Tobacco Products', slug: 'tobacco-products', sortOrder: 12 },
    { categoryId: createdCategories[0].id, name: 'Ice Cream & Chocolates', slug: 'ice-cream-chocolates', sortOrder: 13 },
    { categoryId: createdCategories[0].id, name: 'Baby Products', slug: 'baby-products', sortOrder: 14 },
    { categoryId: createdCategories[0].id, name: 'Pet Food & Supplies', slug: 'pet-food-supplies', sortOrder: 15 },

    // Stationery & Books (12 subcategories)
    { categoryId: createdCategories[1].id, name: 'Notebooks & Registers', slug: 'notebooks-registers', sortOrder: 1 },
    { categoryId: createdCategories[1].id, name: 'Pens & Pencils', slug: 'pens-pencils', sortOrder: 2 },
    { categoryId: createdCategories[1].id, name: 'School Bags', slug: 'school-bags', sortOrder: 3 },
    { categoryId: createdCategories[1].id, name: 'Art Supplies', slug: 'art-supplies', sortOrder: 4 },
    { categoryId: createdCategories[1].id, name: 'Office Stationery', slug: 'office-stationery', sortOrder: 5 },
    { categoryId: createdCategories[1].id, name: 'Books & Magazines', slug: 'books-magazines', sortOrder: 6 },
    { categoryId: createdCategories[1].id, name: 'Calendars & Diaries', slug: 'calendars-diaries', sortOrder: 7 },
    { categoryId: createdCategories[1].id, name: 'Files & Folders', slug: 'files-folders', sortOrder: 8 },
    { categoryId: createdCategories[1].id, name: 'Labels & Stickers', slug: 'labels-stickers', sortOrder: 9 },
    { categoryId: createdCategories[1].id, name: 'Calculators', slug: 'calculators', sortOrder: 10 },
    { categoryId: createdCategories[1].id, name: 'White Boards', slug: 'white-boards', sortOrder: 11 },
    { categoryId: createdCategories[1].id, name: 'Teaching Aids', slug: 'teaching-aids', sortOrder: 12 },

    // Mobile & Accessories (10 subcategories)
    { categoryId: createdCategories[2].id, name: 'Mobile Phones', slug: 'mobile-phones', sortOrder: 1 },
    { categoryId: createdCategories[2].id, name: 'Mobile Cases & Covers', slug: 'mobile-cases-covers', sortOrder: 2 },
    { categoryId: createdCategories[2].id, name: 'Screen Protectors', slug: 'screen-protectors', sortOrder: 3 },
    { categoryId: createdCategories[2].id, name: 'Chargers & Cables', slug: 'chargers-cables', sortOrder: 4 },
    { categoryId: createdCategories[2].id, name: 'Headphones & Earphones', slug: 'headphones-earphones', sortOrder: 5 },
    { categoryId: createdCategories[2].id, name: 'Power Banks', slug: 'power-banks', sortOrder: 6 },
    { categoryId: createdCategories[2].id, name: 'Memory Cards', slug: 'memory-cards', sortOrder: 7 },
    { categoryId: createdCategories[2].id, name: 'Mobile Accessories', slug: 'mobile-accessories', sortOrder: 8 },
    { categoryId: createdCategories[2].id, name: 'Smart Watches', slug: 'smart-watches', sortOrder: 9 },
    { categoryId: createdCategories[2].id, name: 'Mobile Repair Parts', slug: 'mobile-repair-parts', sortOrder: 10 },

    // Beauty & Personal Care (15 subcategories)
    { categoryId: createdCategories[3].id, name: 'Soaps & Body Wash', slug: 'soaps-body-wash', sortOrder: 1 },
    { categoryId: createdCategories[3].id, name: 'Shampoos & Conditioners', slug: 'shampoos-conditioners', sortOrder: 2 },
    { categoryId: createdCategories[3].id, name: 'Face Creams & Lotions', slug: 'face-creams-lotions', sortOrder: 3 },
    { categoryId: createdCategories[3].id, name: 'Hair Oils & Serums', slug: 'hair-oils-serums', sortOrder: 4 },
    { categoryId: createdCategories[3].id, name: 'Deodorants & Perfumes', slug: 'deodorants-perfumes', sortOrder: 5 },
    { categoryId: createdCategories[3].id, name: 'Lipsticks & Makeup', slug: 'lipsticks-makeup', sortOrder: 6 },
    { categoryId: createdCategories[3].id, name: 'Nail Polish & Care', slug: 'nail-polish-care', sortOrder: 7 },
    { categoryId: createdCategories[3].id, name: 'Feminine Hygiene', slug: 'feminine-hygiene', sortOrder: 8 },
    { categoryId: createdCategories[3].id, name: 'Men\'s Grooming', slug: 'mens-grooming', sortOrder: 9 },
    { categoryId: createdCategories[3].id, name: 'Hair Colors & Dyes', slug: 'hair-colors-dyes', sortOrder: 10 },
    { categoryId: createdCategories[3].id, name: 'Skin Care Products', slug: 'skin-care-products', sortOrder: 11 },
    { categoryId: createdCategories[3].id, name: 'Oral Care', slug: 'oral-care', sortOrder: 12 },
    { categoryId: createdCategories[3].id, name: 'Baby Care Products', slug: 'baby-care-products', sortOrder: 13 },
    { categoryId: createdCategories[3].id, name: 'Sunscreen & Tanning', slug: 'sunscreen-tanning', sortOrder: 14 },
    { categoryId: createdCategories[3].id, name: 'Beauty Tools', slug: 'beauty-tools', sortOrder: 15 },

    // Home & Kitchen (12 subcategories)
    { categoryId: createdCategories[4].id, name: 'Kitchen Utensils', slug: 'kitchen-utensils', sortOrder: 1 },
    { categoryId: createdCategories[4].id, name: 'Cookware & Containers', slug: 'cookware-containers', sortOrder: 2 },
    { categoryId: createdCategories[4].id, name: 'Dinnerware & Crockery', slug: 'dinnerware-crockery', sortOrder: 3 },
    { categoryId: createdCategories[4].id, name: 'Glassware & Tumblers', slug: 'glassware-tumblers', sortOrder: 4 },
    { categoryId: createdCategories[4].id, name: 'Home Decor Items', slug: 'home-decor-items', sortOrder: 5 },
    { categoryId: createdCategories[4].id, name: 'Bedding & Linens', slug: 'bedding-linens', sortOrder: 6 },
    { categoryId: createdCategories[4].id, name: 'Curtains & Blinds', slug: 'curtains-blinds', sortOrder: 7 },
    { categoryId: createdCategories[4].id, name: 'Furniture Items', slug: 'furniture-items', sortOrder: 8 },
    { categoryId: createdCategories[4].id, name: 'Cleaning Supplies', slug: 'cleaning-supplies', sortOrder: 9 },
    { categoryId: createdCategories[4].id, name: 'Storage Solutions', slug: 'storage-solutions', sortOrder: 10 },
    { categoryId: createdCategories[4].id, name: 'Bathroom Accessories', slug: 'bathroom-accessories', sortOrder: 11 },
    { categoryId: createdCategories[4].id, name: 'Home Repair Tools', slug: 'home-repair-tools', sortOrder: 12 },

    // Pharmacy & Medical (10 subcategories)
    { categoryId: createdCategories[5].id, name: 'Medicines & Tablets', slug: 'medicines-tablets', sortOrder: 1 },
    { categoryId: createdCategories[5].id, name: 'First Aid Supplies', slug: 'first-aid-supplies', sortOrder: 2 },
    { categoryId: createdCategories[5].id, name: 'Health Supplements', slug: 'health-supplements', sortOrder: 3 },
    { categoryId: createdCategories[5].id, name: 'Medical Equipment', slug: 'medical-equipment', sortOrder: 4 },
    { categoryId: createdCategories[5].id, name: 'Baby Care Medicines', slug: 'baby-care-medicines', sortOrder: 5 },
    { categoryId: createdCategories[5].id, name: 'Women\'s Health', slug: 'womens-health', sortOrder: 6 },
    { categoryId: createdCategories[5].id, name: 'Diabetes Care', slug: 'diabetes-care', sortOrder: 7 },
    { categoryId: createdCategories[5].id, name: 'Orthopedic Products', slug: 'orthopedic-products', sortOrder: 8 },
    { categoryId: createdCategories[5].id, name: 'Surgical Items', slug: 'surgical-items', sortOrder: 9 },
    { categoryId: createdCategories[5].id, name: 'Medical Devices', slug: 'medical-devices', sortOrder: 10 },

    // Ayurvedic & Herbal (8 subcategories)
    { categoryId: createdCategories[6].id, name: 'Herbal Medicines', slug: 'herbal-medicines', sortOrder: 1 },
    { categoryId: createdCategories[6].id, name: 'Ayurvedic Oils', slug: 'ayurvedic-oils', sortOrder: 2 },
    { categoryId: createdCategories[6].id, name: 'Herbal Teas', slug: 'herbal-teas', sortOrder: 3 },
    { categoryId: createdCategories[6].id, name: 'Natural Supplements', slug: 'natural-supplements', sortOrder: 4 },
    { categoryId: createdCategories[6].id, name: 'Herbal Cosmetics', slug: 'herbal-cosmetics', sortOrder: 5 },
    { categoryId: createdCategories[6].id, name: 'Traditional Remedies', slug: 'traditional-remedies', sortOrder: 6 },
    { categoryId: createdCategories[6].id, name: 'Herbal Powders', slug: 'herbal-powders', sortOrder: 7 },
    { categoryId: createdCategories[6].id, name: 'Ayurvedic Products', slug: 'ayurvedic-products', sortOrder: 8 },

    // Fashion & Clothing (12 subcategories)
    { categoryId: createdCategories[7].id, name: 'Men\'s Clothing', slug: 'mens-clothing', sortOrder: 1 },
    { categoryId: createdCategories[7].id, name: 'Women\'s Clothing', slug: 'womens-clothing', sortOrder: 2 },
    { categoryId: createdCategories[7].id, name: 'Kids Clothing', slug: 'kids-clothing', sortOrder: 3 },
    { categoryId: createdCategories[7].id, name: 'Traditional Wear', slug: 'traditional-wear', sortOrder: 4 },
    { categoryId: createdCategories[7].id, name: 'Inner Wear', slug: 'inner-wear', sortOrder: 5 },
    { categoryId: createdCategories[7].id, name: 'Winter Wear', slug: 'winter-wear', sortOrder: 6 },
    { categoryId: createdCategories[7].id, name: 'Party Wear', slug: 'party-wear', sortOrder: 7 },
    { categoryId: createdCategories[7].id, name: 'Uniforms', slug: 'uniforms', sortOrder: 8 },
    { categoryId: createdCategories[7].id, name: 'Sportswear', slug: 'sportswear', sortOrder: 9 },
    { categoryId: createdCategories[7].id, name: 'Fabrics & Materials', slug: 'fabrics-materials', sortOrder: 10 },
    { categoryId: createdCategories[7].id, name: 'Tailoring Materials', slug: 'tailoring-materials', sortOrder: 11 },
    { categoryId: createdCategories[7].id, name: 'Fashion Accessories', slug: 'fashion-accessories', sortOrder: 12 },

    // Food & Groceries (10 subcategories)
    { categoryId: createdCategories[10].id, name: 'Fresh Vegetables', slug: 'fresh-vegetables', sortOrder: 1 },
    { categoryId: createdCategories[10].id, name: 'Fresh Fruits', slug: 'fresh-fruits', sortOrder: 2 },
    { categoryId: createdCategories[10].id, name: 'Dairy Products', slug: 'dairy-products', sortOrder: 3 },
    { categoryId: createdCategories[10].id, name: 'Meat & Poultry', slug: 'meat-poultry', sortOrder: 4 },
    { categoryId: createdCategories[10].id, name: 'Seafood', slug: 'seafood', sortOrder: 5 },
    { categoryId: createdCategories[10].id, name: 'Bakery Items', slug: 'bakery-items', sortOrder: 6 },
    { categoryId: createdCategories[10].id, name: 'Frozen Foods', slug: 'frozen-foods', sortOrder: 7 },
    { categoryId: createdCategories[10].id, name: 'Organic Foods', slug: 'organic-foods', sortOrder: 8 },
    { categoryId: createdCategories[10].id, name: 'Dry Fruits & Nuts', slug: 'dry-fruits-nuts', sortOrder: 9 },
    { categoryId: createdCategories[10].id, name: 'Ready to Eat', slug: 'ready-to-eat', sortOrder: 10 },

    // Electronics & Gadgets (8 subcategories)
    { categoryId: createdCategories[13].id, name: 'Televisions', slug: 'televisions', sortOrder: 1 },
    { categoryId: createdCategories[13].id, name: 'Washing Machines', slug: 'washing-machines', sortOrder: 2 },
    { categoryId: createdCategories[13].id, name: 'Refrigerators', slug: 'refrigerators', sortOrder: 3 },
    { categoryId: createdCategories[13].id, name: 'Air Conditioners', slug: 'air-conditioners', sortOrder: 4 },
    { categoryId: createdCategories[13].id, name: 'Fans & Coolers', slug: 'fans-coolers', sortOrder: 5 },
    { categoryId: createdCategories[13].id, name: 'Water Heaters', slug: 'water-heaters', sortOrder: 6 },
    { categoryId: createdCategories[13].id, name: 'Small Appliances', slug: 'small-appliances', sortOrder: 7 },
    { categoryId: createdCategories[13].id, name: 'Electronic Accessories', slug: 'electronic-accessories', sortOrder: 8 },

    // Hardware & Tools (10 subcategories)
    { categoryId: createdCategories[15].id, name: 'Hand Tools', slug: 'hand-tools', sortOrder: 1 },
    { categoryId: createdCategories[15].id, name: 'Power Tools', slug: 'power-tools', sortOrder: 2 },
    { categoryId: createdCategories[15].id, name: 'Plumbing Tools', slug: 'plumbing-tools', sortOrder: 3 },
    { categoryId: createdCategories[15].id, name: 'Electrical Tools', slug: 'electrical-tools', sortOrder: 4 },
    { categoryId: createdCategories[15].id, name: 'Carpentry Tools', slug: 'carpentry-tools', sortOrder: 5 },
    { categoryId: createdCategories[15].id, name: 'Paint Tools', slug: 'paint-tools', sortOrder: 6 },
    { categoryId: createdCategories[15].id, name: 'Safety Equipment', slug: 'safety-equipment', sortOrder: 7 },
    { categoryId: createdCategories[15].id, name: 'Fasteners & Nails', slug: 'fasteners-nails', sortOrder: 8 },
    { categoryId: createdCategories[15].id, name: 'Locks & Security', slug: 'locks-security', sortOrder: 9 },
    { categoryId: createdCategories[15].id, name: 'Hardware Accessories', slug: 'hardware-accessories', sortOrder: 10 },
  ];

  for (const subcategory of subcategories) {
    await prisma.subcategory.upsert({
      where: { slug: subcategory.slug },
      update: {},
      create: subcategory,
    });
  }

  // ================================
  // COUPONS SEEDING
  // ================================
  console.log('Creating coupons...');

  const coupons = [
    {
      userId: adminUser.id,
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 1000,
      maxDiscount: 500,
      usageLimit: 1000,
      usedCount: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      isActive: true,
    },
    {
      userId: adminUser.id,
      code: 'BULK20',
      discountType: 'percentage',
      discountValue: 20,
      minOrderAmount: 10000,
      maxDiscount: 2000,
      usageLimit: 500,
      usedCount: 0,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      isActive: true,
    },
    {
      userId: adminUser.id,
      code: 'SAVE1000',
      discountType: 'fixed',
      discountValue: 1000,
      minOrderAmount: 50000,
      usageLimit: 200,
      usedCount: 0,
      expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
      isActive: true,
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: coupon,
    });
  }

  // ================================
  // NOTIFICATION TEMPLATES SEEDING
  // ================================
  console.log('Creating notification templates...');

  const notificationTemplates = [
    {
      name: 'Order Confirmation',
      subject: 'Order Confirmed - {{orderNumber}}',
      content: 'Dear {{buyerName}}, your order {{orderNumber}} has been confirmed. Total amount: ₹{{totalAmount}}',
      type: 'order',
      channel: 'email',
      variables: ['buyerName', 'orderNumber', 'totalAmount'],
      isActive: true,
    },
    {
      name: 'Quote Received',
      subject: 'New Quote Received for Your RFQ',
      content: 'Hello {{buyerName}}, you have received a new quote for your RFQ {{rfqTitle}} from {{sellerName}}',
      type: 'quote',
      channel: 'email',
      variables: ['buyerName', 'rfqTitle', 'sellerName'],
      isActive: true,
    },
    {
      name: 'Payment Reminder',
      subject: 'Payment Due for Order {{orderNumber}}',
      content: 'Dear {{buyerName}}, payment is due for your order {{orderNumber}}. Amount: ₹{{amount}}',
      type: 'payment',
      channel: 'email',
      variables: ['buyerName', 'orderNumber', 'amount'],
      isActive: true,
    },
  ];

  for (const template of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { name: template.name },
      update: {},
      create: template,
    });
  }

  // ================================
  // DELIVERY PARTNERS SEEDING
  // ================================
  console.log('Creating delivery partners...');

  const deliveryPartners = [
    {
      name: 'Delhivery',
      code: 'DELHIVERY',
      apiEndpoint: 'https://track.delhivery.com/api/v1/packages/json/',
      supportedServices: ['standard', 'express', 'overnight'],
      serviceAreas: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Pune'],
      isActive: true,
      priority: 1,
      rateCard: {
        standard: { baseRate: 50, perKg: 20 },
        express: { baseRate: 100, perKg: 40 },
        overnight: { baseRate: 200, perKg: 80 }
      },
      contactInfo: {
        phone: '+91-9876543210',
        email: 'support@delhivery.com',
        website: 'https://www.delhivery.com'
      },
    },
    {
      name: 'Blue Dart',
      code: 'BLUEDART',
      apiEndpoint: 'https://www.bluedart.com/api/v1/track',
      supportedServices: ['standard', 'express', 'priority'],
      serviceAreas: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'],
      isActive: true,
      priority: 2,
      rateCard: {
        standard: { baseRate: 60, perKg: 25 },
        express: { baseRate: 120, perKg: 50 },
        priority: { baseRate: 250, perKg: 100 }
      },
      contactInfo: {
        phone: '+91-9876543211',
        email: 'support@bluedart.com',
        website: 'https://www.bluedart.com'
      },
    },
  ];

  for (const partner of deliveryPartners) {
    await prisma.deliveryPartner.upsert({
      where: { code: partner.code },
      update: {},
      create: partner,
    });
  }

  console.log('✅ Essential B2B marketplace seeding completed successfully!');
  console.log(`👤 Created system admin user`);
  console.log(`📂 Created ${categories.length} categories`);
  console.log(`🏷️  Created ${subcategories.length} subcategories`);
  console.log(`🎫 Created ${coupons.length} promotional coupons`);
  console.log(`📧 Created ${notificationTemplates.length} notification templates`);
  console.log(`🚚 Created ${deliveryPartners.length} delivery partners`);
  console.log(`\n📝 Note: Products, services, orders, and user-generated content will be created by business users through the application.`);

  // ================================
  // USER PREFERENCES SEEDING
  // ================================
  console.log('Creating user preferences for personalization...');

  const userPreferences = [
    {
      userId: adminUser.id,
      preferredCategories: [createdCategories[0].id, createdCategories[1].id, createdCategories[2].id], // Electronics, Stationery, Mobile
      preferredSubcategories: [], // Will be populated based on user behavior
      minPriceRange: 100,
      maxPriceRange: 100000,
      preferredPriceRange: 'mid-range',
      preferredLocations: ['Mumbai', 'Delhi', 'Bangalore'],
      deliveryRadius: 500,
      preferredBusinessTypes: ['manufacturer', 'wholesaler'],
      preferredIndustries: ['Electronics', 'Education', 'Retail'],
      theme: 'light',
      language: 'en',
      currency: 'INR',
      itemsPerPage: 20,
      emailFrequency: 'daily',
      smsFrequency: 'important',
      showRecommended: true,
      showTrending: true,
      showNearby: true,
      showNewArrivals: true,
      profileVisibility: 'public',
      showOnlineStatus: true,
      allowMessaging: true,
    },
  ];

  for (const preference of userPreferences) {
    await prisma.userPreference.upsert({
      where: { userId: preference.userId },
      update: {},
      create: preference,
    });
  }

  // ================================
  // CATEGORY PREFERENCES SEEDING
  // ================================
  console.log('Creating category preferences...');

  const categoryPreferences = [
    {
      userId: adminUser.id,
      categoryId: createdCategories[0].id, // Kirana & General Store
      viewCount: 25,
      clickCount: 8,
      purchaseCount: 3,
      searchCount: 12,
      preferenceScore: 0.85,
      firstViewed: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      lastViewed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      lastPurchased: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
    },
    {
      userId: adminUser.id,
      categoryId: createdCategories[1].id, // Stationery & Books
      viewCount: 18,
      clickCount: 12,
      purchaseCount: 5,
      searchCount: 8,
      preferenceScore: 0.92,
      firstViewed: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      lastViewed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      lastPurchased: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
    },
    {
      userId: adminUser.id,
      categoryId: createdCategories[2].id, // Mobile & Accessories
      viewCount: 32,
      clickCount: 15,
      purchaseCount: 7,
      searchCount: 20,
      preferenceScore: 0.78,
      firstViewed: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      lastViewed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      lastPurchased: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), // 12 days ago
    },
  ];

  for (const preference of categoryPreferences) {
    await prisma.categoryPreference.upsert({
      where: {
        userId_categoryId: {
          userId: preference.userId,
          categoryId: preference.categoryId,
        },
      },
      update: {},
      create: preference,
    });
  }

  // ================================
  // USER INTERESTS SEEDING
  // ================================
  console.log('Creating user interests...');

  const userInterests = [
    {
      userId: adminUser.id,
      interestType: 'category',
      interestValue: 'Kirana & General Store',
      strength: 0.85,
      confidence: 0.8,
      source: 'behavior',
      firstObserved: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lastObserved: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      observationCount: 25,
      isActive: true,
    },
    {
      userId: adminUser.id,
      interestType: 'industry',
      interestValue: 'Retail',
      strength: 0.75,
      confidence: 0.7,
      source: 'explicit',
      firstObserved: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      lastObserved: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      observationCount: 15,
      isActive: true,
    },
    {
      userId: adminUser.id,
      interestType: 'location',
      interestValue: 'Mumbai',
      strength: 0.9,
      confidence: 0.85,
      source: 'demographic',
      firstObserved: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      lastObserved: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      observationCount: 35,
      isActive: true,
    },
    {
      userId: adminUser.id,
      interestType: 'price_range',
      interestValue: 'mid-range',
      strength: 0.7,
      confidence: 0.6,
      source: 'behavior',
      firstObserved: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      lastObserved: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      observationCount: 18,
      isActive: true,
    },
  ];

  for (const interest of userInterests) {
    await prisma.userInterest.upsert({
      where: {
        userId_interestType_interestValue: {
          userId: interest.userId,
          interestType: interest.interestType,
          interestValue: interest.interestValue,
        },
      },
      update: {},
      create: interest,
    });
  }

  // ================================
  // TRENDING CATEGORIES SEEDING
  // ================================
  console.log('Creating trending categories...');

  const trendingCategories = [
    {
      categoryId: createdCategories[0].id, // Kirana & General Store
      viewCount: 1250,
      searchCount: 890,
      orderCount: 145,
      trendingScore: 8.5,
      growthRate: 15.2,
      period: 'weekly',
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    },
    {
      categoryId: createdCategories[1].id, // Stationery & Books
      viewCount: 980,
      searchCount: 675,
      orderCount: 98,
      trendingScore: 7.2,
      growthRate: 12.8,
      period: 'weekly',
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    },
    {
      categoryId: createdCategories[2].id, // Mobile & Accessories
      viewCount: 1450,
      searchCount: 1200,
      orderCount: 203,
      trendingScore: 9.1,
      growthRate: 18.5,
      period: 'weekly',
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    },
  ];

  for (const trending of trendingCategories) {
    await prisma.trendingCategory.upsert({
      where: {
        categoryId_period_periodStart: {
          categoryId: trending.categoryId,
          period: trending.period,
          periodStart: trending.periodStart,
        },
      },
      update: {},
      create: trending,
    });
  }

  console.log('✅ Personalization system seeding completed!');
  console.log(`👤 Created ${userPreferences.length} user preference profiles`);
  console.log(`📊 Created ${categoryPreferences.length} category preferences`);
  console.log(`🎯 Created ${userInterests.length} user interests`);
  console.log(`📈 Created ${trendingCategories.length} trending categories`);
  console.log(`\n🎉 Vikareta B2B Marketplace is now ready with personalized experiences!`);
}

main()
  .catch((e) => {
    console.error('❌ Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });