"use client";

import * as React from "react";
import { ChevronRight, Phone, UserRound } from "lucide-react";
import Image from "next/image";
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
import { ImageUploadPanel } from "./image-upload-panel";

export type TenantFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emergencyContactFirstName: string;
  emergencyContactLastName: string;
  emergencyContactPhone: string;
  accountStatus: "activated" | "invitation_pending" | "disabled";
  insuranceStatus: "active" | "expired" | "not_on_file";
};

export const initialTenantFormState: TenantFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  emergencyContactFirstName: "",
  emergencyContactLastName: "",
  emergencyContactPhone: "",
  accountStatus: "invitation_pending",
  insuranceStatus: "not_on_file",
};

type TenantDrawerStep = "tenant" | "emergency";

type TenantDrawerProps = {
  drawerTitle: string;
  error?: Error | null;
  form: TenantFormState;
  imageFile?: File | null;
  imageUrl?: string | null;
  isImageDeletePending?: boolean;
  isPending: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<TenantFormState>>;
  onImageChange: (file: File | null) => void;
  onImageDelete?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: TenantFormState, imageFile: File | null) => void;
  open: boolean;
  submitLabel: string;
};

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function TenantDrawer({
  drawerTitle,
  error,
  form,
  imageFile = null,
  imageUrl = null,
  isImageDeletePending = false,
  isPending,
  onFormChange,
  onImageChange,
  onImageDelete,
  onOpenChange,
  onSubmit,
  open,
  submitLabel,
}: TenantDrawerProps) {
  const [currentStep, setCurrentStep] = React.useState<TenantDrawerStep>("tenant");
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState(imageUrl);

  React.useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(imageUrl);
      return;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile, imageUrl]);

  React.useEffect(() => {
    if (!open) setCurrentStep("tenant");
  }, [open]);

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setCurrentStep("tenant");
      onImageChange(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose />
          <DrawerTitle>{drawerTitle}</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (currentStep === "tenant") {
              setCurrentStep("emergency");
              return;
            }
            onSubmit(form, imageFile);
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 py-5 md:px-6">
              <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem] md:items-center dark:bg-parcelis-slate">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                  {imagePreviewUrl ? (
                    <Image
                      alt="Selected tenant"
                      className="h-full w-full rounded-md object-cover"
                      src={imagePreviewUrl}
                      height={48}
                      unoptimized
                      width={48}
                    />
                  ) : (
                    <UserRound className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">
                    {form.firstName || form.lastName ? `${form.firstName} ${form.lastName}`.trim() : "Tenant Name"}
                  </p>
                  <div className="mt-1 space-y-0.5 text-sm font-medium text-white/70">
                    <p className="truncate">{form.email || "Email Address"}</p>
                    <p className="truncate">{form.phone || "Phone Number"}</p>
                  </div>
                </div>
                <div className="border-white/15 md:border-l md:pl-8">
                  <p className="text-xs font-semibold uppercase text-white/55">Account</p>
                  <p className="mt-1 text-base font-semibold text-white">{formatStatus(form.accountStatus)}</p>
                </div>
                <div className="border-white/15 md:border-l md:pl-8">
                  <p className="text-xs font-semibold uppercase text-white/55">Insurance</p>
                  <p className="mt-1 text-base font-semibold text-white">{formatStatus(form.insuranceStatus)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-10 px-4 py-6 md:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="grid gap-6 lg:sticky lg:top-6 lg:self-start">
                <aside className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate">
                  {[
                    { icon: UserRound, label: "Tenant Details", step: "tenant" },
                    { icon: Phone, label: "Emergency Contact", step: "emergency" },
                  ].map(({ icon: Icon, label, step }) => {
                    const isActive = currentStep === step;

                    return (
                      <button
                        className={`flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-parcelis-porcelain/70 hover:text-parcelis-charcoal ${
                          step === "emergency" ? "border-t border-parcelis-border" : ""
                        } ${
                          isActive
                            ? "bg-parcelis-porcelain/70 text-parcelis-charcoal dark:bg-parcelis-charcoal/55"
                            : "text-parcelis-gray"
                        }`}
                        key={step}
                        onClick={() => setCurrentStep(step as TenantDrawerStep)}
                        type="button"
                      >
                        <Icon className={`h-5 w-5 ${isActive ? "text-parcelis-green" : "text-parcelis-gray"}`} />
                        <span className="text-sm font-semibold">{label}</span>
                      </button>
                    );
                  })}
                </aside>
                <ImageUploadPanel
                  acceptedImageDescription="JPG, PNG, WebP, or GIF"
                  alt="Selected tenant"
                  imagePreviewUrl={imagePreviewUrl}
                  isDeletePending={isImageDeletePending}
                  onDelete={() => {
                    if (imageFile) onImageChange(null);
                    else onImageDelete?.();
                  }}
                  onImageChange={onImageChange}
                  title="Tenant Image"
                />
              </div>

              <section>
                <h3 className="text-xl font-bold text-parcelis-charcoal">
                  {currentStep === "tenant" ? "Tenant Details" : "Emergency Contact"}
                </h3>
                {currentStep === "tenant" ? (
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Label>
                      First Name
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, firstName: event.target.value })}
                        required
                        value={form.firstName}
                      />
                    </Label>
                    <Label>
                      Last Name
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, lastName: event.target.value })}
                        required
                        value={form.lastName}
                      />
                    </Label>
                    <Label className="sm:col-span-2">
                      Email
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, email: event.target.value })}
                        required
                        type="email"
                        value={form.email}
                      />
                    </Label>
                    <Label className="sm:col-span-2">
                      Phone
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, phone: event.target.value })}
                        type="tel"
                        value={form.phone}
                      />
                    </Label>
                    <Label>
                      Account Status
                      <Select
                        className="mt-1"
                        onChange={(event) =>
                          onFormChange({
                            ...form,
                            accountStatus: event.target.value as TenantFormState["accountStatus"],
                          })
                        }
                        value={form.accountStatus}
                      >
                        <option value="activated">Activated</option>
                        <option value="invitation_pending">Invitation Pending</option>
                        <option value="disabled">Disabled</option>
                      </Select>
                    </Label>
                    <Label>
                      Insurance Status
                      <Select
                        className="mt-1"
                        onChange={(event) =>
                          onFormChange({
                            ...form,
                            insuranceStatus: event.target.value as TenantFormState["insuranceStatus"],
                          })
                        }
                        value={form.insuranceStatus}
                      >
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                        <option value="not_on_file">Not on File</option>
                      </Select>
                    </Label>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Label>
                      First Name
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, emergencyContactFirstName: event.target.value })}
                        value={form.emergencyContactFirstName}
                      />
                    </Label>
                    <Label>
                      Last Name
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, emergencyContactLastName: event.target.value })}
                        value={form.emergencyContactLastName}
                      />
                    </Label>
                    <Label className="sm:col-span-2">
                      Phone
                      <Input
                        className="mt-1"
                        onChange={(event) => onFormChange({ ...form, emergencyContactPhone: event.target.value })}
                        type="tel"
                        value={form.emergencyContactPhone}
                      />
                    </Label>
                  </div>
                )}
                {error ? <p className="mt-4 text-sm font-medium text-red-700">{error.message}</p> : null}
              </section>
            </div>
          </div>
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button className="min-w-40" onClick={() => setOpen(false)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button className="min-w-40" disabled={isPending} type="submit">
              {currentStep === "tenant" ? "Next" : submitLabel}
              {currentStep === "tenant" ? <ChevronRight className="h-4 w-4" /> : null}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
