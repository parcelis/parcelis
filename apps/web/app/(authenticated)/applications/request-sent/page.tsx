import Link from "next/link";
import { MailCheck, Send } from "lucide-react";
import { Button, Card, CardContent, ParcelisLogo } from "@parcelis/ui";
import { ApplicationsRail } from "../../../../components/applications-rail";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

export default function ApplicationRequestsPage() {
  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>
        <div className="parcelis-page-shell flex flex-col gap-5 lg:flex-row">
          <ApplicationsRail active="request-sent" />
          <div className="min-w-0 flex-1">
            <section className="rounded-lg bg-parcelis-charcoal p-6 text-white">
              <div className="flex items-center gap-3 text-parcelis-green">
                <Send className="h-5 w-5" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">Applications</p>
              </div>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Requests sent</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Track application requests sent to prospective tenants.
              </p>
            </section>

            <Card className="mt-6">
              <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-parcelis-green/15 text-parcelis-charcoal">
                  <MailCheck className="h-6 w-6" />
                </div>
                <h2 className="mt-5 font-semibold text-parcelis-charcoal">No requests sent</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-parcelis-gray">
                  Sent application requests will appear here once applicant invitations are available.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
