"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type FeedbackItem = {
  id: number;
  message: string;
  status: "open" | "done";
  created_at: string;
  profiles: { display_name: string } | null;
};

export default function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  async function setStatus(id: number, status: "open" | "done") {
    setUpdatingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
    setUpdatingId(null);
    if (error) {
      alert(error.message);
    } else {
      router.refresh();
    }
  }

  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status === "done");

  function Card({ item }: { item: FeedbackItem }) {
    return (
      <div
        key={item.id}
        className={`rounded border p-4 ${
          item.status === "open" ? "border-line bg-surface" : "border-line bg-surface2 opacity-70"
        }`}
      >
        <div className="flex items-center justify-between text-xs text-mute">
          <span>{item.profiles?.display_name ?? "Someone"}</span>
          <span>{new Date(item.created_at).toLocaleString()}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{item.message}</p>
        <button
          onClick={() => setStatus(item.id, item.status === "open" ? "done" : "open")}
          disabled={updatingId === item.id}
          className={`mt-3 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
            item.status === "open"
              ? "bg-orange text-field hover:bg-orange/90"
              : "border border-line text-ink hover:border-orange hover:text-orange"
          }`}
        >
          {updatingId === item.id
            ? "Saving..."
            : item.status === "open"
            ? "Mark complete"
            : "Reopen"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg text-orange">Open ({open.length})</h2>
        <div className="mt-3 space-y-3">
          {open.length === 0 && <p className="text-sm text-mute">No open flags. Nice.</p>}
          {open.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </div>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="font-display text-lg text-mute">Completed ({done.length})</h2>
          <div className="mt-3 space-y-3">
            {done.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
