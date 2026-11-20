import { type Page, expect } from "@playwright/test";

/**
 * Robust helper to authenticate as a specific persona by logging out if necessary,
 * navigating to /login, and selecting the verified demo persona card.
 */
export async function loginAs(page: Page, personaName: string) {
  // Check if already authenticated and logged in
  const accountMenu = page.getByLabel("Account Menu");
  const isMenuVisible = await accountMenu.isVisible({ timeout: 1200 }).catch(() => false);

  if (isMenuVisible) {
    await accountMenu.click();
    const signOutBtn = page.getByRole("button", { name: /Sign Out/i });
    if (await signOutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signOutBtn.click();
      await page.waitForURL("**/login");
    }
  } else if (!page.url().includes("/login")) {
    await page.goto("/login");
  }

  await page.waitForLoadState("networkidle");

  // Ensure "Instant Demo Personas" tab is active
  const demoTab = page.getByRole("button", { name: "Instant Demo Personas" });
  if (await demoTab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await demoTab.click();
  }

  // Click the demo persona card in main container
  const personaBtn = page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(personaName, "i") })
    .first();
  await expect(personaBtn).toBeVisible({ timeout: 8000 });
  await personaBtn.click();

  // Wait for post-login navigation to complete
  await page.waitForLoadState("networkidle");
}
