-- ============================================================================
-- Product Expiry Alert Management System
-- Complete Supabase schema
-- ============================================================================
--
-- WHAT THIS FILE IS
--   The full relational schema for the ledger, written as plain SQL so it can
--   be pasted into the Supabase SQL Editor and run against a fresh project.
--   It builds exactly the database that prisma/schema.prisma describes, plus
--   the integrity rules, indexes, derived views and row-level security that
--   the Prisma schema cannot express.
--
-- HOW IT RELATES TO PRISMA
--   Prisma migrations remain the source of truth for the running application.
--   This script produces the same shape by hand, so an existing Prisma-managed
--   database and a database built from this file are equivalent. Run this file
--   OR `npx prisma migrate deploy`, not both on the same database.
--
-- SAFE TO RE-RUN
--   Every statement is guarded. Running the whole file twice is a no-op the
--   second time, apart from `create or replace view` which rebuilds the views.
--
-- CONNECTION NOTES (these cost real debugging time if missed)
--   * Use the Supabase SESSION pooler on port 5432 for DATABASE_URL.
--     Prisma 7 with the @prisma/adapter-pg driver adapter does not work
--     through the transaction pooler on port 6543.
--   * The pooler host is aws-0-<region>.pooler.supabase.com and the username
--     is postgres.<project-ref>.
--   * The direct host db.<project-ref>.supabase.co resolves to IPv6 only and
--     is unreachable from networks without an IPv6 route. The pooler is the
--     path, and it is IPv4.
--
-- ARCHITECTURE REFERENCE
--   Five core entities (guide 6): users, categories, products, batches,
--   actions. app_settings is the single configuration record for the two
--   alert thresholds (guide 6.7), not a sixth entity. The batch is the unit
--   of monitoring and two batches of one product are never merged.
-- ============================================================================


-- ===== EXTENSIONS =====
-- pgcrypto supplies crypt() and gen_salt() for the optional account seed in
-- the final section. The application hashes with bcryptjs in Node, so this
-- extension exists only for that commented-out block.
create extension if not exists pgcrypto;


-- ===== ENUM TYPES =====
-- Member names and order match prisma/schema.prisma exactly. A bare
-- CREATE TYPE fails on a second run, so each is created inside a guard that
-- checks pg_type first.

do $$
begin
  if not exists (
    select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'Role'
       and n.nspname = current_schema()
  ) then
    create type "Role" as enum ('system_admin', 'inventory_officer', 'manager');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'AlertLevel'
       and n.nspname = current_schema()
  ) then
    create type "AlertLevel" as enum ('ACTIVE', 'WARNING', 'CRITICAL', 'EXPIRED');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'Disposition'
       and n.nspname = current_schema()
  ) then
    create type "Disposition" as enum ('REMOVED', 'RETURNED', 'SOLD', 'DISCOUNTED', 'DISPOSED');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'ProductStatus'
       and n.nspname = current_schema()
  ) then
    create type "ProductStatus" as enum ('IN_STOCK', 'ON_SALE', 'DISPOSED');
  end if;
end
$$;


-- ===== TABLES =====
-- Column names, types, nullability, defaults and primary-key constraint names
-- all match what Prisma generates, so `prisma migrate diff` reports no drift
-- against a database built from this file.

-- Staff accounts. password_hash holds a bcrypt digest produced in the
-- application (bcryptjs, cost 10); no plaintext password is ever stored.
create table if not exists "users" (
  "user_id"       serial       not null,
  "username"      text         not null,
  "password_hash" text         not null,
  "role"          "Role"       not null,
  "created_at"    timestamp(3) not null default current_timestamp,
  constraint "users_pkey" primary key ("user_id")
);

-- Product categories. The register's first step: a product cannot be
-- recorded without a category to file it under (guide 6.3).
create table if not exists "categories" (
  "category_id" serial not null,
  "name"        text   not null,
  constraint "categories_pkey" primary key ("category_id")
);

