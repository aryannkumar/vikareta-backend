import { PrismaClient, Subcategory } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface SubcategoryWithCategory extends Subcategory {
    category: {
        id: string;
        name: string;
        slug: string;
    };
}

class SubcategoryService {
    /**
     * Get all subcategories with category information
     */
    async getAllSubcategories(): Promise<SubcategoryWithCategory[]> {
        try {
            const subcategories = await prisma.subcategory.findMany({
                where: {
                    isActive: true,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
                orderBy: [
                    { category: { sortOrder: 'asc' } },
                    { sortOrder: 'asc' },
                    { name: 'asc' },
                ],
            });

            return subcategories;
        } catch (error) {
            logger.error('Error fetching all subcategories:', error);
            throw new Error('Failed to fetch subcategories');
        }
    }

    /**
     * Get subcategory by ID with category information
     */
    async getSubcategoryById(id: string): Promise<SubcategoryWithCategory | null> {
        try {
            const subcategory = await prisma.subcategory.findUnique({
                where: {
                    id,
                    isActive: true,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
            });

            return subcategory;
        } catch (error) {
            logger.error('Error fetching subcategory by ID:', error);
            throw new Error('Failed to fetch subcategory');
        }
    }

    /**
     * Get subcategories by category ID
     */
    async getSubcategoriesByCategoryId(categoryId: string): Promise<Subcategory[]> {
        try {
            const subcategories = await prisma.subcategory.findMany({
                where: {
                    categoryId,
                    isActive: true,
                },
                orderBy: [
                    { sortOrder: 'asc' },
                    { name: 'asc' },
                ],
            });

            return subcategories;
        } catch (error) {
            logger.error('Error fetching subcategories by category ID:', error);
            throw new Error('Failed to fetch subcategories');
        }
    }

    /**
     * Get subcategory by category ID and subcategory ID
     */
    async getSubcategoryByCategoryAndId(categoryId: string, subcategoryId: string): Promise<SubcategoryWithCategory | null> {
        try {
            const subcategory = await prisma.subcategory.findFirst({
                where: {
                    id: subcategoryId,
                    categoryId,
                    isActive: true,
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
            });

            return subcategory;
        } catch (error) {
            logger.error('Error fetching subcategory by category and ID:', error);
            throw new Error('Failed to fetch subcategory');
        }
    }
}

export const subcategoryService = new SubcategoryService();