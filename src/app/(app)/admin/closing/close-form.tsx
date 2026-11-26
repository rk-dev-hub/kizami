"use client";

import { useActionState } from "react";
import { formatDateSlash } from "@/lib/date-range";
import {
  closePeriodAction,
  reopenPeriodAction,
  recomputeRangeAction,
  type MasterState,
} from "@/features/admin/master-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

function Banner({ s }: { s: MasterState }) {
  if (!s?.message) return null;
  return (
    <p
      className={
        s.ok
          ? "bg-success-soft text-success rounded-md px-3 py-2 text-sm"
          : "bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
      }
      role="alert"
    >
      {s.message}
    </p>
  );
}

export function CloseButton({
  periodStart,
  periodEnd,
}: {
  periodStart: string;
  periodEnd: string;
}) {
  const toast = useToast();
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`${formatDateSlash(periodStart)}〜${formatDateSlash(periodEnd)} を締めますか?`}
      description="締めた期間は、打刻や申請の反映ができなくなります。変更が必要なときは再オープンします。"
      confirmLabel="締める"
      onConfirm={async () => {
        const fd = new FormData();
        fd.set("periodStart", periodStart);
        fd.set("reason", "");
        const r = await closePeriodAction(null, fd);
        if (!r?.ok) {
          toast(r?.message ?? "締められませんでした", "error");
          return false;
        }
        toast("締めました");
        router.refresh();
      }}
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          締める
        </Button>
      )}
    />
  );
}

export function ReopenButton({ periodStart }: { periodStart: string }) {
  const toast = useToast();
  const router = useRouter();
  return (
    <ConfirmDialog
      title="この期間を再オープンしますか?"
      description="再オープンすると、打刻や申請をこの期間に反映できるようになります。理由は監査ログに残ります。"
      confirmLabel="再オープン"
      destructive
      reasonLabel="再オープンの理由（必須）"
      onConfirm={async (reason) => {
        const fd = new FormData();
        fd.set("periodStart", periodStart);
        fd.set("reason", reason);
        const r = await reopenPeriodAction(null, fd);
        if (!r?.ok) {
          toast(r?.message ?? "再オープンできませんでした", "error");
          return false;
        }
        toast("再オープンしました");
        router.refresh();
      }}
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          再オープン
        </Button>
      )}
    />
  );
}

export function RecomputeForm({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, action, pending] = useActionState<MasterState, FormData>(
    recomputeRangeAction,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        開始
        <Input
          name="from"
          type="date"
          defaultValue={defaultFrom}
          className="h-9"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        終了
        <Input name="to" type="date" defaultValue={defaultTo} className="h-9" />
      </label>
      <input type="hidden" name="userId" value="" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "再計算中…" : "全員を再計算"}
      </Button>
      <Banner s={state} />
    </form>
  );
}
