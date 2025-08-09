import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';
import { quoteService } from '@/services/quote.service';

const prisma = new PrismaClient();

export interface CreateCounterOfferData {
  quoteId: string;
  counterPrice: number;
  counterTerms?: string;
  validUntil?: Date;
  message?: string;
}

export interface NegotiationHistory {
  id: string;
  quoteId: string;
  fromUserId: string;
  toUserId: string;
  offerType: 'original' | 'counter' | 'final';
  price: number;
  terms?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  validUntil?: Date;
  createdAt: Date;
  fromUser: {
    id: string;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    verificationTier: string;
  };
  toUser: {
    id: string;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    verificationTier: string;
  };
}

export interface NegotiationSummary {
  quoteId: string;
  originalPrice: number;
  currentPrice: number;
  priceReduction: number;
  priceReductionPercentage: number;
  negotiationRounds: number;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  lastActivity: Date;
  history: NegotiationHistory[];
}

export interface AutoConversionSettings {
  maxNegotiationRounds: number;
  autoAcceptThreshold?: number; // Percentage difference from original price
  negotiationTimeout: number; // Hours
}

export class NegotiationService {
  private defaultSettings: AutoConversionSettings = {
    maxNegotiationRounds: 5,
    autoAcceptThreshold: 5, // 5% difference
    negotiationTimeout: 48, // 48 hours
  };

  /**
   * Create a counter-offer for a quote
   */
  async createCounterOffer(buyerId: string, data: CreateCounterOfferData): Promise<NegotiationHistory> {
    try {
      // Get the original quote and verify access
      const quote = await quoteService.getQuoteById(data.quoteId);
      
      if (quote.rfq.buyer.id !== buyerId) {
        throw new Error('Access denied: You can only negotiate on your own RFQs');
      }

      if (quote.status !== 'pending') {
        throw new Error('Cannot negotiate on a quote that is not pending');
      }

      if (quote.validUntil && quote.validUntil < new Date()) {
        throw new Error('Cannot negotiate on an expired quote');
      }

      // Check if negotiation is still allowed
      const negotiationHistory = await this.getNegotiationHistory(data.quoteId);
      if (negotiationHistory.negotiationRounds >= this.defaultSettings.maxNegotiationRounds) {
        throw new Error('Maximum negotiation rounds exceeded');
      }

      // Set default validity to 24 hours if not provided
      const validUntil = data.validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create negotiation record
      const negotiation = await prisma.$transaction(async (tx) => {
        // Create negotiation history entry
        const negotiationEntry = await tx.negotiationHistory.create({
          data: {
            quoteId: data.quoteId,
            fromUserId: buyerId,
            toUserId: quote.sellerId,
            offerType: 'counter',
            price: data.counterPrice,
            terms: data.counterTerms || null,
            message: data.message || null,
            status: 'pending',
            validUntil,
          },
        });

        // Update quote status to indicate negotiation in progress
        await tx.quote.update({
          where: { id: data.quoteId },
          data: { 
            status: 'negotiating',
            termsConditions: data.counterTerms || quote.termsConditions,
          },
        });

        return negotiationEntry;
      });

      logger.info(`Counter-offer created: ${negotiation.id} for quote ${data.quoteId}`);

      // Return the negotiation with user details
      return await this.getNegotiationById(negotiation.id);
    } catch (error) {
      logger.error('Error creating counter-offer:', error);
      throw error;
    }
  }

