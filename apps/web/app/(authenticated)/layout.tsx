import { getFeatureFlags } from "@parcelis/schemas";
import { FeatureFlagsProvider } from "../../components/feature-flags";
import { AppFooter } from "../../components/app-footer";
import { Sidebar } from "../../components/sidebar";
import { ShortcutProvider } from "../../components/shortcut-provider";
import { ToastProvider } from "../../components/toast-provider";
import { TrpcProvider } from "../../components/trpc-provider";
import { AuthSession } from "../../components/auth-session";
import { OrganizationCurrencyProvider } from "../../components/organization-currency";

export const dynamic = "force-dynamic";

export default function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <FeatureFlagsProvider flags={getFeatureFlags(process.env)}>
      <ShortcutProvider>
        <TrpcProvider>
          <AuthSession>
            <OrganizationCurrencyProvider>
              <div className="flex min-h-[100svh] flex-col">
                <Sidebar />
                {children}
                <AppFooter />
              </div>
              <ToastProvider />
            </OrganizationCurrencyProvider>
          </AuthSession>
        </TrpcProvider>
      </ShortcutProvider>
    </FeatureFlagsProvider>
  );
}
