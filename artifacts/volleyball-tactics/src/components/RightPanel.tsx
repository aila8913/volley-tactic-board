import React, { useState, useRef } from 'react';
import { useTactics, ToolType } from '../hooks/useTactics';
import { exportCourtAsPng, exportStateAsJson, importStateFromJson } from '../lib/exportUtils';
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

const COLORS = ['#CCFF00', '#3b82f6', '#ef4444', '#f97316', '#a855f7', '#eab308', '#ffffff', '#111111'];

export default function RightPanel() {
  const { 
    activeTool, setActiveTool, 
    projectName, teamName, setProjectName, setTeamName,
    saveProject, projects, loadProject, importState,
    rotations, currentRotation, setCurrentRotation, removeMarker, removeDefenseRange, selectedObjectId,
    updateDefenseRange, undo, redo, historyIndex, history
  } = useTactics();
  
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTool = (tool: ToolType) => setActiveTool(tool);

  const toolBtnClass = (tool: ToolType) => 
    `wobbly-border py-2 text-sm font-bold transition-colors ${activeTool === tool ? 'bg-[#CCFF00] shadow-[2px_2px_0_0_#111]' : 'bg-white hover:bg-gray-100'}`;

  const handleDelete = () => {
    if (selectedObjectId) {
      removeMarker(selectedObjectId);
      removeDefenseRange(selectedObjectId);
    }
  };

  const handleExportPNG = () => {
    exportCourtAsPng('court-wrapper', `${projectName || 'tactics'}_輪次${currentRotation + 1}`);
    toast({ title: "匯出成功", description: "PNG 下載中..." });
  };

  const handleExportAllPNG = async () => {
    toast({ title: "匯出中", description: "即將下載多個檔案..." });
    const originalRotation = currentRotation;
    for (let i = 0; i < 6; i++) {
      setCurrentRotation(i);
      // Brief delay to allow React to render the new rotation
      await new Promise(resolve => setTimeout(resolve, 300));
      exportCourtAsPng('court-wrapper', `${projectName || 'tactics'}_輪次${i + 1}`);
    }
    setCurrentRotation(originalRotation);
  };

  const handleExportJSON = () => {
    const stateStr = localStorage.getItem('volleyboard_current');
    if (stateStr) {
      exportStateAsJson(JSON.parse(stateStr).state, `${projectName || 'tactics'}`);
      toast({ title: "匯出成功", description: "JSON 下載中..." });
    }
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importStateFromJson(file);
      importState(data);
      toast({ title: "匯入成功", description: "戰術板已更新" });
    } catch (err) {
      toast({ title: "匯入失敗", description: "檔案格式錯誤", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNewProject = () => {
    localStorage.removeItem('volleyboard_current');
    window.location.reload();
  };

  const currentRotState = rotations[currentRotation];
  const selectedRange = currentRotState?.defenseRanges.find(dr => dr.id === selectedObjectId);

  return (
    <div className="flex flex-col h-full bg-[#f8f8f8]">
      <div className="p-4 flex flex-col gap-6 overflow-y-auto flex-1 wobbly-svg">
        
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-display text-2xl border-b-2 border-[#111] inline-block">畫筆工具</h2>
            <div className="flex gap-1">
              <button onClick={undo} disabled={historyIndex <= 0} className="px-2 py-1 wobbly-border bg-white text-xs disabled:opacity-50 hover:bg-[#CCFF00]" title="Undo (Ctrl+Z)">↩</button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} className="px-2 py-1 wobbly-border bg-white text-xs disabled:opacity-50 hover:bg-[#CCFF00]" title="Redo (Ctrl+Y)">↪</button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button onClick={() => handleTool('select')} className={toolBtnClass('select')}>選取移動</button>
            <button onClick={() => handleTool('arrow')} className={toolBtnClass('arrow')}>實線箭頭</button>
            <button onClick={() => handleTool('dashed')} className={toolBtnClass('dashed')}>虛線路徑</button>
            <button onClick={() => handleTool('attack')} className={toolBtnClass('attack')}>攻擊線</button>
            <button onClick={() => handleTool('text')} className={toolBtnClass('text')}>文字</button>
            <button onClick={() => handleTool('volleyball')} className={toolBtnClass('volleyball')}>排球</button>
          </div>
          <button 
            onClick={handleDelete}
            disabled={!selectedObjectId}
            className="w-full wobbly-border py-2 text-sm bg-white hover:bg-red-100 disabled:opacity-50 text-red-600 font-bold transition-colors"
          >
            刪除選取標記 (Del)
          </button>
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3 border-b-2 border-[#111] inline-block">防守範圍</h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <button onClick={() => handleTool('circle')} className={toolBtnClass('circle')}>圓形</button>
            <button onClick={() => handleTool('ellipse')} className={toolBtnClass('ellipse')}>橢圓</button>
            <button onClick={() => handleTool('fan')} className={toolBtnClass('fan')}>扇形</button>
          </div>

          {selectedRange && (
            <div className="p-3 bg-white wobbly-border text-sm space-y-3">
              <div className="font-bold">範圍屬性</div>
              <div>
                <label className="text-xs mb-1 block">透明度: {Math.round(selectedRange.opacity * 100)}%</label>
                <input 
                  type="range" min="0.1" max="1" step="0.1" 
                  value={selectedRange.opacity} 
                  onChange={(e) => updateDefenseRange(selectedRange.id, { opacity: parseFloat(e.target.value) })}
                  className="w-full accent-[#CCFF00]"
                />
              </div>
              <div>
                <label className="text-xs mb-1 block">顏色</label>
                <div className="flex gap-1 flex-wrap">
                  {COLORS.map(c => (
                    <button 
                      key={c}
                      className={`w-6 h-6 border-2 border-[#111] ${selectedRange.color === c ? 'ring-2 ring-offset-1 ring-[#111]' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => updateDefenseRange(selectedRange.id, { color: c })}
                    />
                  ))}
                </div>
              </div>
              
              {selectedRange.type === 'circle' && (
                <div>
                  <label className="text-xs mb-1 block">半徑</label>
                  <input type="range" min="5" max="50" value={selectedRange.radius || 15} onChange={(e) => updateDefenseRange(selectedRange.id, { radius: parseInt(e.target.value) })} className="w-full accent-[#CCFF00]"/>
                </div>
              )}
              {selectedRange.type === 'ellipse' && (
                <>
                  <div>
                    <label className="text-xs mb-1 block">長軸</label>
                    <input type="range" min="5" max="50" value={selectedRange.rx || 15} onChange={(e) => updateDefenseRange(selectedRange.id, { rx: parseInt(e.target.value) })} className="w-full accent-[#CCFF00]"/>
                  </div>
                  <div>
                    <label className="text-xs mb-1 block">短軸</label>
                    <input type="range" min="5" max="50" value={selectedRange.ry || 10} onChange={(e) => updateDefenseRange(selectedRange.id, { ry: parseInt(e.target.value) })} className="w-full accent-[#CCFF00]"/>
                  </div>
                </>
              )}
              {selectedRange.type === 'fan' && (
                <>
                  <div>
                    <label className="text-xs mb-1 block">半徑</label>
                    <input type="range" min="10" max="80" value={selectedRange.radius || 15} onChange={(e) => updateDefenseRange(selectedRange.id, { radius: parseInt(e.target.value) })} className="w-full accent-[#CCFF00]"/>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl mb-3 border-b-2 border-[#111] inline-block">專案管理</h2>
          <div className="space-y-2 mb-4">
            <input 
              className="w-full wobbly-border px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#CCFF00]" 
              placeholder="專案名稱" 
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <input 
              className="w-full wobbly-border px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#CCFF00]" 
              placeholder="隊伍名稱" 
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <button onClick={() => { saveProject(); toast({ title: "專案已儲存" })}} className="flex-1 wobbly-border py-2 bg-[#CCFF00] hover:bg-[#111] hover:text-[#CCFF00] transition-colors font-bold text-sm shadow-[2px_2px_0_0_#111]">儲存</button>
              <button onClick={handleNewProject} className="flex-1 wobbly-border py-2 bg-white hover:bg-gray-100 font-bold text-sm">新建</button>
            </div>
            
            {projects.length > 0 && (
              <div className="mt-4 border-2 border-[#111] bg-white p-2">
                <div className="text-xs font-bold mb-2">已儲存專案 (點擊載入)</div>
                <div className="space-y-1 max-h-[100px] overflow-y-auto">
                  {projects.map(p => (
                    <div key={p.id} className="flex justify-between items-center text-xs p-1 hover:bg-gray-100 cursor-pointer" onClick={() => { loadProject(p.id); toast({ title: "專案已載入" }); }}>
                      <span>{p.name || '未命名'}</span>
                      <span className="text-gray-500">{new Date(p.date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

      </div>

      <div className="p-4 border-t-2 border-[#111] bg-white wobbly-svg">
        <h2 className="font-display text-2xl mb-3 border-b-2 border-[#111] inline-block">分享匯出</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleExportPNG} className="wobbly-border py-2 bg-white text-xs hover:bg-[#CCFF00] font-bold">匯出 PNG</button>
          <button onClick={handleExportAllPNG} className="wobbly-border py-2 bg-white text-xs hover:bg-[#CCFF00] font-bold">匯出6輪PNG</button>
          <button onClick={handleExportJSON} className="wobbly-border py-2 bg-white text-xs hover:bg-[#CCFF00] font-bold">匯出 JSON</button>
          <button onClick={() => fileInputRef.current?.click()} className="wobbly-border py-2 bg-white text-xs hover:bg-[#CCFF00] font-bold">匯入 JSON</button>
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImportJSON} />
        </div>
      </div>
    </div>
  );
}
