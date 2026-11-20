import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Scenario 7: Blockchain Ledger Verification & Tamper Detection", () => {
  test("Blockchain Explorer, cryptographic verification, tamper attack simulation and recovery", async ({ page }) => {
    // Reset data first to ensure clean state
    await page.request.post("/api/dev/reset");

    // Authenticate as Admin to access blockchain management
    await loginAs(page, "Alex Vance");

    // 1. Navigate to Ledger
    await page.goto("/admin/ledger");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1")).toContainText(/Ledger/i);
    await expect(page.getByRole("button", { name: /Verify chain/i })).toBeVisible();

    // 2. Click Verify chain
    await page.getByRole("button", { name: /Verify chain/i }).click();

    // Expect chain intact confirmation
    await expect(page.locator("text=Chain intact")).toBeVisible({ timeout: 15000 });

    // Capture screenshot of valid chain
    await page.screenshot({ path: "docs/screenshots/07_blockchain_valid.png", fullPage: true });

    // 3. Simulate an attack: Edit a block header (nonce)
    const attackButton = page.getByRole("button", { name: /Edit a block header/i });
    await expect(attackButton).toBeVisible();
    await attackButton.click();

    // Expect tampering alert
    await expect(page.locator("text=Tampering detected in block")).toBeVisible({ timeout: 15000 });

    // Capture screenshot of tampered blockchain
    await page.screenshot({ path: "docs/screenshots/07_blockchain_tampered.png", fullPage: true });

    // 4. Recover & Reseed Demo Data
    const resetButton = page.getByRole("button", { name: /Reset demo data/i });
    await expect(resetButton).toBeVisible();
    await resetButton.click();
    await page.waitForTimeout(2000);

    // Verify chain again after reset
    await page.getByRole("button", { name: /Verify chain/i }).click();
    await expect(page.locator("text=Chain intact")).toBeVisible({ timeout: 15000 });
  });
});
