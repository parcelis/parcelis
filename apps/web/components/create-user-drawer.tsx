"use client";

import { UserPlus } from "lucide-react";
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
import { userRoleValues, type UserRole } from "@parcelis/schemas";

// Types and initial state for the create user form
export type CreateUserFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
};

// Initial state for the create user form
export const initialCreateUserFormState: CreateUserFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "property_manager",
};

// Formats a user role for display
function formatRole(role: UserRole) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// CreateUserDrawer component for creating a new user
export function CreateUserDrawer({
  error,
  form,
  isPending,
  onFormChange,
  onOpenChange,
  onSubmit,
  open,
  canCreateAdministrators,
}: {
  canCreateAdministrators: boolean;
  error?: Error | null;
  form: CreateUserFormState;
  isPending: boolean;
  onFormChange: (form: CreateUserFormState) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: CreateUserFormState) => void;
  open: boolean;
}) {
  const availableRoles = canCreateAdministrators
    ? userRoleValues
    : userRoleValues.filter((role) => role !== "administrator");

  
  return (
    // Drawer for creating a new user
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="sm">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={isPending} />
          <DrawerTitle>New user</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(form);
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="flex items-center gap-3 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white dark:bg-parcelis-slate">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-white/10 text-parcelis-green">
                <UserPlus className="h-5 w-5" />
              </div>
              <p className="text-sm text-white/75">Create an account and give the user access to this organization.</p>
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
                Temporary password
                <Input
                  className="mt-1"
                  minLength={12}
                  onChange={(event) => onFormChange({ ...form, password: event.target.value })}
                  required
                  type="password"
                  value={form.password}
                />
                <span className="mt-1 block text-xs font-normal text-parcelis-gray">Use at least 12 characters.</span>
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
              Create user
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
