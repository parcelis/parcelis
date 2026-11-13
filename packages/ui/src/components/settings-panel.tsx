"use client";

import { useId, useRef, useState } from "react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { Bell, Clock, MessageCircle, Plus, Settings, ShieldCheck, X } from "lucide-react";

import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Select } from "./select";
import { Switch } from "./switch";
import { Textarea } from "./textarea";

const panels = {
  general: { title: "General", description: "Manage workspace identity and regional preferences.", icon: Settings },
  office: { title: "Office hours", description: "Set your team’s availability and expected reply times.", icon: Clock },
  security: {
    title: "Security",
    description: "Manage sign-in, sessions, and access to your workspace.",
    icon: ShieldCheck,
  },
  preset: {
    title: "Preset",
    description: "Customize the chat widget customers see on your site.",
    icon: MessageCircle,
  },
  notifications: {
    title: "Notifications",
    description: "Choose which alerts you receive and where they appear.",
    icon: Bell,
  },
};

export type SettingsSection = keyof typeof panels;

const groups: { label: string; sections: SettingsSection[] }[] = [
  { label: "Workspace", sections: ["general", "office", "security"] },
  { label: "Channels", sections: ["preset"] },
  { label: "Personal", sections: ["notifications"] },
];

const events = [
  { key: "assignment", label: "Conversation assigned to you", hint: "A teammate assigns you a conversation." },
  { key: "reply", label: "New reply", hint: "A customer replies to a conversation you own." },
  { key: "mention", label: "Mentions", hint: "Someone mentions you in an internal note." },
  { key: "ticket", label: "Ticket assigned", hint: "A ticket is assigned to you." },
  { key: "due", label: "Due soon", hint: "A conversation or ticket is nearing its deadline." },
  { key: "summary", label: "Daily summary", hint: "A daily digest of your queue." },
] as const;

type AlertPreferences = Record<(typeof events)[number]["key"], boolean>;
type Hours = { id: number; days: string; start: string; end: string };

const defaults = {
  general: {
    workspaceName: "Acme Support",
    customerName: "",
    supportEmail: "support@example.com",
    timezone: "UTC",
    language: "Français",
    dateFormat: "MM/DD/YYYY",
  },
  office: {
    enabled: true,
    timezone: "UTC",
    hours: [
      { id: 1, days: "Mon – Fri", start: "09:00", end: "18:00" },
      { id: 2, days: "Sat – Sun", start: "10:00", end: "14:00" },
    ] as Hours[],
  },
  security: {
    password: true,
    twoFactor: false,
    google: true,
    saml: false,
    contact: "security@example.com",
    session: "24 hours",
    workspaceRestricted: false,
    workspaceIPs: "",
    apiRestricted: false,
    apiIPs: "",
  },
  preset: {
    button: "Ask a question",
    introduction: "Hi! How can we help?",
    color: "#0b6e6e",
    theme: "Match system",
    icon: "Chat bubble",
    shape: "Round",
    size: "Medium",
    position: "Bottom right",
    side: "20",
    bottom: "20",
  },
  notifications: {
    quiet: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    email: {
      assignment: true,
      reply: false,
      mention: true,
      ticket: true,
      due: false,
      summary: true,
    } as AlertPreferences,
    inApp: {
      assignment: true,
      reply: true,
      mention: true,
      ticket: true,
      due: true,
      summary: false,
    } as AlertPreferences,
  },
};

export type SettingsValues = typeof defaults;

type SettingsPanelProps = {
  initialValues?: SettingsValues;
  onSave?: (values: SettingsValues, section: SettingsSection) => void | Promise<void>;
};

const timezones = [
  "UTC",
  ...(Intl.supportedValuesOf?.("timeZone") ?? ["America/Chicago", "Europe/Paris", "Asia/Tokyo"]),
];
const dayOptions = [
  "Mon – Fri",
  "Sat – Sun",
  "Every day",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-parcelis-border bg-white p-5 text-parcelis-charcoal sm:p-6 lg:flex-row [&>div]:lg:flex-1 lg:gap-6">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-2 max-w-xs text-sm text-parcelis-gray">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string, descriptionId?: string) => ReactNode;
}) {
  const id = useId();
  const descriptionId = hint ? id + "-hint" : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id, descriptionId)}
      {hint && (
        <p id={descriptionId} className="text-xs text-parcelis-gray">
          {hint}
        </p>
      )}
    </div>
  );
}

