import { test, expect } from "@playwright/test";
import {
  login,
  logout,
  jstToday,
  ADMIN,
  EMP_ITO,
  EMP_WATANABE,
} from "./helpers";

// AI はフェイク（KIZAMI_FAKE=1）で動かし、画面の流れだけを確かめる。

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test("Kizami に書いた内容から打刻修正の下書きを作り、フォームに入る", async ({
  page,
}) => {
  await login(page, EMP_WATANABE);
  await page.goto("/requests");
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("textbox", { name: "Kizami への入力" })
    .fill("昨日の退勤を押し忘れた。19時に帰りました");
  await page.getByRole("button", { name: "送る" }).click();

  await expect(page.getByText("下書きを作りました")).toBeVisible();
  await page.getByRole("link", { name: "フォームで確認する" }).click();
  await page.waitForURL(/from=kizami/);

  const form = page.locator("form", {
    has: page.getByRole("button", { name: "打刻修正を申請" }),
  });
  await expect(form.getByLabel("対象勤務日")).toHaveValue(
    addDays(jstToday(), -1),
  );
  await expect(form.getByRole("textbox", { name: "時刻" }).first()).toHaveValue(
    "19:00",
  );
  await expect(form.getByLabel("理由")).toHaveValue("退勤の打刻漏れ");
});

test("管理者が兆しの説明を Kizami に頼み、本人に声をかける", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/admin/insights");
  await page.waitForLoadState("networkidle");

  const card = page.getByLabel(/伊藤 さくら 打刻漏れ/).first();
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Kizami にくわしく説明してもらう" })
    .click();
  await expect(card.getByText(/^\[Kizami\]/)).toBeVisible();

  await card.getByRole("button", { name: "声をかける" }).click();
  const draft = card.getByRole("textbox");
  await expect(draft).toHaveValue(/伊藤 さくらさん/);
  await card.getByRole("button", { name: "送る" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("メッセージを送りました")).toBeVisible();

  await logout(page);
  await login(page, EMP_ITO);
  await page.goto("/notifications");
  await expect(page.getByText("打刻漏れについて").first()).toBeVisible();
});
