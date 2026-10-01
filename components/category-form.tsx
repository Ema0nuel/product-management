"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";

// The category register's write controls: create, rename and remove, each
// in a square dialog on the ledger sheet. The server owns the rules, the
// unique name and the empty-category check; this file only collects a name
// and reports the refusal it gets back as a toast (PRODUCT.md principle 5).

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "A category name needs at least 2 characters.")
    .max(60, "A category name holds at most 60 characters."),
});

type Values = z.infer<typeof schema>;

export type CategoryRow = {
  category_id: number;
  name: string;
  productCount: number;
};

/** The one field both dialogs collect, and the create/rename call. */
function CategoryNameForm({
  category,
  onDone,
}: {
  category?: CategoryRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: category?.name ?? "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await fetch(
        category ? `/api/categories/${category.category_id}` : "/api/categories",
        {
          method: category ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not save the category.");
        return;
      }
      toast.success(
        category ? `Category renamed to ${data.category.name}.` : `Category ${data.category.name} added.`,
      );
      onDone();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          autoComplete="off"
          placeholder="Beverages"
          {...register("name")}
          aria-invalid={errors.name ? "true" : undefined}
        />
        {errors.name && (
          <p className="text-xs text-level-expired">{errors.name.message}</p>
        )}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : category ? "Save changes" : "Add category"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Section-head action: opens the create dialog. */
export function NewCategoryButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" strokeWidth={1.5} />
          New category
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            Every product is filed under one category. Add the category here, then
            record its products against it.
          </DialogDescription>
        </DialogHeader>
        <CategoryNameForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Row action: rename in place, or remove once the category is empty. */
export function CategoryRowActions({ category }: { category: CategoryRow }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const held = category.productCount;

  async function remove() {
    setPending(true);
    try {
      const res = await fetch(`/api/categories/${category.category_id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not delete the category.");
        return;
      }
      toast.success(`Category ${category.name} removed.`);
      setDeleteOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Rename ${category.name}`}>
            <Pencil className="size-4" strokeWidth={1.5} />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
            <DialogDescription>
              Products filed under {category.name} keep the link after the rename.
            </DialogDescription>
          </DialogHeader>
          <CategoryNameForm category={category} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`}>
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              {held > 0
                ? `${category.name} still holds ${held} product${held === 1 ? "" : "s"}. Remove or refile them before deleting.`
                : `Remove ${category.name} from the register. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Deleting..." : "Delete category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
