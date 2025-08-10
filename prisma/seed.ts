import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive B2B marketplace seeding...');

  // Comprehensive B2B Categories with Icons
  const categories = [
    // Manufacturing & Industrial
    { id: 'electronics', name: 'Electronics & Electrical', slug: 'electronics-electrical', icon: '⚡', featured: true, sortOrder: 1 },
    { id: 'machinery', name: 'Machinery & Equipment', slug: 'machinery-equipment', icon: '🏭', featured: true, sortOrder: 2 },
    { id: 'automotive', name: 'Automotive & Transportation', slug: 'automotive-transportation', icon: '🚗', featured: true, sortOrder: 3 },
    { id: 'construction', name: 'Construction & Building Materials', slug: 'construction-building', icon: '🏗️', featured: true, sortOrder: 4 },
    { id: 'chemicals', name: 'Chemicals & Materials', slug: 'chemicals-materials', icon: '🧪', featured: true, sortOrder: 5 },

    // Textiles & Consumer Goods
    { id: 'textiles', name: 'Textiles & Apparel', slug: 'textiles-apparel', icon: '👕', featured: true, sortOrder: 6 },
    { id: 'food-beverages', name: 'Food & Beverages', slug: 'food-beverages', icon: '🍎', featured: true, sortOrder: 7 },
    { id: 'packaging', name: 'Packaging & Printing', slug: 'packaging-printing', icon: '📦', featured: false, sortOrder: 8 },
    { id: 'furniture', name: 'Furniture & Home Decor', slug: 'furniture-home-decor', icon: '🪑', featured: false, sortOrder: 9 },
    { id: 'sports-recreation', name: 'Sports & Recreation', slug: 'sports-recreation', icon: '⚽', featured: false, sortOrder: 10 },

    // Healthcare & Medical
    { id: 'medical', name: 'Medical & Healthcare', slug: 'medical-healthcare', icon: '🏥', featured: false, sortOrder: 11 },
    { id: 'pharmaceuticals', name: 'Pharmaceuticals & Drugs', slug: 'pharmaceuticals-drugs', icon: '💊', featured: false, sortOrder: 12 },
    { id: 'laboratory', name: 'Laboratory & Scientific', slug: 'laboratory-scientific', icon: '🔬', featured: false, sortOrder: 13 },

    // Agriculture & Environment
    { id: 'agriculture', name: 'Agriculture & Farming', slug: 'agriculture-farming', icon: '🌾', featured: false, sortOrder: 14 },
    { id: 'environment', name: 'Environment & Waste Management', slug: 'environment-waste', icon: '♻️', featured: false, sortOrder: 15 },
    { id: 'energy', name: 'Energy & Power', slug: 'energy-power', icon: '⚡', featured: false, sortOrder: 16 },

    // Services & Business
    { id: 'business-services', name: 'Business Services', slug: 'business-services', icon: '💼', featured: false, sortOrder: 17 },
    { id: 'logistics', name: 'Logistics & Transportation', slug: 'logistics-transportation', icon: '🚛', featured: false, sortOrder: 18 },
    { id: 'security', name: 'Security & Safety', slug: 'security-safety', icon: '🛡️', featured: false, sortOrder: 19 },
    { id: 'office-supplies', name: 'Office & Stationery', slug: 'office-stationery', icon: '📝', featured: false, sortOrder: 20 },
  ];

  console.log('Creating categories...');
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {},
      create: category,
    });
  }

  // Comprehensive Subcategories (100+ subcategories)
  const subcategories = [
    // Electronics & Electrical (20 subcategories)
    { id: 'mobile-phones', categoryId: 'electronics', name: 'Mobile Phones & Accessories', slug: 'mobile-phones-accessories', sortOrder: 1 },
    { id: 'computers-laptops', categoryId: 'electronics', name: 'Computers & Laptops', slug: 'computers-laptops', sortOrder: 2 },
    { id: 'electronic-components', categoryId: 'electronics', name: 'Electronic Components', slug: 'electronic-components', sortOrder: 3 },
    { id: 'cables-wires', categoryId: 'electronics', name: 'Cables & Wires', slug: 'cables-wires', sortOrder: 4 },
    { id: 'batteries', categoryId: 'electronics', name: 'Batteries & Power Supplies', slug: 'batteries-power-supplies', sortOrder: 5 },
    { id: 'lighting', categoryId: 'electronics', name: 'LED & Lighting Solutions', slug: 'led-lighting-solutions', sortOrder: 6 },
    { id: 'electrical-panels', categoryId: 'electronics', name: 'Electrical Panels & Switchgear', slug: 'electrical-panels-switchgear', sortOrder: 7 },
    { id: 'transformers', categoryId: 'electronics', name: 'Transformers & Motors', slug: 'transformers-motors', sortOrder: 8 },
    { id: 'generators', categoryId: 'electronics', name: 'Generators & UPS', slug: 'generators-ups', sortOrder: 9 },
    { id: 'solar-equipment', categoryId: 'electronics', name: 'Solar & Renewable Energy', slug: 'solar-renewable-energy', sortOrder: 10 },
    { id: 'cctv-security', categoryId: 'electronics', name: 'CCTV & Security Systems', slug: 'cctv-security-systems', sortOrder: 11 },
    { id: 'audio-video', categoryId: 'electronics', name: 'Audio & Video Equipment', slug: 'audio-video-equipment', sortOrder: 12 },
    { id: 'home-appliances', categoryId: 'electronics', name: 'Home & Kitchen Appliances', slug: 'home-kitchen-appliances', sortOrder: 13 },
    { id: 'air-conditioning', categoryId: 'electronics', name: 'Air Conditioning & Refrigeration', slug: 'air-conditioning-refrigeration', sortOrder: 14 },
    { id: 'electrical-tools', categoryId: 'electronics', name: 'Electrical Tools & Instruments', slug: 'electrical-tools-instruments', sortOrder: 15 },
    { id: 'pcb-circuit-boards', categoryId: 'electronics', name: 'PCB & Circuit Boards', slug: 'pcb-circuit-boards', sortOrder: 16 },
    { id: 'semiconductors', categoryId: 'electronics', name: 'Semiconductors & ICs', slug: 'semiconductors-ics', sortOrder: 17 },
    { id: 'connectors', categoryId: 'electronics', name: 'Connectors & Terminals', slug: 'connectors-terminals', sortOrder: 18 },
    { id: 'sensors', categoryId: 'electronics', name: 'Sensors & Automation', slug: 'sensors-automation', sortOrder: 19 },
    { id: 'telecom-equipment', categoryId: 'electronics', name: 'Telecom & Networking', slug: 'telecom-networking', sortOrder: 20 },

    // Machinery & Equipment (15 subcategories)
    { id: 'industrial-machines', categoryId: 'machinery', name: 'Industrial Manufacturing Machines', slug: 'industrial-manufacturing-machines', sortOrder: 1 },
    { id: 'cnc-machines', categoryId: 'machinery', name: 'CNC & Machining Centers', slug: 'cnc-machining-centers', sortOrder: 2 },
    { id: 'textile-machines', categoryId: 'machinery', name: 'Textile & Garment Machines', slug: 'textile-garment-machines', sortOrder: 3 },
    { id: 'printing-machines', categoryId: 'machinery', name: 'Printing & Packaging Machines', slug: 'printing-packaging-machines', sortOrder: 4 },
    { id: 'food-processing', categoryId: 'machinery', name: 'Food Processing Equipment', slug: 'food-processing-equipment', sortOrder: 5 },
    { id: 'plastic-machines', categoryId: 'machinery', name: 'Plastic & Rubber Machines', slug: 'plastic-rubber-machines', sortOrder: 6 },
    { id: 'woodworking-machines', categoryId: 'machinery', name: 'Woodworking Machines', slug: 'woodworking-machines', sortOrder: 7 },
    { id: 'metal-working', categoryId: 'machinery', name: 'Metal Working & Fabrication', slug: 'metal-working-fabrication', sortOrder: 8 },
    { id: 'pumps-compressors', categoryId: 'machinery', name: 'Pumps & Compressors', slug: 'pumps-compressors', sortOrder: 9 },
    { id: 'conveyor-systems', categoryId: 'machinery', name: 'Conveyor & Material Handling', slug: 'conveyor-material-handling', sortOrder: 10 },
    { id: 'welding-equipment', categoryId: 'machinery', name: 'Welding & Cutting Equipment', slug: 'welding-cutting-equipment', sortOrder: 11 },
    { id: 'power-tools', categoryId: 'machinery', name: 'Power Tools & Hand Tools', slug: 'power-tools-hand-tools', sortOrder: 12 },
    { id: 'testing-equipment', categoryId: 'machinery', name: 'Testing & Measuring Equipment', slug: 'testing-measuring-equipment', sortOrder: 13 },
    { id: 'hydraulic-pneumatic', categoryId: 'machinery', name: 'Hydraulic & Pneumatic Systems', slug: 'hydraulic-pneumatic-systems', sortOrder: 14 },
    { id: 'spare-parts', categoryId: 'machinery', name: 'Machine Spare Parts', slug: 'machine-spare-parts', sortOrder: 15 },

    // Automotive & Transportation (12 subcategories)
    { id: 'auto-parts', categoryId: 'automotive', name: 'Auto Parts & Components', slug: 'auto-parts-components', sortOrder: 1 },
    { id: 'tyres-wheels', categoryId: 'automotive', name: 'Tyres & Wheels', slug: 'tyres-wheels', sortOrder: 2 },
    { id: 'batteries-automotive', categoryId: 'automotive', name: 'Automotive Batteries', slug: 'automotive-batteries', sortOrder: 3 },
    { id: 'lubricants-oils', categoryId: 'automotive', name: 'Lubricants & Engine Oils', slug: 'lubricants-engine-oils', sortOrder: 4 },
    { id: 'commercial-vehicles', categoryId: 'automotive', name: 'Commercial Vehicles', slug: 'commercial-vehicles', sortOrder: 5 },
    { id: 'two-wheelers', categoryId: 'automotive', name: 'Two Wheeler Parts', slug: 'two-wheeler-parts', sortOrder: 6 },
    { id: 'automotive-tools', categoryId: 'automotive', name: 'Automotive Tools & Equipment', slug: 'automotive-tools-equipment', sortOrder: 7 },
    { id: 'car-accessories', categoryId: 'automotive', name: 'Car Accessories & Electronics', slug: 'car-accessories-electronics', sortOrder: 8 },
    { id: 'marine-parts', categoryId: 'automotive', name: 'Marine & Boat Parts', slug: 'marine-boat-parts', sortOrder: 9 },
    { id: 'aviation-parts', categoryId: 'automotive', name: 'Aviation & Aircraft Parts', slug: 'aviation-aircraft-parts', sortOrder: 10 },
    { id: 'railway-parts', categoryId: 'automotive', name: 'Railway & Train Parts', slug: 'railway-train-parts', sortOrder: 11 },
    { id: 'garage-equipment', categoryId: 'automotive', name: 'Garage & Workshop Equipment', slug: 'garage-workshop-equipment', sortOrder: 12 },

    // Construction & Building Materials (15 subcategories)
    { id: 'cement-concrete', categoryId: 'construction', name: 'Cement & Concrete Products', slug: 'cement-concrete-products', sortOrder: 1 },
    { id: 'steel-iron', categoryId: 'construction', name: 'Steel & Iron Products', slug: 'steel-iron-products', sortOrder: 2 },
    { id: 'bricks-blocks', categoryId: 'construction', name: 'Bricks & Building Blocks', slug: 'bricks-building-blocks', sortOrder: 3 },
    { id: 'tiles-flooring', categoryId: 'construction', name: 'Tiles & Flooring Materials', slug: 'tiles-flooring-materials', sortOrder: 4 },
    { id: 'doors-windows', categoryId: 'construction', name: 'Doors & Windows', slug: 'doors-windows', sortOrder: 5 },
    { id: 'roofing-materials', categoryId: 'construction', name: 'Roofing & Waterproofing', slug: 'roofing-waterproofing', sortOrder: 6 },
    { id: 'plumbing-supplies', categoryId: 'construction', name: 'Plumbing & Sanitary Supplies', slug: 'plumbing-sanitary-supplies', sortOrder: 7 },
    { id: 'electrical-fittings', categoryId: 'construction', name: 'Electrical Fittings & Switches', slug: 'electrical-fittings-switches', sortOrder: 8 },
    { id: 'paints-coatings', categoryId: 'construction', name: 'Paints & Protective Coatings', slug: 'paints-protective-coatings', sortOrder: 9 },
    { id: 'hardware-fasteners', categoryId: 'construction', name: 'Hardware & Fasteners', slug: 'hardware-fasteners', sortOrder: 10 },
    { id: 'construction-equipment', categoryId: 'construction', name: 'Construction Equipment', slug: 'construction-equipment', sortOrder: 11 },
    { id: 'safety-equipment', categoryId: 'construction', name: 'Construction Safety Equipment', slug: 'construction-safety-equipment', sortOrder: 12 },
    { id: 'insulation-materials', categoryId: 'construction', name: 'Insulation Materials', slug: 'insulation-materials', sortOrder: 13 },
    { id: 'glass-glazing', categoryId: 'construction', name: 'Glass & Glazing Products', slug: 'glass-glazing-products', sortOrder: 14 },
    { id: 'landscaping-materials', categoryId: 'construction', name: 'Landscaping Materials', slug: 'landscaping-materials', sortOrder: 15 },

    // Chemicals & Materials (12 subcategories)
    { id: 'industrial-chemicals', categoryId: 'chemicals', name: 'Industrial Chemicals', slug: 'industrial-chemicals', sortOrder: 1 },
    { id: 'petrochemicals', categoryId: 'chemicals', name: 'Petrochemicals & Derivatives', slug: 'petrochemicals-derivatives', sortOrder: 2 },
    { id: 'polymers-plastics', categoryId: 'chemicals', name: 'Polymers & Plastic Raw Materials', slug: 'polymers-plastic-raw-materials', sortOrder: 3 },
    { id: 'adhesives-sealants', categoryId: 'chemicals', name: 'Adhesives & Sealants', slug: 'adhesives-sealants', sortOrder: 4 },
    { id: 'cleaning-chemicals', categoryId: 'chemicals', name: 'Cleaning & Maintenance Chemicals', slug: 'cleaning-maintenance-chemicals', sortOrder: 5 },
    { id: 'water-treatment', categoryId: 'chemicals', name: 'Water Treatment Chemicals', slug: 'water-treatment-chemicals', sortOrder: 6 },
    { id: 'fertilizers', categoryId: 'chemicals', name: 'Fertilizers & Agrochemicals', slug: 'fertilizers-agrochemicals', sortOrder: 7 },
    { id: 'dyes-pigments', categoryId: 'chemicals', name: 'Dyes & Pigments', slug: 'dyes-pigments', sortOrder: 8 },
    { id: 'rubber-chemicals', categoryId: 'chemicals', name: 'Rubber Processing Chemicals', slug: 'rubber-processing-chemicals', sortOrder: 9 },
    { id: 'specialty-chemicals', categoryId: 'chemicals', name: 'Specialty & Fine Chemicals', slug: 'specialty-fine-chemicals', sortOrder: 10 },
    { id: 'laboratory-chemicals', categoryId: 'chemicals', name: 'Laboratory & Research Chemicals', slug: 'laboratory-research-chemicals', sortOrder: 11 },
    { id: 'metal-treatment', categoryId: 'chemicals', name: 'Metal Treatment Chemicals', slug: 'metal-treatment-chemicals', sortOrder: 12 },

    // Textiles & Apparel (10 subcategories)
    { id: 'fabrics-textiles', categoryId: 'textiles', name: 'Fabrics & Raw Textiles', slug: 'fabrics-raw-textiles', sortOrder: 1 },
    { id: 'yarns-threads', categoryId: 'textiles', name: 'Yarns & Threads', slug: 'yarns-threads', sortOrder: 2 },
    { id: 'readymade-garments', categoryId: 'textiles', name: 'Readymade Garments', slug: 'readymade-garments', sortOrder: 3 },
    { id: 'home-textiles', categoryId: 'textiles', name: 'Home Textiles & Furnishing', slug: 'home-textiles-furnishing', sortOrder: 4 },
    { id: 'leather-products', categoryId: 'textiles', name: 'Leather & Leather Products', slug: 'leather-leather-products', sortOrder: 5 },
    { id: 'footwear', categoryId: 'textiles', name: 'Footwear & Shoes', slug: 'footwear-shoes', sortOrder: 6 },
    { id: 'bags-luggage', categoryId: 'textiles', name: 'Bags & Luggage', slug: 'bags-luggage', sortOrder: 7 },
    { id: 'textile-accessories', categoryId: 'textiles', name: 'Textile Accessories & Trims', slug: 'textile-accessories-trims', sortOrder: 8 },
    { id: 'fashion-jewelry', categoryId: 'textiles', name: 'Fashion Jewelry & Accessories', slug: 'fashion-jewelry-accessories', sortOrder: 9 },
    { id: 'uniforms-workwear', categoryId: 'textiles', name: 'Uniforms & Workwear', slug: 'uniforms-workwear', sortOrder: 10 },

    // Food & Beverages (8 subcategories)
    { id: 'processed-foods', categoryId: 'food-beverages', name: 'Processed & Packaged Foods', slug: 'processed-packaged-foods', sortOrder: 1 },
    { id: 'beverages', categoryId: 'food-beverages', name: 'Beverages & Drinks', slug: 'beverages-drinks', sortOrder: 2 },
    { id: 'dairy-products', categoryId: 'food-beverages', name: 'Dairy Products', slug: 'dairy-products', sortOrder: 3 },
    { id: 'spices-condiments', categoryId: 'food-beverages', name: 'Spices & Condiments', slug: 'spices-condiments', sortOrder: 4 },
    { id: 'grains-cereals', categoryId: 'food-beverages', name: 'Grains & Cereals', slug: 'grains-cereals', sortOrder: 5 },
    { id: 'food-ingredients', categoryId: 'food-beverages', name: 'Food Ingredients & Additives', slug: 'food-ingredients-additives', sortOrder: 6 },
    { id: 'organic-foods', categoryId: 'food-beverages', name: 'Organic & Health Foods', slug: 'organic-health-foods', sortOrder: 7 },
    { id: 'food-packaging', categoryId: 'food-beverages', name: 'Food Packaging Materials', slug: 'food-packaging-materials', sortOrder: 8 },

    // Additional categories with subcategories to reach 100+
    { id: 'gift-items', categoryId: 'packaging', name: 'Gift Items & Handicrafts', slug: 'gift-items-handicrafts', sortOrder: 1 },
    { id: 'promotional-items', categoryId: 'packaging', name: 'Promotional & Marketing Items', slug: 'promotional-marketing-items', sortOrder: 2 },
    { id: 'packaging-materials', categoryId: 'packaging', name: 'Packaging Materials & Supplies', slug: 'packaging-materials-supplies', sortOrder: 3 },
    { id: 'printing-services', categoryId: 'packaging', name: 'Printing & Design Services', slug: 'printing-design-services', sortOrder: 4 },
    { id: 'labels-stickers', categoryId: 'packaging', name: 'Labels & Stickers', slug: 'labels-stickers', sortOrder: 5 },
  ];

  console.log('Creating subcategories...');
  for (const subcategory of subcategories) {
    await prisma.subcategory.upsert({
      where: { id: subcategory.id },
      update: {},
      create: subcategory,
    });
  }

  // Create promotional coupons
  const coupons = [
    {
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

  console.log('Creating coupons...');
  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: coupon,
    });
  }

  console.log('✅ Comprehensive B2B marketplace seeding completed successfully!');
  console.log(`📊 Created ${categories.length} categories and ${subcategories.length} subcategories`);
  console.log(`🎫 Created ${coupons.length} promotional coupons`);
}

main()
  .catch((e) => {
    console.error('❌ Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });