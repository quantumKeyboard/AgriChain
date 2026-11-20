import { test, expect } from "@playwright/test";

test.describe("Scenario 6: Clerk Custom Authentication & Instant Demo Personas", () => {
  test("Custom Login UI, Demo Persona Switching, Clerk Form & Custom Sign-Up", async ({ page }) => {
    // 1. Visit Custom Login Page
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Brand & Security header
    await expect(page.locator("span", { hasText: "SENTINEL ACCESS" })).toBeVisible();
    await expect(page.locator("text=Intelligent Agricultural Fraud Detection & Blockchain Ledger Platform")).toBeVisible();
    await expect(page.getByRole("button", { name: "Instant Demo Personas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Custom Clerk Sign-In" })).toBeVisible();

    // Verify all 7 demo persona cards are present
    await expect(page.getByText("Alex Vance (SuperAdmin)")).toBeVisible();
    await expect(page.getByText("Dr. Sunita Sharma (Auditor)")).toBeVisible();
    await expect(page.getByText("Ramesh Patil (Kisan Farm)")).toBeVisible();
    await expect(page.getByText("Solapur Agro-Cooperative")).toBeVisible();
    await expect(page.getByText("AgroPack Foods Pvt Ltd")).toBeVisible();
    await expect(page.getByText("ColdTrans Logistics")).toBeVisible();
    await expect(page.getByText("FreshMart Retail Organics")).toBeVisible();

    // Take screenshot of Login Demo Persona Grid
    await page.screenshot({ path: "docs/screenshots/13_custom_clerk_login.png", fullPage: true });

    // 2. Test 1-click Instant Demo login as Farmer
    await page.getByRole("button", { name: /Ramesh Patil/i }).click();
    await page.waitForURL("**/portal");

    // Verify Farmer Workspace loaded
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Ramesh Patil");

    // 3. Test Logout flow
    // Click on User Profile dropdown in Header
    await page.getByLabel("Account Menu").click();
    await expect(page.getByRole("button", { name: /Sign Out/i })).toBeVisible();

    // Click Sign Out
    await page.getByRole("button", { name: /Sign Out/i }).click();
    await page.waitForURL("**/login");
    await expect(page.locator("span", { hasText: "SENTINEL ACCESS" })).toBeVisible();

    // 4. Test 1-click Instant Demo login as Auditor
    await page.getByRole("button", { name: "Dr. Sunita Sharma (Auditor)" }).click();
    await page.waitForURL("**/admin");

    // Verify Admin / Auditor Control Tower loaded
    await expect(page.locator("header")).toContainText("AgriChain");
    await expect(page.getByRole("link", { name: "Quarantine", exact: true })).toBeVisible();

    // Sign out to test Custom Clerk Form
    await page.getByLabel("Account Menu").click();
    await page.getByRole("button", { name: /Sign Out/i }).click();
    await page.waitForURL("**/login");
    await page.waitForLoadState("networkidle");

    // Switch to Custom Clerk Sign-In tab
    await page.getByRole("button", { name: "Custom Clerk Sign-In" }).click();
    await expect(page.getByRole("heading", { name: "Sign In with Clerk" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. ramesh@kisanfarm.in or admin@agrichain.sentinel")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••••••")).toBeVisible();

    // Attempt sign-in with non-existent credentials to verify error handling
    await page.getByPlaceholder("e.g. ramesh@kisanfarm.in or admin@agrichain.sentinel").fill("invalid_user@testdomain.org");
    await page.getByPlaceholder("••••••••••••").fill("WrongPassword123!");
    await page.getByRole("button", { name: /Sign In to AgriChain/i }).click();

    // Verify error notification / banner appears gracefully
    await expect(page.locator(".bg-quar\\/10")).toBeVisible({ timeout: 10000 });

    // 6. Navigate to Custom Sign-Up Page
    await page.getByRole("link", { name: "Register New Organization →" }).click();
    await page.waitForURL("**/signup");

    // Verify Custom Sign-Up elements
    await expect(page.locator("span", { hasText: "NETWORK ENROLLMENT" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Ramesh Patil")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. ramesh@kisanfarm.in")).toBeVisible();
    await expect(page.getByPlaceholder("Minimum 8 characters")).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Kisan Agro Orchards Pvt Ltd")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Solapur, Maharashtra")).toBeVisible();

    // Test filling out organization registration form
    await page.getByPlaceholder("e.g. Ramesh Patil").fill("Devendra Joshi");
    await page.getByPlaceholder("e.g. ramesh@kisanfarm.in").fill("devendra@sahyadriagro.in");
    await page.getByPlaceholder("Minimum 8 characters").fill("SentinelSecure2026!");
    await page.locator("select").selectOption("PROCESSOR");
    await page.getByPlaceholder("e.g. Kisan Agro Orchards Pvt Ltd").fill("Sahyadri Food Processors Ltd");
    await page.getByPlaceholder("e.g. Solapur, Maharashtra").fill("Baramati Food Park, Pune, Maharashtra");

    // Take screenshot of Custom Clerk Registration form
    await page.screenshot({ path: "docs/screenshots/14_custom_clerk_signup.png", fullPage: true });

    // Verify link back to login
    await page.getByRole("link", { name: "Sign In to Existing Account →" }).click();
    await page.waitForURL("**/login");
    await expect(page.locator("span", { hasText: "SENTINEL ACCESS" })).toBeVisible();
  });
});
