import type { Metadata } from "next";
import "@parcelis/ui/styles.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Parcelis Docs",
  description: "Implementation notes and product documentation for Parcelis."
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
