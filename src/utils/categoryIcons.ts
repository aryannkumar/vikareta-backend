/**
 * Category Icon Mapping Utility
 * Maps category slugs to appropriate icons for frontend display
 */

export interface CategoryIconMapping {
  [slug: string]: string;
}

// Icon mapping based on common B2B marketplace categories
export const categoryIconMap: CategoryIconMapping = {
  // Electronics & Technology
  'electronics': 'Zap',
  'computers': 'Monitor',
  'laptops': 'Laptop',
  'mobile-phones': 'Smartphone',
  'tablets': 'Tablet',
  'accessories': 'Headphones',
  'networking': 'Wifi',
  'servers': 'Server',
  'storage': 'HardDrive',
  'printers': 'Printer',
  'cameras': 'Camera',
  'audio-video': 'Video',
  'gaming': 'Gamepad2',
  'smart-devices': 'Home',
  'wearables': 'Watch',

  // Industrial & Manufacturing
  'industrial': 'Factory',
  'machinery': 'Cog',
  'tools': 'Wrench',
  'equipment': 'Settings',
  'automation': 'Bot',
  'manufacturing': 'Package',
  'heavy-machinery': 'Truck',
  'construction': 'HardHat',
  'welding': 'Flame',
  'cutting-tools': 'Scissors',
  'measuring': 'Ruler',
  'safety': 'Shield',
  'power-tools': 'Drill',
  'hand-tools': 'Hammer',

  // Office & Business
  'office': 'Building',
  'furniture': 'Armchair',
  'stationery': 'PenTool',
  'supplies': 'Package2',
  'printing': 'FileText',
  'communication': 'Phone',
  'presentation': 'Presentation',
  'storage-solutions': 'Archive',
  'lighting': 'Lightbulb',
  'security': 'Lock',

  // Healthcare & Medical
  'healthcare': 'Heart',
  'medical': 'Stethoscope',
  'pharmaceuticals': 'Pill',
  'diagnostics': 'Activity',
  'surgical': 'Scissors',
  'dental': 'Smile',
  'laboratory': 'TestTube',
  'imaging': 'Scan',
  'therapy': 'Users',
  'emergency': 'AlertTriangle',

  // Automotive & Transportation
  'automotive': 'Car',
  'vehicles': 'Truck',
  'parts': 'Settings',
  'tires': 'Circle',
  'batteries': 'Battery',
  'oils': 'Droplets',
  'accessories-auto': 'Wrench',
  'commercial-vehicles': 'Truck',
  'motorcycles': 'Bike',
  'marine': 'Anchor',
  'aviation': 'Plane',

  // Food & Beverage
  'food': 'UtensilsCrossed',
  'beverages': 'Coffee',
  'ingredients': 'ChefHat',
  'packaging': 'Package',
  'equipment-food': 'Refrigerator',
  'catering': 'Users',
  'organic': 'Leaf',
  'frozen': 'Snowflake',
  'dairy': 'Milk',
  'bakery': 'Cake',

  // Textiles & Apparel
  'textiles': 'Shirt',
  'clothing': 'ShirtIcon',
  'fabrics': 'Layers',
  'uniforms': 'Users',
  'footwear': 'Footprints',
  'accessories-fashion': 'Watch',
  'leather': 'Package',
  'sportswear': 'Trophy',
  'protective-wear': 'Shield',

  // Chemicals & Materials
  'chemicals': 'TestTube2',
  'materials': 'Layers',
  'plastics': 'Recycle',
  'metals': 'Zap',
  'composites': 'Layers3',
  'adhesives': 'Droplet',
  'coatings': 'Paintbrush',
  'raw-materials': 'Package',
  'specialty-chemicals': 'Flask',

  // Energy & Environment
  'energy': 'Zap',
  'solar': 'Sun',
  'renewable': 'Leaf',
  'batteries-energy': 'Battery',
  'generators': 'Power',
  'environmental': 'TreePine',
  'waste-management': 'Recycle',
  'water-treatment': 'Droplets',
  'air-quality': 'Wind',

  // Agriculture & Farming
  'agriculture': 'Wheat',
  'farming': 'Tractor',
  'seeds': 'Sprout',
  'fertilizers': 'Droplet',
  'irrigation': 'Droplets',
  'livestock': 'Cow',
  'dairy-farming': 'Milk',
  'organic-farming': 'Leaf',
  'greenhouse': 'Home',
  'harvesting': 'Scissors',

  // Construction & Building
  'construction-materials': 'Brick',
  'building': 'Building2',
  'cement': 'Package',
  'steel': 'Zap',
  'wood': 'TreePine',
  'plumbing': 'Wrench',
  'electrical': 'Zap',
  'roofing': 'Home',
  'flooring': 'Square',
  'insulation': 'Layers',

  // Services
  'services': 'Users',
  'consulting': 'MessageSquare',
  'maintenance': 'Wrench',
  'repair': 'Tool',
  'installation': 'Settings',
  'training': 'GraduationCap',
  'logistics': 'Truck',
  'shipping': 'Package',
  'warehousing': 'Warehouse',
  'cleaning': 'Sparkles',
  'security-services': 'Shield',
  'it-services': 'Monitor',
  'marketing': 'TrendingUp',
  'design': 'Palette',
  'photography': 'Camera',
  'printing-services': 'Printer',

  // Default fallback icons
  'other': 'Package',
  'miscellaneous': 'MoreHorizontal',
  'general': 'Grid3x3',
};

