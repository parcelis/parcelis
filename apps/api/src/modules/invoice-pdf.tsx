import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

const parcelisLightBannerPath = resolve(__dirname, "../../../web/public/brand/parcelis-fullmark-light.png");
const parcelisLightBackgroundPath = resolve(__dirname, "../../../web/public/brand/parcelis-light-background.png");

// Mirrors packages/ui/src/styles.css custom properties. react-pdf renders server-side with its
// own StyleSheet and can't read CSS custom properties, so the token values are duplicated here.
const colors = {
  border: "#dce1dc",
  charcoal: "#101c29",
  gray: "#586273",
  white: "#ffffff",
};

Font.register({
  family: "Inter",
  src: require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff"),
});
Font.register({
  family: "Inter-Bold",
  src: require.resolve("@fontsource/inter/files/inter-latin-700-normal.woff"),
});

export type InvoicePdfInvoice = {
  amountCents: number;
  balanceCents: number;
  dueOn: Date;
  invoiceNumber: number;
  items: Array<{
    description: string | null;
    item: string;
    quantity: number;
    rateCents: number;
  }>;
  lease: { unitLabel: string };
  payments: Array<{
    amountCents: number;
    paidOn: Date;
    paymentMethod: string;
    tenant: { firstName: string; lastName: string };
  }>;
  property: { name: string; line1: string; line2: string | null; city: string; region: string; postalCode: string };
  status: string;
  tenant: { firstName: string; lastName: string };
};

