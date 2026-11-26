"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserCheck, UserX } from "lucide-react";
import type { UserStatus } from "@/generated/prisma/client";
import { resetPasswordAction, setStatusAction } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

export function UserRowActions({
  userId,
  userName,
  status,
  isSelf,
}: {
  userId: string;
  userName: string;
  status: UserStatus;
  isSelf: boolean;
}) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const nextStatus: UserStatus = status === "ACTIVE" ? "DISABLED" : "ACTIVE";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <ConfirmDialog
          title={`${userName} さんのパスワードをリセットしますか?`}
          description="新しい初期パスワードを一度だけ表示します。本人は次のログインで変更します。"
          confirmLabel="リセットする"
          onConfirm={async () => {
            const fd = new FormData();
            fd.set("userId", userId);
            const r = await resetPasswordAction(null, fd);
            if (!r?.ok) {
              toast(r?.message ?? "リセットできませんでした", "error");
              return false;
            }
            setTempPassword(r.tempPassword ?? null);
            toast("パスワードをリセットしました");
          }}
          trigger={(open) => (
            <Button variant="ghost" size="sm" onClick={open}>
              <KeyRound />
              パスワード
            </Button>
          )}
        />
        <ConfirmDialog
          title={
            status === "ACTIVE"
              ? `${userName} さんを無効にしますか?`
              : `${userName} さんを有効に戻しますか?`
          }
          description={
            status === "ACTIVE"
              ? "無効にすると、この人はログインできなくなります。勤怠の記録は残ります。"
              : "有効に戻すと、もう一度ログインできるようになります。"
          }
          confirmLabel={status === "ACTIVE" ? "無効にする" : "有効に戻す"}
          destructive={status === "ACTIVE"}
          onConfirm={async () => {
            const fd = new FormData();
            fd.set("userId", userId);
            fd.set("status", nextStatus);
            const r = await setStatusAction(null, fd);
            if (!r?.ok) {
              toast(r?.message ?? "変更できませんでした", "error");
              return false;
            }
            toast(status === "ACTIVE" ? "無効にしました" : "有効に戻しました");
            router.refresh();
          }}
          trigger={(open) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={open}
              disabled={isSelf}
              title={isSelf ? "自分自身は変更できません" : undefined}
              className={status === "ACTIVE" ? "text-destructive" : undefined}
            >
              {status === "ACTIVE" ? <UserX /> : <UserCheck />}
              {status === "ACTIVE" ? "無効にする" : "有効に戻す"}
            </Button>
          )}
        />
      </div>
      {tempPassword ? (
        <p className="bg-warning-soft rounded px-2 py-1 text-xs">
          新しい初期パスワード:{" "}
          <span className="font-mono text-sm select-all">{tempPassword}</span>
        </p>
      ) : null}
    </div>
  );
}
