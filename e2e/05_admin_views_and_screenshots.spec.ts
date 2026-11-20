import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Scenario 8: Admin Control Tower Views & Full System Verification", () => {
  test("Executive Dashboard, Supply-Chain Pipeline, Transactions, Fraud Center, Network and Models", async ({ page }) => {
    // Authenticate as Admin
    await loginAs(page, "Alex Vance");

    // 1. Executive Dashboard
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Sentinel|Dashboard|Mempool|Volume|Blocks/i);
    await page.screenshot({ path: "docs/screenshots/00_executive_dashboard.png", fullPage: true });

    // 2. Supply-Chain Overview Pipeline
    await page.goto("/admin/overview");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Supply-Chain Overview");
    await expect(page.getByRole("heading", { name: /Produce at Stage: Farmer/i })).toBeVisible();
    await expect(page.getByText("Cooperative Aggregator")).toBeVisible();
    await expect(page.getByText("Industrial Processor")).toBeVisible();
    await expect(page.getByText("Distributor / Logistics")).toBeVisible();
    await expect(page.getByText("Retailer / Consumer Inward")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/08_supply_chain_pipeline.png", fullPage: true });

    // 3. All Transactions Table with Filters
    await page.goto("/admin/transactions");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("All Supply-Chain Transactions");
    await expect(page.getByPlaceholder(/Search by ID/i)).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/09_all_transactions.png", fullPage: true });

    // 4. Fraud Intelligence Center
    await page.goto("/admin/fraud");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Fraud Intelligence Center");
    await expect(page.getByRole("heading", { name: "Phantom quantity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Price manipulation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Concealed cold-chain breach" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organic label fraud" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Circular trading" })).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/10_fraud_intelligence_center.png", fullPage: true });

    // 5. Participant Registry & Network
    await page.goto("/admin/network");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Network|Nodes|Participants|Registry|Topography/i);
    await page.screenshot({ path: "docs/screenshots/11_participant_registry.png", fullPage: true });

    // 6. ML Models & Explainability
    await page.goto("/admin/model");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Model|Precision|Recall|Feature|SHAP|Weights/i);
    await page.screenshot({ path: "docs/screenshots/12_model_explainability.png", fullPage: true });
  });
});
