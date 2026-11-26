import { Sparkles } from "lucide-react";
import type { InsightKind } from "@/generated/prisma/client";
import { requireAdmin } from "@/features/auth/rbac";
import {
  listAdminInsights,
  getInsightSettingsForAdmin,
} from "@/features/insight/admin-usecase";
import { toCardData } from "@/features/insight/card-data";
import { insightKindLabel } from "@/features/insight/templates";
import { ADMIN_FACING } from "@/features/insight/domain/settings";
import { isKizamiAiEnabled } from "@/features/kizami/client";
import { stringParam } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { LinkTabs } from "@/components/tabs";
import { EmptyState } from "@/components/empty-state";
import { InsightCard } from "@/components/insight/insight-card";
import { InsightFilters } from "./filters";
import { InsightSettingsForm } from "./settings-form";

export const metadata = { title: "兆しレポート — Kizami" };
export const dynamic = "force-dynamic";

export default async function InsightsPage({
  searchParams,
}: PageProps<"/admin/insights">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = stringParam(sp.tab);
  const view =
    tab === "resolved"
      ? "resolved"
      : tab === "settings"
        ? "settings"
        : "active";
  const sev = stringParam(sp.severity);
  const kind = stringParam(sp.kind);
  const who = stringParam(sp.q)?.trim() ?? "";
  const ai = isKizamiAiEnabled();

  const tabs = [
    { key: "active", label: "未対応・対応済み", href: "/admin/insights" },
    { key: "resolved", label: "解消", href: "/admin/insights?tab=resolved" },
    {
      key: "settings",
      label: "検知の設定",
      href: "/admin/insights?tab=settings",
    },
  ];

  if (view === "settings") {
    const settings = await getInsightSettingsForAdmin();
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title="兆しレポート"
          description="Kizami が検知する兆しの種類と、しきい値を設定します。"
        />
        <LinkTabs tabs={tabs} current={view} />
        <InsightSettingsForm settings={settings} labels={insightKindLabel} />
      </div>
    );
  }

  const rows = (
    await listAdminInsights(view === "resolved" ? "RESOLVED" : "ACTIVE")
  ).filter(
    (r) =>
      (!sev || r.severity === sev) &&
      (!kind || r.kind === kind) &&
      (!who || r.userName.includes(who) || r.employeeCode.includes(who)),
  );
  const kinds = [...ADMIN_FACING].map((k: InsightKind) => ({
    value: k,
    label: insightKindLabel[k],
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="兆しレポート"
        description="働きすぎや打刻漏れの兆しを、Kizami が勤怠データから毎日検知します。"
      />
      <LinkTabs tabs={tabs} current={view} />
      <InsightFilters kinds={kinds} />
      {rows.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={
            view === "resolved"
              ? "解消した兆しはありません"
              : "該当する兆しはありません"
          }
        >
          {view === "resolved"
            ? "条件を満たさなくなった兆しは、自動で「解消」に移ります。"
            : "絞り込みを外すか、しばらくしてから確認してください。兆しは打刻や承認のたびに更新されます。"}
        </EmptyState>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((r) => (
            <InsightCard
              key={r.id}
              data={toCardData(r)}
              aiEnabled={ai}
              compact={view === "resolved"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
