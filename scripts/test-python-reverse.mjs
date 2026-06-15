/**
 * Test all 5 model aliases with a real Python coding prompt
 * "Write a Python code for reverse string"
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const GATEWAY_URL = process.env.TEST_URL || "http://localhost:3000";
const PROMPT = "Write a Python function to reverse a string. Just give me the code, no explanation.";
const ALIASES = ["coder-fast", "coder-smart", "reasoning", "architect", "deep-research"];

const prisma = new PrismaClient();

async function getApiKey() {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No users in DB. Register first.");
  const raw = "sk-team-" + randomBytes(24).toString("hex");
  const hash = await bcrypt.hash(raw, 10);
  await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: `python-test-${Date.now()}`,
      keyHash: hash,
      keyPrefix: raw.substring(0, 12),
      isActive: true,
    },
  });
  return raw;
}

async function testModel(alias, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  const start = Date.now();

  try {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: alias,
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: 500,
        stream: false,
      }),
      signal: controller.signal,
    });

    const latency = Date.now() - start;
    const data = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        latency,
        error: data.error?.message || `HTTP ${res.status}`,
      };
    }

    const content = data.choices?.[0]?.message?.content || "";
    const usage = data.usage;

    return {
      ok: true,
      latency,
      content: content.trim(),
      model: data.model,
      tokensIn: usage?.prompt_tokens || 0,
      tokensOut: usage?.completion_tokens || 0,
    };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  ALL MODELS — Python Reverse String Test         ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Check server
  try {
    const check = await fetch(`${GATEWAY_URL}/`, { signal: AbortSignal.timeout(5000) });
    console.log(`✅ Gateway reachable at ${GATEWAY_URL}\n`);
  } catch (e) {
    console.log(`❌ Cannot reach ${GATEWAY_URL}: ${e.message}`);
    process.exit(1);
  }

  // Get API key
  console.log("🔑 Creating test API key...");
  const apiKey = await getApiKey();
  console.log(`   Key: ${apiKey.substring(0, 20)}...\n`);

  console.log(`📝 Prompt: "${PROMPT}"\n`);

  const results = [];

  for (const alias of ALIASES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🤖 Testing: ${alias.toUpperCase()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const result = await testModel(alias, apiKey);

    if (result.ok) {
      console.log(`✅ Status: OK | Latency: ${result.latency}ms | Model: ${result.model}`);
      console.log(`📊 Tokens: ${result.tokensIn} in / ${result.tokensOut} out`);
      console.log(`\n📄 Response:\n${result.content}\n`);
    } else {
      console.log(`❌ Status: FAIL | Latency: ${result.latency}ms`);
      console.log(`🚨 Error: ${result.error}\n`);
    }

    results.push({ alias, ...result });
    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  FINAL SUMMARY                                   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`  Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}\n`);

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const detail = r.ok
      ? `${r.latency}ms | ${r.tokensOut} tokens | ${r.content.substring(0, 50)}...`
      : `${r.latency}ms | ${r.error}`;
    console.log(`  ${icon} ${r.alias.padEnd(15)} ${detail}`);
  }

  // Speed ranking
  const working = results.filter((r) => r.ok);
  if (working.length > 1) {
    working.sort((a, b) => a.latency - b.latency);
    console.log("\n  🏆 Speed Ranking (fastest to slowest):");
    for (let i = 0; i < working.length; i++) {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
      console.log(`    ${medal} ${i + 1}. ${working[i].alias}: ${working[i].latency}ms`);
    }
  }

  // Save results
  const { writeFileSync, mkdirSync, existsSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const resultsDir = join(__dirname, "test-results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(resultsDir, `python-test-${ts}.json`);
  writeFileSync(filePath, JSON.stringify({ timestamp: new Date().toISOString(), prompt: PROMPT, results }, null, 2));
  console.log(`\n📄 Results saved: ${filePath}`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
