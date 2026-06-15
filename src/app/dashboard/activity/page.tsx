"use client";

import { useEffect, useState } from "react";
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
  errorMessage?: string;
}

export default function ActivityPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) router.push("/login");
        else {
          setLoading(false);
          loadActivity();
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function loadActivity() {
    const statsRes = await fetch("/api/admin/stats");
    if (statsRes.ok) {
      const data = await statsRes.json();
      setRequests(data.recentRequests || []);
    }
  }

  const filteredRequests = requests.filter((req) => {
    if (filter === "success" && req.status !== "success") return false;
    if (filter === "failed" && req.status === "success") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        req.model.toLowerCase().includes(q) ||
        req.provider.toLowerCase().includes(q) ||
        req.status.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filteredRequests.length / pageSize);
  const paginatedRequests = filteredRequests.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  function formatTime(date: string) {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusColor(status: string) {
    if (status === "success") return "bg-emerald-400";
    if (status === "rate_limited") return "bg-yellow-400";
    return "bg-red-400";
  }

  function getStatusBadge(status: string) {
    if (status === "success")
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "rate_limited")
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="text-sm text-zinc-400">Loading activity...</div>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="mt-2 text-zinc-400">
            View all API requests and their status.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Total Requests</div>
            <div className="mt-1 text-2xl font-bold">{requests.length}</div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Successful</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">
              {requests.filter((r) => r.status === "success").length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Failed</div>
            <div className="mt-1 text-2xl font-bold text-red-400">
              {requests.filter((r) => r.status !== "success").length}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <div className="text-sm text-zinc-500">Avg Latency</div>
            <div className="mt-1 text-2xl font-bold">
              {requests.length > 0
                ? Math.round(requests.reduce((sum, r) => sum + r.latencyMs, 0) / requests.length)
                : 0}
              ms
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by model, provider..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-1">
            {(["all", "success", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition capitalize ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Requests List */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          {filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 text-zinc-600">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">No requests found.</p>
              <p className="mt-1 text-xs text-zinc-600">Try adjusting your filters.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {paginatedRequests.map((req, i) => (
                  <div
                    key={i}
                    className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-all hover:border-white/10"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(req.status)}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{req.model}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${getStatusBadge(req.status)}`}>
                            {req.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.813a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                            </svg>
                            via {req.provider}
                          </span>
                          <span>•</span>
                          <span>{formatTime(req.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-zinc-500">
                      <div className="text-right">
                        <div>{req.tokens.toLocaleString()} tokens</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${
                          req.latencyMs < 500
                            ? "text-emerald-400"
                            : req.latencyMs < 2000
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}>
                          {req.latencyMs}ms
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-xs text-zinc-500">
                    Showing {(page - 1) * pageSize + 1}-
                    {Math.min(page * pageSize, filteredRequests.length)} of{" "}
                    {filteredRequests.length}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                    >
                      Previous
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`rounded-lg px-3 py-1.5 text-xs transition ${
                            page === pageNum
                              ? "bg-indigo-600 text-white"
                              : "border border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
