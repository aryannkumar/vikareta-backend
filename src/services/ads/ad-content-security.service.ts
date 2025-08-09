import { logger } from '@/utils/logger';
import DOMPurify from 'isomorphic-dompurify';

// Content validation interfaces
export interface ContentValidationResult {
  isValid: boolean;
  violations: ContentViolation[];
  sanitizedContent?: any;
  riskScore: number;
}

export interface ContentViolation {
  type: ViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  suggestedFix?: string;
}

export type ViolationType = 
  | 'malicious_script'
  | 'xss_attempt'
  | 'inappropriate_content'
  | 'malicious_url'
  | 'phishing_attempt'
  | 'spam_content'
  | 'copyright_violation'
  | 'misleading_claims'
  | 'adult_content'
  | 'violence_content';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface SecurityValidationOptions {
  enableXSSProtection?: boolean;
  enableContentFiltering?: boolean;
  enableURLValidation?: boolean;
  enableImageValidation?: boolean;
  strictMode?: boolean;
}

class AdContentSecurityService {
  private readonly MALICIOUS_PATTERNS = [
    // JavaScript injection patterns
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
    /eval\s*\(/gi,
    /setTimeout\s*\(/gi,
    /setInterval\s*\(/gi,
    /Function\s*\(/gi,
    
    // Data URI schemes that could be malicious
    /data:text\/html/gi,
    /data:application\/javascript/gi,
    
    // Iframe injection
    /<iframe\b[^>]*>/gi,
    /<object\b[^>]*>/gi,
    /<embed\b[^>]*>/gi,
    /<applet\b[^>]*>/gi,
    
    // Form injection
    /<form\b[^>]*>/gi,
    /<input\b[^>]*>/gi,
    /<textarea\b[^>]*>/gi,
    
    // Meta refresh redirects
    /<meta\b[^>]*http-equiv\s*=\s*["\']refresh["\'][^>]*>/gi,
  ];

  private readonly INAPPROPRIATE_KEYWORDS = [
    // Adult content
    'porn', 'xxx', 'adult', 'sex', 'nude', 'naked', 'erotic',
    
    // Violence
    'kill', 'murder', 'violence', 'weapon', 'gun', 'bomb', 'terrorist',
    
    // Drugs
    'drug', 'cocaine', 'heroin', 'marijuana', 'cannabis',
    
    // Gambling (if restricted)
    'casino', 'gambling', 'poker', 'bet', 'lottery',
    
    // Hate speech
    'hate', 'racist', 'nazi', 'terrorist',
    
    // Spam indicators
    'get rich quick', 'make money fast', 'guaranteed income', 'work from home',
    'lose weight fast', 'miracle cure', 'free money', 'no risk',
  ];

  private readonly SUSPICIOUS_URLS = [
    // URL shorteners that could hide malicious links
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'short.link',
    
    // Known malicious domains (examples)
    'malware.com', 'phishing.net', 'scam.org',
    
    // Suspicious TLDs
    '.tk', '.ml', '.ga', '.cf', // Free domains often used for malicious purposes
  ];

  private readonly MISLEADING_CLAIMS = [
    'guaranteed', '100% effective', 'miracle', 'instant results',
    'doctors hate this', 'secret method', 'breakthrough discovery',
    'lose 30 pounds in 30 days', 'make $1000 per day', 'risk-free',
    'limited time only', 'act now', 'exclusive offer',
  ];

  /**
   * Validate advertisement content for security and policy violations
   */
  async validateAdContent(content: {
    title: string;
    description: string;
    html?: string;
    images?: string[];
    videos?: string[];
    destinationUrl: string;
    callToAction: string;
  }, options: SecurityValidationOptions = {}): Promise<ContentValidationResult> {
    try {
      const violations: ContentViolation[] = [];
      let riskScore = 0;
      let sanitizedContent = { ...content };

      const {
        enableXSSProtection = true,
        enableContentFiltering = true,
        enableURLValidation = true,
        enableImageValidation = true,
        strictMode = false,
      } = options;

      // 1. XSS and malicious script detection
      if (enableXSSProtection) {
        const xssResults = this.detectXSSAttempts(content);
        violations.push(...xssResults.violations);
        riskScore += xssResults.riskScore;
        
        // Sanitize HTML content
        if (content.html) {
          sanitizedContent.html = this.sanitizeHTML(content.html);
        }
      }

      // 2. Inappropriate content detection
      if (enableContentFiltering) {
        const contentResults = this.detectInappropriateContent(content);
        violations.push(...contentResults.violations);
        riskScore += contentResults.riskScore;
      }

      // 3. URL validation
      if (enableURLValidation) {
        const urlResults = await this.validateURLs(content);
        violations.push(...urlResults.violations);
        riskScore += urlResults.riskScore;
      }

      // 4. Image validation
      if (enableImageValidation && content.images) {
        const imageResults = await this.validateImages(content.images);
        violations.push(...imageResults.violations);
        riskScore += imageResults.riskScore;
      }

      // 5. Misleading claims detection
      const claimsResults = this.detectMisleadingClaims(content);
      violations.push(...claimsResults.violations);
      riskScore += claimsResults.riskScore;

      // 6. Spam detection
      const spamResults = this.detectSpamContent(content);
      violations.push(...spamResults.violations);
      riskScore += spamResults.riskScore;

      // Determine if content is valid based on violations and strict mode
      const criticalViolations = violations.filter(v => v.severity === 'critical');
      const highViolations = violations.filter(v => v.severity === 'high');
      
      const isValid = strictMode 
        ? violations.length === 0 
        : criticalViolations.length === 0 && highViolations.length < 3;

      return {
        isValid,
        violations,
        sanitizedContent, // Always return sanitized content
        riskScore: Math.min(riskScore, 100),
      };
    } catch (error) {
      logger.error('Error validating ad content:', error);
      return {
        isValid: false,
        violations: [{
          type: 'malicious_script',
          severity: 'critical',
          description: 'Content validation failed due to system error',
          suggestedFix: 'Please try again or contact support',
        }],
        riskScore: 100,
      };
    }
  }

  /**
   * Detect XSS attempts and malicious scripts
   */
  private detectXSSAttempts(content: any): { violations: ContentViolation[], riskScore: number } {
    const violations: ContentViolation[] = [];
    let riskScore = 0;

    const textFields = [content.title, content.description, content.html, content.callToAction]
      .filter(field => field && typeof field === 'string');
    
    for (const field of textFields) {
      for (const pattern of this.MALICIOUS_PATTERNS) {
        const matches = field.match(pattern);
        if (matches) {
          violations.push({
            type: 'xss_attempt',
            severity: 'critical',
            description: `Potential XSS or malicious script detected: ${matches[0].substring(0, 50)}...`,
            location: this.getFieldName(field, content),
            suggestedFix: 'Remove or properly escape the suspicious code',
          });
          riskScore += 30;
        }
      }

      // Check for encoded malicious content
      if (this.containsEncodedMaliciousContent(field)) {
        violations.push({
          type: 'xss_attempt',
          severity: 'high',
          description: 'Encoded potentially malicious content detected',
          location: this.getFieldName(field, content),
          suggestedFix: 'Remove encoded scripts or suspicious content',
        });
        riskScore += 20;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Detect inappropriate content
   */
  private detectInappropriateContent(content: any): { violations: ContentViolation[], riskScore: number } {
    const violations: ContentViolation[] = [];
    let riskScore = 0;

    const textContent = `${content.title || ''} ${content.description || ''} ${content.callToAction || ''}`.toLowerCase();

    for (const keyword of this.INAPPROPRIATE_KEYWORDS) {
      if (textContent.includes(keyword.toLowerCase())) {
        const severity = this.getKeywordSeverity(keyword);
        violations.push({
          type: 'inappropriate_content',
          severity,
          description: `Inappropriate content detected: "${keyword}"`,
          suggestedFix: 'Remove or replace the inappropriate content',
        });
        riskScore += severity === 'critical' ? 25 : severity === 'high' ? 15 : 10;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Validate URLs for malicious or suspicious content
   */
  private async validateURLs(content: any): Promise<{ violations: ContentViolation[], riskScore: number }> {
    const violations: ContentViolation[] = [];
    let riskScore = 0;

    const urls = [content.destinationUrl];
    
    // Extract URLs from HTML content if present
    if (content.html) {
      const urlMatches = content.html.match(/https?:\/\/[^\s"'<>]+/g);
      if (urlMatches) {
        urls.push(...urlMatches);
      }
    }

    for (const url of urls) {
      if (!url) continue;

      try {
        const urlObj = new URL(url);
        
        // Check against suspicious domains
        for (const suspiciousDomain of this.SUSPICIOUS_URLS) {
          if (urlObj.hostname.includes(suspiciousDomain)) {
            violations.push({
              type: 'malicious_url',
              severity: 'high',
              description: `Suspicious URL detected: ${urlObj.hostname}`,
              location: 'destinationUrl',
              suggestedFix: 'Use a trusted domain or provide more information about the destination',
            });
            riskScore += 20;
          }
        }

        // Check for suspicious URL patterns
        if (this.isSuspiciousURL(url)) {
          violations.push({
            type: 'phishing_attempt',
            severity: 'medium',
            description: 'URL contains suspicious patterns that may indicate phishing',
            location: 'destinationUrl',
            suggestedFix: 'Ensure the URL is legitimate and properly formatted',
          });
          riskScore += 15;
        }

        // Check for non-HTTPS URLs (security concern)
        if (urlObj.protocol !== 'https:') {
          violations.push({
            type: 'malicious_url',
            severity: 'low',
            description: 'Non-HTTPS URL detected, which may pose security risks',
            location: 'destinationUrl',
            suggestedFix: 'Use HTTPS URLs for better security',
          });
          riskScore += 5;
        }

      } catch (error) {
        violations.push({
          type: 'malicious_url',
          severity: 'medium',
          description: 'Invalid URL format detected',
          location: 'destinationUrl',
          suggestedFix: 'Provide a valid, properly formatted URL',
        });
        riskScore += 10;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Validate images for inappropriate content
   */
  private async validateImages(images: string[]): Promise<{ violations: ContentViolation[], riskScore: number }> {
    const violations: ContentViolation[] = [];
    let riskScore = 0;

    for (const imageUrl of images) {
      try {
        // Basic URL validation
        const url = new URL(imageUrl);
        
        // Check file extension
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const hasValidExtension = validExtensions.some(ext => 
          url.pathname.toLowerCase().endsWith(ext)
        );

        if (!hasValidExtension) {
          violations.push({
            type: 'malicious_script',
            severity: 'medium',
            description: 'Image URL does not have a valid image file extension',
            location: 'images',
            suggestedFix: 'Use images with valid extensions (.jpg, .png, .gif, etc.)',
          });
          riskScore += 10;
        }

        // Check for suspicious image hosting domains
        const suspiciousImageHosts = ['imgur.com', 'tinypic.com', 'photobucket.com'];
        if (suspiciousImageHosts.some(host => url.hostname.includes(host))) {
          violations.push({
            type: 'inappropriate_content',
            severity: 'low',
            description: 'Image hosted on potentially unreliable service',
            location: 'images',
            suggestedFix: 'Consider using a more reliable image hosting service',
          });
          riskScore += 5;
        }

      } catch (error) {
        violations.push({
          type: 'malicious_url',
          severity: 'medium',
          description: 'Invalid image URL format',
          location: 'images',
          suggestedFix: 'Provide valid image URLs',
        });
        riskScore += 10;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Detect misleading claims
   */
  private detectMisleadingClaims(content: any): { violations: ContentViolation[], riskScore: number } {
    const violations: ContentViolation[] = [];
    let riskScore = 0;

    const originalTextContent = `${content.title || ''} ${content.description || ''} ${content.callToAction || ''}`;
    const textContent = originalTextContent.toLowerCase();

    for (const claim of this.MISLEADING_CLAIMS) {
      if (textContent.includes(claim.toLowerCase())) {
        violations.push({
          type: 'misleading_claims',
          severity: 'medium',
          description: `Potentially misleading claim detected: "${claim}"`,
          suggestedFix: 'Provide evidence or remove exaggerated claims',
        });
        riskScore += 10;
      }
    }

    // Check for excessive use of capital letters (shouting)
    const letters = originalTextContent.match(/[a-zA-Z]/g) || [];
    const capitalLetters = originalTextContent.match(/[A-Z]/g) || [];
    const capsRatio = letters.length > 0 ? capitalLetters.length / letters.length : 0;
    
    if (capsRatio > 0.5 && letters.length > 10) { // More than 50% caps in meaningful text
      violations.push({
        type: 'spam_content',
        severity: 'low',
        description: 'Excessive use of capital letters detected',
        suggestedFix: 'Use normal capitalization for better readability',
      });
      riskScore += 5;
    }

    return { violations, riskScore };
  }

  /**
   * Detect spam content patterns
   */
  private detectSpamContent(content: any): { violations: ContentViolation[], riskScore: number } {
    const violations: ContentViolation[] = [];
    let riskScore = 0;

    const textContent = `${content.title || ''} ${content.description || ''}`;

    // Check for excessive repetition
    const words = textContent.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const wordCount = new Map<string, number>();
    
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    for (const [word, count] of wordCount.entries()) {
      if (count > 3 && words.length > 10) { // Word repeated more than 3 times in meaningful text
        violations.push({
          type: 'spam_content',
          severity: 'medium',
          description: `Excessive repetition of word "${word}" (${count} times)`,
          suggestedFix: 'Reduce repetitive content for better quality',
        });
        riskScore += 8;
      }
    }

    // Check for excessive punctuation
    const punctuationCount = (textContent.match(/[!?]{2,}/g) || []).length;
    if (punctuationCount > 3) {
      violations.push({
        type: 'spam_content',
        severity: 'low',
        description: 'Excessive punctuation detected',
        suggestedFix: 'Use normal punctuation for professional appearance',
      });
      riskScore += 5;
    }

    return { violations, riskScore };
  }

  /**
   * Sanitize HTML content to remove malicious elements
   */
  private sanitizeHTML(html: string): string {
    try {
      // Configure DOMPurify for advertisement content
      const config = {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        ALLOWED_ATTR: ['class', 'style'],
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
        FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'],
      };

      return DOMPurify.sanitize(html, config);
    } catch (error) {
      logger.error('Error sanitizing HTML:', error);
      // Return plain text if sanitization fails
      return html.replace(/<[^>]*>/g, '');
    }
  }

  /**
   * Check if content contains encoded malicious content
   */
  private containsEncodedMaliciousContent(content: string): boolean {
    // Check for various encoding schemes that might hide malicious content
    const encodedPatterns = [
      /&#x[0-9a-f]+;/gi, // Hex entities
      /&#[0-9]+;/gi, // Decimal entities
      /%[0-9a-f]{2}/gi, // URL encoding
      /\\u[0-9a-f]{4}/gi, // Unicode escapes
      /\\x[0-9a-f]{2}/gi, // Hex escapes
    ];

    return encodedPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get field name for violation location
   */
  private getFieldName(field: string, content: any): string {
    if (field === content.title) return 'title';
    if (field === content.description) return 'description';
    if (field === content.html) return 'html';
    if (field === content.callToAction) return 'callToAction';
    return 'unknown';
  }

  /**
   * Get severity level for inappropriate keywords
   */
  private getKeywordSeverity(keyword: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalKeywords = ['porn', 'xxx', 'kill', 'murder', 'terrorist', 'nazi'];
    const highKeywords = ['adult', 'violence', 'weapon', 'drug', 'hate'];
    
    if (criticalKeywords.includes(keyword.toLowerCase())) return 'critical';
    if (highKeywords.includes(keyword.toLowerCase())) return 'high';
    return 'medium';
  }

  /**
   * Check if URL has suspicious patterns
   */
  private isSuspiciousURL(url: string): boolean {
    const suspiciousPatterns = [
      /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // IP addresses
      /[a-z0-9]{20,}\./, // Very long subdomains
      /-{2,}/, // Multiple consecutive hyphens
      /\.(tk|ml|ga|cf)($|\/|:)/, // Suspicious TLDs
      /[0-9]{10,}/, // Long sequences of numbers
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Rate limiting implementation
   */
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  checkRateLimit(identifier: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const key = identifier;
    const existing = this.rateLimitStore.get(key);

    // Clean up expired entries
    if (existing && now > existing.resetTime) {
      this.rateLimitStore.delete(key);
    }

    const current = this.rateLimitStore.get(key) || { count: 0, resetTime: now + config.windowMs };

    if (current.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: current.resetTime,
      };
    }

    current.count++;
    this.rateLimitStore.set(key, current);

    return {
      allowed: true,
      remaining: config.maxRequests - current.count,
      resetTime: current.resetTime,
    };
  }

  /**
   * Clean up expired rate limit entries
   */
  cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [key, value] of this.rateLimitStore.entries()) {
      if (now > value.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}

export const adContentSecurityService = new AdContentSecurityService();
export { AdContentSecurityService };