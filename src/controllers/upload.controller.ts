import { Request, Response } from 'express';
import { minioService } from '@/services/minio.service';

export class UploadController {
  async uploadImage(req: Request, res: Response): Promise<void> {
  const file = (req as any).file || ((req.files as any[]) && (req.files as any[])[0]);
    if (!file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    const folder = req.query.folder?.toString() || 'uploads/images';
    const originalName = file.originalname || file.name || 'upload.bin';
    const buffer: Buffer = file.buffer || file;

    const result = await minioService.uploadFile(buffer, originalName, folder, {
      'content-type': file.mimetype || 'application/octet-stream',
    });

    res.json({ success: true, data: result });
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
  const file = (req as any).file || ((req.files as any[]) && (req.files as any[])[0]);
    if (!file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    const folder = req.query.folder?.toString() || 'uploads/documents';
    const originalName = file.originalname || file.name || 'document.bin';
    const buffer: Buffer = file.buffer || file;

    const result = await minioService.uploadFile(buffer, originalName, folder, {
      'content-type': file.mimetype || 'application/octet-stream',
    });

    res.json({ success: true, data: result });
  }

  async uploadAvatar(req: Request, res: Response): Promise<void> {
  const file = (req as any).file || ((req.files as any[]) && (req.files as any[])[0]);
    if (!file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    const folder = 'uploads/avatars';
    const originalName = file.originalname || file.name || 'avatar.bin';
    const buffer: Buffer = file.buffer || file;

    const result = await minioService.uploadFile(buffer, originalName, folder, {
      'content-type': file.mimetype || 'application/octet-stream',
    });

    res.json({ success: true, data: result });
  }

  async deleteFile(req: Request, res: Response): Promise<void> {
    const fileId = req.params.fileId;
    if (!fileId) {
      res.status(400).json({ success: false, message: 'fileId required' });
      return;
    }

    // support folder query param, default to uploads
    const folder = req.query.folder?.toString() || 'uploads';

    const success = await minioService.deleteFile(fileId, folder);
    if (success) {
      res.json({ success: true, message: 'File deleted successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to delete file' });
    }
  }

  async presign(req: Request, res: Response): Promise<void> {
    const { fileName, folder, expiry } = req.query;
    if (!fileName) {
      res.status(400).json({ success: false, message: 'fileName query param required' });
      return;
    }
  const rawFolder = (folder?.toString() || 'uploads');
  const safeFolder = rawFolder.split('/').map(seg => seg.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean).join('/') || 'uploads';
    const url = await minioService.generateUploadUrl(fileName.toString(), safeFolder, parseInt(expiry as string || '3600', 10));
    res.json({ success: true, data: { url, method: 'PUT', expiresIn: parseInt(expiry as string || '3600', 10) } });
  }
}