import { colorForName, initialForName } from "@/lib/avatar";

export type AvatarProfile = {
  display_name: string;
  avatar_type?: string | null;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
};

const SIZE_CLASSES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-14 w-14 text-lg",
} as const;

export default function Avatar({
  profile,
  size = "md",
  ring = null,
  title,
}: {
  profile: AvatarProfile | null | undefined;
  size?: keyof typeof SIZE_CLASSES;
  ring?: "correct" | "incorrect" | null;
  title?: string;
}) {
  const name = profile?.display_name || "?";
  const ringClass =
    ring === "correct" ? "ring-2 ring-tan" : ring === "incorrect" ? "ring-2 ring-loss" : "ring-1 ring-line";

  let content;
  if (profile?.avatar_type === "photo" && profile.avatar_url) {
    content = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.avatar_url} alt={name} className="h-full w-full rounded-full object-cover" />
    );
  } else if (profile?.avatar_type === "emoji" && profile.avatar_emoji) {
    content = (
      <span className="flex h-full w-full items-center justify-center rounded-full bg-surface2 leading-none">
        {profile.avatar_emoji}
      </span>
    );
  } else {
    content = (
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-display font-semibold text-field"
        style={{ backgroundColor: profile?.avatar_color || colorForName(name) }}
      >
        {initialForName(name)}
      </span>
    );
  }

  return (
    <div title={title ?? name} className={`inline-flex shrink-0 rounded-full ${SIZE_CLASSES[size]} ${ringClass}`}>
      {content}
    </div>
  );
}
