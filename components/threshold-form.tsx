"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The threshold sheet: the two day boundaries that decide WARNING and
// CRITICAL (Table 3.1, defaults 30 and 7). Days remaining is recomputed on
// every read, so a change here recasts the whole ledger at the next
// refresh rather than rewriting stored rows.
//
// Values are held as text and parsed on submit, matching the product form:
// a number input hands back a string, and validating the pair as numbers is
// clearer than coercing through the resolver.

const schema = z
  .object({
    warning_max: z.string().trim().min(1, "Enter the warning boundary."),
    critical_max: z.string().trim().min(1, "Enter the critical boundary."),
  })
  .superRefine((values, ctx) => {
    const warning = Number(values.warning_max);
    const critical = Number(values.critical_max);

    if (!Number.isInteger(warning) || warning < 1 || warning > 365) {
      ctx.addIssue({
        code: "custom",
        path: ["warning_max"],
        message: "Give a whole number of days between 1 and 365.",
      });
    }
    if (!Number.isInteger(critical) || critical < 0 || critical > 364) {
      ctx.addIssue({
        code: "custom",
        path: ["critical_max"],
        message: "Give a whole number of days between 0 and 364.",
      });
    }
    if (Number.isInteger(warning) && Number.isInteger(critical) && critical >= warning) {
      ctx.addIssue({
        code: "custom",
        path: ["critical_max"],
        message: "The critical boundary must fall closer than the warning boundary.",
      });
    }
  });

type Values = z.infer<typeof schema>;

const LEVEL_STAMPS = [
  { key: "EXPIRED", label: "Expired", className: "bg-level-expired text-background" },
  { key: "CRITICAL", label: "Critical", className: "bg-level-critical text-background" },
  { key: "WARNING", label: "Warning", className: "bg-level-warning text-foreground" },
  { key: "ACTIVE", label: "Active", className: "bg-level-active text-background" },
] as const;

export function ThresholdForm({
  warningMax,
  criticalMax,
}: {
  warningMax: number;
  criticalMax: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      warning_max: String(warningMax),
      critical_max: String(criticalMax),
    },
  });

  const warning = Number(watch("warning_max"));
  const critical = Number(watch("critical_max"));
  const pairIsSound =
    Number.isInteger(warning) &&
    Number.isInteger(critical) &&
    critical >= 0 &&
    critical < warning;

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warning_max: Number(values.warning_max),
          critical_max: Number(values.critical_max),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not save the thresholds.");
        return;
      }
      toast.success("Thresholds updated. The ledger recasts on the next refresh.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-4 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warning_max">Warning boundary, days</Label>
          <Input
            id="warning_max"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            className="tabular-nums"
            {...register("warning_max")}
            aria-invalid={errors.warning_max ? "true" : undefined}
          />
          {errors.warning_max ? (
            <p className="text-xs text-level-expired">{errors.warning_max.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Batches expiring within this many days are marked WARNING.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="critical_max">Critical boundary, days</Label>
          <Input
            id="critical_max"
            type="number"
            inputMode="numeric"
            min={0}
            max={364}
            className="tabular-nums"
            {...register("critical_max")}
            aria-invalid={errors.critical_max ? "true" : undefined}
          />
          {errors.critical_max ? (
            <p className="text-xs text-level-expired">{errors.critical_max.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Batches expiring within this many days are marked CRITICAL.
            </p>
          )}
        </div>
      </div>

      <div className="border border-border bg-background px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          What this pair produces
        </p>
        <p className="mt-2 text-sm text-foreground">
          {pairIsSound ? (
            <>
              Anything past its date is EXPIRED. Batches expiring within{" "}
              <span className="tabular-nums">{critical}</span>{" "}
              {critical === 1 ? "day" : "days"} are CRITICAL. Within{" "}
              <span className="tabular-nums">{warning}</span>{" "}
              {warning === 1 ? "day" : "days"} are WARNING. Beyond that, ACTIVE.
            </>
          ) : (
            "Enter two whole numbers, the critical boundary closer than the warning one, to see the classification this pair produces."
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LEVEL_STAMPS.map((stamp) => (
            <Badge key={stamp.key} className={stamp.className}>
              {stamp.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save thresholds"}
        </Button>
      </div>
    </form>
  );
}
