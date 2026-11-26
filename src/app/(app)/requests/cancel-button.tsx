"use client";

import { useRouter } from "next/navigation";
import { cancelOwnRequestAction } from "@/features/approval/actions";
import { submitLeaveCancellationAction } from "@/features/leave/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

/** 承認待ちの申請を取り下げる */
export function CancelRequestButton({
  kind,
  id,
}: {
  kind: "CORRECTION" | "LEAVE";
  id: string;
}) {
  const toast = useToast();
  const router = useRouter();
  return (
    <ConfirmDialog
      title="申請を取り下げますか?"
      description="取り下げた申請は元に戻せません。必要ならもう一度申請してください。"
      confirmLabel="取り下げる"
      destructive
      onConfirm={async () => {
        const r = await cancelOwnRequestAction(kind, id);
        if (!r?.ok) {
          toast(r?.message ?? "取り下げられませんでした", "error");
          return false;
        }
        toast("申請を取り下げました");
        router.refresh();
      }}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          取り下げ
        </Button>
      )}
    />
  );
}

/** 承認済みの休暇の取消を申請する（承認されると有給の残日数が戻る） */
export function LeaveCancellationButton({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  return (
    <ConfirmDialog
      title="休暇の取消を申請しますか?"
      description="管理者が承認すると、この休暇は取り消され、有給の残日数が戻ります。"
      confirmLabel="取消を申請"
      reasonLabel="理由"
      onConfirm={async (reason) => {
        const fd = new FormData();
        fd.set("requestId", id);
        fd.set("reason", reason);
        const r = await submitLeaveCancellationAction(null, fd);
        if (!r?.ok) {
          toast(r?.message ?? "申請できませんでした", "error");
          return false;
        }
        toast("取消を申請しました");
        router.refresh();
      }}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          取消を申請
        </Button>
      )}
    />
  );
}
