# CLAUDE.md — HeardChef

> This file is read by Claude Code at the start of every session.
> Do not skip it. Do not assume context from prior sessions.

---

## What Is HeardChef

HeardChef is an AI-powered personal cooking companion PWA. It is **not** a recipe reader — it is a culinary mentor. When a user starts a cooking session, the AI takes on the voice and personality of a specific chef and walks them through the recipe step by step. When asked any question about technique, science, substitution, or ingredients, the agent answers with depth and authority drawn from a curated culinary knowledge base.

**Target user:** Home chefs who want to genuinely improve — hands-free, voice-first, kitchen-aware.
**Target price:** ~$100/month (subscription model, not yet implemented).

---

## Ecosystem Position

This is a **standalone product**. It is one of four fully isolated products in a broader portfolio:

| Product | Purpose | Supabase Project |
|---|---|---|
| **HeardChef** | AI cooking companion | `mtjqsjpgwiaacybyklkt` |
| FCA | Fitness/content platform | `kidgcrqxrfcbsaeguwop` |
| SnapReceipt | Receipt scanning tool | Separate project |
| Real Estate Lead Gen | Lead generation agent | Separate project |

**These products share zero infrastructure.** No shared tables, credentials, or code. Do not reference, query, or touch any other Supabase project, GitHub repo, Netlify site, or n8n workflow group. This is non-negotiable.

---

## Infrastructure

| Service | Value |
|---|---|
| **Live URL** | https://heardchef-app.netlify.app |
| **GitHub** | `admin625/heardchef` |
| **Supabase Project ID** | `mtjqsjpgwiaacybyklkt` |
| **Supabase URL** | `https://mtjqsjpgwiaacybyklkt.supabase.co` |
| **Netlify Site** | `heardchef-app` (Pro plan) |
| **AI Model** | `claude-sonnet-4-20250514` |
| **Embeddings** | OpenAI `text-embedding-ada-002` |
| **Voice** | ElevenLabs (Creator plan) — chef-specific voice IDs |
| **SMS/WhatsApp** | Twilio (shopping list delivery) |
| **Automation** | n8n — HeardChef workflow group only |

---

## Stack

```
React 19
Tailwind CSS 4
Vite 8
Supabase JS (client + server-side)
Netlify Functions (API proxy layer)
Claude API — claude-sonnet-4-20250514
OpenAI API — ada-002 (embeddings only)
ElevenLabs API (TTS, chef voices)
```

---

## Environment Variables

All secrets live in Netlify environment variables. Never hardcode. Never expose to the frontend.

| Key | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API — cooking conversation engine |
| `OPENAI_API_KEY` | OpenAI ada-002 embeddings for RAG |
| `SUPABASE_SERVICE_KEY` | Server-side Supabase access (HeardChef project only) |
| `ELEVENLABS_API_KEY` | Chef voice synthesis |

The Supabase anon key is safe for the client. The service key is server-only (Netlify Functions).

---

## Key Files & Folders

```
/
├── src/
│   ├── lib/
│   │   └── supabase.js          # Supabase client — points to mtjqsjpgwiaacybyklkt
│   ├── pages/
│   │   ├── Home.jsx             # Chef cards landing page
│   │   ├── ChefDetail.jsx       # Recipe grid per chef
│   │   ├── RecipeDetail.jsx     # Full recipe view + Start Cooking button
│   │   └── CookingSession.jsx   # /cook/:recipeId — AI chat interface
│   └── components/              # Shared UI components
├── netlify/
│   └── functions/
│       ├── chat.mjs             # Main AI conversation proxy → Claude API
│       └── generate-embeddings.mjs  # Embedding generation → OpenAI ada-002
├── public/
├── CLAUDE.md                    # ← This file
└── package.json
```

---

## Database Schema

**Supabase project: `mtjqsjpgwiaacybyklkt`** — 12 tables total.

### Core Tables

| Table | Purpose |
|---|---|
| `chefs` | 4 chef personas — Bourdain, Pépin, Child, Garten |
| `recipes` | Recipe content with full JSONB ingredients + steps |
| `hc_users` | User profiles (⚠️ named `hc_users`, NOT `users`) |
| `cooking_sessions` | Conversation history, session state |
| `shopping_lists` | SMS/WhatsApp send records |

### Knowledge Base Tables (RAG)

| Table | Contents |
|---|---|
| `culinary_techniques` | Core techniques with embeddings |
| `food_science` | The why behind cooking chemistry |
| `culinary_traditions` | French, Italian, Japanese, etc. |
| `dietary_adaptations` | Gluten-free, dairy-free, substitutions |
| `troubleshooting` | What went wrong and how to fix it |
| `ingredient_intelligence` | Deep ingredient knowledge |
| `chef_fundamentals` | Foundational culinary school-level knowledge |

**pgvector is enabled.** The RAG function is `match_culinary_knowledge()` — it takes a query embedding and returns the top matching knowledge chunks. This is called from the Netlify function on every non-trivial user message.

### JSONB Structures

**Recipe ingredients:**
```json
{
  "item": "",
  "amount": "",
  "unit": "",
  "category": "",
  "substitutions": []
}
```