  /**
   * Respond to a counter-offer (seller action)
   */
  async respondToCounterOffer(
    sellerId: string, 
    negotiationId: string, 
    action: 'accept' | 'reject' | 'counter',
    data?: {
      counterPrice?: number;
      counterTerms?: string;
      message?: string;
      validUntil?: Date;
    }
  ): Promise<NegotiationHistory | { converted: boolean; orderId?: string }> {
    try {
      // Get the negotiation entry
      const negotiation = await this.getNegotiationById(negotiationId);
      
      if (negotiation.toUserId !== sellerId) {
        throw new Error('Access denied: You can only respond to negotiations directed to you');
      }

      if (negotiation.status !== 'pending') {
        throw new Error('Cannot respond to a negotiation that is not pending');
      }

      if (negotiation.validUntil && negotiation.validUntil < new Date()) {
        throw new Error('Cannot respond to an expired negotiation');
      }

      if (action === 'accept') {
        // Accept the counter-offer and convert to order
        return await this.acceptCounterOffer(negotiationId, sellerId);
      } else if (action === 'reject') {
        // Reject the counter-offer
        await this.rejectCounterOffer(negotiationId, sellerId, data?.message);
        return await this.getNegotiationById(negotiationId);
      } else if (action === 'counter') {
        // Create a counter-counter-offer
        if (!data?.counterPrice) {
          throw new Error('Counter price is required for counter-offers');
        }
        const counterOfferData: {
          counterPrice: number;
          counterTerms?: string;
          message?: string;
          validUntil?: Date;
        } = {
          counterPrice: data.counterPrice,
        };
        
        if (data.counterTerms !== undefined) counterOfferData.counterTerms = data.counterTerms;
        if (data.message !== undefined) counterOfferData.message = data.message;
        if (data.validUntil !== undefined) counterOfferData.validUntil = data.validUntil;
        
        return await this.createSellerCounterOffer(sellerId, negotiationId, counterOfferData);
      } else {
        throw new Error('Invalid action. Must be accept, reject, or counter');
      }
    } catch (error) {
      logger.error('Error responding to counter-offer:', error);
      throw error;
    }
  }

  /**
   * Accept a counter-offer and convert to order
   */
  private async acceptCounterOffer(negotiationId: string, _sellerId: string): Promise<{ converted: boolean; orderId?: string }> {
    try {
      const negotiation = await this.getNegotiationById(negotiationId);
      const quote = await quoteService.getQuoteById(negotiation.quoteId);

      const result = await prisma.$transaction(async (tx) => {
        // Update negotiation status
        await tx.negotiationHistory.update({
          where: { id: negotiationId },
          data: { status: 'accepted' },
        });

        // Update quote with negotiated price and accept it
        await tx.quote.update({
          where: { id: negotiation.quoteId },
          data: { 
            totalPrice: negotiation.price,
            status: 'accepted',
            termsConditions: negotiation.terms || quote.termsConditions,
          },
        });

        // Reject other quotes for the same RFQ
        await tx.quote.updateMany({
          where: {
            rfqId: quote.rfqId,
            id: { not: negotiation.quoteId },
            status: { in: ['pending', 'negotiating'] },
          },
          data: { status: 'rejected' },
        });

        // Update RFQ status to completed
        await tx.rfq.update({
          where: { id: quote.rfqId },
          data: { status: 'completed' },
        });

        // TODO: Create order from accepted quote
        // This would typically create an order record with the negotiated terms
        // For now, we'll just return success
        
        return { converted: true };
      });

      logger.info(`Counter-offer accepted and converted: ${negotiationId}`);
      return result;
    } catch (error) {
      logger.error('Error accepting counter-offer:', error);
      throw error;
    }
  }

