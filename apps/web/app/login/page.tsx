"use client";

import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Github, LockKeyhole, LockOpen, Mail, UsersRound, Layers3 } from "lucide-react";
import * as React from "react";
import { Button, Input } from "@parcelis/ui";

const benefits = [
  { icon: LockOpen, title: "Open Source", description: "Built transparently. Owned by the community." },
  {
    icon: Layers3,
    title: "All-in-One Platform",
    description: "Manage properties, tenants, leases, payments, and more in one place.",
  },
  {
    icon: UsersRound,
    title: "Built for Everyone",
    description: "Whether you manage one unit or hundreds, Parcelis scales with you.",
  },
];

export default function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#071b2f] text-white">
      <div className="absolute inset-0 bg-[url('/brand/parcelis-background.svg')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#041220]/80 via-[#041220]/55 to-[#041220]/30" />
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[100rem] flex-col px-6 py-10 sm:px-10 lg:px-12">
        <header className="shrink-0">
          <Image
            alt="Parcelis"
            className="h-auto w-56"
            height={159}
            src="/brand/parcelis-dark-banner.png"
            width={488}
          />
        </header>

        <div className="flex flex-1 items-center justify-between gap-8 lg:gap-[7vw]">
          <section className="hidden max-w-xl flex-1 pb-12 lg:block" aria-labelledby="login-page-title">
            <h1
              id="login-page-title"
              className="m-0 text-[clamp(2.4rem,4.2vw,3.7rem)] font-bold leading-[1.04] tracking-[-0.055em]"
            >
              Open-source{" "}
              <span className="block whitespace-nowrap text-[clamp(2.4rem,4.2vw,3.7rem)] text-parcelis-green">
                property management.
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/95">
              Parcelis is the modern, open-source platform for property management.
            </p>
            <ul className="mt-14 grid list-none gap-6 p-0">
              {benefits.map(({ icon: Icon, title, description }) => (
                <li key={title} className="grid grid-cols-[2.55rem_1fr] gap-4">
                  <Icon aria-hidden="true" className="h-8 w-8 stroke-parcelis-green stroke-[1.6]" />
                  <div>
                    <h2 className="m-0 text-base font-semibold">{title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-white/80">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="w-full max-w-[33rem] flex-[0_1_33rem] rounded-xl border border-white/55 bg-white/[.98] p-8 text-parcelis-charcoal shadow-2xl sm:p-10 lg:p-14"
            aria-labelledby="sign-in-title"
          >
            <Image
              alt="Parcelis"
              className="mx-auto mb-10 h-auto w-full max-w-[15.25rem]"
              height={159}
              src="/brand/parcelis-light-banner.png"
              width={488}
            />
            <div className="text-center">
              <h2 id="sign-in-title" className="m-0 text-2xl font-semibold tracking-[-0.035em]">
                Welcome back
              </h2>
              <p className="mb-9 mt-2 text-sm text-parcelis-gray">Sign in to access your account</p>
            </div>
            <form onSubmit={(event) => event.preventDefault()}>
              <label className="mb-2 block text-sm font-semibold" htmlFor="email">
                Email address
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-parcelis-gray"
                />
                <Input
                  className="h-12 pl-11 text-[.94rem]"
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              <div className="mt-6 flex items-center justify-between">
                <label className="mb-0 block text-sm font-semibold" htmlFor="password">
                  Password
                </label>
                <Link className="text-xs font-semibold text-parcelis-green-hover no-underline" href="/forgot-password">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-parcelis-gray"
                />
                <Input
                  className="h-12 pl-11 pr-12 text-[.94rem]"
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
                <button
                  className="absolute right-0 top-0 grid h-full w-12 place-items-center border-0 bg-transparent text-parcelis-gray"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button className="mt-6 w-full text-white" size="lg" type="submit">
                Sign in
              </Button>
            </form>
            <div className="my-7 flex items-center gap-4 text-xs text-parcelis-gray before:h-px before:flex-1 before:bg-parcelis-border after:h-px after:flex-1 after:bg-parcelis-border">
              or
            </div>
            <Button className="w-full" size="lg" type="button" variant="secondary">
              <Github className="h-4 w-4" />
              Sign in with GitHub
            </Button>
            <p className="mb-0 mt-10 text-center text-sm text-parcelis-gray">
              New to Parcelis?{" "}
              <Link className="text-xs font-semibold text-parcelis-green-hover no-underline" href="/">
                Learn more
              </Link>
            </p>
          </section>
        </div>
        <footer className="mt-8 w-full max-w-[33rem] self-end text-center text-xs text-white/70">
          © 2026 <span className="text-parcelis-green">Parcelis.</span> Open source. Open future.
        </footer>
      </div>
    </main>
  );
}
