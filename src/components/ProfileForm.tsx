"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import { AVATAR_COLORS, AVATAR_EMOJI, colorForName } from "@/lib/avatar";

type Profile = {
  id: string;
  display_name: string;
  avatar_type: string;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
};

type Tab = "initial" | "emoji" | "photo";

export default function ProfileForm({ userId, profile }: { userId: string; profile: Profile }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((profile.avatar_type as Tab) || "initial");
  const [color, setColor] = useState(profile.avatar_color || colorForName(profile.display_name));
  const [emoji, setEmoji] = useState(profile.avatar_emoji || AVATAR_EMOJI[0]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile.avatar_url);

  const previewProfile = {
    display_name: profile.display_name,
    avatar_type: tab,
    avatar_color: tab === "initial" ? color : null,
    avatar_emoji: tab === "emoji" ? emoji : null,
    avatar_url: tab === "photo" ? photoPreview : null,
  };

  async function saveChoice() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_type: tab,
        avatar_color: tab === "initial" ? color : null,
        avatar_emoji: tab === "emoji" ? emoji : null,
      })
      .eq("id", userId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSavedAt(Date.now());
      router.refresh();
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Image is too big — please choose one under 4MB.");
      return;
    }
    setError("");
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    // cache-bust so the new photo shows immediately even at the same path
    const bustedUrl = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_type: "photo", avatar_url: bustedUrl })
      .eq("id", userId);

    setUploading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPhotoPreview(bustedUrl);
    setSavedAt(Date.now());
    router.refresh();
  }

  return (
    <div className="rounded border border-line bg-surface p-4">
      <div className="flex items-center gap-4">
        <Avatar profile={previewProfile} size="lg" />
        <div>
          <p className="text-sm text-ink">{profile.display_name}</p>
          <p className="text-xs text-mute">This is how you&apos;ll show up on the scorecard and standings.</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b border-line pb-3">
        {(["initial", "emoji", "photo"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-xs font-medium capitalize ${
              tab === t ? "bg-orange text-field" : "border border-line text-mute hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "initial" && (
        <div className="mt-3">
          <p className="text-xs text-mute">Pick a color for your initial.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full ${color === c ? "ring-2 ring-ink" : "ring-1 ring-line"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={saveChoice}
            disabled={saving}
            className="mt-4 rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save icon"}
          </button>
        </div>
      )}

      {tab === "emoji" && (
        <div className="mt-3">
          <p className="text-xs text-mute">Pick an emoji.</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {AVATAR_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                  emoji === e ? "bg-orange/20 ring-2 ring-orange" : "bg-surface2 ring-1 ring-line"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <button
            onClick={saveChoice}
            disabled={saving}
            className="mt-4 rounded bg-orange px-4 py-2 text-sm font-medium text-field hover:bg-orange/90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save icon"}
          </button>
        </div>
      )}

      {tab === "photo" && (
        <div className="mt-3">
          <p className="text-xs text-mute">Upload a photo — it&apos;ll be cropped to a circle.</p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePhotoUpload(file);
            }}
            disabled={uploading}
            className="mt-2 text-xs text-mute file:mr-3 file:rounded file:border-0 file:bg-orange file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-field hover:file:bg-orange/90"
          />
          {uploading && <p className="mt-2 text-xs text-mute">Uploading...</p>}
        </div>
      )}

      {savedAt && <p className="mt-2 text-xs text-tan">Saved ✓</p>}
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
    </div>
  );
}
