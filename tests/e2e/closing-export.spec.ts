import { test, expect } from "@playwright/test";
import { login, ADMIN } from "./helpers";

// ADMIN が対象期間（1 つ前の締め期間）を締める → 勤務表に CSV/PDF リンクがあり、
// 日別 CSV が 200 で取得できる。
// ※テスト間の干渉を避けるため「当月」ではなく前の期間を締める。

test("月次締め → 勤務表から CSV/PDF が取得できる", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/closing");

  await expect(page.getByRole("heading", { name: "月次締め" })).toBeVisible();

  // 期間の一覧: [0]=当月, [1]=前の期間。
  const prevRow = page.locator("li[data-period-start]").nth(1);
  const periodStart = (await prevRow.getAttribute("data-period-start")) ?? "";
  expect(periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // 「締める」は確認ダイアログを挟む。
  await prevRow.getByRole("button", { name: "締める" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "締める" })
    .click();

  // 締め後: 当該行が CLOSED 表示 + 再オープンボタンに変わる。
  await expect(prevRow.getByText("締め済み")).toBeVisible();
  await expect(
    prevRow.getByRole("button", { name: "再オープン" }),
  ).toBeVisible();

  // --- 勤務表（締めた期間）の出力リンク ---
  await page.goto(`/reports?ref=${periodStart}`);
  const dailyCsv = page.getByRole("link", { name: "日別 CSV", exact: true });
  const summaryCsv = page.getByRole("link", {
    name: "サマリ CSV",
    exact: true,
  });
  const pdf = page.getByRole("link", { name: "勤務表 PDF", exact: true });
  await expect(dailyCsv).toBeVisible();
  await expect(summaryCsv).toBeVisible();
  await expect(pdf).toBeVisible();

  // 日別 CSV を実際に取得（Cookie は page.request が共有）。
  const base = "http://localhost:3000";
  const abs = (href: string | null) => new URL(href ?? "", base).toString();

  const csvHref = await dailyCsv.getAttribute("href");
  expect(csvHref).toBeTruthy();
  const csvRes = await page.request.get(abs(csvHref));
  expect(csvRes.status()).toBe(200);
  expect(csvRes.headers()["content-type"]).toContain("csv");
  const body = await csvRes.text();
  expect(body).toContain("勤務表 日別明細");

  // サマリ CSV / PDF も 200。
  const summaryRes = await page.request.get(
    abs(await summaryCsv.getAttribute("href")),
  );
  expect(summaryRes.status()).toBe(200);
  const pdfRes = await page.request.get(abs(await pdf.getAttribute("href")));
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toContain("pdf");
});
