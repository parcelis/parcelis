import { MailCheck, Send } from "lucide-react";
import { Card, CardContent } from "@parcelis/ui";
import { ApplicationsPageShell } from "../../../../components/applications-page-shell";

export default function ApplicationRequestsPage() {
  return (
    <ApplicationsPageShell
      active="request-sent"
      description="Track application requests sent to prospective tenants."
      icon={Send}
      title="Requests sent"
    >
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
    </ApplicationsPageShell>
  );
}
