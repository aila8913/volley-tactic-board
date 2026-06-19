import React from "react";
import { useTactics } from "../hooks/useTactics";
import RotationThumbnails from "./RotationThumbnails";

const roleName = (role: string): string => {
  const map: Record<string, string> = {
    S1: "舉球",
    OH1: "主攻1",
    OH2: "主攻2",
    MB1: "中間1",
    MB2: "中間2",
    S2: "舉球",
    L: "自由",
  };
  return map[role] ?? role;
};

export default function LeftPanel() {
  const {
    players,
    updatePlayer,
    generateRotations,
    scenario,
    setScenario,
    liberoSubstitution,
    setLiberoSubstitution,
    labelToggles,
    toggleLabel,
    rotations,
    resetCurrentRotation,
    clearMarkers,
  } = useTactics();

  const hasRotations = rotations.some((r) => {
    const base = r.scenarioPositions?.base;
    return base && base.length > 0;
  });

  const handleSub = (role: "MB1" | "MB2") => {
    if (liberoSubstitution === role) {
      setLiberoSubstitution(null);
    } else {
      setLiberoSubstitution(role);
    }
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
          <h2 className="font-display mb-3 text-[15px] font-bold">球員設定</h2>
          <div className="space-y-2 mb-3">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="w-12 text-right text-xs font-bold shrink-0">
                  {roleName(p.role)}
                </span>
                <input
                  className="flex-1 wobbly-border px-2 py-1 text-sm bg-white outline-none focus:ring-2 focus:ring-[#CCFF00] transition-shadow"
                  placeholder={p.role === "L" ? "自由球員姓名" : "球員姓名"}
                  value={p.name}
                  onChange={(e) => updatePlayer(p.id, e.target.value)}
                  data-testid={`input-player-${p.id}`}
                />
              </div>
            ))}
          </div>
          <button
            onClick={generateRotations}
            className="w-full wobbly-border bg-[#CCFF00] font-bold py-2 text-sm hover:bg-[#111] hover:text-[#CCFF00] transition-colors shadow-[2px_2px_0_0_#111111] active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
            data-testid="button-generate-rotations"
          >
            生成初始輪次
          </button>
        </section>

        {/* Rotation Thumbnails */}
        {hasRotations && (
          <section>
            <h2 className="font-display mb-1 text-[15px] font-bold">
              輪次選擇
            </h2>
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

        <section>
          <h2 className="font-display mb-2 text-[15px] font-bold">情境模式</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "base", label: "基礎輪轉" },
              { id: "serve-receive", label: "接發球" },
              { id: "defense", label: "防守" },
              { id: "attack", label: "進攻" },
              { id: "cover", label: "Cover" },
            ].map((sc) => (
              <label
                key={sc.id}
                className={`cursor-pointer px-3 py-1 wobbly-border text-xs font-bold transition-colors select-none
                  ${scenario === sc.id ? "bg-[#CCFF00] shadow-[2px_2px_0_0_#111]" : "bg-white hover:bg-gray-100"}
                `}
                data-testid={`scenario-${sc.id}`}
              >
                <input
                  type="radio"
                  name="scenario"
                  value={sc.id}
                  checked={scenario === sc.id}
                  onChange={() => setScenario(sc.id as any)}
                  className="hidden"
                />
                {sc.label}
              </label>
            ))}
          </div>
          {scenario !== "base" && (
            <p className="text-[10px] text-gray-500 mt-1">
              此情境的站位獨立保存，切換情境不影響其他情境
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display mb-2 text-[15px] font-bold">
            自由球員替換
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleSub("MB1")}
              className={`flex-1 wobbly-border py-1.5 text-xs font-bold transition-colors
                ${liberoSubstitution === "MB1" ? "bg-[#FF6B00] text-white" : "bg-white hover:bg-gray-100"}`}
              data-testid="button-libero-mb1"
            >
              替換 MB1
            </button>
            <button
              onClick={() => handleSub("MB2")}
              className={`flex-1 wobbly-border py-1.5 text-xs font-bold transition-colors
                ${liberoSubstitution === "MB2" ? "bg-[#FF6B00] text-white" : "bg-white hover:bg-gray-100"}`}
              data-testid="button-libero-mb2"
            >
              替換 MB2
            </button>
          </div>
        </section>

        <section>
          <h2 className="font-display mb-2 text-[15px] font-bold">顯示標籤</h2>
          <div className="flex gap-3">
            {(["name", "role", "zone"] as const).map((key) => (
              <label
                key={key}
                className="flex items-center gap-1.5 cursor-pointer text-xs font-bold"
              >
                <div
                  className={`w-4 h-4 wobbly-border flex items-center justify-center ${labelToggles[key] ? "bg-[#CCFF00]" : "bg-white"}`}
                >
                  {labelToggles[key] && (
                    <div className="w-1.5 h-1.5 bg-[#111] rounded-full" />
                  )}
                </div>
                <span>
                  {key === "name" ? "姓名" : key === "role" ? "角色" : "號位"}
                </span>
                <input
                  type="checkbox"
                  checked={labelToggles[key]}
                  onChange={() => toggleLabel(key)}
                  className="hidden"
                />
              </label>
            ))}
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
            <li>設定球員後點擊「生成初始輪次」</li>
            <li>點擊輪次縮圖切換輪次，每個情境的站位獨立保存</li>
            <li>在右側面板選工具後點擊球場畫圖</li>
            <li>點擊球員可拖曳調整位置</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
