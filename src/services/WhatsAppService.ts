import axios from 'axios';
import { WhatsAppMessage, OrderNotification } from '../types/payment';

export class WhatsAppService {
  private static instance: WhatsAppService;
  private accessToken: string;
  private phoneNumberId: string;
  private businessAccountId: string;
  private baseUrl: string;
  private isEnabled: boolean;

  private constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
    this.baseUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0';
    this.isEnabled = process.env.WHATSAPP_ENABLED === 'true';
  }

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  private async sendMessage(message: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isEnabled) {
      console.log('WhatsApp service is disabled');
      return { success: false, error: 'WhatsApp service is disabled' };
    }

    if (!this.accessToken || !this.phoneNumberId) {
      console.error('WhatsApp configuration missing');
      return { success: false, error: 'WhatsApp configuration missing' };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: message.to,
          type: message.type,
          [message.type]: message.content
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id
      };
    } catch (error: any) {
      console.error('WhatsApp message sending failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Failed to send WhatsApp message'
      };
    }
  }

  public async sendOrderNotification(notification: OrderNotification): Promise<{ success: boolean; error?: string }> {
    try {
      // Get customer/supplier phone number (this would come from your database)
      const phoneNumber = await this.getPhoneNumber(notification.buyerId, notification.supplierId);
      
      if (!phoneNumber) {
        return { success: false, error: 'Phone number not available' };
      }

      let message: string;
      
      switch (notification.type) {
        case 'order_placed':
          message = `🛒 *New Order Placed*\n\nOrder ID: #${notification.orderId}\nStatus: ${notification.status}\n\n${notification.message}\n\nTrack your order: ${process.env.FRONTEND_URL}/orders/${notification.orderId}\n\n*Vikareta B2B Marketplace*`;
          break;
          
        case 'order_confirmed':
          message = `✅ *Order Confirmed*\n\nOrder ID: #${notification.orderId}\nStatus: ${notification.status}\n\n${notification.message}\n\nExpected delivery details will be shared soon.\n\n*Vikareta B2B Marketplace*`;
          break;
          
        case 'order_shipped':
          message = `🚛 *Order Shipped*\n\nOrder ID: #${notification.orderId}\nStatus: ${notification.status}\n\n${notification.message}\n\nTrack your shipment: ${process.env.FRONTEND_URL}/orders/${notification.orderId}/track\n\n*Vikareta B2B Marketplace*`;
          break;
          
        case 'order_delivered':
          message = `📦 *Order Delivered*\n\nOrder ID: #${notification.orderId}\nStatus: ${notification.status}\n\n${notification.message}\n\nThank you for shopping with Vikareta!\nPlease rate your experience: ${process.env.FRONTEND_URL}/orders/${notification.orderId}/review\n\n*Vikareta B2B Marketplace*`;
          break;
          
        case 'payment_received':
          message = `💳 *Payment Received*\n\nOrder ID: #${notification.orderId}\nAmount: ₹${notification.additionalData?.amount || 'N/A'}\n\n${notification.message}\n\nYour order is now being processed.\n\n*Vikareta B2B Marketplace*`;
          break;
          
        case 'rfq_received':
          message = `📋 *New RFQ Received*\n\nRFQ ID: #${notification.additionalData?.rfqId || 'N/A'}\nCategory: ${notification.additionalData?.category || 'N/A'}\n\n${notification.message}\n\nRespond to RFQ: ${process.env.FRONTEND_URL}/rfq/${notification.additionalData?.rfqId}\n\n*Vikareta B2B Marketplace*`;
          break;
          
        case 'quote_received':
          message = `💰 *New Quote Received*\n\nRFQ ID: #${notification.additionalData?.rfqId || 'N/A'}\nQuoted Price: ₹${notification.additionalData?.quotedPrice || 'N/A'}\nSupplier: ${notification.additionalData?.supplierName || 'N/A'}\n\n${notification.message}\n\nView quote: ${process.env.FRONTEND_URL}/rfq/${notification.additionalData?.rfqId}/quotes\n\n*Vikareta B2B Marketplace*`;
          break;
          
        default:
          message = `📢 *Update*\n\nOrder ID: #${notification.orderId}\nStatus: ${notification.status}\n\n${notification.message}\n\n*Vikareta B2B Marketplace*`;
      }

      const whatsappMessage: WhatsAppMessage = {
        to: phoneNumber,
        type: 'text',
        content: message
      };

      return await this.sendMessage(whatsappMessage);
      
    } catch (error: any) {
      console.error('Failed to send order notification:', error);
      return {
        success: false,
        error: error.message || 'Failed to send order notification'
      };
    }
  }

  public async sendBulkNotifications(notifications: OrderNotification[]): Promise<{
    success: boolean;
    results: Array<{ orderId: string; success: boolean; error?: string }>;
    successCount: number;
    failureCount: number;
  }> {
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const notification of notifications) {
      try {
        const result = await this.sendOrderNotification(notification);
        
        results.push({
          orderId: notification.orderId,
          success: result.success,
          error: result.error
        });

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        results.push({
          orderId: notification.orderId,
          success: false,
          error: error.message || 'Failed to send notification'
        });
        failureCount++;
      }
    }

    return {
      success: failureCount === 0,
      results,
      successCount,
      failureCount
    };
  }

  public async sendCustomMessage(to: string, message: string): Promise<{ success: boolean; error?: string }> {
    const whatsappMessage: WhatsAppMessage = {
      to,
      type: 'text',
      content: message
    };

    return await this.sendMessage(whatsappMessage);
  }

  public async sendTemplateMessage(to: string, templateName: string, parameters: any[]): Promise<{ success: boolean; error?: string }> {
    const templateMessage: WhatsAppMessage = {
      to,
      type: 'template',
      content: {
        name: templateName,
        language: 'en',
        components: [
          {
            type: 'body',
            parameters: parameters.map(param => ({
              type: 'text',
              text: param.toString()
            }))
          }
        ]
      }
    };

    return await this.sendMessage(templateMessage);
  }

  private async getPhoneNumber(buyerId: string, supplierId?: string): Promise<string | null> {
    try {
      // This would typically query your user database
      // For now, returning a placeholder implementation
      
      // TODO: Implement actual database query
      // const user = await this.userService.getUser(buyerId || supplierId);
      // return user?.phone;
      
      // Placeholder - you would replace this with actual database logic
      console.log(`Getting phone number for buyer: ${buyerId}, supplier: ${supplierId}`);
      return null;
      
    } catch (error) {
      console.error('Failed to get phone number:', error);
      return null;
    }
  }

  public async verifyWebhook(verifyToken: string, challenge: string): Promise<string | null> {
    const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    
    if (verifyToken === expectedToken) {
      return challenge;
    }
    
    return null;
  }

  public async handleIncomingMessage(webhookData: any): Promise<{ success: boolean; message?: string }> {
    try {
      if (webhookData.object === 'whatsapp_business_account') {
        for (const entry of webhookData.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'messages' && change.value.messages) {
                for (const message of change.value.messages) {
                  await this.processIncomingMessage(message, change.value.contacts?.[0]);
                }
              }
            }
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to handle incoming WhatsApp message:', error);
      return {
        success: false,
        message: error.message || 'Failed to process incoming message'
      };
    }
  }

  private async processIncomingMessage(message: any, _contact: any): Promise<void> {
    try {
      const from = message.from;
      const messageText = message.text?.body?.toLowerCase() || '';

      console.log(`Incoming WhatsApp message from ${from}: ${messageText}`);

      // Auto-reply logic for common queries
      if (messageText.includes('order status') || messageText.includes('track order')) {
        await this.sendCustomMessage(from, 
          `To check your order status, please visit: ${process.env.FRONTEND_URL}/account/orders\n\nOr reply with your order ID for instant status.`
        );
      } else if (messageText.includes('help') || messageText.includes('support')) {
        await this.sendCustomMessage(from,
          `🤝 *Vikareta Support*\n\nWe're here to help!\n\n📧 Email: support@vikareta.com\n📞 Phone: +91-XXXXXXXXXX\n🌐 Website: ${process.env.FRONTEND_URL}/support\n\nFor immediate assistance, please visit our support portal.`
        );
      } else if (messageText.match(/^VKR_\d+/)) {
        // If message looks like an order ID
        const orderId = messageText.match(/^VKR_\d+/)?.[0];
        if (orderId) {
          // TODO: Implement order status lookup
          await this.sendCustomMessage(from,
            `🔍 Looking up order ${orderId}...\n\nFor detailed status, please visit: ${process.env.FRONTEND_URL}/orders/${orderId}`
          );
        }
      } else {
        // Default response for unrecognized messages
        await this.sendCustomMessage(from,
          `Thank you for contacting Vikareta! 🙏\n\nFor quick assistance:\n• Order Status: Reply "order status"\n• Help: Reply "help"\n• Order ID: Send your order number\n\nOur team will respond soon!`
        );
      }

      // TODO: Log the message to database for customer service
      
    } catch (error) {
      console.error('Failed to process incoming message:', error);
    }
  }
}

export const whatsAppService = WhatsAppService.getInstance();