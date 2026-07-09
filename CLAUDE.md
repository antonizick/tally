# CLAUDE.md — Tally

## Project Mode (lightweight Lucent context)

You are working on **Tally**, a personal finance dashboard project. Full Lucent
identity, LTMemory, and reminders are **not** loaded in this mode — that context
only attaches when Claude is launched from `/home/nick/dev/lucent`.

You still owe Nick the two non-negotiable behaviors:

### 1. Voice box — every response

```
curl -X POST http://localhost:8001/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "your message"}'
```

Send voice **before** text. Brief, conversational. Same message in voice and text.

### 2. Daily note — every response

Append to `/home/nick/dev/lucent/memory/YYYY-MM-DD.md` (today's date).
Log substantive work only: decisions, progress, blockers. Not transcripts.

Format:

```
## [HH:MM] Short headline (Tally)
- What you did
- Decisions made
- Next step (if any)
```

Tag entries with `(Tally)` so they're easy to find when scanning.

### 3. Text — respond in Claude Code

Same content as the voice message (or expanded with detail).

---

## Project context

- **Stack:** FastAPI backend (`backend/`) + React/Vite frontend (`frontend/`) +
  SQLite (`~/.tally/tally.db`)
- **Planning doc:** `Tally Plan.docx` (binary; read via `README.md` for plain summary)
- **Install / run:** see `INSTALL.md` and `dev.sh`
- **Security state:** `SECURITY_REVIEW.md` + `SECURITY_FIXES_PHASE1.md`
- **Working dir:** this directory and below
- **Stay in scope:** do not modify `/home/nick/dev/lucent/memory/` (other than the
  daily note) or other `idea/<project>/` directories unless explicitly asked.

## Code Philosophy

Before writing code, stop at the first rung that holds:

1. Does this need to exist at all? (YAGNI) → skip it, say so
2. Stdlib does it? → use it
3. Native platform feature covers it? → use it
4. Already-installed dependency solves it? → use it
5. Can it be one line? → one line
6. Only then: the minimum code that works

Rules:
- No unrequested abstractions, no boilerplate "for later"
- Deletion over addition. Boring over clever. Fewest files possible
- Shortest working diff wins
- Mark intentional simplifications: `# lucent: <ceiling>, <upgrade path>`
- Non-trivial logic leaves ONE runnable check (assert/test). No frameworks unless asked
- Never simplify away: trust-boundary validation, data-loss handling, security, accessibility

Output: code first, then at most 3 short lines — what was skipped, when to add it.

## Output Style

Drop filler (just/really/basically), pleasantries (sure/certainly), hedging.
Fragments OK. Short synonyms. Pattern: `[thing] [action] [reason]. [next step].`

Full prose for: security warnings, irreversible action confirmations,
ambiguous multi-step sequences, user confusion.

Commits: conventional format, ≤50 char subject, imperative mood, why over what.

## What's NOT loaded in this mode

- Lucent identity files (`lucentIdent.md`, `userIdent.md`)
- Long-term memory (`LTMemory.md`)
- Active reminders
- Priority email alerts
- Daily note tail (read it directly with `tail -n 20 /home/nick/dev/lucent/memory/$(date +%Y-%m-%d).md` if needed)

If you need any of the above, switch back: `cd /home/nick/dev/lucent && claude`.
