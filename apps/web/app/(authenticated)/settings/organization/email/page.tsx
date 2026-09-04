"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, Checkbox, Input, Label, ParcelisLogo, Select } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../../components/api-client";
import { LoadingState } from "../../../../../components/loading-state";
import { SettingsRail } from "../../../../../components/settings-rail";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;
const smtpSecurityTypes = ["none", "starttls", "tls"] as const;
type SmtpSecurityType = (typeof smtpSecurityTypes)[number];

function isSmtpSecurityType(value: string): value is SmtpSecurityType {
  return smtpSecurityTypes.includes(value as SmtpSecurityType);
}

export default function OrganizationEmailSettingsPage() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const activeOrganizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });
  const canManageOrganization = ["owner", "administrator"].includes(activeOrganizationQuery.data?.role ?? "");
  const emailSettingsQuery = useQuery({
    queryKey: queryKeys.organizations.emailSettings,
    queryFn: () => apiClient.organizations.emailSettings.query(),
    enabled: canManageOrganization,
  });
  const emailSettingsEncryptionStatusQuery = useQuery({
    queryKey: queryKeys.organizations.emailSettingsEncryptionStatus,
    queryFn: () => apiClient.organizations.emailSettingsEncryptionStatus.query(),
    enabled: canManageOrganization,
  });
  const [host, setHost] = React.useState("");
  const [securityType, setSecurityType] = React.useState<SmtpSecurityType>("starttls");
  const [port, setPort] = React.useState("587");
  const [fromName, setFromName] = React.useState("");
  const [fromEmail, setFromEmail] = React.useState("");
  const [requireSignIn, setRequireSignIn] = React.useState(true);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    const settings = emailSettingsQuery.data;
    if (!settings) return;
    setHost(settings.host);
    setSecurityType(isSmtpSecurityType(settings.securityType) ? settings.securityType : "starttls");
    setPort(String(settings.port));
    setFromName(settings.fromName ?? "");
    setFromEmail(settings.fromEmail);
    setRequireSignIn(settings.requireSignIn);
    setUsername(settings.username ?? "");
  }, [emailSettingsQuery.data]);

  const saveEmailSettings = useMutation({
    mutationFn: () =>
      apiClient.organizations.saveEmailSettings.mutate({
        host: host.trim(),
        securityType,
        port: Number(port),
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim(),
        requireSignIn,
        username: requireSignIn ? username.trim() : undefined,
        password: requireSignIn && password ? password : undefined,
      }),
    onSuccess: async () => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.emailSettings });
    },
  });
  const sendTestEmail = useMutation({
    mutationFn: () => apiClient.organizations.sendTestEmail.mutate(),
    onError: (error) => toast.error(error.message),
    onSuccess: ({ recipient }) => toast.success(`Test email sent to ${recipient}.`),
  });
  const hasSavedPassword = emailSettingsQuery.data?.hasPassword ?? false;

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail active="email" />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Settings</p>
                <h1 className="mt-5 text-3xl font-bold md:text-5xl">Email</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                  Configure the SMTP server used to send email for this organization.
                </p>
              </section>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">SMTP configuration</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">
                        Leave this unconfigured to use the deployment’s email settings.
                      </p>
                      {emailSettingsEncryptionStatusQuery.data ? (
                        <p
                          aria-live="polite"
                          className={`mt-3 text-sm font-medium ${
                            emailSettingsEncryptionStatusQuery.data.configured ? "text-parcelis-green" : "text-red-700"
                          }`}
                        >
                          {emailSettingsEncryptionStatusQuery.data.configured
                            ? "SMTP credential encryption is configured."
                            : "SMTP credential encryption is not configured. Set EMAIL_SETTINGS_ENCRYPTION_KEY in your .env file."}
                        </p>
                      ) : null}
                    </div>
                    <Mail className="h-5 w-5 text-parcelis-green" />
                  </div>
                </CardHeader>
                <CardContent>
                  {!canManageOrganization && !activeOrganizationQuery.isLoading ? (
                    <p className="text-sm text-parcelis-gray">You have view-only access to this organization’s settings.</p>
                  ) : activeOrganizationQuery.isLoading || emailSettingsQuery.isLoading ? (
                    <LoadingState label="Loading email settings…" />
                  ) : emailSettingsQuery.error ? (
                    <p className="text-sm font-medium text-red-700">{emailSettingsQuery.error.message}</p>
                  ) : (
                    <form
                      className="flex max-w-xl flex-col gap-6"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveEmailSettings.mutate();
                      }}
                    >
                      <Label>
                        SMTP host
                        <Input className="mt-1" onChange={(event) => setHost(event.target.value)} required value={host} />
                      </Label>
                      <div className="flex flex-col gap-6 sm:flex-row">
                        <Label className="flex-1">
                          Security type
                          <Select
                            className="mt-1"
                            onChange={(event) => setSecurityType(event.target.value as SmtpSecurityType)}
                            value={securityType}
                          >
                            <option value="none">None</option>
                            <option value="starttls">STARTTLS</option>
                            <option value="tls">TLS</option>
                          </Select>
                        </Label>
                        <Label className="flex-1">
                          Port
                          <Input
                            className="mt-1"
                            max={65535}
                            min={1}
                            onChange={(event) => setPort(event.target.value)}
                            required
                            type="number"
                            value={port}
                          />
                        </Label>
                      </div>
                      <Label>
                        Sender name
                        <Input className="mt-1" onChange={(event) => setFromName(event.target.value)} value={fromName} />
                      </Label>
                      <Label>
                        From email address
                        <Input
                          className="mt-1"
                          onChange={(event) => setFromEmail(event.target.value)}
                          required
                          type="email"
                          value={fromEmail}
                        />
                      </Label>
                      <div className="flex items-start gap-3 rounded-md border border-parcelis-border p-4">
                        <Checkbox
                          checked={requireSignIn}
                          id="require-sign-in"
                          onCheckedChange={(checked) => setRequireSignIn(checked === true)}
                        />
                        <div>
                          <Label className="cursor-pointer" htmlFor="require-sign-in">
                            Require sign in
                          </Label>
                          <p className="mt-1 text-sm text-parcelis-gray">Use a username and password to authenticate with SMTP.</p>
                        </div>
                      </div>
                      {requireSignIn ? (
                        <>
                          <Label>
                            Username
                            <Input
                              className="mt-1"
                              onChange={(event) => setUsername(event.target.value)}
                              required
                              value={username}
                            />
                          </Label>
                          <Label>
                            Password
                            <Input
                              autoComplete="new-password"
                              className="mt-1"
                              onChange={(event) => setPassword(event.target.value)}
                              placeholder={hasSavedPassword ? "Leave blank to keep the saved password" : undefined}
                              required={!hasSavedPassword}
                              type="password"
                              value={password}
                            />
                            {hasSavedPassword ? (
                              <span className="mt-1 flex items-center gap-2 text-xs text-parcelis-gray">
                                <Badge variant="secondary">Saved</Badge>
                                Enter a new password only to replace it.
                              </span>
                            ) : null}
                          </Label>
                        </>
                      ) : null}
                      {saveEmailSettings.error ? (
                        <p className="text-sm font-medium text-red-700">{saveEmailSettings.error.message}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-3">
                        <Button className="min-w-40" disabled={saveEmailSettings.isPending} type="submit">
                          Save email settings
                        </Button>
                        <Button
                          className="min-w-40"
                          disabled={sendTestEmail.isPending || !emailSettingsQuery.data}
                          onClick={() => sendTestEmail.mutate()}
                          type="button"
                          variant="secondary"
                        >
                          {sendTestEmail.isPending ? "Sending test email…" : "Send test email"}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
