import { useLayoutEffect, useRef } from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { clockTime, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

// Monochrome speaker styles: people are told apart by tone, not color.
const SPEAKER_STYLES = [
  'bg-neutral-900 text-white',
  'bg-neutral-500 text-white',
  'bg-white text-neutral-900 ring-1 ring-inset ring-neutral-300',
  'bg-neutral-200 text-neutral-900',
  'bg-neutral-700 text-white',
  'bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-200',
];

function SpeakerAvatar({ userId, name, styleFor }) {
  if (userId === 'orbit') {
    // Plain <img>: Orbit's mark is a local file, so it should never flash a fallback letter.
    return (
      <span className="grid size-9 place-items-center rounded-full bg-white ring-1 ring-neutral-200">
        <img src="/orbit-mark.png" alt="" className="size-7" />
      </span>
    );
  }
  return (
    <Avatar className="size-9">
      <AvatarFallback className={cn('text-xs font-semibold', styleFor(userId))}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function Line({ entry, partial, styleFor }) {
  const isOrbit = entry.userId === 'orbit';
  return (
    <li className={cn('grid grid-cols-[36px_1fr] gap-3 py-3', isOrbit && 'border-l-2 border-l-meta pl-3')}>
      <SpeakerAvatar userId={entry.userId} name={entry.speaker} styleFor={styleFor} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{entry.speaker}</span>
          {isOrbit ? (
            <span className="text-xs text-muted-foreground">spoke in the call · Meta MMS-TTS</span>
          ) : partial ? (
            <span className="flex gap-0.5" aria-label="speaking">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1 animate-bounce rounded-full bg-neutral-400" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          ) : (
            <time className="text-xs tabular-nums text-muted-foreground">{clockTime(entry.startedAt)}</time>
          )}
        </div>
        <p className={cn('mt-0.5 text-[17px] leading-relaxed break-words', partial && 'text-muted-foreground')}>{entry.text}</p>
      </div>
    </li>
  );
}

export function TranscriptCard({ finals, partials }) {
  const scrollRef = useRef(null);
  const styles = useRef(new Map());
  const styleFor = (userId) => {
    if (!styles.current.has(userId)) styles.current.set(userId, SPEAKER_STYLES[styles.current.size % SPEAKER_STYLES.length]);
    return styles.current.get(userId);
  };
  if (!finals.length && !Object.keys(partials).length) styles.current.clear();

  // Stay pinned to the newest line unless someone scrolled up to read.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    const onScroll = () => (pinned.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80);
    viewport.addEventListener('scroll', onScroll);
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport && pinned.current) viewport.scrollTop = viewport.scrollHeight;
  }, [finals, partials]);

  const live = Object.values(partials);
  return (
    <Card className="min-h-0 gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Live transcript</CardTitle>
        <CardDescription>Muse Voice Transcribe · one stream per speaker</CardDescription>
        {finals.length > 0 && (
          <CardAction>
            <Badge variant="secondary" className="tabular-nums">
              {finals.length} {finals.length === 1 ? 'line' : 'lines'}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea ref={scrollRef} className="h-full">
          {finals.length === 0 && live.length === 0 ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4 px-6 text-center">
              <img src="/orbit-logo.png" alt="" className="h-16 w-auto opacity-15" />
              <div>
                <p className="font-medium">Waiting for a call</p>
                <p className="text-sm text-muted-foreground">
                  Type <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/join</code> in Discord, or{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/demo</code>
                </p>
              </div>
            </div>
          ) : (
            <ol className="divide-y px-6" aria-label="Call transcript">
              {finals.map((e, i) => (
                <Line key={`${e.startedAt}-${i}`} entry={e} styleFor={styleFor} />
              ))}
              {live.map((p) => (
                <Line key={`live-${p.userId}`} entry={p} partial styleFor={styleFor} />
              ))}
            </ol>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
