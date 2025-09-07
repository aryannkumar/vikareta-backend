import { prisma } from '@/config/database';

interface CreateUserDocumentInput { documentType: string; documentNumber: string; documentUrl: string; }

export class UserDocumentService {
  async bulkCreate(userId: string, docs: CreateUserDocumentInput[]) {
    const valid = docs.filter(d => d.documentType && d.documentNumber && d.documentUrl);
    if (!valid.length) return { count: 0 };
    return prisma.userDocument.createMany({ data: valid.map(v => ({ ...v, userId, verificationStatus: 'pending' })) });
  }
  async list(userId: string) {
    return prisma.userDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
export const userDocumentService = new UserDocumentService();
