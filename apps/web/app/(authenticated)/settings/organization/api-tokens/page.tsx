"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiTokenExpirationSchema, createApiTokenInputSchema, type ApiTokenExpiration } from "@parcelis/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, KeyRound } from "lucide-react";
import { apiClient, createApiClient, queryKeys } from "../../../../../components/api-client";
import { LoadingState } from "../../../../../components/loading-state";
import { SettingsRail } from "../../../../../components/settings-rail";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { formatDate } from "../../../../../lib/date";

const expirationLabels: Record<ApiTokenExpiration, string> = {
  "7_days": "7 days",
  "1_month": "1 month",
  "3_months": "3 months",
  "6_months": "6 months",
  "12_months": "12 months",
  never: "Never",
};

export default function OrganizationApiTokensPage() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const routeClient = useMemo(() => createApiClient(pathname.match(/^\/o\/([^/]+)/)?.[1]), [pathname]);

  const organizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => routeClient.organizations.active.query(),
  });

  const [pagination, setPagination] = useState<{
    organizationId: number;
    cursors: Array<string | undefined>;
  } | null>(null);

  const requestVersion = useRef(0);
  const creationPending = useRef(false);
  const revocationPending = useRef(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{
    organizationId: number;
    id: string;
    name: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<{
    organizationId: number;
    token: string;
  } | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [expiration, setExpiration] = useState<ApiTokenExpiration>(() =>
    createApiTokenInputSchema.shape.expiration.parse(undefined),
  );

  const createTokenInput = createApiTokenInputSchema.safeParse({
    name: tokenName,
    expiration,
  });

  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });

  const canManageTokens = ["owner", "administrator"].includes(organizationQuery.data?.role ?? "");

  const cursors =
    pagination && pagination.organizationId === organizationQuery.data?.id ? pagination.cursors : [undefined];
  const cursor = cursors.at(-1);

  const organizationSlug = organizationQuery.data?.slug;
  const organizationClient = useMemo(
    () => (organizationSlug ? createApiClient(organizationSlug) : null),
    [organizationSlug],
  );

  const tokensQuery = useQuery({
    queryKey: organizationQuery.data
      ? queryKeys.apiTokens.list(organizationQuery.data.id, cursor)
      : ["apiTokens", "pending", pathname],
    queryFn: () => {
      if (!organizationClient) {
        throw new Error("Organization access is required.");
      }

      return organizationClient.apiTokens.list.query({ limit: 25, cursor });
    },
    enabled: organizationQuery.isSuccess && canManageTokens && organizationClient !== null,
  });

  // Reset token creation state when the organization or pathname changes
  const organization = organizationQuery.data;
  useEffect(() => {
    requestVersion.current += 1;

    creationPending.current = false;
    revocationPending.current = false;
    setIsRevoking(false);
    setRevokeError(null);
    setRevokeTarget(null);
    setIsCreating(false);
    setCreateError(null);
    setCreatedToken(null);
    setIsCreateDrawerOpen(false);
    setTokenName("");
    setExpiration(createApiTokenInputSchema.shape.expiration.parse(undefined));

    return () => {
      requestVersion.current += 1;
    };
  }, [pathname, organization?.id]);

  function handleCreateDrawerChange(open: boolean) {
    if (creationPending.current) return;
    setIsCreateDrawerOpen(open);
    setCreateError(null);
    if (!open) {
      setTokenName("");
      setExpiration(createApiTokenInputSchema.shape.expiration.parse(undefined));
    }
  }

  async function handleCreateToken() {
    if (
      creationPending.current ||
      !organizationQuery.isSuccess ||
      !organization ||
      !organizationClient ||
      !canManageTokens ||
      !createTokenInput.success
    )
      return;

    const version = requestVersion.current;
    const organizationId = organization.id;
    creationPending.current = true;
    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await organizationClient.apiTokens.create.mutate(createTokenInput.data);
      if (version !== requestVersion.current) return;

      setCreatedToken({ organizationId, token: result.token });
      setIsCreateDrawerOpen(false);
      setTokenName("");
      setExpiration(createApiTokenInputSchema.shape.expiration.parse(undefined));
      setPagination({ organizationId, cursors: [undefined] });
    } catch {
      if (version === requestVersion.current) {
        setCreateError(
          "Couldn’t confirm token creation. Check the token list before trying again. If a token was created without its secret, revoke it and create a replacement.",
        );
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.all(organizationId) });
      if (version === requestVersion.current) {
        creationPending.current = false;
        setIsCreating(false);
      }
    }
  }

  const visibleCreatedToken =
    createdToken && organizationQuery.isSuccess && canManageTokens && createdToken.organizationId === organization?.id
      ? createdToken
      : null;

  const visibleRevokeTarget =
    revokeTarget && organizationQuery.isSuccess && canManageTokens && revokeTarget.organizationId === organization?.id
      ? revokeTarget
      : null;

  function handleRevokeDialogChange(open: boolean) {
    if (!open && !revocationPending.current) {
      setRevokeTarget(null);
      setRevokeError(null);
    }
  }

  async function handleRevokeToken() {
    if (revocationPending.current || !visibleRevokeTarget || !organizationClient) return;
    const version = requestVersion.current;
    const organizationId = visibleRevokeTarget.organizationId;
    revocationPending.current = true;
    setIsRevoking(true);
    setRevokeError(null);

    try {
      await organizationClient.apiTokens.revoke.mutate({ id: visibleRevokeTarget.id });
      if (version !== requestVersion.current) return;
      setRevokeTarget(null);
      toast.success("API token revoked.");
    } catch {
      if (version === requestVersion.current) {
        setRevokeError("Couldn’t revoke the token. Try again.");
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.all(organizationId) });
      if (version === requestVersion.current) {
        revocationPending.current = false;
        setIsRevoking(false);
      }
    }
  }

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>
        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail
              active="api-tokens"
              canManageRoles={currentUserQuery.data?.user.role === "administrator"}
              canManageUsers={currentUserQuery.data?.permissions.users.view ?? false}
              canManageInvoicing={currentUserQuery.data?.permissions.invoices.view ?? false}
            />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Settings</p>
                <h1 className="mt-5 text-3xl font-bold md:text-5xl">API tokens</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                  Manage integration credentials for {organization?.name ?? "this organization"}.
                </p>
              </section>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Integration credentials</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">
                        Review token access, expiration, and recent use.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <KeyRound className="h-5 w-5 text-parcelis-green" aria-hidden="true" />
                      {organizationQuery.isSuccess && canManageTokens ? (
                        <Button className="min-w-40" onClick={() => handleCreateDrawerChange(true)}>
                          Create token
                        </Button>
                      ) : null}
                    </div>{" "}
                  </div>
                </CardHeader>
                <CardContent>
                  {organizationQuery.isPending ? (
                    <LoadingState label="Loading organization…" />
                  ) : organizationQuery.isError ? (
                    <p className="text-sm text-red-700" role="alert">
                      {organizationQuery.error.message}
                    </p>
                  ) : !organization || !canManageTokens ? (
                    <p className="text-sm text-parcelis-gray" role="alert">
                      Organization owner or administrator access is required.
                    </p>
                  ) : tokensQuery.isPending ? (
                    <LoadingState label="Loading API tokens…" />
                  ) : tokensQuery.isError ? (
                    <p className="mt-4 text-sm text-red-700" role="alert">
                      {tokensQuery.error.message}
                    </p>
                  ) : tokensQuery.data.items.length === 0 ? (
                    <p className="mt-6 text-sm text-parcelis-gray">
                      No API tokens yet. Create a token to connect an integration to {organization.name}.
                    </p>
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Token prefix</TableHead>
                            <TableHead>Created by</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead>Last used</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tokensQuery.data.items.map((token) => (
                            <TableRow key={token.id}>
                              <TableCell className="font-medium">{token.name}</TableCell>
                              <TableCell className="font-mono text-xs">{token.tokenPrefix}</TableCell>
                              <TableCell>{token.createdByLabel}</TableCell>
                              <TableCell className="whitespace-nowrap">{formatDate(token.createdAt)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {token.expiresAt ? formatDate(token.expiresAt) : "Never"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {token.lastUsedAt ? formatDate(token.lastUsedAt) : "Never used"}
                              </TableCell>
                              <TableCell>
                                <Badge>
                                  {token.revokedAt
                                    ? "Revoked"
                                    : token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()
                                      ? "Expired"
                                      : "Active"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {token.revokedAt ? (
                                  <span className="text-xs text-parcelis-gray">Revoked</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    aria-label={`Revoke ${token.name}`}
                                    onClick={() => {
                                      setRevokeError(null);
                                      setRevokeTarget({
                                        organizationId: organization.id,
                                        id: token.id,
                                        name: token.name,
                                      });
                                    }}
                                  >
                                    Revoke
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {organization && canManageTokens && tokensQuery.isSuccess ? (
                    <nav aria-label="API token pagination" className="mt-4 flex items-center justify-between gap-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={cursors.length <= 1 || tokensQuery.isFetching}
                        onClick={() =>
                          setPagination({
                            organizationId: organization.id,
                            cursors: cursors.slice(0, -1),
                          })
                        }
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-parcelis-gray">Page {cursors.length}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!tokensQuery.data.nextCursor || tokensQuery.isFetching}
                        onClick={() => {
                          const nextCursor = tokensQuery.data.nextCursor;
                          if (!nextCursor) return;

                          setPagination({
                            organizationId: organization.id,
                            cursors: [...cursors, nextCursor],
                          });
                        }}
                      >
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </nav>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
      {organization && canManageTokens ? (
        <Drawer open={isCreateDrawerOpen} onOpenChange={handleCreateDrawerChange}>
          <DrawerContent size="sm" aria-labelledby="create-token-title" aria-describedby="create-token-description">
            <DrawerHeader className="flex items-start justify-between gap-3">
              <div>
                <DrawerTitle id="create-token-title">Create API token</DrawerTitle>
                <p id="create-token-description" className="mt-1 text-sm text-parcelis-gray">
                  Create an integration credential for {organization.name}.
                </p>
              </div>
              <DrawerClose disabled={isCreating} />
            </DrawerHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateToken();
              }}
            >
              <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
                <p className="text-sm text-parcelis-gray">
                  Give integrations full access to the supported API operations for {organization.name}. Tokens belong
                  to the organization, even if their creator leaves.
                </p>
                {createError ? (
                  <p className="mt-4 text-sm text-red-700" role="alert">
                    {createError}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-col gap-2">
                  <Label htmlFor="api-token-name">Name</Label>
                  <Input
                    id="api-token-name"
                    disabled={isCreating}
                    value={tokenName}
                    onChange={(event) => setTokenName(event.target.value)}
                    placeholder="Bruno"
                    autoComplete="off"
                    required
                  />
                  <p className="text-xs text-parcelis-gray">
                    Choose a name that identifies the integration using this token.
                  </p>
                </div>
                <div className="mt-6 flex flex-col gap-2">
                  <Label htmlFor="api-token-expiration">Expiration</Label>
                  <Select
                    id="api-token-expiration"
                    disabled={isCreating}
                    value={expiration}
                    onChange={(event) => setExpiration(apiTokenExpirationSchema.parse(event.target.value))}
                  >
                    {apiTokenExpirationSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {expirationLabels[value]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <DrawerFooter className="flex items-center justify-between gap-3">
                <Button
                  className="min-w-40"
                  type="button"
                  variant="secondary"
                  disabled={isCreating}
                  onClick={() => handleCreateDrawerChange(false)}
                >
                  Cancel
                </Button>
                <Button className="min-w-40" type="submit" disabled={isCreating || !createTokenInput.success}>
                  {isCreating ? "Creating…" : "Create token"}
                </Button>
              </DrawerFooter>
            </form>
          </DrawerContent>
        </Drawer>
      ) : null}
      <AlertDialog open={visibleRevokeTarget !== null} onOpenChange={handleRevokeDialogChange}>
        <AlertDialogContent aria-labelledby="revoke-token-title" aria-describedby="revoke-token-description">
          <AlertDialogHeader>
            <AlertDialogTitle id="revoke-token-title">Revoke API token?</AlertDialogTitle>
            <AlertDialogDescription id="revoke-token-description">
              Revoke “{visibleRevokeTarget?.name}” for {organization?.name}? Integrations using this token will lose
              access on their next request. This cannot be undone. To rotate a token, create a replacement and update
              the integration before revoking the old token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError ? (
            <p className="text-sm text-red-700" role="alert">
              {revokeError}
            </p>
          ) : null}
          <AlertDialogFooter className="justify-between">
            <Button
              className="min-w-40"
              variant="secondary"
              disabled={isRevoking}
              onClick={() => handleRevokeDialogChange(false)}
            >
              Cancel
            </Button>
            <Button className="min-w-40" disabled={isRevoking} onClick={() => void handleRevokeToken()}>
              {isRevoking ? "Revoking…" : "Revoke token"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={visibleCreatedToken !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedToken(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API token</DialogTitle>
            <DialogDescription>Save this token somewhere secure. It won’t be shown again.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="created-api-token">API token</Label>
            <Input
              id="created-api-token"
              value={visibleCreatedToken?.token ?? ""}
              readOnly
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <DialogFooter className="justify-between">
            <Button
              className="min-w-40"
              variant="secondary"
              onClick={async () => {
                if (!visibleCreatedToken) return;

                try {
                  await navigator.clipboard.writeText(visibleCreatedToken.token);
                  toast.success("API token copied.");
                } catch {
                  toast.error("Couldn’t copy the token. Select it and copy it manually.");
                }
              }}
            >
              Copy
            </Button>
            <Button className="min-w-40" onClick={() => setCreatedToken(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
