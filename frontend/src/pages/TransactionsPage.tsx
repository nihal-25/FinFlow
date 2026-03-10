import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import type { Transaction } from "../types";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid";

interface TransactionsResponse {
  success: boolean;
  data: Transaction[];
  meta: { page: number; limit: number; total: number };
}

interface LedgerEntry {
  id: string;
  account_id: string;
  type: string;
  amount: string;
  balance_before: string;
  balance_after: string;
  created_at: string;
}

interface TransactionDetailResponse {
  success: boolean;
  data: { transaction: Transaction; ledgerEntries: LedgerEntry[] };
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  reversed: "bg-gray-100 text-gray-600",
  flagged: "bg-orange-100 text-orange-700",
};

export default function TransactionsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", page, statusFilter, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (fromDate) params.set("fromDate", new Date(fromDate).toISOString());
      if (toDate) params.set("toDate", new Date(toDate + "T23:59:59").toISOString());
      const { data } = await api.get<TransactionsResponse>(`/transactions?${params}`);
      return data;
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["transaction", selectedTx],
    queryFn: async () => {
      const { data } = await api.get<TransactionDetailResponse>(`/transactions/${selectedTx}`);
      return data.data;
    },
    enabled: !!selectedTx,
  });

  const reverseMutation = useMutation({
    mutationFn: async (txId: string) => {
      const { data } = await api.post<{ success: boolean; data: { transaction: Transaction } }>(
        `/transactions/${txId}/reverse`,
        { idempotencyKey: uuidv4() }
      );
      return data.data;
    },
    onSuccess: () => {
      setReversalError(null);
      setSelectedTx(null);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setReversalError(axiosErr.response?.data?.error?.message ?? "Reversal failed");
    },
  });

  const clearFilters = (): void => {
    setStatusFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const hasFilters = statusFilter || fromDate || toDate;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
          <p className="text-sm text-gray-500 mt-0.5">Double-entry ledger — every transfer creates paired debit/credit entries</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        >
          <option value="">All statuses</option>
          {["completed", "failed", "pending", "processing", "reversed", "flagged"].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["ID", "Amount", "Status", "Description", "Created"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-400">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  No transactions found
                </td>
              </tr>
            ) : (
              data?.data.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => { setSelectedTx(tx.id); setReversalError(null); }}
                  className="cursor-pointer hover:bg-blue-50 transition"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{tx.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 font-semibold">
                    {tx.currency} {parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[tx.status] ?? ""}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{tx.description ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{format(new Date(tx.createdAt), "MMM d, HH:mm")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">{data?.meta.total ?? 0} total transactions</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition"
            >Previous</button>
            <span className="px-3 py-1 text-sm text-gray-500">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!data?.data.length || data.data.length < 20}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition"
            >Next</button>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selectedTx && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="text-lg font-bold text-gray-900">Transaction Detail</h3>
              <button onClick={() => setSelectedTx(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>

            {detailLoading ? (
              <div className="p-12 text-center text-gray-400">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto" />
              </div>
            ) : detail ? (
              <div className="p-6">
                <div className="space-y-3 mb-6">
                  {[
                    ["ID", detail.transaction.id],
                    ["Amount", `${detail.transaction.currency} ${parseFloat(detail.transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                    ["Status", detail.transaction.status],
                    ["From Account", detail.transaction.sourceAccountId],
                    ["To Account", detail.transaction.destinationAccountId],
                    ["Description", detail.transaction.description ?? "—"],
                    ["Idempotency Key", detail.transaction.idempotencyKey],
                    ["Created", format(new Date(detail.transaction.createdAt), "PPpp")],
                    ...(detail.transaction.failureReason ? [["Failure Reason", detail.transaction.failureReason]] : []),
                    ...(detail.transaction.reversalOfId ? [["Reversal Of", detail.transaction.reversalOfId]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-4">
                      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
                      <span className="text-sm font-medium break-all text-gray-900">{String(value)}</span>
                    </div>
                  ))}
                </div>

                {/* Reversal button */}
                {detail.transaction.status === "completed" && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-600 mb-3">
                      Reversals swap source and destination accounts and create a new transaction.
                    </p>
                    {reversalError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
                        {reversalError}
                      </div>
                    )}
                    <button
                      onClick={() => reverseMutation.mutate(detail.transaction.id)}
                      disabled={reverseMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-60 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      {reverseMutation.isPending ? "Reversing…" : "Reverse Transaction"}
                    </button>
                  </div>
                )}

                {/* Ledger entries */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    Double-Entry Ledger
                    <span className="text-xs text-gray-400 font-normal">— immutable record</span>
                  </h4>
                  {detail.ledgerEntries.length === 0 ? (
                    <p className="text-sm text-gray-400">No ledger entries (transaction may have failed before settlement)</p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            {["Account", "Type", "Amount", "Balance Before", "Balance After"].map((h) => (
                              <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.ledgerEntries.map((le) => (
                            <tr key={le.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-mono text-gray-600">{le.account_id.slice(0, 8)}…</td>
                              <td className={`px-3 py-2 font-semibold ${le.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                                {le.type === "credit" ? "+ " : "− "}{le.type}
                              </td>
                              <td className="px-3 py-2 font-medium">{parseFloat(le.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 text-gray-500">{parseFloat(le.balance_before).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 font-medium">{parseFloat(le.balance_after).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
