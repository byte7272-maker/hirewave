import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "@/pages/auth/components/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { setTokens } from "@/lib/tokens";
import { signInWithGoogle } from "@/lib/auth";
import { takeReturnTo } from "@/lib/session";
import { useBranding } from "@/hooks/useBranding";

interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const justRegistered = Boolean(
    (location.state as { registered?: boolean } | null)?.registered
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      setTokens(data.access_token, data.refresh_token);
      navigate(destination(), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Where to land after signing in: the page the session expired on (carried as
   * `?returnTo=`), or one remembered locally, else the dashboard.
   */
  function destination(): string {
    const remembered = searchParams.get("returnTo") ?? takeReturnTo() ?? "";
    if (remembered.startsWith("/") && !remembered.startsWith("//")) return remembered;
    return "/dashboard";
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigate(destination(), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        const code = (err as { code?: string })?.code ?? "";
        if (!code.includes("popup-closed") && !code.includes("cancelled")) {
          setError("Google sign-in failed. Please try again.");
        }
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up right where you left off."
      footer={
        branding?.signup_mode === "closed" ? (
          <></>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link
              to="/auth/register"
              className="font-semibold text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap"
            >
              Create one
            </Link>
          </>
        )
      }
    >
      {justRegistered && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-primary-100 text-primary-900 px-4 py-3 text-sm">
          <i className="ri-checkbox-circle-line text-base mt-0.5"></i>
          <span>Account created — sign in below to get started.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground-800 mb-1.5">
            Email
          </label>
          <div className="relative">
            <i className="ri-mail-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-11 pl-9 pr-3 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground-800 mb-1.5">
            Password
          </label>
          <div className="relative">
            <i className="ri-lock-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-11 pl-9 pr-11 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 cursor-pointer"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <i className={`ri-${showPassword ? "eye-off" : "eye"}-line text-base`}></i>
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 h-11 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {loading ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-background-200"></span>
          <span className="text-xs text-foreground-500 whitespace-nowrap">or continue with</span>
          <span className="h-px flex-1 bg-background-200"></span>
        </div>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 h-11 text-sm font-semibold bg-background-50 text-foreground-900 border border-background-300 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {googleLoading ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Connecting…
            </>
          ) : (
            <>
              <i className="ri-google-fill text-base"></i>
              Continue with Google
            </>
          )}
        </button>
      </div>
    </AuthLayout>
  );
}