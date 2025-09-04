import axios from 'axios';
import { logger } from '@/utils/logger';

export interface SMSData {
  to: string;
  message: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export class SMSService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    // Configure SMS service (example with a generic SMS provider)
    this.apiUrl = process.env.SMS_API_URL || '';
    this.apiKey = process.env.SMS_API_KEY || '';
  }

  /**
   * Send SMS
   */
  async sendSMS(smsData: SMSData): Promise<void> {
    try {
      if (!this.apiUrl || !this.apiKey) {
        logger.warn('SMS service not configured, skipping SMS send');
        return;
      }

      const response = await axios.post(
        this.apiUrl,
        {
          to: smsData.to,
          message: smsData.message,
          templateId: smsData.templateId,
          variables: smsData.variables,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('SMS sent successfully', {
        to: smsData.to,
        messageId: response.data.messageId,
      });
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw error;
    }
  }

  /**
   * Send OTP SMS
   */
  async sendOTP(to: string, otp: string): Promise<void> {
    const message = `Your Vikareta verification code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;
    
    await this.sendSMS({
      to,
      message,
    });
  }

  /**
   * Send order update SMS
   */
  async sendOrderUpdateSMS(to: string, orderNumber: string, status: string): Promise<void> {
    const message = `Your order ${orderNumber} has been ${status}. Track your order on Vikareta app.`;
    
    await this.sendSMS({
      to,
      message,
    });
  }

  /**
   * Send payment confirmation SMS
   */
  async sendPaymentConfirmationSMS(to: string, amount: number, orderNumber: string): Promise<void> {
    const message = `Payment of ₹${amount} received for order ${orderNumber}. Thank you for choosing Vikareta!`;
    
    await this.sendSMS({
      to,
      message,
    });
  }

  /**
   * Send RFQ notification SMS
   */
  async sendRFQNotificationSMS(to: string, rfqTitle: string): Promise<void> {
    const message = `New RFQ opportunity: "${rfqTitle}". Login to Vikareta to submit your quote.`;
    
    await this.sendSMS({
      to,
      message,
    });
  }

  /**
   * Verify phone number with OTP
   */
  async sendVerificationSMS(to: string, otp: string): Promise<void> {
    const message = `Welcome to Vikareta! Your phone verification code is: ${otp}. Enter this code to complete your registration.`;
    
    await this.sendSMS({
      to,
      message,
    });
  }
}