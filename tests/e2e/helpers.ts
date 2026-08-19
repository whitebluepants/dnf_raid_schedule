import { expect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";

export const e2eBaseUrl = process.env.E2E_BASE_URL?.trim();
export const e2eEnabled = Boolean(e2eBaseUrl);

type E2EIdentity = {
  nickname: string;
  password: string;
  spaceName: string;
};

/**
 * E2E_RUN_ID makes test identities reproducible and keeps test-created data
 * isolated. It is an identifier, not a credential and is safe to put in CI.
 */
export function identityFor(testInfo: TestInfo, label: string): E2EIdentity {
  const runId = process.env.E2E_RUN_ID?.trim();
  if (!runId) {
    throw new Error("E2E_RUN_ID is required when E2E_BASE_URL is set; choose a unique non-secret run identifier.");
  }
  const suffix = `${runId}-${label}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 48);
  return {
    nickname: `E2E-${suffix}`,
    password: `E2e-${suffix}-safe-password`,
    spaceName: `E2E space ${suffix}`,
  };
}

function targetUrl(path: string): string {
  if (!e2eBaseUrl) throw new Error("E2E_BASE_URL is required to navigate an opt-in E2E browser session.");
  return new URL(path, e2eBaseUrl).toString();
}

export async function goTo(page: Page, path: string) {
  await page.goto(targetUrl(path));
}

export async function registerAccount(browser: Browser, identity: E2EIdentity) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await goTo(page, "/register");
  await page.getByLabel("昵称").fill(identity.nickname);
  await page.getByLabel("密码").fill(identity.password);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page).toHaveURL(/\/spaces$/, { timeout: 20_000 });
  await context.close();
}

export async function logInFreshContext(browser: Browser, identity: E2EIdentity): Promise<{ context: BrowserContext; page: Page }> {
  // Registration and login intentionally use distinct contexts: a credential
  // login cannot inherit an authenticated registration session.
  const context = await browser.newContext();
  const page = await context.newPage();
  await goTo(page, "/login");
  await page.getByLabel("昵称").fill(identity.nickname);
  await page.getByLabel("密码").fill(identity.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/spaces$/);
  return { context, page };
}

export async function registerAndLogIn(browser: Browser, identity: E2EIdentity) {
  await registerAccount(browser, identity);
  return logInFreshContext(browser, identity);
}

export async function createAndSelectSpace(page: Page, spaceName: string) {
  const createSection = page.getByRole("heading", { name: "创建空间" }).locator("..");
  await createSection.getByLabel("空间名称").fill(spaceName);
  await createSection.getByRole("button", { name: "创建空间", exact: true }).click();
  await expect(page).toHaveURL(/\/activities$/);

  await goTo(page, "/spaces");
  await expect(page.getByRole("heading", { name: spaceName })).toBeVisible();
  await expect(page.getByRole("button", { name: "当前空间", exact: true })).toBeDisabled();
}

export async function readInviteCode(page: Page, spaceName: string): Promise<string> {
  const inviteCode = await page.getByRole("heading", { name: spaceName }).locator("..").locator("code").textContent();
  if (!inviteCode) throw new Error(`Expected an invite code for E2E space ${spaceName}.`);
  return inviteCode;
}

export async function joinSpace(page: Page, inviteCode: string) {
  await goTo(page, "/spaces");
  const joinSection = page.getByRole("heading", { name: "加入空间" }).locator("..");
  await joinSection.getByLabel("邀请码").fill(inviteCode);
  await joinSection.getByRole("button", { name: "加入空间", exact: true }).click();
  await expect(page).toHaveURL(/\/activities$/);
}

export async function addCharacter(
  page: Page,
  character: { account: string; name: string; role: "dealer" | "buffer" },
) {
  await page.getByRole("button", { name: "新增角色", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增角色" });
  await dialog.getByLabel("新账号名").fill(character.account);
  await dialog.getByRole("button", { name: "添加账号", exact: true }).click();
  await expect(page.getByText("账号已添加，可以继续填写角色资料。")).toBeVisible();
  await dialog.getByLabel("角色名").fill(character.name);
  await dialog.getByLabel("职业").fill(character.role === "buffer" ? "圣职者" : "剑魂");
  await dialog.getByLabel("定位").selectOption(character.role);
  await dialog.getByLabel("名望").fill(character.role === "buffer" ? "65000" : "70000");
  await dialog.getByLabel("强度档位").selectOption("high");
  if (character.role === "buffer") {
    await dialog.getByLabel("奶量").fill("10000");
  } else {
    await dialog.getByLabel("模拟伤害").fill("1000");
  }
  await dialog.getByRole("button", { name: "保存角色", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: character.name })).toBeVisible();
}

export async function addCharacterToExistingAccount(
  page: Page,
  character: { account: string; name: string; role: "dealer" | "buffer" },
) {
  await page.getByRole("button", { name: "新增角色", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增角色" });
  await dialog.getByRole("combobox", { name: "账号", exact: true }).selectOption({ label: character.account });
  await dialog.getByLabel("角色名").fill(character.name);
  await dialog.getByLabel("职业").fill(character.role === "buffer" ? "圣职者" : "剑魂");
  await dialog.getByLabel("定位").selectOption(character.role);
  await dialog.getByLabel("名望").fill(character.role === "buffer" ? "65000" : "70000");
  await dialog.getByLabel("强度档位").selectOption("high");
  if (character.role === "buffer") {
    await dialog.getByLabel("奶量").fill("10000");
  } else {
    await dialog.getByLabel("模拟伤害").fill("1000");
  }
  await dialog.getByRole("button", { name: "保存角色", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: character.name })).toBeVisible();
}

export async function addCompleteHardWaveRoster(page: Page) {
  await goTo(page, "/roster");
  const characters = [
    ...Array.from({ length: 3 }, (_, index) => ({ account: `E2E-奶账号-${index + 1}`, name: `E2E-奶-${index + 1}`, role: "buffer" as const })),
    ...Array.from({ length: 9 }, (_, index) => ({ account: `E2E-C账号-${index + 1}`, name: `E2E-C-${index + 1}`, role: "dealer" as const })),
  ];
  for (const character of characters) await addCharacter(page, character);
  return characters;
}

export async function createHardActivity(page: Page, title: string) {
  await goTo(page, "/activities");
  await page.getByLabel("活动名称").fill(title);
  await page.getByLabel("活动时间").fill("2030-01-05T20:00");
  await page.getByRole("button", { name: "创建活动", exact: true }).click();
  await expect(page.getByText("活动与波次已创建，可以通知团员报名。", { exact: true })).toBeVisible();
  // Current activity cards render the title and action links as siblings in
  // the same card body. Scope links to that shared ancestor rather than a
  // brittle fixed number of parent traversals.
  const activity = page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::div[.//a[normalize-space(.)='去报名']][1]");
  await expect(activity).toBeVisible();
  return activity;
}

export async function signUpAllCharacters(page: Page, signupLink: Locator, characters: Array<{ name: string }>) {
  await signupLink.click();
  // This link performs a server navigation. Let the client form hydrate before
  // driving its submit handler; otherwise a fast browser can native-submit it.
  await page.waitForTimeout(800);
  await signUpCurrentActivity(page, characters);
}

export async function signUpCurrentActivity(page: Page, characters: Array<{ name: string }>) {
  // The current signup page uses the activity title as its only heading;
  // bind to the actual registration form and its submit control instead.
  const signupForm = page
    .getByRole("button", { name: "保存报名", exact: true })
    .locator("xpath=ancestor::form[1]");
  await expect(signupForm).toBeVisible();
  for (const character of characters) {
    await signupForm.getByRole("checkbox", { name: new RegExp(character.name) }).check();
    await expect(signupForm.getByRole("checkbox", { name: new RegExp(character.name) })).toBeChecked();
  }
  await page.waitForTimeout(150);
  await signupForm.getByRole("button", { name: "保存报名", exact: true }).click();
  await page.waitForTimeout(700);
  for (const character of characters) {
    await expect(page.getByRole("checkbox", { name: new RegExp(character.name) })).toBeChecked();
  }
}
