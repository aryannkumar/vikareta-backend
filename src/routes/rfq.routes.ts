import { Router, Request, Response } from 'express';
import { rfqService } from '../services/RFQService';
import { whatsAppService } from '../services/WhatsAppService';
import { RFQRequest, OrderNotification } from '../types/payment';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/rfq/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Allow common document and image formats
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, and images are allowed.'));
    }
  }
});

// Submit new RFQ
router.post('/submit', upload.array('attachments', 5), async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      contactPerson,
      email,
      phone,
      category,
      subcategory,
      productName,
      description,
      quantity,
      unit,
      targetPrice,
      deliveryLocation,
      timeline,
      specifications,
      buyerId
    } = req.body;

    // Validation
    if (!companyName || !contactPerson || !email || !phone || !category || !productName || !description || !quantity || !deliveryLocation || !timeline || !buyerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Handle file uploads
    const attachments = req.files ? (req.files as Express.Multer.File[]).map(file => file.filename) : [];

    const rfqData: Omit<RFQRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      companyName,
      contactPerson,
      email,
      phone,
      category,
      subcategory,
      productName,
      description,
      quantity: Number(quantity),
      unit,
      targetPrice: targetPrice ? Number(targetPrice) : undefined,
      deliveryLocation,
      timeline,
      specifications,
      attachments,
      status: 'open',
      buyerId
    };

    const result = await rfqService.createRFQ(rfqData);

    if (result.success) {
      // Send WhatsApp confirmation to buyer
      const notification: OrderNotification = {
        orderId: result.rfqId!,
        buyerId,
        type: 'rfq_received',
        status: 'submitted',
        message: `Your RFQ for ${productName} has been submitted successfully. We'll notify you when suppliers respond.`,
        additionalData: {
          rfqId: result.rfqId,
          category,
          productName,
          quantity
        }
      };

      // Send WhatsApp notification (non-blocking)
      whatsAppService.sendOrderNotification(notification).catch(err => {
        console.error('Failed to send WhatsApp notification:', err);
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error('RFQ submission failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'RFQ submission failed'
    });
  }
});

// Get RFQs with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      buyerId,
      supplierId,
      category,
      status,
      page = '1',
      limit = '10'
    } = req.query;

    const filters = {
      buyerId: buyerId as string,
      supplierId: supplierId as string,
      category: category as string,
      status: status as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    const result = await rfqService.getRFQs(filters);
    res.json(result);
  } catch (error: any) {
    console.error('Failed to get RFQs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get RFQs'
    });
  }
});

// Get specific RFQ by ID
router.get('/:rfqId', async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.params;
    const result = await rfqService.getRFQById(rfqId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error('Failed to get RFQ:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get RFQ'
    });
  }
});

// Submit quote for RFQ
router.post('/:rfqId/quote', async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.params;
    const {
      supplierId,
      supplierName,
      supplierEmail,
      supplierPhone,
      quotedPrice,
      totalPrice,
      deliveryTime,
      validUntil,
      terms,
      specifications,
      attachments
    } = req.body;

    // Validation
    if (!supplierId || !supplierName || !supplierEmail || !supplierPhone || !quotedPrice || !totalPrice || !deliveryTime || !validUntil || !terms) {
      return res.status(400).json({
        success: false,
        error: 'Missing required quote fields'
      });
    }

    const quoteData = {
      supplierId,
      supplierName,
      supplierEmail,
      supplierPhone,
      quotedPrice: Number(quotedPrice),
      totalPrice: Number(totalPrice),
      deliveryTime,
      validUntil: new Date(validUntil),
      terms,
      specifications,
      attachments: attachments || [],
      status: 'pending' as const
    };

    const result = await rfqService.submitQuote(rfqId, quoteData);

    if (result.success) {
      // Send WhatsApp notification to buyer about new quote
      const notification: OrderNotification = {
        orderId: rfqId,
        buyerId: 'rfq_buyer', // You'd get this from the RFQ details
        type: 'quote_received',
        status: 'quote_submitted',
        message: `New quote received from ${supplierName} for your RFQ. Price: ₹${quotedPrice} per unit.`,
        additionalData: {
          rfqId,
          quoteId: result.quoteId,
          supplierName,
          quotedPrice,
          totalPrice
        }
      };

      // Send WhatsApp notification (non-blocking)
      whatsAppService.sendOrderNotification(notification).catch(err => {
        console.error('Failed to send WhatsApp notification:', err);
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Quote submission failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Quote submission failed'
    });
  }
});

// Get quotes for specific RFQ
router.get('/:rfqId/quotes', async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.params;
    const result = await rfqService.getQuotesForRFQ(rfqId);
    res.json(result);
  } catch (error: any) {
    console.error('Failed to get quotes:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get quotes'
    });
  }
});

// Accept a quote
router.post('/:rfqId/quote/:quoteId/accept', async (req: Request, res: Response) => {
  try {
    const { rfqId, quoteId } = req.params;
    const result = await rfqService.acceptQuote(rfqId, quoteId);

    if (result.success) {
      // Send WhatsApp notifications about quote acceptance
      const buyerNotification: OrderNotification = {
        orderId: rfqId,
        buyerId: 'rfq_buyer',
        type: 'quote_received',
        status: 'quote_accepted',
        message: `You have accepted a quote for your RFQ. The supplier will contact you soon to proceed with the order.`,
        additionalData: {
          rfqId,
          quoteId,
          action: 'accepted'
        }
      };

      const supplierNotification: OrderNotification = {
        orderId: rfqId,
        buyerId: 'quote_supplier',
        type: 'quote_received',
        status: 'quote_accepted',
        message: `Congratulations! Your quote has been accepted. Please contact the buyer to proceed with the order.`,
        additionalData: {
          rfqId,
          quoteId,
          action: 'accepted'
        }
      };

      // Send WhatsApp notifications (non-blocking)
      Promise.all([
        whatsAppService.sendOrderNotification(buyerNotification),
        whatsAppService.sendOrderNotification(supplierNotification)
      ]).catch(err => {
        console.error('Failed to send WhatsApp notifications:', err);
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Quote acceptance failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Quote acceptance failed'
    });
  }
});

// Reject a quote
router.post('/:rfqId/quote/:quoteId/reject', async (req: Request, res: Response) => {
  try {
    const { rfqId, quoteId } = req.params;
    const { reason } = req.body;

    // TODO: Implement quote rejection logic
    console.log(`Rejecting quote ${quoteId} for RFQ ${rfqId}. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Quote rejected successfully'
    });
  } catch (error: any) {
    console.error('Quote rejection failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Quote rejection failed'
    });
  }
});

// Update RFQ status
router.patch('/:rfqId/status', async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const result = await rfqService.updateRFQStatus(rfqId, status);
    res.json(result);
  } catch (error: any) {
    console.error('RFQ status update failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'RFQ status update failed'
    });
  }
});

// Search RFQs
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, category, location } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const filters = {
      category: category as string,
      location: location as string
    };

    const result = await rfqService.searchRFQs(q as string, filters);
    res.json(result);
  } catch (error: any) {
    console.error('RFQ search failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'RFQ search failed'
    });
  }
});

// Get RFQ categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await rfqService.getRFQCategories();
    res.json({
      success: true,
      categories
    });
  } catch (error: any) {
    console.error('Failed to get RFQ categories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get RFQ categories'
    });
  }
});

// Get RFQ analytics
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.query;
    const analytics = await rfqService.getRFQAnalytics(supplierId as string);
    
    res.json({
      success: true,
      analytics
    });
  } catch (error: any) {
    console.error('Failed to get RFQ analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get RFQ analytics'
    });
  }
});

// Download RFQ attachment
router.get('/:rfqId/attachment/:attachmentId', async (req: Request, res: Response) => {
  try {
    const { rfqId, attachmentId } = req.params;
    
    // TODO: Implement file download logic
    console.log(`Downloading attachment ${attachmentId} for RFQ ${rfqId}`);
    
    res.status(501).json({
      success: false,
      error: 'File download not implemented yet'
    });
  } catch (error: any) {
    console.error('File download failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'File download failed'
    });
  }
});

export default router;