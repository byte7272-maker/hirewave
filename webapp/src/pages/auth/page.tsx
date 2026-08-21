import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function Auth() {
  const { login, register, firebaseLogin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    params.get("mode") === "login" ? "login" : "register"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") await register(email, password, fullName);
      else await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Firebase sign-in. In production this comes from the Firebase SDK (Google /
  // email) — here in mock mode the backend accepts the email as the token, so
  // this is a working reference for the exchange flow. No password involved.
  async function onFirebase() {
    setError("");
    if (!email) { setError("Enter your email to continue with Firebase."); return; }
    setBusy(true);
    try {
      await firebaseLogin(email); // real app: await firebaseLogin(await user.getIdToken())
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Firebase sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background-50 text-foreground-950 font-sans flex flex-col">
      <header className="px-6 h-16 flex items-center">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-500 text-background-50">
            <i className="ri-radar-line text-xl"></i>
          </div>
          <span className="font-heading text-2xl font-semibold tracking-tight">Hirewave</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-background-100/60 border border-background-200 p-6 md:p-8">
            <h1 className="font-heading text-2xl font-medium">
              {mode === "register" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-foreground-600 mt-1">
              {mode === "register"
                ? "Start automating your job search."
                : "Sign in to your workspace."}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              {error && (
                <div className="text-sm text-accent-900 bg-accent-100 border border-accent-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {mode === "register" && (
                <label className="block">
                  <span className="block text-xs font-medium text-foreground-600 mb-1.5">Full name</span>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </label>
              )}
              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-background-50 border border-background-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <span className="block text-[11px] text-foreground-400 mt-1">At least 8 characters.</span>
              </label>
              <button
                disabled={busy}
                className="w-full h-11 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60"
              >
                {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-background-200"></div>
              <span className="text-[11px] uppercase tracking-wide text-foreground-400">or</span>
              <div className="h-px flex-1 bg-background-200"></div>
            </div>
            <button
              type="button"
              onClick={onFirebase}
              disabled={busy}
              className="w-full h-11 inline-flex items-center justify-center gap-2 text-sm font-semibold border border-background-300 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <i className="ri-fire-fill text-accent-600"></i>
              Continue with Firebase
            </button>
            <p className="text-[11px] text-foreground-400 mt-1.5 text-center">
              Passwordless — no password sent to Hirewave. (Dev/mock: uses the email above.)
            </p>

            <p className="text-sm text-foreground-600 mt-5 text-center">
              {mode === "register" ? "Already have an account?" : "No account yet?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "register" ? "login" : "register");
                  setError("");
                }}
                className="font-semibold text-primary-700 hover:text-primary-900 cursor-pointer"
              >
                {mode === "register" ? "Sign in" : "Create one"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
