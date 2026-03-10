import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.ts";
import type { Transaction } from "../types";
import { format } from "date-fns";
import { Link } from "react-router-dom";

interface SummaryData {
  totalVolume: string;
  transactionCount: number;
  failedCount: number;
  successRate: number;
  fraudAlertCount: number;
}

interface VolumePoint {
  date: string;
  volume: string;
  count: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, sub, color = "text-gray-900", icon }: StatCardProps): React.ReactElement {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {icon && <div className="text-gray-300">{icon}</div>}
      </div>
    </div>
  );
}

export default function DashboardHome(): React.ReactElement {
  const [wsTransactions, setWsTransactions] = useState<Transaction[]>([]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: SummaryData }>("/analytics/summary");
      return data.data;
    },
    refetchInterval: 15_000,
  });

  const { data: volumeData } = useQuery({
    queryKey: ["analytics", "volume", "7d"],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: VolumePoint[] }>("/analytics/volume?period=7d");
      return data.data;
    },
    refetchInterval: 30_000,
  });

  // Seed the live feed with recent transactions on load, then WebSocket events prepend new ones
  const { data: recentTransactions } = useQuery({
    queryKey: ["transactions", "recent-feed"],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: Transaction[] }>("/transactions?limit=10");
      return data.data ?? [];
    },
    refetchInterval: 15_000,
  });

  const handleTransactionCompleted = useCallback((event: { transaction: Transaction }) => {
    setWsTransactions((prev) => [event.transaction, ...prev].slice(0, 20));
  }, []);

  useWebSocket({ onTransactionCompleted: handleTransactionCompleted });

  // Merge: WebSocket live events on top, then recent transactions (deduped)
  const wsIds = new Set(wsTransactions.map((t) => t.id));
  const liveTransactions = [
    ...wsTransactions,
    ...(recentTransactions ?? []).filter((t) => !wsIds.has(t.id)),
  ].slice(0, 20);

  const chartData = volumeData?.map((d) => ({
    date: format(new Date(d.date), "MMM d"),
    volume: parseFloat(d.volume),
    count: d.count,
  })) ?? [];

  const isEmpty = !summaryLoading && (summary?.transactionCount ?? 0) === 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
      </div>

      {/* Empty state / Get started banner */}
      {isEmpty && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 mb-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold mb-1">Get started with FinFlow</h3>
              <p className="text-blue-100 text-sm mb-4">
                No data yet. Click <strong>"Load Demo Data"</strong> in the sidebar to instantly create wallets,
                fund them, and run 5 sample transactions including one that triggers fraud detection.
              </p>
              <div className="flex gap-3 flex-wrap">
                <Link
                  to="/accounts"
                  className="px-4 py-2 bg-white text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 transition"
                >
                  Create Account
                </Link>
                <Link
                  to="/send"
                  className="px-4 py-2 bg-blue-500 text-white border border-blue-400 rounded-lg text-sm font-semibold hover:bg-blue-400 transition"
                >
                  Send Money
                </Link>
              </div>
            </div>
            <div className="hidden md:block opacity-20">
              <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Volume"
          value={summary ? `$${parseFloat(summary.totalVolume).toLocaleString()}` : "—"}
          sub="All time"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Transactions"
          value={summary?.transactionCount ?? "—"}
          sub="All time"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="Fraud Alerts"
          value={summary?.fraudAlertCount ?? "—"}
          sub="Open alerts"
          color="text-red-600"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
          }
        />
        <StatCard
          label="Success Rate"
          value={summary ? `${summary.successRate}%` : "—"}
          sub="All time"
          color="text-green-600"
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Volume chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Volume (7 days)</h3>
          {chartData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-gray-300">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <p className="text-sm">No data yet</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, "Volume"]}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ fill: "#3b82f6", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Live feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <h3 className="text-lg font-semibold text-gray-900">Live Feed</h3>
            <span className="text-xs text-gray-400 ml-auto">{wsTransactions.length > 0 ? "Live" : "Recent"}</span>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-72">
            {liveTransactions.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-400">No transactions yet</p>
                <p className="text-xs text-gray-300 mt-1">Send money to see activity here</p>
              </div>
            ) : (
              liveTransactions.map((tx) => (
                <div key={tx.id} className="border-l-2 border-blue-400 pl-3 py-1">
                  <p className="text-xs font-mono text-gray-400">{tx.id.slice(0, 8)}…</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {tx.currency} {parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                      tx.status === "completed" ? "bg-green-100 text-green-700"
                      : tx.status === "failed" ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {tx.status}
                    </span>
                    <span className="text-xs text-gray-400">{format(new Date(tx.createdAt), "HH:mm:ss")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { to: "/accounts", label: "Manage Accounts", desc: "Create wallets and deposit funds", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
          { to: "/send", label: "Send Money", desc: "Transfer between accounts with idempotency", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
          { to: "/fraud-alerts", label: "Fraud Alerts", desc: "Real-time rule-based fraud detection", icon: "M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" },
        ].map(({ to, label, desc, icon }) => (
          <Link
            key={to}
            to={to}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition group"
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-blue-50 group-hover:bg-blue-100 rounded-lg flex items-center justify-center transition">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
            </div>
            <p className="text-xs text-gray-500">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
