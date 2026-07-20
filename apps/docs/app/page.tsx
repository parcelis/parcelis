import { ParcelisLogo } from "@parcelis/ui";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

const sections = [
  ["Architecture", "Turborepo workspace with Next.js apps, NestJS API, Prisma database, and shared packages."],
  ["Contracts", "Zod schemas live in packages/schemas and validate tRPC inputs and frontend forms."],
  ["Database", "Prisma models cover properties, tenants, and leases with room for accounting and maintenance modules."],
  ["Deployment", "Docker Compose supports local hot reload; CI runs lint, typecheck, and build."],
];

export default function DocsHome() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px" }}>
      <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} />
      <h1 style={{ marginTop: 48, fontSize: 44, color: "rgb(var(--parcelis-charcoal))" }}>Parcelis Documentation</h1>
      <p style={{ maxWidth: 680, lineHeight: 1.7, color: "rgb(var(--parcelis-gray))" }}>
        Product and engineering notes for the open-source property management platform.
      </p>
      <div style={{ display: "grid", gap: 16, marginTop: 32 }}>
        {sections.map(([title, body]) => (
          <section
            key={title}
            style={{
              background: "white",
              border: "1px solid rgb(var(--parcelis-border))",
              borderRadius: 8,
              padding: 20,
            }}
          >
            <h2 style={{ margin: 0, color: "rgb(var(--parcelis-charcoal))" }}>{title}</h2>
            <p style={{ marginBottom: 0, color: "rgb(var(--parcelis-gray))" }}>{body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
