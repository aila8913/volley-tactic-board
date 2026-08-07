# Roadmap sync — 固定 ID 與指令對照表

`SKILL.md` Step 5 的操作參考。這裡只放「查一次、以後直接抄」的固定資料；原則與判斷
邏輯留在 `SKILL.md`。這個拆法是 skill 設計的 **progressive disclosure（漸進揭露）**：
主檔案保持短、每次都讀；細節查表放這裡，需要動手改 roadmap 時才載入。
（原則出處：[mattpocock/skills](https://github.com/mattpocock/skills) 的
`skills/productivity/writing-great-skills`。）

## Milestones（階段，時間序）

M1 簡易版收尾 → M 1.5 up 大改版 → M2 數據分析價值 → M2.5 架構深化：收斂重複規則 →
M3 部署給真人試用 → M3.5 架構深化：可測性與資料流 → M4 進階版差異化 →
**M5 自由球員與計分正確性 → M6 介面精簡與導覽重構 → M7 打磨與雜項**

目前仍 open 的是 M3.5、M4、M5、M6、M7；M1～M3 已全數關閉。

- 指派 milestone：`gh issue edit <n> --milestone "M5 自由球員與計分正確性"`
  （**要打完整名稱，不能只打 "M5"**）
- Soft due dates（估自實際 velocity，2026-07-11 起算）：M1=7/18 → M5=9/11 →
  M6=9/25 → M7=10/9。這些日期餵 Roadmap view 的 timeline 用，不是 deadline。
- milestone number（`gh api` 用，跟顯示名稱不同）：M3.5=8、M4=4、M5=5、M6=9、M7=10。

### 2026-08-07：原 M5「體驗重整與雜項」拆成三包

拆的原因值得記住，因為這是個會復發的病：**名字裡有「雜項」的 milestone 會變成垃圾桶**。
原 M5 三週內吃掉 31 張 open issue 裡的 23 張（74%），裡面同時有一行 CSS bug（#324）、
文件漏字（#323）、和要開設計會議的方向題（#209）——這些東西「什麼時候該做」完全不同，
混在一張清單裡就無法排序，打開只覺得一片混亂。M1～M3.5 之所以運作良好，是因為每個都是
**一個價值假設 ＋ 少量票 ＋ 做完就關**。

拆完後的收件標準（寫在各 milestone 的 description 裡，開票時照著分）：

| milestone               | 收什麼                                                   |
| ----------------------- | -------------------------------------------------------- |
| M5 自由球員與計分正確性 | 「記出來的數據會不會錯」——領域規則與資料正確性           |
| M6 介面精簡與導覽重構   | 源自 #209 盤點，票之間互相牽動、宜一起想的設計方向題     |
| M7 打磨與雜項           | **只收獨立、小、隨時可插隊的**；會牽動其他票的不要放這裡 |

M7 那句「會牽動其他票的不要放」是防止它變成下一個垃圾桶的唯一防線——開票時如果一張票
不符合那句話，它就不該進 M7。

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
