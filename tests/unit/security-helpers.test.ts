import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000", SMTP_URL: "smtp://localhost:1025" },
}));

import { isAcceptablePassword } from "@/lib/password-policy";
import { dateParam, uuidParam, stringParam } from "@/lib/params";
import { appUrl, isAppPath } from "@/features/notification/mailer";

describe("パスワードの最低要件", () => {
  it.each([
    ["short", false],
    ["Password123", false],
    ["PASSWORD123", false],
    ["changeme", false],
    ["x".repeat(129), false],
    ["Kz-demo-pass-2026", true],
    ["correct horse battery", true],
  ])("%s → %s", (pw, ok) => {
    expect(isAcceptablePassword(pw)).toBe(ok);
  });
});

describe("クエリの検証", () => {
  it("UUID 以外は null", () => {
    expect(uuidParam("6f1c2b1e-8d3a-4c1e-9b7a-0a1b2c3d4e5f")).toBe(
      "6f1c2b1e-8d3a-4c1e-9b7a-0a1b2c3d4e5f",
    );
    expect(uuidParam("1 OR 1=1")).toBeNull();
    expect(uuidParam(undefined)).toBeNull();
    expect(
      uuidParam(["6f1c2b1e-8d3a-4c1e-9b7a-0a1b2c3d4e5f", "x"]),
    ).not.toBeNull();
  });

  it("日付の形式が違えば既定値", () => {
    expect(dateParam("2026-11-25", "d")).toBe("2026-11-25");
    expect(dateParam("2026-13-45", "d")).toBe("d");
    expect(dateParam("<script>", "d")).toBe("d");
    expect(stringParam(["a", "b"])).toBe("a");
  });
});

describe("メール内リンク", () => {
  it.each([
    ["/requests?tab=leave", true],
    ["/", true],
    ["//evil.example.com", false],
    ["/\\evil.example.com", false],
    ["https://evil.example.com", false],
    ["javascript:alert(1)", false],
    ["/a b", false],
  ])("isAppPath(%s) → %s", (p, ok) => {
    expect(isAppPath(p)).toBe(ok);
  });

  it("アプリ外のパスはトップに置き換える", () => {
    expect(appUrl("/notifications")).toBe(
      "http://localhost:3000/notifications",
    );
    expect(appUrl("//evil.example.com/x")).toBe("http://localhost:3000/");
  });
});
