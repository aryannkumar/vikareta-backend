import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export async function executeQuery<T>(query: string, params?: any[]): Promise<T[]> {
  try {
    // This is a mock implementation - in a real app you'd use your SQL query executor
    logger.warn('executeQuery called with SQL query - this is a mock implementation');
    return [] as T[];
  } catch (error) {
    logger.error('Database query error:', error);
    throw error;
  }
}

export async function executeSingle<T>(query: string, params?: any[]): Promise<T | null> {
  try {
    // This is a mock implementation - in a real app you'd use your SQL query executor
    logger.warn('executeSingle called with SQL query - this is a mock implementation');
    return null;
  } catch (error) {
    logger.error('Database single query error:', error);
    throw error;
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

export { prisma };