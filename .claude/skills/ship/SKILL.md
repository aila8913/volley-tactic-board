---
name: ship
description: >
  Use when the user wants to commit their work and send a pull request — trigger
  phrases include "ship", "送 PR", "發 PR", "commit 然後 PR", "幫我送出去", or any
  request to publish/submit the current changes. Guides through the full flow:
  branch → commit → self-review → push → PR → merge, with an explanation at every
  step (this is a learning project, teaching mode is on).
---

# Ship: branch → commit → self-review → push → PR → merge

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
`git pull`/Step 7's fast-forward fails. Branching _before_ the commit means the commit
only ever exists on the feature branch — `main` never moves locally until the plain
`git pull` in Step 7, so there's nothing to diverge.

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

## Step 4 — Self-review the diff（code smells 快掃）

在推上 GitHub 之前，先自己當第一個 reviewer：`git diff main...HEAD` 看這次要送出去的
完整 diff（三個點代表「從分支點以來的變化」，不會把 main 上別人的新 commit 混進來）。

用 Martin Fowler《Refactoring》定義的 **code smells** 當檢查詞彙——這些是業界共通的
命名，用術語描述問題比模糊地說「這裡怪怪的」更精準，也更容易查到對應的修法。掃過
最常見的幾種：

- **Mysterious Name（神秘命名）** — 名字看不出用途或單位 → 改名。
- **Duplicated Code（重複程式碼）** — 同一段邏輯出現兩次以上 → 抽出共用。
- **Feature Envy（特徵依戀）** — 函式整段都在操作另一個模組的資料 → 把函式搬過去。
- **Primitive Obsession（基本型別偏執）** — 用裸 string/number 硬扛領域概念
  （例如輪次、比分）→ 建型別。
- **Speculative Generality（過度預留）** — 為「以後可能用到」而加、目前沒人用的
  抽象 → 刪掉，等真的需要再加。

處理原則：**只修小而確定的問題**（改名、刪死碼、抽重複），修完回 Step 3 再 commit
一次；發現需要大重構的，開一張 issue 記下來，不要塞進同一個 PR——PR 越小越好審。
想要更完整的自動審查，可以跑內建的 `/code-review`。

Explain: 「這一步等於把 code review 的第一輪從 GitHub 上搬到本地——reviewer（或未來
的自己）看到的 diff 會更乾淨，來回修改的次數也會變少。」

> 出處：smell 清單取自 Martin Fowler,《Refactoring: Improving the Design of
> Existing Code》(2nd ed., 2018)；「用經典術語召喚模型內建知識」與「重構屬於
> review 階段、不屬於實作迴圈」的做法取自
> [mattpocock/skills](https://github.com/mattpocock/skills) 的
> `skills/engineering/code-review` 與 `skills/engineering/tdd`（v1.1）。

---

## Step 5 — Push (needs confirmation)

Tell the user what you're about to run and **wait for explicit confirmation** before
executing.

Explain: "git push -u origin <branch> 把本地的分支上傳到 GitHub 遠端。`-u` 是
--set-upstream 的縮寫，代表以後在這個分支上只需要打 git push 就好，不用再指定
遠端名稱。"

Command: `git push -u origin <branch-name>`

If the push fails (no remote, auth error, etc.), diagnose and explain the error before
retrying — don't just re-run blindly.

---

## Step 6 — Create PR

Use `gh pr create` to open the PR. Draft the title and body first, show them to the
user, and ask for any edits before submitting.

The PR body structure lives in `.github/PULL_REQUEST_TEMPLATE.md` — follow it
(Summary bullets + Test plan checklist), and end the body with
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Explain: "gh pr create 透過 GitHub CLI 直接開 Pull Request。PR 是讓程式碼在合併進
main 之前被看過、討論的機會，也留下修改記錄。"

### 提到 issue 編號時：用正面描述

**要關**：`Closes #118`。**要留著**：寫「**#118 保持 open**」。

**絕對不要寫「不 close #118」「故不 close #118」**——GitHub 的關鍵字偵測是笨的子字串比對
（`close|closes|fix|fixes|resolve|resolves` 後面接 `#數字`），**不解析任何語言的否定詞**。
只要那個字串出現在 body 裡，merge 時照樣關。這個坑已經踩過兩次（#58；以及 PR #124 寫了
「故不 close #118」仍關掉 #118，害沒做完的前端半段從 backlog 消失了一天）。

送出前**用 grep 掃一遍 body，別只靠肉眼**——「記得要小心」擋不住這個坑（寫下這條規則的
那個 PR，body 裡就自己違反了一次）：

```sh
gh pr view <PR> --json body --jq '.body' \
  | grep -inE '(close|closes|fix|fixes|resolve|resolves)[[:space:]]*#[0-9]+'
```

有命中就逐一確認：該關的留著，該留的改寫成「#數字 保持 open」。squash merge 會把 body
拉進 commit message，所以 commit message 適用同一條規則。

**注意舉例用的字面字串也會觸發**——GitHub 不掃檔案內容，所以範例寫在這份 skill 裡是安全的；
但同一串字貼進 PR body 就會真的關掉那張 issue。要在 PR body 裡講這個坑，用描述的
（「關鍵字後面用逗號串接多個編號時只關第一張」），不要重貼字面範例。

> **通則：以後盡量用正面描述**，不要靠否定詞去反轉一個句子的意思。理由不只 GitHub 會
> 誤判——否定句對人類讀者也比較容易看漏（漏掉一個「不」字，意思就完全相反），而正面描述
> 直接講出「實際成立的狀態是什麼」。同理：與其寫「這個 PR 沒有動到 schema」，不如寫
> 「這個 PR 只動前端」；與其寫「測試沒跑」，不如寫「測試待補：<哪些>」。

**兄弟坑——逗號列表不會全關**：`Closes #35, #45, #37` 只關第一個（#35），後面的只是引用。
要關多張就每張都重複關鍵字：`Closes #35, closes #45, closes #37`。多張 issue 的 PR merge
後，逐張 `gh issue view <n> --json state` 確認，別假設 body 有生效。

Command:

```
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Print the returned PR URL so the user can click through to GitHub.

---

## Step 7 — Merge (needs confirmation)

**Do not merge automatically.** First confirm with the user that they're ready to merge.

Before merging:

1. Wait for CI to go green: `gh pr checks <PR-number> --watch`. The CI workflow
   (`.github/workflows/ci.yml`) runs `pnpm run typecheck` + `pnpm run test` on every
   PR — don't re-run them locally, that's what CI is for.
2. Tell the user: "CI 綠燈代表型別和現有測試都過了，但功能正不正確還是要自己測過。"

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
