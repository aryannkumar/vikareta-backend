/*
  Warnings:

  - A unique constraint covering the columns `[user_id,document_type]` on the table `user_documents` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "negotiation_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "offer_type" VARCHAR(20) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "terms" TEXT,
    "message" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "negotiation_history_quote_id_created_at_idx" ON "negotiation_history"("quote_id", "created_at");

-- CreateIndex
CREATE INDEX "negotiation_history_from_user_id_status_idx" ON "negotiation_history"("from_user_id", "status");

-- CreateIndex
CREATE INDEX "negotiation_history_to_user_id_status_idx" ON "negotiation_history"("to_user_id", "status");

-- CreateIndex
CREATE INDEX "negotiation_history_status_valid_until_idx" ON "negotiation_history"("status", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "userId_documentType" ON "user_documents"("user_id", "document_type");

-- AddForeignKey
ALTER TABLE "negotiation_history" ADD CONSTRAINT "negotiation_history_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_history" ADD CONSTRAINT "negotiation_history_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_history" ADD CONSTRAINT "negotiation_history_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
