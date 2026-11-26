import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/features/auth/rbac";
import { listPending } from "@/features/approval/usecase";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Skeleton } from "@/components/empty-state";
import { ApprovalCard } from "./approval-row";
import { RequestSummary } from "./request-summary";

export const metadata = { title: "承認待ち — Kizami" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const admin = await requireAdmin();
  const items = await listPending();

  // 自分の申請は承認できないので一覧から外す（本人の申請画面から取り下げはできる）
  const actionable = items.filter((i) => i.requesterId !== admin.id);
  const ownPending = items.length - actionable.length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="承認待ち"
        description={`打刻修正・休暇・休暇の取消を、申請の古い順に表示します。${ownPending > 0 ? `自分の申請 ${ownPending} 件は表示していません。` : ""}`}
      />
      {actionable.length === 0 ? (
        <EmptyState icon={Inbox} title="承認待ちの申請はありません">
          新しい申請が届くと、ここに表示されます。
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {actionable.map((item) => (
            <ApprovalCard
              key={`${item.kind}:${item.id}`}
              item={item}
              summary={
                <Suspense fallback={<Skeleton className="h-10" />}>
                  <RequestSummary admin={admin} item={item} />
                </Suspense>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
