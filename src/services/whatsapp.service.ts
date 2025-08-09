import axios from 'axios';
import { logger } from '../utils/logger';

export class WhatsAppService {
  private accessToken: string;
  private phoneNumberId: string;
  private businessAccountId: string;
  private webhookVerifyToken: string;
  private apiVersion: string;
  private baseUrl: string;
  private configured: boolean;

  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
    this.webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    
    this.configured = !!(
      this.accessToken &&
      this.phoneNumberId &&
      this.businessAccountId &&
      this.webhookVerifyToken
    );
  }

  /**
   * Get service status and configuration
   */
  getStatus() {
    return {
      configured: this.configured,
      config: {
        apiVersion: this.apiVersion,
        phoneNumberId: this.phoneNumberId,
        businessAccountId: this.businessAccountId,
      },
    };
  }

  /**
   * Verify webhook subscription
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Format phone number for WhatsApp API
   */
  formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle Indian numbers
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      return '91' + cleaned.substring(1);
    } else if (cleaned.length === 10) {
      return '91' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Format RFQ message
   */
  formatRFQMessage(rfq: {
    id: string;
    title: string;
    description: string;
    quantity: number;
    budget: number;
    deadline: Date;
    buyer: { firstName: string; lastName: string; businessName?: string };
  }): string {
    const buyerName = rfq.buyer.businessName || `${rfq.buyer.firstName} ${rfq.buyer.lastName}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://vikareta.com';
    
    return `🔔 *New RFQ Alert*

📋 *Title:* ${rfq.title}
📝 *Description:* ${rfq.description}
📦 *Quantity:* ${rfq.quantity}
💰 *Budget:* ₹${rfq.budget.toLocaleString()}
⏰ *Deadline:* ${rfq.deadline.toLocaleDateString()}
👤 *Buyer:* ${buyerName}

🔗 View Details: ${frontendUrl}/rfq/${rfq.id}

Reply with your best quote! 💼`;
  }

  /**
   * Format quote message
   */
  formatQuoteMessage(quote: {
    id: string;
    rfqTitle: string;
    totalAmount: number;
    validUntil: Date;
    seller: { firstName: string; lastName: string; businessName?: string };
    items: Array<{ name: string; quantity: number; unitPrice: number }>;
  }): string {
    const sellerName = quote.seller.businessName || `${quote.seller.firstName} ${quote.seller.lastName}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://vikareta.com';
    
    let itemsList = '';
    quote.items.forEach(item => {
      itemsList += `• ${item.name}: ${item.quantity} × ₹${item.unitPrice} = ₹${(item.quantity * item.unitPrice).toLocaleString()}\\n`;
    });

    return `💼 *New Quote Received*

📋 *RFQ:* ${quote.rfqTitle}
👤 *From:* ${sellerName}
💰 *Total Amount:* ₹${quote.totalAmount.toLocaleString()}
⏰ *Valid Until:* ${quote.validUntil.toLocaleDateString()}

📦 *Items:*
${itemsList}

🔗 View Quote: ${frontendUrl}/quote/${quote.id}

Accept or negotiate now! 🤝`;
  }

  /**
   * Format order update message
   */
  formatOrderUpdateMessage(order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    trackingNumber?: string;
    estimatedDelivery?: Date;
  }): string {
    const statusEmoji = this.getStatusEmoji(order.status);
    const frontendUrl = process.env.FRONTEND_URL || 'https://vikareta.com';
    
    let message = `${statusEmoji} *Order Update*

📦 *Order:* #${order.orderNumber}
📊 *Status:* ${order.status.toUpperCase()}
💰 *Amount:* ₹${order.totalAmount.toLocaleString()}`;

    if (order.trackingNumber) {
      message += `\\n🚚 *Tracking:* ${order.trackingNumber}`;
    }

    if (order.estimatedDelivery) {
      message += `\\n📅 *Est. Delivery:* ${order.estimatedDelivery.toLocaleDateString()}`;
    }

    message += `\\n\\n🔗 Track Order: ${frontendUrl}/orders/${order.id}`;

    return message;
  }

  /**
   * Get status emoji
   */
  getStatusEmoji(status: string): string {
    const emojiMap: Record<string, string> = {
      pending: '⏳',
      confirmed: '✅',
      processing: '⚙️',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '❌',
      refunded: '💸',
    };

    return emojiMap[status.toLowerCase()] || '📋';
  }

  /**
   * Send text message (alias for sendMessage)
   */
  async sendTextMessage(to: string, message: string): Promise<boolean> {
    return this.sendMessage(to, message);
  }

  /**
   * Send text message
   */
  async sendMessage(to: string, message: string): Promise<boolean> {
    if (!this.configured) {
      logger.error('WhatsApp service not configured');
      return false;
    }

    try {
      const formattedPhone = this.formatPhoneNumber(to);
      
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`WhatsApp message sent to ${formattedPhone}:`, response.data);
      return true;
    } catch (error) {
      logger.error('Failed to send WhatsApp message:', error);
      return false;
    }
  }

  /**
   * Send RFQ notification
   */
  async sendRFQNotification(to: string, rfq: any): Promise<boolean> {
    const message = this.formatRFQMessage(rfq);
    return this.sendMessage(to, message);
  }

  /**
   * Send quote notification
   */
  async sendQuoteNotification(to: string, quote: any): Promise<boolean> {
    const message = this.formatQuoteMessage(quote);
    return this.sendMessage(to, message);
  }

  /**
   * Send order update notification
   */
  async sendOrderUpdate(to: string, order: any): Promise<boolean> {
    const message = this.formatOrderUpdateMessage(order);
    return this.sendMessage(to, message);
  }

  /**
   * Send payment link
   */
  async sendPaymentLink(to: string, orderId: string, amount: number, paymentUrl: string): Promise<boolean> {
    const message = `💳 *Payment Required*

📦 *Order:* #${orderId}
💰 *Amount:* ₹${amount.toLocaleString()}

🔗 Pay Now: ${paymentUrl}

Complete your payment to confirm your order! 🛒`;

    return this.sendMessage(to, message);
  }

  /**
   * Process webhook message (alias for handleWebhook)
   */
  async processWebhookMessage(message: any): Promise<void> {
    return this.handleWebhook(message);
  }

  /**
   * Handle incoming webhook
   */
  async handleWebhook(body: any): Promise<void> {
    try {
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              await this.processMessage(change.value);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error processing WhatsApp webhook:', error);
    }
  }

  /**
   * Process incoming message
   */
  private async processMessage(value: any): Promise<void> {
    if (value.messages) {
      for (const message of value.messages) {
        logger.info('Received WhatsApp message:', message);
        
        // Here you would implement your message processing logic
        // For example, handling customer inquiries, order status requests, etc.
        
        if (message.type === 'text') {
          const text = message.text.body.toLowerCase();
          const from = message.from;
          
          // Simple auto-responses
          if (text.includes('help') || text.includes('support')) {
            await this.sendMessage(from, 'Hello! For support, please visit our website or call our customer service. 📞');
          } else if (text.includes('order') || text.includes('status')) {
            await this.sendMessage(from, 'To check your order status, please visit your dashboard on our website. 📦');
          }
        }
      }
    }
  }
}