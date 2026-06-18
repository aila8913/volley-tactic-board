import React from 'react';
import { useTactics } from '../hooks/useTactics';

export default function LeftPanel() {
  const { 
    players, updatePlayer, generateRotations, 
    scenario, setScenario,
    liberoSubstitution, setLiberoSubstitution,
    labelToggles, toggleLabel
  } = useTactics();

  const handleSub = (role: 'MB1' | 'MB2') => {
    if (liberoSubstitution === role) {
      setLiberoSubstitution(null);
    } else {
      setLiberoSubstitution(role);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f8f8]">
      <div className="p-4 overflow-y-auto flex-1 wobbly-svg space-y-8">
        
        {/* Title */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-[#CCFF00] wobbly-border rounded-full flex items-center justify-center font-bold text-sm">V</div>
          <h1 className="font-display text-3xl tracking-tight">VolleyBoard</h1>
        </div>

        <section>
          <h2 className="font-display mb-4 border-b-2 border-[#111] inline-block text-[15px]">球員設定</h2>
          <div className="space-y-3 mb-4">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="w-10 text-right text-sm font-bold font-display">{p.role}</span>
                <input 
                  className="flex-1 wobbly-border px-3 py-1 text-sm bg-white outline-none focus:ring-2 focus:ring-[#CCFF00] transition-shadow" 
                  placeholder={p.role === 'L' ? "自由球員姓名" : "球員姓名"}
                  value={p.name}
                  onChange={(e) => updatePlayer(p.id, e.target.value)}
                />
              </div>
            ))}
          </div>
          <button 
            onClick={generateRotations}
            className="w-full wobbly-border bg-[#CCFF00] font-bold py-3 text-lg hover:bg-[#111] hover:text-[#CCFF00] transition-colors shadow-[2px_2px_0_0_#111111] active:shadow-none active:translate-y-[2px] active:translate-x-[2px]"
          >
            生成初始輪次
          </button>
        </section>

        <section>
          <h2 className="font-display mb-4 border-b-2 border-[#111] inline-block text-[15px]">情境模式</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'base', label: '基礎輪轉' },
              { id: 'serve-receive', label: '接發球' },
              { id: 'defense', label: '防守' },
              { id: 'attack', label: '進攻' },
              { id: 'cover', label: 'Cover保護' }
            ].map(sc => (
              <label 
                key={sc.id} 
                className={`cursor-pointer px-3 py-1 wobbly-border text-sm font-bold transition-colors select-none
                  ${scenario === sc.id ? 'bg-[#CCFF00] shadow-[2px_2px_0_0_#111]' : 'bg-white hover:bg-gray-100'}
                `}
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
        </section>
        
        <section>
          <h2 className="font-display mb-4 border-b-2 border-[#111] inline-block text-[15px]">自由球員替換</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => handleSub('MB1')}
              className={`flex-1 wobbly-border py-2 text-sm font-bold transition-colors
                ${liberoSubstitution === 'MB1' ? 'bg-[#FF6B00] text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              替換 MB1
            </button>
            <button 
              onClick={() => handleSub('MB2')}
              className={`flex-1 wobbly-border py-2 text-sm font-bold transition-colors
                ${liberoSubstitution === 'MB2' ? 'bg-[#FF6B00] text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              替換 MB2
            </button>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl mb-4 border-b-2 border-[#111] inline-block">顯示標籤</h2>
          <div className="flex gap-4">
            {(['name', 'role', 'zone'] as const).map(key => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm font-bold">
                <div className={`w-5 h-5 wobbly-border flex items-center justify-center ${labelToggles[key] ? 'bg-[#CCFF00]' : 'bg-white'}`}>
                  {labelToggles[key] && <div className="w-2 h-2 bg-[#111] rounded-full" />}
                </div>
                <span>{key === 'name' ? '姓名' : key === 'role' ? '角色' : '號位'}</span>
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
      <div className="p-4 border-t-2 border-[#111] bg-white">
        <details className="group">
          <summary className="font-display cursor-pointer font-bold outline-none marker:content-['']">
            <span className="group-open:hidden">👉 新手提示 (Tips)</span>
            <span className="hidden group-open:inline">👇 隱藏提示</span>
          </summary>
          <ul className="mt-2 text-xs space-y-1 list-disc pl-4 text-gray-700 font-sans">
            <li>設定好球員名單後點擊「生成初始輪次」</li>
            <li>在右側面板選擇工具，然後在球場上點擊畫圖</li>
            <li>點擊球員可以拖曳調整位置</li>
            <li>「自由球員替換」會自動把攔中標記改為亮橘色自由球員</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
