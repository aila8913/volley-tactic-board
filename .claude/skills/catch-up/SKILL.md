---
name: catch-up
description: >
  Use at the start of a new session on this project, or whenever the user wants a
  refresher on where things stand — trigger phrases include "接續上次", "我們上次做到
  哪", "回顧進度", "catch me up", "catch up", "what's the status", or the user starting a
  new conversation and immediately asking to continue previous work. Reads
  docs/PROGRESS.md, open GitHub issues, and recent git history instead of re-exploring
  the whole codebase with a fresh agent.
---

# Catch up at the start of a session

Goal: reconstruct "where things stand" cheaply, using the artifacts a previous
`wrap-up` run (or normal commits) already left behind, instead of spawning an Explore
agent to rebuild a mental model of the codebase from scratch every time.

## Steps

1. **Read `docs/PROGRESS.md`** — the "Current state" and "Known gaps" sections are the
   starting snapshot.
2. **Check the backlog — it is time-ordered, not flat.** `gh issue list --state open
--limit 100` for the full list, but the roadmap structure answers "what's next"
   directly: **Milestones M1–M5** are the phases (current phase = the lowest-numbered
   milestone that still has open issues; scope with
   `gh issue list --milestone "M1 簡易版收尾"`), and the GitHub Project board
   (https://github.com/users/aila8913/projects/4) holds 當下狀態 — its **Todo column
   is the agreed next-up list**, so don't re-ask the user "接下來做什麼" when Todo
   already says so.
3. **Check actual recent history:** `git log --oneline -10` and `git status --short`.
   This is ground truth — trust it over the doc if they disagree.
4. **Cross-check for drift** before presenting anything as fact:
   - Does PROGRESS.md mention an issue number that's already closed? Or describe
     something as "in progress" when recent commits look like they finished it?
   - Is there an open issue that recent commits appear to have resolved (but wasn't
     closed via a `wrap-up` run)?
   - Are there uncommitted changes that PROGRESS.md doesn't know about (i.e. work was
     interrupted mid-session last time, no `wrap-up` ran)?
     If you find a mismatch, surface it explicitly to the user rather than silently
     trusting whichever source is more convenient — the docs are a snapshot, not
     guaranteed current.
5. **Summarize briefly** for the user: last commit, current state per the doc, open
   issues (esp. anything that looks like a natural next step), and any drift found in
   step 4. A few sentences / a short list — not a full re-explanation of the
   architecture.

## When to fall back to deeper exploration

Only spawn an Explore agent or do a full codebase read if:

- `docs/PROGRESS.md` doesn't exist yet or is clearly stale/empty, **or**
- The user is asking about a part of the system the snapshot doesn't cover, **or**
- The user explicitly asks for a fresh deep-dive.

Don't default to full re-exploration just because it feels thorough — that's the exact
cost this skill exists to avoid.
