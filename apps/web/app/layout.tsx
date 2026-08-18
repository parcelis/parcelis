import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "../components/theme-provider";
import "@parcelis/ui/styles.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Parcelis | Property management",
  description: "An open-source property management system for property managers, landlords, and local teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
