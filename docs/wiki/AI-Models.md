# AI Models

## Supported Models

| Model ID | Display Name | Provider | Input $/1M | Output $/1M | Best for |
|---|---|---|---|---|---|
| `auto` | Auto (Recommended) | — | — | — | Everything — picks best model per sub-task |
| `claude-opus-4-6` | Claude Opus 4.6 | Anthropic | $15 | $75 | Complex reasoning, multi-step orchestration |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic | $3 | $15 | Balanced speed/quality, general use |
| `claude-3.5-haiku` | Claude 3.5 Haiku | Anthropic | $0.80 | $4 | Ultra-fast, cheapest Claude |
| `gpt-4o` | GPT-4o | OpenAI | $2.50 | $10 | Long-context recall, broad knowledge |
| `gpt-4o-mini` | GPT-4o Mini | OpenAI | $0.15 | $0.60 | Lightweight, fast |
| `gpt-4.1` | GPT-4.1 | OpenAI | $2 | $8 | Strong reasoning, coding |
| `gpt-4.1-mini` | GPT-4.1 Mini | OpenAI | $0.40 | $1.60 | Cost-effective general tasks |
| `gpt-4.1-nano` | GPT-4.1 Nano | OpenAI | $0.10 | $0.40 | Ultra-cheap simple tasks |
| `gemini-1.5-pro` | Gemini 1.5 Pro | Google | $1.25 | $5 | Deep research, long documents |
| `gemini-1.5-flash` | Gemini 1.5 Flash | Google | $0.075 | $0.30 | Ultra-fast queries |
| `gemini-2.0-flash` | Gemini 2.0 Flash | Google | $0.10 | $0.40 | Fast, latest Gemini |
| `sonar` | Perplexity Sonar | Perplexity | — | — | Real-time web-augmented search |
| `sonar-pro` | Perplexity Sonar Pro | Perplexity | — | — | Deeper web-augmented analysis |
| `sonar-reasoning-pro` | Sonar Reasoning Pro | Perplexity | — | — | Multi-step reasoning + web search |
| `openrouter` | OpenRouter (Any) | OpenRouter | varies | varies | Route to 200+ models |
| `free` | Free (OpenRouter) | OpenRouter | $0 | $0 | Zero-cost inference |

---

## Selecting a Model

- **From the home page:** the model picker is in the prompt bar toolbar
- **In Settings:** set the global default
- **Per-task:** pick at task creation time
- **Auto:** the agent selects the best model per step (default for most tasks)

---

## Auto Mode Intelligence

When `auto` is selected, the agent picks provider/model based on the task type:

| Sub-task type | Selected model |
|---|---|
| Research | Gemini 2.0 Flash (if `GOOGLE_AI_API_KEY` set), else Claude Sonnet 4.6 |
| Writing | GPT-4o (if `OPENAI_API_KEY` set), else Claude Sonnet 4.6 |
| Code, code review, data analysis | Claude Sonnet 4.6 |
| Web scraping | GPT-4.1 Mini (if OpenAI key), else Claude 3.5 Haiku |
| Planning | GPT-4.1 Mini (if OpenAI key), else Claude Sonnet 4.6 |
| Creative | Claude Sonnet 4.6 |

---

## Multi-Provider Failover

If a provider returns an error (rate limit, outage, auth failure), the engine automatically retries with the next provider in the chain:

```
Anthropic → OpenAI → Google → OpenRouter → Perplexity
```

Retry timing: **2s → 5s → 15s** exponential backoff between attempts. After all providers are exhausted, the task fails with a `provider_unavailable` error.

---

## Free OpenRouter Models

When `free` model is selected, Ottomate cycles through available zero-cost OpenRouter models in priority order:

| Model | Context | Notes |
|---|---|---|
| `openrouter/free` | — | Meta-router: auto-selects best free model (200K ctx) |
| `openrouter/hunter-alpha` | 1M | Cloaked agent, multimodal |
| `openrouter/healer-alpha` | 262K | Multimodal |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | 120B params |
| `qwen/qwen3-next-80b-a3b-instruct:free` | 262K | — |
| `qwen/qwen3-coder:free` | 262K | Code-focused |
| `stepfun/step-3.5-flash:free` | 256K | — |
| `nvidia/nemotron-3-nano-30b-a3b:free` | 256K | — |
| `minimax/minimax-m2.5:free` | 196K | — |
| `openai/gpt-oss-120b:free` | 131K | 120B params |
| `google/gemma-3-27b-it:free` | 131K | Multimodal |
| `mistralai/mistral-small-3.1-24b-instruct:free` | 128K | Multimodal |
| `meta-llama/llama-3.3-70b-instruct:free` | 128K | — |

---

## Agent Personas

Personas modify the agent's system prompt, temperature, and behavior without changing the underlying model. Select a persona from the prompt bar.

| Persona | Temperature | Best for |
|---|---|---|
| **Balanced** (default) | 0.7 | General purpose |
| **Creative** | 0.95 | Brainstorming, ideation, writing — divergent thinking |
| **Analytical** | 0.3 | Data, research, science — rigorous and precise |
| **Concise** | 0.5 | Speed — answers in fewest words possible |
| **Code Expert** | 0.4 | Production-quality code with best practices (prefers Claude Sonnet) |
| **Deep Researcher** | 0.5 | Exhaustive research, 8–12 searches minimum (prefers Sonar Pro) |
| **Teacher** | 0.6 | Patient explanations, analogies, step-by-step walkthroughs |
| **Executive** | 0.5 | Strategic framing, decision frameworks, C-suite communication |

Persona preference is stored in `localStorage` under `ottomate_persona`.

---

## Token Tracking

Every model call logs to the `token_usage` table:

- `prompt_tokens` — tokens in the input
- `completion_tokens` — tokens in the output
- `total_tokens` — sum
- `estimated_cost_usd` — calculated from model pricing
- `model` — which model was actually used
- `task_id` — which task this belongs to

These are aggregated in the **Analytics** page — see model usage and average cost per call.
