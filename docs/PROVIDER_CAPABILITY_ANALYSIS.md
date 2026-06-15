
================================================================================
UPDATED PROVIDER CAPABILITY ANALYSIS (Post-Search Verification)
================================================================================

CRITICAL DISCOVERY: Cohere now provides OpenAI-compatible endpoint at
https://api.cohere.ai/compatibility/v1 (verified from official docs).

This means:
- Cohere NO LONGER requires a separate native adapter
- Cohere can use the SAME OpenAI-compatible adapter as Gemini, Groq, etc.
- Only special handling needed: Cohere-specific headers, model ID format

================================================================================
REVISED COMPATIBILITY TABLE
================================================================================

| Provider       | Base URL                                  | Auth              | OpenAI Compatible | Special Handling Needed           |
|----------------|-------------------------------------------|-------------------|-------------------|-----------------------------------|
| Gemini         | https://generativelanguage.googleapis.com/v1beta/openai/ | Bearer GEMINI_API_KEY | ✅ YES (native) | None - native endpoint            |
| Groq           | https://api.groq.com/openai/v1            | Bearer GROQ_API_KEY | ✅ YES (native) | None                              |
| OpenRouter     | https://openrouter.ai/api/v1              | Bearer + Headers  | ✅ YES (native) | HTTP-Referer, X-Title headers     |
| Cerebras       | https://api.cerebras.ai/v1                | Bearer CEREBRAS_API_KEY | ✅ YES (native) | Filter unsupported params         |
| SambaNova      | https://api.sambanova.ai/v1               | Bearer SAMBANOVA_API_KEY | ✅ YES (native) | None                              |
| Cohere         | https://api.cohere.ai/compatibility/v1    | Bearer COHERE_API_KEY | ✅ YES (NEW)    | Compatibility endpoint path       |
| HuggingFace    | https://router.huggingface.co/v1          | Bearer HF_TOKEN   | ✅ YES (new)    | Router endpoint (not legacy)      |
| Together AI    | https://api.together.xyz/v1               | Bearer TOGETHER_API_KEY | ✅ YES (native) | None                              |
| Fireworks AI   | https://api.fireworks.ai/inference/v1     | Bearer FIREWORKS_API_KEY | ✅ YES (native) | Model ID prefix                   |
| Ollama         | http://localhost:11434/v1                 | None              | ✅ YES (native) | Local only, /api/tags health      |
| vLLM           | http://localhost:8000/v1                  | None              | ✅ YES (native) | Local only                        |

================================================================================
ADAPTER ARCHITECTURE DECISION
================================================================================

Given that ALL 11 providers now support OpenAI-compatible endpoints:

PRIMARY ADAPTER: OpenAICompatibleAdapter
- Handles ALL providers except legacy HuggingFace
- Request transformation: NONE (pass through)
- Response transformation: NONE (pass through)
- Streaming: SSE standard format
- Error handling: Standard HTTP + OpenAI error format

SECONDARY ADAPTER: HuggingFaceLegacyAdapter (fallback only)
- For legacy api-inference.huggingface.co/models/{model}
- Request: OpenAI → HF native format
- Response: HF native → OpenAI format
- Streaming: NOT supported (fake split)
- Used only if router endpoint fails

================================================================================
REQUEST/RESPONSE TRANSFORMATION MATRIX
================================================================================

Provider        | Request Transform | Response Transform | Stream Transform | Notes
----------------|-------------------|--------------------|------------------|-------
Gemini          | None              | None               | None             | Native OpenAI endpoint
Groq            | None              | None               | None             | Native OpenAI endpoint
OpenRouter      | Add headers       | None               | None             | HTTP-Referer, X-Title
Cerebras        | Filter params     | None               | None             | Remove freq/presence penalty
SambaNova       | None              | None               | None             | Native OpenAI endpoint
Cohere          | None              | None               | None             | NEW compatibility endpoint
HuggingFace     | None (router)     | None (router)      | None (router)    | Use router.huggingface.co
Together        | None              | None               | None             | Native OpenAI endpoint
Fireworks       | Prefix model ID   | None               | None             | accounts/fireworks/models/
Ollama          | None              | None               | None             | Local endpoint
vLLM            | None              | None               | None             | Local endpoint

================================================================================
STREAMING IMPLEMENTATION (ALL PROVIDERS)
================================================================================

