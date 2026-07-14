# Roadmap sync — 固定 ID 與指令對照表

`SKILL.md` Step 5 的操作參考。這裡只放「查一次、以後直接抄」的固定資料；原則與判斷
邏輯留在 `SKILL.md`。這個拆法是 skill 設計的 **progressive disclosure（漸進揭露）**：
主檔案保持短、每次都讀；細節查表放這裡，需要動手改 roadmap 時才載入。
（原則出處：[mattpocock/skills](https://github.com/mattpocock/skills) 的
`skills/productivity/writing-great-skills`。）

## Milestones（階段，時間序）

M1 簡易版收尾 → M2 數據分析價值 → M3 部署給真人試用 → M4 進階版差異化 →
M5 體驗重整與雜項

- 指派 milestone：`gh issue edit <n> --milestone "M1 簡易版收尾"`
- Soft due dates（估自實際 velocity，2026-07-11 起算）：M1=7/18 → M5=9/11。
  這些日期餵 Roadmap view 的 timeline 用，不是 deadline。
- 調整 due date（PO 確認後才做）：
  `gh api -X PATCH repos/aila8913/volley-tactic-board/milestones/<n> -f due_on="YYYY-MM-DDT00:00:00Z"`

## GitHub Project「Volley Tactics Board」（當下狀態）

https://github.com/users/aila8913/projects/4

穩定 CLI id（記錄在此，未來 session 不用重新查）：

| 項目            | 值                               |
| --------------- | -------------------------------- |
| project number  | `4`                              |
| owner           | `aila8913`                       |
| project id      | `PVT_kwHOBD0rps4BdEuf`           |
| Status field id | `PVTSSF_lAHOBD0rps4BdEufzhXo8Gs` |
| Backlog         | `3c3a173d`                       |
| Todo            | `f077b203`                       |
| In Progress     | `51faacd6`                       |
| Blocked         | `31ceab16`                       |
| Done            | `5095b43f`                       |

改一張卡片的狀態：

```
gh project item-edit --id <item-id> --project-id <project-id> \
  --field-id <field-id> --single-select-option-id <option-id>
```

其中 `<item-id>` 來自：

```
gh project item-list 4 --owner aila8913 --format json \
  --jq '.items[] | select(.content.number==<n>).id'
```
