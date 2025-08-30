/**
 * Delivery Partner Management Routes
 * API endpoints for managing delivery partners and seller preferences
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createDeliveryPartnerSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  apiEndpoint: z.string().url().optional(),
  apiKey: z.string().optional(),
  supportedServices: z.array(z.string()).optional(),
  serviceAreas: z.array(z.string()).optional(),
  rateCard: z.object({}).optional(),
  contactInfo: z.object({}).optional()
});

const updatePreferenceSchema = z.object({
  deliveryPartnerId: z.string().uuid(),
  priority: z.number().min(0),
  isActive: z.boolean().optional(),
  serviceTypes: z.array(z.string()).optional()
});

// GET /api/delivery-partners - Get all delivery partners
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { isActive } = req.query;
    
    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    const partners = await prisma.deliveryPartner.findMany({
      where,
      orderBy: { priority: 'asc' }
    });
    
    res.json({
      success: true,
      data: partners
    });
  } catch (error) {
    console.error('Error fetching delivery partners:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch delivery partners'
      }
    });
  }
});

// GET /api/delivery-partners/seller-preferences - Get seller's delivery preferences
router.get('/seller-preferences', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const preferences = await prisma.sellerDeliveryPreference.findMany({
      where: { sellerId: userId },
      include: {
        deliveryPartner: true
      },
      orderBy: { priority: 'asc' }
    });
    
    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching seller preferences:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch seller preferences'
      }
    });
  }
});

// POST /api/delivery-partners/seller-preferences - Update seller's delivery preferences
router.post('/seller-preferences', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { preferences } = req.body;
    
    if (!Array.isArray(preferences)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Preferences must be an array'
        }
      });
    }
    
    // Delete existing preferences
    await prisma.sellerDeliveryPreference.deleteMany({
      where: { sellerId: userId }
    });
    
    // Create new preferences
    const newPreferences = await Promise.all(
      preferences.map((pref: any, index: number) => 
        prisma.sellerDeliveryPreference.create({
          data: {
            sellerId: userId,
            deliveryPartnerId: pref.deliveryPartnerId,
            priority: index,
            isActive: pref.isActive ?? true,
            serviceTypes: pref.serviceTypes || ['standard']
          },
          include: {
            deliveryPartner: true
          }
        })
      )
    );
    
    res.json({
      success: true,
      data: newPreferences,
      message: 'Delivery preferences updated successfully'
    });
  } catch (error) {
    console.error('Error updating seller preferences:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update seller preferences'
      }
    });
  }
});

// GET /api/delivery-partners/:id/rate-calculator - Calculate shipping rates
router.get('/:id/rate-calculator', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { weight, dimensions, serviceType, fromPincode, toPincode } = req.query;
    
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id }
    });
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Delivery partner not found'
        }
      });
    }
    
    // Calculate shipping rate (simplified calculation)
    const baseRate = 50; // Base rate per kg
    const weightNum = parseFloat(weight as string) || 1;
    const serviceMultiplier = serviceType === 'express' ? 2 : serviceType === 'overnight' ? 3 : 1;
    
    const estimatedCost = Math.round(baseRate * weightNum * serviceMultiplier);
    const estimatedDays = serviceType === 'overnight' ? 1 : serviceType === 'express' ? 2 : 5;
    
    res.json({
      success: true,
      data: {
        partnerId: partner.id,
        partnerName: partner.name,
        serviceType: serviceType || 'standard',
        estimatedCost,
        estimatedDays,
        currency: 'INR'
      }
    });
  } catch (error) {
    console.error('Error calculating shipping rate:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: 'Failed to calculate shipping rate'
      }
    });
  }
});

// POST /api/delivery-partners (Admin only) - Create delivery partner
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    // Check if user is admin (implement admin check as needed)
    const validatedData = createDeliveryPartnerSchema.parse(req.body);
    
    const partner = await prisma.deliveryPartner.create({
      data: {
        ...validatedData,
        isActive: true,
        priority: 0
      }
    });
    
    res.status(201).json({
      success: true,
      data: partner,
      message: 'Delivery partner created successfully'
    });
  } catch (error) {
    console.error('Error creating delivery partner:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create delivery partner'
      }
    });
  }
});

// GET /api/delivery-partners/service-check - Check service availability
router.get('/service-check', authenticate, async (req: Request, res: Response) => {
  try {
    const { pincode, serviceType } = req.query;
    
    if (!pincode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Pincode is required'
        }
      });
    }
    
    // Get all active delivery partners
    const partners = await prisma.deliveryPartner.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' }
    });
    
    // Check service availability for each partner
    const availableServices = partners.map(partner => {
      // Simplified availability check - in production, use actual API calls
      const isAvailable = true; // Mock availability
      const estimatedDays = serviceType === 'express' ? 2 : 5;
      
      return {
        partnerId: partner.id,
        partnerName: partner.name,
        isAvailable,
        supportedServices: partner.supportedServices || ['standard', 'express'],
        estimatedDays,
        serviceType: serviceType || 'standard'
      };
    });
    
    res.json({
      success: true,
      data: {
        pincode,
        availableServices: availableServices.filter(service => service.isAvailable)
      }
    });
  } catch (error) {
    console.error('Error checking service availability:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVICE_CHECK_ERROR',
        message: 'Failed to check service availability'
      }
    });
  }
});

export default router;