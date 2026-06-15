"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  ArrowRight,
  Globe,
  Code,
  MessageSquare,
  BookOpen,
  Search,
  ChevronRight,
  Menu,
  X,
  Cpu,
  Brain,
  Atom,
  Sparkles,
  Database,
  Shield,
  GitBranch,
  Activity,
  Clock,
  Users,
  FileText,
  Settings,
  Terminal,
  ExternalLink,
  Heart,
  Github,
  Twitter,
} from "lucide-react";

const MODELS = [
  {
    id: "coder-fast",
    name: "Coder Fast",
    description: "Optimized for speed — sub-500ms responses",
    provider: "Groq",
    context: "4K",
    price: "Free",
    badge: "Free",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    id: "coder-smart",
    name: "Coder Smart",
    description: "Balanced speed & quality",
    provider: "Gemini",
    context: "8K",
    price: "$0.10/M",
    badge: null,
    icon: <Code className="w-5 h-5" />,
  },
  {
    id: "reasoning",
    name: "Reasoning",
    description: "Deep reasoning with chain-of-thought",
    provider: "OpenRouter",
    context: "16K",
    price: "$0.25/M",
    badge: null,
    icon: <Brain className="w-5 h-5" />,
  },
  {
    id: "architect",
    name: "Architect",
    description: "High-level system design & planning",
    provider: "Gemini",
    context: "32K",
    price: "$0.50/M",
    badge: null,
    icon: <Database className="w-5 h-5" />,
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "Long-context research (128K tokens)",
    provider: "Gemini",
    context: "128K",
    price: "$1.00/M",
    badge: null,
    icon: <BookOpen className="w-5 h-5" />,
  },
];

const PROVIDERS = [
  { name: "Google Gemini", color: "#4285F4" },
  { name: "Groq", color: "#F97316" },
  { name: "OpenRouter", color: "#8B5CF6" },
  { name: "Cerebras", color: "#06B6D4" },
  { name: "SambaNova", color: "#10B981" },
  { name: "Cohere", color: "#6366F1" },
  { name: "Hugging Face", color: "#FFD700" },
  { name: "Together AI", color: "#EC4899" },
  { name: "Fireworks AI", color: "#F43F5E" },
  { name: "Ollama", color: "#14B8A6" },
  { name: "vLLM", color: "#A855F7" },
];

const STEPS = [
  {
    icon: <ArrowRight className="w-5 h-5" />,
    title: "Send a request",
    description: "Use the OpenAI-compatible API format",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "We route it",
    description: "Smart routing to the best provider",
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    title: "Get the response",
    description: "Streamed or batched back to you",
  },
  {
    icon: <Heart className="w-5 h-5" />,
    title: "Pay the provider",
    description: "Direct billing, no markup",
  },
];

