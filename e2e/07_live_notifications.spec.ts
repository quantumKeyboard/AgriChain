import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Scenario 7: Live Chain Notification System & Streamlined Portals", () => {
  test("Live chain updates, participant-filtered notifications, Bell Drawer & unread management", async ({ page }) => {
    // Reset data for clean state
    await page.request.post("/api/dev/reset");

    // 1. Visit Participant Portal as Farmer (Ramesh Patil)
    await loginAs(page, "Ramesh Patil");
    await page.waitForURL("**/portal");
    await page.waitForLoadState("networkidle");

    // Verify Participant Workspace streamlined layout
    await expect(page.locator("h1")).toContainText("Ramesh Patil");
    await expect(page.locator("text=FARMER WORKSPACE")).toBeVisible();

    // Verify Live Chain Updates & Consignment Alerts section is visible
    await expect(page.getByText("Live Chain Updates & Consignment Alerts")).toBeVisible();
    await expect(page.getByText("Live Stream Active")).toBeVisible();

    // Verify notifications for Farmer exist (e.g. Weighbridge Discrepancy or Harvest)
    await expect(page.getByRole("main").getByText("Weighbridge Discrepancy Flagged")).toBeVisible();
    await expect(page.getByRole("main").getByText("Produce Lineage Fractionated")).toBeVisible();

    // Take screenshot of streamlined Participant Portal with Live Chain Feed
    await page.screenshot({ path: "docs/screenshots/16_participant_live_feed.png", fullPage: true });

    // 2. Test Live Notification Center Bell in Top Nav
    const bellBtn = page.getByTitle(/Live Chain Updates/i);
    await expect(bellBtn).toBeVisible();

    // Click bell to open Drawer
    await bellBtn.click();
    await expect(page.getByText(/Filtered for Ramesh Patil/i)).toBeVisible();

    // Verify Filter Tabs
    await expect(page.getByRole("button", { name: /Disputes & Alerts/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Lifecycle/i })).toBeVisible();

    // Click "Disputes & Alerts" filter tab
    await page.getByRole("button", { name: /Disputes & Alerts/i }).click();
    await expect(page.getByRole("banner").getByText("Weighbridge Discrepancy Flagged")).toBeVisible();

    // Take screenshot of open Notification Center
    await page.screenshot({ path: "docs/screenshots/15_live_notification_center.png" });

    // Test Mark All Read in Drawer
    const markAllBtn = page.getByRole("button", { name: /Mark all read/i });
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click();
      await page.waitForTimeout(500);
    }

    // Close Notification Center
    await bellBtn.click();

    // 3. Switch Persona to Cold-Chain Distributor (ColdTrans Logistics)
    await loginAs(page, "ColdTrans Logistics");
    await page.waitForURL("**/portal");
    await page.waitForLoadState("networkidle");

    // Verify Distributor Workspace
    await expect(page.locator("h1")).toContainText("ColdTrans Logistics");
    await expect(page.locator("text=DISTRIBUTOR WORKSPACE")).toBeVisible();

    // Open Notification Center for Distributor
    await bellBtn.click();
    await expect(page.getByText(/Filtered for ColdTrans Logistics/i)).toBeVisible();
    await expect(page.getByRole("banner").getByText(/Cold-Chain IoT Breach/i)).toBeVisible();

    // Close drawer
    await bellBtn.click();

    // 4. Switch Persona to Auditor (Dr. Sunita Sharma) in Admin Tower
    await loginAs(page, "Dr. Sunita Sharma");
    await page.waitForURL("**/admin");

    // Open Notification Center for Auditor
    await bellBtn.click();
    await expect(page.getByText(/Filtered for Dr. Sunita Sharma/i)).toBeVisible();
    await expect(page.getByRole("banner").getByText(/Quarantine Review Queue Alert/i)).toBeVisible();
    await expect(page.getByRole("banner").getByText(/Transaction Quarantined/i).first()).toBeVisible();
  });
});
