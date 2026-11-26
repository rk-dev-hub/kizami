"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";

/** 管理者が対象のユーザーを切り替える（勤怠・勤務表） */
export function UserPicker({
  users,
  current,
  basePath,
}: {
  users: { id: string; name: string; employeeCode: string }[];
  current: string;
  basePath: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">対象者</span>
      <Select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(sp);
          next.set("user", e.target.value);
          router.push(`${basePath}?${next.toString()}`);
        }}
        className="h-9 w-auto"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.employeeCode} {u.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
