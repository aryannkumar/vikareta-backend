-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "campaign_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "budget" DECIMAL(12,2) NOT NULL,
    "daily_budget" DECIMAL(12,2),
    "spent_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "locked_amount_id" UUID,
    "bid_amount" DECIMAL(8,4) NOT NULL,
    "bidding_strategy" VARCHAR(20) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "targeting_config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "ad_type" VARCHAR(20) NOT NULL,
    "ad_format" VARCHAR(20) NOT NULL,
    "content" JSONB NOT NULL,
    "call_to_action" VARCHAR(100) NOT NULL,
    "destination_url" VARCHAR(500) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "location" VARCHAR(100) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "dimensions" JSONB NOT NULL,
    "max_ads_per_page" INTEGER NOT NULL DEFAULT 1,
    "refresh_interval" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "advertisement_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "location" JSONB,
    "view_duration" INTEGER,
    "is_viewable" BOOLEAN NOT NULL DEFAULT true,
    "cost" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_clicks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "advertisement_id" UUID NOT NULL,
    "impression_id" UUID,
    "user_id" UUID,
    "session_id" VARCHAR(100) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "referrer_url" VARCHAR(500),
    "destination_url" VARCHAR(500) NOT NULL,
    "cost" DECIMAL(8,4) NOT NULL,
    "conversion_value" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_analytics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ctr" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "cpm" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "roas" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "review_notes" TEXT,
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_ad_networks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "api_endpoint" VARCHAR(500),
    "configuration" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "revenue_share" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_ad_networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AdPlacementToAdvertisement" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AdPlacementToAdvertisement_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ad_campaigns_business_id_status_idx" ON "ad_campaigns"("business_id", "status");

-- CreateIndex
CREATE INDEX "ad_campaigns_status_start_date_end_date_idx" ON "ad_campaigns"("status", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "advertisements_campaign_id_status_idx" ON "advertisements"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "advertisements_priority_status_idx" ON "advertisements"("priority", "status");

-- CreateIndex
CREATE INDEX "ad_placements_platform_location_is_active_idx" ON "ad_placements"("platform", "location", "is_active");

-- CreateIndex
CREATE INDEX "ad_impressions_advertisement_id_created_at_idx" ON "ad_impressions"("advertisement_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_impressions_user_id_created_at_idx" ON "ad_impressions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_impressions_session_id_created_at_idx" ON "ad_impressions"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_clicks_advertisement_id_created_at_idx" ON "ad_clicks"("advertisement_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_clicks_user_id_created_at_idx" ON "ad_clicks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_clicks_session_id_created_at_idx" ON "ad_clicks"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_analytics_campaign_id_date_idx" ON "ad_analytics"("campaign_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_analytics_campaign_id_date_key" ON "ad_analytics"("campaign_id", "date");

-- CreateIndex
CREATE INDEX "ad_approvals_status_created_at_idx" ON "ad_approvals"("status", "created_at");

-- CreateIndex
CREATE INDEX "ad_approvals_campaign_id_status_idx" ON "ad_approvals"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "external_ad_networks_name_key" ON "external_ad_networks"("name");

-- CreateIndex
CREATE INDEX "external_ad_networks_priority_is_active_idx" ON "external_ad_networks"("priority", "is_active");

-- CreateIndex
CREATE INDEX "_AdPlacementToAdvertisement_B_index" ON "_AdPlacementToAdvertisement"("B");

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_locked_amount_id_fkey" FOREIGN KEY ("locked_amount_id") REFERENCES "locked_amounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "ad_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_impression_id_fkey" FOREIGN KEY ("impression_id") REFERENCES "ad_impressions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_analytics" ADD CONSTRAINT "ad_analytics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_approvals" ADD CONSTRAINT "ad_approvals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_approvals" ADD CONSTRAINT "ad_approvals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdPlacementToAdvertisement" ADD CONSTRAINT "_AdPlacementToAdvertisement_A_fkey" FOREIGN KEY ("A") REFERENCES "ad_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdPlacementToAdvertisement" ADD CONSTRAINT "_AdPlacementToAdvertisement_B_fkey" FOREIGN KEY ("B") REFERENCES "advertisements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
