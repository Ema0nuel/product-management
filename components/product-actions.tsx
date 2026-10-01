"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ProductEditButton,
  type CategoryOption,
  type ProductSummary,
} from "@/components/product-form";

// Shelf controls for one product: edit, put it on sale, take it off sale,
// strike it off, remove it.
//
// Disposal is the one irreversible move on this sheet, so it asks first and
// there is no control offered afterwards to undo it. The server holds that
// line as well; this dialog only keeps the officer from arriving there by
// accident.

type Status = "IN_STOCK" | "ON_SALE" | "DISPOSED";

async function postStatus(
  productId: number,
  status: Status,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/products/${productId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok && Boolean(data?.ok), error: data?.error as string | undefined };
}

export function ProductActions({
  product,
  categories,
}: {
  product: ProductSummary;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Status | "REMOVE" | null>(null);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const disposed = product.status === "DISPOSED";

  async function changeStatus(next: Status) {
    setPending(next);
    try {
      const result = await postStatus(product.product_id, next);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update the product.");
        return;
      }
      toast.success(
        next === "ON_SALE"
          ? `${product.name} is on sale.`
          : next === "IN_STOCK"
            ? `${product.name} is back in stock.`
            : `${product.name} has been disposed.`,
      );
      if (next === "DISPOSED") setDisposeOpen(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function onRemove() {
    setPending("REMOVE");
    try {
      const res = await fetch(`/api/products/${product.product_id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not remove the product.");
        return;
      }
      toast.success(`Removed ${product.name}.`);
      setRemoveOpen(false);
      router.push("/products");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProductEditButton product={product} categories={categories} />

      {!disposed && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => changeStatus(product.status === "ON_SALE" ? "IN_STOCK" : "ON_SALE")}
            disabled={pending !== null}
          >
            {product.status === "ON_SALE" ? (
              <>
                <Check className="size-4" />
                Take off sale
              </>
            ) : (
              <>
                <Tag className="size-4" />
                Mark on sale
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={() => setDisposeOpen(true)}
            disabled={pending !== null}
          >
            <Ban className="size-4" />
            Mark disposed
          </Button>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => setRemoveOpen(true)}
        disabled={pending !== null}
      >
        <Trash2 className="size-4" />
        Remove
      </Button>

      <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {product.name} as disposed</DialogTitle>
            <DialogDescription>
              This strikes the product off the shelf. The date and your account are recorded
              against it, and it will not be returned to stock afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisposeOpen(false)}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => changeStatus("DISPOSED")}
              disabled={pending !== null}
            >
              {pending === "DISPOSED" ? "Disposing..." : "Mark disposed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove product</DialogTitle>
            <DialogDescription>
              Remove {product.name} from the register. A product still holding batches cannot be
              removed until those batches are clear.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveOpen(false)}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onRemove}
              disabled={pending !== null}
            >
              {pending === "REMOVE" ? "Removing..." : "Remove product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