-- Products, each filed under exactly one category. The register's own record:
-- details, the dates that drive the comparison system, and the shelf state.
-- expiry_date stays nullable only so rows written before the column existed
-- still load; the application requires it on create.
create table if not exists "products" (
  "product_id"         serial           not null,
  "name"               text             not null,
  "description"        text,
  "category_id"        integer          not null,
  "manufacturing_date" date,
  "expiry_date"        date,
  "storage_location"   text,
  "status"             "ProductStatus"  not null default 'IN_STOCK',
  "disposed_at"        date,
  "disposed_by"        integer,
  constraint "products_pkey" primary key ("product_id")
);

-- Batches, the unit of monitoring. Two batches of one product carry
-- different expiry dates and are never merged into one row. alert_level is
-- the level written by the monitoring engine; the live level the dashboard
-- inks is derived at read time and is available in the batch_ledger view.
create table if not exists "batches" (
  "batch_id"           serial       not null,
  "product_id"         integer      not null,
  "batch_number"       text         not null,
  "quantity"           integer      not null,
  "manufacturing_date" date         not null,
  "expiry_date"        date         not null,
  "storage_location"   text         not null,
  "alert_level"        "AlertLevel" not null default 'ACTIVE',
  constraint "batches_pkey" primary key ("batch_id")
);

-- Action records. Every disposition carries the identity of the account that
-- filed it and the time, which is what makes the record attributable
-- (thesis 3.6.8). A batch with no action is PENDING.
create table if not exists "actions" (
  "action_id"   serial       not null,
  "batch_id"    integer      not null,
  "user_id"     integer      not null,
  "disposition" "Disposition" not null,
  "remark"      text,
  "created_at"  timestamp(3) not null default current_timestamp,
  constraint "actions_pkey" primary key ("action_id")
);

-- Single configuration row for the two alert thresholds (guide 6.7).
-- id is pinned to 1. Defaults reproduce Table 3.1: warning at 30 days,
-- critical at 7 days.
create table if not exists "app_settings" (
  "id"           integer not null default 1,
  "warning_max"  integer not null default 30,
  "critical_max" integer not null default 7,
  constraint "app_settings_pkey" primary key ("id")
);


-- ===== DOMAIN CONSTRAINTS =====
-- Rules the domain requires that the Prisma schema cannot express. Each is
-- added behind a pg_constraint guard so a rerun does not error.

-- A batch of zero or negative quantity is a data-entry fault, not stock.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'batches_quantity_positive'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "batches"
      add constraint "batches_quantity_positive" check ("quantity" > 0);
  end if;
end
$$;

-- Stock cannot expire before it was manufactured. Without this, a mistyped
-- date would classify against a nonsensical interval.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'batches_dates_ordered'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "batches"
      add constraint "batches_dates_ordered" check ("expiry_date" >= "manufacturing_date");
  end if;
end
$$;

-- The critical boundary must sit closer than the warning boundary. Were the
-- pair inverted, the classification in lib/expiry.ts would leave the
-- CRITICAL band unreachable and no batch could ever reach it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'app_settings_thresholds_ordered'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "app_settings"
      add constraint "app_settings_thresholds_ordered"
      check ("critical_max" >= 0 and "warning_max" > "critical_max");
  end if;
end
$$;

