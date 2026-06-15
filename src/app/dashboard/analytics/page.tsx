"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface RequestLog {
  id: string;
  status: string;
  tokens: number;
  latencyMs: number;
  provider: string;
  model: string;
  createdAt: string;
}

interface AnalyticsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  avgLatency: number;
  successRate: number;
  requestsByDay: Array<{ date: string; count: number; tokens: number }>;
  requestsByProvider: Array<{ provider: string; count: number; tokens: number }>;
  requestsByModel: Array<{ model: string; count: number; tokens: number }>;
  recentRequests: RequestLog[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("7d");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) router.push("/login");
        else {
          setLoading(false);
          loadAnalytics();
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function loadAnalytics() {
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      const statsData = await res.json();
      const requestsRes = await fetch("/api/admin/keys");
      let keysData: { keys?: Array<{ totalRequests: number; totalTokens: number }> } = {};
      if (requestsRes.ok) {
        keysData = await requestsRes.json();
      }
      const totalKeys = keysData.keys?.length || 0;
      setData({
        totalRequests: statsData.stats?.totalRequests || 0,
        successfulRequests: statsData.stats?.successfulRequests || 0,
        failedRequests: statsData.stats?.failedRequests || 0,
        totalTokens: statsData.stats?.totalTokens || 0,
        avgLatency: statsData.stats?.avgLatency || 0,
        successRate: statsData.stats?.successRate || 0,
        requestsByDay: statsData.requestsByDay || [],
        requestsByProvider: statsData.requestsByProvider || [],
        requestsByModel: statsData.requestsByModel || [],
        recentRequests: statsData.recentRequests || [],
      });
    }
  }

  const maxProviderCount = useMemo(() => {
    if (!data?.requestsByProvider.length) return 1;
    return Math.max(...data.requestsByProvider.map((p) => p.count));
  }, [data]);

  const maxModelCount = useMemo(() => {
    if (!data?.requestsByModel.length) return 1;
    return Math.max(...data.requestsByModel.map((m) => m.count));
  }, [data]);

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="text-sm text-zinc-400">Loading analytics...</div>
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
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="mt-2 text-zinc-400">
              Monitor your API usage and performance metrics.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-1">
            {(["7d", "30d", "90d"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
                  timeRange === range
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total Requests", value: data?.totalRequests.toLocaleString() || "0", icon: "requests" },
            { label: "Success Rate", value: `${data?.successRate || 0}%`, icon: "success" },
            { label: "Total Tokens", value: data?.totalTokens.toLocaleString() || "0", icon: "tokens" },
            { label: "Avg Latency", value: `${data?.avgLatency || 0}ms`, icon: "latency" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/5 bg-white/[0.02] p-5"
            >
              <div className="text-sm text-zinc-500">{stat.label}</div>
              <div className="mt-1 text-2xl font-bold">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {/* Requests by Provider */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">Requests by Provider</h3>
            {data?.requestsByProvider.length ? (
              <div className="space-y-3">
                {data.requestsByProvider.map((p) => (
                  <div key={p.provider}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{p.provider}</span>
                      <span className="text-zinc-500">{p.count.toLocaleString()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5">
                      <div
                        className="h-2 rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${(p.count / maxProviderCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No data yet.</p>
            )}
          </div>

          {/* Requests by Model */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">Requests by Model</h3>
            {data?.requestsByModel.length ? (
              <div className="space-y-3">
                {data.requestsByModel.map((m) => (
                  <div key={m.model}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{m.model}</span>
                      <span className="text-zinc-500">{m.count.toLocaleString()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5">
                      <div
                        className="h-2 rounded-full bg-purple-500 transition-all"
                        style={{ width: `${(m.count / maxModelCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No data yet.</p>
            )}
          </div>
        </div>

        {/* Token Usage Chart */}
        <div className="mb-6 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="mb-4 text-sm font-semibold text-zinc-300">Token Usage Over Time</h3>
          {data?.requestsByDay.length ? (
            <div className="flex items-end gap-2 h-40">
              {data.requestsByDay.map((day) => {
                const maxTokens = Math.max(...data.requestsByDay.map((d) => d.tokens));
                const height = maxTokens > 0 ? (day.tokens / maxTokens) * 100 : 0;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-indigo-500/50 transition-all hover:bg-indigo-500"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${formatDate(day.date)}: ${day.tokens.toLocaleString()} tokens`}
                    />
                    <span className="text-[10px] text-zinc-600">{formatDate(day.date)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No data yet.</p>
          )}
        </div>

        {/* Recent Requests */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h3 className="mb-4 text-sm font-semibold text-zinc-300">Recent Requests</h3>
          {data?.recentRequests.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5 text-left text-xs text-zinc-500">
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Model</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium">Tokens</th>
                    <th className="pb-3 font-medium">Latency</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {data.recentRequests.map((req, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          req.status === "success"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            req.status === "success" ? "bg-emerald-400" : "bg-red-400"
                          }`} />
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-300">{req.model}</td>
                      <td className="py-3 text-zinc-400">{req.provider}</td>
                      <td className="py-3 text-zinc-400">{req.tokens.toLocaleString()}</td>
                      <td className="py-3 text-zinc-400">{req.latencyMs}ms</td>
                      <td className="py-3 text-zinc-500">{formatDate(req.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No requests yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
