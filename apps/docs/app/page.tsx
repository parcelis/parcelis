import { ParcelisLogo } from "@parcelis/ui";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

const guideLinks = [
  ["Start", "Start From The Portfolio Dashboard"],
  ["Add Property", "Add A Property"],
  ["Directory", "Use The Property Directory"],
  ["Manage", "Manage A Property"],
  ["Detail", "Review A Property Detail Page"],
  ["Shortcuts", "Keyboard Shortcuts"],
] as const;

const coreConcepts = [
  ["Portfolio", "The full set of properties tracked in Parcelis, with summaries for units, occupancy, rent roll, overdue balances, active leasing status, and open maintenance activity."],
  ["Property", "A managed asset such as an apartment building, condo, duplex, house, commercial space, HOA, mixed-use building, parking asset, self-storage facility, manufactured home community, trailer property, or other asset type."],
  ["Unit", "A rentable or assignable space within a property. Unit rows show occupancy, rent, overdue balance, lease expiration status, maintenance ticket count, and current status where data exists."],
  ["Lease", "A tenant assignment for a unit with dates and rent. Lease snapshots power occupancy, rent roll, overdue balance, and upcoming expiration indicators."],
  ["Maintenance Ticket", "A work item tied to a property or unit. Property views surface open tickets, ticket status, priority, and due dates when data exists."],
] as const;

const dashboardItems = [
  "Portfolio occupancy across all tracked units.",
  "Total properties and active leasing count.",
  "Occupied units and total unit count.",
  "Monthly rent roll summary.",
  "Priority operational tasks.",
  "A compact property snapshot table.",
] as const;

const propertyFields = [
  "Property address.",
  "Property name.",
  "Property type.",
  "Unit count.",
] as const;

const directoryColumns = [
  "Property name, type, and address.",
  "Unit count and occupancy percentage.",
  "Monthly rent and overdue balance.",
  "Leases expiring in the next 90 days.",
  "Open maintenance ticket count.",
  "Property status and row actions.",
] as const;

const filters = [
  "Property.",
  "City.",
  "State.",
  "Zip code.",
  "Status.",
  "Minimum number of units.",
  "Has open maintenance requests.",
  "View archived properties only.",
] as const;

const detailSections = [
  ["Summary Header", "Shows the property name, status, type, address, and an Edit property action."],
  ["Key Metrics", "Summarizes total units, occupied units, vacancy, occupancy percentage, monthly rent, active leases, open tickets, and leases expiring within 90 days."],
  ["Units", "Shows unit cards with occupied or vacant state and the assigned tenant where lease data exists."],
  ["Leases", "Shows unit, tenant, dates, status, monthly rent, overdue balance, email, and phone when available."],
  ["Property Contact", "Shows contact name, email, phone, and address if contact information was added."],
  ["Maintenance", "Lists tickets attached to the property, including title, status, priority, and due date where available."],
  ["Financials", "Summarizes gross scheduled rent, overdue balance, leases expiring within 90 days, estimated vacancy loss, and owner distribution."],
] as const;

const currentScope = [
  "Portfolio dashboard.",
  "Property creation and editing.",
  "Property directory search and filters.",
  "Property archive and delete actions.",
  "Property notes.",
  "Property detail review.",
  "Unit, lease, maintenance, and financial summaries when data exists.",
  "Sidebar collapse preference.",
  "Light, dark, and system theme preference.",
] as const;

