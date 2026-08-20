import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowLeft, RefreshCcw, ExternalLink, Sparkles } from 'lucide-react';
import { usePersona } from './context/PersonaContext';
import { fetchLastTenUpdates } from './services/intelligenceService';
import { IntelligenceUpdate } from './types/persona';
import { GeoContext } from './types/geolocation';

interface KnowledgeFeedScreenProps {
  onBack: () => void;
  isPrivateMode: boolean;
  geoContext: GeoContext | null;
}

const RecapCard = React.memo(function RecapCard({ update }: { update: IntelligenceUpdate }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-bg/10 bg-surface px-3 py-2.5 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-bg/40">
            {update.source} • {update.timestamp}
          </p>
          <h3 className="text-base font-bold leading-snug text-bg">{update.title}</h3>
        </div>
        <a href={update.url} target="_blank" rel="noopener noreferrer" className="mt-1 text-bg/40 hover:text-bg">
          <ExternalLink size={16} />
        </a>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-bg/65 font-medium">{update.summary}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-bg/80">{update.whyItMatters}</p>
    </div>
  );
});

export const KnowledgeFeedScreen: React.FC<KnowledgeFeedScreenProps> = ({ onBack, isPrivateMode, geoContext }) => {
  const { persona } = usePersona();
  const [updates, setUpdates] = useState<IntelligenceUpdate[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadUpdates = useCallback(async () => {
    setIsLoading(true);
    setVisibleCount(0);
    setUpdates([]);

    try {
      const data = await fetchLastTenUpdates(
        persona.profession,
        persona.monthlyTargets,
        geoContext,
        isPrivateMode,
      );
      setUpdates(data);
    } catch (error) {
      console.error('Failed to fetch updates:', error);
    }
  }, [persona.profession, persona.monthlyTargets, geoContext, isPrivateMode]);

  useEffect(() => {
    void loadUpdates();
  }, [loadUpdates]);

  useEffect(() => {
    if (!isLoading || updates.length === 0) {
      return;
    }

    if (visibleCount >= updates.length) {
      setIsLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 1, updates.length));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [isLoading, updates.length, visibleCount]);

  const recapCards = useMemo(
    () => updates.slice(0, visibleCount).map((update) => <RecapCard key={update.id} update={update} />),
    [updates, visibleCount],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface text-bg">
      <header className="px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between border-b border-bg/10 pb-3 px-1">
          <button onClick={onBack} className="text-bg/60 transition-colors hover:text-bg">
            <ArrowLeft size={24} />
          </button>

          <h2 className="font-serif text-xl font-normal italic tracking-wide text-bg">Recap</h2>

          <button
            onClick={loadUpdates}
            disabled={isLoading}
            className={`text-bg/60 transition-all hover:text-bg ${isLoading ? 'animate-spin' : ''}`}
          >
            <RefreshCcw size={20} />
          </button>
        </div>

        <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-bg/5 bg-bg/5 px-3 py-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${isLoading ? 'animate-pulse bg-bg' : 'bg-bg/50'}`} />
          <span className="text-[9px] font-bold uppercase tracking-widest text-bg/60">
            {isLoading ? 'Streaming updates' : 'Live briefing'} • {persona.customTitle} • {persona.profession}
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 pb-4">
        {isLoading && updates.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <Sparkles className="animate-pulse text-bg/40" size={32} />
            <p className="text-[10px] uppercase tracking-[0.3em] text-bg/40">Synthesizing...</p>
          </div>
        ) : (
          <div className="space-y-2.5">{recapCards}</div>
        )}
      </main>
    </div>
  );
};
