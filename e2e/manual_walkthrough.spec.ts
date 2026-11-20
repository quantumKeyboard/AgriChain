import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";
import fs from "fs";
import path from "path";

test.describe("Interactive End-to-End Manual Run & UI Audit", () => {
  test.setTimeout(120000);

  test.beforeAll(async () => {
    // Ensure screenshot directory exists
    const dir = path.join(process.cwd(), "docs", "manual_runs");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test("Run complete normal flow, fraud detection, auditor investigation and capture all UI states", async ({ page }) => {
    // Reset backend data for a clean state
    await page.request.post("/api/dev/reset");

    // =========================================================================
    // STEP 1: Unauthenticated Root Access Guard
    // =========================================================================
    await page.goto("/");
    await page.waitForURL("**/login");
    await expect(page.locator("span", { hasText: "SENTINEL ACCESS" })).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/01_unauthenticated_login_page.png", fullPage: true });

    // =========================================================================
    // STEP 2: Authenticate as Farmer (Ramesh Patil)
    // =========================================================================
    await page.getByRole("button", { name: /Ramesh Patil/i }).click();
    await page.waitForURL("**/portal");
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Ramesh Patil");

    // Verify role isolation: No Admin Tower button
    await expect(page.getByRole("button", { name: "Admin Tower" })).not.toBeVisible();
    await expect(page.locator("header")).toContainText("Participant Workspace");

    // Open User Account Menu to inspect profile card & absence of persona switcher
    await page.getByLabel("Account Menu").click();
    await expect(page.locator("header").getByText("Session Role")).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Sign Out" })).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: /Dr\. Sunita Sharma/i })).not.toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/02_farmer_portal_user_menu.png" });

    // Close user menu
    await page.getByLabel("Account Menu").click();
    await page.screenshot({ path: "docs/manual_runs/02_farmer_portal_overview.png", fullPage: true });

    // =========================================================================
    // STEP 3: Farmer Registers Legitimate Harvest Batch (4,000 kg Mango)
    // =========================================================================
    await page.getByRole("button", { name: /Register Harvest Batch/i }).click();
    await expect(page.getByText("Register Harvest Batch (Farmer)")).toBeVisible();

    // Verify fields in modal
    await expect(page.locator('input[type="number"]').first()).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/03_farmer_register_harvest_modal.png" });

    // Submit harvest registration
    await page.getByRole("button", { name: /Sign & Register Batch/i }).click();
    await expect(page.locator("text=Harvest Batch Registered & Signed")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/manual_runs/04_farmer_harvest_registered.png", fullPage: true });

    // =========================================================================
    // STEP 4: Farmer Dispatches Produce to Cooperative (C-001)
    // =========================================================================
    // Click Dispatch button in active harvest stocks
    const dispatchBtn = page.getByRole("button", { name: "Dispatch" }).first();
    await expect(dispatchBtn).toBeVisible();
    await dispatchBtn.click();

    // Modal opens
    await expect(page.getByText("Initiate Outward Transfer")).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/05_farmer_dispatch_modal.png" });

    // Submit outward dispatch
    await page.getByRole("button", { name: "Sign & Dispatch Transfer" }).click();
    await expect(page.locator("text=Transfer Dispatched & Signed")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/manual_runs/06_farmer_dispatched_success.png", fullPage: true });

    // =========================================================================
    // STEP 5: Verify Farmer Blocked From Admin Routes
    // =========================================================================
    await page.goto("/admin");
    await page.waitForURL("**/portal");
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/07_farmer_blocked_from_admin.png", fullPage: true });

    // =========================================================================
    // STEP 6: Sign Out -> Login as Cooperative (Solapur Agro)
    // =========================================================================
    await page.getByLabel("Account Menu").click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await page.waitForURL("**/login");
    await page.screenshot({ path: "docs/manual_runs/08_signed_out_to_login.png", fullPage: true });

    await page.getByRole("button", { name: /Solapur Agro-Cooperative/i }).click();
    await page.waitForURL("**/portal");
    await expect(page.locator("text=COOP WORKSPACE")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Solapur Agro-Cooperative");

    // Inward Handoff Queue must be visible
    await expect(page.getByText("Inward Handoff Queue")).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/09_coop_inward_queue.png", fullPage: true });

    // =========================================================================
    // STEP 7: Cooperative Performs Weighbridge Inward Acceptance
    // =========================================================================
    const weighBtn = page.getByRole("button", { name: /Weigh & Inward/i }).first();
    await expect(weighBtn).toBeVisible();
    await weighBtn.click();

    // Weighbridge modal opens: Enter within tolerance (e.g. 4,480 kg on 4,500 kg consignment)
    await expect(page.getByText("Weighbridge Inward & Reconciliation")).toBeVisible();
    const weighInput = page.locator('input[type="number"]').first();
    await weighInput.fill("4480");
    await expect(page.getByText("Calculated Weight Discrepancy:")).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/10_coop_weighbridge_acceptance_modal.png" });

    // Submit weighbridge acceptance
    await page.getByRole("button", { name: "Sign & Confirm Inward" }).click();
    await expect(page.locator("text=Transfer Accepted & Inwarded")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/manual_runs/11_coop_transfer_accepted.png", fullPage: true });

    // =========================================================================
    // STEP 8: Fraud Execution - Phantom Yield (85,000 kg on 5 acres)
    // =========================================================================
    // Switch back to Farmer
    await loginAs(page, "Ramesh Patil");
    await page.waitForURL("**/portal");

    // Open Harvest modal
    await page.getByRole("button", { name: /Register Harvest/i }).first().click();
    await expect(page.getByText("Register Harvest Batch (Farmer)")).toBeVisible();

    // Fill in impossible yield of 85,000 kg
    const phantomQtyInput = page.locator('input[type="number"]').first();
    await phantomQtyInput.fill("85000");

    // Verify real-time anomaly warning is triggered in UI
    await expect(page.getByText(/Anomaly: Quantity exceeds 2.5x plausible farm yield/i)).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/12_phantom_yield_warning.png" });

    // Submit batch
    await page.getByRole("button", { name: /Sign & Register Batch/i }).click();
    await expect(page.locator("text=Batch Quarantined: Phantom Yield")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/manual_runs/13_phantom_yield_quarantined.png", fullPage: true });

    // Also dispatch a second batch to create an active in-transit transfer for theft testing
    await page.getByRole("button", { name: /Register Harvest/i }).first().click();
    await page.getByRole("button", { name: /Sign & Register Batch/i }).click();
    await page.waitForTimeout(600);
    const secondDispatch = page.getByRole("button", { name: "Dispatch" }).first();
    await secondDispatch.click();
    await page.getByRole("button", { name: "Sign & Dispatch Transfer" }).click();
    await page.waitForTimeout(600);

    // =========================================================================
    // STEP 9: Fraud Execution - Weighbridge Theft Discrepancy (3,200 kg vs 4,000 kg)
    // =========================================================================
    // Switch to Coop
    await loginAs(page, "Solapur Agro-Cooperative");
    await page.waitForURL("**/portal");

    // Find the newly in-transit transfer
    const inTransitWeigh = page.getByRole("button", { name: /Weigh & Inward/i }).first();
    await expect(inTransitWeigh).toBeVisible();
    await inTransitWeigh.click();
    const theftInput = page.locator('input[type="number"]').first();
    await theftInput.fill("3200"); // 800 kg missing!
    await expect(page.getByText(/Discrepancy exceeds permissible tolerance/i)).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/14_weighbridge_theft_dispute_modal.png" });

    await page.getByRole("button", { name: "Sign & Confirm Inward" }).click();
    await expect(page.locator("text=Transfer Disputed")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/manual_runs/15_transfer_disputed_on_chain.png", fullPage: true });

    // =========================================================================
    // STEP 10: Auditor & Admin Investigation Tower
    // =========================================================================
    await loginAs(page, "Dr. Sunita Sharma");
    await page.waitForURL("**/admin");
    await expect(page.locator("header")).toContainText("AgriChain");
    await expect(page.locator("header")).toContainText("Auditor Regulatory Tower");
    await expect(page.getByRole("button", { name: "Participant Portal" })).not.toBeVisible();
    await expect(page.getByText("Value screened")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "docs/manual_runs/16_auditor_admin_tower_overview.png", fullPage: true });

    // Open Live Notification Bell Center
    const bellBtn = page.getByTitle(/Live Chain Updates/i);
    await expect(bellBtn).toBeVisible();
    await bellBtn.click();
    await expect(page.getByText(/Filtered for Dr. Sunita Sharma/i)).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/17_auditor_live_notifications_drawer.png" });
    await bellBtn.click();

    // Navigate to Quarantine Queue
    await page.getByRole("link", { name: "Quarantine", exact: true }).click();
    await page.waitForURL("**/admin/quarantine");
    await expect(page.locator("h1")).toContainText(/Quarantine/i);

    // Open first quarantined item for SHAP explainability audit
    const firstQuarantineRow = page.locator("table tbody tr").first();
    if (await firstQuarantineRow.isVisible().catch(() => false)) {
      await firstQuarantineRow.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: "docs/manual_runs/18_auditor_quarantine_shap_drawer.png" });

      // Click Reject to confirm fraud
      const rejectBtn = page.getByRole("button", { name: "Reject" });
      if (await rejectBtn.isVisible().catch(() => false)) {
        await rejectBtn.click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: "docs/manual_runs/19_auditor_fraud_rejected.png" });
      }
    }

    // Navigate to Lifecycle Explorer
    await page.getByRole("link", { name: "Lifecycle Explorer" }).click();
    await page.waitForURL("**/admin/lifecycle**");
    await expect(page.locator("span.text-xl").first()).toBeVisible();
    await page.screenshot({ path: "docs/manual_runs/20_lifecycle_explorer_dag.png", fullPage: true });

    // Navigate to Blockchain Ledger
    await page.getByRole("link", { name: "Ledger" }).click();
    await page.waitForURL("**/admin/ledger");
    await expect(page.locator("h1")).toContainText(/Ledger/i);

    // Click Verify Chain
    await page.getByRole("button", { name: /Verify chain/i }).click();
    await expect(page.locator("text=Chain intact")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "docs/manual_runs/21_blockchain_ledger_valid.png", fullPage: true });

    // Simulate Malicious Tamper Attack
    const attackBtn = page.getByRole("button", { name: /Edit a block header/i });
    await expect(attackBtn).toBeVisible();
    await attackBtn.click();
    await expect(page.locator("text=Tampering detected in block")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "docs/manual_runs/22_blockchain_tamper_attack.png", fullPage: true });

    // Reset and recover demo data
    const resetBtn = page.getByRole("button", { name: /Reset demo data/i });
    await resetBtn.click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Verify chain/i }).click();
    await expect(page.locator("text=Chain intact")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "docs/manual_runs/23_blockchain_restored_clean.png", fullPage: true });
  });
});
