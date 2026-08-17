import { AppFooter } from "../../components/app-footer";
import { Sidebar } from "../../components/sidebar";
import { ShortcutProvider } from "../../components/shortcut-provider";
import { ToastProvider } from "../../components/toast-provider";
import { TrpcProvider } from "../../components/trpc-provider";

export default function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ShortcutProvider>
      <TrpcProvider>
        <div className="flex min-h-[100svh] flex-col">
          <Sidebar />
          {children}
          <AppFooter />
        </div>
        <ToastProvider />
      </TrpcProvider>
    </ShortcutProvider>
  );
}
