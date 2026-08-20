import { useState } from "react";
import PlayerMarker from "./PlayerMarker";
import type { MatchPlayer } from "../types/match";
import type { LineupZones } from "../types/scoresheet";
import {
  COURT_LINE_COLOR,
  COURT_BORDER_OPACITY,
  COURT_BORDER_WIDTH,
  COURT_ATTACK_LINE_OPACITY,
  COURT_NET_COLOR,
} from "../lib/courtTheme";

// 「輪轉對照」——issue #420（header ＋ 佈陣右欄 v3）新增：取代舊版 RotationRailPanel 裡的
// 3×2 表格。理由是教練讀號位是**空間性的**（4/3/2 靠網、5/6/1 在後場），用表格畫它等於把
// 一張圖硬轉成資料列；改畫成一座迷你球場，方位跟中央大球場一致（上緣是網），眼睛在兩者之間
// 移動不用重新定位。
//
// 這是全新的元件，不是 RotationRailPanel 的變體：它不接管拖曳／點選賦值那一整套（ADR-0001
// 訂死戰術板不能從右欄改先發，這裡的六格因此**天生就是唯讀的**，不需要材質規則裡「內凹無
// 邊框」那條特別處理——它本來就是一張圖，沒有人會想去點一張圖改先發）。只有 mode D（佈陣中）
// 的新右欄用它，mode C 的球員名單浮層仍走原本的 RotationRailPanel（見 TacticsEditToolRail
// 開頭的說明），沒有被這次改版動到。
//
// 線條顏色／透明度直接讀 lib/courtTheme.ts——迷你球場跟中央大球場「共用同一組線」是 spec
// 明講的要求，不能自己另外訂一套數字，不然兩邊之後各自調整就會漂移。
//
// 六宮格排法（GRID_ZONES）跟 RotationRailPanel.tsx 是同一份規格（docs/layout-spec.md
// §4.1）：上排 4 3 2、下排 5 6 1，「編號位置不可自行調整順序」——這裡沒有從那個檔案匯入，
// 是因為那個常數目前是模組內部值、沒有匯出，兩邊各自維護同一個字面陣列，比為了一個常數
// 讓這個新元件去 import 一整支耦合了拖曳邏輯的舊元件划算。
const GRID_ZONES = [4, 3, 2, 5, 6, 1] as const;

interface MiniCourtRotationProps {
  lineup: LineupZones | null;
  roster: MatchPlayer[];
  rotation: number;
  onStep: (delta: -1 | 1) => void;
  liberoId: string | null;
}

