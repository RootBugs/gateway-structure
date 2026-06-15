/**
 * Key Rotation Verification Script
 * Checks that key rotation is properly configured for all providers.
 * Prints the number of keys per provider and their status.
 *
 * Usage: node scripts/verify-key-rotation.mjs
 */

const providers = [
  { id: "openrouter",   envVar: "OPENROUTER_API_KEYS", displayName: "OpenRouter" },
  { id: "gemini",       envVar: "GEMINI_API_KEY",       displayName: "Google Gemini" },
  { id: "groq",         envVar: "GROQ_API_KEY",         displayName: "Groq" },
  { id: "cerebras",     envVar: "CEREBRAS_API_KEY",     displayName: "Cerebras" },
  { id: "sambanova",    envVar: "SAMBANOVA_API_KEY",    displayName: "SambaNova" },
  { id: "cohere",       envVar: "COHERE_API_KEY",       displayName: "Cohere" },
  { id: "huggingface",  envVar: "HUGGINGFACE_API_KEY",  displayName: "Hugging Face" },
  { id: "together",     envVar: "TOGETHER_API_KEY",     displayName: "Together AI" },
  { id: "fireworks",    envVar: "FIREWORKS_API_KEY",    displayName: "Fireworks AI" },
  { id: "xiaomimimo",   envVar: "XIAOMIMIMO_API_KEY",   displayName: "Xiaomi MiMo" },
];

function getEnv(key) {
  return process.env[key] || process.env[key.replace("_KEYS", "_KEY")] || "";
}

function getKeyCount(envVar) {
  const raw = getEnv(envVar);
  if (!raw || raw.length === 0) return 0;
  return raw.split(",").map(k => k.trim()).filter(k => k.length > 0).length;
}

function getKeyPreview(envVar) {
  const raw = getEnv(envVar);
  if (!raw || raw.length === 0) return "";
  const keys = raw.split(",").map(k => k.trim()).filter(k => k.length > 0);
  return keys.map(k => `${k.substring(0, 12)}...${k.substring(k.length - 4)}`).join(", ");
}

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║        KEY ROTATION VERIFICATION                        ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log("");

let totalKeys = 0;
let providersWithKeys = 0;
let providersWithMultipleKeys = 0;

for (const p of providers) {
  const count = getKeyCount(p.envVar);
  const preview = getKeyPreview(p.envVar);
  const padded = p.displayName.padEnd(18);

  if (count === 0) {
    console.log(`  ${padded} ⚠️  NO KEY (provider will be skipped)`);
  } else {
    const symbol = count > 1 ? "✅" : "✓";
    const note = count > 1
      ? ` (${count} keys — rotation ACTIVE!)`
      : ` (1 key — single key mode)`;
    console.log(`  ${padded} ${symbol} ${count} key(s)${note}`);
    if (preview) console.log(`                      Keys: ${preview}`);
    totalKeys += count;
    providersWithKeys++;
    if (count > 1) providersWithMultipleKeys++;
  }
}

console.log("");
console.log("──────────────────────────────────────────────────────────");
console.log(`  Total providers with keys: ${providersWithKeys}/${providers.length}`);
console.log(`  Providers with multiple keys: ${providersWithMultipleKeys} (rotation enabled)`);
console.log(`  Total API keys across all providers: ${totalKeys}`);
console.log("");

if (providersWithMultipleKeys > 0) {
  console.log("  ✅ Key rotation is ACTIVE for these providers:");
  for (const p of providers) {
    const count = getKeyCount(p.envVar);
    if (count > 1) {
      console.log(`     - ${p.displayName} (${count} keys)`);
    }
  }
  console.log("");
  console.log("  On 429 rate limit, the system will immediately rotate to next key.");
  console.log("  Keys are distributed via round-robin across requests.");
} else {
  console.log("  ⚠️  No providers have multiple API keys.");
  console.log("  Set multiple keys as comma-separated values in your .env to enable rotation:");
  console.log("    OPENROUTER_API_KEYS=\"key1,key2,key3,key4,key5\"");
  console.log("");
  console.log("  The system still works with single keys — rotation is additive.");
}

// Check if env vars match expected naming (plural vs singular)
console.log("");
console.log("──────────────────────────────────────────────────────────");
console.log("  Env Var Name Check:");
for (const p of providers) {
  const hasPlural = process.env[p.envVar] !== undefined;
  const singularName = p.envVar.replace("_KEYS", "_KEY");
  const hasSingular = process.env[singularName] !== undefined;
  if (p.envVar.endsWith("_KEYS")) {
    if (hasSingular && !hasPlural) {
      console.log(`  ⚠️  ${p.displayName}: Using ${singularName} (singular). Add ${p.envVar} (plural) for multi-key support.`);
    }
  }
}