const styles = StyleSheet.create({
  page: { backgroundColor: colors.white, color: colors.charcoal, fontFamily: "Inter", fontSize: 10, padding: 48 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: -48,
    marginTop: -48,
    overflow: "hidden",
    padding: 28,
  },
  headerBackground: {
    bottom: 0,
    height: "100%",
    left: 0,
    objectFit: "cover",
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
  },
  brandBanner: { height: 52, objectFit: "contain", width: 130 },
  brandName: { color: colors.charcoal, fontFamily: "Inter-Bold", fontSize: 22, height: 36 },
  invoiceLabel: { fontSize: 22, fontFamily: "Inter-Bold", textAlign: "right" },
  statusLate: {
    alignSelf: "flex-start",
    backgroundColor: "#fee2e2",
    borderRadius: 4,
    color: "#b91c1c",
    fontFamily: "Inter-Bold",
    fontSize: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPaid: {
    alignSelf: "flex-start",
    backgroundColor: "#d9edc7",
    borderRadius: 4,
    color: colors.charcoal,
    fontFamily: "Inter-Bold",
    fontSize: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  muted: { color: colors.gray, marginTop: 4 },
  tagline: { color: colors.gray, fontFamily: "Inter-Bold", marginTop: 4 },
  details: { flexDirection: "row", gap: 24, marginTop: 30 },
  detailColumn: { flex: 1 },
  eyebrow: { color: colors.gray, fontSize: 8, fontFamily: "Inter-Bold", letterSpacing: 1, textTransform: "uppercase" },
  detailText: { fontSize: 11, lineHeight: 1.5, marginTop: 8 },
  table: { marginTop: 36 },
  tableHeader: { backgroundColor: colors.charcoal, color: colors.white, flexDirection: "row", fontFamily: "Inter-Bold", padding: 10 },
  row: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", padding: 10 },
  item: { width: 90 },
  description: { flex: 1 },
  descriptionText: { color: colors.gray, flex: 1 },
  quantity: { textAlign: "right", width: 40 },
  rate: { textAlign: "right", width: 70 },
  amount: { textAlign: "right", width: 75 },
  payments: { marginTop: 26 },
  paymentHeading: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 10 },
  paymentHeader: { color: colors.charcoal, fontFamily: "Inter-Bold", fontSize: 12 },
  paymentCount: {
    backgroundColor: "#d9edc7",
    borderRadius: 10,
    color: colors.charcoal,
    fontFamily: "Inter-Bold",
    fontSize: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  paymentTableHeader: { borderBottomColor: colors.border, borderBottomWidth: 1, color: colors.gray, flexDirection: "row", fontFamily: "Inter-Bold", fontSize: 8, paddingBottom: 7 },
  paymentRow: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingVertical: 8 },
  payer: { flex: 1 },
  paidOn: { color: colors.gray, width: 95 },
  method: { color: colors.gray, width: 95 },
  paymentAmount: { fontFamily: "Inter-Bold", textAlign: "right", width: 75 },
  totals: { alignSelf: "flex-end", marginTop: 24, width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  balance: { borderTopColor: colors.charcoal, borderTopWidth: 1, fontFamily: "Inter-Bold", fontSize: 13, marginTop: 5, paddingTop: 10 },
  thankYou: { color: colors.gray, fontSize: 8, marginTop: 30, textAlign: "center" },
  footer: {
    bottom: 10,
    color: colors.gray,
    fontSize: 8,
    left: 48,
    position: "absolute",
    right: 48,
    textAlign: "center",
  },
  issuedThrough: { color: colors.gray, fontSize: 8 },
  issuedThroughSignature: { alignSelf: "center", height: 24, marginTop: -4, objectFit: "contain", width: 94 },
});

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" }).format(value);
}

function formatPaymentMethod(method: string) {
  return method
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInvoiceStatus(invoice: Pick<InvoicePdfInvoice, "balanceCents" | "status">) {
  if (invoice.balanceCents === 0 || invoice.status === "paid") return { label: "PAID", style: styles.statusPaid };
  if (invoice.status === "overdue") return { label: "OVERDUE", style: styles.statusLate };
  return null;
}

async function loadBrandImage(path: string) {
  try {
    return `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
  } catch {
    return null;
  }
}

function InvoicePdfDocument({
  brandBanner,
  headerBackground,
  invoice,
  organizationLogo,
}: {
  brandBanner: string | null;
  headerBackground: string | null;
  invoice: InvoicePdfInvoice;
  organizationLogo: string | null;
}) {
  const invoiceLabel = `INV-${String(invoice.invoiceNumber).padStart(7, "0")}`;
  const paidCents = Math.max(invoice.amountCents - invoice.balanceCents, 0);
  const status = getInvoiceStatus(invoice);
  const items = invoice.items.length
    ? invoice.items
    : [{ description: null, item: "Rent", quantity: 1, rateCents: invoice.amountCents }];
  const isWhiteLabeled = Boolean(organizationLogo);

  return (
    <Document author="Parcelis" title={`Invoice ${invoiceLabel}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          {headerBackground ? <Image src={headerBackground} style={styles.headerBackground} /> : null}
          <View>
            {organizationLogo ? (
              <Image src={organizationLogo} style={styles.brandBanner} />
            ) : brandBanner ? (
              <Image src={brandBanner} style={styles.brandBanner} />
            ) : (
              <Text style={styles.brandName}>Parcelis</Text>
            )}
            {isWhiteLabeled ? null : (
              <Text style={styles.tagline}>The open-source platform for property management.</Text>
            )}
          </View>
          <View>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.muted}>{invoiceLabel}</Text>
          </View>
        </View>
        <View style={styles.details}>
          <View style={styles.detailColumn}>
            <Text style={styles.eyebrow}>Bill to</Text>
            <Text style={styles.detailText}>{`${invoice.tenant.firstName} ${invoice.tenant.lastName}`}</Text>
            <Text style={styles.muted}>{`${invoice.property.name} - Unit ${invoice.lease.unitLabel}`}</Text>
            <Text style={styles.muted}>{invoice.property.line1}</Text>
            {invoice.property.line2 && <Text style={styles.muted}>{invoice.property.line2}</Text>}
            <Text style={styles.muted}>{`${invoice.property.city}, ${invoice.property.region} ${invoice.property.postalCode}`}</Text>
          </View>
          <View style={styles.detailColumn}>
            <Text style={styles.eyebrow}>Due date</Text>
            <Text style={styles.detailText}>{formatDate(invoice.dueOn)}</Text>
          </View>
          {status ? (
            <View style={styles.detailColumn}>
              <Text style={styles.eyebrow}>Status</Text>
              <Text style={status.style}>{status.label}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.item}>Item</Text>
            <Text style={styles.description}>Description</Text>
            <Text style={styles.quantity}>Qty.</Text>
            <Text style={styles.rate}>Rate</Text>
            <Text style={styles.amount}>Amount</Text>
          </View>
          {items.map((item, index) => {
            const amountCents = item.quantity * item.rateCents;
            return (
              <View key={`${item.item}-${index}`} style={styles.row}>
                <Text style={styles.item}>{item.item}</Text>
                <Text style={styles.descriptionText}>{item.description ?? "—"}</Text>
                <Text style={styles.quantity}>{item.quantity}</Text>
                <Text style={styles.rate}>{formatCurrency(item.rateCents)}</Text>
                <Text style={styles.amount}>{formatCurrency(amountCents)}</Text>
              </View>
            );
          })}
        </View>
        {invoice.payments.length ? (
          <View style={styles.payments}>
            <View style={styles.paymentHeading}>
              <Text style={styles.paymentHeader}>Payment activity</Text>
              <Text style={styles.paymentCount}>{`Payments received ${invoice.payments.length}`}</Text>
            </View>
            <View style={styles.paymentTableHeader}>
              <Text style={styles.payer}>Payer</Text>
              <Text style={styles.paidOn}>Paid on</Text>
              <Text style={styles.method}>Method</Text>
              <Text style={styles.paymentAmount}>Amount</Text>
            </View>
            {invoice.payments.map((payment, index) => (
              <View key={`${payment.paidOn.toISOString()}-${index}`} style={styles.paymentRow}>
                <Text style={styles.payer}>{`${payment.tenant.firstName} ${payment.tenant.lastName}`}</Text>
                <Text style={styles.paidOn}>{formatDate(payment.paidOn)}</Text>
                <Text style={styles.method}>{formatPaymentMethod(payment.paymentMethod)}</Text>
                <Text style={styles.paymentAmount}>{formatCurrency(payment.amountCents)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Invoice total</Text>
            <Text>{formatCurrency(invoice.amountCents)}</Text>
          </View>
          {paidCents > 0 ? (
            <View style={styles.totalRow}>
              <Text>Payments received</Text>
              <Text>{formatCurrency(paidCents)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.balance]}>
            <Text>Balance due</Text>
            <Text>{formatCurrency(invoice.balanceCents)}</Text>
          </View>
        </View>
        <Text style={styles.thankYou}>Thank you for your prompt payment.</Text>
        {isWhiteLabeled ? (
          <View fixed style={styles.footer}>
            <Text style={styles.issuedThrough}>Issued with</Text>
            {brandBanner ? <Image src={brandBanner} style={styles.issuedThroughSignature} /> : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export type InvoicePdfOrganizationLogo = { buffer: Buffer; contentType: string } | null;

export async function renderInvoicePdf(invoice: InvoicePdfInvoice, organizationLogoAsset: InvoicePdfOrganizationLogo = null) {
  const [brandBanner, headerBackground] = await Promise.all([
    loadBrandImage(parcelisLightBannerPath),
    loadBrandImage(parcelisLightBackgroundPath),
  ]);
  const organizationLogo = organizationLogoAsset
    ? `data:${organizationLogoAsset.contentType};base64,${organizationLogoAsset.buffer.toString("base64")}`
    : null;
  return renderToBuffer(
    <InvoicePdfDocument
      brandBanner={brandBanner}
      headerBackground={headerBackground}
      invoice={invoice}
      organizationLogo={organizationLogo}
    />,
  );
}
