"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar, { type AvatarProfile } from "@/components/Avatar";

const LINKS = [
  { href: "/picks", label: "Picks" },
  { href: "/scorecard", label: "Scorecard" },
  { href: "/leaderboard", label: "Standings" },
  { href: "/trash-talk", label: "Trash Talk" },
];

export default function NavLinks({
  isAdmin,
  displayName,
  avatarProfile,
}: {
  isAdmin: boolean;
  displayName: string;
  avatarProfile: AvatarProfile | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center">
      {/* Desktop nav */}
      <nav className="hidden items-center gap-5 text-sm text-mute sm:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-ink">
            {l.label}
          </Link>
        ))}
        <Link href="/feedback" className="hover:text-orange" title="Flag on the Play">
          🚩
        </Link>
        {isAdmin && (
          <Link href="/admin" className="hover:text-orange">
            Admin
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin/feedback" className="hover:text-orange">
            Flags
          </Link>
        )}
        <Link href="/profile" className="flex items-center gap-2 hover:text-ink" title="Your icon & stats">
          {avatarProfile && <Avatar profile={avatarProfile} size="sm" />}
          <span className="hidden text-mute lg:inline">{displayName}</span>
        </Link>
        <form action="/auth/signout" method="post">
          <button className="rounded border border-line px-3 py-1.5 text-ink hover:border-orange hover:text-orange">
            Sign out
          </button>
        </form>
      </nav>

      {/* Mobile toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded border border-line text-lg text-ink sm:hidden"
      >
        {open ? "✕" : "☰"}
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded border border-line bg-field p-3 shadow-lg sm:hidden">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            {avatarProfile && <Avatar profile={avatarProfile} size="md" />}
            <span className="text-sm text-ink">{displayName}</span>
          </div>
          <nav className="mt-2 flex flex-col text-base">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2.5 text-ink hover:bg-surface"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/feedback"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-2.5 text-ink hover:bg-surface"
            >
              🚩 Flag on the Play
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2.5 text-orange hover:bg-surface"
              >
                Admin
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin/feedback"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2.5 text-orange hover:bg-surface"
              >
                Flags
              </Link>
            )}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-2.5 text-ink hover:bg-surface"
            >
              Your icon &amp; stats
            </Link>
          </nav>
          <form action="/auth/signout" method="post" className="mt-2 border-t border-line pt-3">
            <button className="w-full rounded border border-line px-3 py-2 text-sm text-ink hover:border-orange hover:text-orange">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
