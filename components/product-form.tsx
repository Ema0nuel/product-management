"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The product form sheet and the row actions, one client boundary for
// create, edit and remove. The server page renders ruled rows and holds no
// dialog state; this module owns the writes and refreshes it on success.
//
// Every field the register reads is on this sheet: the category it is filed
// under, the dates that drive the comparison system, and free text for what
// the product actually is. Prices and money are absent by design, because
// the register tracks products rather than their worth.
//
// A product cannot exist without a category, so with none on file the form
// refuses and points the officer at the Categories tab.

export type CategoryOption = { category_id: number; name: string };

export type ProductSummary = {
  product_id: number;
  name: string;
  category_id: number;
  description: string | null;
  expiry_date: string | null; // yyyy-MM-dd
  manufacturing_date: string | null; // yyyy-MM-dd
  storage_location: string | null;
  status: "IN_STOCK" | "ON_SALE" | "DISPOSED";
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
    name: z.string().trim().min(2, "Enter a product name of at least 2 characters."),
    category_id: z.string().min(1, "Choose a category."),
    description: z
      .string()
      .max(2000, "Keep the description within 2000 characters.")
      .optional(),
    expiry_date: z
      .string()
      .min(1, "Enter the date this product expires.")
      .refine(isCalendarDate, "Enter a real expiry date."),
    manufacturing_date: z
      .string()
      .optional()
      .refine(
        (value) => !value || isCalendarDate(value),
        "Enter a real manufacturing date.",
      ),
    storage_location: z
      .string()
      .max(120, "Keep the storage location within 120 characters.")
      .optional(),
  })
  .refine(
    (values) =>
      !values.manufacturing_date ||
      !values.expiry_date ||
      values.manufacturing_date <= values.expiry_date,
    {
      message: "The manufacturing date must fall on or before the expiry date.",
      path: ["manufacturing_date"],
    },
  );

type Values = z.infer<typeof schema>;

/** POST or PATCH a product, returning the server's plain-sentence refusal. */
async function send(
  url: string,
  method: "POST" | "PATCH",
  values: Values,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: values.name,
      category_id: Number(values.category_id),
      description: values.description ?? "",
      expiry_date: values.expiry_date,
      manufacturing_date: values.manufacturing_date ?? "",
      storage_location: values.storage_location ?? "",
    }),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok && Boolean(data?.ok), error: data?.error as string | undefined };
}

