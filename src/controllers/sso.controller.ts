import { Request, Response } from 'express';
import { ssoService } from '@/services/sso.service';
import { AuthService } from '@/services/auth.service';
import { SubscriptionService } from '@/services/subscription.service';

const authService = new AuthService();
const subscriptionService = new SubscriptionService();

export class SSOController {
  async init(req: Request, res: Response) {
    const userId = req.user!.id;
    const { targetApp } = req.body; // 'web' | 'dashboard' | 'admin'
    if (!targetApp) {
      return res.status(400).json({ success: false, error: 'targetApp required' });
    }
    const token = await ssoService.createToken(userId, targetApp);
    const targetUrl = this.resolveTargetUrl(targetApp);
    const redirectUrl = `${targetUrl}/sso/callback?token=${token}`;
    res.json({ success: true, data: { token, redirectUrl } });
  }

  async exchange(req: Request, res: Response) {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, error: 'token required' });
      const data = await ssoService.exchange(token);
      const user = await authService['userService'].getUserById(data.userId);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      // Validate dashboard access for business users
      if (data.targetApp === 'dashboard') {
        // Check if user is a business (seller)
        if (user.userType !== 'seller') {
          return res.status(403).json({
            success: false,
            error: 'Access denied: Only business users can access the dashboard'
          });
        }

        // Check if user has an active subscription
        const currentSubscription = await subscriptionService.getCurrent(user.id);
        if (!currentSubscription || currentSubscription.status !== 'active') {
          return res.status(403).json({
            success: false,
            error: 'Access denied: Active subscription required to access dashboard'
          });
        }
      }

      const { accessToken, refreshToken } = authService.issueTokensForAudience(user, data.targetApp || 'web');
      res.json({ success: true, data: { accessToken, refreshToken, user, audience: data.targetApp } });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message || 'Invalid token' });
    }
  }

  private resolveTargetUrl(app: string): string {
    switch (app) {
      case 'dashboard':
        return process.env.DASHBOARD_URL || 'http://localhost:3100';
      case 'admin':
        return process.env.ADMIN_URL || 'http://localhost:3200';
      case 'web':
      default:
        return process.env.WEB_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    }
  }
}

export const ssoController = new SSOController();
