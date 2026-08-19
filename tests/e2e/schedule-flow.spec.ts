import { expect, test } from "@playwright/test";

import {
  addCompleteHardWaveRoster,
  createAndSelectSpace,
  createHardActivity,
  e2eEnabled,
  goTo,
  identityFor,
  joinSpace,
  logInFreshContext,
  readInviteCode,
  registerAndLogIn,
  registerAccount,
  signUpAllCharacters,
} from "./helpers";

test.describe("排表生成、手动保存和发布", () => {
  test.skip(!e2eEnabled, "Set E2E_BASE_URL to opt in to browser E2E tests; no remote environment is assumed.");

  test("管理员保存真实手动交换后发布，独立成员会话可读取发布状态", async ({ browser }, testInfo) => {
    const adminIdentity = identityFor(testInfo, "schedule-admin");
    const viewerIdentity = identityFor(testInfo, "schedule-viewer");
    const adminSession = await registerAndLogIn(browser, adminIdentity);
    try {
      const { page: adminPage } = adminSession;
      await createAndSelectSpace(adminPage, adminIdentity.spaceName);
      const characters = await addCompleteHardWaveRoster(adminPage);

      const title = `E2E 排表活动 ${adminIdentity.nickname}`;
      const activity = await createHardActivity(adminPage, title);
      await signUpAllCharacters(adminPage, activity.getByRole("link", { name: "去报名" }), characters);
      await goTo(adminPage, "/activities");
      const activityCard = adminPage
        .getByRole("heading", { name: title, exact: true })
        .locator("xpath=ancestor::div[.//a[normalize-space(.)='进入排表工作台']][1]");
      const scheduleLink = activityCard.getByRole("link", { name: "进入排表工作台", exact: true });
      const scheduleHref = await scheduleLink.getAttribute("href");
      if (!scheduleHref) throw new Error("Expected a schedule workbench URL for the created E2E activity.");
      await scheduleLink.click();

      await adminPage.getByRole("button", { name: "自动生成", exact: true }).click();
      await expect(adminPage.getByRole("status")).toContainText("初稿已生成");
      const dealerSlots = adminPage.getByRole("button", { name: / C 槽位，E2E-/ });
      await expect(dealerSlots).toHaveCount(9);
      const firstSlot = dealerSlots.nth(0);
      const secondSlot = dealerSlots.nth(1);
      const firstBefore = await firstSlot.getAttribute("aria-label");
      const secondBefore = await secondSlot.getAttribute("aria-label");
      const [, firstSlotLabel, firstCharacter] = firstBefore?.match(/^(.*)，(E2E-[^，]+)$/) ?? [];
      const [, secondSlotLabel, secondCharacter] = secondBefore?.match(/^(.*)，(E2E-[^，]+)$/) ?? [];
      if (!firstSlotLabel || !firstCharacter || !secondSlotLabel || !secondCharacter) {
        throw new Error(`Expected two occupied dealer slots before the manual swap: ${firstBefore}; ${secondBefore}`);
      }
      const firstAfter = `${firstSlotLabel}，${secondCharacter}`;
      const secondAfter = `${secondSlotLabel}，${firstCharacter}`;

      // This is a real state change: two distinct dealer assignments exchange
      // slots, then the persisted server snapshot is verified after reload.
      await firstSlot.click();
      await secondSlot.click();
      await expect(firstSlot).toHaveAttribute("aria-label", firstAfter);
      await expect(secondSlot).toHaveAttribute("aria-label", secondAfter);
      await adminPage.getByRole("button", { name: "保存草稿", exact: true }).click();
      await expect(adminPage.getByRole("status")).toContainText("草稿已保存");
      await adminPage.reload();
      await expect(adminPage.getByRole("button", { name: firstAfter, exact: true })).toBeVisible();
      await expect(adminPage.getByRole("button", { name: secondAfter, exact: true })).toBeVisible();

      await adminPage.getByRole("button", { name: "发布排表", exact: true }).click();
      await expect(adminPage.getByRole("status")).toContainText("排表已发布");

      await goTo(adminPage, "/spaces");
      const inviteCode = await readInviteCode(adminPage, adminIdentity.spaceName);
      await registerAccount(browser, viewerIdentity);
      const viewerSession = await logInFreshContext(browser, viewerIdentity).catch(async (error) => {
        throw new Error(`Unable to establish the separate member session: ${String(error)}`);
      });
      try {
        await joinSpace(viewerSession.page, inviteCode);
        await goTo(viewerSession.page, scheduleHref);
        await expect(viewerSession.page.getByText("已发布", { exact: true })).toBeVisible();
        await expect(viewerSession.page.getByRole("button", { name: firstAfter, exact: true })).toBeDisabled();
        await expect(viewerSession.page.getByRole("button", { name: secondAfter, exact: true })).toBeDisabled();
      } finally {
        await viewerSession.context.close();
      }
    } finally {
      await adminSession.context.close();
    }
  });
});
