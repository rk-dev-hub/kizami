"use client";

import { useOptimistic, useTransition } from "react";
import { setNotificationPreferenceAction } from "@/features/notification/actions";
import { useToast } from "@/components/toast";

type Item = { kind: string; label: string; email: boolean };

export function NotificationPrefs({ items }: { items: Item[] }) {
  const [state, setOptimistic] = useOptimistic(
    items,
    (cur, next: { kind: string; email: boolean }) =>
      cur.map((i) => (i.kind === next.kind ? { ...i, email: next.email } : i)),
  );
  const [, start] = useTransition();
  const toast = useToast();

  return (
    <ul className="divide-y">
      {state.map((i) => (
        <li
          key={i.kind}
          className="flex items-center justify-between gap-4 py-2.5"
        >
          <span className="text-sm" id={`pref-${i.kind}`}>
            {i.label}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={i.email}
            aria-labelledby={`pref-${i.kind}`}
            onClick={() =>
              start(async () => {
                setOptimistic({ kind: i.kind, email: !i.email });
                const r = await setNotificationPreferenceAction(
                  i.kind,
                  !i.email,
                );
                if (!r.ok) toast("保存できませんでした", "error");
              })
            }
            className={
              "relative h-6 w-10 shrink-0 rounded-full transition-colors " +
              (i.email ? "bg-primary" : "bg-border-strong")
            }
          >
            <span
              aria-hidden
              className={
                "bg-surface absolute top-0.5 size-5 rounded-full shadow transition-transform " +
                (i.email ? "translate-x-[18px]" : "translate-x-0.5")
              }
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
