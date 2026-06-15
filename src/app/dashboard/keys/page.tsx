"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  totalRequests: number;
  totalTokens: number;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export default function KeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) router.push("/login");
        else {
          setLoading(false);
          loadKeys();
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function loadKeys() {
    const res = await fetch("/api/admin/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys || []);
    }
  }

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
      loadKeys();
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await fetch(`/api/admin/keys?id=${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopiedId("new");
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatDate(date: string | null) {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="text-sm text-zinc-400">Loading keys...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
              Kw
            </div>
            <span className="font-semibold">Kwen Gateway</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition">
              Dashboard
            </Link>
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition">
              Docs
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
            <p className="mt-2 text-zinc-400">
              Manage your API keys for authenticating requests.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-indigo-500"
          >
            Create Key
          </button>
        </div>

        {/* New Key Alert */}
        {newApiKey && (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-emerald-400">
                API Key Created
              </h3>
              <button
                onClick={() => setNewApiKey(null)}
                className="text-zinc-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mb-3 text-sm text-zinc-400">
              Copy this key now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl bg-black/30 px-4 py-3 text-sm break-all font-mono">
                {newApiKey}
              </code>
              <button
                onClick={() => copyKey(newApiKey)}
                className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold transition hover:bg-emerald-500"
              >
                {copiedId === "new" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Total Keys</div>
            <div className="mt-1 text-2xl font-bold">{keys.length}</div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Active Keys</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">
              {keys.filter((k) => k.isActive).length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Total Requests</div>
            <div className="mt-1 text-2xl font-bold">
              {keys.reduce((sum, k) => sum + k.totalRequests, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Keys List */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="mb-4 text-sm font-semibold text-zinc-300">All Keys</h3>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 text-zinc-600">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">No API keys yet.</p>
              <p className="mt-1 text-xs text-zinc-600">Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-all hover:border-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      key.isActive
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-zinc-500/10 text-zinc-400"
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          key.isActive
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                        }`}>
                          {key.isActive ? "Active" : "Revoked"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-xs text-zinc-500">
                        <span className="font-mono">{key.prefix}...</span>
                        <span>Created {formatDate(key.createdAt)}</span>
                        <span>Last used {formatDate(key.lastUsedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-zinc-500">
                      <div>{key.totalRequests.toLocaleString()} requests</div>
                      <div>{key.totalTokens.toLocaleString()} tokens</div>
                    </div>
                    {key.isActive && (
                      <button
                        onClick={() => revokeKey(key.id)}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-red-400 opacity-0 transition-all group-hover:opacity-100 hover:border-red-500/30 hover:bg-red-500/10"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage Limits */}
        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="mb-4 text-sm font-semibold text-zinc-300">Rate Limits</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-sm text-zinc-500">Requests per Minute</div>
              <div className="mt-1 text-xl font-bold">60</div>
              <div className="mt-2 h-2 rounded-full bg-white/5">
                <div className="h-2 w-1/4 rounded-full bg-indigo-500" />
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-sm text-zinc-500">Requests per Hour</div>
              <div className="mt-1 text-xl font-bold">1,000</div>
              <div className="mt-2 h-2 rounded-full bg-white/5">
                <div className="h-2 w-1/6 rounded-full bg-indigo-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Start */}
        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="mb-4 text-sm font-semibold text-zinc-300">Quick Start</h3>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111118]">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
              <span className="ml-2 text-[10px] text-zinc-500">terminal</span>
            </div>
            <pre className="overflow-x-auto p-4 text-xs text-zinc-300">
              <code>{`curl https://your-gateway.com/v1/chat/completions \\
  -H "Authorization: Bearer $KWEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "coder-fast",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Create API Key</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm text-zinc-400 mb-2">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production, Staging, Local Dev"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createKey()}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 transition hover:border-white/20 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                disabled={!newKeyName.trim()}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold transition hover:bg-indigo-500 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
