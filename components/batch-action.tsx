"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DISPOSITIONS, dispositionLabel } from "@/lib/actions";

// The action-tracking cell, sitting beside the batch list (thesis 3.8).
// The cell carries what the sheet must always show: the current
// disposition, which derives from the most recent action, and the account
// and time behind it. A batch with no action reads PENDING (thesis 3.6.8).
//
// The record form opens from the cell for the roles that hold
// record_action; the server enforces the same boundary, so the manager's
// read-only sheet loses nothing but the button, never the data.

export type ActionRecord = {
  action_id: number;
  disposition: string;
  remark: string | null;
  /** Pre-formatted on the server so the sheet renders one clock. */
  created_at: string;
  username: string;
};

const schema = z.object({
  disposition: z.enum(DISPOSITIONS, { required_error: "Choose a disposition." }),
  remark: z.string().trim().max(500, "Keep the remark to 500 characters."),
});

type Values = z.infer<typeof schema>;

export function BatchAction({
  batch,
  latest,
  history,
  canRecord,
}: {
  batch: { batch_id: number; batch_number: string; product_name: string };
  latest: ActionRecord | null;
  history: ActionRecord[];
  canRecord: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { remark: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await fetch(`/api/batches/${batch.batch_id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposition: values.disposition,
          remark: values.remark || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not record the disposition.");
        return;
      }
      toast.success(
        `${dispositionLabel(values.disposition)} recorded on batch ${batch.batch_number}.`,
      );
      reset({ remark: "" });
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function openSheet() {
    reset({ remark: "" });
    setOpen(true);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={latest ? "bg-foreground text-background" : "text-muted-foreground"}
        >
          {latest ? dispositionLabel(latest.disposition) : "Pending"}
        </Badge>
        {canRecord && (
          <Button type="button" variant="outline" size="xs" onClick={openSheet}>
            <Pencil className="size-3" />
            Record
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {latest ? `${latest.username} · ${latest.created_at}` : "No action yet"}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch {batch.batch_number}</DialogTitle>
            <DialogDescription>
              {batch.product_name}. Every disposition here is stored with the account that
              recorded it and the time of recording.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Records
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No disposition recorded yet. This batch is pending.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((action) => (
                  <li key={action.action_id} className="border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{dispositionLabel(action.disposition)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {action.username} · {action.created_at}
                      </span>
                    </div>
                    {action.remark && (
                      <p className="mt-1 text-sm text-foreground">{action.remark}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4 border-t border-border pt-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action-disposition">Disposition</Label>
              <Controller
                control={control}
                name="disposition"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="action-disposition" className="w-full">
                      <SelectValue placeholder="Choose a disposition" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPOSITIONS.map((disposition) => (
                        <SelectItem key={disposition} value={disposition}>
                          {dispositionLabel(disposition)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.disposition && (
                <p className="text-xs text-level-expired">{errors.disposition.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action-remark">Remark, optional</Label>
              <Textarea
                id="action-remark"
                rows={2}
                placeholder="What happened to this batch"
                {...register("remark")}
              />
              {errors.remark && (
                <p className="text-xs text-level-expired">{errors.remark.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Recording..." : "Record disposition"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