  /**
   * Reject a counter-offer
   */
  private async rejectCounterOffer(negotiationId: string, _sellerId: string, message?: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // Update negotiation status
        await tx.negotiationHistory.update({
          where: { id: negotiationId },
          data: { 
            status: 'rejected',
            message: message || null,
          },
        });

        // Update quote status back to pending
        await tx.quote.update({
          where: { id: (await this.getNegotiationById(negotiationId)).quoteId },
          data: { status: 'pending' },
        });
      });

      logger.info(`Counter-offer rejected: ${negotiationId}`);
    } catch (error) {
      logger.error('Error rejecting counter-offer:', error);
      throw error;
    }
  }

  /**
   * Create a seller counter-offer
   */
  private async createSellerCounterOffer(
    sellerId: string, 
    originalNegotiationId: string, 
    data: {
      counterPrice: number;
      counterTerms?: string;
      message?: string;
      validUntil?: Date;
    }
  ): Promise<NegotiationHistory> {
    try {
      const originalNegotiation = await this.getNegotiationById(originalNegotiationId);

      // Check negotiation limits
      const negotiationHistory = await this.getNegotiationHistory(originalNegotiation.quoteId);
      if (negotiationHistory.negotiationRounds >= this.defaultSettings.maxNegotiationRounds) {
        throw new Error('Maximum negotiation rounds exceeded');
      }

      // Set default validity to 24 hours if not provided
      const validUntil = data.validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000);

      const negotiation = await prisma.$transaction(async (tx) => {
        // Update original negotiation status
        await tx.negotiationHistory.update({
          where: { id: originalNegotiationId },
          data: { status: 'rejected' },
        });

        // Create new counter-offer
        const newNegotiation = await tx.negotiationHistory.create({
          data: {
            quoteId: originalNegotiation.quoteId,
            fromUserId: sellerId,
            toUserId: originalNegotiation.fromUserId,
            offerType: 'counter',
            price: data.counterPrice,
            terms: data.counterTerms || null,
            message: data.message || null,
            status: 'pending',
            validUntil,
          },
        });

        return newNegotiation;
      });

      logger.info(`Seller counter-offer created: ${negotiation.id}`);
      return await this.getNegotiationById(negotiation.id);
    } catch (error) {
      logger.error('Error creating seller counter-offer:', error);
      throw error;
    }
  }

  /**
   * Get negotiation by ID with user details
   */
  async getNegotiationById(negotiationId: string): Promise<NegotiationHistory> {
    try {
      const negotiation = await prisma.negotiationHistory.findUnique({
        where: { id: negotiationId },
        include: {
          fromUser: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              verificationTier: true,
            },
          },
          toUser: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              verificationTier: true,
            },
          },
        },
      });

      if (!negotiation) {
        throw new Error('Negotiation not found');
      }

      return negotiation as any;
    } catch (error) {
      logger.error('Error fetching negotiation:', error);
      throw error;
    }
  }

  /**
   * Get complete negotiation history for a quote
   */
  async getNegotiationHistory(quoteId: string): Promise<NegotiationSummary> {
    try {
      const quote = await quoteService.getQuoteById(quoteId);
      
      // For now, we'll use the current quote price as the original price
      // In a real implementation, you might want to store the original price separately
      const originalPrice = Number(quote.totalPrice);

      // Get negotiations with user details
      const negotiationsWithUsers = await prisma.negotiationHistory.findMany({
        where: { quoteId },
        include: {
          fromUser: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              verificationTier: true,
            },
          },
          toUser: {
            select: {
              id: true,
              businessName: true,
              firstName: true,
              lastName: true,
              verificationTier: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Calculate summary metrics
      const negotiationRounds = negotiationsWithUsers.length;
      const lastNegotiation = negotiationsWithUsers[negotiationsWithUsers.length - 1];
      const currentPrice = lastNegotiation ? Number(lastNegotiation.price) : originalPrice;
      const priceReduction = originalPrice - currentPrice;
      const priceReductionPercentage = originalPrice > 0 ? (priceReduction / originalPrice) * 100 : 0;

      // Determine overall status
      let status: 'active' | 'completed' | 'expired' | 'cancelled' = 'active';
      if (quote.status === 'accepted') {
        status = 'completed';
      } else if (quote.status === 'rejected' || quote.status === 'withdrawn') {
        status = 'cancelled';
      } else if (lastNegotiation && lastNegotiation.validUntil && lastNegotiation.validUntil < new Date()) {
        status = 'expired';
      }

      const lastActivity = lastNegotiation ? lastNegotiation.createdAt : quote.createdAt;

      return {
        quoteId,
        originalPrice,
        currentPrice,
        priceReduction,
        priceReductionPercentage: Math.round(priceReductionPercentage * 100) / 100,
        negotiationRounds,
        status,
        lastActivity,
        history: negotiationsWithUsers as any,
      };
    } catch (error) {
      logger.error('Error fetching negotiation history:', error);
      throw error;
    }
  }

  /**
   * Process expired negotiations and handle timeouts
   */
  async processExpiredNegotiations(): Promise<{ expiredCount: number; processedNegotiations: string[] }> {
    try {
      // Find all pending negotiations that have expired
      const expiredNegotiations = await prisma.negotiationHistory.findMany({
        where: {
          status: 'pending',
          validUntil: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
          quoteId: true,
        },
      });

      if (expiredNegotiations.length === 0) {
        return { expiredCount: 0, processedNegotiations: [] };
      }

      // Update expired negotiations
      const negotiationIds = expiredNegotiations.map(n => n.id);
      
      await prisma.$transaction(async (tx) => {
        // Update negotiation status to expired
        await tx.negotiationHistory.updateMany({
          where: {
            id: { in: negotiationIds },
          },
          data: { status: 'expired' },
        });

        // Update related quotes back to pending status
        const quoteIds = [...new Set(expiredNegotiations.map(n => n.quoteId))];
        await tx.quote.updateMany({
          where: {
            id: { in: quoteIds },
            status: 'negotiating',
          },
          data: { status: 'pending' },
        });
      });

      logger.info(`Processed ${expiredNegotiations.length} expired negotiations`);

      return {
        expiredCount: expiredNegotiations.length,
        processedNegotiations: negotiationIds,
      };
    } catch (error) {
      logger.error('Error processing expired negotiations:', error);
      throw error;
    }
  }

  /**
   * Get negotiation statistics for a user
   */
  async getUserNegotiationStats(userId: string): Promise<{
    totalNegotiations: number;
    activeNegotiations: number;
    completedNegotiations: number;
    averagePriceReduction: number;
    successRate: number;
    averageNegotiationRounds: number;
  }> {
    try {
      // Get all negotiations involving the user
      const negotiations = await prisma.negotiationHistory.findMany({
        where: {
          OR: [
            { fromUserId: userId },
            { toUserId: userId },
          ],
        },
        include: {
          quote: {
            select: {
              totalPrice: true,
              status: true,
            },
          },
        },
      });

      // Group by quote to get unique negotiations
      const negotiationsByQuote = new Map<string, any[]>();
      negotiations.forEach(n => {
        if (!negotiationsByQuote.has(n.quoteId)) {
          negotiationsByQuote.set(n.quoteId, []);
        }
        negotiationsByQuote.get(n.quoteId)!.push(n);
      });

      const totalNegotiations = negotiationsByQuote.size;
      let activeNegotiations = 0;
      let completedNegotiations = 0;
      let totalPriceReduction = 0;
      let totalRounds = 0;

      negotiationsByQuote.forEach((quoteNegotiations, _quoteId) => {
        const quote = quoteNegotiations[0].quote;
        const originalPrice = Number(quote.totalPrice);
        const lastNegotiation = quoteNegotiations[quoteNegotiations.length - 1];
        
        if (quote.status === 'accepted') {
          completedNegotiations++;
          const finalPrice = Number(lastNegotiation.price);
          const priceReduction = ((originalPrice - finalPrice) / originalPrice) * 100;
          totalPriceReduction += priceReduction;
        } else if (quote.status === 'negotiating') {
          activeNegotiations++;
        }

        totalRounds += quoteNegotiations.length;
      });

      const averagePriceReduction = completedNegotiations > 0 ? totalPriceReduction / completedNegotiations : 0;
      const successRate = totalNegotiations > 0 ? (completedNegotiations / totalNegotiations) * 100 : 0;
      const averageNegotiationRounds = totalNegotiations > 0 ? totalRounds / totalNegotiations : 0;

      return {
        totalNegotiations,
        activeNegotiations,
        completedNegotiations,
        averagePriceReduction: Math.round(averagePriceReduction * 100) / 100,
        successRate: Math.round(successRate * 100) / 100,
        averageNegotiationRounds: Math.round(averageNegotiationRounds * 100) / 100,
      };
    } catch (error) {
      logger.error('Error fetching user negotiation stats:', error);
      throw error;
    }
  }

  /**
   * Auto-convert negotiations based on settings
   */
  async processAutoConversion(settings: Partial<AutoConversionSettings> = {}): Promise<{
    convertedCount: number;
    convertedNegotiations: string[];
  }> {
    try {
      const finalSettings = { ...this.defaultSettings, ...settings };

      // Find negotiations that meet auto-conversion criteria
      const negotiations = await prisma.negotiationHistory.findMany({
        where: {
          status: 'pending',
          offerType: 'counter',
          createdAt: {
            lt: new Date(Date.now() - finalSettings.negotiationTimeout * 60 * 60 * 1000),
          },
        },
        include: {
          quote: {
            select: {
              totalPrice: true,
              status: true,
            },
          },
        },
      });

      const conversions: string[] = [];

      for (const negotiation of negotiations) {
        const originalPrice = Number(negotiation.quote.totalPrice);
        const counterPrice = Number(negotiation.price);
        const priceReductionPercentage = ((originalPrice - counterPrice) / originalPrice) * 100;

        // Check if within auto-accept threshold
        if (finalSettings.autoAcceptThreshold && 
            priceReductionPercentage <= finalSettings.autoAcceptThreshold) {
          try {
            await this.acceptCounterOffer(negotiation.id, negotiation.toUserId);
            conversions.push(negotiation.id);
            logger.info(`Auto-converted negotiation: ${negotiation.id}`);
          } catch (error) {
            logger.error(`Failed to auto-convert negotiation ${negotiation.id}:`, error);
          }
        }
      }

      return {
        convertedCount: conversions.length,
        convertedNegotiations: conversions,
      };
    } catch (error) {
      logger.error('Error processing auto-conversion:', error);
      throw error;
    }
  }
}

export const negotiationService = new NegotiationService();