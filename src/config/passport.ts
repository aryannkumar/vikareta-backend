import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import { config } from './environment';
import { SocialAuthService, GoogleProfile, LinkedInProfile } from '@/services/social-auth.service';
import { logger } from '@/utils/logger';

// Log essential Google OAuth configuration at startup (non-sensitive)
try {
  const clientId = config.oauth.google.clientId || '';
  const clientIdSuffix = clientId ? clientId.slice(-12) : 'unset';
  const cb = config.oauth.google.callbackUrl || 'unset';
  logger.info('OAuth(Google) config loaded', { clientIdSuffix, callbackURL: cb });
} catch (e) {
  logger.warn('Failed to log Google OAuth config summary', { error: (e as any)?.message || String(e) });
}

// Configure Google OAuth Strategy
if (config.oauth.google.clientId && config.oauth.google.clientSecret) {
  // Log the exact configuration being used
  logger.info('Google OAuth Strategy configured', {
    clientIdSuffix: config.oauth.google.clientId.slice(-12),
    callbackURL: config.oauth.google.callbackUrl,
    hasClientSecret: !!config.oauth.google.clientSecret,
    secretLength: config.oauth.google.clientSecret.length,
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        callbackURL: config.oauth.google.callbackUrl,
        scope: ['profile', 'email'],
        userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          logger.info('Google OAuth strategy callback invoked successfully', {
            profileId: profile?.id,
            profileEmail: profile?.emails?.[0]?.value || 'no-email',
            hasAccessToken: !!accessToken,
            accessTokenLength: accessToken ? accessToken.length : 0,
            hasRefreshToken: !!refreshToken,
            profileEmails: profile?.emails?.length || 0,
            profileName: profile?.displayName || 'no-name',
            timestamp: new Date().toISOString(),
          });

          const primaryEmail = profile?.emails?.[0]?.value
            || profile?._json?.email
            || profile?.email
            || '';

          const googleProfile: GoogleProfile = {
            id: profile.id,
            email: primaryEmail,
            firstName: profile.name?.givenName || profile?._json?.given_name || undefined,
            lastName: profile.name?.familyName || profile?._json?.family_name || undefined,
            picture: profile.photos?.[0]?.value || profile?._json?.picture || undefined,
          };

          if (!googleProfile.email) {
            logger.error('Google OAuth: No email provided by Google', { profileId: profile?.id });
            return done(new Error('Email not provided by Google'), false);
          }

          logger.info('Google OAuth: About to call SocialAuthService', { 
            profileId: googleProfile.id,
            email: googleProfile.email,
          });

          const result = await SocialAuthService.handleGoogleAuth(
            googleProfile,
            accessToken,
            refreshToken
          );

          logger.info('Google OAuth: SocialAuthService completed successfully', { 
            userId: result?.user?.id,
            email: result?.user?.email,
            resultType: typeof result,
            hasUser: !!result?.user,
          });

          return done(null, result);
        } catch (error) {
          logger.error('Google OAuth strategy error in callback processing:', {
            error: (error as any)?.message || String(error),
            stack: (error as any)?.stack?.substring(0, 1000),
            profileId: profile?.id,
            timestamp: new Date().toISOString(),
          });
          return done(error, false);
        }
      }
    )
  );
} else {
  logger.warn('Google OAuth Strategy not configured - missing clientId or clientSecret');
}

// Configure LinkedIn OAuth Strategy
if (config.oauth.linkedin.clientId && config.oauth.linkedin.clientSecret) {
  passport.use(
    new LinkedInStrategy(
      {
        clientID: config.oauth.linkedin.clientId,
        clientSecret: config.oauth.linkedin.clientSecret,
        callbackURL: config.oauth.linkedin.callbackUrl,
        scope: ['r_emailaddress', 'r_liteprofile'],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const linkedinProfile: LinkedInProfile = {
            id: profile.id,
            email: profile.emails?.[0]?.value || '',
            firstName: profile.name?.givenName || undefined,
            lastName: profile.name?.familyName || undefined,
            picture: profile.photos?.[0]?.value || undefined,
            headline: profile.headline || undefined,
            industry: profile.industry || undefined,
            location: profile.location?.name || undefined,
          };

          if (!linkedinProfile.email) {
            return done(new Error('Email not provided by LinkedIn'), false);
          }

          const result = await SocialAuthService.handleLinkedInAuth(
            linkedinProfile,
            accessToken,
            refreshToken
          );

          return done(null, result);
        } catch (error) {
          logger.error('LinkedIn OAuth strategy error:', error);
          return done(error, false);
        }
      }
    )
  );
}

// Serialize user for session (not used in JWT setup, but required by passport)
passport.serializeUser((user: any, done) => {
  done(null, user);
});

// Deserialize user from session (not used in JWT setup, but required by passport)
passport.deserializeUser((user: any, done) => {
  done(null, user);
});

export default passport;