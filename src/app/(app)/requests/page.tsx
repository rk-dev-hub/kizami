import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Inbox,
  XCircle,
} from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import { dateOnlyStr } from "@/lib/datetime";
import { formatDateJa, formatRangeJa } from "@/lib/date-range";
import {
  getLeaveOverview,
  listMyLeaveRequests,
} from "@/features/leave/usecase";
import { listMyCorrections } from "@/features/correction/usecase";
import {
  dayPartLabel,
  leaveTypeLabel,
  statusLabel,
} from "@/features/approval/usecase";
import {
  readCorrectionPrefill,
  readLeavePrefill,
} from "@/features/kizami/draft-link";
import { isKizamiAiEnabled } from "@/features/kizami/client";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { LinkTabs } from "@/components/tabs";
import { EmptyState } from "@/components/empty-state";
import { KizamiHeading } from "@/components/kizami/note";
import { KizamiComposer } from "@/components/kizami/composer";
import { LeaveForm } from "./leave-form";
import { CorrectionForm } from "./correction-form";
import { CancelRequestButton, LeaveCancellationButton } from "./cancel-button";

export const metadata = { title: "申請 — Kizami" };
export const dynamic = "force-dynamic";

type Tab = "correction" | "leave" | "status";

const STATUS: Record<string, { variant: BadgeVariant; icon: typeof Clock }> = {
  DRAFT: { variant: "default", icon: CircleDashed },
  PENDING: { variant: "warning", icon: Clock },
  APPROVED: { variant: "success", icon: CheckCircle2 },
  REJECTED: { variant: "destructive", icon: XCircle },
  CANCELED: { variant: "default", icon: CircleDashed },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  const Icon = s.icon;
  return (
    <Badge variant={s.variant}>
      <Icon aria-hidden />
      {statusLabel(status as Parameters<typeof statusLabel>[0])}
    </Badge>
  );
}

export default async function RequestsPage({
  searchParams,
}: PageProps<"/requests">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab =
    tabParam === "leave" || tabParam === "status" ? tabParam : "correction";

  const [overview, leaves, corrections] = await Promise.all([
    getLeaveOverview(user.id),
    listMyLeaveRequests(user.id),
    listMyCorrections(user.id),
  ]);
  const pendingCount =
    leaves.filter((l) => l.status === "PENDING").length +
    corrections.filter((c) => c.status === "PENDING").length;

  const rows = [
    ...corrections.map((c) => ({
      key: `c-${c.id}`,
      id: c.id,
      kind: "CORRECTION" as const,
      label: "打刻修正",
      target: formatDateJa(dateOnlyStr(c.targetDate)),
      detail: `${c.lines.length} 件の修正`,
      reason: c.reason,
      status: c.status,
      comment: c.decisionComment,
      createdAt: c.createdAt,
      canCancelLeave: false,
    })),
    ...leaves.map((l) => {
      const s = dateOnlyStr(l.startDate);
      const e = dateOnlyStr(l.endDate);
      return {
        key: `l-${l.id}`,
        id: l.id,
        kind: "LEAVE" as const,
        label: l.kind === "CANCELLATION" ? "休暇の取消" : "休暇",
        target: formatRangeJa(s, e),
        detail: `${leaveTypeLabel(l.type)} ${dayPartLabel(l.dayPart)}`,
        reason: l.reason,
        status: l.status,
        comment: l.decisionComment,
        createdAt: l.createdAt,
        canCancelLeave:
          l.kind === "TAKE" && l.status === "APPROVED" && !l.supersededById,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const ai = isKizamiAiEnabled();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="申請"
        description="打刻の修正と休暇の申請。承認されると勤怠に反映されます。"
      />

      {ai && tab !== "status" ? (
        <Card>
          <CardHeader className="pb-2">
            <KizamiHeading hint="書いた内容から申請フォームを埋めます">
              Kizami に書いて下書き
            </KizamiHeading>
          </CardHeader>
          <CardContent>
            <KizamiComposer modes={["draft"]} />
          </CardContent>
        </Card>
      ) : null}

      <div>
        <LinkTabs
          current={tab}
          tabs={[
            {
              key: "correction",
              label: "打刻修正",
              href: "/requests?tab=correction",
            },
            { key: "leave", label: "休暇", href: "/requests?tab=leave" },
            {
              key: "status",
              label: "申請の状況",
              href: "/requests?tab=status",
              count: pendingCount,
            },
          ]}
        />
        <div className="pt-5">
          {tab === "correction" ? (
            <Card>
              <CardContent className="pt-5">
                <CorrectionForm
                  key={JSON.stringify(sp)}
                  prefill={readCorrectionPrefill(sp)}
                />
              </CardContent>
            </Card>
          ) : null}
          {tab === "leave" ? (
            <Card>
              <CardContent className="pt-5">
                <LeaveForm
                  key={JSON.stringify(sp)}
                  balance={overview.balance}
                  granted={overview.granted}
                  expiring={overview.expiring}
                  prefill={readLeavePrefill(sp)}
                />
              </CardContent>
            </Card>
          ) : null}
          {tab === "status" ? (
            rows.length === 0 ? (
              <EmptyState icon={Inbox} title="まだ申請はありません">
                打刻を直したいときや休みを取りたいときは、「打刻修正」「休暇」のタブから申請できます。
              </EmptyState>
            ) : (
              <ul className="bg-surface divide-y rounded-xl border">
                {rows.map((r) => (
                  <li
                    key={r.key}
                    className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={r.status} />
                        <span className="text-sm font-medium">{r.label}</span>
                        <span className="tabular text-sm">{r.target}</span>
                        <span className="text-muted-foreground text-xs">
                          {r.detail}
                        </span>
                      </div>
                      <p
                        className="text-muted-foreground line-clamp-2 text-sm"
                        title={r.reason}
                      >
                        {r.reason}
                      </p>
                      {r.comment ? (
                        <p className="text-sm">
                          <span className="text-muted-foreground text-xs">
                            管理者のコメント:{" "}
                          </span>
                          {r.comment}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {r.status === "PENDING" ? (
                        <CancelRequestButton kind={r.kind} id={r.id} />
                      ) : null}
                      {r.canCancelLeave ? (
                        <LeaveCancellationButton id={r.id} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