-- Identity fields must carry something after trimming.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_username_not_blank'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "users"
      add constraint "users_username_not_blank" check (length(btrim("username")) > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_name_not_blank'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "categories"
      add constraint "categories_name_not_blank" check (length(btrim("name")) > 0);
  end if;
end
$$;


-- ===== UNIQUE INDEXES =====
-- users_username_key and categories_name_key keep the names Prisma generates.

create unique index if not exists "users_username_key" on "users" ("username");

create unique index if not exists "categories_name_key" on "categories" ("name");

-- A batch number identifies one batch within a product, so the pair is
-- unique. Prisma does not declare this index; the register enforces it in
-- the route as well, and this constraint is the backstop for any other
-- writer, including a direct SQL session.
create unique index if not exists "batches_product_id_batch_number_key"
  on "batches" ("product_id", "batch_number");


-- ===== PERFORMANCE INDEXES =====
-- Matching the queries the application actually runs.

-- The dashboard's FEFO ordering: every read sorts by earliest expiry date.
create index if not exists "batches_expiry_date_idx" on "batches" ("expiry_date");

-- Category register counts products per category; product register counts
-- batches per product.
create index if not exists "products_category_id_idx" on "products" ("category_id");
create index if not exists "batches_product_id_idx"  on "batches"  ("product_id");

-- The close-to-expiry list on the product register orders every product by
-- expiry date on each read.
create index if not exists "products_expiry_date_idx" on "products" ("expiry_date");

-- Action records read by batch, by account, and newest first.
create index if not exists "actions_batch_id_idx"   on "actions" ("batch_id");
create index if not exists "actions_user_id_idx"    on "actions" ("user_id");
create index if not exists "actions_created_at_idx" on "actions" ("created_at" desc);

-- The urgency list only ever surfaces the batches nearest expiry, so a
-- partial index keeps it small.
create index if not exists "batches_urgency_idx"
  on "batches" ("expiry_date")
  where "alert_level" in ('CRITICAL', 'EXPIRED');


-- ===== FOREIGN KEYS =====
-- Behaviour matches prisma/schema.prisma: ON DELETE RESTRICT ON UPDATE
-- CASCADE, with one exception noted at products_disposed_by_fkey.
-- RESTRICT is deliberate. Deleting a category must not silently erase the
-- products filed under it, and an action record must never lose its batch or
-- its author, because attribution is the point of the record.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_category_id_fkey'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "products"
      add constraint "products_category_id_fkey"
      foreign key ("category_id") references "categories" ("category_id")
      on delete restrict on update cascade;
  end if;
end
$$;

-- The account that struck a product off the shelf. SET NULL rather than
-- RESTRICT: removing an account must not be blocked by a product it once
-- disposed of. The disposal date stays, so the record keeps its history
-- even after the name is gone.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_disposed_by_fkey'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "products"
      add constraint "products_disposed_by_fkey"
      foreign key ("disposed_by") references "users" ("user_id")
      on delete set null on update cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'batches_product_id_fkey'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "batches"
      add constraint "batches_product_id_fkey"
      foreign key ("product_id") references "products" ("product_id")
      on delete restrict on update cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'actions_batch_id_fkey'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "actions"
      add constraint "actions_batch_id_fkey"
      foreign key ("batch_id") references "batches" ("batch_id")
      on delete restrict on update cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'actions_user_id_fkey'
       and connamespace = current_schema()::regnamespace
  ) then
    alter table "actions"
      add constraint "actions_user_id_fkey"
      foreign key ("user_id") references "users" ("user_id")
      on delete restrict on update cascade;
  end if;
end
$$;


-- ===== DERIVED VIEW: batch_ledger =====
-- Days remaining and the alert level are computed at read time, never trusted
-- from storage (guide 6.8). This view mirrors lib/expiry.ts exactly:
--
--   days < 0              -> EXPIRED
--   days <= critical_max  -> CRITICAL
--   days <= warning_max   -> WARNING
--   otherwise             -> ACTIVE
--
-- EXPIRED is tested first, and both upper bounds are inclusive, so a batch
-- expiring today is CRITICAL at the default 7 day setting.
--
-- The settings row is LEFT JOINed with coalesced defaults so the view still
-- returns every batch if the app_settings row is missing, rather than
-- returning nothing at all.

