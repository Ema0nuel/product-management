// Temporary verification harness for supabase/schema.sql.
// Runs the schema twice inside a transaction that is always rolled back, so
// the live Supabase database is left untouched. Deleted after the run.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const failures = [];
const notes = [];

// pg may hand back an enum-label aggregate as a raw "{a,b}" string rather
// than a parsed array, depending on the element type it was built from.
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value.replace(/^\{/, "").replace(/\}$/, "").split(",");
  }
  return [];
}

function check(label, condition, detail) {
  if (condition) {
    notes.push(`PASS  ${label}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failures.push(`FAIL  ${label}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function expectReject(client, label, sql, params) {
  await client.query("savepoint probe");
  try {
    await client.query(sql, params);
    await client.query("rollback to savepoint probe");
    check(label, false, "statement was accepted but should have been rejected");
  } catch (error) {
    await client.query("rollback to savepoint probe");
    check(label, true, error.message.split("\n")[0].slice(0, 110));
  }
}

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query("begin");

  try {
    await client.query("create schema schema_check");
    await client.query("set local search_path to schema_check");

    notes.push("--- first run ---");
    await client.query(sql);
    notes.push("first run completed without error");

    notes.push("--- second run (idempotency) ---");
    await client.query(sql);
    notes.push("second run completed without error");

    // --- structure ---
    const tables = await client.query(
      `select table_name from information_schema.tables
        where table_schema = 'schema_check' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    const tableNames = tables.rows.map((r) => r.table_name);
    check(
      "six tables created",
      tableNames.length === 6,
      tableNames.join(", "),
    );
    for (const t of ["users", "categories", "products", "batches", "actions", "app_settings"]) {
      check(`table ${t} exists`, tableNames.includes(t));
    }

    const views = await client.query(
      `select table_name from information_schema.views
        where table_schema = 'schema_check' order by table_name`,
    );
    const viewNames = views.rows.map((r) => r.table_name);
    check("two views created", viewNames.length === 2, viewNames.join(", "));

    const enums = await client.query(
      `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
         from pg_type t
         join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'schema_check'
        group by t.typname order by t.typname`,
    );
    const enumMap = Object.fromEntries(enums.rows.map((r) => [r.name, r.labels]));
    check(
      "Role members exact",
      JSON.stringify(toArray(enumMap.Role)) ===
        JSON.stringify(["system_admin", "inventory_officer", "manager"]),
      JSON.stringify(toArray(enumMap.Role)),
    );
    check(
      "AlertLevel members exact",
      JSON.stringify(toArray(enumMap.AlertLevel)) ===
        JSON.stringify(["ACTIVE", "WARNING", "CRITICAL", "EXPIRED"]),
      JSON.stringify(toArray(enumMap.AlertLevel)),
    );
    check(
      "Disposition members exact",
      JSON.stringify(toArray(enumMap.Disposition)) ===
        JSON.stringify(["REMOVED", "RETURNED", "SOLD", "DISCOUNTED", "DISPOSED"]),
      JSON.stringify(toArray(enumMap.Disposition)),
    );
    check(
      "ProductStatus members exact",
      JSON.stringify(toArray(enumMap.ProductStatus)) ===
        JSON.stringify(["IN_STOCK", "ON_SALE", "DISPOSED"]),
      JSON.stringify(toArray(enumMap.ProductStatus)),
    );

    const productCols = await client.query(
      `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'schema_check' and table_name = 'products'
        order by ordinal_position`,
    );
    const colMap = Object.fromEntries(productCols.rows.map((r) => [r.column_name, r]));
    for (const required of [
      "description",
      "manufacturing_date",
      "expiry_date",
      "storage_location",
      "status",
      "disposed_at",
      "disposed_by",
    ]) {
      check(`products column ${required}`, colMap[required] !== undefined);
    }
    check(
      "products.status defaults to IN_STOCK",
      colMap.status?.column_default === "'IN_STOCK'::\"ProductStatus\"" &&
        colMap.status?.is_nullable === "NO",
      String(colMap.status?.column_default),
    );
    check(
      "products.expiry_date stays nullable for legacy rows",
      colMap.expiry_date?.is_nullable === "YES",
      String(colMap.expiry_date?.is_nullable),
    );

    const productIdx = await client.query(
      `select indexname from pg_indexes
        where schemaname = 'schema_check' and tablename = 'products'`,
    );
    const productIdxNames = productIdx.rows.map((r) => r.indexname);
    check(
      "products_expiry_date_idx exists",
      productIdxNames.includes("products_expiry_date_idx"),
      productIdxNames.join(", "),
    );

    const cons = await client.query(
      `select conname, contype from pg_constraint
        where connamespace = 'schema_check'::regnamespace order by contype, conname`,
    );
    const names = cons.rows.map((r) => r.conname);
    for (const required of [
      "users_pkey",
      "categories_pkey",
      "products_pkey",
      "batches_pkey",
      "actions_pkey",
      "app_settings_pkey",
      "products_category_id_fkey",
      "products_disposed_by_fkey",
      "batches_product_id_fkey",
      "actions_batch_id_fkey",
      "actions_user_id_fkey",
      "batches_quantity_positive",
      "batches_dates_ordered",
      "app_settings_thresholds_ordered",
      "users_username_not_blank",
      "categories_name_not_blank",
    ]) {
      check(`constraint ${required}`, names.includes(required));
    }
    const fkCount = cons.rows.filter((r) => r.contype === "f").length;
    check("exactly five foreign keys", fkCount === 5, `found ${fkCount}`);

    const rls = await client.query(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'schema_check' and c.relkind = 'r'
        order by c.relname`,
    );
    check(
      "row level security on every table",
      rls.rows.length === 6 && rls.rows.every((r) => r.relrowsecurity === true),
      rls.rows.map((r) => `${r.relname}:${r.relrowsecurity}`).join(" "),
    );

    const policies = await client.query(
      `select count(*)::int as n from pg_policies where schemaname = 'schema_check'`,
    );
    check("no permissive policies", policies.rows[0].n === 0, `${policies.rows[0].n} policies`);

    const settings = await client.query(`select * from app_settings`);
    check(
      "settings singleton seeded 30/7",
      settings.rows.length === 1 &&
        settings.rows[0].warning_max === 30 &&
        settings.rows[0].critical_max === 7,
      JSON.stringify(settings.rows[0]),
    );

    // --- functional: classification parity with lib/expiry.ts ---
    const cat = await client.query(
      `insert into categories (name) values ('Verification') returning category_id`,
    );
    const prod = await client.query(
      `insert into products (name, category_id) values ('Verification Product', $1) returning product_id`,
      [cat.rows[0].category_id],
    );
    const pid = prod.rows[0].product_id;

    const offsets = [
      [-5, "EXPIRED"],
      [0, "CRITICAL"],
      [3, "CRITICAL"],
      [7, "CRITICAL"],
      [8, "WARNING"],
      [20, "WARNING"],
      [30, "WARNING"],
      [31, "ACTIVE"],
      [90, "ACTIVE"],
    ];
    for (const [days, expected] of offsets) {
      await client.query(
        `insert into batches
           (product_id, batch_number, quantity, manufacturing_date, expiry_date, storage_location)
         values ($1, $2, 10, current_date - 200, current_date + $3::integer, 'Verification Shelf')`,
        [pid, `V-${days}`, days],
      );
    }

    const ledger = await client.query(
      `select batch_number, days_remaining, computed_level from batch_ledger order by expiry_date`,
    );
    const levelMap = Object.fromEntries(
      ledger.rows.map((r) => [r.batch_number, { days: r.days_remaining, level: r.computed_level }]),
    );
    for (const [days, expected] of offsets) {
      const row = levelMap[`V-${days}`];
      check(
        `day ${days} classifies ${expected}`,
        row && row.level === expected && row.days === days,
        row ? `got ${row.level} at ${row.days} days` : "batch missing from view",
      );
    }

    const ordered = ledger.rows.map((r) => r.days_remaining);
    check(
      "view returns FEFO order",
      ordered.every((v, i) => i === 0 || ordered[i - 1] <= v),
      ordered.join(","),
    );

    const stock = await client.query(
      `select * from category_stock where category_id = $1`,
      [cat.rows[0].category_id],
    );
    const s = stock.rows[0];
    // count() and the ::bigint cast come back as strings from node-postgres,
    // which keeps bigint precision rather than coercing to a JS number.
    check(
      "category_stock aggregates correctly",
      Boolean(s) &&
        Number(s.product_count) === 1 &&
        Number(s.batch_count) === offsets.length &&
        Number(s.total_quantity) === offsets.length * 10,
      JSON.stringify(s),
    );

    // --- functional: the domain constraints actually bite ---
    await expectReject(
      client,
      "quantity 0 rejected",
      `insert into batches (product_id, batch_number, quantity, manufacturing_date, expiry_date, storage_location)
       values ($1, 'BAD-QTY', 0, current_date - 10, current_date + 5, 'Shelf')`,
      [pid],
    );
    await expectReject(
      client,
      "expiry before manufacture rejected",
      `insert into batches (product_id, batch_number, quantity, manufacturing_date, expiry_date, storage_location)
       values ($1, 'BAD-DATE', 5, current_date, current_date - 5, 'Shelf')`,
      [pid],
    );
    await expectReject(
      client,
      "duplicate batch number in one product rejected",
      `insert into batches (product_id, batch_number, quantity, manufacturing_date, expiry_date, storage_location)
       values ($1, 'V-3', 5, current_date - 10, current_date + 5, 'Shelf')`,
      [pid],
    );
    await expectReject(
      client,
      "inverted thresholds rejected",
      `update app_settings set warning_max = 5, critical_max = 10 where id = 1`,
    );
    await expectReject(
      client,
      "blank category name rejected",
      `insert into categories (name) values ('   ')`,
    );
    await expectReject(
      client,
      "deleting a category that still holds products rejected",
      `delete from categories where category_id = $1`,
      [cat.rows[0].category_id],
    );

    // --- disposal attribution: SET NULL keeps the product and the date ---
    const tempUser = await client.query(
      `insert into users (username, password_hash, role)
       values ('schema_check_user', 'not-a-real-hash', 'inventory_officer')
       returning user_id`,
    );
    const tempUid = tempUser.rows[0].user_id;
    const disposedRow = await client.query(
      `insert into products
         (name, category_id, expiry_date, status, disposed_at, disposed_by)
       values ('Disposed Probe', $1, current_date - 1, 'DISPOSED', current_date, $2)
       returning product_id`,
      [cat.rows[0].category_id, tempUid],
    );
    await client.query(`delete from users where user_id = $1`, [tempUid]);
    const afterUserDelete = await client.query(
      `select disposed_by, status, disposed_at from products where product_id = $1`,
      [disposedRow.rows[0].product_id],
    );
    check(
      "removing the account nulls disposed_by and keeps the product",
      afterUserDelete.rows[0].disposed_by === null &&
        afterUserDelete.rows[0].status === "DISPOSED" &&
        afterUserDelete.rows[0].disposed_at !== null,
      JSON.stringify(afterUserDelete.rows[0]),
    );

    const afterThresholds = await client.query(`select * from app_settings`);
    check(
      "settings row unchanged after rejected update",
      afterThresholds.rows[0].warning_max === 30 && afterThresholds.rows[0].critical_max === 7,
      JSON.stringify(afterThresholds.rows[0]),
    );
  } catch (error) {
    failures.push(`HARNESS ERROR :: ${error.message}`);
  } finally {
    await client.query("rollback");
    await client.end();
  }

  console.log(notes.join("\n"));
  console.log("");
  if (failures.length === 0) {
    console.log(`ALL CHECKS PASSED (${notes.filter((n) => n.startsWith("PASS")).length} assertions)`);
  } else {
    console.log(failures.join("\n"));
    console.log(`\n${failures.length} FAILURE(S)`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("fatal:", error.message);
  process.exitCode = 1;
});
