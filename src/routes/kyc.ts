import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

// KYC Verification Endpoints
router.get('/verification-requirements', authenticate, (req, res) => {
  return res.json({
    success: true,
    data: {
      requirements: {
        basic: {
          documents: ['government_id'],
          transactionLimit: 50000
        },
        standard: {
          documents: ['government_id', 'address_proof'],
          transactionLimit: 200000
        },
        enhanced: {
          documents: ['government_id', 'address_proof', 'business_registration'],
          transactionLimit: 1000000
        },
        premium: {
          documents: ['government_id', 'address_proof', 'business_registration', 'financial_statements'],
          transactionLimit: -1
        }
      }
    }
  });
});

router.post('/submit-documents', authenticate, (req, res) => {
  const { documentType, documentNumber, file } = req.body;
  
  return res.json({
    success: true,
    data: {
      submissionId: 'kyc_' + Date.now(),
      documentType,
      status: 'under_review',
      estimatedProcessing: '2-3 business days'
    }
  });
});

router.get('/verification-status', authenticate, (req, res) => {
  return res.json({
    success: true,
    data: {
      currentTier: 'standard',
      status: 'verified',
      documents: [
        {
          type: 'government_id',
          status: 'verified',
          verifiedAt: '2025-01-01T00:00:00Z'
        },
        {
          type: 'address_proof',
          status: 'verified',
          verifiedAt: '2025-01-01T00:00:00Z'
        }
      ]
    }
  });
});

export default router;