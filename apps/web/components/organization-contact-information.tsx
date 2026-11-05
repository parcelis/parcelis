"use client";

import { ChevronDown } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@parcelis/ui";
import type { apiClient } from "./api-client";

type Organization = Awaited<ReturnType<typeof apiClient.organizations.list.query>>[number]["organization"];

export function OrganizationContactInformation({ organization }: { organization: Organization }) {
  const email = organization.email?.trim();
  const phone = organization.phone?.trim();
  const addressLines = [
    organization.addressLine1,
    organization.addressLine2,
    [organization.city, organization.region, organization.postalCode].filter(Boolean).join(" "),
  ]
    .map((line) => line?.trim())
    .filter(Boolean);
  const hasContactInformation = Boolean(email || phone || addressLines.length);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={`Contact information for ${organization.name}`} size="sm" type="button" variant="secondary">
          Contact information
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={`Contact information for ${organization.name}`}
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        <h3 className="break-words font-semibold text-parcelis-charcoal">{organization.name}</h3>
        {hasContactInformation ? (
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-medium text-parcelis-charcoal">Email</dt>
              <dd className="mt-1 break-words text-parcelis-gray">{email || "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-medium text-parcelis-charcoal">Phone</dt>
              <dd className="mt-1 break-words text-parcelis-gray">{phone || "Not provided"}</dd>
            </div>
            <div>
              <dt className="font-medium text-parcelis-charcoal">Mailing address</dt>
              <dd className="mt-1 break-words text-parcelis-gray">
                {addressLines.length ? addressLines.map((line, index) => <p key={index}>{line}</p>) : "Not provided"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-parcelis-gray">No contact information has been provided.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
