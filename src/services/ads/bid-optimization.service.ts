import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

let prisma: PrismaClient;

export interface BidOptimizationConfig {
  targetCPA?: number; // Target Cost Per Acquisition
  targetROAS?: number; // Target Return On Ad Spend
  maxCPC?: number; // Maximum Cost Per Click
  minCPC?: number; // Minimum Cost Per Click
  bidStrategy: 'maximize_clicks' | 'maximize_conversions' | 'target_cpa' | 'target_roas' | 'manual_cpc';
  budgetUtilization?: number; // 0-1, how much of budget to use
  aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
}

export interface BidSuggestion {
  campaignId: string;
  currentBid: number;
  suggestedBid: number;
  bidChange: number;
  bidChangePercentage: number;
  reason: string;
  confidence: number; // 0-1 scale
  expectedImpact: {
    clicksChange: number;
    conversionsChange: number;
    costChange: number;
    roasChange: number;
  };
  priority: 'high' | 'medium' | 'low';
}

export interface CompetitionAnalysis {
  campaignId: string;
  competitionLevel: 'low' | 'medium' | 'high';
  averageCompetitorBid: number;
  bidRange: {
    min: number;
    max: number;
    recommended: number;
  };
  marketShare: number; // 0-1 scale
  impressionShare: number; // 0-1 scale
  topOfPageRate: number; // 0-1 scale
  competitorCount: number;
  seasonalTrends: {
    trend: 'increasing' | 'decreasing' | 'stable';
    factor: number; // multiplier
  };
}

export interface BidOptimizationResult {
  campaignId: string;
  optimizationType: 'bid_adjustment' | 'budget_reallocation' | 'targeting_refinement';
  currentPerformance: {
    cpc: number;
    ctr: number;
    conversions: number;
    roas: number;
    impressionShare: number;
  };
  optimizedSettings: {
    bidAmount: number;
    dailyBudget?: number;
    targetingAdjustments?: any;
  };
  projectedPerformance: {
    cpc: number;
    ctr: number;
    conversions: number;
    roas: number;
    impressionShare: number;
  };
  confidence: number;
  implementationPriority: 'immediate' | 'within_24h' | 'within_week';
}

export interface PerformanceMetrics {
  campaignId: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  cpc: number;
  ctr: number;
  cpa: number;
  roas: number;
  qualityScore?: number;
  impressionShare?: number;
}

export class BidOptimizationService {
  constructor(prismaClient?: PrismaClient) {
    prisma = prismaClient || new PrismaClient();
  }

  /**
   * Generate bid optimization suggestions for a campaign
   */
  async generateBidOptimizations(
    campaignId: string,
    config: BidOptimizationConfig
  ): Promise<BidOptimizationResult> {
    try {
      logger.info('Generating bid optimizations for campaign:', { campaignId, config });

      // Get campaign performance data
      const performance = await this.getCampaignPerformance(campaignId);
      
      // Validate performance data
      if (!performance) {
        throw new Error('Unable to get campaign performance data');
      }
      
      // Log performance summary for debugging
      logger.debug('Campaign performance summary:', {
        campaignId,
        cpc: performance.cpc,
        ctr: performance.ctr,
        conversions: performance.conversions,
      });
      
      // Analyze competition
      const competition = await this.analyzeCompetition(campaignId);
      
      // Generate optimization based on strategy
      const optimization = await this.calculateOptimization(performance, competition, config);

      logger.info('Bid optimization generated:', {
        campaignId,
        optimizationType: optimization.optimizationType,
        confidence: optimization.confidence,
      });

      return optimization;
    } catch (error) {
      logger.error('Error generating bid optimizations:', error);
      throw new Error('Failed to generate bid optimizations');
    }
  }

  /**
   * Generate bid suggestions for multiple campaigns
   */
  async generateBidSuggestions(
    campaignIds: string[],
    config: BidOptimizationConfig
  ): Promise<BidSuggestion[]> {
    try {
      logger.info('Generating bid suggestions for campaigns:', { campaignIds, config });

      const suggestions: BidSuggestion[] = [];

      for (const campaignId of campaignIds) {
        try {
          const suggestion = await this.generateCampaignBidSuggestion(campaignId, config);
          suggestions.push(suggestion);
        } catch (error) {
          logger.warn('Failed to generate bid suggestion for campaign:', { campaignId, error });
          // Continue with other campaigns
        }
      }

      // Sort by priority and confidence
      suggestions.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.confidence - a.confidence;
      });

      logger.info('Bid suggestions generated:', {
        totalCampaigns: campaignIds.length,
        successfulSuggestions: suggestions.length,
      });