**Recipe steps:**
```json
{
  "step_number": 1,
  "instruction": "",
  "duration_minutes": 0,
  "timer_needed": false,
  "technique_notes": "",
  "chef_tip": ""
}
```

---

## AI Architecture

The cooking conversation engine lives in `netlify/functions/chat.mjs`. It:

1. Receives a message from the frontend (never exposes the API key)
2. Pulls chef persona from `chefs.personality_description` + `chefs.voice_style`
3. Runs `match_culinary_knowledge()` against the user's question (top 3 chunks)
4. Constructs a dynamic system prompt containing:
   - Chef persona + voice style
   - Full recipe (ingredients + all steps with technique_notes + chef_tips)
   - Current portion size
   - 12 conversation rules (short messages, one step at a time, timer mentions, etc.)
   - Relevant RAG knowledge chunks
5. Sends to `claude-sonnet-4-20250514` and streams the response back

**Step tracking:** The UI parses step references in AI responses to auto-advance the current step indicator. This logic is fragile for poetic/indirect chef voices — handle with care.

---

## Chef Personas

| Chef | Voice Style | ElevenLabs Voice |
|---|---|---|
| Anthony Bourdain | Raw, direct, no bullshit. Street-smart and literary. | Bourdain clone |
| Jacques Pépin | Warm, precise, French-inflected. Patient teacher. | French-accented voice |
| Julia Child | Enthusiastic, encouraging, slight English inflection. | "Millie" |
| Ina Garten | Calm, confident, reassuring. Home elegance. | Garten voice |

**Catchphrases matter** — the voice style includes persona-specific interjections. Do not flatten these.

---

## Design System

```
Background:     #1a1a1a (dark)
Accent/Primary: #f59e0b (amber/gold)
Text:           white / zinc-400
Max width:      768px (mobile-first)
Viewport:       100dvh — no horizontal overflow
Input bar:      keyboard-aware (stays above keyboard on mobile)
Font:           Large text — this app is used hands-free in a kitchen
```

---

## Conventions & Rules

### Naming
- The users table is **`hc_users`** — not `users`. This is intentional to avoid conflict with Supabase's `auth.users`. Never rename it. Never create a `users` table.
- All HeardChef tables should be prefixed or clearly scoped to this project if new tables are added.

### API Keys
- `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_KEY` are **server-only**. They live in Netlify Functions. Never reference them in any frontend file.
- The Supabase anon key is client-safe.

### Isolation
- Every change, migration, or query in this session is scoped to Supabase project `mtjqsjpgwiaacybyklkt` only.
- If any prompt references another project ID, stop and flag it before executing.

### Schema Changes
- Before adding new columns or tables, check whether the field should be added to the `recipes` table schema (difficulty, occasion, cuisine_type, technique_focus) — these are earmarked for the filtering system and should be locked in early.
- Always confirm row counts before and after any migration or destructive operation.

### Deployments
- All deployments go to `heardchef-app.netlify.app` via the `admin625/heardchef` repo.
- Netlify auto-deploys on push to main. Confirm the deploy succeeded before closing a session.

---

## What Claude Code Must Never Do

- **Never touch Supabase project `kidgcrqxrfcbsaeguwop`** — that is the FCA project. Off limits entirely.
- **Never create a table named `users`** — use `hc_users` always.
- **Never expose `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_KEY` to the frontend.**
- **Never modify the RAG function `match_culinary_knowledge()`** without explicit instruction — it is live and all knowledge retrieval depends on it.
- **Never delete or truncate any knowledge base table** (`culinary_techniques`, `food_science`, `culinary_traditions`, `dietary_adaptations`, `troubleshooting`, `ingredient_intelligence`, `chef_fundamentals`) — they contain manually curated data that cannot be regenerated quickly.
- **Never share infrastructure with other products** — no cross-product table references, shared credentials, or combined workflows.
- **Never rename `hc_users`.**
- **Never change the AI model** from `claude-sonnet-4-20250514` without explicit instruction.

---

## Current State (as of last session)

- ✅ 10 seed recipes live across 4 chefs (2–3 per chef)
- ✅ Full AI cooking conversation engine deployed
- ✅ RAG knowledge base live — 7 knowledge tables, pgvector, `match_culinary_knowledge()` active
- ✅ ElevenLabs voices wired per chef
- ✅ Shopping list WhatsApp delivery via Twilio + n8n
- ✅ Full infrastructure isolation complete (migrated from FCA project March 2026)
- 🔲 Auth + user accounts (next)
- 🔲 Stripe billing (~$100/month premium tier)
- 🔲 Recipe library expansion (target ~25 recipes per chef)
- 🔲 Schema hardening: difficulty, cuisine_type, occasion, technique_focus fields
- 🔲 Voice cloning — all 4 chefs (ElevenLabs Professional)
- 🔲 n8n concurrent timer notifications
- 🔲 React Native (post-subscription validation)

---

## Global Build Rules (applies to all projects)

These apply regardless of which product is being built:

1. Every product has its own Supabase project, GitHub repo, Netlify site, and n8n workflow group.
2. No shared tables, credentials, or infrastructure across products.
3. Confirm a new Supabase project has zero tables before writing any schema.
4. Violations require immediate migration before continuing — no exceptions.
5. Products are treated as individually sellable assets. Clean separation is non-negotiable.
