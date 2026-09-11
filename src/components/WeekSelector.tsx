"use client";

import { useRouter } from "next/navigation";

type Week = { id: number; label: string };

export default function WeekSelector({
  weeks,
  selectedWeekId,
  basePath = "/picks",
}: {
  weeks: Week[];
  selectedWeekId: number;
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedWeekId}
      onChange={(e) => router.push(`${basePath}?week=${e.target.value}`)}
      className="rounded border border-line bg-surface2 px-3 py-1.5 text-sm text-ink focus:border-orange focus:outline-none"
    >
      {weeks.map((w) => (
        <option key={w.id} value={w.id}>
          {w.label}
        </option>
      ))}
    </select>
  );
}
