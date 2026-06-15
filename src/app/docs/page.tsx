import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs — Kwen Gateway",
  description: "Complete API documentation for Kwen Gateway — OpenAI-compatible AI gateway with smart routing across 11 providers.",
};

const SECTIONS = [
  {
    title: "Quick Start",
    id: "quickstart",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Get started with Kwen Gateway in minutes. Just change your base URL and model name — everything else stays the same.
        </p>
        <div className="code-block">
          <div className="code-block-header">
            <div className="flex gap-1.5">
              <span className="code-dot-red" />
              <span className="code-dot-yellow" />
              <span className="code-dot-green" />
            </div>
            <span className="text-xs text-zinc-500 ml-2">bash</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
            <code>{`# Set your API key
export KWEN_API_KEY="sk-team-your-key-here"

# Make your first request
curl https://your-gateway.com/api/v1/chat/completions \\
  -H "Authorization: Bearer $KWEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "coder-fast",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</code>
          </pre>
        </div>
      </div>
    ),
  },
  {
    title: "Authentication",
    id: "auth",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Kwen Gateway uses API key-based authentication. Include your API key in the <code className="text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded text-sm">Authorization</code> header.
        </p>
        <div className="code-block">
          <div className="code-block-header">
            <div className="flex gap-1.5">
              <span className="code-dot-red" />
              <span className="code-dot-yellow" />
              <span className="code-dot-green" />
            </div>
            <span className="text-xs text-zinc-500 ml-2">bash</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
            <code>{`Authorization: Bearer sk-team-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</code>
          </pre>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <h4 className="text-sm font-semibold text-amber-400 mb-1">Security Note</h4>
          <p className="text-xs sm:text-sm text-zinc-400">
            API keys are hashed with bcrypt before storage. The full key is only shown once upon creation. 
            If you lose your key, you&apos;ll need to revoke it and create a new one.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "Chat Completions",
    id: "chat",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Fully compatible with OpenAI&apos;s chat completions API. Use your preferred model alias and Kwen Gateway 
          routes to the best provider automatically.
        </p>

        <h4 className="text-sm font-semibold text-zinc-200 mt-6">Endpoint</h4>
        <div className="code-block">
          <div className="code-block-header">
            <div className="flex gap-1.5">
              <span className="code-dot-red" />
              <span className="code-dot-yellow" />
              <span className="code-dot-green" />
            </div>
            <span className="text-xs text-zinc-500 ml-2">http</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
            <code>POST /api/v1/chat/completions</code>
          </pre>
        </div>

        <h4 className="text-sm font-semibold text-zinc-200 mt-6">Request Body</h4>
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-[#111118]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left p-3 text-zinc-300 font-medium">Parameter</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Type</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Required</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ["model", "string", "Yes", "Model alias (e.g. coder-fast, coder-smart, reasoning)"],
                ["messages", "array", "Yes", "Array of message objects with role and content"],
                ["stream", "boolean", "No", "Enable streaming responses (default: false)"],
                ["max_tokens", "integer", "No", "Maximum tokens in the response"],
                ["temperature", "number", "No", "Sampling temperature (0-2, default per alias)"],
              ].map((row, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className={`p-3 ${j === 0 ? "text-indigo-400 font-mono" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="text-sm font-semibold text-zinc-200 mt-6">Example Response</h4>
        <div className="code-block">
          <div className="code-block-header">
            <div className="flex gap-1.5">
              <span className="code-dot-red" />
              <span className="code-dot-yellow" />
              <span className="code-dot-green" />
            </div>
            <span className="text-xs text-zinc-500 ml-2">json</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
            <code>{`{
  "id": "chatcmpl-8a7b3c2d1e",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "coder-fast",
  "provider": "groq",
  "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 142,
    "total_tokens": 170
  },
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }]
}`}</code>
          </pre>
        </div>
      </div>
    ),
  },
  {
    title: "Model Aliases",
    id: "models",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Model aliases abstract away provider complexity. Each alias has preferred and fallback providers 
          with intelligent routing strategies.
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-[#111118]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left p-3 text-zinc-300 font-medium">Alias</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Max Tokens</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Preferred Providers</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ["coder-fast", "4K", "Groq, Gemini, Cerebras", "Speed-optimized coding"],
                ["coder-smart", "8K", "Groq, Gemini, OpenRouter", "Balanced coding"],
                ["reasoning", "16K", "Gemini, OpenRouter, Groq", "Deep reasoning"],
                ["architect", "32K", "OpenRouter, Gemini, Groq", "System design"],
                ["deep-research", "128K", "Gemini, OpenRouter", "Long-context research"],
              ].map((row, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  <td className="p-3 text-indigo-400 font-mono">{row[0]}</td>
                  <td className="p-3">{row[1]}</td>
                  <td className="p-3">{row[2]}</td>
                  <td className="p-3">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    title: "Available Providers",
    id: "providers",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Kwen Gateway connects to 11 AI providers across three tiers. Tier 1 providers get highest routing priority.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { name: "Google Gemini", tier: "Tier 1", priority: "Highest", dotColor: "#34d399", badgeBg: "rgba(52,211,153,0.1)", textColor: "#34d399" },
            { name: "Groq", tier: "Tier 1", priority: "Highest", dotColor: "#34d399", badgeBg: "rgba(52,211,153,0.1)", textColor: "#34d399" },
            { name: "OpenRouter", tier: "Tier 1", priority: "Highest", dotColor: "#34d399", badgeBg: "rgba(52,211,153,0.1)", textColor: "#34d399" },
            { name: "Cerebras", tier: "Tier 2", priority: "High", dotColor: "#60a5fa", badgeBg: "rgba(96,165,250,0.1)", textColor: "#60a5fa" },
            { name: "SambaNova", tier: "Tier 2", priority: "High", dotColor: "#60a5fa", badgeBg: "rgba(96,165,250,0.1)", textColor: "#60a5fa" },
            { name: "Cohere", tier: "Tier 2", priority: "High", dotColor: "#60a5fa", badgeBg: "rgba(96,165,250,0.1)", textColor: "#60a5fa" },
            { name: "Hugging Face", tier: "Tier 3", priority: "Medium", dotColor: "#fbbf24", badgeBg: "rgba(251,191,36,0.1)", textColor: "#fbbf24" },
            { name: "Together AI", tier: "Tier 3", priority: "Medium", dotColor: "#fbbf24", badgeBg: "rgba(251,191,36,0.1)", textColor: "#fbbf24" },
            { name: "Fireworks AI", tier: "Tier 3", priority: "Medium", dotColor: "#fbbf24", badgeBg: "rgba(251,191,36,0.1)", textColor: "#fbbf24" },
            { name: "Ollama (Local)", tier: "Optional", priority: "Low", dotColor: "#a1a1aa", badgeBg: "rgba(161,161,170,0.1)", textColor: "#a1a1aa" },
            { name: "vLLM (Local)", tier: "Optional", priority: "Low", dotColor: "#a1a1aa", badgeBg: "rgba(161,161,170,0.1)", textColor: "#a1a1aa" },
          ].map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.dotColor }} />
                <span className="text-sm text-zinc-200">{p.name}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: p.badgeBg, color: p.textColor }}>
                {p.tier}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Embeddings API",
    id: "embeddings",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          OpenAI-compatible embeddings endpoint. Returns vector embeddings for your input text.
        </p>
        <h4 className="text-sm font-semibold text-zinc-200">Endpoint</h4>
        <div className="code-block">
          <div className="code-block-header">
            <div className="flex gap-1.5">
              <span className="code-dot-red" />
              <span className="code-dot-yellow" />
              <span className="code-dot-green" />
            </div>
            <span className="text-xs text-zinc-500 ml-2">http</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
            <code>POST /api/v1/embeddings</code>
          </pre>
        </div>
      </div>
    ),
  },
  {
    title: "Rate Limiting",
    id: "rate-limiting",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Rate limiting is applied per API key per time window (minute, hour, day). Limits track both request 
          count and token count.
        </p>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <h4 className="text-sm font-semibold text-cyan-400 mb-1">Rate Limit Headers</h4>
          <p className="text-xs sm:text-sm text-zinc-400">
            Responses include <code className="text-cyan-400">X-RateLimit-Remaining</code> and{" "}
            <code className="text-cyan-400">X-RateLimit-Reset</code> headers so you can track your usage.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "Error Handling",
    id: "errors",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Kwen Gateway returns standard HTTP status codes and JSON error responses.
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/5 bg-[#111118]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left p-3 text-zinc-300 font-medium">Status</th>
                <th className="text-left p-3 text-zinc-300 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ["200", "Success"],
                ["400", "Invalid request (missing model, invalid messages, etc.)"],
                ["401", "Missing or invalid API key"],
                ["429", "Rate limit exceeded"],
                ["500", "Internal server error or all providers failed"],
                ["503", "All providers are unhealthy or circuit-breaker open"],
              ].map((row, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  <td className="p-3 font-mono">
                    <span className={`${row[0].startsWith("2") ? "text-emerald-400" : row[0].startsWith("4") ? "text-amber-400" : "text-red-400"}`}>
                      {row[0]}
                    </span>
                  </td>
                  <td className="p-3">{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    title: "Self-Hosting",
    id: "self-hosting",
    content: (
      <div className="space-y-4">
        <p className="text-zinc-400 leading-relaxed">
          Deploy Kwen Gateway on your own infrastructure using Docker. Requires PostgreSQL and provider API keys.
        </p>
        <div className="code-block">
          <div className="code-block-header">
            <div className="flex gap-1.5">
              <span className="code-dot-red" />
              <span className="code-dot-yellow" />
              <span className="code-dot-green" />
            </div>
            <span className="text-xs text-zinc-500 ml-2">bash</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
            <code>{`# Clone the repository
git clone https://github.com/kwen/gateway.git
cd gateway

# Copy environment variables
cp .env.example .env.local

# Start with Docker
docker compose up -d

# Run database migrations
npx prisma db push
npx prisma db seed`}</code>
          </pre>
        </div>
      </div>
    ),
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">Kw</span>
              </div>
              <span className="font-semibold">Kwen Gateway</span>
              <span className="text-xs text-zinc-600 ml-1">/ Docs</span>
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <nav className="sticky top-24 space-y-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/5"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Documentation</h1>
            <p className="text-zinc-400 mb-12">
              Everything you need to integrate Kwen Gateway into your application.
            </p>

            <div className="space-y-16">
              {SECTIONS.map((section) => (
                <section key={section.id} id={section.id}>
                  <h2 className="text-xl sm:text-2xl font-bold mb-6 text-zinc-100">{section.title}</h2>
                  {section.content}
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-xs text-zinc-600 text-center">
            &copy; {new Date().getFullYear()} Kwen Gateway. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
