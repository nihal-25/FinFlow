import { useState, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { format } from "date-fns";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

interface ApiKeyCreated extends ApiKey {
  key: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  created_at: string;
}

interface TestResult {
  delivered: boolean;
  responseCode: number;
  responseBody: string;
}

const ALL_EVENTS = [
  "transaction.created",
  "transaction.completed",
  "transaction.failed",
  "fraud.alert",
  "notification.email",
];

export default function SettingsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(ALL_EVENTS);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [webhookError, setWebhookError] = useState<string | null>(null);

  // ─── API Keys ─────────────────────────────────────────────────────────────

  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: ApiKey[] }>("/auth/api-keys");
      return data.data;
    },
  });

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<{ success: boolean; data: ApiKeyCreated }>("/auth/api-keys", { name });
      return data.data;
    },
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setNewKeyName("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => api.delete(`/auth/api-keys/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const handleCreateKey = (e: FormEvent): void => {
    e.preventDefault();
    if (newKeyName.trim()) createKey.mutate(newKeyName.trim());
  };

  // ─── Webhooks ────────────────────────────────────────────────────────────

  const { data: webhooks } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: WebhookEndpoint[] }>("/webhooks");
      return data.data;
    },
  });

  const createWebhook = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ success: boolean; data: WebhookEndpoint }>("/webhooks", {
        url: newWebhookUrl,
        events: selectedEvents,
      });
      return data.data;
    },
    onSuccess: () => {
      setNewWebhookUrl("");
      setSelectedEvents(ALL_EVENTS);
      setWebhookError(null);
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setWebhookError(axiosErr.response?.data?.error?.message ?? "Failed to create webhook");
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const testWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ success: boolean; data: TestResult }>(`/webhooks/${id}/test`);
      return { id, result: data.data };
    },
    onSuccess: ({ id, result }) => {
      setTestResults((prev) => ({ ...prev, [id]: result }));
    },
  });

  const handleAddWebhook = (e: FormEvent): void => {
    e.preventDefault();
    createWebhook.mutate();
  };

  const toggleEvent = (event: string): void => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Settings</h2>

      {/* ─── API Keys ───────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">API Keys</h3>
        <p className="text-sm text-gray-500 mb-5">
          Use API keys to authenticate programmatic access. Keys are shown only once at creation.
        </p>

        <form onSubmit={handleCreateKey} className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Key name (e.g. Production Server)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="submit"
            disabled={createKey.isPending || !newKeyName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
          >
            Create Key
          </button>
        </form>

        {createdKey && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-5">
            <div className="flex items-start gap-2 mb-2">
              <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
              <p className="text-sm font-medium text-yellow-800">
                Copy your API key now — it will not be shown again
              </p>
            </div>
            <code className="text-sm break-all font-mono bg-white px-3 py-2 rounded border border-yellow-200 block">
              {createdKey}
            </code>
            <button
              onClick={() => setCreatedKey(null)}
              className="mt-2 text-xs text-yellow-700 hover:underline"
            >
              I've saved it, dismiss
            </button>
          </div>
        )}

        <div className="space-y-2">
          {(!apiKeys || apiKeys.length === 0) ? (
            <p className="text-sm text-gray-400 py-4 text-center">No API keys yet</p>
          ) : (
            apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{key.name}</p>
                  <div className="flex gap-3 mt-0.5">
                    <p className="text-xs text-gray-400 font-mono">{key.key_prefix}…</p>
                    {key.last_used_at && (
                      <p className="text-xs text-gray-400">Last used {format(new Date(key.last_used_at), "MMM d")}</p>
                    )}
                    <p className="text-xs text-gray-400">Created {format(new Date(key.created_at), "MMM d, yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${key.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {key.is_active ? "active" : "revoked"}
                  </span>
                  {key.is_active && (
                    <button
                      onClick={() => revokeKey.mutate(key.id)}
                      disabled={revokeKey.isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ─── Webhook Endpoints ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Webhook Endpoints</h3>
        <p className="text-sm text-gray-500 mb-5">
          Receive real-time HTTP POST notifications for transaction and fraud events. Payloads are signed with HMAC-SHA256.
        </p>

        <form onSubmit={handleAddWebhook} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
            <input
              type="url"
              required
              placeholder="https://yourserver.com/webhooks/finflow"
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Events to subscribe</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                    selectedEvents.includes(event)
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 text-gray-600 hover:border-blue-400"
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>

          {webhookError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {webhookError}
            </div>
          )}

          <button
            type="submit"
            disabled={createWebhook.isPending || !newWebhookUrl || selectedEvents.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {createWebhook.isPending ? "Adding…" : "Add Endpoint"}
          </button>
        </form>

        <div className="space-y-4">
          {(!webhooks || webhooks.filter((w) => w.is_active).length === 0) ? (
            <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              No active webhook endpoints. Add one above to start receiving events.
            </div>
          ) : (
            webhooks.filter((w) => w.is_active).map((webhook) => (
              <div key={webhook.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 break-all">{webhook.url}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {webhook.events.map((ev) => (
                        <span key={ev} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {ev}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      {webhook.consecutive_failures > 0 && (
                        <span className="text-red-500">{webhook.consecutive_failures} consecutive failures</span>
                      )}
                      {webhook.last_success_at && (
                        <span>Last success: {format(new Date(webhook.last_success_at), "MMM d, HH:mm")}</span>
                      )}
                      <span>Added {format(new Date(webhook.created_at), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => testWebhook.mutate(webhook.id)}
                      disabled={testWebhook.isPending}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      {testWebhook.isPending ? "Testing…" : "Send Test"}
                    </button>
                    <button
                      onClick={() => deleteWebhook.mutate(webhook.id)}
                      className="text-xs px-3 py-1.5 text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {testResults[webhook.id] && (
                  <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${testResults[webhook.id]!.delivered ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    {testResults[webhook.id]!.delivered
                      ? `Test delivered — HTTP ${testResults[webhook.id]!.responseCode}`
                      : `Test failed — HTTP ${testResults[webhook.id]!.responseCode || "no response"}`}
                    {testResults[webhook.id]!.responseBody && (
                      <span className="ml-2 text-gray-500 font-mono">{testResults[webhook.id]!.responseBody.slice(0, 80)}</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
