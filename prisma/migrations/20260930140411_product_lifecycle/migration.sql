-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('IN_STOCK', 'ON_SALE', 'DISPOSED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "description" TEXT,
ADD COLUMN     "disposed_at" DATE,
ADD COLUMN     "disposed_by" INTEGER,
ADD COLUMN     "expiry_date" DATE,
ADD COLUMN     "manufacturing_date" DATE,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'IN_STOCK',
ADD COLUMN     "storage_location" TEXT;

-- CreateIndex
CREATE INDEX "products_expiry_date_idx" ON "products"("expiry_date");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_disposed_by_fkey" FOREIGN KEY ("disposed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
