import Link from "next/link";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/guard";
import {
  daysLabel,
  expiryWindow,
  formatExpiry,
  isWatchlisted,
} from "@/lib/product-expiry";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NewProductButton,
  ProductRowActions,
  type CategoryOption,
  type ProductSummary,
} from "@/components/product-form";

// The product register: every product in the ledger, filed under its
// category, with the days remaining until each one expires. Writes live in
// the product form sheet; this page reads fresh rows on every request so a
// create, edit or disposal lands at once.
//
// Above the table sits the close-to-expiry list, the reason the register
// exists. Today's date is set against every product's expiry date and the
// products inside two months are named with the exact date they hit, soonest
// first. Disposed products are struck off the shelf, so they are not listed
// even when their date has passed.

export const dynamic = "force-dynamic";

const columnHead = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export default async function ProductsPage() {
  await requirePermission("manage_products");

  const [products, categories] = await Promise.all([
    db.product.findMany({
      orderBy: { name: "asc" },
      include: { category: true, _count: { select: { batches: true } } },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const categoryOptions: CategoryOption[] = categories.map((category) => ({
    category_id: category.category_id,
    name: category.name,
  }));

  // One pass, so the watchlist and the table read the same figures.
  const rows = products.map((product) => {
    const window = expiryWindow(product.expiry_date);
    return {
      product,
      window,
      summary: {
        product_id: product.product_id,
        name: product.name,
        category_id: product.category_id,
        description: product.description,
        expiry_date: product.expiry_date
          ? format(product.expiry_date, "yyyy-MM-dd")
          : null,
        manufacturing_date: product.manufacturing_date
          ? format(product.manufacturing_date, "yyyy-MM-dd")
          : null,
        storage_location: product.storage_location,
        status: product.status as ProductSummary["status"],
      } satisfies ProductSummary,
    };
  });

  const watchlist = rows
    .filter((row) => row.product.status !== "DISPOSED" && isWatchlisted(row.window))
    .sort((a, b) => (a.window.days ?? 0) - (b.window.days ?? 0));

  const categoryCount = new Set(products.map((product) => product.category_id)).size;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Product Register
          </h1>
          <p className="text-sm text-muted-foreground">
            Every product held in the ledger, filed under its category.
          </p>
        </div>
        <NewProductButton categories={categoryOptions} />
      </div>

      <section className="mt-6 border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Close to expiry</h2>
          <p className="text-xs text-muted-foreground">
            {watchlist.length === 0
              ? "Nothing expires in the next 2 months."
              : `${watchlist.length} ${watchlist.length === 1 ? "product expires" : "products expire"} in the next 2 months, soonest first.`}
          </p>
        </div>

        {watchlist.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No product sits inside the 2 month window today.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {watchlist.map(({ product, window }) => (
              <li
                key={product.product_id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    href={`/products/${product.product_id}`}
                    className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {product.category.name} · Expires {formatExpiry(product.expiry_date)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-medium tabular-nums ${window.textClass}`}
                  >
                    {daysLabel(window.days)}
                  </span>
                  {/* A window with no stamp carries no urgency, so it is set
                      as plain text rather than an empty solid badge. */}
                  {window.stampClass ? (
                    <Badge className={window.stampClass}>{window.label}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{window.label}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        {products.length} {products.length === 1 ? "product" : "products"} across {categoryCount}{" "}
        {categoryCount === 1 ? "category" : "categories"}.
      </p>

      <div className="mt-3 overflow-x-auto border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={columnHead}>Product</TableHead>
              <TableHead className={columnHead}>Category</TableHead>
              <TableHead className={columnHead}>Expiry</TableHead>
              <TableHead className={`${columnHead} text-right`}>Days</TableHead>
              <TableHead className={columnHead}>Status</TableHead>
              <TableHead className={`${columnHead} text-right`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ product, window, summary }) => (
              <TableRow key={product.product_id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/products/${product.product_id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {product.category.name}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatExpiry(product.expiry_date)}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap text-right font-medium tabular-nums ${window.textClass}`}
                >
                  {daysLabel(window.days)}
                </TableCell>
                <TableCell>
                  {product.status === "IN_STOCK" ? (
                    <span className="text-muted-foreground">In stock</span>
                  ) : (
                    <Badge
                      className={
                        product.status === "ON_SALE"
                          ? "bg-level-active text-background"
                          : "bg-level-expired text-background"
                      }
                    >
                      {product.status === "ON_SALE" ? "On sale" : "Disposed"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ProductRowActions product={summary} categories={categoryOptions} />
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No products on file. Add a category, then a product, to start the register.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
