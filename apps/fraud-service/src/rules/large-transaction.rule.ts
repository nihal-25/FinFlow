import { config } from "../config";

/**
 * Large Transaction: flag any single transaction over $10,000 (or configured threshold).
 */
export function largeTransactionCheck(amount: string): boolean {
  return parseFloat(amount) > config.LARGE_TRANSACTION_THRESHOLD;
}
