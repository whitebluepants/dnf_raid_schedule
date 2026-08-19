import { expect, test } from "@playwright/test";

import {
  addCharacter,
  addCharacterToExistingAccount,
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
  signUpCurrentActivity,
} from "./helpers";

test.describe("排表生成、手动保存和发布", () => {
  test.skip(!e2eEnabled, "Set E2E_BASE_URL to opt in to browser E2E tests; no remote environment is assumed.");

  test("管理员保存真实手动交换后发布，独立成员会话可读取发布状态", async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    const adminIdentity = identityFor(testInfo, "schedule-admin");
    const adminSession = await registerAndLogIn(browser, adminIdentity);
    try {
      const { page: adminPage } = adminSession;
      await createAndSelectSpace(adminPage, adminIdentity.spaceName);
      await goTo(adminPage, "/roster");
      await addCharacter(adminPage, { account: "E2E-游戏账号-01", name: "E2E-奶-01", role: "buffer" });
      await addCharacterToExistingAccount(adminPage, { account: "E2E-游戏账号-01", name: "E2E-C-01-备用", role: "dealer" });

      const title = `E2E 排表活动 ${adminIdentity.nickname}`;
      const activity = await createHardActivity(adminPage, title);
      const signupHref = await activity.getByRole("link", { name: "去报名" }).getAttribute("href");
      if (!signupHref) throw new Error("Expected an activity signup URL for the created E2E activity.");
      await signUpAllCharacters(adminPage, activity.getByRole("link", { name: "去报名" }), [{ name: "E2E-奶-01" }, { name: "E2E-C-01-备用" }]);
      await goTo(adminPage, "/spaces");
      const inviteCode = await readInviteCode(adminPage, adminIdentity.spaceName);

      // A real 12-person raid: 12 separately registered members/accounts. The
      // captain has two characters on one game account, so auto-assignment must
      // leave exactly one of them unused in this wave.
      const memberSessions = [];
      for (let index = 2; index <= 12; index += 1) {
        const identity = identityFor(testInfo, `schedule-member-${index}`);
        await registerAccount(browser, identity);
        const memberSession = await logInFreshContext(browser, identity);
        memberSessions.push(memberSession);
        await joinSpace(memberSession.page, inviteCode);
        await goTo(memberSession.page, "/roster");
        const role = index <= 3 ? "buffer" : "dealer";
        await addCharacter(memberSession.page, {
          account: `E2E-游戏账号-${String(index).padStart(2, "0")}`,
          name: role === "buffer" ? `E2E-奶-${String(index - 1).padStart(2, "0")}` : `E2E-C-${String(index).padStart(2, "0")}`,
          role,
        });
        await goTo(memberSession.page, signupHref);
        await signUpCurrentActivity(memberSession.page, [{ name: role === "buffer" ? `E2E-奶-${String(index - 1).padStart(2, "0")}` : `E2E-C-${String(index).padStart(2, "0")}` }]);
      }
      for (const session of memberSessions) await session.context.close();

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
      const allOccupiedSlots = adminPage.getByRole("button", { name: /槽位，E2E-/ });
      await expect(allOccupiedSlots).toHaveCount(12);
      const assignedNames = (await allOccupiedSlots.all()).map(async (slot) => (await slot.getAttribute("aria-label"))?.split("，")[1]);
      const resolvedNames = await Promise.all(assignedNames);
      expect(resolvedNames.filter((name) => name === "E2E-奶-01" || name === "E2E-C-01-备用")).toHaveLength(1);
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

      const viewerIdentity = identityFor(testInfo, "schedule-viewer");
      await registerAccount(browser, viewerIdentity);
      const viewerSession = await logInFreshContext(browser, viewerIdentity);
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
