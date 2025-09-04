import nodemailer from 'nodemailer';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

export interface EmailData {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: any[];
  data?: any;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.auth,
    });
  }

  /**
   * Send email
   */
  async sendEmail(emailData: EmailData): Promise<void> {
    try {
      const mailOptions = {
        from: `${config.email.from.name} <${config.email.from.email}>`,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        attachments: emailData.attachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: emailData.to,
        subject: emailData.subject,
      });
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Welcome to Vikareta!</h1>
        <p>Hello ${userName},</p>
        <p>Welcome to Vikareta B2B Marketplace. We're excited to have you on board!</p>
        <p>You can now:</p>
        <ul>
          <li>Browse thousands of products and services</li>
          <li>Connect with verified suppliers</li>
          <li>Post RFQs and receive quotes</li>
          <li>Manage your orders and payments</li>
        </ul>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Best regards,<br>The Vikareta Team</p>
      </div>
    `;

    await this.sendEmail({
      to,
      subject: 'Welcome to Vikareta B2B Marketplace',
      html,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const resetUrl = `${config.urls.frontend}/reset-password?token=${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Password Reset Request</h1>
        <p>You requested a password reset for your Vikareta account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">Reset Password</a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>The Vikareta Team</p>
      </div>
    `;

    await this.sendEmail({
      to,
      subject: 'Password Reset Request - Vikareta',
      html,
    });
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmationEmail(to: string, orderData: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Confirmation</h1>
        <p>Thank you for your order!</p>
        <div style="background-color: #f8f9fa; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <h3>Order Details</h3>
          <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
          <p><strong>Total Amount:</strong> ₹${orderData.totalAmount}</p>
          <p><strong>Order Date:</strong> ${new Date(orderData.createdAt).toLocaleDateString()}</p>
        </div>
        <p>You will receive updates about your order status via email and SMS.</p>
        <p>Best regards,<br>The Vikareta Team</p>
      </div>
    `;

    await this.sendEmail({
      to,
      subject: `Order Confirmation - ${orderData.orderNumber}`,
      html,
    });
  }

  /**
   * Send RFQ notification email
   */
  async sendRFQNotificationEmail(to: string, rfqData: any): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">New RFQ Opportunity</h1>
        <p>A new RFQ has been posted that matches your business category.</p>
        <div style="background-color: #f8f9fa; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <h3>RFQ Details</h3>
          <p><strong>Title:</strong> ${rfqData.title}</p>
          <p><strong>Category:</strong> ${rfqData.category}</p>
          <p><strong>Budget:</strong> ₹${rfqData.budgetMin} - ₹${rfqData.budgetMax}</p>
          <p><strong>Delivery Timeline:</strong> ${rfqData.deliveryTimeline}</p>
        </div>
        <p>Login to your account to view the full RFQ and submit your quote.</p>
        <p>Best regards,<br>The Vikareta Team</p>
      </div>
    `;

    await this.sendEmail({
      to,
      subject: 'New RFQ Opportunity - Vikareta',
      html,
    });
  }

  /**
   * Verify email configuration
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }
}