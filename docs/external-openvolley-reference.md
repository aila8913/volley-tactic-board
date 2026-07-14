# 外部參考：openvolley 生態系全景

> 這份文件盤點 [openvolley](https://github.com/openvolley) 這個開源排球分析組織底下的所有 repo，
> 逐一註解「它在做什麼」與「對我們（Volley-Tactics-Board）的參考價值」。目的是規劃記錄／分析功能
> （尤其 [issue #65 數據分析頁](https://github.com/aila8913/volley-tactic-board/issues/65)、
> [#21 球線軌跡](https://github.com/aila8913/volley-tactic-board/issues/21)、
> [#51 動作子分類](https://github.com/aila8913/volley-tactic-board/issues/51)）時，有一份「業界標準
> 全都要」的對照清單，好決定我們**該抄哪幾層、哪些是陷阱**。
>
> 血統：openvolley 是 R/Python 生態，資料標準是 **DataVolley (.dvw) / VolleyStation (.vsm)**，
> 也就是職業隊 scouting 軟體那條線。相關內部文件：
> [event-grammar-spec.md](./event-grammar-spec.md)、[db-schema-spec.md](./db-schema-spec.md)。
>
> **狀態（2026-07-13）：純參考盤點，非落地計畫。** 我們是「一個 PWA 產品」，它是「一堆給專家的
> 獨立函式庫」——切法本就相反（見下方「為什麼那麼多 repo」）。

## 一句話總覽：四層管線

openvolley 全部功能其實是一條資料管線的四段：

```
影片 ──[① ML 電腦視覺]──▶ 座標資料 ──[② 讀檔/解析]──▶ 逐球事件表 ──[③ 統計/分析]──▶ 洞見 ──[④ 報表/視覺化/影片]──▶ 給人看
        (ovml 系)                      (datavolley 系)              (ovlytics 系)          (volleyreport/ovideo 系)
```

大多數團隊（含我們的 TA）是**跳過①**，用人工 scouting 直接產出②的事件資料。ML 那層是要把①也自動化。

---

## ② 讀檔／解析（資料地基）—— 對照我們的 event schema

| Repo                             | 語言   | 做什麼                                                                                      | 對我們                                                                                                                                       |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `datavolley`                     | R      | 讀 DataVolley `.dvw` / VolleyStation `.vsm`，解析成逐球事件表。**stable、是整個生態的地基** | ⭐ 欄位 schema 是我們 rally/event 的外部對照（skill/skill_type/subtype、start/mid/end 座標三點、point_phase/attack_phase）。見 #21、#51 留言 |
| `pydatavolley` / `py-datavolley` | Python | 同上的 Python 版（`py-datavolley` 另支援 VolleyStation）                                    | ⭐ 熱圖教學站就是用它：https://pydatavolley.openvolley.org                                                                                   |
| `peranavolley`                   | R      | 讀 Perana Sports VBStats 格式                                                               | 另一家 scouting 軟體，參考價值低                                                                                                             |
| `peranapi`                       | R      | 接 Perana VBStats 資料 API                                                                  | 同上                                                                                                                                         |
| `volleyxml`                      | R      | 讀 XML 格式 scout 檔                                                                        | 格式相容用，略                                                                                                                               |
| `vscoututils`                    | R      | scout 檔的工具函式                                                                          | 內部支援套件                                                                                                                                 |
| `auvolley`                       | R      | Athletes Unlimited 計分制                                                                   | 特殊賽制，略                                                                                                                                 |

**啟示**：不必自創分類法，挑 DataVolley 欄位中對系隊有意義的子集落地即可（基礎版先 skill_type +
evaluation + phase）。座標用三點 start/mid/end 表達弧線，回答了 #21「直線 vs 曲線」。

## ③ 統計／分析 —— 對照我們的 #65 分析頁

| Repo                        | 做什麼                                                                                                | 對我們                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `ovlytics`                  | 排球分析函式集：資料增補 + 特定分析法（如 setter choice 分析、expected sideout/breakpoint rate 建模） | ⭐ 進階統計的「全都要」清單，挑著抄 |
| `volley-analytics-snippets` | 分析範例合集（https://snippets.openvolley.org）                                                       | ⭐ 具體怎麼算的 code 範例           |
| `volleysim`                 | R 套件，**模擬整場比賽**                                                                              | 研究/職業級，我們不跟               |
| `fivbvis` / `pyfivbvis`     | 接 **FIVB VIS** 官方數據 web service                                                                  | 國際賽官方數據源，遠期若要對接可看  |

**openvolley 統計功能全景（由淺到深）：**

1. **各技術基礎統計**（每球員/隊/局）：攻擊效率(kill−err−blocked/總數)、kill%、接發到位率/完美率、
   發球 ace/err、攔網、舉球分配、防守。→ 我們的**基礎版**該有。
2. **依情境切分**：Sideout(接發輪) vs Breakpoint(發球輪)、一攻 vs 反擊(transition)、依輪轉/setter
   位置拆。→ 殺手級維度（「哪一輪、哪個情境在漏分」），值得抄。
3. **空間視覺化統計**：落點 heatmap、cone plot(攻擊球線扇形)、zone/subzone 落點、線段軌跡。
   → 我們 canvas/SVG 的主場，對應 memory「wow=球線分布」。
4. **進階建模**：expected sideout/breakpoint rate、setter choice、整場模擬。→ **陷阱，別跟**（對系隊
   TA 過重）。

## ① 機器學習（電腦視覺）—— 對照「video-tracking is far-future」

**這一層跟統計無關**，是要把「看影片手動記」自動化成「影片 → 自動吐座標」。技術重（YOLO 物件偵測、
torch/GPU、要自己標訓練資料），對系隊 TA 完全過重。

| Repo                           | 做什麼                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `ovml` (R) / `ovmlpy` (Python) | **YOLO 物件偵測**：從影片畫格認出球員與球的像素位置；含實驗性的「排球專用」偵測網路。`ovmlpy` 較快 |
| `ovcourt`                      | **自動偵測球場**：從畫面認出場地線，作為座標校正基準                                               |
| `opensportml`                  | 把偵測 + **像素座標→真實球場座標**的透視變換串起來（標 4 角點）；泛用運動版                        |
| `ovml.common`                  | ovml 的內部支援套件（不直接用）                                                                    |
| `ovml-training`                | YOLO 訓練用的 bounding box 標註工具（Yolo_mark 改的）                                              |

**一句話**：ML = 「把影片變成座標資料」的自動化上游。串起來就是「丟一支比賽影片 → 自動產出攻擊落點
熱圖」。這就是 memory 裡 `video-tracking is far-future` 指的東西，看看就好。

## ④ 報表／視覺化／影片

| Repo                   | 做什麼                                                               | 對我們                                            |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `volleyreport`         | 從 match 檔產生排球比賽報表（含沙灘排球）、可出 PDF                  | 報表版面參考                                      |
| `ovpaged`              | 排球報表的 pagedown(HTML→PDF) 模板                                   | 報表排版                                          |
| `ovscout` / `ovscout2` | R Shiny app：**scouting**（編輯 .dvw、同步影片）——即「記錄」工具本身 | ⭐ 我們計分表的功能對照物（他們怎麼設計記錄互動） |
| `ovva`                 | R Shiny app：影片分析                                                | 影片分析 UX 參考                                  |
| `ovideo` / `ovplayer`  | 依 scout 資料自動剪影片 playlist、輸出可分享 HTML 播放器             | 影片回放，遠期                                    |

## 其他（非功能性）

| Repo                                                 | 做什麼                |
| ---------------------------------------------------- | --------------------- |
| `community`                                          | 社群資源              |
| `openvolley.github.io` / `openvolley.r-universe.dev` | 官網 / 套件發佈設定   |
| `ovdata`                                             | 範例資料集            |
| `R_workshop_2022`                                    | 2022 分析師工作坊教材 |
| `file_sender` (Rust)                                 | 檔案傳輸小工具        |

---

## 為什麼一個組織開那麼多 repo？（正常）

R/Python 生態的**函式庫**文化：一個套件做一件事、各自能被單獨安裝（CRAN/PyPI 一個發佈單位＝一個
repo）、相依隔離（想讀檔的人不必被迫裝 ML/影片的重相依）。這跟我們是**單一產品的 pnpm monorepo**
（一起開發、一起部署）是相反但同樣合理的選擇——不是誰對誰錯，是「賣很多獨立工具」vs「做一個產品」
的差別。

## 我們該抄哪層（結論）

第 ②（事件 schema 對照）＋ ③ 的第 1、2 類（基礎統計 + sideout/反擊/輪轉切分）＋ 3 類（球線分布
視覺化）就足以打贏「Excel 慢放算數據」的現況，且門檻低。①ML 與 ③第 4 類建模是陷阱，對系隊 TA 過重，
不跟。
