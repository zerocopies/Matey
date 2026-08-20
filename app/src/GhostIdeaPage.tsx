import React from 'react';
import { X, Archive, Target } from 'lucide-react';
import { IdeaArtifact } from './types/ideaIncubator';
import { MLInsightBadge } from './MLInsightBadge';

interface GhostIdeaPageProps {
  idea: IdeaArtifact;
  onDismiss: () => void;
  onArchive: (idea: IdeaArtifact) => void;
}

export const GhostIdeaPage: React.FC<GhostIdeaPageProps> = ({ idea, onDismiss, onArchive }) => {
  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-surface text-bg animate-in fade-in duration-500">
      <header className="px-6 pt-12 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-bg animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-bg">Venture Vector Unlocked</span>
        </div>
        <button onClick={onDismiss} className="text-bg/60 hover:text-bg transition-colors">
          <X size={24} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 space-y-8 pb-10">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-bg/60 mb-2">Synthesized Concept</p>
          <h1 className="text-4xl font-black tracking-tight text-bg leading-tight italic serif" style={{ fontFamily: 'Georgia, serif' }}>
            {idea.conceptName}
          </h1>
          <div className="mt-4 flex gap-2">
             <span className="px-2 py-1 rounded bg-bg text-surface text-[9px] font-bold uppercase tracking-widest">
               {idea.vertical.replace('-', ' ')}
             </span>
             <span className="px-2 py-1 rounded bg-bg/5 text-bg/60 text-[9px] font-bold uppercase tracking-widest border border-bg/10">
               Low Capex
             </span>
          </div>
        </div>

        <section className="p-6 rounded-3xl bg-bg/5 border border-bg/10 space-y-4 shadow-sm">
          <p className="text-sm leading-relaxed text-bg/90 font-bold">
            {idea.executiveSummary}
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-bg/10">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-bg/60">Confidence</span>
              <p className="text-lg font-mono font-black text-bg">{(idea.confidenceScore * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-bg/60">Feasibility</span>
              <p className="text-lg font-mono font-black text-bg">{(idea.feasibilityRating * 100).toFixed(0)}%</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-bg/60">Matching Signals</h3>
          <div className="space-y-2">
            {idea.matchingSignals.map((signal, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-bg/5 border border-bg/5">
                <Target size={14} className="text-bg mt-0.5" />
                <p className="text-xs text-bg/80 leading-relaxed font-medium">{signal}</p>
              </div>
            ))}
          </div>
        </section>

        <MLInsightBadge
          className="border-bg/10 bg-bg/5 shadow-sm"
          insight={{
            confidenceScore: idea.confidenceScore,
            learnedVector: "Contextual Synthesis",
            adaptationNote: "Synthesized via cross-mapping of tech breakthroughs."
          }}
        />

        <div className="pt-6 flex gap-3">
          <button
            onClick={() => {
              onArchive(idea);
              onDismiss();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-bg text-surface py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-2xl"
          >
            <Archive size={16} />
            Archive to Library
          </button>
        </div>
      </main>
    </div>
  );
};
