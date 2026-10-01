import {
  PrismaClient,
  Role,
  AlertLevel,
  Disposition,
  ProductStatus,
} from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { addDays, differenceInDays } from "date-fns";
import * as bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

// Default thresholds from Table 3.1 (guide 6.7).
const WARNING_MAX = 30;
const CRITICAL_MAX = 7;

// ClassifyBatch (guide 9.1): level from days remaining between expiry and today.
function classify(expiry: Date, today: Date): AlertLevel {
  const days = differenceInDays(expiry, today);
  if (days < 0) return AlertLevel.EXPIRED;
  if (days <= CRITICAL_MAX) return AlertLevel.CRITICAL;
  if (days <= WARNING_MAX) return AlertLevel.WARNING;
  return AlertLevel.ACTIVE;
}

async function main() {
  // Settings row, singleton (guide 6.7).
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, warning_max: WARNING_MAX, critical_max: CRITICAL_MAX },
  });

  // Users, one per role (guide 10). Passwords are build-test only.
  const passwordHash = await bcrypt.hash("password123", 10);
  const users = [
    { username: "admin", role: Role.system_admin },
    { username: "officer", role: Role.inventory_officer },
    { username: "manager", role: Role.manager },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { username: u.username, password_hash: passwordHash, role: u.role },
    });
  }

  // Categories and products (guide 6.2, 6.3), domain-neutral.
  const categories = [
    { name: "Canned Goods", products: ["Baked Beans", "Corned Beef", "Tomato Paste"] },
    { name: "Beverages", products: ["Orange Juice", "Soda", "Bottled Water"] },
    { name: "Medicines", products: ["Paracetamol Tablets", "Cough Syrup", "Antacid"] },
    { name: "Dairy", products: ["Milk", "Cheese", "Yoghurt"] },
  ];

  const today = new Date();

  // Product-level detail: the fields the register reads, with the expiry
  // offset in days so the seeded dates stay meaningful whenever the seed
  // runs. Offsets match each product's batch below, so the product register
  // and the batch ledger tell the same story. No price or cost anywhere;
  // the register is not a financial record.
  const productDetails: Record<
    string,
    {
      days: number;
      description: string;
      storage: string;
      status: ProductStatus;
    }
  > = {
    "Baked Beans": {
      days: 120,
      description: "Ready-to-eat beans in tomato sauce, 415g tins.",
      storage: "Aisle 3 Shelf 1",
      status: ProductStatus.IN_STOCK,
    },
    "Corned Beef": {
      days: -10,
      description: "Cooked beef in 340g tins, shelf stable until opened.",
      storage: "Aisle 3 Shelf 3",
      status: ProductStatus.IN_STOCK,
    },
    "Tomato Paste": {
      days: 15,
      description: "Concentrated tomato paste in 200g sachets.",
      storage: "Aisle 3 Shelf 2",
      status: ProductStatus.ON_SALE,
    },
    "Orange Juice": {
      days: 25,
      description: "Chilled orange juice in 1 litre bottles.",
      storage: "Cooler 2",
      status: ProductStatus.IN_STOCK,
    },
    Soda: {
      days: 45,
      description: "Carbonated soft drinks in 330ml cans.",
      storage: "Aisle 2 Shelf 4",
      status: ProductStatus.ON_SALE,
    },
    "Bottled Water": {
      days: 90,
      description: "Still drinking water in 750ml bottles.",
      storage: "Aisle 1 Shelf 4",
      status: ProductStatus.IN_STOCK,
    },
    "Paracetamol Tablets": {
      days: 60,
      description: "500mg pain relief tablets, packs of 20.",
      storage: "Pharmacy Rack B",
      status: ProductStatus.IN_STOCK,
    },
    "Cough Syrup": {
      days: 3,
      description: "100ml bottles for dry cough relief.",
      storage: "Pharmacy Rack A",
      status: ProductStatus.IN_STOCK,
    },
    Antacid: {
      days: 12,
      description: "Chewable antacid tablets, packs of 24.",
      storage: "Pharmacy Rack C",
      status: ProductStatus.IN_STOCK,
    },
    Milk: {
      days: 5,
      description: "Fresh whole milk in 1 litre cartons.",
      storage: "Cooler 3",
      status: ProductStatus.IN_STOCK,
    },
    Cheese: {
      days: 21,
      description: "Mature cheddar blocks, 250g.",
      storage: "Cooler 1",
      status: ProductStatus.ON_SALE,
    },
    Yoghurt: {
      days: -4,
      description: "Plain stirred yoghurt in 170g pots.",
      storage: "Cooler 1",
      status: ProductStatus.DISPOSED,
    },
  };

  // [productName, daysFromToday, batchNumber, quantity, storageLocation]
  const batches: Array<[string, number, string, number, string]> = [
    // ACTIVE: more than 30 days out.
    ["Baked Beans", 120, "BB-2201", 240, "Aisle 3 Shelf 1"],
    ["Bottled Water", 90, "BW-1108", 500, "Aisle 1 Shelf 4"],
    ["Paracetamol Tablets", 60, "PT-0917", 150, "Pharmacy Rack B"],
    // WARNING: 8 to 30 days out.
    ["Orange Juice", 25, "OJ-0512", 160, "Cooler 2"],
    ["Cheese", 21, "CH-0419", 90, "Cooler 1"],
    ["Tomato Paste", 15, "TP-0903", 200, "Aisle 3 Shelf 2"],
    // CRITICAL: 0 to 7 days out.
    ["Milk", 5, "MK-0925", 140, "Cooler 3"],
    ["Cough Syrup", 3, "CS-0927", 60, "Pharmacy Rack A"],
    // EXPIRED: past date.
    ["Yoghurt", -4, "YG-0912", 24, "Cooler 1"],
    ["Corned Beef", -10, "CB-0821", 30, "Aisle 3 Shelf 3"],
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name },
    });
  }

  const productLookup = new Map<string, number>();
  const disposers = await prisma.user.findUnique({ where: { username: "officer" } });

  for (const cat of categories) {
    const category = await prisma.category.findUnique({ where: { name: cat.name } });
    if (!category) continue;
    for (const productName of cat.products) {
      const detail = productDetails[productName];
      const isDisposed = detail?.status === ProductStatus.DISPOSED;
      const data = {
        name: productName,
        category_id: category.category_id,
        description: detail?.description ?? null,
        manufacturing_date: detail ? addDays(addDays(today, detail.days), -180) : null,
        expiry_date: detail ? addDays(today, detail.days) : null,
        storage_location: detail?.storage ?? null,
        status: detail?.status ?? ProductStatus.IN_STOCK,
        disposed_at: isDisposed ? today : null,
        disposed_by: isDisposed ? disposers?.user_id ?? null : null,
      };

      const existing = await prisma.product.findFirst({ where: { name: productName } });
      let productId: number;
      if (existing) {
        productId = existing.product_id;
        // A product written before these fields existed carries no expiry
        // date, so fill it once. Anything the officer has already given a
        // date is left exactly as filed.
        if (existing.expiry_date === null && detail) {
          await prisma.product.update({ where: { product_id: productId }, data });
        }
      } else {
        const created = await prisma.product.create({ data });
        productId = created.product_id;
      }
      productLookup.set(productName, productId);
    }
  }
  const allProducts = await prisma.product.findMany();
  for (const p of allProducts) {
    productLookup.set(p.name, p.product_id);
  }

  for (const [productName, days, batchNumber, quantity, storage] of batches) {
    const productId = productLookup.get(productName);
    if (!productId) {
      console.warn(`seed: no product "${productName}", skipping batch ${batchNumber}`);
      continue;
    }
    const expiry = addDays(today, days);
    const manufacturing = addDays(expiry, -180);
    const level = classify(expiry, today);
    const existing = await prisma.batch.findFirst({ where: { batch_number: batchNumber } });
    if (existing) continue;
    await prisma.batch.create({
      data: {
        product_id: productId,
        batch_number: batchNumber,
        quantity,
        manufacturing_date: manufacturing,
        expiry_date: expiry,
        storage_location: storage,
        alert_level: level,
      },
    });
  }

  // One sample action so the action record table has data (guide 6.5).
  const sampleActionCount = await prisma.action.count();
  if (sampleActionCount === 0) {
    const officer = await prisma.user.findUnique({ where: { username: "officer" } });
    const expiredBatch = await prisma.batch.findFirst({ where: { alert_level: AlertLevel.EXPIRED } });
    if (officer && expiredBatch) {
      await prisma.action.create({
        data: {
          batch_id: expiredBatch.batch_id,
          user_id: officer.user_id,
          disposition: Disposition.DISPOSED,
          remark: "Expired on inspection; recorded during build test.",
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });