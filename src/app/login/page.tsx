"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-3xl font-semibold text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-mute">
        Enter your email and we&apos;ll send you a link to sign in. No password needed.
      </p>

      {status === "sent" ? (
        <div className="mt-6 rounded border border-turf/40 bg-turf/10 p-4 text-sm text-ink">
          Check <span className="font-medium">{email}</span> for a sign-in link.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded border border-line bg-surface px-3 py-2 text-ink placeholder:text-mute focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded bg-gold px-3 py-2 font-medium text-field hover:bg-gold/90 disabled:opacity-60"
          >
            {status === "sending" ? "Sending..." : "Send sign-in link"}
          </button>
          {status === "error" && <p className="text-sm text-loss">{errorMsg}</p>}
        </form>
      )}
    </div>
  );
}
