import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { Reveal, RevealLine, SwapText } from '@/components/motion';
import { initials } from '@/lib/format';
import { minSec, talkTime } from '@/lib/stats';
import { cn } from '@/lib/utils';

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** The big circle: whoever is talking right now (Meta blue ring), otherwise Orbit itself. */
function NowSpeaking({ session, speaking }) {
  const live = session && session.state !== 'ended';
  const [greeting, name] = speaking
    ? ['Now speaking', speaking.speaker]
    : live
      ? ['Listening in', session.channel]
      : ['Orbit is ready', 'Waiting for a call'];
  return (
    <div className="flex flex-col items-center gap-4 px-6 text-center">
      <div className="relative">
        {speaking && <span className="absolute -inset-1 animate-[speak-ripple_1.6s_ease-out_infinite] rounded-full border-2 border-meta" aria-hidden="true" />}
        <div className={cn('relative grid size-24 place-items-center rounded-full bg-white ring-4 transition-shadow duration-300', speaking ? 'ring-meta' : 'ring-white/10')}>
          {speaking ? (
            <span className="text-3xl font-bold tracking-tight text-neutral-900">{initials(speaking.speaker)}</span>
          ) : (
            <img src="/orbit-mark.png" alt="" className="size-16" />
          )}
        </div>
      </div>
      <div className="min-w-0" role="status" aria-atomic="true">
        <p className="text-sm text-sidebar-muted">
          <SwapText text={greeting} />
        </p>
        <p className="mt-0.5 truncate text-lg font-semibold">
          <SwapText text={name} />
        </p>
      </div>
    </div>
  );
}

function Elapsed({ since }) {
  const now = useNow(1000);
  const s = Math.max(0, Math.floor((now - new Date(since)) / 1000));
  return <span className="font-mono tabular-nums">{minSec(s)}</span>;
}

export function Sidebar({ session, finals, partials, className }) {
  const speakingNow = Object.values(partials).at(-1);
  const people = talkTime(finals, partials);
  const total = people.reduce((s, p) => s + p.seconds, 0) || 1;
  return (
    <aside className={cn('flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground', className)}>
      <div className="flex items-center gap-3 px-7 pt-8">
        <img src="/orbit-logo.png" alt="" className="h-8 w-auto invert" />
        <span className="text-xl font-bold tracking-tight">Orbit</span>
      </div>

      <div className="pt-10 pb-8">
        <NowSpeaking session={session} speaking={speakingNow} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <p className="px-3 pb-2 text-xs font-medium tracking-wide text-sidebar-muted uppercase">In the call</p>
        {people.length === 0 ? (
          <p className="px-3 text-sm text-sidebar-muted">People show up here as they talk.</p>
        ) : (
          <ul className="space-y-1">
            {people.map((p) => {
              const active = speakingNow?.userId === p.userId;
              return (
                <Reveal as="li" key={p.userId}>
                  <RevealLine
                    n={1}
                    className={cn('relative rounded-xl px-3 py-2.5 transition-colors duration-300', active && 'bg-white/[0.07]')}
                  >
                    {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-meta" aria-hidden="true" />}
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">{initials(p.name)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      {active ? (
                        <Mic className="size-3.5 text-sidebar-foreground" aria-label="speaking" />
                      ) : (
                        <span className="font-mono text-xs tabular-nums text-sidebar-muted">{minSec(p.seconds)}</span>
                      )}
                    </div>
                    <div className="mt-2 ml-11 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                      <div className="h-full rounded-full bg-white/70 transition-[width] duration-500 ease-out" style={{ width: `${(p.seconds / total) * 100}%` }} />
                    </div>
                  </RevealLine>
                </Reveal>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-7 py-5 text-sm text-sidebar-muted">
        <span>
          Powered by <span className="font-semibold text-sidebar-foreground">Meta AI</span>
        </span>
        {session && session.state !== 'ended' && <Elapsed since={session.startedAt} />}
      </div>
    </aside>
  );
}
