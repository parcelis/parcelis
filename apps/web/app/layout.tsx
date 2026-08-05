import type { Metadata } from "next";
import { AppFooter } from "../components/app-footer";
import { ShortcutProvider } from "../components/shortcut-provider";
import { TrpcProvider } from "../components/trpc-provider";
import { ThemeProvider } from "../components/theme-provider";
import "@parcelis/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parcelis | Property management",
  description: "An open-source property management system for property managers, landlords, and local teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ShortcutProvider>
            <TrpcProvider>
              <div className="flex min-h-[100svh] flex-col">
                {children}
                <AppFooter />
              </div>
            </TrpcProvider>
          </ShortcutProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
