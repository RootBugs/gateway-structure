/**
 * Live Test — Test all 5 model aliases through the gateway
 * Tests both streaming and non-streaming for each alias
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const GATEWAY_URL = process.env.TEST_URL || "http://localhost:3000";
const TEST_MSG = "just reply with one word: ok";
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
      name: `live-test-${Date.now()}`,
      keyHash: hash,
      keyPrefix: raw.substring(0, 12),
      isActive: true,
    },
  });
  return raw;
}

async function testAlias(alias, apiKey, stream) {
  const controller = new AbortController();
  const timeout = stream ? 60000 : 30000;
  const timer = setTimeout(() => controller.abort(), timeout);
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
        messages: [{ role: "user", content: TEST_MSG }],
        max_tokens: 10,
        stream,
      }),
      signal: controller.signal,
    });

    const latency = Date.now() - start;

    if (stream) {
      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let chunks = 0;
      let firstChunkTime = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks++;
        if (chunks === 1) firstChunkTime = Date.now() - start;
        const text = decoder.decode(value);
        // Parse SSE data lines
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content || "";
              fullText += content;
            } catch {}
          }
        }
      }

      return {
        ok: res.ok,
        status: res.status,
        latency,
        firstChunkMs: firstChunkTime,
        content: fullText.trim(),
        chunks,
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } else {
      const data = await res.json();
      return {
        ok: res.ok,
        status: res.status,
        latency,
        content: data.choices?.[0]?.message?.content || "",
        usage: data.usage,
        error: res.ok ? null : data.error?.message || `HTTP ${res.status}`,
      };
    }
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  LIVE MODEL TEST — All 5 Aliases     ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Check server
  try {
    const check = await fetch(`${GATEWAY_URL}/`, { signal: AbortSignal.timeout(5000) });
    console.log(`✅ Server reachable at ${GATEWAY_URL} (HTTP ${check.status})\n`);
  } catch (e) {
    console.log(`❌ Cannot reach ${GATEWAY_URL}: ${e.message}`);
    process.exit(1);
  }

  // Get API key
  console.log("🔑 Creating test API key...");
  const apiKey = await getApiKey();
  console.log(`   Key: ${apiKey.substring(0, 20)}...\n`);

  const results = [];

  // Test each alias — non-streaming first, then streaming
  for (const alias of ALIASES) {
    console.log(`\n━━━ Testing: ${alias} ━━━`);

    // Non-streaming
    process.stdout.write(`  [non-stream] ... `);
    const ns = await testAlias(alias, apiKey, false);
    if (ns.ok) {
      console.log(`✅ ${ns.latency}ms | "${ns.content}" | ${JSON.stringify(ns.usage || {})}`);
    } else {
      console.log(`❌ ${ns.latency}ms | ${ns.error}`);
    }
    results.push({ alias, mode: "non-stream", ...ns });

    await new Promise((r) => setTimeout(r, 300));

    // Streaming
    process.stdout.write(`  [stream    ] ... `);
    const st = await testAlias(alias, apiKey, true);
    if (st.ok) {
      console.log(`✅ ${st.latency}ms (first: ${st.firstChunkMs}ms) | "${st.content}" | ${st.chunks} chunks`);
    } else {
      console.log(`❌ ${st.latency}ms | ${st.error}`);
    }
    results.push({ alias, mode: "stream", ...st });

    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  SUMMARY                             ║");
  console.log("╚══════════════════════════════════════╝\n");

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const slow = results.filter((r) => r.ok && r.latency > 10000);

  console.log(`  Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | 🐌 Slow (>10s): ${slow.length}`);

  if (failed > 0) {
    console.log("\n  ❌ FAILED:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`    • ${r.alias} [${r.mode}]: ${r.error}`);
    }
  }

  if (slow.length > 0) {
    console.log("\n  🐌 SLOW (>10s):");
    for (const r of slow) {
      console.log(`    • ${r.alias} [${r.mode}]: ${r.latency}ms${r.firstChunkMs ? ` (first chunk: ${r.firstChunkMs}ms)` : ""}`);
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
  const filePath = join(resultsDir, `live-test-${ts}.json`);
  writeFileSync(filePath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n📄 Results saved: ${filePath}`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
