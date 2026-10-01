-- CreateEnum
CREATE TYPE "Role" AS ENUM ('system_admin', 'inventory_officer', 'manager');

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('ACTIVE', 'WARNING', 'CRITICAL', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('REMOVED', 'RETURNED', 'SOLD', 'DISCOUNTED', 'DISPOSED');

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "category_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "batches" (
    "batch_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "batch_number" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "manufacturing_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "storage_location" TEXT NOT NULL,
    "alert_level" "AlertLevel" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "batches_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "actions" (
    "action_id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "disposition" "Disposition" NOT NULL,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("action_id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "warning_max" INTEGER NOT NULL DEFAULT 30,
    "critical_max" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