const FOOTER_SECTIONS = [
  {
    title: "Product",
    links: [
      { name: "Models", href: "#models" },
      { name: "Pricing", href: "#pricing" },
      { name: "API Reference", href: "#docs" },
      { name: "Playground", href: "#playground" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "About", href: "#about" },
      { name: "Blog", href: "#blog" },
      { name: "Careers", href: "#careers" },
      { name: "Contact", href: "#contact" },
    ],
  },
  {
    title: "Developer",
    links: [
      { name: "Documentation", href: "#docs" },
      { name: "GitHub", href: "#github" },
      { name: "Status", href: "#status" },
      { name: "Changelog", href: "#changelog" },
    ],
  },
  {
    title: "Connect",
    links: [
      { name: "Twitter", href: "#twitter" },
      { name: "Discord", href: "#discord" },
      { name: "GitHub", href: "#github" },
      { name: "Support", href: "#support" },
    ],
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) router.replace("/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090a0b]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0b] text-white">
      <nav className="sticky top-0 z-50 bg-[#090a0b]/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                  <span className="text-black font-bold text-sm">Kw</span>
                </div>
                <span className="font-semibold text-white">Kwen Gateway</span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm w-64">
                  <Search className="w-4 h-4" />
                  <span>Search models...</span>
                  <span className="ml-auto text-xs bg-white/10 px-1.5 py-0.5 rounded">/</span>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <Link href="#models" className="text-sm text-zinc-400 hover:text-white transition-colors">
                Models
              </Link>
              <Link href="#chat" className="text-sm text-zinc-400 hover:text-white transition-colors">
                Chat
              </Link>
              <Link href="#docs" className="text-sm text-zinc-400 hover:text-white transition-colors">
                Docs
              </Link>
              <div className="flex items-center gap-3 ml-4">
                <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            </div>
            <button
              className="md:hidden p-2 text-zinc-400 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#090a0b]">
            <div className="px-4 py-4 space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm">
                <Search className="w-4 h-4" />
                <span>Search models...</span>
              </div>
              <Link href="#models" className="block text-sm text-zinc-400 hover:text-white">
                Models
              </Link>
              <Link href="#chat" className="block text-sm text-zinc-400 hover:text-white">
                Chat
              </Link>
              <Link href="#docs" className="block text-sm text-zinc-400 hover:text-white">
                Docs
              </Link>
              <div className="pt-4 border-t border-white/5 space-y-3">
                <Link href="/login" className="block text-sm text-zinc-400 hover:text-white">
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="block text-center px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-200"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      <section className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            The unified interface for LLMs
          </h1>
          <p className="text-lg sm:text-xl text-zinc-400 mb-8 max-w-2xl mx-auto">
            Find the best models and prices for your prompts
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/register"
              className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors text-sm"
            >
              Get started for free
            </Link>
            <Link
              href="#models"
              className="px-6 py-3 border border-white/20 text-white font-medium rounded-lg hover:bg-white/5 transition-colors text-sm"
            >
              Browse models
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PROVIDERS.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm"
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: provider.color }} />
                <span className="text-zinc-300">{provider.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="models" className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Available Models</h2>
            <p className="text-zinc-400">Choose from our curated selection of AI models</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODELS.map((model) => (
              <div
                key={model.id}
                className="p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-zinc-300">
                      {model.icon}
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{model.name}</h3>
                      <p className="text-xs text-zinc-500">{model.provider}</p>
                    </div>
                  </div>
                  {model.badge && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded">
                      {model.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400 mb-4">{model.description}</p>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Context: {model.context}</span>
                  <span>{model.price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How it works</h2>
            <p className="text-zinc-400">Four simple steps to start using any model</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white mx-auto mb-4">
                  {step.icon}
                </div>
                <h3 className="font-medium text-white mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">All Providers</h2>
            <p className="text-zinc-400">Connect to 11 leading AI providers</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {PROVIDERS.map((provider) => (
              <div
                key={provider.name}
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors text-center"
              >
                <div
                  className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: provider.color }}
                >
                  {provider.name.charAt(0)}
                </div>
                <span className="text-sm text-zinc-300">{provider.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Get started in minutes</h2>
            <p className="text-zinc-400">Drop-in OpenAI-compatible API</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-xs text-zinc-500 ml-2">terminal</span>
            </div>
            <pre className="p-6 text-sm text-zinc-300 overflow-x-auto">
              <code>{`curl https://gateway.kwen.ai/v1/chat/completions \\
  -H "Authorization: Bearer $KWEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "coder-fast",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</code>
            </pre>
          </div>
        </div>
      </section>

      <footer className="py-12 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                  <span className="text-black font-bold text-sm">Kw</span>
                </div>
                <span className="font-semibold text-white">Kwen Gateway</span>
              </Link>
              <p className="text-sm text-zinc-500">
                The unified interface for LLMs
              </p>
            </div>
            {FOOTER_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="font-medium text-white mb-4 text-sm">{section.title}</h3>
                <ul className="space-y-2">
                  {section.links.map((link) => (
                    <li key={link.name}>
                      <Link
                        href={link.href}
                        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-600">
              © 2024 Kwen Gateway. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <Github className="w-4 h-4" />
              </a>
              <a href="#" className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
