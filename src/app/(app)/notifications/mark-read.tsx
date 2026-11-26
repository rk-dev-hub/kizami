"use client";

import { useEffect, useRef, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markNotificationsReadAction } from "@/features/notification/actions";
import { Button } from "@/components/ui/button";

/** 一覧を開いてしばらくしたら、表示した通知を既読にする（未読の強調は今回の表示では残す）。 */
export function MarkReadOnOpen({ ids }: { ids: string[] }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || ids.length === 0) return;
    done.current = true;
    const t = setTimeout(() => void markNotificationsReadAction(ids), 1500);
    return () => clearTimeout(t);
  }, [ids]);
  return null;
}

export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => void (await markNotificationsReadAction("all")))
      }
    >
      <CheckCheck />
      すべて既読にする
    </Button>
  );
}
