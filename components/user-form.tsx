"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_ORDER, roleLabel } from "@/lib/rbac";

// User account management, the second half of the administrator's sheet
// (guide 10, Table 3.2). Accounts are created with a bcrypt hash at the
// same cost the seed uses, and the password is never read back.
//
// An administrator cannot remove their own account: locking the only
// administrator out of the system is a real failure mode, and the server
// refuses it as well, since hiding the button is not enforcement.

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "A username needs at least 3 characters.")
    .max(40, "A username holds at most 40 characters.")
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore only."),
  password: z.string().min(8, "Set a password of at least 8 characters."),
  role: z.enum(["system_admin", "inventory_officer", "manager"], {
    message: "Choose a role.",
  }),
});

type Values = z.infer<typeof schema>;

export type AccountRow = {
  user_id: number;
  username: string;
  role: "system_admin" | "inventory_officer" | "manager";
};

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", role: "inventory_officer" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not create the account.");
        return;
      }
      toast.success(`Account ${values.username} created.`);
      onDone();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-username">Username</Label>
        <Input
          id="new-username"
          autoComplete="off"
          placeholder="storekeeper"
          {...register("username")}
          aria-invalid={errors.username ? "true" : undefined}
        />
        {errors.username && (
          <p className="text-xs text-level-expired">{errors.username.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          {...register("password")}
          aria-invalid={errors.password ? "true" : undefined}
        />
        {errors.password && (
          <p className="text-xs text-level-expired">{errors.password.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-role">Role</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="new-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ORDER.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.role ? (
          <p className="text-xs text-level-expired">{errors.role.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            An inventory officer does the daily work. A manager reads the ledger only.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create account"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Section action: opens the create dialog. */
export function NewAccountButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" strokeWidth={1.5} />
          New account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            The password is hashed before it reaches the database and is never
            shown again. Give the person the password out of band.
          </DialogDescription>
        </DialogHeader>
        <NewAccountForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Row action: remove an account, never the signed-in administrator's own. */
export function UserRowActions({ account, isSelf }: { account: AccountRow; isSelf: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (isSelf) {
    return (
      <span className="px-2 text-xs text-muted-foreground">Signed in</span>
    );
  }

  async function remove() {
    setPending(true);
    try {
      const res = await fetch(`/api/users/${account.user_id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? "Could not remove the account.");
        return;
      }
      toast.success(`Account ${account.username} removed.`);
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${account.username}`}
        >
          <Trash2 className="size-4" strokeWidth={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove account</DialogTitle>
          <DialogDescription>
            {account.username} loses access immediately. Action records already
            filed against this account keep their attribution.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "Removing..." : "Remove account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