function ProductDialog({
  mode,
  open,
  onOpenChange,
  categories,
  product,
}: {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  product?: ProductSummary;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? "",
      category_id: product ? String(product.category_id) : "",
      description: product?.description ?? "",
      expiry_date: product?.expiry_date ?? "",
      manufacturing_date: product?.manufacturing_date ?? "",
      storage_location: product?.storage_location ?? "",
    },
  });

  // Refill the fields each time the sheet opens, so an edited row never
  // shows the previous row's dates or description.
  useEffect(() => {
    if (open) {
      reset({
        name: product?.name ?? "",
        category_id: product ? String(product.category_id) : "",
        description: product?.description ?? "",
        expiry_date: product?.expiry_date ?? "",
        manufacturing_date: product?.manufacturing_date ?? "",
        storage_location: product?.storage_location ?? "",
      });
    }
  }, [open, product, reset]);

  const selected = watch("category_id");

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const url =
        mode === "create" ? "/api/products" : `/api/products/${product!.product_id}`;
      const result = await send(url, mode === "create" ? "POST" : "PATCH", values);
      if (!result.ok) {
        toast.error(result.error ?? "Could not save the product.");
        return;
      }
      toast.success(
        mode === "create" ? `Added ${values.name.trim()}.` : `Updated ${values.name.trim()}.`,
      );
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
          <DialogTitle>{mode === "create" ? "New product" : "Edit product"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "File a product under a category with its expiry date. The register uses that date to warn you as it comes close."
              : "Change what is on file. The expiry date drives the warning, so keep it current."}
          </DialogDescription>
        </DialogHeader>

        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No categories on file. Add a category on the Categories tab first. A product cannot
            exist without one.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`product-name-${mode}`}>Product name</Label>
              <Input
                id={`product-name-${mode}`}
                placeholder="Paracetamol 500mg"
                autoComplete="off"
                {...register("name")}
                aria-invalid={errors.name ? "true" : undefined}
              />
              {errors.name && (
                <p className="text-xs text-level-expired">{errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`product-category-${mode}`}>Category</Label>
              <Select
                value={selected}
                onValueChange={(value) => setValue("category_id", value, { shouldValidate: true })}
              >
                <SelectTrigger id={`product-category-${mode}`} className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.category_id} value={String(c.category_id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category_id && (
                <p className="text-xs text-level-expired">{errors.category_id.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`product-expiry-${mode}`}>
                Expiry date <span className="text-level-expired">*</span>
              </Label>
              <Input
                id={`product-expiry-${mode}`}
                type="date"
                {...register("expiry_date")}
                aria-invalid={errors.expiry_date ? "true" : undefined}
              />
              {errors.expiry_date ? (
                <p className="text-xs text-level-expired">{errors.expiry_date.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The register warns you at 2 months, 1 month and 2 weeks from this date.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`product-manufactured-${mode}`}>Manufacturing date</Label>
              <Input
                id={`product-manufactured-${mode}`}
                type="date"
                {...register("manufacturing_date")}
                aria-invalid={errors.manufacturing_date ? "true" : undefined}
              />
              {errors.manufacturing_date && (
                <p className="text-xs text-level-expired">{errors.manufacturing_date.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`product-storage-${mode}`}>Storage location</Label>
              <Input
                id={`product-storage-${mode}`}
                placeholder="Aisle 3 Shelf 1"
                autoComplete="off"
                {...register("storage_location")}
                aria-invalid={errors.storage_location ? "true" : undefined}
              />
              {errors.storage_location && (
                <p className="text-xs text-level-expired">{errors.storage_location.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`product-description-${mode}`}>Details</Label>
              <Textarea
                id={`product-description-${mode}`}
                rows={3}
                placeholder="Ready-to-eat beans in tomato sauce, 415g tins."
                {...register("description")}
                aria-invalid={errors.description ? "true" : undefined}
              />
              {errors.description && (
                <p className="text-xs text-level-expired">{errors.description.message}</p>
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
                {pending
                  ? "Saving..."
                  : mode === "create"
                    ? "Add product"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product: ProductSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setPending(true);
    try {
      const res = await fetch(`/api/products/${product.product_id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not remove the product.");
        return;
      }
      toast.success(`Removed ${product.name}.`);
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
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={pending}>
            {pending ? "Removing..." : "Remove product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewProductButton({ categories }: { categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);

  if (categories.length === 0) {
    return (
      <div className="flex flex-col gap-1 sm:items-end">
        <Button type="button" disabled>
          <Plus className="size-4" />
          New product
        </Button>
        <p className="text-xs text-muted-foreground">
          No categories on file. Add one on the Categories tab first.
        </p>
      </div>
    );
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New product
      </Button>
      <ProductDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
        categories={categories}
      />
    </>
  );
}

export function ProductRowActions({
  product,
  categories,
}: {
  product: ProductSummary;
  categories: CategoryOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${product.name}`}
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${product.name}`}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>

      <ProductDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categories}
        product={product}
      />
      <DeleteProductDialog
        product={product}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}

/**
 * Edit control for the product detail sheet: the dialog on its own, with no
 * remove button beside it. Removal stays a deliberate act on the register
 * row, so a detail page is never one stray click from losing a record.
 */
export function ProductEditButton({
  product,
  categories,
  label = "Edit",
}: {
  product: ProductSummary;
  categories: CategoryOption[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        {label}
      </Button>
      <ProductDialog
        mode="edit"
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        product={product}
      />
    </>
  );
}
