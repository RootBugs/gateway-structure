/**
 * Direct Provider Test — Test each API key individually
 * Bypasses the gateway to find which providers are slow/broken
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// Read .env
const envContent = readFileSync(join(PROJECT_ROOT, ".env"), "utf8");
function getEnv(key) {
  const m = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const PROVIDERS = [
  {
    name: "Gemini",
    key: getEnv("GEMINI_API_KEY"),
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    timeout: 30000,
  },
  {
    name: "Groq",
    key: getEnv("GROQ_API_KEY"),
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    timeout: 15000,
  },
  {
    name: "OpenRouter",
    key: getEnv("OPENROUTER_API_KEY"),
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    timeout: 60000,
  },
  {
    name: "Cerebras",
    key: getEnv("CEREBRAS_API_KEY"),
    baseUrl: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
    timeout: 20000,
  },
  {
    name: "SambaNova",
    key: getEnv("SAMBANOVA_API_KEY"),
    baseUrl: "https://api.sambanova.ai/v1",
    model: "Meta-Llama-3.3-70B-Instruct",
    timeout: 20000,
  },
  {
    name: "Cohere",
    key: getEnv("COHERE_API_KEY"),
    baseUrl: "https://api.cohere.ai/v1",
    model: "command-r-plus",
    timeout: 25000,
  },
  {
    name: "HuggingFace",
    key: getEnv("HUGGINGFACE_API_KEY"),
    baseUrl: "https://router.huggingface.co/v1",
    model: "meta-llama/Llama-3.1-8B-Instruct",
    timeout: 45000,
  },
  {
    name: "Together",
    key: getEnv("TOGETHER_API_KEY"),
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
    timeout: 30000,
  },
  {
    name: "Fireworks",
    key: getEnv("FIREWORKS_API_KEY"),
    baseUrl: "https://api.fireworks.ai/inference/v1",
    model: "accounts/fireworks/models/gpt-oss-120b",
    timeout: 30000,
  },
  {
    name: "XiaomiMiMo",
    key: getEnv("XIAOMIMIMO_API_KEY"),
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.5",
    timeout: 30000,
  },
];

async function testProvider(provider) {
  if (!provider.key) {
    return { name: provider.name, status: "NO_KEY", latency: 0, error: "API key not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeout);
  const start = Date.now();

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: "Reply with just: ok" }],
        max_tokens: 5,
        stream: false,
      }),
      signal: controller.signal,
    });

    const latency = Date.now() - start;
    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.error?.message || JSON.stringify(data).slice(0, 200);
      return { name: provider.name, status: "FAIL", latency, error: `HTTP ${res.status}: ${errMsg}` };
    }

    const content = data.choices?.[0]?.message?.content || "";
    return {
      name: provider.name,
      status: "OK",
      latency,
      model: data.model || provider.model,
      content: content.trim(),
      usage: data.usage,
    };
  } catch (e) {
    const latency = Date.now() - start;
    return { name: provider.name, status: "FAIL", latency, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  DIRECT PROVIDER TEST — All API Keys      ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  const results = [];

  for (const provider of PROVIDERS) {
    process.stdout.write(`  ${provider.name.padEnd(14)} (${provider.model.slice(0, 30)}...) ... `);
    const result = await testProvider(provider);
    results.push(result);

    if (result.status === "OK") {
      console.log(`✅ ${result.latency}ms | "${result.content}"`);
    } else if (result.status === "NO_KEY") {
      console.log(`⚠️  NO KEY`);
    } else {
      console.log(`❌ ${result.latency}ms | ${result.error}`);
    }
  }

  // Summary
  const ok = results.filter((r) => r.status === "OK");
  const failed = results.filter((r) => r.status === "FAIL");
  const noKey = results.filter((r) => r.status === "NO_KEY");
  const slow = ok.filter((r) => r.latency > 5000);

  console.log(`\n  ✅ Working: ${ok.length}/${results.length}`);
  if (failed.length) console.log(`  ❌ Failed: ${failed.length}`);
  if (noKey.length) console.log(`  ⚠️  No key: ${noKey.length}`);
  if (slow.length) console.log(`  🐌 Slow (>5s): ${slow.map((r) => `${r.name}(${r.latency}ms)`).join(", ")}`);

  if (failed.length) {
    console.log("\n  Failed providers:");
    for (const r of failed) {
      console.log(`    ❌ ${r.name}: ${r.error}`);
    }
  }

  // Speed ranking
  if (ok.length > 1) {
    ok.sort((a, b) => a.latency - b.latency);
    console.log("\n  Speed ranking (fastest to slowest):");
    for (let i = 0; i < ok.length; i++) {
      console.log(`    ${i + 1}. ${ok[i].name}: ${ok[i].latency}ms`);
    }
  }
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});
