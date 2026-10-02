import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/guard";
import { classifyLevel, daysUntil, type Level } from "@/lib/expiry";
import { daysLabel, expiryWindow, formatExpiry } from "@/lib/product-expiry";
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
  type CategoryOption,
  type ProductSummary,
} from "@/components/product-form";
import { ProductActions } from "@/components/product-actions";
import { NewBatchButton } from "@/components/batch-form";

// One product, in full: how close it is to expiring, what it is, where it
// sits, which batches are held against it, and the controls that move it
// on or off the shelf.
//
// The comparison block leads because that is the question this sheet exists
// to answer. Everything below it is context for the decision the officer
// makes from that number.

export const dynamic = "force-dynamic";

const columnHead = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

const levelStamp: Record<Level, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-level-active text-background" },
  WARNING: { label: "Warning", className: "bg-level-warning text-foreground" },
  CRITICAL: { label: "Critical", className: "bg-level-critical text-background" },
  EXPIRED: { label: "Expired", className: "bg-level-expired text-background" },
};

const levelText: Record<Level, string> = {
  ACTIVE: "text-muted-foreground",
  WARNING: "text-level-warning",
  CRITICAL: "text-level-critical",
  EXPIRED: "text-level-expired",
};

function dayLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

const STATUS_LABEL = {
  IN_STOCK: "In stock",
  ON_SALE: "On sale",
  DISPOSED: "Disposed",
} as const;

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("manage_products");

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const productId = Number(id);

  const [product, categories, settings] = await Promise.all([
    db.product.findUnique({
      where: { product_id: productId },
      include: {
        category: true,
        batches: { orderBy: { expiry_date: "asc" } },
        disposed_by_user: { select: { username: true } },
      },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.appSettings.findUnique({ where: { id: 1 } }),
  ]);

  if (!product) notFound();

  const warningMax = settings?.warning_max ?? 30;
  const criticalMax = settings?.critical_max ?? 7;

  const window = expiryWindow(product.expiry_date);

  const summary: ProductSummary = {
    product_id: product.product_id,
    name: product.name,
    category_id: product.category_id,
    description: product.description,
    expiry_date: product.expiry_date ? format(product.expiry_date, "yyyy-MM-dd") : null,
    manufacturing_date: product.manufacturing_date
      ? format(product.manufacturing_date, "yyyy-MM-dd")
      : null,
    storage_location: product.storage_location,
    status: product.status as ProductSummary["status"],
  };

  const categoryOptions: CategoryOption[] = categories.map((category) => ({
    category_id: category.category_id,
    name: category.name,
  }));

  return (
    <div className="flex flex-col">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Product register
      </Link>

      <div className="mt-3 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {product.name}
            </h1>
            <Badge
              className={
                product.status === "ON_SALE"
                  ? "bg-level-active text-background"
                  : product.status === "DISPOSED"
                    ? "bg-level-expired text-background"
                    : "border border-border text-muted-foreground"
              }
            >
              {STATUS_LABEL[product.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{product.category.name}</p>
        </div>
        <ProductActions product={summary} categories={categoryOptions} />
      </div>

      {/* The comparison. Today set against the expiry date, with the window
          the register reports on and the exact date it hits. */}
      <section className="mt-6 border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Time to expiry</h2>
          {window.stampClass ? (
            <Badge className={window.stampClass}>{window.label}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">{window.label}</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className={`${columnHead}`}>Days left</p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${window.textClass}`}
            >
              {daysLabel(window.days)}
            </p>
          </div>
          <div>
            <p className={`${columnHead}`}>Expires</p>
            <p className="mt-1 text-lg font-medium tabular-nums text-foreground">
              {formatExpiry(product.expiry_date)}
            </p>
          </div>
          <div>
            <p className={`${columnHead}`}>Manufactured</p>
            <p className="mt-1 text-lg font-medium tabular-nums text-muted-foreground">
              {product.manufacturing_date
                ? format(product.manufacturing_date, "dd MMM yyyy")
                : "Not on file"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Details</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className={columnHead}>Description</dt>
            <dd className="mt-1 text-sm text-foreground">
              {product.description || (
                <span className="text-muted-foreground">No description on file.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className={columnHead}>Storage location</dt>
            <dd className="mt-1 text-sm text-foreground">
              {product.storage_location || (
                <span className="text-muted-foreground">Not on file.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className={columnHead}>Shelf status</dt>
            <dd className="mt-1 text-sm text-foreground">{STATUS_LABEL[product.status]}</dd>
          </div>
          <div>
            <dt className={columnHead}>Batches held</dt>
            <dd className="mt-1 text-sm tabular-nums text-foreground">
              {product.batches.length}
            </dd>
          </div>
        </dl>

        {product.status === "DISPOSED" && (
          <div className="mt-4 border-t border-border pt-3">
            <p className={columnHead}>Struck off</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {product.disposed_at ? format(product.disposed_at, "dd MMM yyyy") : "Date unknown"}
              {" by "}
              {product.disposed_by_user?.username ?? "an account that has since been removed"}.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Batches</h2>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {product.batches.length === 0
                ? "No stock lots recorded against this product."
                : `${product.batches.length} ${product.batches.length === 1 ? "lot" : "lots"}, first expired first out.`}
            </p>
            {product.status !== "DISPOSED" && (
              <NewBatchButton
                product={{
                  product_id: product.product_id,
                  name: product.name,
                  storage_location: product.storage_location,
                }}
              />
            )}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={columnHead}>Batch</TableHead>
                <TableHead className={`${columnHead} text-right`}>Quantity</TableHead>
                <TableHead className={columnHead}>Storage</TableHead>
                <TableHead className={columnHead}>Expiry</TableHead>
                <TableHead className={`${columnHead} text-right`}>Days left</TableHead>
                <TableHead className={columnHead}>Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.batches.map((batch) => {
                const days = daysUntil(batch.expiry_date);
                const level = classifyLevel(days, warningMax, criticalMax);
                return (
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-medium tabular-nums">
                      {batch.batch_number}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{batch.quantity}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {batch.storage_location}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {format(batch.expiry_date, "dd MMM yyyy")}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right font-medium tabular-nums ${levelText[level]}`}
                    >
                      {dayLabel(days)}
                    </TableCell>
                    <TableCell>
                      <Badge className={levelStamp[level].className}>
                        {levelStamp[level].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {product.batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {product.status === "DISPOSED"
                      ? "No batches yet. A struck-off product takes no new stock lots."
                      : "No batches yet. Record the first stock lot with New batch."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {categories.length === 0 && <NewProductButton categories={[]} />}
    </div>
  );
}
