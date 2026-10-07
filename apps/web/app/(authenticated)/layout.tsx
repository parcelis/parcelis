import { getFeatureFlags } from "@parcelis/schemas";
import { FeatureFlagsProvider } from "../../components/feature-flags";
import { AppFooter } from "../../components/app-footer";
import { Sidebar } from "../../components/sidebar";
import { ShortcutProvider } from "../../components/shortcut-provider";
import { ToastProvider } from "../../components/toast-provider";
import { TrpcProvider } from "../../components/trpc-provider";
import { SessionActivity } from "../../components/session-activity";

export const dynamic = "force-dynamic";

export default function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <FeatureFlagsProvider flags={getFeatureFlags(process.env)}>
      <ShortcutProvider>
        <TrpcProvider>
          <SessionActivity />
          <div className="flex min-h-[100svh] flex-col">
            <Sidebar />
            {children}
            <AppFooter />
          </div>
          <ToastProvider />
        </TrpcProvider>
      </ShortcutProvider>
    </FeatureFlagsProvider>
  );
}
