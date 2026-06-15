-- ============================================================================
-- Kwen Gateway — Supabase PostgreSQL Schema
-- Paste this into Supabase SQL Editor and run it.
-- ============================================================================

-- Table: users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Table: api_keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys(created_at);

-- Table: sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(512) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Table: conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  provider_id VARCHAR(50) NOT NULL,
  model_alias VARCHAR(50) NOT NULL,
  model_family VARCHAR(50) NOT NULL,
  last_model_used VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  switch_count INT NOT NULL DEFAULT 0,
  last_switched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_provider_id ON conversations(provider_id);
CREATE INDEX IF NOT EXISTS idx_conversations_is_active ON conversations(is_active);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_model_family ON conversations(model_family);

-- Table: providers
CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  tier VARCHAR(20) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority_weight INT NOT NULL DEFAULT 100,
  quota_limit_daily INT NOT NULL DEFAULT 1000,
  quota_used_today INT NOT NULL DEFAULT 0,
  base_url VARCHAR(500),
  api_key_encrypted VARCHAR(1000),
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_providers_name ON providers(name);
CREATE INDEX IF NOT EXISTS idx_providers_tier ON providers(tier);
CREATE INDEX IF NOT EXISTS idx_providers_is_enabled ON providers(is_enabled);
CREATE INDEX IF NOT EXISTS idx_providers_priority_weight ON providers(priority_weight);

-- Table: provider_health
CREATE TABLE IF NOT EXISTS provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id VARCHAR(50) UNIQUE NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  latency_ms INT NOT NULL DEFAULT 0,
  success_rate FLOAT NOT NULL DEFAULT 0,
  error_rate FLOAT NOT NULL DEFAULT 0,
  consecutive_failures INT NOT NULL DEFAULT 0,
  circuit_state VARCHAR(20) NOT NULL DEFAULT 'closed',
  circuit_opened_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error VARCHAR(1000)
);

