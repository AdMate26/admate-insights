"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Which campaigns Audience insight looks at: all campaigns with one objective, or one campaign.
export function AudienceTarget({ value, groups }: { value: string; groups: { objective: string; label: string; campaigns: { id: string; name: string }[] }[] }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted">
      Campaigns
      <select
        value={value}
        onChange={(e) => {
          const q = new URLSearchParams(search.toString());
          q.set("t", e.target.value);
          router.push(`${path}?${q.toString()}`, { scroll: false });
        }}
        className="max-w-[min(70vw,360px)] rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-fg"
      >
        {groups.map((g) => (
          <optgroup key={g.objective} label={g.label}>
            <option value={`obj:${g.objective}`}>All {g.label.toLowerCase()} campaigns</option>
            {g.campaigns.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
