/*
  Warnings:

  - A unique constraint covering the columns `[tracking_number]` on the table `shipments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "shipments_tracking_number_idx";

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tracking_number_key" ON "shipments"("tracking_number");
