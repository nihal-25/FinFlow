import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import {
  createTransaction,
  getTransactionById,
  listTransactions,
  reverseTransaction,
} from "../services/transaction.service";
import { query } from "@finflow/database";
import { sendSuccess, sendPaginated } from "../utils/response";
import { ValidationError } from "../utils/errors";

const router = Router();

const createTransactionSchema = z.object({
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,8})?$/, "Amount must be a positive number with up to 8 decimal places"),
  currency: z.enum(["USD", "EUR", "GBP", "NGN"]),
  idempotencyKey: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed", "reversed", "flagged"]).optional(),
  accountId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const reverseSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
});

router.post(
  "/",
  authMiddleware,
  auditLog("create", "transaction"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createTransactionSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const { transaction, isIdempotentReplay } = await createTransaction({
        ...body.data,
        tenantId: req.tenantId!,
      });

      sendSuccess(res, { transaction, isIdempotentReplay }, isIdempotentReplay ? 200 : 201);
    } catch (err) { next(err); }
  }
);

router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = listQuerySchema.safeParse(req.query);
      if (!q.success) throw new ValidationError("Invalid query params", q.error.flatten());

      const result = await listTransactions({ tenantId: req.tenantId!, ...q.data });
      sendPaginated(res, result, req.requestId);
    } catch (err) { next(err); }
  }
);

router.get(
  "/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const transaction = await getTransactionById(req.params["id"]!, req.tenantId!);

      // Fetch ledger entries for this transaction
      interface LedgerRow {
        id: string; account_id: string; type: string;
        amount: string; balance_before: string; balance_after: string; created_at: Date;
      }
      const ledgerEntries = await query<LedgerRow>(
        `SELECT id, account_id, type, amount, balance_before, balance_after, created_at
         FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at`,
        [transaction.id]
      );

      sendSuccess(res, { transaction, ledgerEntries });
    } catch (err) { next(err); }
  }
);

router.post(
  "/:id/reverse",
  authMiddleware,
  auditLog("reverse", "transaction"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = reverseSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const reversal = await reverseTransaction(req.params["id"]!, req.tenantId!, body.data.idempotencyKey);
      sendSuccess(res, { transaction: reversal }, 201);
    } catch (err) { next(err); }
  }
);

export default router;
