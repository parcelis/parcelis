import * as React from "react";

type PageRailProps = {
  children?: React.ReactNode;
  description: React.ReactNode;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
};

export function PageRail({ children, description, eyebrow, title }: PageRailProps) {
  return (
    <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">{eyebrow}</p>
        <h1 className="mt-5 text-3xl font-bold md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{description}</p>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </section>
  );
}