export default function DocsHome() {
  return (
    <main className="docs-shell">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} />
        <nav>
          {guideLinks.map(([label, heading]) => (
            <a href={`#${heading.toLowerCase().replaceAll(" ", "-")}`} key={label}>
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <article className="docs-article">
        <h1>Parcelis Platform User Guide</h1>
        <p>
          Parcelis helps property teams manage a portfolio from a single workspace. This guide is written for day-to-day operators,
          property managers, leasing coordinators, maintenance coordinators, and owners.
        </p>

        <h2>Core Concepts</h2>
        <div className="docs-card-grid">
          {coreConcepts.map(([title, body]) => (
            <section key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </section>
          ))}
        </div>

        <h2 id="start-from-the-portfolio-dashboard">Start From The Portfolio Dashboard</h2>
        <p>The Portfolio dashboard is the default landing page. Use it to quickly understand the current operating picture.</p>
        <ul>
          {dashboardItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <ol>
          <li>Select <strong>Add property</strong> to create a new property.</li>
          <li>Select <strong>View properties</strong> to open the full property directory.</li>
          <li>Select a property name in the snapshot table to open its detail page.</li>
          <li>Use the sidebar to move between Portfolio and Properties.</li>
        </ol>

        <h2 id="add-a-property">Add A Property</h2>
        <p>Use the property drawer when onboarding a new property.</p>
        <ul>
          {propertyFields.map((field) => (
            <li key={field}>{field}</li>
          ))}
        </ul>
        <ol>
          <li>Select <strong>Property</strong> or <strong>Add property</strong>.</li>
          <li>Enter the property address, property name, property type, and number of units.</li>
          <li>Expand <strong>Property Contact Info</strong> if contact details should be stored with the property.</li>
          <li>Select <strong>Next</strong> to save the property.</li>
        </ol>
        <p>
          State fields are stored as two-letter uppercase regions. If you close the drawer after making changes, Parcelis asks you
          to confirm before discarding unsaved work.
        </p>

        <h2 id="use-the-property-directory">Use The Property Directory</h2>
        <p>The Properties page is the main operating list for the portfolio.</p>
        <ul>
          {directoryColumns.map((column) => (
            <li key={column}>{column}</li>
          ))}
        </ul>
        <p>Use search to find properties by name, city, state, property type, or status. Select <strong>Filters</strong> to narrow the directory.</p>
        <ul>
          {filters.map((filter) => (
            <li key={filter}>{filter}</li>
          ))}
        </ul>
        <p>
          Select <strong>Apply Filters</strong> to update the list or <strong>Clear Filters</strong> to reset it. When filters are
          active, the Filters button shows the active filter count. For multi-unit properties, select the expand control next to
          the property name to review unit-level occupancy, rent, overdue balance, lease expiration status, maintenance ticket
          count, and current status.
        </p>

        <h2 id="manage-a-property">Manage A Property</h2>
        <p>Each property row includes an overflow actions menu.</p>
        <ul>
          <li><strong>Edit</strong> updates property details, address, unit count, type, or contact information.</li>
          <li><strong>Add Notes</strong> saves internal property notes for operational context.</li>
          <li><strong>Archive</strong> hides a property from the default property list without permanently deleting it. This action is unavailable for properties that are already archived.</li>
          <li><strong>Delete</strong> permanently removes a property after confirmation.</li>
        </ul>

        <h2 id="review-a-property-detail-page">Review A Property Detail Page</h2>
        <p>Open a property detail page from the portfolio snapshot or property directory.</p>
        <div className="docs-card-grid">
          {detailSections.map(([title, body]) => (
            <section key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </section>
          ))}
        </div>

        <h2>Navigation And Preferences</h2>
        <p>
          The sidebar includes Portfolio, Properties, Leases, Tenants, Maintenance, Accounting, and Settings. Portfolio and
          Properties are active areas in the current app. The other sidebar items are visible as planned product areas.
        </p>
        <p>
          Use the sidebar collapse control to make navigation narrower. Use the theme controls to switch between light, dark, and
          system modes. When the sidebar is expanded, the dark mode switcher shows separate light, dark, and system controls. When
          the sidebar is collapsed, select the theme icon to cycle through the modes. Parcelis remembers these preferences in the browser.
        </p>

        <h2 id="keyboard-shortcuts">Keyboard Shortcuts</h2>
        <ul>
          <li><code>Cmd+Shift+P</code> or <code>Ctrl+Shift+P</code>: open the property drawer.</li>
          <li><code>/</code>: focus property search on the Properties page.</li>
          <li><code>Cmd+Enter</code> or <code>Ctrl+Enter</code>: submit the property drawer when all required fields are valid.</li>
        </ul>

        <h2>Current Product Scope</h2>
        <ul>
          {currentScope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>README-Friendly Summary</h2>
        <p>
          Parcelis is an open-source property management platform for boutique operators. End users can track a portfolio, add and
          edit properties, search and filter the property directory, review unit and lease summaries, monitor maintenance
          indicators, and inspect property-level financials from a clean operational workspace.
        </p>
      </article>
    </main>
  );
}
