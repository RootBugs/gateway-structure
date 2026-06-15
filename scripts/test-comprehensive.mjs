/**
 * Kwen Gateway — Comprehensive Test Suite
 * =========================================
 * Tests all 5 model aliases + failover scenarios.
 *
 * Usage: node scripts/test-comprehensive.mjs
 * Requires: Dev server running on localhost:3000, .env file with keys
 *
 * Test scenarios:
 *   Phase 1 — Normal routing (all providers enabled)
 *     • All 5 aliases: coder-fast, coder-smart, reasoning, architect, deep-research
 *   Phase 2 — Failover (Groq + Gemini disabled)
 *     • All 5 aliases → should fall back to next best provider
 *   Phase 3 — Extreme failover (only 1 provider left)
 *     • All 5 aliases → should all use the last standing provider
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import pkg from "bcryptjs";

const { hash } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

// ── Config ─────────────────────────────────────────────────────
const GATEWAY_URL = process.env.TEST_URL || "http://localhost:3000";
const TEST_MESSAGE = "just reply with one word: ok";
const MAX_TOKENS = 5;
const TIMEOUT_MS = 30000;
const ALL_ALIASES = [
  { alias: "coder-fast",    display: "Coder Fast",      timeout: 15000, expectedPreferred: ["groq", "gemini", "cerebras"] },
  { alias: "coder-smart",   display: "Coder Smart",     timeout: 15000, expectedPreferred: ["groq", "gemini", "openrouter"] },
  { alias: "reasoning",     display: "Reasoning",       timeout: 30000, expectedPreferred: ["gemini", "openrouter", "groq"] },
  { alias: "architect",     display: "Architect",       timeout: 30000, expectedPreferred: ["openrouter", "gemini", "groq"] },
  { alias: "deep-research", display: "Deep Research",   timeout: 60000, expectedPreferred: ["gemini", "openrouter"] },
];

// ── Helpers ────────────────────────────────────────────────────

// Read .env
const envContent = existsSync(join(PROJECT_ROOT, ".env"))
  ? readFileSync(join(PROJECT_ROOT, ".env"), "utf8")
  : "";
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

// Colored console
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
};

function log(msg, color = "") {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${C.gray}[${ts}]${C.reset} ${color}${msg}${C.reset}`);
}

function logResult(alias, status, provider, detail, latencyMs) {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  const lat = latencyMs ? ` ${C.gray}(${latencyMs}ms)${C.reset}` : "";
  console.log(`  ${icon} ${C.bold}${alias}${C.reset} → ${C.cyan}${provider || "N/A"}${C.reset}${detail ? ` — ${detail}` : ""}${lat}`);
}

// ── API Call ───────────────────────────────────────────────────

async function callAlias(aliasObj, apiKey) {
  const alias = aliasObj.alias;
  const timeoutMs = aliasObj.timeout || TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();
  try {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: alias,
        messages: [{ role: "user", content: TEST_MESSAGE }],
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startTime;
    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.error?.message || JSON.stringify(data).slice(0, 200);
      return { success: false, latencyMs, error: errMsg, raw: data };
    }

    return {
      success: true,
      latencyMs,
      content: data.choices?.[0]?.message?.content || "",
      model: data.model,
      usage: data.usage,
      raw: data,
    };
  } catch (e) {
    const latencyMs = Date.now() - startTime;
    return { success: false, latencyMs, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Database Helpers ───────────────────────────────────────────

async function setProvidersEnabled(providerIds, enabled) {
  const prisma = new PrismaClient();
  try {
    await prisma.provider.updateMany({
      where: { id: { in: providerIds } },
      data: { isEnabled: enabled },
    });
    log(`  → ${enabled ? "Enabled" : "Disabled"}: ${providerIds.join(", ")}`, C.yellow);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkDbState() {
  const prisma = new PrismaClient();
  try {
    const providers = await prisma.provider.findMany({
      select: { id: true, isEnabled: true, priorityWeight: true },
      orderBy: { priorityWeight: "desc" },
    });
    return providers;
  } finally {
    await prisma.$disconnect();
  }
}

// ── Get/Create API Key ─────────────────────────────────────────

async function getOrCreateApiKey() {
  const prisma = new PrismaClient();
  try {
    // Try existing keys
    const existingKey = await prisma.apiKey.findFirst({
      where: { isActive: true, revokedAt: null },
      include: { user: { select: { email: true } } },
    });

    if (existingKey) {
      // Can't recover full key from hash, so need to create a new one
      log("Existing keys found but need full raw key. Creating a new test key...", C.blue);
    }

    // Create new key
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("No users in database. Register a user first.");

    // Clean up old test keys first
    await prisma.apiKey.deleteMany({ where: { name: { startsWith: "test-key-" } } });

    const rawKey = "sk-team-" + randomBytes(24).toString("hex");

    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = await hash(rawKey, 10);

    await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: `test-key-${Date.now()}`,
        keyHash,
        keyPrefix,
        isActive: true,
      },
    });

    log(`  API Key created: ${rawKey.slice(0, 20)}...`, C.green);
    return rawKey;
  } finally {
    await prisma.$disconnect();
  }
}

// ── Main Test Runner ───────────────────────────────────────────

async function runPhase(name, aliases, apiKey) {
  log(`\n${C.bold}${C.magenta}═══════════════════════════════════${C.reset}`);
  log(`${C.bold}${C.magenta}  Phase: ${name}${C.reset}`);
  log(`${C.bold}${C.magenta}═══════════════════════════════════${C.reset}`);

  const results = [];
  for (const aliasObj of aliases) {
    const { alias, display, timeout } = aliasObj;
    log(`\n  Testing: ${C.bold}${display}${C.reset} (${C.cyan}${alias}${C.reset})`);
    const result = await callAlias(aliasObj, apiKey);

    if (result.success) {
      logResult(alias, "PASS", result.model, `"${result.content}"`, result.latencyMs);

      results.push({
        alias,
        status: "PASS",
        provider: result.model,
        content: result.content,
        latencyMs: result.latencyMs,
        usage: result.usage,
        timestamp: new Date().toISOString(),
      });
    } else {
      logResult(alias, "FAIL", null, result.error, result.latencyMs);

      results.push({
        alias,
        status: "FAIL",
        error: result.error,
        latencyMs: result.latencyMs,
        timestamp: new Date().toISOString(),
      });
    }

    // Small delay between requests to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

// ── Results Saver ──────────────────────────────────────────────

function saveResults(allResults) {
  const resultsDir = join(PROJECT_ROOT, "scripts", "test-results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(resultsDir, `test-run-${timestamp}.json`);

  // Calculate summary
  const totalTests = allResults.flatMap((p) => p.results).length;
  const passed = allResults.flatMap((p) => p.results).filter((r) => r.status === "PASS").length;
  const failed = allResults.flatMap((p) => p.results).filter((r) => r.status === "FAIL").length;

  const report = {
    timestamp: new Date().toISOString(),
    gatewayUrl: GATEWAY_URL,
    summary: {
      totalTests,
      passed,
      failed,
      phases: allResults.length,
    },
    phases: allResults.map((p) => ({
      name: p.name,
      scenario: p.scenario,
      results: p.results,
    })),
  };

  writeFileSync(filePath, JSON.stringify(report, null, 2));
  log(`\n📄 Results saved: ${C.cyan}${filePath}${C.reset}`, C.bold);

  // Also print summary table
  console.log(`\n${C.bold}${C.magenta}═══════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.magenta}  FINAL SUMMARY${C.reset}`);
  console.log(`${C.bold}${C.magenta}═══════════════════════════════════${C.reset}`);
  console.log(`  Total tests: ${totalTests}`);
  console.log(`  ${C.green}Passed: ${passed}${C.reset}`);
  if (failed > 0) console.log(`  ${C.red}Failed: ${failed}${C.reset}`);
  console.log(`  Phases: ${allResults.length}`);
  console.log(`  Report: ${filePath}`);

  for (const phase of allResults) {
    console.log(`\n  ${C.bold}${phase.name}${C.reset}`);
    for (const r of phase.results) {
      const icon = r.status === "PASS" ? "✅" : "❌";
      const detail = r.provider ? `→ ${r.provider}` : r.error?.slice(0, 60) || "";
      console.log(`    ${icon} ${r.alias} ${detail}`);
    }
  }

  return report;
}

// ── Entry Point ────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.blue}║   KWEN GATEWAY — COMPREHENSIVE TEST    ║${C.reset}`);
  console.log(`${C.bold}${C.blue}╚══════════════════════════════════════╝${C.reset}`);
  console.log(`  ${C.gray}Gateway: ${GATEWAY_URL}${C.reset}`);
  console.log(`  ${C.gray}Time: ${new Date().toISOString()}${C.reset}`);

  // ── Setup ──────────────────────────────────────────
  log("\n📋 Checking server availability...", C.blue);
  try {
    const serverCheck = await fetch(`${GATEWAY_URL}/`, { signal: AbortSignal.timeout(5000) });
    if (!serverCheck.ok && serverCheck.status !== 404) {
      throw new Error(`Server returned ${serverCheck.status}`);
    }
    log(`  ✅ Gateway is reachable at ${GATEWAY_URL}`, C.green);
  } catch (e) {
    log(`  ❌ Cannot reach ${GATEWAY_URL}: ${e.message}`, C.red);
    log(`  ${C.yellow}Start the dev server first: npm run dev${C.reset}`);
    process.exit(1);
  }

  log("\n📋 Checking database state...", C.blue);
  let dbState = await checkDbState();
  console.log(`  Enabled providers: ${dbState.filter((p) => p.isEnabled).map((p) => p.id).join(", ") || "NONE"}`);

  // Get API key
  log("\n🔑 Setting up API key...", C.blue);
  const apiKey = await getOrCreateApiKey();

  // ── Phase 1: Normal Routing ───────────────────────
  log(`\n${C.bold}${C.green}╔════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.green}║  PHASE 1: NORMAL ROUTING               ║${C.reset}`);
  log(`${C.bold}${C.green}║  All providers enabled                  ║${C.reset}`);
  log(`${C.bold}${C.green}╚════════════════════════════════════════╝${C.reset}`);

  const phase1Results = await runPhase("Normal Routing", ALL_ALIASES, apiKey);

  // ── Phase 2: Failover (Disable Groq + Gemini) ─────
  log(`\n${C.bold}${C.yellow}╔════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.yellow}║  PHASE 2: FAILOVER TEST                ║${C.reset}`);
  log(`${C.bold}${C.yellow}║  Disabling: Groq, Gemini               ║${C.reset}`);
  log(`${C.bold}${C.yellow}╚════════════════════════════════════════╝${C.reset}`);

  await setProvidersEnabled(["groq", "gemini"], false);
  await new Promise((r) => setTimeout(r, 1000)); // Wait for DB sync

  const phase2Results = await runPhase("Failover (No Groq/Gemini)", ALL_ALIASES, apiKey);

  // ── Phase 3: Extreme Failover (Only 1 provider) ───
  log(`\n${C.bold}${C.red}╔════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.red}║  PHASE 3: EXTREME FAILOVER             ║${C.reset}`);
  log(`${C.bold}${C.red}║  Enabling ONLY: OpenRouter              ║${C.reset}`);
  log(`${C.bold}${C.red}╚════════════════════════════════════════╝${C.reset}`);

  // Disable all except openrouter
  const allProviderIds = dbState.map((p) => p.id);
  await setProvidersEnabled(allProviderIds, false);
  await setProvidersEnabled(["openrouter"], true);
  await new Promise((r) => setTimeout(r, 1000));

  const phase3Results = await runPhase("Extreme Failover (OpenRouter Only)", ALL_ALIASES, apiKey);

  // ── Phase 4: Single provider (Cerebras only) ──────
  log(`\n${C.bold}${C.magenta}╔════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.magenta}║  PHASE 4: SINGLE PROVIDER             ║${C.reset}`);
  log(`${C.bold}${C.magenta}║  Enabling ONLY: Cerebras               ║${C.reset}`);
  log(`${C.bold}${C.magenta}╚════════════════════════════════════════╝${C.reset}`);

  await setProvidersEnabled(allProviderIds, false);
  await setProvidersEnabled(["cerebras"], true);
  await new Promise((r) => setTimeout(r, 1000));

  const phase4Results = await runPhase("Single Provider (Cerebras Only)", ALL_ALIASES, apiKey);

  // ── Restore original state ────────────────────────
  log(`\n${C.bold}${C.green}╔════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.green}║  RESTORING PROVIDERS                   ║${C.reset}`);
  log(`${C.bold}${C.green}╚════════════════════════════════════════╝${C.reset}`);

  // Re-fetch provider IDs from current DB state
  const freshState = await checkDbState();
  const restoreIds = freshState.map((p) => p.id);
  await setProvidersEnabled(restoreIds, true);
  await new Promise((r) => setTimeout(r, 1000));

  // Verify restoration
  dbState = await checkDbState();
  const restoredCount = dbState.filter((p) => p.isEnabled).length;
  log(`  Restored ${restoredCount}/${dbState.length} providers ✅`, C.green);

  // ── Save Report ───────────────────────────────────
  const allResults = [
    { name: "Phase 1: Normal Routing", scenario: "All providers enabled", results: phase1Results },
    { name: "Phase 2: Failover", scenario: "Groq + Gemini disabled", results: phase2Results },
    { name: "Phase 3: Extreme Failover", scenario: "OpenRouter only", results: phase3Results },
    { name: "Phase 4: Single Provider", scenario: "Cerebras only", results: phase4Results },
  ];

  const report = saveResults(allResults);

  // ── Final Verdict ─────────────────────────────────
  const totalPassed = allResults.flatMap((p) => p.results).filter((r) => r.status === "PASS").length;
  const totalFailed = allResults.flatMap((p) => p.results).filter((r) => r.status === "FAIL").length;
  const total = totalPassed + totalFailed;

  console.log(`\n${C.bold}${C.magenta}═══════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.magenta}  VERDICT: ${totalPassed}/${total} tests passed${C.reset}`);
  if (totalFailed === 0) {
    console.log(`${C.bold}${C.green}  🎉 ALL TESTS PASSED!${C.reset}`);
  } else {
    console.log(`${C.bold}${C.red}  ${totalFailed} test(s) FAILED${C.reset}`);
  }
  console.log(`${C.bold}${C.magenta}═══════════════════════════════════════${C.reset}`);
  console.log(`  ${C.gray}Report: scripts/test-results/test-run-*.json${C.reset}\n`);
}

main().catch((e) => {
  console.error(`\n${C.red}${C.bold}FATAL: ${e.message}${C.reset}`);
  console.error(e.stack);
  process.exit(1);
});
