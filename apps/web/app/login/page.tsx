"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Layers3, LockKeyhole, LockOpen, Mail, Moon, Sun, UsersRound } from "lucide-react";
import * as React from "react";
import { Button, Input } from "@parcelis/ui";
import { useTheme } from "../../components/theme-provider";
import { apiClient } from "../../components/api-client";

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
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [destination, setDestination] = React.useState("/");
  const { resolvedMode, setMode } = useTheme();
  const router = useRouter();

  React.useEffect(() => {
    const nextPath = new URLSearchParams(window.location.search).get("next");
    if (nextPath?.startsWith("/") && !nextPath.startsWith("//") && !nextPath.includes("\\")) {
      setDestination(nextPath);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegistering) {
        await apiClient.auth.register.mutate(input);
      } else {
        await apiClient.auth.login.mutate(input);
      }
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-parcelis-porcelain text-parcelis-charcoal dark:bg-[#071b2f] dark:text-white">
      <div className="absolute inset-0 bg-[url('/brand/parcelis-light-background.svg')] bg-cover bg-center dark:bg-[url('/brand/parcelis-dark-background.svg')]" />
      <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-white/55 to-white/30 dark:from-[#041220]/80 dark:via-[#041220]/55 dark:to-[#041220]/30" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 py-4 sm:px-10 lg:px-12">
        <header className="flex shrink-0 items-center justify-end lg:justify-between">
          <Image
            alt="Parcelis"
            className="hidden h-auto w-56 lg:block dark:hidden"
            height={159}
            src="/brand/parcelis-light-banner.png"
            width={488}
          />
          <Image
            alt="Parcelis"
            className="hidden h-auto w-56 lg:dark:block"
            height={159}
            src="/brand/parcelis-dark-banner.png"
            width={488}
          />
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md border border-parcelis-charcoal/20 bg-white/50 text-parcelis-charcoal transition hover:bg-white/80 dark:border-white/25 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            type="button"
            aria-label={resolvedMode === "dark" ? "Use light theme" : "Use dark theme"}
            onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
          >
            {resolvedMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
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
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-parcelis-charcoal/90 dark:text-white/95">
              Parcelis is the modern, open-source platform for property management.
            </p>
            <ul className="mt-14 flex list-none flex-col gap-6 p-0">
              {benefits.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-4">
                  <Icon aria-hidden="true" className="h-8 w-8 shrink-0 stroke-parcelis-green stroke-[1.6]" />
                  <div>
                    <h2 className="m-0 text-base font-semibold">{title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-parcelis-gray dark:text-white/80">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="w-full max-w-[33rem] flex-[0_1_33rem] rounded-xl border border-white/55 bg-white/[.98] p-6 text-parcelis-charcoal shadow-2xl dark:border-parcelis-border dark:bg-parcelis-slate dark:text-parcelis-porcelain"
            aria-labelledby="sign-in-title"
          >
            <Image
              alt="Parcelis"
              className="mx-auto mb-6 h-auto w-full max-w-[12rem] dark:hidden"
              height={159}
              src="/brand/parcelis-light-banner.png"
              width={488}
            />
            <Image
              alt="Parcelis"
              className="mx-auto mb-6 hidden h-auto w-full max-w-[12rem] dark:block"
              height={159}
              src="/brand/parcelis-dark-banner.png"
              width={488}
            />
            <div className="text-center">
              <h2 id="sign-in-title" className="m-0 text-2xl font-semibold tracking-[-0.035em]">
                Welcome back
              </h2>
              <p className="mb-9 mt-2 text-sm text-parcelis-gray">
                {isRegistering ? "Create an account to get started" : "Sign in to access your account"}
              </p>
            </div>
            <form onSubmit={handleSubmit}>
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
              <div className="mt-6">
                <label className="mb-0 block text-sm font-semibold" htmlFor="password">
                  Password
                </label>
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-parcelis-gray"
                />
                <Input
                  className="h-12 pl-11 pr-12 text-[.94rem]"
                  id="password"
                  minLength={12}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
                <button
                  className="absolute right-0 top-0 flex h-full w-12 items-center justify-center border-0 bg-transparent text-parcelis-gray"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error ? (
                <p className="mt-4 text-sm text-red-700 dark:text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
              <Button className="mt-6 w-full text-white" disabled={isSubmitting} size="lg" type="submit">
                {isSubmitting ? "Please wait…" : isRegistering ? "Create account" : "Sign in"}
              </Button>
            </form>
            <p className="mb-0 mt-10 text-center text-sm text-parcelis-gray">
              {isRegistering ? "Already have an account?" : "New to Parcelis?"}{" "}
              <button
                className="text-xs font-semibold text-parcelis-green-hover"
                type="button"
                onClick={() => {
                  setError(null);
                  setIsRegistering((value) => !value);
                }}
              >
                {isRegistering ? "Sign in" : "Create account"}
              </button>
            </p>
          </section>
        </div>
        <footer className="mt-4 w-full max-w-[33rem] self-end text-center text-xs text-parcelis-gray dark:text-white/70">
          © 2026 <span className="text-parcelis-green">Parcelis.</span> Open source. Open future.
        </footer>
      </div>
    </main>
  );
}
