"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Layers3, LockKeyhole, LockOpen, Mail, UsersRound } from "lucide-react";
import * as React from "react";
import { flushSync } from "react-dom";
import { Button, Input } from "@parcelis/ui";
import { apiClient } from "../../components/api-client";
import { ThemeSelector } from "../../components/theme-selector";

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

type LoginMode = "sign-in" | "register" | "forgot-password" | "reset-password";

export default function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [loginMode, setLoginMode] = React.useState<LoginMode>("sign-in");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoadingApp, setIsLoadingApp] = React.useState(false);
  const [isPasswordResetRequested, setIsPasswordResetRequested] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [passwordConfirmationError, setPasswordConfirmationError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [resetToken, setResetToken] = React.useState<string | null>(null);
  const [destination, setDestination] = React.useState("/");
  const router = useRouter();
  const passwordConfirmationErrorId = React.useId();

  React.useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const nextPath = searchParams.get("next");
    if (nextPath?.startsWith("/") && !nextPath.startsWith("//") && !nextPath.includes("\\")) {
      setDestination(nextPath);
    }

    if (searchParams.get("mode") === "reset") {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
      setLoginMode("reset-password");
      setResetToken(token);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const isRegistering = loginMode === "register";
  const isSignIn = loginMode === "sign-in";
  const isForgotPassword = loginMode === "forgot-password";
  const isResetPassword = loginMode === "reset-password";

  function selectLoginMode(mode: LoginMode) {
    setLoginMode(mode);
    setError(null);
    setPasswordConfirmationError(null);
    setNotice(null);
    setIsPasswordResetRequested(false);
    setShowPassword(false);
  }

  function returnToSignIn() {
    selectLoginMode("sign-in");
    setResetToken(null);
    router.replace("/login");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setError(null);
    setPasswordConfirmationError(null);
    if (isResetPassword) {
      const password = String(formData.get("password") ?? "");
      const reenterPassword = String(formData.get("reenterPassword") ?? "");
      if (password !== reenterPassword) {
        setPasswordConfirmationError("New passwords do not match.");
        return;
      }
    }
    setIsSubmitting(true);
    try {
      if (isForgotPassword) {
        await apiClient.auth.requestPasswordReset.mutate({ email: String(formData.get("email") ?? "") });
        setIsPasswordResetRequested(true);
        return;
      }

      if (isResetPassword) {
        if (!resetToken) throw new Error("This password reset link is invalid or has expired.");
        await apiClient.auth.resetPassword.mutate({
          password: String(formData.get("password") ?? ""),
          reenterPassword: String(formData.get("reenterPassword") ?? ""),
          token: resetToken,
        });
        selectLoginMode("sign-in");
        setResetToken(null);
        setNotice("Your password has been reset. Sign in with your new password.");
        router.replace("/login");
        return;
      }

      const input = {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      };
      if (isRegistering) await apiClient.auth.register.mutate(input);
      else await apiClient.auth.login.mutate(input);
      flushSync(() => setIsLoadingApp(true));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 5000));
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setIsLoadingApp(false);
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
            height={2500}
            src="/brand/parcelis-fullmark-light.svg"
            width={9792}
          />
          <Image
            alt="Parcelis"
            className="hidden h-auto w-56 lg:dark:block"
            height={2500}
            src="/brand/parcelis-fullmark-dark.svg"
            width={9792}
          />
          <ThemeSelector />
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
              height={2500}
              src="/brand/parcelis-fullmark-light.svg"
              width={9792}
            />
            <Image
              alt="Parcelis"
              className="mx-auto mb-6 hidden h-auto w-full max-w-[12rem] dark:block"
              height={2500}
              src="/brand/parcelis-fullmark-dark.svg"
              width={9792}
            />
            <div className="text-center">
              <h2 id="sign-in-title" className="m-0 text-2xl font-semibold tracking-[-0.035em]">
                {isForgotPassword ? "Reset your password" : isResetPassword ? "Choose a new password" : "Welcome back"}
              </h2>
              <p className="mb-9 mt-2 text-sm text-parcelis-gray">
                {isForgotPassword
                  ? "Enter your email and we’ll send a reset link."
                  : isResetPassword
                    ? "Use a strong password with at least 12 characters."
                    : isRegistering
                      ? "Create an account to get started"
                      : "Sign in to access your account"}
              </p>
            </div>
            {notice ? (
              <p className="mb-6 text-center text-sm text-parcelis-green" role="status">
                {notice}
              </p>
            ) : null}
            {isPasswordResetRequested ? (
              <div className="text-center">
                <p className="m-0 text-sm leading-6 text-parcelis-gray">
                  If an account matches that email address, a password reset link will arrive shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {!isResetPassword ? (
                  <>
                    <label className="mb-2 block text-sm font-semibold" htmlFor="email">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-parcelis-gray"
                      />
                      <Input
                        autoComplete="email"
                        className="h-12 pl-11 text-[.94rem]"
                        id="email"
                        name="email"
                        placeholder="you@example.com"
                        required
                        type="email"
                      />
                    </div>
                  </>
                ) : null}
                {!isForgotPassword ? (
                  <>
                    <div className="mt-6">
                      <label className="mb-0 block text-sm font-semibold" htmlFor="password">
                        {isResetPassword ? "New password" : "Password"}
                      </label>
                    </div>
                    <div className="relative">
                      <LockKeyhole
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-parcelis-gray"
                      />
                      <Input
                        autoComplete={isRegistering || isResetPassword ? "new-password" : "current-password"}
                        className="h-12 pl-11 pr-12 text-[.94rem]"
                        id="password"
                        minLength={12}
                        name="password"
                        placeholder={isResetPassword ? "Create a new password" : "Enter your password"}
                        required
                        type={showPassword ? "text" : "password"}
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
                    {isResetPassword ? (
                      <>
                        <label className="mb-2 mt-6 block text-sm font-semibold" htmlFor="reenterPassword">
                          Confirm new password
                        </label>
                        <Input
                          autoComplete="new-password"
                          className="h-12 text-[.94rem]"
                          id="reenterPassword"
                          aria-describedby={passwordConfirmationError ? passwordConfirmationErrorId : undefined}
                          aria-invalid={passwordConfirmationError ? true : undefined}
                          minLength={12}
                          name="reenterPassword"
                          onChange={() => setPasswordConfirmationError(null)}
                          placeholder="Re-enter your new password"
                          required
                          type={showPassword ? "text" : "password"}
                        />
                        {passwordConfirmationError ? (
                          <p className="mt-2 text-sm text-red-700 dark:text-red-300" id={passwordConfirmationErrorId} role="alert">
                            {passwordConfirmationError}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
                {error ? (
                  <p className="mt-4 text-sm text-red-700 dark:text-red-300" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button className="mt-6 w-full text-white" disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting
                    ? "Please wait…"
                    : isForgotPassword
                      ? "Send reset link"
                      : isResetPassword
                        ? "Reset password"
                        : isRegistering
                          ? "Create account"
                          : "Sign in"}
                </Button>
                {isSignIn ? (
                  <button
                    className="mt-4 w-full text-center text-xs font-semibold text-parcelis-green-hover"
                    type="button"
                    onClick={() => selectLoginMode("forgot-password")}
                  >
                    Forgot your password?
                  </button>
                ) : null}
              </form>
            )}
            {isForgotPassword || isResetPassword ? (
              <p className="mb-0 mt-10 text-center text-sm text-parcelis-gray">
                <button
                  className="text-xs font-semibold text-parcelis-green-hover"
                  disabled={isSubmitting}
                  type="button"
                  onClick={returnToSignIn}
                >
                  Back to sign in
                </button>
              </p>
            ) : (
              <p className="mb-0 mt-10 text-center text-sm text-parcelis-gray">
                {isRegistering ? "Already have an account?" : "New to Parcelis?"}{" "}
                <button
                  className="text-xs font-semibold text-parcelis-green-hover"
                  type="button"
                  onClick={() => selectLoginMode(isRegistering ? "sign-in" : "register")}
                >
                  {isRegistering ? "Sign in" : "Create account"}
                </button>
              </p>
            )}
          </section>
        </div>
        <footer className="mt-4 w-full max-w-[33rem] self-end text-center text-xs text-parcelis-gray dark:text-white/70">
          © 2026 <span className="text-parcelis-green">Parcelis.</span> Open source. Open future.
        </footer>
      </div>
      {isLoadingApp ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-parcelis-porcelain text-parcelis-charcoal dark:bg-[#071b2f] dark:text-white"
          role="status"
        >
          <div className="absolute inset-0 bg-[url('/brand/parcelis-light-background.svg')] bg-cover bg-center dark:bg-[url('/brand/parcelis-dark-background.svg')]" />
          <div className="absolute inset-0 bg-white/80 dark:bg-[#041220]/80" />
          <div className="relative flex flex-col items-center px-6 text-center">
            <Image
              alt=""
              aria-hidden="true"
              className="h-64 w-auto sm:h-80 dark:hidden"
              height={320}
              src="/brand/parcelis-fullmark-reveal-light.svg"
              unoptimized
              width={226}
            />
            <Image
              alt=""
              aria-hidden="true"
              className="hidden h-64 w-auto sm:h-80 dark:block"
              height={320}
              src="/brand/parcelis-fullmark-reveal-dark.svg"
              unoptimized
              width={226}
            />
            <p className="mt-8 text-lg font-medium text-parcelis-gray dark:text-white/80">Preparing your workspace…</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
