import { useEffect, useState } from 'react';
import { AudioLines, Mic, Sparkles, X } from 'lucide-react';
import { Donut, PopNumber, Reveal, RevealLine, SoftText } from '@/components/motion';
import { TOOLS, avgLatency, callMix } from '@/lib/stats';
import { cn } from '@/lib/utils';

const TOOL_ICON = { 'Muse Voice Transcribe': Mic, 'Muse Spark': Sparkles, 'Meta MMS-TTS': AudioLines };
const TOOL_COLORS = ['#161616', '#8f897e', '#d4cec2']; // Voice Transcribe · Spark · MMS-TTS

function ago(at, now) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  return `${m} min ago`;
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Donut of calls per Meta tool (transitions.dev donut chart) with a legend, like the reference's profits ring. */
function MetaAtWork({ muse }) {
  const mix = callMix(muse);
  const total = mix.reduce((a, b) => a + b, 0);
  const avg = avgLatency(muse);
  const [hover, setHover] = useState(-1);
  return (
    <section className="bg-card px-7 pt-7 pb-6">
      <h2 className="text-lg font-semibold tracking-tight">Meta AI at work</h2>
      <p className="text-sm text-muted-foreground">
        <SoftText text={avg === null ? 'Every call Orbit makes, live' : `Average response ${avg} ms`} />
      </p>
      <div className="mt-5 flex items-center gap-6">
        <Donut values={total ? mix : [0, 0, 1]} colors={total ? TOOL_COLORS : ['#161616', '#8f897e', 'var(--track)']} size={132} thickness={16} dim={hover}>
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-2xl font-bold tracking-tight">
            <PopNumber value={total} />
          </span>
        </Donut>
        <ul className="min-w-0 flex-1 space-y-3">
          {TOOLS.map((t, k) => {
            const pct = total ? Math.round((mix[k] / total) * 100) : 0;
            return (
              <li key={t.key} className="cursor-default" onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(-1)}>
                <p className="truncate text-xs text-muted-foreground">{t.short}</p>
                <p className="text-base font-bold tabular-nums">
                  <PopNumber value={`${pct}%`} />
                </p>
                <div className="mt-1 h-1 rounded-full bg-track" aria-hidden="true">
                  <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: TOOL_COLORS[k] }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Recent calls as soft pill rows (texts reveal in); a failed call shakes once (error state shake). */
function RecentCalls({ muse }) {
  const now = useNow(10_000);
  const calls = [...muse].reverse().slice(0, 30);
  return (
    <section className="flex min-h-0 flex-1 flex-col px-5 pt-6">
      <h2 className="px-2 text-lg font-semibold tracking-tight">Recent activity</h2>
      <div className="min-h-0 flex-1 overflow-y-auto pt-3 pb-5">
        {calls.length === 0 ? (
          <Reveal className="px-2 py-6">
            <RevealLine n={1} as="p" className="text-sm text-muted-foreground">
              Each Meta AI call shows up here.
            </RevealLine>
          </Reveal>
        ) : (
          <ul className="space-y-2.5">
            {calls.map((c) => {
              const Icon = TOOL_ICON[c.tool] ?? Sparkles;
              return (
                <Reveal as="li" key={`${c.at}-${c.tool}-${c.endpoint}-${c.ms}`}>
                  <RevealLine n={1}>
                    <div className={cn('flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(20,20,20,0.04)]', !c.ok && 't-input is-shaking')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', c.ok ? 'bg-primary text-primary-foreground' : 'bg-destructive/10 text-destructive')}>
                        {c.ok ? <Icon className="size-4" aria-hidden="true" /> : <X className="size-4" aria-label="failed" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.tool.replace('Meta ', '')}</p>
                        <p className={cn('truncate text-xs text-muted-foreground', !c.ok && 'text-destructive')}>
                          {c.ok ? `${c.endpoint} · ${ago(c.at, now)}` : c.note}
                        </p>
                      </div>
                      {typeof c.ms === 'number' && <span className="shrink-0 text-sm font-bold tabular-nums">{c.ms} ms</span>}
                    </div>
                  </RevealLine>
                </Reveal>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ActivityPanel({ muse, className }) {
  return (
    <aside className={cn('flex flex-col', className)}>
      <MetaAtWork muse={muse} />
      <RecentCalls muse={muse} />
    </aside>
  );
}
