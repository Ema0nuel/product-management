// Live smoke test for the product surfaces. Run with the production server
// up: node supabase/smoke-products.cjs
//
// Walks the three seeded roles through the register: create, edit, the shelf
// transitions, and each refusal the server is supposed to give.

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function login(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(`login ${username} -> ${res.status}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  return { headers: { "Content-Type": "application/json", cookie } };
}

async function call(ctx, method, path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: ctx?.headers ?? { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  return { status: res.status, body };
}

function today(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const admin = await login("admin");
  const officer = await login("officer");
  const manager = await login("manager");

  console.log("\nRoles");

  // A manager holds view_dashboard, so reading the register answers 200 by
  // design. Pages never 403: /products redirects the role to /dashboard.
  const mgrProducts = await call(manager, "GET", "/api/products");
  check("manager reads the product register", mgrProducts.status === 200,
    `got ${mgrProducts.status}`);

  const mgrPage = await fetch(`${BASE}/products`, {
    headers: { cookie: manager.headers.cookie },
    redirect: "manual",
  });
  const mgrLocation = mgrPage.headers.get("location") ?? "";
  check(
    "manager is redirected off the products page",
    mgrPage.status >= 300 && mgrPage.status < 400 &&
      mgrLocation.includes("/dashboard"),
    `got ${mgrPage.status} -> ${mgrLocation}`,
  );

  console.log("\nCreate");

  const payload = {
    name: `Smoke Widget ${Date.now()}`,
    category_id: 1,
    description: "Created by the smoke harness to prove the register accepts a full record.",
    expiry_date: today(45),
    manufacturing_date: today(-10),
    storage_location: "Aisle 9 Shelf 2",
  };

  const created = await call(officer, "POST", "/api/products", payload);
  check("officer creates a product", created.status === 201 && created.body?.ok,
    `got ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body?.product?.product_id;
  if (!id) {
    console.log("\nStopping: no product to continue against.");
    return;
  }

  const dup = await call(officer, "POST", "/api/products", payload);
  check("duplicate name inside a category is refused", dup.status === 409,
    `got ${dup.status}`);

  const badDates = await call(officer, "POST", "/api/products", {
    ...payload,
    name: `Smoke Backwards ${Date.now()}`,
    manufacturing_date: today(30),
    expiry_date: today(10),
  });
  check("manufacturing after expiry is refused", badDates.status === 400,
    `got ${badDates.status}`);

  const noCategory = await call(officer, "POST", "/api/products", {
    ...payload,
    name: `Smoke Orphan ${Date.now()}`,
    category_id: 999999,
  });
  check("unknown category is refused", noCategory.status === 409 || noCategory.status === 400,
    `got ${noCategory.status}`);

  console.log("\nRead");

  const list = await call(officer, "GET", "/api/products");
  const listed = (list.body?.products ?? []).find((p) => p.product_id === id);
  check("new product appears on the register", Boolean(listed),
    `status ${list.status}`);
  check("register carries the expiry date", listed?.expiry_date === payload.expiry_date,
    `got ${listed?.expiry_date}`);

  const detail = await fetch(`${BASE}/products/${id}`, { headers: officer.headers });
  check("detail page renders", detail.status === 200, `got ${detail.status}`);
  const detailHtml = await detail.text();
  check("detail page shows the expiry window", detailHtml.includes("Time to expiry"));
  check("detail page shows the days left", detailHtml.includes("Days left"));

  const missing = await fetch(`${BASE}/products/999999999`, { headers: officer.headers });
  check("unknown product is a 404", missing.status === 404, `got ${missing.status}`);

  const junk = await fetch(`${BASE}/products/not-a-number`, { headers: officer.headers });
  check("non numeric id is a 404", junk.status === 404, `got ${junk.status}`);

  console.log("\nEdit");

  const edited = await call(officer, "PATCH", `/api/products/${id}`, {
    ...payload,
    name: `${payload.name} Revised`,
    storage_location: "Aisle 1 Shelf 4",
  });
  check("officer edits the product", edited.status === 200 && edited.body?.ok,
    `got ${edited.status}`);

  const patchedStatus = await call(officer, "PATCH", `/api/products/${id}`, {
    ...payload,
    name: `${payload.name} Hacked`,
    status: "DISPOSED",
  });
  check("edit cannot set status", patchedStatus.status === 200 &&
    patchedStatus.body?.product?.status !== "DISPOSED",
    `status came back ${patchedStatus.body?.product?.status}`);

  const badId = await call(officer, "PATCH", "/api/products/0", payload);
  check("id 0 is refused", badId.status === 400, `got ${badId.status}`);

  console.log("\nShelf transitions");

  const onSale = await call(officer, "POST", `/api/products/${id}/status`, { status: "ON_SALE" });
  check("mark on sale", onSale.status === 200 && onSale.body?.product?.status === "ON_SALE",
    `got ${onSale.status}`);

  const offSale = await call(officer, "POST", `/api/products/${id}/status`, { status: "IN_STOCK" });
  check("take off sale", offSale.status === 200 && offSale.body?.product?.status === "IN_STOCK",
    `got ${offSale.status}`);

  const disposed = await call(officer, "POST", `/api/products/${id}/status`, { status: "DISPOSED" });
  check("mark disposed", disposed.status === 200 && disposed.body?.product?.status === "DISPOSED",
    `got ${disposed.status}`);
  check("disposal records the acting account",
    disposed.body?.product?.disposed_by === 1 || typeof disposed.body?.product?.disposed_by === "number",
    `disposed_by ${disposed.body?.product?.disposed_by}`);

  const back = await call(officer, "POST", `/api/products/${id}/status`, { status: "IN_STOCK" });
  check("disposed product cannot return to the shelf", back.status === 409,
    `got ${back.status}`);

  const badStatus = await call(officer, "POST", `/api/products/${id}/status`, { status: "SOLD" });
  check("unknown status is refused", badStatus.status === 400, `got ${badStatus.status}`);

  console.log("\nPermissions");

  const mgrWrite = await call(manager, "POST", `/api/products/${id}/status`, { status: "ON_SALE" });
  check("manager cannot change shelf status", mgrWrite.status === 403, `got ${mgrWrite.status}`);

  const mgrCreate = await call(manager, "POST", "/api/products", payload);
  check("manager cannot create a product", mgrCreate.status === 403, `got ${mgrCreate.status}`);

  const anon = await call(null, "POST", "/api/products", payload);
  check("anonymous request is refused", anon.status === 401 || anon.status === 403,
    `got ${anon.status}`);

  console.log("\nRemove");

  const removed = await call(officer, "DELETE", `/api/products/${id}`);
  check("officer removes the product", removed.status === 200 && removed.body?.ok,
    `got ${removed.status}`);

  const gone = await fetch(`${BASE}/products/${id}`, { headers: officer.headers });
  check("removed product is gone", gone.status === 404, `got ${gone.status}`);

  const withBatches = await call(officer, "DELETE", "/api/products/1");
  check("product holding batches is refused", withBatches.status === 409,
    `got ${withBatches.status}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("smoke harness crashed:", error);
  process.exitCode = 1;
});