create or replace view "batch_ledger" as
select
  b."batch_id",
  b."batch_number",
  b."quantity",
  b."manufacturing_date",
  b."expiry_date",
  b."storage_location",
  b."alert_level"                                             as "stored_level",
  p."product_id",
  p."name"                                                    as "product_name",
  c."category_id",
  c."name"                                                    as "category_name",
  (b."expiry_date" - current_date)                            as "days_remaining",
  case
    when (b."expiry_date" - current_date) < 0                          then 'EXPIRED'
    when (b."expiry_date" - current_date) <= coalesce(s."critical_max", 7)  then 'CRITICAL'
    when (b."expiry_date" - current_date) <= coalesce(s."warning_max", 30)  then 'WARNING'
    else 'ACTIVE'
  end                                                         as "computed_level"
from "batches" b
join "products"   p on p."product_id"  = b."product_id"
join "categories" c on c."category_id" = p."category_id"
left join "app_settings" s on s."id" = 1
order by b."expiry_date" asc;


-- ===== DERIVED VIEW: category_stock =====
-- What the category register shows: how many products sit in each category,
-- how many batches those products carry, and the total units held.

create or replace view "category_stock" as
select
  c."category_id",
  c."name"                                  as "category_name",
  count(distinct p."product_id")            as "product_count",
  count(b."batch_id")                       as "batch_count",
  coalesce(sum(b."quantity"), 0)::bigint    as "total_quantity"
from "categories" c
left join "products" p on p."category_id" = c."category_id"
left join "batches"  b on b."product_id"  = p."product_id"
group by c."category_id", c."name"
order by c."name" asc;


-- ===== ROW LEVEL SECURITY =====
-- Read this before adding a policy.
--
-- The application reads and writes exclusively through Prisma, as the
-- postgres role, over the session pooler. The postgres role is the table
-- owner and BYPASSES row level security, so nothing here changes how the
-- application behaves.
--
-- The anon and authenticated roles, which Supabase exposes through the
-- public REST API (PostgREST) and the JS client, are never used for data
-- access in this application. The session lives in an httpOnly cookie
-- signed with HMAC-SHA256 and every permission check happens on the server.
--
-- So the correct configuration is default deny: enable row level security,
-- add NO permissive policies, and revoke the table grants. A leaked anon key
-- then reads nothing from the ledger, because there is no policy to permit
-- it and no grant to allow it in the first place.
--
-- If Supabase Auth is adopted later, add explicit policies here at that
-- point. Do not add a permissive policy "for now".

alter table "users"        enable row level security;
alter table "categories"   enable row level security;
alter table "products"     enable row level security;
alter table "batches"      enable row level security;
alter table "actions"      enable row level security;
alter table "app_settings" enable row level security;

revoke all on table "users"        from anon, authenticated;
revoke all on table "categories"   from anon, authenticated;
revoke all on table "products"     from anon, authenticated;
revoke all on table "batches"      from anon, authenticated;
revoke all on table "actions"      from anon, authenticated;
revoke all on table "app_settings" from anon, authenticated;

revoke all on table "batch_ledger"   from anon, authenticated;
revoke all on table "category_stock" from anon, authenticated;

revoke all on sequence "users_user_id_seq"         from anon, authenticated;
revoke all on sequence "categories_category_id_seq" from anon, authenticated;
revoke all on sequence "products_product_id_seq"   from anon, authenticated;
revoke all on sequence "batches_batch_id_seq"      from anon, authenticated;
revoke all on sequence "actions_action_id_seq"     from anon, authenticated;

-- Forward-looking: anything created in this schema later defaults to closed
-- rather than open. Without this, a future table would inherit Supabase's
-- permissive default grants.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;


-- ===== SEED: CONFIGURATION =====
-- The single settings row the classification reads. Defaults from Table 3.1.
-- The application also upserts this row when the administrator saves
-- thresholds, so this insert only matters on a fresh database.

insert into "app_settings" ("id", "warning_max", "critical_max")
values (1, 30, 7)
on conflict ("id") do nothing;


