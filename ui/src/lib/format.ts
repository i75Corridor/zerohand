/**
 * Shared formatting utilities.
 */

/** Format cost in cents to a dollar string, e.g. 1234 -> "$12.34". */
export function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return "<$0.01";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Compact cost for chart axis labels, e.g. 1234 -> "$12". */
export function formatCostShort(cents: number): string {
  if (cents === 0) return "$0";
  if (cents < 100) return "<$1";
  return `$${(cents / 100).toFixed(0)}`;
}
