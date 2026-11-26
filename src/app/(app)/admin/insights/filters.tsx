"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/input";

export function InsightFilters({
  kinds,
}: {
  kinds: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };
  return (
    <div
      className="flex flex-wrap gap-2"
      role="search"
      aria-label="兆しの絞り込み"
    >
      <Select
        aria-label="重要度"
        className="h-9 w-auto"
        value={sp.get("severity") ?? ""}
        onChange={(e) => set("severity", e.target.value)}
      >
        <option value="">すべての重要度</option>
        <option value="WARNING">警告</option>
        <option value="CAUTION">注意</option>
        <option value="INFO">お知らせ</option>
      </Select>
      <Select
        aria-label="種類"
        className="h-9 w-auto"
        value={sp.get("kind") ?? ""}
        onChange={(e) => set("kind", e.target.value)}
      >
        <option value="">すべての種類</option>
        {kinds.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Select>
      <Input
        aria-label="対象者（氏名・社員番号）"
        placeholder="氏名・社員番号"
        className="h-9 w-44"
        defaultValue={sp.get("q") ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") set("q", e.currentTarget.value.trim());
        }}
        onBlur={(e) => set("q", e.currentTarget.value.trim())}
        maxLength={40}
      />
    </div>
  );
}
