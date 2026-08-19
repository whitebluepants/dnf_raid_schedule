import { expect, test } from "@playwright/test";

import {
  addCharacter,
  createAndSelectSpace,
  createHardActivity,
  e2eEnabled,
  goTo,
  identityFor,
  registerAndLogIn,
  signUpAllCharacters,
} from "./helpers";

test.describe("认证、空间、角色和活动报名", () => {
  test.skip(!e2eEnabled, "Set E2E_BASE_URL to opt in to browser E2E tests; no remote environment is assumed.");

  test("新成员在独立登录会话中可选择空间、维护角色并报名活动", async ({ browser }, testInfo) => {
    const identity = identityFor(testInfo, "auth-roster");
    const { context, page } = await registerAndLogIn(browser, identity);
    try {
      await createAndSelectSpace(page, identity.spaceName);

      await goTo(page, "/roster");
      await addCharacter(page, { account: "E2E-主账号", name: "E2E-剑魂", role: "dealer" });

      const activity = await createHardActivity(page, `E2E 报名活动 ${identity.nickname}`);
      await signUpAllCharacters(page, activity.getByRole("link", { name: "去报名" }), [{ name: "E2E-剑魂" }]);
      await expect(page.getByRole("checkbox", { name: /E2E-剑魂/ })).toBeChecked();
    } finally {
      await context.close();
    }
  });
});
