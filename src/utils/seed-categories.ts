/**
 * Utility to seed default categories and subcategories
 * This ensures that basic categories exist for product/service creation
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const defaultCategories = [
  {
    name: 'Electronics',
    description: 'Electronic devices and accessories',
    subcategories: [
      { name: 'Mobile Phones', description: 'Smartphones and mobile devices' },
      { name: 'Laptops', description: 'Laptops and notebooks' },
      { name: 'Accessories', description: 'Electronic accessories' },
      { name: 'Audio', description: 'Audio devices and equipment' },
      { name: 'Gaming', description: 'Gaming devices and accessories' }
    ]
  },
  {
    name: 'Fashion',
    description: 'Clothing and fashion accessories',
    subcategories: [
      { name: 'Men\'s Clothing', description: 'Clothing for men' },
      { name: 'Women\'s Clothing', description: 'Clothing for women' },
      { name: 'Shoes', description: 'Footwear for all' },
      { name: 'Accessories', description: 'Fashion accessories' },
      { name: 'Bags', description: 'Bags and luggage' }
    ]
  },
  {
    name: 'Home & Garden',
    description: 'Home improvement and garden supplies',
    subcategories: [
      { name: 'Furniture', description: 'Home furniture' },
      { name: 'Decor', description: 'Home decoration items' },
      { name: 'Kitchen', description: 'Kitchen appliances and tools' },
      { name: 'Garden', description: 'Garden tools and supplies' },
      { name: 'Storage', description: 'Storage solutions' }
    ]
  },
  {
    name: 'Business Services',
    description: 'Professional business services',
    subcategories: [
      { name: 'Consulting', description: 'Business consulting services' },
      { name: 'Marketing', description: 'Marketing and advertising services' },
      { name: 'IT Services', description: 'Information technology services' },
      { name: 'Legal', description: 'Legal services' },
      { name: 'Financial', description: 'Financial services' }
    ]
  },
  {
    name: 'Technology',
    description: 'Technology products and services',
    subcategories: [
      { name: 'Software', description: 'Software products and licenses' },
      { name: 'Hardware', description: 'Computer hardware' },
      { name: 'AI & ML', description: 'Artificial Intelligence and Machine Learning' },
      { name: 'Cloud Services', description: 'Cloud computing services' },
      { name: 'Development', description: 'Software development services' }
    ]
  },
  {
    name: 'General',
    description: 'General category for products and services',
    subcategories: [
      { name: 'General', description: 'General subcategory' },
      { name: 'Other', description: 'Other items' }
    ]
  }
];

export async function seedCategories() {
  try {
    console.log('Seeding categories and subcategories...');
    
    for (const categoryData of defaultCategories) {
      // Check if category already exists
      let category = await prisma.category.findFirst({
        where: { name: categoryData.name }
      });
      
      if (!category) {
        // Create category
        category = await prisma.category.create({
          data: {
            name: categoryData.name,
            slug: categoryData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            description: categoryData.description,
            isActive: true
          }
        });
        console.log(`Created category: ${category.name}`);
      }
      
      // Create subcategories
      for (const subCatData of categoryData.subcategories) {
        const existingSubCat = await prisma.subcategory.findFirst({
          where: {
            name: subCatData.name,
            categoryId: category.id
          }
        });
        
        if (!existingSubCat) {
          const subcategory = await prisma.subcategory.create({
            data: {
              name: subCatData.name,
              slug: subCatData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
              description: subCatData.description,
              categoryId: category.id,
              isActive: true
            }
          });
          console.log(`  Created subcategory: ${subcategory.name}`);
        }
      }
    }
    
    console.log('Categories and subcategories seeded successfully!');
  } catch (error) {
    console.error('Error seeding categories:', error);
    throw error;
  }
}

export async function getOrCreateDefaultCategory() {
  try {
    // Try to get the first available category
    let category = await prisma.category.findFirst({
      where: { isActive: true }
    });
    
    if (!category) {
      // Create a default category if none exists
      category = await prisma.category.create({
        data: {
          name: 'General',
          slug: 'general',
          description: 'General category for products and services',
          isActive: true
        }
      });
      
      // Create a default subcategory
      await prisma.subcategory.create({
        data: {
          name: 'General',
          slug: 'general',
          description: 'General subcategory',
          categoryId: category.id,
          isActive: true
        }
      });
    }
    
    return category;
  } catch (error) {
    console.error('Error getting/creating default category:', error);
    throw error;
  }
}

export async function getAvailableCategories() {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        subcategories: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    return categories;
  } catch (error) {
    console.error('Error getting available categories:', error);
    return [];
  }
}