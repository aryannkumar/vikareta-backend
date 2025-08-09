-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "actual_delivery" TIMESTAMP(3),
ADD COLUMN     "estimated_delivery" TIMESTAMP(3),
ADD COLUMN     "shipping_notes" TEXT,
ADD COLUMN     "shipping_provider" VARCHAR(100),
ADD COLUMN     "tracking_number" VARCHAR(100);

-- CreateTable
CREATE TABLE "order_tracking_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "location" VARCHAR(255),
    "description" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" VARCHAR(100),
    "provider_tracking_id" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tracking_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "api_endpoint" VARCHAR(500) NOT NULL,
    "api_key" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "supportedServices" JSONB NOT NULL,
    "configuration" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "tracking_number" VARCHAR(100) NOT NULL,
    "label_url" VARCHAR(500),
    "status" VARCHAR(50) NOT NULL DEFAULT 'created',
    "pickup_address" JSONB NOT NULL,
    "delivery_address" JSONB NOT NULL,
    "package_details" JSONB NOT NULL,
    "shipping_cost" DECIMAL(10,2),
    "estimated_delivery" TIMESTAMP(3),
    "actual_delivery" TIMESTAMP(3),
    "delivery_proof" JSONB,
    "return_requested" BOOLEAN NOT NULL DEFAULT false,
    "return_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_tracking_history_order_id_timestamp_idx" ON "order_tracking_history"("order_id", "timestamp");

-- CreateIndex
CREATE INDEX "order_tracking_history_status_timestamp_idx" ON "order_tracking_history"("status", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_providers_name_key" ON "logistics_providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_tracking_number_idx" ON "shipments"("tracking_number");

-- CreateIndex
CREATE INDEX "shipments_status_estimated_delivery_idx" ON "shipments"("status", "estimated_delivery");

-- CreateIndex
CREATE INDEX "shipments_provider_id_status_idx" ON "shipments"("provider_id", "status");

-- AddForeignKey
ALTER TABLE "order_tracking_history" ADD CONSTRAINT "order_tracking_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "logistics_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
