# HeardChef Changelog

## [0.2.0] — 2026-03-18

### Conversation Engine — Major Refactor (CookingSession.jsx)

**Task 1 — System Prompt Rebuilt**
- Replaced monolithic buildSystemPrompt with structured 6-section template
- Added CHEF_IDENTITIES constant with dedicated persona blocks for Bourdain, Pépin, Child, Garten
- Each persona includes signature phrases, personality description, and voice guidance
- Sections: [CHEF IDENTITY] [RECIPE CONTEXT] [USER CONTEXT] [CONVERSATION RULES] [OFF-TOPIC HANDLING] [HARD LIMITS]

**Task 2 — Step Injection Logic**
- System prompt now injects current step only, not full recipe steps array
- Next step injected as hidden internal preview (not revealed to user)
- System prompt rebuilds on each step advance
- Substitutions and user context carry forward across step transitions

**Task 3 — Deflection Response Rotation**
- Added DEFLECTION_POOLS constant with 3 off-topic redirect lines per chef
- Rotation tracking via usedDeflections state — no repeat in same session
- Resets on new session

**Task 4 — Conversation History Pruning**
- Added pruneMessages() function
- When turns exceed 12: keeps first 2 (session anchor) + last 6 (recent context)
- Keeps token count bounded across long sessions

**No changes to:**
- netlify/functions/chat.mjs
- Supabase schema, auth, recipe data, UI components, Netlify routing

---

## [0.1.0] — Initial Build

- React 19 + Tailwind CSS 4 + Vite + Supabase JS
- Netlify Functions proxying to Claude API (claude-sonnet-4-20250514)
- 10 seed recipes across 4 chef personas (Bourdain, Pépin, Child, Garten)
- JSONB ingredient and step structures
- Chat UI with step tracking, quick reply buttons, session saving, animated typing indicator
- hc_users table (intentional naming)
