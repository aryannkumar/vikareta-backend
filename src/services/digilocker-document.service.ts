import { BaseService } from './base.service';
import { logger } from '@/utils/logger';

export class DigiLockerDocumentService extends BaseService {
  async list(userId: string) {
    return this.prisma.digiLockerDocument.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
  async create(userId: string, data: { docId: string; docType: string; docName: string; issuer: string; issueDate?: string; expiryDate?: string; documentData?: any; }) {
    const created = await this.prisma.digiLockerDocument.create({
      data: {
        userId,
        docId: data.docId,
        docType: data.docType,
        docName: data.docName,
        issuer: data.issuer,
        issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        documentData: data.documentData,
      },
    });
    logger.info(`DigiLocker doc created id=${created.id}`);
    return created;
  }
  async update(userId: string, id: string, data: any) {
    const existing = await this.prisma.digiLockerDocument.findFirst({ where: { id, userId } });
    if (!existing) throw new Error('Document not found');
    const updated = await this.prisma.digiLockerDocument.update({
      where: { id },
      data: {
        ...('docName' in data ? { docName: data.docName } : {}),
        ...('verificationStatus' in data ? { verificationStatus: data.verificationStatus } : {}),
        ...('issueDate' in data ? { issueDate: data.issueDate ? new Date(data.issueDate) : null } : {}),
        ...('expiryDate' in data ? { expiryDate: data.expiryDate ? new Date(data.expiryDate) : null } : {}),
        ...('documentData' in data ? { documentData: data.documentData } : {}),
      },
    });
    return updated;
  }
  async remove(userId: string, id: string) {
    await this.prisma.digiLockerDocument.deleteMany({ where: { id, userId } });
  }
}

export const digiLockerDocumentService = new DigiLockerDocumentService();