      return suggestions;
    } catch (error) {
      logger.error('Error generating bid suggestions:', error);
      throw new Error('Failed to generate bid suggestions');
    }
  }

  /**
   * Analyze competition for a campaign
   */
  async analyzeCompetition(campaignId: string): Promise<CompetitionAnalysis> {
    try {
      logger.info('Analyzing competition for campaign:', campaignId);

      // Get campaign details
      const campaign = await this.getCampaignDetails(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get similar campaigns for competition analysis
      const similarCampaigns = await this.getSimilarCampaigns(campaign);

      // Calculate competition metrics
      const competitionLevel = this.calculateCompetitionLevel(similarCampaigns.length);
      const averageCompetitorBid = this.calculateAverageCompetitorBid(similarCampaigns);
      const bidRange = this.calculateBidRange(averageCompetitorBid, competitionLevel);
      
      // Calculate market metrics (simplified for demo)
      const marketShare = Math.random() * 0.3; // 0-30% market share
      const impressionShare = Math.random() * 0.8 + 0.2; // 20-100% impression share
      const topOfPageRate = Math.random() * 0.6 + 0.4; // 40-100% top of page rate

      // Analyze seasonal trends
      const seasonalTrends = this.analyzeSeasonalTrends();

      const analysis: CompetitionAnalysis = {
        campaignId,
        competitionLevel,
        averageCompetitorBid,
        bidRange,
        marketShare,
        impressionShare,
        topOfPageRate,
        competitorCount: similarCampaigns.length,
        seasonalTrends,
      };

      logger.info('Competition analysis completed:', {
        campaignId,
        competitionLevel,
        competitorCount: similarCampaigns.length,
      });

      return analysis;
    } catch (error) {
      logger.error('Error analyzing competition:', error);
      if (error instanceof Error && error.message === 'Campaign not found') {
        throw error;
      }
      // For database connection errors, throw the generic error message
      throw new Error('Failed to analyze competition');
    }
  }

  /**
   * Perform real-time bid adjustments based on current performance
   */
  async performRealTimeBidAdjustment(
    campaignId: string,
    currentMetrics: {
      impressions: number;
      clicks: number;
      conversions: number;
      spend: number;
      timeWindow: number; // minutes
    }
  ): Promise<{
    shouldAdjust: boolean;
    newBid?: number;
    adjustmentReason: string;
    urgency: 'low' | 'medium' | 'high';
  }> {
    try {
      logger.info('Performing real-time bid adjustment:', { campaignId, currentMetrics });

      const campaign = await this.getCampaignDetails(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const currentBid = campaign.bidAmount.toNumber();
      const { impressions, clicks, conversions, spend, timeWindow } = currentMetrics;

      // Calculate current performance rates
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      // Get historical performance for comparison
      const historicalPerformance = await this.getCampaignPerformance(campaignId);
      
      let shouldAdjust = false;
      let newBid = currentBid;
      let adjustmentReason = 'No adjustment needed';
      let urgency: 'low' | 'medium' | 'high' = 'low';

      // Check for performance anomalies that require immediate adjustment
      if (timeWindow >= 60 && impressions > 100) { // At least 1 hour of data with sufficient volume
        // CTR significantly below historical average
        if (ctr < historicalPerformance.ctr * 0.5 && historicalPerformance.ctr > 1) {
          shouldAdjust = true;
          newBid = currentBid * 1.2; // Increase bid to improve position
          adjustmentReason = 'CTR significantly below historical average, increasing bid to improve ad position';
          urgency = 'high';
        }
        // Conversion rate dropped significantly
        else if (conversionRate < historicalPerformance.ctr * 0.3 && conversions > 0) {
          shouldAdjust = true;
          newBid = currentBid * 0.9; // Decrease bid to reduce cost
          adjustmentReason = 'Conversion rate dropped significantly, reducing bid to control costs';
          urgency = 'medium';
        }
        // CPC increased significantly above historical average
        else if (cpc > historicalPerformance.cpc * 1.5 && historicalPerformance.cpc > 0) {
          shouldAdjust = true;
          newBid = currentBid * 0.85; // Reduce bid to control costs
          adjustmentReason = 'CPC increased significantly above historical average, reducing bid';
          urgency = 'high';
        }
        // Performance is good, consider increasing bid for more volume
        else if (ctr > historicalPerformance.ctr * 1.3 && conversionRate > historicalPerformance.ctr * 1.2) {
          shouldAdjust = true;
          newBid = currentBid * 1.1; // Modest increase
          adjustmentReason = 'Performance exceeding expectations, increasing bid to capture more volume';
          urgency = 'low';
        }
      }

      // Apply bid constraints
      const maxBid = currentBid * 2; // Don't increase more than 2x
      const minBid = currentBid * 0.5; // Don't decrease more than 50%
      newBid = Math.max(minBid, Math.min(maxBid, newBid));

      logger.info('Real-time bid adjustment analysis completed:', {
        campaignId,
        shouldAdjust,
        currentBid,
        newBid,
        urgency,
      });

      const result: {
        shouldAdjust: boolean;
        newBid?: number;
        adjustmentReason: string;
        urgency: 'low' | 'medium' | 'high';
      } = {
        shouldAdjust,
        adjustmentReason,
        urgency,
      };

      if (shouldAdjust) {
        result.newBid = Math.round(newBid * 100) / 100;
      }

      return result;
    } catch (error) {
      logger.error('Error performing real-time bid adjustment:', error);
      throw new Error('Failed to perform real-time bid adjustment');
    }
  }

  /**
   * Apply automatic bid adjustments based on performance
   */
  async applyAutomaticBidAdjustments(
    campaignId: string,
    config: BidOptimizationConfig
  ): Promise<{ applied: boolean; newBid: number; reason: string }> {
    try {
      logger.info('Applying automatic bid adjustments:', { campaignId, config });

      // Get current campaign
      const campaign = await this.getCampaignDetails(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get performance data
      const performance = await this.getCampaignPerformance(campaignId);
      
      // Validate performance data before proceeding
      if (performance.impressions === 0 && performance.clicks === 0) {
        logger.warn('Campaign has no performance data for automatic adjustments:', campaignId);
      }
      
      // Calculate new bid based on performance
      const suggestion = await this.generateCampaignBidSuggestion(campaignId, config);
      
      // Apply bid adjustment if confidence is high enough and change is significant
      const shouldApplyAdjustment = suggestion.confidence >= 0.7 && Math.abs(suggestion.bidChangePercentage) >= 5;
      
      // For campaigns with very little data, be more conservative
      if (performance.impressions < 100 || performance.clicks < 10) {
        const adjustmentResult = {
          applied: false,
          newBid: suggestion.currentBid,
          reason: 'Confidence too low or insufficient data for automatic adjustment',
        };
        
        logger.info('Automatic bid adjustment skipped due to insufficient data:', {
          campaignId,
          impressions: performance.impressions,
          clicks: performance.clicks,
          confidence: suggestion.confidence,
        });
        
        return adjustmentResult;
      }
      
      if (shouldApplyAdjustment) {
        await this.updateCampaignBid(campaignId, suggestion.suggestedBid);
        
        logger.info('Automatic bid adjustment applied:', {
          campaignId,
          oldBid: suggestion.currentBid,
          newBid: suggestion.suggestedBid,
          reason: suggestion.reason,
        });

        return {
          applied: true,
          newBid: suggestion.suggestedBid,
          reason: suggestion.reason,
        };
      }

      return {
        applied: false,
        newBid: suggestion.currentBid,
        reason: 'Confidence too low or change too small for automatic adjustment',
      };
    } catch (error) {
      logger.error('Error applying automatic bid adjustments:', error);
      throw new Error('Failed to apply automatic bid adjustments');
    }
  }

  /**
   * Perform A/B testing for bid optimization
   */
  async performBidABTest(
    campaignId: string,
    testConfig: {
      testBid: number;
      controlBid: number;
      testDuration: number; // days
      trafficSplit: number; // 0-1, percentage for test group
    }
  ): Promise<{
    testId: string;
    status: 'running' | 'completed' | 'failed';
    results?: {
      testPerformance: PerformanceMetrics;
      controlPerformance: PerformanceMetrics;
      winner: 'test' | 'control' | 'inconclusive';
      confidence: number;
      recommendation: string;
    };
  }> {
    try {
      logger.info('Starting bid A/B test:', { campaignId, testConfig });

      // Generate unique test ID
      const testId = `bid_test_${campaignId}_${Date.now()}`;

      // In a real implementation, this would set up the A/B test infrastructure
      // For now, we'll simulate the test results
      const testResults = {
        testId,
        status: 'running' as const,
      };

      // Simulate test completion after some time (in real implementation, this would be async)
      if (testConfig.testDuration <= 7) {
        const testPerformance = await this.simulateTestPerformance(campaignId, testConfig.testBid);
        const controlPerformance = await this.simulateTestPerformance(campaignId, testConfig.controlBid);

        const testCTR = testPerformance.ctr;
        const controlCTR = controlPerformance.ctr;
        const testROAS = testPerformance.roas;
        const controlROAS = controlPerformance.roas;

        let winner: 'test' | 'control' | 'inconclusive' = 'inconclusive';
        let confidence = 0.5;

        // Simple statistical significance calculation
        if (testCTR > controlCTR * 1.1 && testROAS > controlROAS * 1.05) {
          winner = 'test';
          confidence = 0.85;
        } else if (controlCTR > testCTR * 1.1 && controlROAS > testROAS * 1.05) {
          winner = 'control';
          confidence = 0.85;
        } else {
          confidence = 0.6;
        }

        return {
          testId,
          status: 'completed',
          results: {
            testPerformance,
            controlPerformance,
            winner,
            confidence,
            recommendation: winner === 'test' 
              ? `Implement test bid of ${testConfig.testBid} for better performance`
              : winner === 'control'
              ? `Keep current bid of ${testConfig.controlBid}`
              : 'Results are inconclusive, consider running test longer',
          },
        };
      }

      return testResults;
    } catch (error) {
      logger.error('Error performing bid A/B test:', error);
      throw new Error('Failed to perform bid A/B test');
    }
  }

  /**
   * Optimize bids for better ROI across multiple campaigns
   */
  async optimizeBidsForROI(
    campaignIds: string[],
    totalBudget: number,
    targetROI: number
  ): Promise<{
    optimizedBids: { campaignId: string; currentBid: number; optimizedBid: number; expectedROI: number }[];
    budgetAllocation: { campaignId: string; allocatedBudget: number }[];
    projectedTotalROI: number;
  }> {
    try {
      logger.info('Optimizing bids for ROI:', { campaignIds, totalBudget, targetROI });

      const optimizedBids = [];
      const budgetAllocation = [];
      let totalExpectedROI = 0;

      for (const campaignId of campaignIds) {
        const performance = await this.getCampaignPerformance(campaignId);
        const campaign = await this.getCampaignDetails(campaignId);
        
        if (!campaign) continue;

        const currentBid = campaign.bidAmount.toNumber();
        const currentROI = performance.roas;
        
        // Calculate optimal bid based on historical performance
        let optimizedBid = currentBid;
        let expectedROI = currentROI;
        
        if (currentROI > 0 && performance.conversions > 0) {
          // Use performance data to optimize bid
          const conversionRate = performance.conversions / performance.clicks;
          const avgOrderValue = performance.revenue / performance.conversions;
          
          // Calculate optimal bid to achieve target ROI
          const targetCPA = avgOrderValue / targetROI;
          const optimalBid = targetCPA * conversionRate;
          
          optimizedBid = Math.max(currentBid * 0.5, Math.min(currentBid * 2, optimalBid));
          expectedROI = (avgOrderValue * conversionRate) / optimizedBid;
        }

        optimizedBids.push({
          campaignId,
          currentBid,
          optimizedBid: Math.round(optimizedBid * 100) / 100,
          expectedROI: Math.round(expectedROI * 100) / 100,
        });

        // Allocate budget based on expected performance
        const budgetShare = expectedROI / (expectedROI + 1); // Normalize
        const allocatedBudget = (totalBudget * budgetShare) / campaignIds.length;
        
        budgetAllocation.push({
          campaignId,
          allocatedBudget: Math.round(allocatedBudget * 100) / 100,
        });

        totalExpectedROI += expectedROI;
      }

      const projectedTotalROI = totalExpectedROI / campaignIds.length;

      logger.info('ROI optimization completed:', {
        optimizedCampaigns: optimizedBids.length,
        projectedTotalROI,
      });

      return {
        optimizedBids,
        budgetAllocation,
        projectedTotalROI: Math.round(projectedTotalROI * 100) / 100,
      };
    } catch (error) {
      logger.error('Error optimizing bids for ROI:', error);
      throw new Error('Failed to optimize bids for ROI');
    }
  }

  /**
   * Analyze market trends and adjust bids accordingly
   */
  async analyzeMarketTrends(
    campaignIds: string[]
  ): Promise<{
    marketTrend: 'bullish' | 'bearish' | 'stable';
    competitionIntensity: number; // 0-1 scale
    recommendedActions: {
      campaignId: string;
      action: 'increase_bid' | 'decrease_bid' | 'maintain_bid';
      reason: string;
      urgency: 'high' | 'medium' | 'low';
    }[];
    marketInsights: string[];
  }> {
    try {
      logger.info('Analyzing market trends for campaigns:', campaignIds);

      const recommendations = [];
      const insights = [];
      let totalCompetition = 0;

      for (const campaignId of campaignIds) {
        const competition = await this.analyzeCompetition(campaignId);
        const performance = await this.getCampaignPerformance(campaignId);
        
        totalCompetition += competition.competitionLevel === 'high' ? 1 : 
                           competition.competitionLevel === 'medium' ? 0.6 : 0.3;

        let action: 'increase_bid' | 'decrease_bid' | 'maintain_bid' = 'maintain_bid';
        let reason = 'Performance is stable';
        let urgency: 'high' | 'medium' | 'low' = 'low';

        // Analyze performance trends
        if (performance.impressionShare && performance.impressionShare < 0.3) {
          action = 'increase_bid';
          reason = 'Low impression share indicates need for higher bids';
          urgency = 'high';
        } else if (performance.roas < 1.5 && performance.cpc > competition.averageCompetitorBid * 1.2) {
          action = 'decrease_bid';
          reason = 'Poor ROAS with high CPC suggests bid optimization needed';
          urgency = 'medium';
        } else if (competition.seasonalTrends.trend === 'increasing') {
          action = 'increase_bid';
          reason = 'Seasonal trends indicate increasing competition';
          urgency = 'medium';
        }

        recommendations.push({
          campaignId,
          action,
          reason,
          urgency,
        });
      }

      const competitionIntensity = totalCompetition / campaignIds.length;
      
      // Determine overall market trend
      let marketTrend: 'bullish' | 'bearish' | 'stable' = 'stable';
      if (competitionIntensity > 0.7) {
        marketTrend = 'bullish';
        insights.push('High competition levels indicate a bullish market with increased advertiser activity');
      } else if (competitionIntensity < 0.3) {
        marketTrend = 'bearish';
        insights.push('Low competition suggests market opportunities or reduced advertiser confidence');
      } else {
        insights.push('Market conditions are stable with moderate competition levels');
      }

      // Add seasonal insights
      const currentMonth = new Date().getMonth();
      if ([10, 11].includes(currentMonth)) {
        insights.push('Holiday season typically sees increased competition and higher CPCs');
      } else if ([0, 1].includes(currentMonth)) {
        insights.push('Post-holiday period often shows reduced competition and lower costs');
      }

      logger.info('Market trend analysis completed:', {
        marketTrend,
        competitionIntensity,
        recommendationsCount: recommendations.length,
      });

      return {
        marketTrend,
        competitionIntensity: Math.round(competitionIntensity * 100) / 100,
        recommendedActions: recommendations,
        marketInsights: insights,
      };
    } catch (error) {
      logger.error('Error analyzing market trends:', error);
      throw new Error('Failed to analyze market trends');
    }
  }

  /**
   * Get bid recommendations based on competition analysis
   */
  async getBidRecommendations(
    targetingConfig: any,
    budgetRange: { min: number; max: number }
  ): Promise<{
    recommendedBid: number;
    bidRange: { min: number; max: number };
    competitionLevel: 'low' | 'medium' | 'high';
    reasoning: string[];
  }> {
    try {
      // Validate budget range
      if (budgetRange.min <= 0 || budgetRange.max <= 0 || budgetRange.min >= budgetRange.max) {
        throw new Error('Invalid budget range: min and max must be positive and min must be less than max');
      }

      logger.info('Getting bid recommendations:', { targetingConfig, budgetRange });

      // Analyze targeting specificity
      const targetingSpecificity = this.calculateTargetingSpecificity(targetingConfig);
      
      // Estimate competition based on targeting
      const estimatedCompetition = this.estimateCompetitionFromTargeting(targetingConfig);
      
      // Calculate base bid recommendation
      let recommendedBid = budgetRange.min + (budgetRange.max - budgetRange.min) * 0.4;
      
      const reasoning: string[] = [];

      // Adjust based on targeting specificity
      if (targetingSpecificity > 0.7) {
        recommendedBid *= 1.3;
        reasoning.push('Increased bid due to highly specific targeting');
      } else if (targetingSpecificity < 0.3) {
        recommendedBid *= 0.8;
        reasoning.push('Decreased bid due to broad targeting');
      }

      // Adjust based on competition
      if (estimatedCompetition === 'high') {
        recommendedBid *= 1.4;
        reasoning.push('Increased bid due to high competition');
      } else if (estimatedCompetition === 'low') {
        recommendedBid *= 0.7;
        reasoning.push('Decreased bid due to low competition');
      }

      // Ensure bid is within range
      recommendedBid = Math.max(budgetRange.min, Math.min(recommendedBid, budgetRange.max));

      const bidRange = {
        min: Math.max(budgetRange.min, recommendedBid * 0.7),
        max: Math.min(budgetRange.max, recommendedBid * 1.5),
      };

      logger.info('Bid recommendations generated:', {
        recommendedBid,
        bidRange,
        competitionLevel: estimatedCompetition,
      });

      return {
        recommendedBid: Math.round(recommendedBid * 100) / 100,
        bidRange: {
          min: Math.round(bidRange.min * 100) / 100,
          max: Math.round(bidRange.max * 100) / 100,
        },
        competitionLevel: estimatedCompetition,
        reasoning,
      };
    } catch (error) {
      logger.error('Error getting bid recommendations:', error);
      throw new Error('Failed to get bid recommendations');
    }
  }

  // Private helper methods

  private async getCampaignPerformance(campaignId: string): Promise<PerformanceMetrics> {
    try {
      // Get campaign analytics data
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          analytics: {
            orderBy: { date: 'desc' },
            take: 30, // Last 30 days
          },
        },
      });

      if (!campaign || !campaign.analytics || campaign.analytics.length === 0) {
        // Return default metrics if no data available
        return {
          campaignId,
          dateRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date(),
          },
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
          revenue: 0,
          cpc: 0,
          ctr: 0,
          cpa: 0,
          roas: 0,
        };
      }

      // Aggregate metrics
      const totalImpressions = campaign.analytics.reduce((sum, day) => sum + day.impressions, 0);
      const totalClicks = campaign.analytics.reduce((sum, day) => sum + day.clicks, 0);
      const totalConversions = campaign.analytics.reduce((sum, day) => sum + day.conversions, 0);
      const totalSpend = campaign.analytics.reduce((sum, day) => sum + day.spend.toNumber(), 0);
      const totalRevenue = campaign.analytics.reduce((sum, day) => sum + day.revenue.toNumber(), 0);

      const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

      return {
        campaignId,
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
        impressions: totalImpressions,
        clicks: totalClicks,
        conversions: totalConversions,
        spend: totalSpend,
        revenue: totalRevenue,
        cpc: Math.round(cpc * 100) / 100,
        ctr: Math.round(ctr * 100) / 100,
        cpa: Math.round(cpa * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        impressionShare: Math.random() * 0.8 + 0.2, // Mock data
      };
    } catch (error) {
      logger.error('Error getting campaign performance:', error);
      throw new Error('Failed to get campaign performance');
    }
  }

  private async getCampaignDetails(campaignId: string): Promise<any> {
    try {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          advertisements: true,
        },
      });
      return campaign;
    } catch (error) {
      logger.error('Error getting campaign details:', error);
      throw error; // Re-throw the error so it can be handled properly
    }
  }

  private async getSimilarCampaigns(campaign: any): Promise<any[]> {
    try {
      // Find campaigns with similar targeting or in same category
      const similarCampaigns = await prisma.adCampaign.findMany({
        where: {
          id: { not: campaign.id },
          status: 'active',
          campaignType: campaign.campaignType,
        },
        take: 20,
      });

      return similarCampaigns;
    } catch (error) {
      logger.error('Error getting similar campaigns:', error);
      return [];
    }
  }

  private calculateCompetitionLevel(competitorCount: number): 'low' | 'medium' | 'high' {
    if (competitorCount < 5) return 'low';
    if (competitorCount < 15) return 'medium';
    return 'high';
  }

  private calculateAverageCompetitorBid(competitors: any[]): number {
    if (competitors.length === 0) return 2.0; // Default bid

    const totalBid = competitors.reduce((sum, competitor) => {
      return sum + competitor.bidAmount.toNumber();
    }, 0);

    return totalBid / competitors.length;
  }

  private calculateBidRange(
    averageBid: number,
    competitionLevel: 'low' | 'medium' | 'high'
  ): { min: number; max: number; recommended: number } {
    const competitionMultipliers = {
      low: { min: 0.7, max: 1.2, recommended: 0.9 },
      medium: { min: 0.8, max: 1.5, recommended: 1.1 },
      high: { min: 1.0, max: 2.0, recommended: 1.3 },
    };

    const multiplier = competitionMultipliers[competitionLevel];

    return {
      min: Math.round(averageBid * multiplier.min * 100) / 100,
      max: Math.round(averageBid * multiplier.max * 100) / 100,
      recommended: Math.round(averageBid * multiplier.recommended * 100) / 100,
    };
  }

  private analyzeSeasonalTrends(): CompetitionAnalysis['seasonalTrends'] {
    // Simplified seasonal analysis - in reality, this would use historical data
    const currentMonth = new Date().getMonth();
    const holidayMonths = [10, 11]; // November, December
    const summerMonths = [5, 6, 7]; // June, July, August

    if (holidayMonths.includes(currentMonth)) {
      return { trend: 'increasing', factor: 1.3 };
    } else if (summerMonths.includes(currentMonth)) {
      return { trend: 'decreasing', factor: 0.9 };
    } else {
      return { trend: 'stable', factor: 1.0 };
    }
  }

  private async generateCampaignBidSuggestion(
    campaignId: string,
    config: BidOptimizationConfig
  ): Promise<BidSuggestion> {
    const performance = await this.getCampaignPerformance(campaignId);
    const competition = await this.analyzeCompetition(campaignId);
    const campaign = await this.getCampaignDetails(campaignId);

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const currentBid = campaign.bidAmount.toNumber();
    let suggestedBid = currentBid;
    let reason = 'No adjustment needed';
    let confidence = 0.5;
    let priority: 'high' | 'medium' | 'low' = 'medium';

    // Analyze performance and suggest bid adjustments
    if (config.bidStrategy === 'maximize_clicks') {
      if (performance.cpc > 0 && performance.impressionShare && performance.impressionShare < 0.5) {
        suggestedBid = currentBid * 1.2;
        reason = 'Increase bid to improve impression share and maximize clicks';
        confidence = 0.8;
        priority = 'high';
      }
    } else if (config.bidStrategy === 'maximize_conversions') {
      if (performance.conversions > 0 && performance.cpa > 0) {
        if (config.targetCPA && performance.cpa > config.targetCPA) {
          suggestedBid = currentBid * 0.85;
          reason = 'Decrease bid to reduce CPA and improve conversion efficiency';
          confidence = 0.75;
          priority = 'high';
        } else if (config.targetCPA && performance.cpa < config.targetCPA * 0.8) {
          suggestedBid = currentBid * 1.15;
          reason = 'Increase bid to capture more conversions while staying under target CPA';
          confidence = 0.7;
          priority = 'medium';
        }
      }
    } else if (config.bidStrategy === 'target_roas') {
      if (performance.roas > 0 && config.targetROAS) {
        if (performance.roas < config.targetROAS) {
          suggestedBid = currentBid * 0.9;
          reason = 'Decrease bid to improve ROAS efficiency';
          confidence = 0.7;
          priority = 'high';
        } else if (performance.roas > config.targetROAS * 1.2) {
          suggestedBid = currentBid * 1.1;
          reason = 'Increase bid to capture more volume while maintaining good ROAS';
          confidence = 0.65;
          priority = 'medium';
        }
      }
    }

    // Apply competition-based adjustments
    if (competition.competitionLevel === 'high' && performance.impressionShare && performance.impressionShare < 0.3) {
      suggestedBid = Math.max(suggestedBid, competition.bidRange.recommended);
      reason += ' (adjusted for high competition)';
      confidence = Math.min(confidence + 0.1, 0.9);
    }

    // Apply min/max constraints
    if (config.maxCPC && suggestedBid > config.maxCPC) {
      suggestedBid = config.maxCPC;
      reason += ' (capped at max CPC)';
    }
    if (config.minCPC && suggestedBid < config.minCPC) {
      suggestedBid = config.minCPC;
      reason += ' (raised to min CPC)';
    }

    const bidChange = suggestedBid - currentBid;
    const bidChangePercentage = currentBid > 0 ? (bidChange / currentBid) * 100 : 0;

    // Calculate expected impact
    const expectedImpact = this.calculateExpectedImpact(
      performance,
      currentBid,
      suggestedBid,
      competition
    );

    return {
      campaignId,
      currentBid,
      suggestedBid: Math.round(suggestedBid * 100) / 100,
      bidChange: Math.round(bidChange * 100) / 100,
      bidChangePercentage: Math.round(bidChangePercentage * 100) / 100,
      reason,
      confidence,
      expectedImpact,
      priority,
    };
  }

  private calculateExpectedImpact(
    performance: PerformanceMetrics,
    currentBid: number,
    suggestedBid: number,
    competition: CompetitionAnalysis
  ): BidSuggestion['expectedImpact'] {
    const bidMultiplier = suggestedBid / currentBid;
    
    // Adjust impact based on competition level
    let competitionFactor = 1.0;
    if (competition.competitionLevel === 'high') {
      competitionFactor = 0.8; // Less impact in high competition
    } else if (competition.competitionLevel === 'low') {
      competitionFactor = 1.2; // More impact in low competition
    }
    
    // Adjust impact based on current performance
    let performanceFactor = 1.0;
    if (performance.ctr > 2.0) {
      performanceFactor = 1.1; // Better performing campaigns see more impact
    } else if (performance.ctr < 0.5) {
      performanceFactor = 0.9; // Poor performing campaigns see less impact
    }
    
    // Simplified impact calculation - in reality, this would use more sophisticated models
    const clicksChange = (bidMultiplier - 1) * 0.6 * competitionFactor * performanceFactor;
    const conversionsChange = (bidMultiplier - 1) * 0.4 * competitionFactor * performanceFactor;
    const costChange = bidMultiplier - 1; // Direct correlation
    const roasChange = -costChange * 0.3; // Inverse correlation with cost

    return {
      clicksChange: Math.round(clicksChange * 100),
      conversionsChange: Math.round(conversionsChange * 100),
      costChange: Math.round(costChange * 100),
      roasChange: Math.round(roasChange * 100),
    };
  }

  private async calculateOptimization(
    performance: PerformanceMetrics,
    competition: CompetitionAnalysis,
    config: BidOptimizationConfig
  ): Promise<BidOptimizationResult> {
    const campaign = await this.getCampaignDetails(performance.campaignId);
    const currentBid = campaign.bidAmount.toNumber();

    // Generate bid suggestion
    const suggestion = await this.generateCampaignBidSuggestion(performance.campaignId, config);

    // Determine optimization type based on competition and performance
    let optimizationType: BidOptimizationResult['optimizationType'] = 'bid_adjustment';
    if (Math.abs(suggestion.bidChangePercentage) > 20) {
      optimizationType = 'budget_reallocation';
    } else if (competition.competitionLevel === 'high' && performance.impressionShare && performance.impressionShare < 0.3) {
      optimizationType = 'targeting_refinement';
    }

    // Calculate projected performance with competition factors
    const bidMultiplier = suggestion.suggestedBid / currentBid;
    let competitionImpact = 1.0;
    if (competition.competitionLevel === 'high') {
      competitionImpact = 0.8; // Reduced impact in high competition
    } else if (competition.competitionLevel === 'low') {
      competitionImpact = 1.2; // Increased impact in low competition
    }

    const projectedPerformance = {
      cpc: performance.cpc * bidMultiplier,
      ctr: performance.ctr * (1 + (bidMultiplier - 1) * 0.1 * competitionImpact),
      conversions: performance.conversions * (1 + suggestion.expectedImpact.conversionsChange / 100),
      roas: performance.roas * (1 + suggestion.expectedImpact.roasChange / 100),
      impressionShare: Math.min(1, (performance.impressionShare || 0.5) * bidMultiplier * 0.8),
    };

    // Determine implementation priority based on competition urgency
    let implementationPriority: BidOptimizationResult['implementationPriority'] = 'within_week';
    if (suggestion.priority === 'high' && suggestion.confidence > 0.8) {
      implementationPriority = 'immediate';
    } else if (suggestion.priority === 'high' || suggestion.confidence > 0.7 || competition.competitionLevel === 'high') {
      implementationPriority = 'within_24h';
    }

    return {
      campaignId: performance.campaignId,
      optimizationType,
      currentPerformance: {
        cpc: performance.cpc,
        ctr: performance.ctr,
        conversions: performance.conversions,
        roas: performance.roas,
        impressionShare: performance.impressionShare || 0.5,
      },
      optimizedSettings: {
        bidAmount: suggestion.suggestedBid,
      },
      projectedPerformance,
      confidence: suggestion.confidence,
      implementationPriority,
    };
  }

  private async updateCampaignBid(campaignId: string, newBid: number): Promise<void> {
    try {
      await prisma.adCampaign.update({
        where: { id: campaignId },
        data: { bidAmount: newBid },
      });
    } catch (error) {
      logger.error('Error updating campaign bid:', error);
      throw new Error('Failed to update campaign bid');
    }
  }

  private calculateTargetingSpecificity(targetingConfig: any): number {
    let specificity = 0;
    let maxSpecificity = 0;

    // Demographics specificity
    if (targetingConfig.demographics) {
      if (targetingConfig.demographics.ageRange) {
        specificity += 1;
        // More specific age ranges get higher scores
        const ageRange = targetingConfig.demographics.ageRange;
        if (Array.isArray(ageRange) && ageRange.length === 2) {
          const rangeSize = ageRange[1] - ageRange[0];
          if (rangeSize <= 10) specificity += 1; // Very specific age range
        }
      }
      if (targetingConfig.demographics.gender && targetingConfig.demographics.gender !== 'all') {
        specificity += 1;
      }
      if (targetingConfig.demographics.interests) {
        specificity += Math.min(targetingConfig.demographics.interests.length * 0.5, 3);
      }
      if (targetingConfig.demographics.education) {
        specificity += targetingConfig.demographics.education.length * 0.3;
      }
      if (targetingConfig.demographics.income) {
        specificity += targetingConfig.demographics.income.length * 0.3;
      }
      maxSpecificity += 8;
    }

    // Location specificity
    if (targetingConfig.location) {
      if (targetingConfig.location.countries) {
        const countryCount = targetingConfig.location.countries.length;
        if (countryCount === 1) specificity += 2; // Single country is very specific
        else specificity += Math.min(countryCount * 0.3, 1.5);
      }
      if (targetingConfig.location.states) {
        specificity += Math.min(targetingConfig.location.states.length * 0.4, 2);
      }
      if (targetingConfig.location.cities) {
        specificity += Math.min(targetingConfig.location.cities.length * 0.5, 3);
      }
      maxSpecificity += 7;
    }

    // Behavior specificity
    if (targetingConfig.behavior) {
      if (targetingConfig.behavior.deviceTypes) {
        specificity += Math.min(targetingConfig.behavior.deviceTypes.length * 0.4, 2);
      }
      if (targetingConfig.behavior.platforms) {
        specificity += Math.min(targetingConfig.behavior.platforms.length * 0.4, 2);
      }
      if (targetingConfig.behavior.engagementLevel) {
        specificity += 1; // Engagement level targeting is specific
      }
      maxSpecificity += 5;
    }

    return maxSpecificity > 0 ? Math.min(specificity / maxSpecificity, 1) : 0;
  }

  private estimateCompetitionFromTargeting(targetingConfig: any): 'low' | 'medium' | 'high' {
    const specificity = this.calculateTargetingSpecificity(targetingConfig);
    
    // More specific targeting usually means less competition
    if (specificity > 0.7) return 'low';
    if (specificity > 0.4) return 'medium';
    return 'high';
  }

  private async simulateTestPerformance(campaignId: string, bidAmount: number): Promise<PerformanceMetrics> {
    // Get baseline performance
    const baseline = await this.getCampaignPerformance(campaignId);
    
    // Simulate how bid changes affect performance
    const currentBid = (await this.getCampaignDetails(campaignId))?.bidAmount.toNumber() || 2.0;
    const bidMultiplier = bidAmount / currentBid;
    
    // Higher bids generally increase impressions and clicks but may decrease efficiency
    const impressionMultiplier = Math.min(bidMultiplier * 0.8 + 0.2, 2.0);
    const clickMultiplier = Math.min(bidMultiplier * 0.6 + 0.4, 1.8);
    const conversionMultiplier = Math.min(bidMultiplier * 0.4 + 0.6, 1.5);
    
    return {
      campaignId,
      dateRange: baseline.dateRange,
      impressions: Math.round(baseline.impressions * impressionMultiplier),
      clicks: Math.round(baseline.clicks * clickMultiplier),
      conversions: Math.round(baseline.conversions * conversionMultiplier),
      spend: baseline.spend * bidMultiplier,
      revenue: baseline.revenue * conversionMultiplier,
      cpc: bidAmount,
      ctr: baseline.ctr * (clickMultiplier / impressionMultiplier),
      cpa: baseline.cpa * (bidMultiplier / conversionMultiplier),
      roas: baseline.roas * (conversionMultiplier / bidMultiplier),
    };
  }
}

export const bidOptimizationService = new BidOptimizationService();