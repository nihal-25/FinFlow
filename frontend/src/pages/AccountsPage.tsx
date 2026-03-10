import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { format } from "date-fns";
import type { Transaction } from "../types";

interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  balance: string;
}

interface AccountResponse {
  success: boolean;
  data: AccountRow[];
}

interface AccountDetailResponse {
  success: boolean;
  data: AccountRow;
}

interface TxResponse {
  success: boolean;
  data: Transaction[];
  meta: { total: number };
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  reversed: "bg-gray-100 text-gray-600",
  flagged: "bg-orange-100 text-orange-700",
};

function TypeBadge({ type }: { type: string }): React.ReactElement {
  const colors: Record<string, string> = {
    wallet: "bg-blue-100 text-blue-700",
    escrow: "bg-purple-100 text-purple-700",
    reserve: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[type] ?? "bg-gray-100 text-gray-600"}`}>
      {type}
    </span>
  );
}

function AccountCard({
  account,
  onClick,
}: {
  account: AccountRow;
  onClick: () => void;
}): React.ReactElement {
  const bal = parseFloat(account.balance ?? "0");
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-blue-400 hover:shadow-md transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition">{account.name}</p>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{account.id.slice(0, 12)}…</p>
        </div>
        <TypeBadge type={account.type} />
      </div>
      <p className="text-2xl font-bold text-gray-900">
        {account.currency} {bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className="text-xs text-gray-400 mt-1">Created {format(new Date(account.created_at), "MMM d, yyyy")}</p>
    </div>
  );
}

export default function AccountsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAccountId, setDepositAccountId] = useState<string | null>(null);

  const [newAccount, setNewAccount] = useState({
    name: "",
    type: "wallet" as "wallet" | "escrow" | "reserve",
    currency: "USD" as "USD" | "EUR" | "GBP" | "NGN",
    initialBalance: "",
  });

  const [depositAmount, setDepositAmount] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data } = await api.get<AccountResponse>("/accounts");
      return data.data;
    },
  });

  const { data: selectedAccount } = useQuery({
    queryKey: ["account", selectedAccountId],
    queryFn: async () => {
      const { data } = await api.get<AccountDetailResponse>(`/accounts/${selectedAccountId}`);
      return data.data;
    },
    enabled: !!selectedAccountId,
    refetchInterval: selectedAccountId ? 3000 : false,
  });

  const { data: accountTxs } = useQuery({
    queryKey: ["account-txs", selectedAccountId],
    queryFn: async () => {
      const { data } = await api.get<TxResponse>(
        `/transactions?accountId=${selectedAccountId}&limit=20`
      );
      return data;
    },
    enabled: !!selectedAccountId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; data: { id: string } }>("/accounts", {
        name: newAccount.name,
        type: newAccount.type,
        currency: newAccount.currency,
      });
      const accountId = data.data.id;
      // Deposit inside mutationFn so errors are caught by onError
      if (newAccount.initialBalance && parseFloat(newAccount.initialBalance) > 0) {
        await api.post(`/accounts/${accountId}/deposit`, {
          amount: parseFloat(newAccount.initialBalance).toFixed(8),
          description: "Initial balance",
        });
      }
      return accountId;
    },
    onSuccess: () => {
      setShowCreate(false);
      setNewAccount({ name: "", type: "wallet", currency: "USD", initialBalance: "" });
      setCreateError(null);
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateError(axiosErr.response?.data?.error?.message ?? "Failed to create account");
    },
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/accounts/${depositAccountId}/deposit`, {
        amount: depositAmount,
        description: "Manual deposit",
      });
    },
    onSuccess: () => {
      setShowDeposit(false);
      setDepositAmount("");
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["account", selectedAccountId] });
    },
  });

  const handleCreate = (e: FormEvent): void => {
    e.preventDefault();
    createMutation.mutate();
  };

  const handleDeposit = (e: FormEvent): void => {
    e.preventDefault();
    depositMutation.mutate();
  };

  const visibleAccounts = accounts?.filter((a) => a.type !== "reserve") ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Accounts</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your wallets and escrow accounts</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Account
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading accounts…</div>
      ) : visibleAccounts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-gray-500 font-medium">No accounts yet</p>
          <p className="text-gray-400 text-sm mt-1">Create your first wallet to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Create Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleAccounts.map((account) => (
            <AccountCard key={account.id} account={account} onClick={() => setSelectedAccountId(account.id)} />
          ))}
        </div>
      )}

      {/* Account Detail Modal */}
      {selectedAccountId && selectedAccount && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setSelectedAccountId(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedAccount.name}</h3>
                <p className="text-xs text-gray-400 font-mono">{selectedAccount.id}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setDepositAccountId(selectedAccountId);
                    setShowDeposit(true);
                  }}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                >
                  + Deposit
                </button>
                <button onClick={() => setSelectedAccountId(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white mb-6">
                <p className="text-sm opacity-80">Current Balance</p>
                <p className="text-3xl font-bold mt-1">
                  {selectedAccount.currency}{" "}
                  {parseFloat(selectedAccount.balance ?? "0").toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <div className="flex gap-3 mt-3 text-xs opacity-70">
                  <span>Type: {selectedAccount.type}</span>
                  <span>·</span>
                  <span>Created {format(new Date(selectedAccount.created_at), "MMM d, yyyy")}</span>
                </div>
              </div>

              <h4 className="font-semibold text-gray-900 mb-3">Recent Transactions</h4>
              {!accountTxs?.data?.length ? (
                <p className="text-sm text-gray-400 text-center py-6">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {accountTxs.data.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-xs font-mono text-gray-400">{tx.id.slice(0, 8)}…</p>
                        <p className="text-sm text-gray-600">{tx.description ?? "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {tx.sourceAccountId === selectedAccountId ? "−" : "+"}
                          {tx.currency} {parseFloat(tx.amount).toLocaleString()}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[tx.status] ?? ""}`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Account Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Create Account</h3>
              <button onClick={() => { setShowCreate(false); setCreateError(null); }} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input
                  type="text"
                  required
                  value={newAccount.name}
                  onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Main Wallet"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newAccount.type}
                    onChange={(e) => setNewAccount((p) => ({ ...p, type: e.target.value as "wallet" | "escrow" | "reserve" }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="wallet">Wallet</option>
                    <option value="escrow">Escrow</option>
                    <option value="reserve">Reserve</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={newAccount.currency}
                    onChange={(e) => setNewAccount((p) => ({ ...p, currency: e.target.value as "USD" | "EUR" | "GBP" | "NGN" }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {["USD", "EUR", "GBP", "NGN"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Balance <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAccount.initialBalance}
                  onChange={(e) => setNewAccount((p) => ({ ...p, initialBalance: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {createError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
                >
                  {createMutation.isPending ? "Creating…" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Deposit Funds</h3>
              <button onClick={() => setShowDeposit(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeposit(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={depositMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition"
                >
                  {depositMutation.isPending ? "Depositing…" : "Deposit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
