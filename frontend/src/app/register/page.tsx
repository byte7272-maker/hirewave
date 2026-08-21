"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", location: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await register(form.email, form.password, form.full_name, form.location);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand center" style={{ justifyContent: "center", marginBottom: 6 }}>
          <span className="brand-dot" aria-hidden>B</span> Bayete
        </div>
        <h1 className="center">Create your account</h1>
        <p className="muted center">Start automating your job search.</p>
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="toast error" role="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input id="location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="New York, NY" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} />
            <span className="faint">At least 8 characters.</span>
          </div>
          <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? <span className="spinner" /> : "Create account"}
          </button>
        </form>
        <p className="center muted" style={{ marginTop: 16 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
