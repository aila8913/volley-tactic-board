# Roadmap sync — 固定 ID 與指令對照表

`SKILL.md` Step 5 的操作參考。這裡只放「查一次、以後直接抄」的固定資料；原則與判斷
邏輯留在 `SKILL.md`。這個拆法是 skill 設計的 **progressive disclosure（漸進揭露）**：
主檔案保持短、每次都讀；細節查表放這裡，需要動手改 roadmap 時才載入。
（原則出處：[mattpocock/skills](https://github.com/mattpocock/skills) 的
`skills/productivity/writing-great-skills`。）

## Milestones（階段，時間序）

階段的**順序**是固定的、可以寫在這裡：

M1 簡易版收尾 → M1.5 UI 大改版 → M2 數據分析價值 → M2.5 架構深化：收斂重複規則 →
M3 部署給真人試用 → M3.5 架構深化：可測性與資料流 → M4 進階版差異化 →
M5 自由球員與計分正確性 → M6 介面精簡與導覽重構 → M7 打磨與雜項

⚠️ **但「現在開著哪些／當前階段是哪個」是推導值，這份文件刻意不記**——記了就是一個一定會
過期的常數，而且過期時會誤導（這一段以前寫「目前仍 open 的是 M3.5、M4…」，M3.5 一關就錯了；
`catch-up/SKILL.md` 拿已關閉的 M1 當範例更是一直沒人發現）。同理，milestone 的**數字 id**
也不抄——新增一個階段就會多一個，抄下來的表遲早對不上。全部現查：

```sh
# 開著的階段、各自還有幾張、以及 gh api 用的數字 id（預設按 due_on 遞增＝階段順序）
gh api repos/:owner/:repo/milestones --jq '.[] | "\(.number)\t\(.title)\topen=\(.open_issues)"'

# 當前階段（編號最小、還有 open issue 的那個）
gh api repos/:owner/:repo/milestones --jq 'map(select(.open_issues>0)) | .[0].title'
```

- 指派 milestone：`gh issue edit <n> --milestone "<完整名稱>"`
  （**要打完整名稱，不能只打 "M5"**；名稱從上面那句查，別憑記憶打）
- 關閉一個做完的階段（`gh` 沒有 milestone 子命令，只能走 REST）：
  `gh api -X PATCH repos/:owner/:repo/milestones/<number> -f state=closed`
- Soft due dates 由 milestone 自己帶著（上面那句加 `.due_on` 就看得到），估自實際 velocity、
  2026-07-11 起算。這些日期餵 Roadmap view 的 timeline 用，**不是 deadline**；實際明顯漂掉時
  提案調整、由 PO 確認。

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
