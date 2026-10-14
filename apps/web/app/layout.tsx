import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "@parcelis/ui/styles.css";
import { inter } from "@parcelis/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parcelis | Property management",
  description: "An open-source property management system for property managers, landlords, and local teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" storageKey="parcelis-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
