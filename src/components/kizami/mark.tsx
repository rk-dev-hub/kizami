import { cn } from "@/lib/utils";

/** Kizami のマーク: 時間の目盛りに、ひとつだけ刻みが入った形。 */
export function KizamiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={cn("text-kizami-mark size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path d="M3 14h14" strokeWidth="1.6" />
      <path
        d="M5 14v-2.5M8 14v-2.5M12 14v-2.5M15 14v-2.5"
        strokeWidth="1.3"
        opacity=".55"
      />
      <path d="M10 14V4.5" strokeWidth="2.2" />
      <circle cx="10" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** ロゴ: マーク＋文字 */
export function KizamiLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold tracking-tight",
        className,
      )}
    >
      <span
        aria-hidden
        className="logo-badge brand-fill brand-glow inline-flex size-6 shrink-0 rounded-[6px]"
      >
        <svg viewBox="0 0 24 24" className="size-6">
          <path
            d="M5 16.5h14"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity=".6"
          />
          <path
            d="M12 16.5V6.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="6" r="1.8" fill="var(--kizami-mark)" />
        </svg>
      </span>
      <span>Kizami</span>
    </span>
  );
}
