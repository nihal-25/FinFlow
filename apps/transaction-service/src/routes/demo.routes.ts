import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import { sendSuccess } from "../utils/response";
import { createAccount, depositFunds } from "../services/account.service";
import { createTransaction } from "../services/transaction.service";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.post(
  "/seed",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      // 1. Create three wallets
      const mainWallet = await createAccount({
        tenantId, name: "Main Wallet", type: "wallet", currency: "USD", metadata: { demo: true },
      });
      const savingsWallet = await createAccount({
        tenantId, name: "Savings Wallet", type: "wallet", currency: "USD", metadata: { demo: true },
      });
      const bounceWallet = await createAccount({
        tenantId, name: "Bounce Wallet", type: "wallet", currency: "USD", metadata: { demo: true },
      });

      // 2. Fund wallets via deposit
      await depositFunds(mainWallet.id, tenantId, "100000", "Demo initial funding");
      await depositFunds(savingsWallet.id, tenantId, "50000", "Demo initial funding");
      await depositFunds(bounceWallet.id, tenantId, "5000", "Demo initial funding");

      const fraudRulesTriggered: string[] = [];

      // ─── Rule: amount_anomaly ─────────────────────────────────────────────
      // Establish a 5-tx history from bounceWallet at $50 each → avg = $50
      // Then send $350 (> 5x$50 = $250) → triggers amount_anomaly
      for (let i = 0; i < 5; i++) {
        await createTransaction({
          tenantId,
          sourceAccountId: bounceWallet.id,
          destinationAccountId: savingsWallet.id,
          amount: "50",
          currency: "USD",
          idempotencyKey: uuidv4(),
          description: `History tx #${i + 1} (amount anomaly setup)`,
          metadata: { demo: true },
        });
      }
      await createTransaction({
        tenantId,
        sourceAccountId: bounceWallet.id,
        destinationAccountId: savingsWallet.id,
        amount: "350",
        currency: "USD",
        idempotencyKey: uuidv4(),
        description: "Amount anomaly — $350 vs $50 avg (7× average)",
        metadata: { demo: true, fraudTest: "amount_anomaly" },
      });
      fraudRulesTriggered.push("amount_anomaly");

      // ─── Rule: large_transaction ──────────────────────────────────────────
      // Single transaction > $10,000
      await createTransaction({
        tenantId,
        sourceAccountId: mainWallet.id,
        destinationAccountId: savingsWallet.id,
        amount: "20000",
        currency: "USD",
        idempotencyKey: uuidv4(),
        description: "Large transaction — $20,000 (triggers large_transaction rule)",
        metadata: { demo: true, fraudTest: "large_transaction" },
      });
      fraudRulesTriggered.push("large_transaction");

      // ─── Rule: round_trip ─────────────────────────────────────────────────
      // Send $5,000 from main→savings, then savings→main same amount within seconds
      const rtAmount = "5000";
      await createTransaction({
        tenantId,
        sourceAccountId: mainWallet.id,
        destinationAccountId: savingsWallet.id,
        amount: rtAmount,
        currency: "USD",
        idempotencyKey: uuidv4(),
        description: "Round-trip leg 1 — main → savings",
        metadata: { demo: true, fraudTest: "round_trip_leg1" },
      });
      await createTransaction({
        tenantId,
        sourceAccountId: savingsWallet.id,
        destinationAccountId: mainWallet.id,
        amount: rtAmount,
        currency: "USD",
        idempotencyKey: uuidv4(),
        description: "Round-trip leg 2 — savings → main (triggers round_trip rule)",
        metadata: { demo: true, fraudTest: "round_trip" },
      });
      fraudRulesTriggered.push("round_trip");

      // ─── Rule: velocity ───────────────────────────────────────────────────
      // At this point mainWallet has 2 txs in the Redis velocity window.
      // Send 9 more rapid txs → counter hits 11 (> 10) on the last one.
      for (let i = 0; i < 9; i++) {
        await createTransaction({
          tenantId,
          sourceAccountId: mainWallet.id,
          destinationAccountId: savingsWallet.id,
          amount: "100",
          currency: "USD",
          idempotencyKey: uuidv4(),
          description: `Velocity tx #${i + 1} of 9`,
          metadata: { demo: true, fraudTest: "velocity" },
        });
      }
      fraudRulesTriggered.push("velocity");

      sendSuccess(res, {
        message: "Demo data seeded — all 4 fraud rules triggered",
        accounts: {
          mainWallet: mainWallet.id,
          savingsWallet: savingsWallet.id,
          bounceWallet: bounceWallet.id,
        },
        transactions: 5 + 1 + 1 + 2 + 9, // 18 total
        fraudRulesTriggered,
      });
    } catch (err) { next(err); }
  }
);

export default router;