Standard SSE Format:
  data: {"id":"...","choices":[{"delta":{"content":"Hello"}}]}

  data: {"id":"...","choices":[{"delta":{"content":" world"}}]}

  data: [DONE]

All OpenAI-compatible providers emit this exact format.
No provider-specific stream parsing needed.

================================================================================
AUTHENTICATION METHODS
================================================================================

Provider        | Header Format                          | Key Source
----------------|----------------------------------------|----------
Gemini          | Authorization: Bearer {GEMINI_API_KEY} | env GEMINI_API_KEY
Groq            | Authorization: Bearer {GROQ_API_KEY}   | env GROQ_API_KEY
OpenRouter      | Authorization: Bearer {OPENROUTER_API_KEY} | env OPENROUTER_API_KEY
                | HTTP-Referer: {app_url}                | env NEXT_PUBLIC_APP_URL
                | X-Title: AI Gateway                    | hardcoded
Cerebras        | Authorization: Bearer {CEREBRAS_API_KEY} | env CEREBRAS_API_KEY
SambaNova       | Authorization: Bearer {SAMBANOVA_API_KEY} | env SAMBANOVA_API_KEY
Cohere          | Authorization: Bearer {COHERE_API_KEY} | env COHERE_API_KEY
HuggingFace     | Authorization: Bearer {HF_TOKEN}       | env HUGGINGFACE_API_KEY
Together        | Authorization: Bearer {TOGETHER_API_KEY} | env TOGETHER_API_KEY
Fireworks       | Authorization: Bearer {FIREWORKS_API_KEY} | env FIREWORKS_API_KEY
Ollama          | None                                   | N/A (local)
vLLM            | None                                   | N/A (local)

================================================================================
ERROR HANDLING (STANDARDIZED)
================================================================================

All OpenAI-compatible providers return errors in this format:
  {
    "error": {
      "message": "...",
      "type": "...",
      "code": "..."
    }
  }

Standard HTTP Status Codes:
  400 - Invalid request (bad params, bad model)
  401 - Invalid API key
  429 - Rate limit exceeded
  500 - Provider internal error
  503 - Service unavailable (retry)
  504 - Gateway timeout

Retry Strategy:
  - 429: Retry after Retry-After header (or 1s, 2s, 4s exponential)
  - 503: Retry immediately (provider may be warming up)
  - 500: Retry once (transient error)
  - 400/401: NO RETRY (client error)

================================================================================
TIMEOUTS
================================================================================

Provider        | Timeout | Reason
----------------|---------|------------------------------------------
Gemini          | 30s     | Standard
Groq            | 15s     | Fast inference hardware
OpenRouter      | 60s     | Multi-hop routing, provider selection
Cerebras        | 20s     | Fast wafer-scale hardware
SambaNova       | 20s     | Fast inference
Cohere          | 25s     | Standard
HuggingFace     | 45s     | Cold start possible
Together        | 30s     | Standard
Fireworks       | 30s     | Standard
Ollama          | 60s     | Local, may be slow
vLLM            | 60s     | Local, may be slow

================================================================================
MODEL MAPPING (Alias → Provider Model ID)
================================================================================

Alias: coder-fast
  Gemini:    gemini-1.5-flash
  Groq:      llama-3.3-70b-versatile
  OpenRouter: openai/gpt-4o-mini
  Cerebras:  llama3.1-8b
  SambaNova: Meta-Llama-3.3-70B-Instruct
  Cohere:    command-r7b-12-2024
  HuggingFace: meta-llama/Llama-3.2-3B-Instruct
  Together:  meta-llama/Llama-3.2-3B-Instruct-Turbo
  Fireworks: accounts/fireworks/models/llama-v3p2-3b-instruct
  Ollama:    codellama
  vLLM:      default

Alias: coder-smart
  Gemini:    gemini-1.5-pro
  Groq:      llama-3.3-70b-versatile
  OpenRouter: anthropic/claude-3.5-sonnet
  Cerebras:  llama-3.3-70b
  SambaNova: Meta-Llama-3.3-70B-Instruct
  Cohere:    command-r-plus-08-2024
  HuggingFace: mistralai/Mistral-7B-Instruct-v0.2
  Together:  meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
  Fireworks: accounts/fireworks/models/llama-v3p1-70b-instruct
  Ollama:    codellama:70b
  vLLM:      default

