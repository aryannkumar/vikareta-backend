import { Request, Response } from 'express';

export class UploadController {
  async uploadImage(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { url: 'https://example.com/image.jpg' } });
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { url: 'https://example.com/document.pdf' } });
  }

  async uploadAvatar(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { url: 'https://example.com/avatar.jpg' } });
  }

  async deleteFile(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'File deleted successfully' });
  }
}