import axios from 'axios';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

export interface WhatsAppMessage {
  to: string;
  message: string;
  type?: 'text' | 'template' | 'media';
  templateName?: string;
  templateParams?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'document' | 'video';
}

export class WhatsAppService {
  private apiUrl: string;
  private accessToken: string;
  private businessAccountId: string;

  constructor() {
    this.apiUrl = config.whatsapp.apiUrl || '';
    this.accessToken = config.whatsapp.accessToken || '';
    this.businessAccountId = config.whatsapp.businessAccountId || '';
  }

  /**
   * Send WhatsApp message
   */
  async sendMessage(messageData: WhatsAppMessage): Promise<void> {
    try {
      if (!this.apiUrl || !this.accessToken) {
        logger.warn('WhatsApp service not configured, skipping message send');
        return;
      }

      const payload = {
        apikey: this.accessToken,
        to: messageData.to,
        message: messageData.message,
        type: messageData.type || 'text',
      };

      // Add template-specific data
      if (messageData.type === 'template' && messageData.templateName) {
        Object.assign(payload, {
          template_name: messageData.templateName,
          template_params: messageData.templateParams || [],
        });
      }

      // Add media-specific data
      if (messageData.type === 'media' && messageData.mediaUrl) {
        Object.assign(payload, {
          media_url: messageData.mediaUrl,
          media_type: messageData.mediaType || 'image',
        });
      }

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      logger.info('WhatsApp message sent successfully', {
        to: messageData.to,
        messageId: response.data.messageId,
        type: messageData.type,
      });
    } catch (error) {
      logger.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Send welcome message
   */
  async sendWelcomeMessage(to: string, userName: string): Promise<void> {
    const message = `🎉 Welcome to Vikareta, ${userName}!\n\nYour B2B marketplace journey starts here. Discover thousands of products, connect with verified suppliers, and grow your business.\n\n✅ Browse products & services\n✅ Post RFQs & get quotes\n✅ Secure payments & fast delivery\n\nNeed help? Just reply to this message!`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send order confirmation message
   */
  async sendOrderConfirmation(to: string, orderData: any): Promise<void> {
    const message = `📦 Order Confirmed!\n\nOrder #${orderData.orderNumber}\nAmount: ₹${orderData.totalAmount}\nDate: ${new Date(orderData.createdAt).toLocaleDateString()}\n\nWe'll keep you updated on your order status. Track your order in the Vikareta app.`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send order status update
   */
  async sendOrderStatusUpdate(to: string, orderNumber: string, status: string, trackingNumber?: string): Promise<void> {
    let message = `📋 Order Update\n\nOrder #${orderNumber}\nStatus: ${status.toUpperCase()}\n`;

    if (trackingNumber) {
      message += `Tracking: ${trackingNumber}\n`;
    }

    message += `\nTrack your order in the Vikareta app for real-time updates.`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(to: string, amount: number, orderNumber: string): Promise<void> {
    const message = `💳 Payment Received!\n\nAmount: ₹${amount}\nOrder: #${orderNumber}\nDate: ${new Date().toLocaleDateString()}\n\nThank you for your payment. Your order is being processed.`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send RFQ notification
   */
  async sendRFQNotification(to: string, rfqData: any): Promise<void> {
    const message = `🔔 New RFQ Opportunity!\n\n"${rfqData.title}"\n\nCategory: ${rfqData.category}\nBudget: ₹${rfqData.budgetMin} - ₹${rfqData.budgetMax}\nDeadline: ${rfqData.deliveryTimeline}\n\nLogin to submit your quote and win this business!`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send quote received notification
   */
  async sendQuoteReceived(to: string, quoteData: any): Promise<void> {
    const message = `📝 New Quote Received!\n\nRFQ: "${quoteData.rfq.title}"\nQuote Amount: ₹${quoteData.totalPrice}\nSupplier: ${quoteData.seller.businessName}\n\nReview and compare quotes in your Vikareta dashboard.`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send verification OTP
   */
  async sendVerificationOTP(to: string, otp: string): Promise<void> {
    const message = `🔐 Vikareta Verification\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes. Do not share this code with anyone.`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send low stock alert
   */
  async sendLowStockAlert(to: string, productName: string, currentStock: number): Promise<void> {
    const message = `⚠️ Low Stock Alert!\n\nProduct: ${productName}\nCurrent Stock: ${currentStock} units\n\nRestock soon to avoid missing sales opportunities.`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Send promotional message
   */
  async sendPromotionalMessage(to: string, promoData: any): Promise<void> {
    const message = `🎯 Special Offer!\n\n${promoData.title}\n\n${promoData.description}\n\nOffer valid till: ${promoData.validTill}\n\nShop now on Vikareta!`;

    await this.sendMessage({
      to,
      message,
      type: 'text',
    });
  }

  /**
   * Check if WhatsApp service is configured
   */
  isConfigured(): boolean {
    return !!(this.apiUrl && this.accessToken && this.businessAccountId);
  }
}