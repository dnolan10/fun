"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Prevents this page from ever being served stale from a cache (mobile
// browsers and CDNs can otherwise hang onto an old build of this route).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmNotice, setConfirmNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else if (data.session) {
        router.push("/picks");
        router.refresh();
      } else {
        // Only happens if "Confirm email" is still enabled in Supabase.
        setConfirmNotice(true);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        router.push("/picks");
        router.refresh();
      }
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-1">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {mode === "signin" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm text-mute">
        {mode === "signin"
          ? "Enter your email and password."
          : "Pick a password — you'll use it every time you come back, no email needed."}
      </p>

      {confirmNotice ? (
        <div className="mt-6 rounded border border-tan/40 bg-tan/10 p-4 text-sm text-ink">
          Check <span className="font-medium">{email}</span> to confirm your account this one
          time, then come back and sign in with your password.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3" noValidate={false}>
          <div>
            <label htmlFor="login-email" className="sr-only">
              Email address
            </label>
            <input
              id="login-email"
              name="userEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              inputMode="email"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore
              className="w-full rounded border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-mute focus:border-orange focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="sr-only">
              Password
            </label>
            <input
              id="login-password"
              name="userPassword"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full rounded border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-mute focus:border-orange focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-orange px-3 py-3 text-base font-medium text-field hover:bg-orange/90 disabled:opacity-60"
          >
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {error && <p className="text-sm text-loss">{error}</p>}
        </form>
      )}

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError("");
          setConfirmNotice(false);
        }}
        className="mt-4 text-sm text-mute hover:text-orange"
      >
        {mode === "signin"
          ? "New here? Create an account instead"
          : "Already have an account? Sign in instead"}
      </button>
    </div>
  );
}
