import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "@/pages/auth/components/AuthLayout";
import { api, ApiError } from "@/lib/api";
import { signInWithGoogle } from "@/lib/auth";
import { useBranding } from "@/hooks/useBranding";

const INVITE_ERROR_MESSAGE =
  "This invite code isn't valid. You need an invite to join right now.";

export default function Register() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [searchParams] = useSearchParams();

  // A shareable invite link (?invite=ABC123) prefills and locks the code so testers
  // land with it already applied — no manual copy/paste needed.
  const urlInvite = (searchParams.get("invite") ?? "").trim();
  const inviteLocked = urlInvite.length > 0;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState(urlInvite);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");

  const signupMode = branding?.signup_mode ?? "open";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setInviteError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, string> = {
        email,
        password,
        full_name: name,
      };
      const code = inviteCode.trim();
      if (code) {
        body.invite_code = code;
      }
      await api("/api/v1/auth/register", {
        method: "POST",
        body,
        auth: false,
      });
      navigate("/auth/login", { state: { registered: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setInviteError(INVITE_ERROR_MESSAGE);
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setInviteError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle(inviteCode.trim() || undefined);
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && signupMode === "invite") {
        setInviteError(INVITE_ERROR_MESSAGE);
      } else if (err instanceof ApiError) {
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

  // Branding still loading — avoid flashing the form before we know the gate.
  if (!branding) {
    return (
      <AuthLayout
        title="Create your account"
        subtitle="Start automating your job search in minutes."
        footer={<></>}
      >
        <div className="flex items-center justify-center py-20">
          <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
        </div>
      </AuthLayout>
    );
  }

  if (signupMode === "closed") {
    return (
      <AuthLayout
        title="Signups are closed"
        subtitle="We're not accepting new accounts right now."
        footer={<></>}
      >
        <div className="flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
          <i className="ri-information-line text-base mt-0.5"></i>
          <span>
            New registrations are currently closed. Please check back later.
          </span>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start automating your job search in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/auth/login"
            className="font-semibold text-primary-600 hover:text-primary-700 cursor-pointer whitespace-nowrap"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground-800 mb-1.5">
            Full name
          </label>
          <div className="relative">
            <i className="ri-user-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Lee"
              className="w-full h-11 pl-9 pr-3 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
            />
          </div>
        </div>

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

        {(signupMode === "invite" || inviteLocked) && (
          <div>
            <label htmlFor="invite_code" className="block text-sm font-medium text-foreground-800 mb-1.5">
              Invite code
            </label>
            {inviteLocked ? (
              <div className="flex items-center gap-3 h-11 px-3 rounded-lg bg-primary-100 border border-primary-200">
                <i className="ri-check-line text-primary-700"></i>
                <span className="flex-1 text-sm font-medium text-primary-900">
                  Invite applied automatically
                </span>
                <i className="ri-lock-line text-primary-700"></i>
              </div>
            ) : (
              <div className="relative">
                <i className="ri-ticket-2-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
                <input
                  id="invite_code"
                  name="invite_code"
                  type="text"
                  autoComplete="off"
                  required
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value);
                    if (inviteError) setInviteError("");
                  }}
                  placeholder="Your invite code"
                  className={`w-full h-11 pl-9 pr-3 rounded-lg bg-background-100 border text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 ${
                    inviteError
                      ? "border-accent-400 focus:ring-accent-400 focus:border-accent-400"
                      : "border-background-200 focus:ring-primary-400 focus:border-primary-300"
                  }`}
                />
              </div>
            )}
            {inviteError && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-accent-700">
                <i className="ri-error-warning-line text-sm mt-px"></i>
                <span>{inviteError}</span>
              </p>
            )}
          </div>
        )}

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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-foreground-800 mb-1.5">
            Confirm password
          </label>
          <div className="relative">
            <i className="ri-lock-2-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              id="confirm"
              name="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full h-11 pl-9 pr-3 rounded-lg bg-background-100 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
            />
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
              Creating account…
            </>
          ) : (
            "Create account"
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