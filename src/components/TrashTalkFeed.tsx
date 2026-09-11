"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Avatar, { type AvatarProfile } from "@/components/Avatar";

type Message = {
  id: number;
  message: string;
  created_at: string;
  user_id: string;
  profiles?: AvatarProfile | null;
};

type ProfileRow = AvatarProfile & { id: string };

export default function TrashTalkFeed({
  initialMessages,
  profiles,
  currentUserId,
}: {
  initialMessages: Message[];
  profiles: ProfileRow[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const profilesById = useRef(new Map(profiles.map((p) => [p.id, p])));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("trash-talk-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trash_talk" },
        (payload: any) => {
          const row = payload.new as { id: number; user_id: string; message: string; created_at: string };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, { ...row, profiles: profilesById.current.get(row.user_id) ?? null }];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "trash_talk" },
        (payload: any) => {
          const oldRow = payload.old as { id: number };
          setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("trash_talk")
      .insert({ user_id: currentUserId, message: trimmed });
    setSending(false);
    if (insertError) {
      setError(insertError.message);
    } else {
      setText("");
    }
  }

  return (
    <div className="flex h-[65vh] max-h-[600px] min-h-[320px] flex-col rounded border border-line bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && <p className="text-sm text-mute">No trash talked yet. Be the first.</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <Avatar profile={m.profiles} size="sm" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-ink">{m.profiles?.display_name ?? "Someone"}</span>
                <span className="text-[10px] text-mute">
                  {new Date(m.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.message}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-line p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={500}
            placeholder="Talk your talk..."
            className="min-w-0 flex-1 rounded border border-line bg-surface2 px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-orange focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="shrink-0 rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
          >
            Send
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-loss">{error}</p>}
      </div>
    </div>
  );
}
