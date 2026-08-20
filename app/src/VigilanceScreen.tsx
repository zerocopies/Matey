import React, { useState, useEffect } from 'react';
import { Trash2, ChevronDown, Check } from 'lucide-react';
import { SemanticHook, MetricType, DirectionalBracket } from './types/hooks';
import { getHooks, addSemanticHook, saveHooks } from './services/hookEngine';
import { MLInsightBadge } from './MLInsightBadge';

interface VigilanceScreenProps {
  onBack: () => void;
}

const METRICS: MetricType[] = ['Price', 'Time', 'Size', 'Weight', 'Custom'];
const BRACKETS: { label: string; value: DirectionalBracket }[] = [
  { label: 'Higher Than / Exceeds', value: 'Higher' },
  { label: 'Lower Than / Drops Below', value: 'Lower' },
  { label: 'Smaller Than / Compacts', value: 'Smaller' },
  { label: 'Lighter / Reduced', value: 'Lighter' },
];

export const VigilanceScreen: React.FC<VigilanceScreenProps> = ({ onBack: _onBack }) => {
  const [hooks, setHooks] = useState<SemanticHook[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [threshold, setThreshold] = useState('');
  const [metric, setMetric] = useState<MetricType>('Price');
  const [bracket, setBracket] = useState<DirectionalBracket>('Lower');

  useEffect(() => {
    setHooks(getHooks());
  }, []);

  const handleSave = () => {
    if (!name || !url || !threshold) return;
    const newHook = addSemanticHook({ name, url, threshold, metric, bracket });
    setHooks([...hooks, newHook]);
    setName('');
    setUrl('');
    setThreshold('');
  };

  const removeHook = (id: string) => {
    const updated = hooks.filter(h => h.id !== id);
    setHooks(updated);
    saveHooks(updated);
  };

  return (
    <div className="flex flex-col h-full bg-surface text-bg overflow-y-auto">
      <header className="px-6 pt-10 pb-6 border-b border-bg/10">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-bg/40 mb-1 text-center">Engine Config</p>
        <h1 className="text-3xl font-black tracking-tight text-center italic serif" style={{ fontFamily: 'Georgia, serif' }}>
          Semantic Hooks
        </h1>
      </header>

      <main className="flex-1 px-4 py-8 space-y-8 pb-12">
        {/* Creation Form */}
        <section className="rounded-3xl border border-bg/10 bg-bg/5 p-6 shadow-sm space-y-5">
          <div className="space-y-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Hook Name"
              className="w-full bg-surface border border-bg/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-bg"
            />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Target Source / URL"
              className="w-full bg-surface border border-bg/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-bg"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[8px] font-black uppercase tracking-widest text-bg/40 px-1">Metric</label>
                <div className="relative">
                  <select
                    value={metric}
                    onChange={e => setMetric(e.target.value as MetricType)}
                    className="w-full appearance-none bg-surface border border-bg/10 rounded-xl px-4 py-3 text-xs focus:outline-none font-bold"
                  >
                    {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3.5 pointer-events-none opacity-40" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] font-black uppercase tracking-widest text-bg/40 px-1">Direction</label>
                <div className="relative">
                  <select
                    value={bracket}
                    onChange={e => setBracket(e.target.value as DirectionalBracket)}
                    className="w-full appearance-none bg-surface border border-bg/10 rounded-xl px-4 py-3 text-xs focus:outline-none font-bold"
                  >
                    {BRACKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3.5 pointer-events-none opacity-40" />
                </div>
              </div>
            </div>

            <input
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder="Target Threshold (e.g. 50, v2.0)"
              className="w-full bg-surface border border-bg/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-bg"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-bg text-surface py-4 rounded-xl font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Check size={16} strokeWidth={3} />
            Commit Hook
          </button>

          <MLInsightBadge
            className="border-bg/5 bg-bg/5 shadow-none"
            insight={{
              confidenceScore: 0.96,
              learnedVector: "Semantic Tracking",
              adaptationNote: "Monitoring market volatility via periodic background polling."
            }}
          />
        </section>

        {/* Active Hooks List */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-bg/40 px-2">Active Surveillance</h3>
          {hooks.length === 0 ? (
            <div className="p-10 text-center rounded-3xl border border-dashed border-bg/10">
              <p className="text-[9px] text-bg/40 uppercase tracking-[0.3em] font-black">Zero Activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hooks.map(hook => (
                <div key={hook.id} className="p-5 rounded-2xl bg-bg/5 border border-bg/5 flex justify-between items-center">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-bg">{hook.name}</h4>
                    <p className="text-[9px] text-bg/60 font-black uppercase tracking-widest">
                      {hook.metric} • {hook.bracket} • {hook.threshold}
                    </p>
                  </div>
                  <button onClick={() => removeHook(hook.id)} className="p-2 text-bg/40 hover:text-bg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
