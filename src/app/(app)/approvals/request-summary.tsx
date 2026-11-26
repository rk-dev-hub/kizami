import { AlertTriangle } from "lucide-react";
import type { SessionUser } from "@/features/auth/rbac";
import type { PendingItem } from "@/features/approval/usecase";
import { summarizePending } from "@/features/kizami/tasks";
import { KizamiMark } from "@/components/kizami/mark";

/** Kizami の一行要約と注意点（Suspense の中で読む） */
export async function RequestSummary({
  admin,
  item,
}: {
  admin: SessionUser;
  item: PendingItem;
}) {
  const s = await summarizePending(admin, item);
  return (
    <div className="border-kizami-border bg-kizami text-kizami-foreground flex gap-2.5 rounded-lg border px-3 py-2 text-sm">
      <KizamiMark className="mt-0.5" />
      <div className="flex min-w-0 flex-col gap-1">
        <p>{s.summary}</p>
        {s.cautions.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {s.cautions.map((c) => (
              <li key={c} className="flex items-start gap-1.5 text-[13px]">
                <AlertTriangle
                  className="text-warning mt-0.5 size-3.5 shrink-0"
                  aria-label="注意"
                />
                {c}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
