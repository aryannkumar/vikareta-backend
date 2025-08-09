-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "parent_id" VARCHAR(50);

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;