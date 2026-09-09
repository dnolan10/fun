"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function FeedbackPage() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in to throw a flag.");
      setSubmitting(false);
      return;
    }
    const { error: insertError } = await supabase
      .from("feedback")
      .insert({ user_id: user.id, message: message.trim() });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
    } else {
      setMessage("");
      setSentAt(Date.now());
    }
  }

  return (
    <div className="mx-auto mt-8 max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">🚩 Flag on the Play</h1>
      <p className="mt-2 text-sm text-mute">
        Found a bug, a weird number, or something that just doesn&apos;t work right? Throw a flag
        and it goes straight to the commissioner.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What happened, and where?"
          rows={5}
          className="w-full rounded border border-line bg-surface px-3 py-2 text-ink placeholder:text-mute focus:border-orange focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
        >
          {submitting ? "Throwing..." : "Throw the flag"}
        </button>
        {error && <p className="text-sm text-loss">{error}</p>}
      </form>

      {sentAt && (
        <div className="mt-6 rounded border border-tan/40 bg-tan/10 p-4 text-sm text-ink">
          Flag thrown 🚩 — thanks, I&apos;ll take a look.
        </div>
      )}
    </div>
  );
}