export default function MiniCourtRotation({
  lineup,
  roster,
  rotation,
  onStep,
  liberoId,
}: MiniCourtRotationProps) {
  // 收合是預設狀態（spec §3.2）：這是三個狀態裡最常出現的一個——收合時輪次巨字與迷你球場
  // 一起收，名單因此吃到整條欄。純畫面偏好，不進 store（跟 TacticsBoardRail.tsx 的分頁
  // 狀態是同一種考量：只有這個元件自己在乎）。
  const [expanded, setExpanded] = useState(false);
  const libero = liberoId ? roster.find((p) => p.id === liberoId) : undefined;

  return (
    <div className="border-y border-white/[0.09]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-testid="button-toggle-mini-court"
        className="flex h-[38px] w-full items-center gap-1.5 text-left transition hover:text-[#f5f5f0]"
      >
        <span
          aria-hidden
          className={`w-3 shrink-0 text-micro transition-transform ${
            expanded ? "rotate-90 text-[#c6f135]" : "text-[#a9b096]/70"
          }`}
        >
          ▸
        </span>
        <span
          className={`shrink-0 font-label text-micro uppercase tracking-[0.18em] ${
            expanded ? "text-[#c6f135]" : "text-[#a9b096]/65"
          }`}
        >
          輪轉對照
        </span>
        {/* 摘要「ROT 3」是收合時唯一的線索，證明這一列後面有內容、不只是一個標題——
          沒有它，收合列跟純粹的區塊標題長得一模一樣，沒有人會想點。 */}
        {!expanded && (
          <span className="ml-auto flex items-baseline gap-[5px]">
            <span className="font-label text-micro tracking-[0.14em] text-[#a9b096]/55">ROT</span>
            <span className="font-score text-panel-title leading-none">{rotation + 1}</span>
          </span>
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 pb-4">
          {/* (a) 輪次巨字 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onStep(-1)}
              data-testid="button-mini-court-prev"
              aria-label="上一輪"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-white/[0.055] text-caption text-[#a9b096] transition hover:text-[#f5f5f0]"
            >
              ◂
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-px">
              <span className="font-score text-hero leading-[0.9]">{rotation + 1}</span>
              <span className="font-label text-micro tracking-[0.2em] text-[#a9b096]/60">
                ROTATION
              </span>
            </div>
            <button
              type="button"
              onClick={() => onStep(1)}
              data-testid="button-mini-court-next"
              aria-label="下一輪"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-white/[0.055] text-caption text-[#a9b096] transition hover:text-[#f5f5f0]"
            >
              ▸
            </button>
          </div>

          {/* (b) 迷你球場：方位跟中央大球場一致（上緣是網），攻擊線畫在前後排的真實分界
            （50%，因為這裡只有前後兩排、沒有第三種格子會讓 50% 偏掉——跟大球場的
            33.3%/66.7% 不是同一個換算，那是三分之一節制的攻擊線位置，這裡只有兩排。） */}
          <div
            className="relative p-2"
            style={{
              // COURT_LINE_COLOR（#F5F5F0）寫死成 rgba 而不是拿十六進位算透明度：courtTheme.ts
              // 只匯出色碼跟一個 0~1 的不透明度數字，兩個沒有共同單位，湊出 8 碼 hex 只是
              // 繞遠路，這裡就是那個色碼本身的 rgb 分量。
              border: `${COURT_BORDER_WIDTH}px solid rgba(245,245,240,${COURT_BORDER_OPACITY})`,
              background: "linear-gradient(180deg, rgba(27,110,98,.16), rgba(27,110,98,.04))",
            }}
          >
            <div
              aria-hidden
              className="absolute -left-1.5 -right-1.5 top-0 h-[5px] -translate-y-[3px]"
              style={{
                background:
                  "repeating-linear-gradient(90deg, rgba(245,245,240,.45) 0 .6px, transparent .6px 3px)",
                borderTop: `1.5px solid ${COURT_NET_COLOR}`,
              }}
            />
            <div className="relative grid grid-cols-3 gap-0.5">
              <div
                aria-hidden
                className="absolute -left-2 -right-2 top-1/2 h-px"
                style={{
                  background: COURT_LINE_COLOR,
                  opacity: COURT_ATTACK_LINE_OPACITY,
                }}
              />
              {GRID_ZONES.map((zone) => {
                const playerId = lineup?.[zone];
                const player = playerId ? roster.find((p) => p.id === playerId) : undefined;
                return (
                  <div
                    key={zone}
                    className="relative flex h-[60px] flex-col items-center justify-center gap-1"
                  >
                    {/* 號位數字（1–6）不顯示——跟 RotationRailPanel.tsx 的六宮格同一個決定
                      （使用者原話：「數字資訊不重要」），這裡是同一份設計的另一個呼叫端，
                      沒有理由自己另外留一份數字。GRID_ZONES 陣列順序仍然鎖死，只是不渲染。 */}
                    <svg width="26" height="26" viewBox="0 0 26 26">
                      <g transform="translate(13,13)">
                        {player ? (
                          <PlayerMarker
                            number={player.number}
                            name=""
                            radius={11}
                            color={player.role === "OPP" ? "#F5A623" : "#f5f5f0"}
                          />
                        ) : (
                          <circle
                            r="11"
                            fill="rgba(10,11,7,.55)"
                            stroke="rgba(245,245,240,.2)"
                            strokeWidth="1"
                          />
                        )}
                      </g>
                    </svg>
                    <span className="max-w-full truncate text-micro text-[#f5f5f0]/75">
                      {player?.name ?? ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* (c) 自由球員列——刻意畫在球場框「外」：畫在框內等於場上站了七個人，L 不佔
            輪轉序（見 lib/rotationLogic.ts 的 BACK_ROW_ZONES 說明）。#425 之後賽前不記
            「頂替誰」，這裡只誠實顯示「這場的先發 L 是誰」，不再猜他頂替哪一位
            （對照 RotationTable.tsx 的 RotationPanel 同一輪改動）。 */}
          {libero && (
            <div className="flex items-center gap-[7px] pl-0.5">
              <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0">
                <g transform="translate(13,13)">
                  <PlayerMarker
                    number={libero.number}
                    name=""
                    radius={11}
                    color="#f5f5f0"
                    solidFill
                    circleText="L"
                  />
                </g>
              </svg>
              <span className="truncate text-caption text-[#f5f5f0]">{libero.name}</span>
              <span className="ml-auto shrink-0 font-label text-micro text-[#a9b096]">
                尚未指定頂替對象
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
