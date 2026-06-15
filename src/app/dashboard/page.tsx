"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Key,
  Activity,
  Settings,
  Server,
  LogOut,
  Plus,
  Copy,
  AlertTriangle,
  X,
} from "lucide-react";

interface DashboardStats {
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    avgLatency: number;
    totalKeys: number;
    activeKeys: number;
    successRate: number;
  };
  providerHealth: Array<{
    id: string;
    name: string;
    tier: string;
    status: string;
    latencyMs: number;
    circuitState: string;
    consecutiveFailures: number;
  }>;
  recentRequests: Array<{
    status: string;
    tokens: number;
    latencyMs: number;
    provider: string;
    model: string;
    createdAt: string;
  }>;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  totalRequests: number;
  totalTokens: number;
}

const NAV_ITEMS = [
  { id: "keys", label: "Keys", icon: Key },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "providers", label: "Providers", icon: Server },
] as const;

type NavId = (typeof NAV_ITEMS)[number]["id"];

function Sidebar({
  active,
  onNav,
}: {
  active: NavId;
  onNav: (id: NavId) => void;
}) {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-white/[0.06] bg-[#0c0d0e]">
      <div className="flex h-14 items-center gap-2 border-b border-white/[0.06] px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-[11px] font-bold text-white">
            Kw
          </div>
          <span className="text-[15px] font-semibold text-white">Kwen Gateway</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar({
  user,
  onLogout,
}: {
  user: { name: string; email: string } | null;
  onLogout: () => void;
}) {
  return (
    <header className="fixed right-0 top-0 z-30 flex h-14 items-center justify-end border-b border-white/[0.06] bg-[#090a0b]/80 backdrop-blur-xl" style={{ left: 240 }}>
      <div className="flex items-center gap-3 pr-6">
        <span className="text-[13px] text-zinc-400">{user?.email}</span>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-[12px] text-zinc-400 transition hover:border-white/[0.15] hover:text-white"
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </header>
  );
}

function StatsRow({ stats }: { stats: DashboardStats["stats"] }) {
  const cards = [
    { label: "Total Requests", value: stats.totalRequests.toLocaleString() },
    { label: "Success Rate", value: `${stats.successRate}%` },
    { label: "Total Tokens", value: stats.totalTokens.toLocaleString() },
    { label: "Avg Latency", value: `${stats.avgLatency}ms` },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
        >
          <div className="text-[12px] text-zinc-500">{c.label}</div>
          <div className="mt-1 text-[20px] font-semibold text-white">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function KeysTable({
  keys,
  onRevoke,
}: {
  keys: ApiKey[];
  onRevoke: (id: string) => void;
}) {
  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] py-16">
        <Key size={40} strokeWidth={1.2} className="text-zinc-600" />
        <p className="mt-3 text-[13px] text-zinc-500">No API keys yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06]">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-2.5 font-medium text-zinc-500">Name</th>
            <th className="px-4 py-2.5 font-medium text-zinc-500">Key</th>
            <th className="px-4 py-2.5 font-medium text-zinc-500">Status</th>
            <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Requests</th>
            <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Tokens</th>
            <th className="px-4 py-2.5 font-medium text-zinc-500">Last Used</th>
            <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr
              key={key.id}
              className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
            >
              <td className="px-4 py-3 text-white">{key.name}</td>
              <td className="px-4 py-3">
                <code className="text-[12px] text-zinc-400">{key.prefix}...</code>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-[12px] ${
                    key.isActive ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      key.isActive ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  {key.isActive ? "Active" : "Revoked"}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {key.totalRequests.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {key.totalTokens.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {key.lastUsedAt
                  ? new Date(key.lastUsedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Never"}
              </td>
              <td className="px-4 py-3 text-right">
                {key.isActive ? (
                  <button
                    onClick={() => onRevoke(key.id)}
                    className="text-[12px] text-red-400 transition hover:text-red-300"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-[12px] text-zinc-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateKeyModal({
  open,
  onClose,
  onCreate,
  name,
  setName,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  name: string;
  setName: (v: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-white/[0.08] bg-[#141516] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-white">Create API Key</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. Production)"
          className="mt-4 w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500/60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onCreate();
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] text-zinc-400 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={!name.trim()}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavId>("keys");
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [meRes, statsRes, keysRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/admin/stats"),
          fetch("/api/admin/keys"),
        ]);

        if (!meRes.ok) {
          router.push("/login");
          return;
        }

        const meData = await meRes.json();
        setUser(meData.user);

        if (statsRes.ok) setStats(await statsRes.json());
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          setKeys(keysData.keys || []);
        }

        const savedKey = sessionStorage.getItem("newApiKey");
        if (savedKey) {
          setNewApiKey(savedKey);
          sessionStorage.removeItem("newApiKey");
        }
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function createKey() {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewApiKey(data.key);
      setNewKeyName("");
      setShowCreateModal(false);
      const keysRes = await fetch("/api/admin/keys");
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setKeys(keysData.keys || []);
      }
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await fetch(`/api/admin/keys?id=${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090a0b]">
        <div className="text-[13px] text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0b] text-white">
      <Sidebar active={activeNav} onNav={setActiveNav} />
      <TopBar user={user} onLogout={logout} />

      <main className="ml-[240px] pt-14">
        <div className="mx-auto max-w-[1100px] px-8 py-8">
          {newApiKey && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-emerald-400" />
              <div className="flex-1">
                <p className="text-[13px] font-medium text-emerald-400">
                  Copy your key now — it won&apos;t be shown again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-black/30 px-3 py-1.5 text-[12px] text-zinc-300">
                    {newApiKey}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(newApiKey)}
                    className="flex shrink-0 items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-emerald-500"
                  >
                    <Copy size={12} />
                    Copy
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewApiKey(null)}
                className="shrink-0 text-zinc-500 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {activeNav === "keys" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-[20px] font-semibold text-white">API Keys</h1>
                  <p className="mt-0.5 text-[13px] text-zinc-500">
                    Manage your API keys for accessing the gateway.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-indigo-500"
                >
                  <Plus size={14} />
                  Create Key
                </button>
              </div>

              {stats && <StatsRow stats={stats.stats} />}

              <KeysTable keys={keys} onRevoke={revokeKey} />
            </div>
          )}

          {activeNav === "activity" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-[20px] font-semibold text-white">Activity</h1>
                <p className="mt-0.5 text-[13px] text-zinc-500">
                  Recent API requests and usage history.
                </p>
              </div>
              {stats && stats.recentRequests.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Status</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Model</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Provider</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Tokens</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentRequests.map((req, i) => (
                        <tr
                          key={i}
                          className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[12px] ${
                                req.status === "success" ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  req.status === "success" ? "bg-emerald-400" : "bg-red-400"
                                }`}
                              />
                              {req.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-white">{req.model}</td>
                          <td className="px-4 py-2.5 text-zinc-400">{req.provider}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">
                            {req.tokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">{req.latencyMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] py-16">
                  <Activity size={40} strokeWidth={1.2} className="text-zinc-600" />
                  <p className="mt-3 text-[13px] text-zinc-500">No recent activity.</p>
                </div>
              )}
            </div>
          )}

          {activeNav === "settings" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-[20px] font-semibold text-white">Settings</h1>
                <p className="mt-0.5 text-[13px] text-zinc-500">
                  Configure your gateway settings.
                </p>
              </div>
              <div className="flex flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] py-16">
                <Settings size={40} strokeWidth={1.2} className="text-zinc-600" />
                <p className="mt-3 text-[13px] text-zinc-500">Settings coming soon.</p>
              </div>
            </div>
          )}

          {activeNav === "providers" && stats && (
            <div className="space-y-6">
              <div>
                <h1 className="text-[20px] font-semibold text-white">Providers</h1>
                <p className="mt-0.5 text-[13px] text-zinc-500">
                  Monitor upstream provider health and status.
                </p>
              </div>
              {stats.providerHealth.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Provider</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Tier</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Status</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500">Circuit</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Latency</th>
                        <th className="px-4 py-2.5 font-medium text-zinc-500 text-right">Failures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.providerHealth.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-white/[0.04] transition hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3 text-white">{p.name}</td>
                          <td className="px-4 py-3 text-zinc-400">{p.tier}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[12px] ${
                                p.status === "healthy"
                                  ? "text-emerald-400"
                                  : p.status === "degraded"
                                  ? "text-yellow-400"
                                  : "text-red-400"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  p.status === "healthy"
                                    ? "bg-emerald-400"
                                    : p.status === "degraded"
                                    ? "bg-yellow-400"
                                    : "bg-red-400"
                                }`}
                              />
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">{p.circuitState}</td>
                          <td className="px-4 py-3 text-right text-zinc-400">{p.latencyMs}ms</td>
                          <td className="px-4 py-3 text-right">
                            {p.consecutiveFailures > 0 ? (
                              <span className="text-red-400">{p.consecutiveFailures}</span>
                            ) : (
                              <span className="text-zinc-600">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] py-16">
                  <Server size={40} strokeWidth={1.2} className="text-zinc-600" />
                  <p className="mt-3 text-[13px] text-zinc-500">No provider data yet.</p>
                </div>
              )}

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="mb-3 text-[14px] font-medium text-white">Quick Start</h3>
                <div className="overflow-hidden rounded-md border border-white/[0.08] bg-[#111113]">
                  <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed text-zinc-400">
                    <code>{`curl http://localhost:3000/api/v1/chat/completions \\\n  -H "Authorization: Bearer ${keys[0]?.prefix || "sk-team-xxxxx"}..." \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "coder-fast",\n    "messages": [{"role": "user", "content": "Hello!"}]\n  }'`}</code>
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <CreateKeyModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={createKey}
        name={newKeyName}
        setName={setNewKeyName}
      />
    </div>
  );
}
