"use client";

import { Pencil } from "lucide-react";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  Label,
  Select,
} from "@parcelis/ui";
import type { UserRole } from "@parcelis/schemas";

export type EditUserFormState = {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
};

function formatRole(role: UserRole) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function EditUserDrawer({
  availableRoles,
  error,
  form,
  isPending,
  onFormChange,
  onOpenChange,
  onSubmit,
  open,
}: {
  availableRoles: readonly UserRole[];
  error?: Error | null;
  form: EditUserFormState;
  isPending: boolean;
  onFormChange: (form: EditUserFormState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
}) {
  return (
    <Drawer
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isPending) {
          return;
        }

        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DrawerContent size="sm">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={isPending} />
          <DrawerTitle>Edit user</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="flex items-center gap-3 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white dark:bg-parcelis-slate">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-white/10 text-parcelis-green">
                <Pencil className="h-5 w-5" />
              </div>
              <p className="text-sm text-white/75">Update account details and role.</p>
            </div>
            <div className="mt-5 grid gap-4">
              <Label>
                Name
                <Input
                  className="mt-1"
                  onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                  required
                  value={form.name}
                />
              </Label>
              <Label>
                Email
                <Input
                  className="mt-1"
                  onChange={(event) => onFormChange({ ...form, email: event.target.value })}
                  required
                  type="email"
                  value={form.email}
                />
              </Label>
              <Label>
                Phone
                <Input
                  className="mt-1"
                  onChange={(event) => onFormChange({ ...form, phone: event.target.value })}
                  type="tel"
                  value={form.phone}
                />
              </Label>
              <Label>
                Role
                <Select
                  className="mt-1"
                  onChange={(event) => onFormChange({ ...form, role: event.target.value as UserRole })}
                  value={form.role}
                >
                  {availableRoles.map((role) => (
                    <option key={role} value={role}>
                      {formatRole(role)}
                    </option>
                  ))}
                </Select>
              </Label>
            </div>
            {error ? <p className="mt-4 text-sm font-medium text-red-700">{error.message}</p> : null}
          </div>
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button disabled={isPending} onClick={() => onOpenChange(false)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              Save changes
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
