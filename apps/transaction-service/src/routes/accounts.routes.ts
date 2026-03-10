import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
import {
  createAccount,
  listAccounts,
  getAccountWithBalance,
  getAccountBalance,
  depositFunds,
} from "../services/account.service";
import { sendSuccess } from "../utils/response";
import { ValidationError } from "../utils/errors";

const router = Router();

const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["wallet", "escrow", "reserve"]),
  currency: z.enum(["USD", "EUR", "GBP", "NGN"]),
  metadata: z.record(z.unknown()).optional(),
});

router.post(
  "/",
  authMiddleware,
  auditLog("create", "account"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createAccountSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const account = await createAccount({ ...body.data, tenantId: req.tenantId! });
      sendSuccess(res, account, 201);
    } catch (err) { next(err); }
  }
);

router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accounts = await listAccounts(req.tenantId!);
      sendSuccess(res, accounts);
    } catch (err) { next(err); }
  }
);

router.get(
  "/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const account = await getAccountWithBalance(req.params["id"]!, req.tenantId!);
      sendSuccess(res, account);
    } catch (err) { next(err); }
  }
);

router.get(
  "/:id/balance",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const balance = await getAccountBalance(req.params["id"]!, req.tenantId!);
      sendSuccess(res, { accountId: req.params["id"], balance });
    } catch (err) { next(err); }
  }
);

const depositSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/, "Amount must be a positive number"),
  description: z.string().max(500).optional(),
});

router.post(
  "/:id/deposit",
  authMiddleware,
  auditLog("deposit", "account"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = depositSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());
      const result = await depositFunds(req.params["id"]!, req.tenantId!, body.data.amount, body.data.description);
      sendSuccess(res, result, 201);
    } catch (err) { next(err); }
  }
);

export default router;
