import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { v4 as uuidv4 } from "uuid";

interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
}

interface AccountsResponse {
  success: boolean;
  data: AccountRow[];
}

interface TransactionResult {
  transaction: {
    id: string;
    amount: string;
    currency: string;
    status: string;
    idempotencyKey: string;
    description: string | null;
  };
  isIdempotentReplay: boolean;
}

interface SendResult {
  success: boolean;
  isReplay: boolean;
  txId: string;
  status: string;
  amount: string;
  currency: string;
}

export default function SendMoneyPage(): React.ReactElement {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    sourceAccountId: "",
    destinationAccountId: "",
    amount: "",
    description: "",
    idempotencyKey: uuidv4(),
  });
  const [result, setResult] = useState<SendResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: allAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data } = await api.get<AccountsResponse>("/accounts");
      return data.data;
    },
  });
  const accounts = allAccounts?.filter((a) => a.type !== "reserve");

  const sourceAccount = accounts?.find((a) => a.id === form.sourceAccountId);
  const destAccounts = accounts?.filter((a) => a.id !== form.sourceAccountId && a.currency === sourceAccount?.currency);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; data: TransactionResult }>(
        "/transactions",
        {
          sourceAccountId: form.sourceAccountId,
          destinationAccountId: form.destinationAccountId,
          amount: parseFloat(form.amount).toFixed(8),
          currency: sourceAccount?.currency ?? "USD",
          idempotencyKey: form.idempotencyKey,
          description: form.description || undefined,
        }
      );
      return data.data;
    },
    onSuccess: (data) => {
      setResult({
        success: true,
        isReplay: data.isIdempotentReplay,
        txId: data.transaction.id,
        status: data.transaction.status,
        amount: data.transaction.amount,
        currency: data.transaction.currency,
      });
      setSendError(null);
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setSendError(axiosErr.response?.data?.error?.message ?? "Transaction failed");
      setResult(null);
    },
  });

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    setSendError(null);
    setResult(null);
    sendMutation.mutate();
  };

  const handleReset = (): void => {
    setResult(null);
    setSendError(null);
    setForm((p) => ({
      ...p,
      amount: "",
      description: "",
      idempotencyKey: uuidv4(),
    }));
  };

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Send Money</h2>
        <p className="text-sm text-gray-500 mt-0.5">Transfer funds between your accounts</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* From Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Account</label>
            <select
              required
              value={form.sourceAccountId}
              onChange={(e) => {
                setForm((p) => ({ ...p, sourceAccountId: e.target.value, destinationAccountId: "" }));
                setResult(null);
                setSendError(null);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select source account…</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.currency} {parseFloat(a.balance ?? "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </option>
              ))}
            </select>
            {sourceAccount && (
              <p className="text-xs text-gray-400 mt-1">
                Available: <span className="font-medium text-gray-700">{sourceAccount.currency} {parseFloat(sourceAccount.balance ?? "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </div>

          {/* To Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
            <select
              required
              value={form.destinationAccountId}
              onChange={set("destinationAccountId")}
              disabled={!form.sourceAccountId}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">Select destination account…</option>
              {destAccounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.currency} {parseFloat(a.balance ?? "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </option>
              ))}
            </select>
            {form.sourceAccountId && (!destAccounts || destAccounts.length === 0) && (
              <p className="text-xs text-orange-500 mt-1">No other {sourceAccount?.currency} accounts found. Create another account first.</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                {sourceAccount?.currency ?? "USD"}
              </span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={set("amount")}
                className="w-full border border-gray-300 rounded-lg pl-14 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={set("description")}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Monthly savings transfer"
              maxLength={500}
            />
          </div>

          {/* Idempotency Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Idempotency Key
              <span className="ml-2 text-xs text-gray-400 font-normal">— prevents duplicate transactions</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.idempotencyKey}
                onChange={set("idempotencyKey")}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, idempotencyKey: uuidv4() }))}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                title="Generate new key"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Reuse the same key to safely retry — duplicate requests return the original transaction.
            </p>
          </div>

          {/* Error */}
          {sendError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {sendError}
            </div>
          )}

          <button
            type="submit"
            disabled={sendMutation.isPending || !form.sourceAccountId || !form.destinationAccountId}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition"
          >
            {sendMutation.isPending ? "Processing…" : "Send Money"}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div className={`mt-5 rounded-xl p-5 border ${result.isReplay ? "bg-yellow-50 border-yellow-200" : result.status === "completed" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${result.isReplay ? "bg-yellow-200" : result.status === "completed" ? "bg-green-200" : "bg-red-200"}`}>
                {result.isReplay ? (
                  <svg className="w-4 h-4 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : result.status === "completed" ? (
                  <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className={`font-semibold text-sm ${result.isReplay ? "text-yellow-800" : result.status === "completed" ? "text-green-800" : "text-red-800"}`}>
                  {result.isReplay
                    ? "Idempotent Replay — duplicate request detected"
                    : result.status === "completed"
                    ? "Transaction completed successfully"
                    : "Transaction failed"}
                </p>
                <div className="mt-2 space-y-1 text-xs text-gray-600">
                  <p><span className="font-medium">Transaction ID:</span> <span className="font-mono">{result.txId}</span></p>
                  <p><span className="font-medium">Amount:</span> {result.currency} {parseFloat(result.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p><span className="font-medium">Status:</span> {result.status}</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Send another transaction
            </button>
          </div>
        )}
      </div>

      {/* Idempotency explainer */}
      <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">About Idempotency Keys</p>
            <p className="text-blue-600 text-xs">Every transaction requires a unique idempotency key. If a network error occurs, you can safely retry with the same key — FinFlow will return the original transaction instead of creating a duplicate. Try submitting twice with the same key to see this in action.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
