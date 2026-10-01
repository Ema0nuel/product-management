"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { LayoutGrid, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  username: z.string().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

const demoAccounts = ["admin", "manager", "officer"];

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Sign in failed. Try again.");
        return;
      }
      toast.success(`Signed in as ${data.user.username}.`);
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <span className="flex size-9 items-center justify-center border border-border bg-background">
            <LayoutGrid className="size-4 text-foreground" strokeWidth={1.5} />
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Goods-Inward Ledger
            </h1>
            <p className="text-xs text-muted-foreground">Expiry alert management</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-6 py-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              placeholder="admin"
              {...register("username")}
              aria-invalid={errors.username ? "true" : undefined}
            />
            {errors.username && (
              <p className="text-xs text-level-expired">{errors.username.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="password123"
              {...register("password")}
              aria-invalid={errors.password ? "true" : undefined}
            />
            {errors.password && (
              <p className="text-xs text-level-expired">{errors.password.message}</p>
            )}
          </div>
          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "Signing in..." : "Sign in"}
            <LogIn className="size-4" />
          </Button>
        </form>

        <div className="border-t border-border px-6 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Demo accounts
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {demoAccounts.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setValue("username", u);
                  setValue("password", "password123");
                }}
                className="border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {u}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Password is password123 for every account.
          </p>
        </div>
      </div>
    </div>
  );
}