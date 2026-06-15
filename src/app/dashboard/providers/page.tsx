"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Zap, Code, Brain, Building2, Microscope, ChevronDown, X, SlidersHorizontal } from "lucide-react";

const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', color: '#4285F4', tier: 'tier1' },
  { id: 'groq', name: 'Groq', color: '#F97316', tier: 'tier1' },
  { id: 'openrouter', name: 'OpenRouter', color: '#8B5CF6', tier: 'tier1' },
  { id: 'cerebras', name: 'Cerebras', color: '#06B6D4', tier: 'tier2' },
  { id: 'sambanova', name: 'SambaNova', color: '#10B981', tier: 'tier2' },
  { id: 'cohere', name: 'Cohere', color: '#6366F1', tier: 'tier3' },
  { id: 'huggingface', name: 'Hugging Face', color: '#FFD700', tier: 'tier3' },
  { id: 'together', name: 'Together AI', color: '#EC4899', tier: 'tier3' },
  { id: 'fireworks', name: 'Fireworks AI', color: '#F43F5E', tier: 'tier3' },
  { id: 'ollama', name: 'Ollama', color: '#14B8A6', tier: 'optional' },
  { id: 'vllm', name: 'vLLM', color: '#A855F7', tier: 'optional' },
];

const MODELS = [
  {
    id: "coder-fast",
    name: "Coder Fast",
    description: "Optimized for speed — sub-500ms responses. Quick autocomplete, simple refactoring.",
    contextLength: "4K",
    contextTokens: 4096,
    providers: ["groq", "gemini", "cerebras"],
    priceIn: 0,
    priceOut: 0,
    free: true,
    category: "coding",
    icon: Zap,
  },
  {
    id: "coder-smart",
    name: "Coder Smart",
    description: "Balanced speed and quality — complex features, debugging, refactoring.",
    contextLength: "8K",
    contextTokens: 8192,
    providers: ["groq", "gemini", "openrouter"],
    priceIn: 0,
    priceOut: 0,
    free: true,
    category: "coding",
    icon: Code,
  },
  {
    id: "reasoning",
    name: "Reasoning",
    description: "Deep reasoning with chain-of-thought — algorithm design, system architecture.",
    contextLength: "16K",
    contextTokens: 16384,
    providers: ["gemini", "openrouter", "groq"],
    priceIn: 0,
    priceOut: 0,
    free: true,
    category: "reasoning",
    icon: Brain,
  },
  {
    id: "architect",
    name: "Architect",
    description: "High-level system design & planning — project structure, tech decisions.",
    contextLength: "32K",
    contextTokens: 32768,
    providers: ["openrouter", "gemini", "groq"],
    priceIn: 0,
    priceOut: 0,
    free: true,
    category: "reasoning",
    icon: Building2,
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "Long-context research — documentation, code review, analysis (128K tokens).",
    contextLength: "128K",
    contextTokens: 128000,
    providers: ["gemini", "openrouter"],
    priceIn: 0,
    priceOut: 0,
    free: true,
    category: "reasoning",
    icon: Microscope,
  },
];

export default function ProvidersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "free" | "coding" | "reasoning">("all");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) router.push("/login");
        else setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const filteredModels = useMemo(() => {
    return MODELS.filter((m) => {
      if (activeFilter === "free" && !m.free) return false;
      if (activeFilter === "coding" && m.category !== "coding") return false;
      if (activeFilter === "reasoning" && m.category !== "reasoning") return false;
      if (selectedProviders.length > 0 && !m.providers.some((p) => selectedProviders.includes(p))) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [search, activeFilter, selectedProviders]);

  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090a0b]">
        <div className="text-sm text-zinc-400">Loading models...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0b] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#090a0b]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold">
              Kw
            </div>
            <span className="font-semibold text-sm">Kwen Gateway</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/dashboard/providers" className="text-sm font-medium text-white">
              Models
            </Link>
            <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition">
              Chat
            </Link>
            <Link href="/docs" className="text-sm text-zinc-400 hover:text-white transition">
              Docs
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium">
              U
            </div>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Models</h1>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500/50"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-1">
            {(["all", "free", "coding", "reasoning"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition capitalize ${
                  activeFilter === filter
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          <div className={`w-56 flex-shrink-0 ${showSidebar ? "block" : "hidden"} lg:block`}>
            <div className="sticky top-20 space-y-6">
              <div>
                <h3 className="mb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Providers</h3>
                <div className="space-y-1">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => toggleProvider(p.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:text-white transition text-left"
                    >
                      <div
                        className={`h-3 w-3 rounded-full ${
                          selectedProviders.includes(p.id) ? "ring-2 ring-white/20" : ""
                        }`}
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              {selectedProviders.length > 0 && (
                <button
                  onClick={() => setSelectedProviders([])}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-white/5 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-zinc-400">Model</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-400">Providers</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-400 text-right">Context</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-400 text-right">Input</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-400 text-right">Output</th>
                    <th className="px-4 py-3 text-xs font-medium text-zinc-400 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.map((model) => (
                    <tr
                      key={model.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                            <model.icon className="h-4 w-4 text-zinc-300" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{model.name}</div>
                            <div className="text-xs text-zinc-500">{model.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {model.providers.map((pid) => {
                            const p = PROVIDERS.find((x) => x.id === pid);
                            if (!p) return null;
                            return (
                              <span
                                key={pid}
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-300 bg-white/5"
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: p.color }}
                                />
                                {p.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-zinc-300">
                        {model.contextLength}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-zinc-300">
                        ${model.priceIn === 0 ? "0.00" : model.priceIn.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-zinc-300">
                        ${model.priceOut === 0 ? "0.00" : model.priceOut.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {model.free && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                            Free
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredModels.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="mb-4 h-10 w-10 text-zinc-600" />
                <p className="text-sm text-zinc-500">No models match your search.</p>
              </div>
            )}

            <div className="mt-8 rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-3">
                <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
                <h3 className="text-sm font-medium">Model Details</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-500 mb-1">Total Models</div>
                  <div className="font-medium">{MODELS.length}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Total Providers</div>
                  <div className="font-medium">{PROVIDERS.length}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Free Models</div>
                  <div className="font-medium">{MODELS.filter((m) => m.free).length}</div>
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Max Context</div>
                  <div className="font-medium">128K</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}