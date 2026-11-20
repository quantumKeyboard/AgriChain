import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RuleList, ShapBars } from "../components/Explain";
import { RiskSun } from "../components/RiskSun";
import { SignatureLine } from "../components/TxDrawer";
import { StatusBadge } from "../components/ui";
import type { TxView } from "../api/types";
import { decisionFor, inrCompact, kg, shortHash } from "../lib/format";

describe("RiskSun", () => {
  it("announces the risk and decision band, not just colour", () => {
    render(<RiskSun risk={0.83} />);
    expect(screen.getByRole("img", { name: "Risk 83 percent — Quarantine" })).toBeInTheDocument();
    expect(screen.getByText("QUARANTINE")).toBeInTheDocument();
  });
  it("uses the configured thresholds", () => {
    render(<RiskSun risk={0.45} flag={0.4} quarantine={0.7} />);
    expect(screen.getByText("FLAG")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("renders a text label for every status", () => {
    render(<StatusBadge status="REJECTED" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});

describe("Explanations", () => {
  it("lists rules by severity", () => {
    render(
      <RuleList
        hits={[
          { id: "PRICE_BAND", severity: 0.5, reason: "price" },
          { id: "DUPLICATE", severity: 0.9, reason: "dup" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("DUPLICATE");
  });
  it("shows an empty message without rules", () => {
    render(<RuleList hits={[]} />);
    expect(screen.getByText(/No business rule fired/)).toBeInTheDocument();
  });
  it("renders one SHAP row per feature with signed values", () => {
    render(
      <ShapBars
        items={[
          { feature: "a", label: "Alpha", value: 2, contribution: 0.3 },
          { feature: "b", label: "Beta", value: 0, contribution: -0.1 },
        ]}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText(/\+0\.300/)).toBeInTheDocument();
    expect(screen.getByText(/-0\.100/)).toBeInTheDocument();
  });
});

describe("format helpers", () => {
  it("formats Indian currency units", () => {
    expect(inrCompact(2.5e7)).toBe("₹2.50 Cr");
    expect(inrCompact(350000)).toBe("₹3.50 L");
  });
  it("formats weights and hashes", () => {
    expect(kg(500)).toBe("500 kg");
    expect(kg(12500)).toBe("12.5 t");
    expect(shortHash("abcdef0123456789")).toBe("0xabcdef…6789");
  });
  it("maps risk to decisions", () => {
    expect(decisionFor(0.1)).toBe("CLEAR");
    expect(decisionFor(0.5)).toBe("FLAGGED");
    expect(decisionFor(0.7)).toBe("QUARANTINED");
  });
});

describe("SignatureLine", () => {
  const base = { signature: "ab".repeat(32), seller_public_key: "cd".repeat(16) } as const;
  it("shows a valid seller signature", () => {
    render(<SignatureLine tx={{ ...base, signature_valid: true } as unknown as TxView} />);
    expect(screen.getByText(/Seller signature valid/)).toBeInTheDocument();
  });
  it("flags a signature that does not match the seller key", () => {
    render(<SignatureLine tx={{ ...base, signature_valid: false } as unknown as TxView} />);
    expect(screen.getByText(/does NOT match/)).toBeInTheDocument();
  });
});
