import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { MLInsight } from './types/mlInsight';

interface MLInsightBadgeProps {
  insight: MLInsight;
  className?: string;
}

export const MLInsightBadge: React.FC<MLInsightBadgeProps> = ({ insight, className = '' }) => {
  return (
    <div className={`flex flex-col gap-1 rounded-xl bg-bg p-4 border border-bg/10 shadow-lg ${className}`}>
      <div className="flex items-center gap-2">
        <BrainCircuit size={14} className="text-surface opacity-90" />
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-surface">AUL Intelligence</span>
      </div>
      <p className="text-[11px] leading-relaxed text-surface/70 mt-1 font-medium">
        {insight.adaptationNote}
        <br />
        <span className="opacity-40 italic text-[10px]">Vector: {insight.learnedVector}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-0.5 flex-1 bg-surface/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-surface"
            style={{ width: `${insight.confidenceScore * 100}%` }}
          />
        </div>
        <span className="text-[8px] font-mono font-black text-surface/40">{(insight.confidenceScore * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
};
