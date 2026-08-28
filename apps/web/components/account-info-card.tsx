"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Mail } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  Input,
  Label,
  PasswordInput,
} from "@parcelis/ui";
import { apiClient } from "./api-client";

type AccountInfoCardProps = {
  email: string;
  onEmailChanged: () => Promise<void>;
};

const emptyPasswordForm = { currentPassword: "", newPassword: "", reenterPassword: "" };

export function AccountInfoCard({ email, onEmailChanged }: AccountInfoCardProps) {
  const emailDialogTitleId = React.useId();
  const passwordDialogTitleId = React.useId();
  const passwordMismatchId = React.useId();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = React.useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = React.useState("");
  const [passwordForm, setPasswordForm] = React.useState(emptyPasswordForm);
  const changeEmailMutation = useMutation({
    mutationFn: () => apiClient.auth.changeEmail.mutate({ currentPassword: emailCurrentPassword, email: newEmail }),
    onSuccess: async () => {
      await onEmailChanged();
      setIsEmailDialogOpen(false);
      setNewEmail("");
      setEmailCurrentPassword("");
    },
  });
  const changePasswordMutation = useMutation({
    mutationFn: () => apiClient.auth.changePassword.mutate(passwordForm),
    onSuccess: () => {
      setIsPasswordDialogOpen(false);
      setPasswordForm(emptyPasswordForm);
    },
  });
  const passwordsMatch = passwordForm.newPassword === passwordForm.reenterPassword;

  function closeEmailDialog() {
    if (changeEmailMutation.isPending) return;
    setIsEmailDialogOpen(false);
    setNewEmail("");
    setEmailCurrentPassword("");
    changeEmailMutation.reset();
  }

  function closePasswordDialog() {
    if (changePasswordMutation.isPending) return;
    setIsPasswordDialogOpen(false);
    setPasswordForm(emptyPasswordForm);
    changePasswordMutation.reset();
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-parcelis-charcoal">Account info</h2>
              <p className="mt-1 text-sm text-parcelis-gray">Update your sign-in email or password.</p>
            </div>
            <KeyRound className="h-5 w-5 text-parcelis-green" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 md:flex-row">
          <div className="min-w-0 flex-1 space-y-2">
            <Label>Email</Label>
            <div className="flex">
              <Input className="min-w-0 rounded-r-none" readOnly value={email} />
              <Button
                className="min-w-40 shrink-0 rounded-l-none border-l-0"
                onClick={() => setIsEmailDialogOpen(true)}
                type="button"
                variant="secondary"
              >
                <Mail className="mr-2 h-4 w-4" />
                Change
              </Button>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Label>Password</Label>
            <div className="flex">
              <Input className="min-w-0 rounded-r-none" readOnly value="••••••••••••" />
              <Button
                className="min-w-40 shrink-0 rounded-l-none border-l-0"
                onClick={() => setIsPasswordDialogOpen(true)}
                type="button"
                variant="secondary"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Change
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        onOpenChange={(open) => (open ? setIsEmailDialogOpen(true) : closeEmailDialog())}
        open={isEmailDialogOpen}
      >
        <DialogContent aria-labelledby={emailDialogTitleId}>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              changeEmailMutation.mutate();
            }}
          >
            <div className="mb-4">
              <h2 className="text-lg font-bold text-parcelis-charcoal" id={emailDialogTitleId}>
                CHANGE EMAIL ADDRESS
              </h2>
              <p className="mt-4 text-sm text-parcelis-gray">
                Please enter your new email address and confirm your Parcelis login password to proceed.
              </p>
            </div>
            <Label>
              New email address
              <Input
                autoComplete="email"
                className="mt-1"
                onChange={(event) => setNewEmail(event.target.value)}
                required
                type="email"
                value={newEmail}
              />
            </Label>
            <Label>
              Current password
              <PasswordInput
                autoComplete="current-password"
                className="mt-1"
                onChange={(event) => setEmailCurrentPassword(event.target.value)}
                required
                value={emailCurrentPassword}
              />
            </Label>
            {changeEmailMutation.error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {changeEmailMutation.error.message}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                disabled={changeEmailMutation.isPending}
                onClick={closeEmailDialog}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button disabled={changeEmailMutation.isPending} type="submit">
                {changeEmailMutation.isPending ? "Updating…" : "Update email"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => (open ? setIsPasswordDialogOpen(true) : closePasswordDialog())}
        open={isPasswordDialogOpen}
      >
        <DialogContent aria-labelledby={passwordDialogTitleId}>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (passwordsMatch) changePasswordMutation.mutate();
            }}
          >
            <div>
              <h2 className="text-lg font-bold text-parcelis-charcoal" id={passwordDialogTitleId}>
                Change password
              </h2>
              <p className="mt-1 text-sm text-parcelis-gray">Use at least 12 characters for your new password.</p>
            </div>
            <Label>
              Current password
              <PasswordInput
                autoComplete="current-password"
                className="mt-1"
                onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                required
                value={passwordForm.currentPassword}
              />
            </Label>
            <Label>
              New password
              <PasswordInput
                autoComplete="new-password"
                className="mt-1"
                minLength={12}
                onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                required
                value={passwordForm.newPassword}
              />
            </Label>
            <Label>
              Re-enter new password
              <PasswordInput
                aria-describedby={!passwordsMatch && passwordForm.reenterPassword ? passwordMismatchId : undefined}
                autoComplete="new-password"
                className="mt-1"
                minLength={12}
                onChange={(event) => setPasswordForm({ ...passwordForm, reenterPassword: event.target.value })}
                required
                value={passwordForm.reenterPassword}
              />
            </Label>
            {!passwordsMatch && passwordForm.reenterPassword ? (
              <p className="text-sm font-medium text-red-700" id={passwordMismatchId} role="alert">
                New passwords do not match.
              </p>
            ) : null}
            {changePasswordMutation.error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {changePasswordMutation.error.message}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                disabled={changePasswordMutation.isPending}
                onClick={closePasswordDialog}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button disabled={changePasswordMutation.isPending || !passwordsMatch} type="submit">
                {changePasswordMutation.isPending ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
