import { FilePlus2, LayoutTemplate } from "lucide-react";
import { Card, CardContent } from "@parcelis/ui";
import { ApplicationsPageShell } from "../../../../components/applications-page-shell";

export default function ApplicationTemplatesPage() {
  return (
    <ApplicationsPageShell
      active="templates"
      description="Build reusable application forms for prospective tenants."
      icon={LayoutTemplate}
      title="Application templates"
    >
      <Card className="mt-6">
        <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-parcelis-green/15 text-parcelis-charcoal">
            <FilePlus2 className="h-6 w-6" />
          </div>
          <h2 className="mt-5 font-semibold text-parcelis-charcoal">No templates yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-parcelis-gray">
            Your application form builder will live here. Create a template to collect the details you need from
            prospective tenants.
          </p>
        </CardContent>
      </Card>
    </ApplicationsPageShell>
  );
}
