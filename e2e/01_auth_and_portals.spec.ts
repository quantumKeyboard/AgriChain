import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Scenario 1: Authentication, Route Guards & Dual-Portal Separation", () => {
  test("Unauthenticated protection, persona login/logout, route isolation and role-tailored views", async ({ page }) => {
    // 1. Verify unauthenticated access redirects to /login
    await page.goto("/");
    await page.waitForURL("**/login");
    await expect(page.locator("span", { hasText: "SENTINEL ACCESS" })).toBeVisible();

    // 2. Log in as Farmer (Ramesh Patil) via Login page
    await page.getByRole("button", { name: /Ramesh Patil/i }).click();
    await page.waitForURL("**/portal");

    // Expect brand header
    await expect(page.locator("header")).toContainText("AgriChain");
    await expect(page.locator("header")).toContainText("SENTINEL");

    // Verify Farmer Workspace
    await expect(page.locator("h1")).toContainText("Ramesh Patil");
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();
    await expect(page.getByRole("button", { name: /Register Harvest Batch/i })).toBeVisible();

    // Verify role isolation: "Admin Tower" MUST NOT be visible for Farmer
    await expect(page.getByRole("button", { name: "Admin Tower" })).not.toBeVisible();
    await expect(page.locator("header")).toContainText("Participant Workspace");

    // Verify user menu in top bar has NO persona switcher dropdown!
    await page.getByLabel("Account Menu").click();
    // Expect the profile details and Sign Out button
    await expect(page.locator("header").getByText("Session Role")).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Sign Out" })).toBeVisible();
    // Verify that other personas are NOT clickable in header dropdown
    await expect(page.locator("header").getByRole("button", { name: /Dr\. Sunita Sharma/i })).not.toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: /Alex Vance/i })).not.toBeVisible();

    // Close dropdown
    await page.getByLabel("Account Menu").click();

    // Verify Protected Route: Farmer attempting to visit /admin must be redirected back to /portal
    await page.goto("/admin");
    await page.waitForURL("**/portal");
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();

    // Take screenshot of Farmer Workspace
    await page.screenshot({ path: "docs/screenshots/01_farmer_workspace.png", fullPage: true });

    // 3. Switch Account via Sign Out -> Login as Cooperative (Solapur Agro)
    await page.getByLabel("Account Menu").click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await page.waitForURL("**/login");

    await page.getByRole("button", { name: /Solapur Agro-Cooperative/i }).click();
    await page.waitForURL("**/portal");

    // Verify Coop Workspace
    await expect(page.locator("h1")).toContainText("Solapur Agro-Cooperative");
    await expect(page.locator("text=COOP WORKSPACE")).toBeVisible();
    await expect(page.getByText("Inward Handoff Queue")).toBeVisible();

    // 4. Switch Account via Sign Out -> Login as Processor (AgroPack)
    await page.getByLabel("Account Menu").click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await page.waitForURL("**/login");

    await page.getByRole("button", { name: /AgroPack Foods/i }).click();
    await page.waitForURL("**/portal");

    // Verify Processor Workspace
    await expect(page.locator("h1")).toContainText("AgroPack Foods");
    await expect(page.locator("text=PROCESSOR WORKSPACE")).toBeVisible();

    // 5. Navigate to Cryptographic Identity page
    await page.getByRole("link", { name: "Crypto Identity" }).click();
    await page.waitForURL("**/portal/identity");
    await expect(page.getByText("Participant Digital Identity & Cryptographic Keys")).toBeVisible();
    await expect(page.getByText("Ed25519 Public Key")).toBeVisible();

    // Take screenshot of Participant Identity
    await page.screenshot({ path: "docs/screenshots/01_crypto_identity.png", fullPage: true });

    // 6. Switch Account via Sign Out -> Login as SuperAdmin (Alex Vance)
    await page.getByLabel("Account Menu").click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await page.waitForURL("**/login");

    await page.getByRole("button", { name: /Alex Vance/i }).click();
    await page.waitForURL("**/admin");

    // Verify Admin Control Tower elements
    await expect(page.getByRole("button", { name: "Admin Tower" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Participant Portal" })).toBeVisible();

    // Verify Admin Navigation links
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lifecycle Explorer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fraud Center" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Quarantine", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ledger" })).toBeVisible();

    // Take screenshot of Admin Portal
    await page.screenshot({ path: "docs/screenshots/01_auth_portal_separation.png", fullPage: true });

    // 7. Verify Auditor Isolation (Dr. Sunita Sharma)
    await page.getByLabel("Account Menu").click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await page.waitForURL("**/login");

    await page.getByRole("main").getByRole("button", { name: /Dr\. Sunita Sharma/i }).first().click();
    await page.waitForURL("**/admin");

    // Auditor sees Auditor Regulatory Tower, NOT Participant Portal switcher
    await expect(page.locator("header")).toContainText("Auditor Regulatory Tower");
    await expect(page.getByRole("button", { name: "Participant Portal" })).not.toBeVisible();

    // Auditor attempting to browse /portal directly is guarded & redirected to /admin
    await page.goto("/portal");
    await page.waitForURL("**/admin");
    await expect(page.locator("header")).toContainText("Auditor Regulatory Tower");
  });
});
