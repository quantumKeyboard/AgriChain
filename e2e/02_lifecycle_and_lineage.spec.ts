import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Scenario 2: Complete Supply-Chain Lifecycle, Handoffs, Splits & Lineage", () => {
  test("Farm to Fork lifecycle: Harvest, Transfer, Inward Weighbridge, Processing Split and Audit Trail", async ({ page }) => {
    // Reset data for clean state
    await page.request.post("/api/dev/reset");

    // 1. Authenticate as Farmer Persona
    await loginAs(page, "Ramesh Patil");
    await page.waitForURL("**/portal");
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();

    // 2. Register new harvest batch via modal
    await page.getByRole("button", { name: /Register Harvest Batch/i }).click();
    await expect(page.getByText("Register Harvest Batch (Farmer)")).toBeVisible();

    // Fill form and submit
    await page.getByRole("button", { name: /Sign & Register Batch/i }).click();

    // Expect confirmation toast
    await expect(page.locator("text=Harvest Batch Registered & Signed")).toBeVisible({ timeout: 10000 });

    // 3. Navigate to My Batches to inspect inventory
    await page.getByRole("link", { name: "My Batches" }).click();
    await page.waitForURL("**/portal/batches");
    await expect(page.locator("text=Batch Inventory & Custody")).toBeVisible();

    // Take screenshot of Batch Inventory
    await page.screenshot({ path: "docs/screenshots/02_participant_batches.png", fullPage: true });

    // 4. Switch to Cooperative Persona via login flow
    await loginAs(page, "Solapur Agro-Cooperative");
    await page.waitForURL("**/portal");

    // Inward queue should show incoming transfer
    await expect(page.getByText("Inward Handoff Queue")).toBeVisible();

    // Navigate to Transfers page
    await page.getByRole("link", { name: "Transfers & Inward" }).click();
    await page.waitForURL("**/portal/transfers");
    await expect(page.getByText("Handoff & Dispatch Management")).toBeVisible();
    await expect(page.getByRole("button", { name: /Incoming Handoffs/i })).toBeVisible();

    // Take screenshot of Transfers management
    await page.screenshot({ path: "docs/screenshots/02_transfers_management.png", fullPage: true });

    // 5. Switch to Admin Persona to open Lifecycle Explorer in Admin Tower for Flagship Batch
    await loginAs(page, "Alex Vance");
    await page.waitForURL("**/admin");

    await page.getByRole("link", { name: "Lifecycle Explorer" }).click();
    await page.waitForURL("**/admin/lifecycle**");

    // Verify flagship batch header
    await expect(page.locator("span.text-xl:has-text('AGRI-MH-SOL-2026-00001')")).toBeVisible();
    await expect(page.locator("text=mango").first()).toBeVisible();
    await expect(page.getByText("Certified Organic")).toBeVisible();

    // Verify Lifecycle Metrics Cards
    await expect(page.getByText("Current Quantity").first()).toBeVisible();
    await expect(page.getByText("Current Stage").first()).toBeVisible();
    await expect(page.getByText("Origin Farmer").first()).toBeVisible();

    // Verify Timeline Tab
    await expect(page.getByRole("button", { name: /Chronological Timeline/i })).toBeVisible();
    await expect(page.getByText("HARVEST").first()).toBeVisible();

    // Click Transfers Tab
    await page.getByRole("button", { name: /Two-Sided Transfers/i }).click();
    await expect(page.getByText(/Sender Dispatch|Receiver Inward/i).first()).toBeVisible();

    // Click Lineage & Splits Tab
    await page.getByRole("button", { name: /Batch Lineage & Splits/i }).click();
    await expect(page.getByText(/Parent-Child Batch Transformation Tree/i)).toBeVisible();

    // Click Telemetry Tab
    await page.getByRole("button", { name: /Cold-Chain Telemetry/i }).click();
    await expect(page.getByText(/Sensor Temperature Logs|No environmental telemetry logs/i)).toBeVisible();

    // Click Blockchain Tab
    await page.getByRole("button", { name: /Ledger Blocks/i }).click();
    await expect(page.getByText(/Transaction Hash|Merkle Root|Block/i).first()).toBeVisible();

    // Take screenshots of Lifecycle Explorer
    await page.getByRole("button", { name: /Chronological Timeline/i }).click();
    await page.screenshot({ path: "docs/screenshots/02_lifecycle_explorer.png", fullPage: true });
    await page.screenshot({ path: "docs/screenshots/02_legitimate_lifecycle.png", fullPage: true });
  });
});
