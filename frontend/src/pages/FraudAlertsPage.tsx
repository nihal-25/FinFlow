import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { format } from "date-fns";

interface FraudAlert {
  id: string;
  tenant_id: string;
  transaction_id: string;
  account_id: string;
  rules_triggered: string[];
  risk_score: number;
  status: string;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  created_at: string;
}

interface FraudAlertsResponse {
  success: boolean;
  data: FraudAlert[];
}

const RULE_LABELS: Record<string, string> = {
  velocity_check: "Velocity Check",
  amount_anomaly: "Amount Anomaly",
  large_transaction: "Large Transaction",
  round_tripping: "Round-Tripping",
};

const RISK_COLOR = (score: number): string => {
  if (score >= 75) return "text-red-700 bg-red-100";
  if (score >= 50) return "text-orange-700 bg-orange-100";
  return "text-yellow-700 bg-yellow-100";
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  investigating: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-500",
};

export default function FraudAlertsPage(): React.ReactElement {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: async () => {
      const { data } = await api.get<FraudAlertsResponse>("/fraud-alerts");
      return data.data;
    },
    refetchInterval: 10_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await api.patch(`/fraud-alerts/${id}/status`, { status });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] }),
  });

  const alerts = data ?? [];
  const openCount = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Fraud Alerts</h2>
            {openCount > 0 && (
              <span className="px-2.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full">
                {openCount} open
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Real-time fraud detection across all transactions</p>
        </div>
      </div>

      {/* Rules legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(RULE_LABELS).map(([key, label]) => (
          <div key={key} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-xs text-gray-400 mt-1">
              {key === "velocity_check" && ">10 transactions / 5 min"}
              {key === "amount_anomaly" && "5× your 30-day average"}
              {key === "large_transaction" && "> $10,000 single transfer"}
              {key === "round_tripping" && "Returned within 60 seconds"}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Transaction", "Rules Triggered", "Risk Score", "Status", "Detected", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                    <span>Loading fraud alerts…</span>
                  </div>
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-gray-600 font-medium">No fraud alerts</p>
                    <p className="text-gray-400 text-xs">All transactions look clean. Try sending a $15,000+ transaction to trigger an alert.</p>
                  </div>
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className={`hover:bg-gray-50 transition ${alert.status === "open" ? "bg-red-50/30" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-gray-600">{alert.transaction_id?.slice(0, 8)}…</p>
                    <p className="text-xs text-gray-400 mt-0.5">Acct: {alert.account_id?.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(alert.rules_triggered ?? []).map((rule) => (
                        <span key={rule} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          {RULE_LABELS[rule] ?? rule}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${RISK_COLOR(alert.risk_score ?? 0)}`}>
                      {alert.risk_score ?? 0}/100
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[alert.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {alert.created_at ? format(new Date(alert.created_at), "MMM d, HH:mm") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {alert.status === "open" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateStatus.mutate({ id: alert.id, status: "investigating" })}
                          className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition"
                        >
                          Investigate
                        </button>
                        <button
                          onClick={() => updateStatus.mutate({ id: alert.id, status: "dismissed" })}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {alert.status === "investigating" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: alert.id, status: "resolved" })}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
