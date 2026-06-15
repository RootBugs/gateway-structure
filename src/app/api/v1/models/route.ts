import { NextResponse } from "next/server";
import { MODEL_ALIASES, PROVIDER_CONFIGS, getActiveProviderIds } from "@/lib/providers/config";

export const runtime = "nodejs";

export async function GET() {
  const activeProviders = getActiveProviderIds();

  const models = Object.entries(MODEL_ALIASES).map(([alias, config]) => {
    // Check which providers support this alias
    const availableProviders = activeProviders.filter((pid) => {
      const pConfig = PROVIDER_CONFIGS[pid];
      return pConfig && pConfig.modelMapping[alias];
    });

    return {
      id: alias,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "gateway",
      permission: [],
      root: alias,
      parent: null,
      // Gateway-specific metadata
      display_name: config.displayName,
      description: config.description,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      routing_strategy: config.routingStrategy,
      preferred_providers: config.preferredProviders,
      available_providers: availableProviders,
      provider_count: availableProviders.length,
    };
  });

  return NextResponse.json({
    object: "list",
    data: models,
  });
}
