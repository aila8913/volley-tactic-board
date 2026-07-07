---
name: ship
description: >
  Use when the user wants to commit their work and send a pull request — trigger
  phrases include "ship", "送 PR", "發 PR", "commit 然後 PR", "幫我送出去", or any
  request to publish/submit the current changes. Guides through the full flow:
  branch → commit → push → PR → merge, with an explanation at every step (this is
  a learning project, teaching mode is on).
---

# Ship: branch → commit → push → PR → merge

Goal: walk through the complete "finish a feature and ship it" flow, explaining each
git/gh command so the user understands what it does and why, not just that it ran.

**Teaching mode is always on for this skill** — every command gets a one-sentence
"what this does" explanation before running it. Dangerous or irreversible steps (push,
merge) must have explicit user confirmation.

---

## Step 1 — Check current state

Run `git status` and `git log --oneline -5` before doing anything else.

- Explain: "git status shows which files have been changed or staged. git log shows the
  recent commit history so we know where we're starting from."
- Surface to the user: any uncommitted changes, untracked files, which branch we're on.

---

## Step 2 — Branch (before committing!)

Check which branch we're on (`git branch --show-current`).

- **If already on a feature branch** (not `main`/`master`): skip this step, note it.
- **If on `main`/`master`**: create and switch to a new branch **before** making any
  commit — see "Why branch before commit" below for what goes wrong if you don't.
  - Suggest a branch name based on the change (e.g. `feature/libero-fix`,
    `fix/routing-bug`). Ask the user to confirm the name.
  - Explain: "git checkout -b <name> 會從現在的 commit 開出一條新的分支，讓 main
    保持乾淨。直接在 main 上改東西再 push 是危險的，因為 main 通常是大家共用的基準。"
  - Command: `git checkout -b <branch-name>`

### Why branch before commit

If you commit while still on `main` and only branch afterward, the new branch and
`main` end up pointing at the _same_ commit. When the PR is later squash-merged on
GitHub, GitHub always creates a **brand-new commit object** on `origin/main` (even if
the content is identical to what's already in the branch). Local `main` then still has
its own separate copy of that same change, so local `main` and `origin/main` each have
"one commit the other doesn't have" — `git status` reports them as diverged, and
`git pull`/Step 6's fast-forward fails. Branching _before_ the commit means the commit
only ever exists on the feature branch — `main` never moves locally until the plain
`git pull` in Step 6, so there's nothing to diverge.

---

## Step 3 — Stage and commit

If there are unstaged changes the user wants to include, ask which files to stage rather
than blindly running `git add .` (which could accidentally include `.env` or large
binaries).

Commit message rules for this repo:

- **Title**: concise, in **Traditional Chinese** (繁體中文), starts with a verb
  (實作、修正、新增、重構…).
- **Trailer** (required): `Co-Authored-By: Claude <目前的模型名> <noreply@anthropic.com>`
  — 用實際跑這個 session 的模型（例如 `Claude Fable 5`），不要寫死版本號，
  不然模型換代後這行就過時了。

Before committing, show the proposed message and ask the user to confirm or edit it.

Explain: "git commit 會把 staged 的檔案打包成一個版本節點，附上訊息說明做了什麼。
訊息清楚的話，未來回頭看 git log 就像讀日誌一樣。這個 commit 現在是落在剛剛開的分支上，
不是 main，所以合併後 main 不會分歧。"

Use a heredoc so multi-line messages are passed correctly:

```
git commit -m "$(cat <<'EOF'
<message title>

Co-Authored-By: Claude <目前的模型名> <noreply@anthropic.com>
EOF
)"
```

---

## Step 4 — Push (needs confirmation)

Tell the user what you're about to run and **wait for explicit confirmation** before
executing.

Explain: "git push -u origin <branch> 把本地的分支上傳到 GitHub 遠端。`-u` 是
--set-upstream 的縮寫，代表以後在這個分支上只需要打 git push 就好，不用再指定
遠端名稱。"

Command: `git push -u origin <branch-name>`

If the push fails (no remote, auth error, etc.), diagnose and explain the error before
retrying — don't just re-run blindly.

---

## Step 5 — Create PR

Use `gh pr create` to open the PR. Draft the title and body first, show them to the
user, and ask for any edits before submitting.

PR body template:

```
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] <what to manually verify>
- [ ] typecheck passes (`pnpm run typecheck`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Explain: "gh pr create 透過 GitHub CLI 直接開 Pull Request。PR 是讓程式碼在合併進
main 之前被看過、討論的機會，也留下修改記錄。"

Command:

```
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Print the returned PR URL so the user can click through to GitHub.

---

## Step 6 — Merge (needs confirmation)

**Do not merge automatically.** First confirm with the user that they're ready to merge.

Before merging:

1. Run `pnpm run typecheck` (the only automated check in this repo) and show the result.
2. Tell the user: "typecheck 通過才代表型別沒有問題，但功能正不正確還是要自己測過。"

If the user confirms, proceed:

- Explain: "gh pr merge --squash 會把這個 PR 裡的所有 commit 壓成一個再合併進 main，
  讓 git log 保持整潔。--delete-branch 會順手刪掉已經合併的遠端分支。"
- Command: `gh pr merge <PR-number> --squash --delete-branch`
- After merging, switch back to main and pull:
  ```
  git checkout main
  git pull
  ```
  Explain: "合併後要切回 main 並 git pull，讓本地的 main 跟上遠端最新狀態。"

---

## After shipping

Suggest running `/wrap-up` to update `docs/PROGRESS.md` and close any related GitHub
issues, since the merge just completed a piece of work.