-- ===== OPTIONAL SEED: BUILD-TEST ACCOUNTS (COMMENTED OUT) =====
-- These are the accounts prisma/seed.ts creates, with bcrypt hashes produced
-- in-database by pgcrypto. The password is password123 on every one of them.
--
-- They are BUILD-TEST CREDENTIALS ONLY. Do not uncomment this block on a
-- database that will hold real stock records or be reachable from the
-- internet. It is left commented so that running this file can never
-- create an account with a known password.
--
-- insert into "users" ("username", "password_hash", "role")
-- values
--   ('admin',   crypt('password123', gen_salt('bf', 10)), 'system_admin'),
--   ('officer', crypt('password123', gen_salt('bf', 10)), 'inventory_officer'),
--   ('manager', crypt('password123', gen_salt('bf', 10)), 'manager')
-- on conflict ("username") do nothing;


-- ===== OPTIONAL: KEEP STORED alert_level IN STEP (COMMENTED OUT) =====
-- The application derives the level at read time and never trusts the stored
-- column, so nothing breaks without this. Enabling it makes the stored
-- alert_level agree with the computed one after every batch write, which is
-- useful if you want to query the raw table and trust the column.
--
-- It is commented out because it adds behaviour the Prisma schema does not
-- describe, and a silent trigger is easy to forget about later.
--
-- create or replace function "refresh_batch_alert_level"()
-- returns trigger
-- language plpgsql
-- as $$
-- declare
--   d integer := new."expiry_date" - current_date;
--   w integer;
--   c integer;
-- begin
--   select coalesce(max("warning_max"), 30), coalesce(max("critical_max"), 7)
--     into w, c
--     from "app_settings" where "id" = 1;
--
--   new."alert_level" := case
--     when d < 0     then 'EXPIRED'
--     when d <= c    then 'CRITICAL'
--     when d <= w    then 'WARNING'
--     else 'ACTIVE'
--   end::"AlertLevel";
--
--   return new;
-- end
-- $$;
--
-- drop trigger if exists "batches_alert_level_trigger" on "batches";
-- create trigger "batches_alert_level_trigger"
--   before insert or update of "expiry_date" on "batches"
--   for each row execute function "refresh_batch_alert_level"();


-- ===== VERIFICATION =====
-- Run these after the script to confirm the install. Expected results are
-- noted beside each query.
--
-- 1. Every table exists, six rows.
--    select table_name from information_schema.tables
--     where table_schema = 'public' and table_type = 'BASE TABLE'
--     order by table_name;
--    -- actions, app_settings, batches, categories, products, users
--
-- 2. The settings row is present with the defaults.
--    select * from "app_settings";
--    -- 1 | 30 | 7
--
-- 3. Row counts on a fresh database.
--    select
--      (select count(*) from "users")        as users,
--      (select count(*) from "categories")   as categories,
--      (select count(*) from "products")     as products,
--      (select count(*) from "batches")      as batches,
--      (select count(*) from "actions")      as actions,
--      (select count(*) from "app_settings") as settings;
--    -- users 0, categories 0, products 0, batches 0, actions 0, settings 1
--
-- 4. The derived view returns the live level, not the stored one.
--    select "product_name", "batch_number", "expiry_date",
--           "days_remaining", "computed_level", "stored_level"
--      from "batch_ledger";
--
-- 5. Every constraint landed, four foreign keys plus the checks.
--    select conname, contype from pg_constraint
--     where conrelid::regclass::text in
--           ('users','categories','products','batches','actions','app_settings')
--     order by conrelid::regclass::text, conname;
--
-- 6. Row level security is on everywhere and no policy exists.
--    select relname, relrowsecurity, relforcerowsecurity
--      from pg_class
--     where relname in
--           ('users','categories','products','batches','actions','app_settings');
--    select count(*) from pg_policies where schemaname = 'public';
--    -- relrowsecurity true on all six, and the policy count is 0
--
-- 7. Confirm anon truly cannot read the ledger. Run this and expect the
--    empty result plus no rows returned.
--    set role anon;
--    select count(*) from "batches";   -- expect: permission denied
--    reset role;
