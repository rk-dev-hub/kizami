import { CheckCircle2 } from "lucide-react";
import type { SessionUser } from "@/features/auth/rbac";
import { getEmployeeNotes } from "@/features/kizami/tasks";
import { KizamiNote } from "@/components/kizami/note";

/** 本人向けの「気づき」（最大 3 件）。ページ本体を待たせないよう Suspense の中で読む。 */
export async function KizamiNotes({ user }: { user: SessionUser }) {
  const notes = await getEmployeeNotes(user);
  if (notes.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckCircle2 className="text-success size-4" aria-hidden />
        いま気になることはありません。
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((n) => (
        <li key={n.insightId}>
          <KizamiNote action={n.action} source={n.source}>
            {n.text}
          </KizamiNote>
        </li>
      ))}
    </ul>
  );
}
