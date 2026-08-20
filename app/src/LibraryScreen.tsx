import React, { useState } from 'react';
import { Folder, FileText, ChevronRight, Sparkles, BrainCircuit } from 'lucide-react';

export const LibraryScreen: React.FC = () => {
  const [currentFolder, setCurrentScreen] = useState<'root' | 'learning'>('root');

  const learningArtifacts = [
    { id: '1', name: 'Behavioral_Vector_2024_08.json', type: 'telemetry', date: '2h ago' },
    { id: '2', name: 'Preference_Matrix_Recalibration.insight', type: 'ml-log', date: 'Yesterday' },
    { id: '3', name: 'AUI_Signal_Ingestion_Log.vmap', type: 'interaction', date: '3 days ago' },
  ];

  return (
    <div className="flex flex-col h-full bg-surface text-bg">
      <header className="px-6 pt-10 pb-4">
        <div className="flex items-center gap-2 mb-2">
           <Folder size={14} className="text-bg" />
           <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-bg/60">Archive</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-bg leading-tight">
          Library
        </h1>
      </header>

      <main className="flex-1 px-4 overflow-y-auto space-y-6">
        {currentFolder === 'root' ? (
          <div className="space-y-3">
            <button
              onClick={() => setCurrentScreen('learning')}
              className="w-full flex items-center justify-between p-5 rounded-2xl bg-bg/5 border border-bg/5 hover:bg-bg/10 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg text-surface shadow-lg">
                  <BrainCircuit size={24} />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-bg">Learning</h3>
                  <p className="text-[10px] text-bg/60 uppercase tracking-widest mt-0.5 font-bold">Telemetry & Insights</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-bg/40 group-hover:text-bg transition-all" />
            </button>

            <div className="p-10 text-center rounded-3xl border border-dashed border-bg/10 opacity-40">
              <p className="text-[9px] text-bg/60 uppercase tracking-[0.3em] font-bold">Empty Cluster</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setCurrentScreen('root')}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-bg/60 mb-2 hover:text-bg transition-colors"
            >
              <ChevronRight size={12} className="rotate-180" /> Back to Library
            </button>

            <div className="p-4 rounded-2xl bg-bg/5 border border-bg/10 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} className="text-bg" />
                <span className="text-[9px] font-black uppercase tracking-widest text-bg">Active AUL Intelligence</span>
              </div>
              <p className="text-[10px] leading-relaxed text-bg/60 font-medium">
                This secure subsection houses locally generated telemetry artifacts.
              </p>
            </div>

            <div className="space-y-2">
              {learningArtifacts.map(file => (
                <div key={file.id} className="flex items-center justify-between p-4 rounded-xl bg-surface border border-bg/10 shadow-sm">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-bg/40" />
                    <div>
                      <p className="text-xs font-bold text-bg">{file.name}</p>
                      <p className="text-[9px] text-bg/40 uppercase tracking-widest font-black">{file.date} • {file.type}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
