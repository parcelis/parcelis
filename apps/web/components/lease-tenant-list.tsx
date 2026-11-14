import Link from "next/link";
import { getTenantLink } from "../lib/entity-links";

type LeaseTenant = {
  id: number;
  firstName: string;
  lastName: string;
};

export function LeaseTenantList({ tenants, currentTenantId }: { tenants: LeaseTenant[]; currentTenantId?: number }) {
  if (tenants.length < 2) return null;

  const label = currentTenantId === undefined ? "Tenants" : "Co-tenants";
  const visibleTenants = tenants.filter((tenant) => tenant.id !== currentTenantId);

  return (
    <div className="mt-2 text-sm">
      <p className="text-parcelis-gray">{label}</p>
      <ul aria-label={label} className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {visibleTenants.map((tenant) => (
          <li className="min-w-0" key={tenant.id}>
            <Link
              className="break-words font-semibold text-parcelis-green hover:underline focus-visible:underline"
              href={getTenantLink(tenant.id)}
            >
              {tenant.firstName} {tenant.lastName}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
