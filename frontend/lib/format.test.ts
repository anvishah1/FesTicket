import { describe, it, expect } from "vitest";
import { formatCurrency, formatPaise, formatNumber } from "@/lib/format";

describe("lib/format formatCurrency", () => {
  it("renders whole rupees with two decimals", () => {
    expect(formatCurrency(118)).toBe("₹118.00");
  });

  it("uses Indian lakh grouping", () => {
    expect(formatCurrency(123456)).toBe("₹1,23,456.00");
  });

  it("rounds to 2 decimals and strips Float storage artifacts", () => {
    // Float artifact from money-as-Float storage.
    expect(formatCurrency(118.00000001)).toBe("₹118.00");
    // Genuine third-decimal value rounds to paise.
    expect(formatCurrency(1234.567)).toBe("₹1,234.57");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("₹0.00");
  });

  it("treats NaN / null / undefined as 0", () => {
    expect(formatCurrency(NaN)).toBe("₹0.00");
    expect(formatCurrency(undefined as unknown as number)).toBe("₹0.00");
    expect(formatCurrency(null as unknown as number)).toBe("₹0.00");
  });

  it("supports a custom currency code", () => {
    // en-IN still groups in the Indian style; the symbol switches to the currency.
    expect(formatCurrency(1000, "USD")).toContain("1,000.00");
  });
});

describe("lib/format formatPaise", () => {
  it("renders integer paise as two-decimal rupees", () => {
    expect(formatPaise(12036)).toBe("₹120.36");
  });

  it("formats zero paise", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });

  it("treats NaN / null / undefined as 0", () => {
    expect(formatPaise(NaN)).toBe("₹0.00");
    expect(formatPaise(undefined as unknown as number)).toBe("₹0.00");
    expect(formatPaise(null as unknown as number)).toBe("₹0.00");
  });

  it("uses Indian lakh grouping", () => {
    // 12,345,600 paise = ₹1,23,456.00
    expect(formatPaise(12345600)).toBe("₹1,23,456.00");
  });
});

describe("lib/format formatNumber", () => {
  it("uses Indian grouping without a currency symbol", () => {
    expect(formatNumber(123456)).toBe("1,23,456");
  });

  it("treats NaN as 0", () => {
    expect(formatNumber(NaN)).toBe("0");
  });
});
