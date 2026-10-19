const MAX_CENTS = 2_000_000_000;

export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