/**
 * Get icon for a category based on its slug
 */
export function getCategoryIcon(slug: string): string {
  // Direct match
  if (categoryIconMap[slug]) {
    return categoryIconMap[slug];
  }

  // Try to find partial matches
  const slugLower = slug.toLowerCase();
  
  // Check for partial matches in the slug
  for (const [key, icon] of Object.entries(categoryIconMap)) {
    if (slugLower.includes(key) || key.includes(slugLower)) {
      return icon;
    }
  }

  // Check for common keywords
  if (slugLower.includes('tech') || slugLower.includes('digital')) return 'Monitor';
  if (slugLower.includes('health') || slugLower.includes('medical')) return 'Heart';
  if (slugLower.includes('food') || slugLower.includes('kitchen')) return 'UtensilsCrossed';
  if (slugLower.includes('auto') || slugLower.includes('vehicle')) return 'Car';
  if (slugLower.includes('office') || slugLower.includes('business')) return 'Building';
  if (slugLower.includes('industrial') || slugLower.includes('machine')) return 'Factory';
  if (slugLower.includes('service')) return 'Users';
  if (slugLower.includes('material') || slugLower.includes('supply')) return 'Package';
  if (slugLower.includes('energy') || slugLower.includes('power')) return 'Zap';
  if (slugLower.includes('construction') || slugLower.includes('building')) return 'Building2';

  // Default fallback
  return 'Package';
}

/**
 * Get all available icons for admin interface
 */
export function getAllCategoryIcons(): CategoryIconMapping {
  return categoryIconMap;
}

/**
 * Add or update icon mapping
 */
export function updateCategoryIcon(slug: string, icon: string): void {
  categoryIconMap[slug] = icon;
}

/**
 * Get icon suggestions based on category name or description
 */
export function suggestCategoryIcon(name: string, description?: string): string[] {
  const suggestions: string[] = [];
  const searchText = `${name} ${description || ''}`.toLowerCase();

  // Find relevant icons based on keywords
  const keywords = searchText.split(/\s+/);
  
  for (const keyword of keywords) {
    for (const [slug, icon] of Object.entries(categoryIconMap)) {
      if (slug.includes(keyword) || keyword.includes(slug)) {
        if (!suggestions.includes(icon)) {
          suggestions.push(icon);
        }
      }
    }
  }

  // If no suggestions found, provide some common ones
  if (suggestions.length === 0) {
    suggestions.push('Package', 'Grid3x3', 'MoreHorizontal');
  }

  return suggestions.slice(0, 5); // Return top 5 suggestions
}