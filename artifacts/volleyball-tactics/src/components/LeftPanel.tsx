import React, { useState } from "react";
import { useParams } from "wouter";
import { useTactics } from "../hooks/useTactics";
import { useMatches } from "../hooks/useMatches";
import { CIRCLE_LABEL_TYPES, CircleLabelType } from "../types/tactics";
import { MatchPlayer } from "../types/match";
import RotationThumbnails from "./RotationThumbnails";
import RosterEditDialog from "./RosterEditDialog";

const CIRCLE_LABEL_TEXT: Record<CircleLabelType, string> = {
  name: "姓名",
  number: "背號",
  role: "位置",
};

export default function LeftPanel() {
  const {
    roster,
    setRoster,
    liberoSubstitution,
    setLiberoSubstitution,
    labelToggles,
    toggleLabel,
    circleLabel,
    setCircleLabel,
    rotations,
    currentRotation,
    resetCurrentRotation,
    clearMarkers,
  } = useTactics();
  const { id: matchId } = useParams<{ id: string }>();
  const updateMatchPlayers = useMatches((state) => state.updateMatchPlayers);
  const [isRosterDialogOpen, setIsRosterDialogOpen] = useState(false);

  // 球員名單同時要存進戰術板自己的 roster，也要回寫到比賽列表那邊的 match.players，
  // 兩邊存的是同一份資料（包含 id），這樣下次重新進這個戰術板時兩邊才不會兜不起來。
  const handleRosterSave = (players: MatchPlayer[]) => {
    setRoster(players);
    if (matchId) {
      updateMatchPlayers(matchId, players);
    }
  };

  const hasRotations = rotations.some((r) => r.positions.length > 0);

  // 哪些人已經在場上了，名單上標示一下，拖曳時比較清楚目前狀態。
  const onCourtIds = new Set(rotations[currentRotation].positions.map((p) => p.playerId));

  const mbPlayers = roster.filter((p) => p.role === "MB");
  const handleSub = (playerId: string) => {
    setLiberoSubstitution(liberoSubstitution === playerId ? null : playerId);
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f8f8]">
      <div className="p-4 overflow-y-auto flex-1 space-y-5">
        {/* Title */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 bg-[#CCFF00] wobbly-border rounded-full flex items-center justify-center font-bold text-sm">
            V
          </div>
          <h1 className="font-display text-3xl tracking-tight">VolleyBoard</h1>
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[15px] font-bold">球員設定</h2>
            <button
              onClick={() => setIsRosterDialogOpen(true)}
              className="wobbly-border bg-white px-2 py-0.5 text-xs font-bold hover:bg-gray-100"
              data-testid="button-edit-roster"
            >
              編輯
            </button>
          </div>
          {/* 名單只顯示「目前有的」球員，不像場上站位一定要湊滿固定欄位；
              新增/刪除/編輯都在「編輯」彈窗裡做，這裡是可以拖到球場上的唯讀清單。 */}
          <div className="space-y-1 mb-3">
            {roster.length === 0 && (
              <p className="text-xs text-gray-500">尚未設定球員，點右上角「編輯」新增</p>
            )}
            {roster.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                className={`flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing wobbly-border px-1.5 py-1 ${
                  onCourtIds.has(p.id) ? "bg-[#CCFF00]/30" : "bg-white"
                }`}
                data-testid={`roster-row-${p.id}`}
              >
                <span className="w-8 text-right text-xs font-bold text-gray-600">{p.role}</span>
                <span className="w-8 text-gray-500">{p.number}</span>
                <span className="flex-1">{p.name}</span>
                {onCourtIds.has(p.id) && <span className="text-[10px] text-gray-500">已上場</span>}
              </div>
            ))}
          </div>

          {/* 圈圈裡顯示什麼放在球員設定旁邊，編輯球員資料跟挑選顯示方式放在一起比較直覺 */}
          <div className="mb-3">
            <span className="text-xs font-bold text-gray-600">圈圈顯示：</span>
            <div className="flex gap-2 mt-1">
              {CIRCLE_LABEL_TYPES.map((key) => (
                <label
                  key={key}
                  className={`cursor-pointer flex-1 text-center px-2 py-1 wobbly-border text-xs font-bold transition-colors select-none
                    ${circleLabel === key ? "bg-[#CCFF00] shadow-[2px_2px_0_0_#111]" : "bg-white hover:bg-gray-100"}
                  `}
                  data-testid={`circle-label-${key}`}
                >
                  <input
                    type="radio"
                    name="circleLabel"
                    value={key}
                    checked={circleLabel === key}
                    onChange={() => setCircleLabel(key)}
                    className="hidden"
                  />
                  {CIRCLE_LABEL_TEXT[key]}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Rotation Thumbnails */}
        {hasRotations && (
          <section>
            <h2 className="font-display mb-1 text-[15px] font-bold">輪次選擇</h2>
            <RotationThumbnails />
            <div className="flex gap-2 mt-1">
              <button
                onClick={resetCurrentRotation}
                className="flex-1 wobbly-border bg-white px-2 py-1 text-xs font-bold hover:bg-gray-100"
              >
                重置站位
              </button>
              <button
                onClick={clearMarkers}
                className="flex-1 wobbly-border bg-white px-2 py-1 text-xs font-bold hover:bg-red-100 text-red-600"
              >
                清除畫筆
              </button>
            </div>
          </section>
        )}

        {mbPlayers.length > 0 && (
          <section>
            <h2 className="font-display mb-2 text-[15px] font-bold">自由球員替換</h2>
            <div className="flex flex-wrap gap-2">
              {mbPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSub(p.id)}
                  className={`flex-1 wobbly-border py-1.5 text-xs font-bold transition-colors
                    ${liberoSubstitution === p.id ? "bg-[#FF6B00] text-white" : "bg-white hover:bg-gray-100"}`}
                  data-testid={`button-libero-${p.id}`}
                >
                  替換 {p.name || "MB"}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display mb-2 text-[15px] font-bold">球場標示</h2>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold">
              <div
                className={`w-4 h-4 wobbly-border flex items-center justify-center ${labelToggles.zone ? "bg-[#CCFF00]" : "bg-white"}`}
              >
                {labelToggles.zone && <div className="w-1.5 h-1.5 bg-[#111] rounded-full" />}
              </div>
              <span>號位</span>
              <input
                type="checkbox"
                checked={labelToggles.zone}
                onChange={() => toggleLabel("zone")}
                className="hidden"
              />
            </label>
          </div>
        </section>
      </div>
      {/* Tips Section */}
      <div className="p-3 border-t-2 border-[#111] bg-white">
        <details className="group">
          <summary className="font-display cursor-pointer font-bold outline-none marker:content-[''] text-sm">
            <span className="group-open:hidden">👉 新手提示 (Tips)</span>
            <span className="hidden group-open:inline">👇 隱藏提示</span>
          </summary>
          <ul className="mt-2 text-xs space-y-1 list-disc pl-4 text-gray-700">
            <li>把球員從名單拖到球場上，會自動吸附到最近的位置</li>
            <li>拖到已經有人的位置會跟原本那位對換</li>
            <li>排好一個輪次後，其他 5 個輪次會自動依輪轉順序排好</li>
            <li>在右側面板選工具後點擊球場畫圖</li>
          </ul>
        </details>
      </div>

      <RosterEditDialog
        open={isRosterDialogOpen}
        onOpenChange={setIsRosterDialogOpen}
        roster={roster}
        onSave={handleRosterSave}
      />
    </div>
  );
}
