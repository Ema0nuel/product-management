"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Batch registration for one product, the sheet thesis 3.4.2 puts in the
// officer's hands: a batch number, a quantity, the two dates the comparison
// system reads, and the shelf position the row reports. The product is
// fixed by the page it opens from, so it is never a field on this form.
//
// Every lot carries its own dates, which is the whole point: two lots of
// one product are graded separately and never merged.

export type BatchProduct = {
  product_id: number;
  name: string;
  storage_location: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when the string is a real calendar date, not 2026-02-30. */
function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

const schema = z
  .object({
    batch_number: z
      .string()
      .trim()
      .min(1, "Enter a batch number.")
      .max(60, "Keep the batch number within 60 characters."),
    quantity: z
      .string()
      .min(1, "Enter how many units this batch holds.")
      .refine((value) => Number.isInteger(Number(value)), "Enter a whole number of units.")
      .refine((value) => Number(value) >= 1, "Quantity must be at least 1.")
      .refine(
        (value) => Number(value) <= 2147483647,
        "Quantity is too large to record.",
      ),
    manufacturing_date: z
      .string()
      .min(1, "Enter the date this batch was made.")
      .refine(isCalendarDate, "Enter a real manufacturing date."),
    expiry_date: z
      .string()
      .min(1, "Enter the date this batch expires.")
      .refine(isCalendarDate, "Enter a real expiry date."),
    storage_location: z
      .string()
      .trim()
      .min(1, "Enter where this batch is stored.")
      .max(120, "Keep the storage location within 120 characters."),
  })
  .refine(
    (values) => values.manufacturing_date <= values.expiry_date,
    {
      message: "The manufacturing date must fall on or before the expiry date.",
      path: ["manufacturing_date"],
    },
  );

type Values = z.infer<typeof schema>;

function BatchDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: BatchProduct;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      batch_number: "",
      quantity: "",
      manufacturing_date: "",
      expiry_date: "",
      storage_location: product.storage_location ?? "",
    },
  });

  // Refill the fields each time the sheet opens, so a second lot never
  // starts from the previous lot's number or dates.
  useEffect(() => {
    if (open) {
      reset({
        batch_number: "",
        quantity: "",
        manufacturing_date: "",
        expiry_date: "",
        storage_location: product.storage_location ?? "",
      });
    }
  }, [open, product.storage_location, reset]);

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await fetch(`/api/products/${product.product_id}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_number: values.batch_number,
          quantity: Number(values.quantity),
          manufacturing_date: values.manufacturing_date,
          expiry_date: values.expiry_date,
          storage_location: values.storage_location,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not save the batch.");
        return;
      }
      toast.success(`Added ${values.batch_number.trim()}.`);
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New batch</DialogTitle>
          <DialogDescription>
            Record a stock lot against {product.name}. The register grades this lot from its own
            expiry date the moment you save it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-number">Batch number</Label>
            <Input
              id="batch-number"
              placeholder="BB-2201"
              autoComplete="off"
              {...register("batch_number")}
              aria-invalid={errors.batch_number ? "true" : undefined}
            />
            {errors.batch_number && (
              <p className="text-xs text-level-expired">{errors.batch_number.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-quantity">Quantity</Label>
            <Input
              id="batch-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={2147483647}
              className="tabular-nums"
              placeholder="240"
              {...register("quantity")}
              aria-invalid={errors.quantity ? "true" : undefined}
            />
            {errors.quantity && (
              <p className="text-xs text-level-expired">{errors.quantity.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-manufactured">Manufacturing date</Label>
            <Input
              id="batch-manufactured"
              type="date"
              {...register("manufacturing_date")}
              aria-invalid={errors.manufacturing_date ? "true" : undefined}
            />
            {errors.manufacturing_date && (
              <p className="text-xs text-level-expired">{errors.manufacturing_date.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-expiry">
              Expiry date <span className="text-level-expired">*</span>
            </Label>
            <Input
              id="batch-expiry"
              type="date"
              {...register("expiry_date")}
              aria-invalid={errors.expiry_date ? "true" : undefined}
            />
            {errors.expiry_date ? (
              <p className="text-xs text-level-expired">{errors.expiry_date.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This date sets the lot&apos;s level: active beyond 30 days, warning at 30,
                critical at 7, expired after.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch-storage">Storage location</Label>
            <Input
              id="batch-storage"
              placeholder="Aisle 3 Shelf 1"
              autoComplete="off"
              {...register("storage_location")}
              aria-invalid={errors.storage_location ? "true" : undefined}
            />
            {errors.storage_location && (
              <p className="text-xs text-level-expired">{errors.storage_location.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Add batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Entry point on the product detail sheet: the dialog on its own behind a
 * New batch control, so the ledger page itself holds no form state.
 */
export function NewBatchButton({ product }: { product: BatchProduct }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New batch
      </Button>
      <BatchDialog open={open} onOpenChange={setOpen} product={product} />
    </>
  );
}
