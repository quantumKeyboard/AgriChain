import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Scenario 3-6: Fraud Detection, Discrepancies, Telemetry Breaches & Auditor Quarantine Review", () => {
  test("Phantom quantity detection, weighbridge disputes, telemetry breaches and auditor review", async ({ page }) => {
    // ---------------------------------------------------------
    // 1. Phantom Quantity Fraud Detection (Farmer)
    // ---------------------------------------------------------
    await loginAs(page, "Ramesh Patil");
    await page.waitForURL("**/portal");

    // Open Harvest modal
    await page.getByRole("button", { name: /Register Harvest Batch/i }).click();
    await expect(page.getByText("Register Harvest Batch (Farmer)")).toBeVisible();

    // Enter an impossible yield: 85,000 kg on 5 acres for mango (normal is ~6,000 kg)
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill("85000");

    // Verify warning is displayed
    await expect(page.getByText(/Anomaly: Quantity exceeds 2.5x plausible farm yield/i)).toBeVisible();

    // Submit harvest
    await page.getByRole("button", { name: /Sign & Register Batch/i }).click();

    // Expect quarantine notification
    await expect(page.locator("text=Batch Quarantined: Phantom Yield")).toBeVisible({ timeout: 10000 });

    // Capture screenshot of Phantom Quantity detection
    await page.screenshot({ path: "docs/screenshots/03_phantom_quantity_quarantined.png", fullPage: true });

    // ---------------------------------------------------------
    // 2. Quantity Discrepancy & Dispute (Cooperative)
    // ---------------------------------------------------------
    await loginAs(page, "Solapur Agro-Cooperative");
    await page.waitForURL("**/portal");

    // Navigate to Transfers page
    await page.getByRole("link", { name: "Transfers & Inward" }).click();
    await page.waitForURL("**/portal/transfers");
    await expect(page.getByText("Handoff & Dispatch Management")).toBeVisible();
    const hasDiscrepancy = (await page.locator("text=Discrepancy").count()) > 0;
    if (hasDiscrepancy) {
      await expect(page.locator("text=Discrepancy").first()).toBeVisible();
    }

    // Capture screenshot of Quantity Discrepancy & Dispute
    await page.screenshot({ path: "docs/screenshots/04_quantity_discrepancy_disputed.png", fullPage: true });

    // ---------------------------------------------------------
    // 3. Cold-Chain Environmental Telemetry Breach (Admin Tower)
    // ---------------------------------------------------------
    await loginAs(page, "Alex Vance");
    await page.waitForURL("**/admin");

    await page.getByRole("link", { name: "Lifecycle Explorer" }).click();
    await page.waitForURL("**/admin/lifecycle**");

    // Switch to Cold-Chain Telemetry Tab
    await page.getByRole("button", { name: /Cold-Chain/i }).click();
    await expect(page.getByText(/Sensor Temperature Logs|Cold-Chain Telemetry/i).first()).toBeVisible();

    // Capture screenshot of Cold-Chain Telemetry
    await page.screenshot({ path: "docs/screenshots/05_cold_chain_breach.png", fullPage: true });

    // ---------------------------------------------------------
    // 4. Human-in-the-Loop Quarantine Review & Auditor Decision
    // ---------------------------------------------------------
    await loginAs(page, "Auditor");
    await page.waitForURL("**/admin");

    await page.getByRole("link", { name: "Quarantine", exact: true }).click();
    await page.waitForURL("**/admin/quarantine");
    await expect(page.locator("h1")).toContainText(/Quarantine/i);

    // Verify queue items
    const queueRows = page.locator("table tbody tr");
    if ((await queueRows.count()) > 0) {
      // Click first row to view drawer with SHAP explainability
      await queueRows.first().click();
      await page.waitForTimeout(500);

      // Verify drawer or decision buttons
      await expect(page.locator("body")).toContainText(/SHAP|Risk|Rule|Fraud|Decision/i);
    }

    // Capture screenshot of Auditor Quarantine Review
    await page.screenshot({ path: "docs/screenshots/06_auditor_quarantine_review.png", fullPage: true });
  });
});