CREATE INDEX IF NOT EXISTS idx_provider_health_provider_id ON provider_health(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_health_status ON provider_health(status);
CREATE INDEX IF NOT EXISTS idx_provider_health_circuit_state ON provider_health(circuit_state);
CREATE INDEX IF NOT EXISTS idx_provider_health_last_checked_at ON provider_health(last_checked_at);

-- Table: provider_usage
CREATE TABLE IF NOT EXISTS provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id VARCHAR(50) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  requests_count INT NOT NULL DEFAULT 0,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  errors_count INT NOT NULL DEFAULT 0,
  avg_latency_ms INT NOT NULL DEFAULT 0,
  UNIQUE(provider_id, date)
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_id ON provider_usage(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_usage_date ON provider_usage(date);

-- Table: provider_quota_state
CREATE TABLE IF NOT EXISTS provider_quota_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id VARCHAR(50) UNIQUE NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  remaining_requests INT NOT NULL DEFAULT 0,
  remaining_tokens INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_quota_state_provider_id ON provider_quota_state(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_quota_state_reset_at ON provider_quota_state(reset_at);

-- Table: request_logs
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(255) UNIQUE NOT NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  provider_id VARCHAR(50) REFERENCES providers(id) ON DELETE SET NULL,
  model_alias VARCHAR(50) NOT NULL,
  model_used VARCHAR(100) NOT NULL,
  model_family VARCHAR(50) NOT NULL,
  provider_attempt INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  error_message VARCHAR(1000),
  session_id VARCHAR(255),
  streaming BOOLEAN NOT NULL DEFAULT false,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_id_created_at ON request_logs(api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_provider_id ON request_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_session_id ON request_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status);
CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);

-- Table: rate_limits
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_type VARCHAR(20) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  token_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(api_key_id, window_type, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_api_key_id ON rate_limits(api_key_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_type ON rate_limits(window_type);

-- ============================================================================
-- RLS Policies (Row Level Security)
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_quota_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_aliases ENABLE ROW LEVEL SECURITY;

-- Note: service_role bypasses RLS entirely in Supabase by default.
-- Prisma connects via direct PostgreSQL, also bypassing RLS.
-- These policies protect against Supabase REST/JS client access.

-- Authenticated users: read-only on public provider data
CREATE POLICY "Authenticated read providers" ON providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read provider_health" ON provider_health FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read model_aliases" ON model_aliases FOR SELECT TO authenticated USING (true);

-- Anon: read-only on provider catalog
CREATE POLICY "Anon read providers" ON providers FOR SELECT USING (true);
CREATE POLICY "Anon read provider_health" ON provider_health FOR SELECT USING (true);
CREATE POLICY "Anon read model_aliases" ON model_aliases FOR SELECT USING (true);

-- Table: model_aliases
CREATE TABLE IF NOT EXISTS model_aliases (
  id VARCHAR(50) PRIMARY KEY,
  alias VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  routing_strategy VARCHAR(20) NOT NULL DEFAULT 'best_score',
  preferred_providers JSONB NOT NULL,
  fallback_providers JSONB NOT NULL,
  max_tokens INT NOT NULL DEFAULT 4096,
  temperature FLOAT NOT NULL DEFAULT 0.7,
  system_prompt VARCHAR(2000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_aliases_alias ON model_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_model_aliases_is_active ON model_aliases(is_active);

-- ============================================================================
-- Seed: Default providers
-- ============================================================================
INSERT INTO providers (id, name, display_name, tier, is_enabled, priority_weight, quota_limit_daily) VALUES
  ('gemini', 'gemini', 'Google Gemini', 'tier1', true, 100, 1000),
  ('groq', 'groq', 'Groq', 'tier1', true, 100, 1000),
  ('openrouter', 'openrouter', 'OpenRouter', 'tier1', true, 100, 1000),
  ('cerebras', 'cerebras', 'Cerebras', 'tier2', true, 80, 1000),
  ('sambanova', 'sambanova', 'SambaNova', 'tier2', true, 80, 1000),
  ('cohere', 'cohere', 'Cohere', 'tier2', true, 80, 1000),
  ('huggingface', 'huggingface', 'Hugging Face', 'tier3', true, 60, 1000),
  ('together', 'together', 'Together AI', 'tier3', true, 60, 1000),
  ('fireworks', 'fireworks', 'Fireworks AI', 'tier3', true, 60, 1000),
  ('ollama', 'ollama', 'Ollama (Local)', 'optional', true, 40, 1000),
  ('vllm', 'vllm', 'vLLM (Local)', 'optional', true, 40, 1000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Seed: Default model aliases
-- ============================================================================
INSERT INTO model_aliases (id, alias, display_name, description, preferred_providers, fallback_providers, max_tokens, temperature) VALUES
  ('coder-fast', 'coder-fast', 'Coder Fast', 'Optimized for speed', '["groq","gemini","cerebras"]', '["openrouter","sambanova","together","fireworks"]', 4096, 0.1),
  ('coder-smart', 'coder-smart', 'Coder Smart', 'Balanced speed and quality', '["groq","gemini","openrouter"]', '["cerebras","sambanova","cohere","together"]', 8192, 0.2),
  ('reasoning', 'reasoning', 'Reasoning', 'Deep reasoning', '["gemini","openrouter","groq"]', '["cerebras","sambanova","cohere","together"]', 16384, 0.3),
  ('architect', 'architect', 'Architect', 'High-level design', '["openrouter","gemini","groq"]', '["cerebras","sambanova","cohere","together"]', 32768, 0.4),
  ('deep-research', 'deep-research', 'Deep Research', 'Long-context research', '["gemini","openrouter"]', '["groq","cerebras","together","fireworks"]', 128000, 0.5)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Seed: Provider health (initial healthy state)
-- ============================================================================
INSERT INTO provider_health (provider_id, status, latency_ms, circuit_state) VALUES
  ('gemini', 'unknown', 0, 'closed'),
  ('groq', 'unknown', 0, 'closed'),
  ('openrouter', 'unknown', 0, 'closed'),
  ('cerebras', 'unknown', 0, 'closed'),
  ('sambanova', 'unknown', 0, 'closed'),
  ('cohere', 'unknown', 0, 'closed'),
  ('huggingface', 'unknown', 0, 'closed'),
  ('together', 'unknown', 0, 'closed'),
  ('fireworks', 'unknown', 0, 'closed'),
  ('ollama', 'unknown', 0, 'closed'),
  ('vllm', 'unknown', 0, 'closed')
ON CONFLICT (provider_id) DO NOTHING;