Alias: reasoning
  Gemini:    gemini-1.5-pro
  Groq:      llama-3.3-70b-versatile
  OpenRouter: anthropic/claude-3.5-sonnet
  Cerebras:  llama-3.3-70b
  SambaNova: Meta-Llama-3.3-70B-Instruct
  Cohere:    command-r-plus-08-2024
  HuggingFace: mistralai/Mistral-7B-Instruct-v0.2
  Together:  meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
  Fireworks: accounts/fireworks/models/llama-v3p1-70b-instruct
  Ollama:    llama3.1:70b
  vLLM:      default

Alias: architect
  Gemini:    gemini-1.5-pro
  Groq:      llama-3.3-70b-versatile
  OpenRouter: anthropic/claude-3.5-sonnet
  Cerebras:  llama-3.3-70b
  SambaNova: Meta-Llama-3.3-70B-Instruct
  Cohere:    command-r-plus-08-2024
  HuggingFace: mistralai/Mistral-7B-Instruct-v0.2
  Together:  meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
  Fireworks: accounts/fireworks/models/llama-v3p1-70b-instruct
  Ollama:    llama3.1:70b
  vLLM:      default

Alias: deep-research
  Gemini:    gemini-1.5-pro
  Groq:      llama-3.3-70b-versatile
  OpenRouter: perplexity/sonar-reasoning
  Cerebras:  llama-3.3-70b
  SambaNova: Meta-Llama-3.3-70B-Instruct
  Cohere:    command-r-plus-08-2024
  HuggingFace: mistralai/Mistral-7B-Instruct-v0.2
  Together:  meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
  Fireworks: accounts/fireworks/models/llama-v3p1-70b-instruct
  Ollama:    llama3.1:70b
  vLLM:      default

================================================================================
MODEL FAMILY PRESERVATION
================================================================================

Family: llama
  Providers: Groq, Cerebras, SambaNova, Together, Fireworks, Ollama, vLLM, HuggingFace
  Models: llama-3.3-70b, llama3.1-8b, Meta-Llama-3.3-70B, codellama, etc.

Family: qwen
  Providers: Cerebras, Together, Fireworks, HuggingFace
  Models: qwen-2.5-72b, etc.

Family: gemini
  Providers: Gemini only
  Models: gemini-1.5-flash, gemini-1.5-pro

Family: command
  Providers: Cohere only
  Models: command-r, command-r-plus, command-r7b

Family: gpt
  Providers: OpenRouter (via OpenAI), Together
  Models: gpt-4o, gpt-4o-mini

Family: claude
  Providers: OpenRouter (via Anthropic)
  Models: claude-3.5-sonnet

Family: mistral
  Providers: HuggingFace, Together, Fireworks
  Models: Mistral-7B, Mixtral-8x7B

Fallback Rule:
  If provider fails, find another provider with SAME family.
  If no same-family provider available, use fallback chain (any family).
  Priority: same-family > preferred list > fallback list > any available.

================================================================================
CIRCUIT BREAKER STATES
================================================================================

State: closed
  - Normal operation
  - Requests allowed
  - consecutiveFailures tracked

State: open
  - Provider blocked
  - Immediate fallback to next provider
  - No requests sent to this provider
  - Auto-transition to half-open after 60s

State: half-open
  - ONE test request allowed
  - Success → closed
  - Failure → open (reset timer)

Transition Triggers:
  consecutiveFailures >= 5 → open
  open + 60s → half-open
  half-open + success → closed
  half-open + failure → open

================================================================================
ADAPTER IMPLEMENTATION PLAN
================================================================================

Given the above analysis, we need ONLY 2 adapter implementations:

1. OpenAICompatibleAdapter
   - Handles: Gemini, Groq, OpenRouter, Cerebras, SambaNova, Cohere, 
             HuggingFace (router), Together, Fireworks, Ollama, vLLM
   - Request: Pass-through (with provider-specific headers/filters)
   - Response: Pass-through
   - Stream: Standard SSE
   - Error: Standard OpenAI error format

2. HuggingFaceLegacyAdapter (fallback)
   - Handles: HuggingFace legacy inference API
   - Request: OpenAI → HF native format
   - Response: HF native → OpenAI format
   - Stream: NOT supported (mark as false)
   - Error: Custom handling

Factory will select adapter based on provider ID:
  - huggingface → OpenAICompatibleAdapter (router endpoint, primary)
  - huggingface-legacy → HuggingFaceLegacyAdapter (fallback)
  - all others → OpenAICompatibleAdapter

This simplifies the codebase significantly while maintaining full functionality.