function TextField({
  label,
  hint,
  onValue,
  ...props
}: Omit<ComponentProps<typeof Input>, "id" | "onChange"> & {
  label: string;
  hint?: string;
  onValue: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id, descriptionId) => (
        <Input {...props} id={id} aria-describedby={descriptionId} onChange={(event) => onValue(event.target.value)} />
      )}
    </Field>
  );
}

function Choice({
  label,
  value,
  options,
  onValue,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onValue: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Select
          id={id}
          className="w-full"
          value={value}
          disabled={disabled}
          onChange={(event) => onValue(event.target.value)}
        >
          {!options.includes(value) && <option value={value}>{value}</option>}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onValue,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onValue: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label id={id + "-label"} htmlFor={id}>
          {label}
        </Label>
        {hint && (
          <p id={id + "-hint"} className="text-xs text-parcelis-gray">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        aria-labelledby={id + "-label"}
        aria-describedby={hint ? id + "-hint" : undefined}
        checked={checked}
        onCheckedChange={onValue}
      />
    </div>
  );
}

type Update<T> = (patch: Partial<T>) => void;
type PanelProps<K extends SettingsSection> = {
  value: SettingsValues[K];
  update: Update<SettingsValues[K]>;
};

function GeneralPanel({ value, update }: PanelProps<"general">) {
  return (
    <>
      <SettingsCard title="Workspace" description="Choose how your workspace appears to customers.">
        <TextField
          label="Workspace name"
          value={value.workspaceName}
          required
          onValue={(workspaceName) => update({ workspaceName })}
        />
        <TextField
          label="Customer-facing name"
          value={value.customerName}
          placeholder="Same as workspace name"
          hint="Customers see this name in messages and emails. Leave it blank to use the workspace name."
          onValue={(customerName) => update({ customerName })}
        />
        <TextField
          label="Support email"
          type="email"
          value={value.supportEmail}
          placeholder="support@example.com"
          hint="Replies to outgoing support emails go to this address."
          onValue={(supportEmail) => update({ supportEmail })}
        />
      </SettingsCard>
      <SettingsCard title="Localization" description="Set regional defaults for the workspace.">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap [&>div]:sm:min-w-0 [&>div]:sm:flex-1 [&>div]:sm:basis-2/5">
          <Choice
            label="Time zone"
            value={value.timezone}
            options={timezones}
            onValue={(timezone) => update({ timezone })}
          />
          <Choice
            label="Default language"
            value={value.language}
            options={["English", "Français", "Español", "Deutsch", "Italiano", "Português"]}
            onValue={(language) => update({ language })}
          />
        </div>
        <Choice
          label="Date format"
          value={value.dateFormat}
          options={["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]}
          onValue={(dateFormat) => update({ dateFormat })}
        />
      </SettingsCard>
    </>
  );
}

function OfficePanel({ value, update }: PanelProps<"office">) {
  function editHours(id: number, patch: Partial<Hours>) {
    update({ hours: value.hours.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  }

  function addHours() {
    const id = Math.max(0, ...value.hours.map((row) => row.id)) + 1;
    update({ hours: [...value.hours, { id, days: "Mon – Fri", start: "09:00", end: "17:00" }] });
  }

  return (
    <SettingsCard title="Default office hours" description="Let customers know when your team is available.">
      <Toggle
        label="Set office hours"
        hint="Turn this off to show your team as available at all times."
        checked={value.enabled}
        onValue={(enabled) => update({ enabled })}
      />
      {value.enabled && (
        <>
          <Choice
            label="Time zone"
            value={value.timezone}
            options={timezones}
            onValue={(timezone) => update({ timezone })}
          />
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Hours</legend>
            {value.hours.map((row, index) => (
              <div
                key={row.id}
                role="group"
                aria-label={`Hours range ${index + 1}`}
                className="flex flex-wrap items-end gap-2 rounded-lg border p-3 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:basis-2/5 2xl:flex-nowrap 2xl:border-0 2xl:p-0 2xl:[&>div]:basis-0"
              >
                <Choice
                  label="Days"
                  value={row.days}
                  options={dayOptions}
                  onValue={(days) => editHours(row.id, { days })}
                />
                <TextField
                  label="Start time"
                  type="time"
                  value={row.start}
                  required
                  onValue={(start) => editHours(row.id, { start })}
                />
                <TextField
                  label="End time"
                  type="time"
                  value={row.end}
                  required
                  onValue={(end) => editHours(row.id, { end })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="size-10 shrink-0 p-0"
                  aria-label={`Remove hours range ${index + 1}`}
                  onClick={() => update({ hours: value.hours.filter(({ id }) => id !== row.id) })}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addHours}>
              <Plus aria-hidden="true" /> Add hours
            </Button>
          </fieldset>
        </>
      )}
    </SettingsCard>
  );
}

function SecurityPanel({ value, update }: PanelProps<"security">) {
  const methods = [
    ["password", "Email and password", "Allow teammates to sign in with an email address and password."],
    ["twoFactor", "Require two-factor authentication", "Require teammates to set up a second authentication factor."],
    ["google", "Google sign-in", "Allow teammates to sign in with their workspace Google account."],
    ["saml", "SAML single sign-on", "Allow teammates to use your organization’s identity provider."],
  ] as const;

  const restrictions = [
    {
      title: "Workspace access restrictions",
      description: "Limit workspace sign-in to approved IP addresses.",
      toggle: "workspaceRestricted",
      addresses: "workspaceIPs",
      label: "Allowed workspace IPs",
    },
    {
      title: "REST API access restrictions",
      description: "Limit REST API requests to approved IP addresses.",
      toggle: "apiRestricted",
      addresses: "apiIPs",
      label: "Allowed REST API IPs",
    },
  ] as const;

  return (
    <>
      <SettingsCard title="Authentication methods" description="Choose how teammates authenticate to the workspace.">
        {methods.map(([key, label, hint]) => (
          <Toggle
            key={key}
            label={label}
            hint={hint}
            checked={value[key]}
            onValue={(checked) => update({ [key]: checked })}
          />
        ))}
      </SettingsCard>
      <SettingsCard title="Security contact" description="Choose a shared address for security incident notifications.">
        <TextField label="Email" type="email" value={value.contact} onValue={(contact) => update({ contact })} />
      </SettingsCard>
      <SettingsCard title="Teammate sessions" description="Set when teammates must sign in again.">
        <Choice
          label="Session length"
          value={value.session}
          options={["1 hour", "8 hours", "24 hours", "7 days", "30 days"]}
          onValue={(session) => update({ session })}
        />
      </SettingsCard>
      {restrictions.map(({ title, description, toggle, addresses, label }) => (
        <SettingsCard key={toggle} title={title} description={description}>
          <Toggle
            label="Restrict access by IP"
            checked={value[toggle]}
            onValue={(checked) => update({ [toggle]: checked })}
          />
          <Field label={label} hint="Separate IP addresses and CIDR ranges with commas.">
            {(id, descriptionId) => (
              <Textarea
                id={id}
                aria-describedby={descriptionId}
                disabled={!value[toggle]}
                required={value[toggle]}
                value={value[addresses]}
                onChange={(event) => update({ [addresses]: event.target.value })}
              />
            )}
          </Field>
        </SettingsCard>
      ))}
    </>
  );
}

function PresetPanel({ value, update }: PanelProps<"preset">) {
  return (
    <>
      <SettingsCard title="Start conversation" description="Choose the label that starts a new chat.">
        <Choice
          label="Button text"
          value={value.button}
          options={["Ask a question", "Start a conversation", "Send us a message"]}
          onValue={(button) => update({ button })}
        />
      </SettingsCard>
      <SettingsCard title="Team introduction" description="Welcome visitors when they open the widget.">
        <Field label="Introduction">
          {(id) => (
            <Textarea
              id={id}
              value={value.introduction}
              onChange={(event) => update({ introduction: event.target.value })}
            />
          )}
        </Field>
      </SettingsCard>
      <SettingsCard title="Theme & branding" description="Set the widget’s primary color and appearance.">
        <div className="flex items-end gap-2">
          <Input
            type="color"
            aria-label="Choose primary color"
            className="w-12 shrink-0 px-1"
            value={/^#[\da-f]{6}$/i.test(value.color) ? value.color : defaults.preset.color}
            onChange={(event) => update({ color: event.target.value })}
          />
          <TextField
            label="Primary color"
            value={value.color}
            pattern="#[0-9A-Fa-f]{6}"
            required
            title="Enter a six-digit hex color such as #0b6e6e"
            onValue={(color) => update({ color })}
          />
        </div>
        <Choice
          label="Theme"
          value={value.theme}
          options={["Match system", "Light", "Dark"]}
          onValue={(theme) => update({ theme })}
        />
      </SettingsCard>
      <SettingsCard title="Launcher" description="Configure the floating button that opens the widget.">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap [&>div]:sm:min-w-0 [&>div]:sm:flex-1 [&>div]:sm:basis-2/5">
          <Choice
            label="Icon"
            value={value.icon}
            options={["Chat bubble", "Message square", "Help circle"]}
            onValue={(icon) => update({ icon })}
          />
          <Choice
            label="Shape"
            value={value.shape}
            options={["Round", "Rounded square"]}
            onValue={(shape) => update({ shape })}
          />
          <Choice
            label="Size"
            value={value.size}
            options={["Small", "Medium", "Large"]}
            onValue={(size) => update({ size })}
          />
          <Choice
            label="Position"
            value={value.position}
            options={["Bottom right", "Bottom left"]}
            onValue={(position) => update({ position })}
          />
          <TextField
            label="Side spacing (px)"
            type="number"
            min={0}
            required
            value={value.side}
            onValue={(side) => update({ side })}
          />
          <TextField
            label="Bottom spacing (px)"
            type="number"
            min={0}
            required
            value={value.bottom}
            onValue={(bottom) => update({ bottom })}
          />
        </div>
      </SettingsCard>
    </>
  );
}

function NotificationsPanel({ value, update }: PanelProps<"notifications">) {
  const channels = [
    { key: "email", title: "Email notifications", description: "Send alerts to your workspace email." },
    { key: "inApp", title: "In-app notifications", description: "Show alerts while you’re signed in." },
  ] as const;

  return (
    <>
      <SettingsCard title="Do not disturb" description="Pause notifications during a daily quiet period.">
        <Toggle
          label="Mute notifications during quiet hours"
          checked={value.quiet}
          onValue={(quiet) => update({ quiet })}
        />
        {value.quiet && (
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap [&>div]:sm:min-w-0 [&>div]:sm:flex-1 [&>div]:sm:basis-2/5">
            <TextField
              label="Start time"
              type="time"
              required
              value={value.quietStart}
              onValue={(quietStart) => update({ quietStart })}
            />
            <TextField
              label="End time"
              type="time"
              required
              value={value.quietEnd}
              onValue={(quietEnd) => update({ quietEnd })}
            />
          </div>
        )}
      </SettingsCard>
      {channels.map(({ key, title, description }) => (
        <SettingsCard key={key} title={title} description={description}>
          {events.map((item) => (
            <Toggle
              key={item.key}
              label={item.label}
              hint={item.hint}
              checked={value[key][item.key]}
              onValue={(enabled) => update({ [key]: { ...value[key], [item.key]: enabled } })}
            />
          ))}
        </SettingsCard>
      ))}
    </>
  );
}

function SettingsFormPanel({ initialValues = defaults, onSave }: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [values, setValues] = useState(initialValues);
  const saved = useRef(initialValues);
  const saving = useRef(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const headingId = useId();

  function navigate(next: SettingsSection) {
    setSection(next);
    setStatus("idle");
  }

  function update<K extends SettingsSection>(key: K, patch: Partial<SettingsValues[K]>) {
    setValues((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    setStatus("idle");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;

    saving.current = true;
    setStatus("saving");
    const snapshot = { ...saved.current, [section]: values[section] };
    try {
      await onSave?.(snapshot, section);
      saved.current = snapshot;
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      saving.current = false;
    }
  }

  const { title, description } = panels[section];
  const isSaving = status === "saving";

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-[1200px] overflow-hidden rounded-2xl border bg-background text-foreground shadow-sm"
    >
      <h1 id={headingId} className="border-b px-6 py-4 text-lg font-semibold">
        Settings
      </h1>
      <div className="flex flex-col md:flex-row [&>div:first-child]:md:w-1/5 [&>div:first-child]:md:min-w-40 [&>div:last-child]:flex-1">
        <div className="min-w-0 border-b p-3 md:border-r md:border-b-0">
          <div className="md:hidden">
            <Choice
              label="Settings section"
              value={title}
              disabled={isSaving}
              options={Object.values(panels).map((panel) => panel.title)}
              onValue={(selected) => {
                const entry = groups.flatMap((group) => group.sections).find((key) => panels[key].title === selected);
                if (entry) navigate(entry);
              }}
            />
          </div>
          <nav aria-label="Settings sections" className="hidden flex-col gap-5 md:flex">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <p className="px-3 pb-1 text-xs font-medium uppercase text-parcelis-gray">{group.label}</p>
                {group.sections.map((key) => {
                  const Icon = panels[key].icon;
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant="ghost"
                      disabled={isSaving}
                      aria-current={section === key ? "page" : undefined}
                      className={`w-full justify-start gap-2 px-3 ${section === key ? "bg-parcelis-green/20 text-parcelis-charcoal" : "text-parcelis-gray"}`}
                      onClick={() => navigate(key)}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {panels[key].title}
                    </Button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <div className="min-w-0">
          <header className="border-b px-6 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-parcelis-gray">{description}</p>
          </header>
          <form onSubmit={submit} aria-label={`${title} settings`} aria-busy={isSaving}>
            <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
              {section === "general" && (
                <GeneralPanel value={values.general} update={(patch) => update("general", patch)} />
              )}
              {section === "office" && (
                <OfficePanel value={values.office} update={(patch) => update("office", patch)} />
              )}
              {section === "security" && (
                <SecurityPanel value={values.security} update={(patch) => update("security", patch)} />
              )}
              {section === "preset" && (
                <PresetPanel value={values.preset} update={(patch) => update("preset", patch)} />
              )}
              {section === "notifications" && (
                <NotificationsPanel value={values.notifications} update={(patch) => update("notifications", patch)} />
              )}
            </fieldset>
            <footer className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-4 sm:px-6">
              <p
                role="status"
                className={`text-sm ${status === "error" ? "text-red-700" : "text-parcelis-gray"}`}
              >
                {status === "saved" && (onSave ? "Changes saved." : "Changes applied for this session.")}
                {status === "error" && "Couldn’t save changes. Try again."}
              </p>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </footer>
          </form>
        </div>
      </div>
    </section>
  );
}

type SettingsPanelLayoutProps = {
  children: ReactNode;
  header: ReactNode;
  navigation: ReactNode;
  className?: string;
};

export function SettingsPanel(props: SettingsPanelProps | SettingsPanelLayoutProps) {
  if (!("navigation" in props)) return <SettingsFormPanel {...props} />;

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-parcelis-border bg-white text-parcelis-charcoal shadow-sm ${props.className ?? ""}`}
    >
      <p className="border-b border-parcelis-border px-6 py-4 text-lg font-semibold">Settings</p>
      <div className="flex min-w-0 flex-col md:flex-row">
        <aside
          className="w-full shrink-0 border-b border-parcelis-border p-3 md:w-60 md:border-b-0 md:border-r"
          aria-label="Settings sections"
        >
          {props.navigation}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="border-b border-parcelis-border bg-parcelis-charcoal p-6 text-white">
            {props.header}
          </div>
          <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">{props.children}</div>
        </div>
      </div>
    </section>
  );
}

export function SettingsPanelHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/75">{description}</p>
      </div>
      {children}
    </header>
  );
}

export function SettingsPanelGroup({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold uppercase text-parcelis-gray">
        {title}
      </div>
      {children}
    </div>
  );
}

export default SettingsPanel;
