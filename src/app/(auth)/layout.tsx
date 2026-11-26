import { KizamiLogo, KizamiMark } from "@/components/kizami/mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      <section className="auth-hero relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <KizamiLogo className="relative text-lg [&_.logo-badge]:bg-white/15 [&_.logo-badge]:bg-none [&_.logo-badge]:shadow-none" />
        <div className="relative max-w-md">
          <p className="text-3xl leading-snug font-semibold">
            気づいて、教える。
            <br />
            AI 勤怠管理
          </p>
          <p className="mt-4 text-sm leading-relaxed opacity-80">
            打刻漏れや働きすぎの兆しに Kizami
            が気づき、申請の下書きや管理者への説明までを手伝います。
          </p>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border border-white/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-10 size-52 rounded-full border border-white/10"
        />
        <div
          aria-hidden
          className="relative flex items-end gap-[7px] opacity-50"
        >
          {Array.from({ length: 48 }, (_, i) => (
            <span
              key={i}
              className="w-px bg-current"
              style={{ height: i % 12 === 0 ? 28 : i % 3 === 0 ? 16 : 9 }}
            />
          ))}
        </div>
      </section>
      <main className="flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
            <KizamiLogo className="text-xl" />
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <KizamiMark className="size-3.5" />
              気づいて教える AI 勤怠管理
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
