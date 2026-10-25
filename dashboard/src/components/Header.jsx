import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { SwapText } from '@/components/motion';
import { cn } from '@/lib/utils';

function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since)) / 1000));
  return <span className="font-mono text-sm tabular-nums text-muted-foreground">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>;
}

export function Header({ session, className }) {
  return (
    <header className={cn('flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 sm:gap-4 sm:px-6', className)}>
      <div className="flex shrink-0 items-center gap-3">
        <img src="/orbit-logo.png" alt="" className="h-9 w-auto" />
        <span className="text-lg font-semibold tracking-tight">Orbit</span>
      </div>
      {session?.channel && (
        <>
          <Separator orientation="vertical" className="!h-5 max-sm:hidden" />
          <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground max-sm:hidden">
            <Volume2 className="size-4 shrink-0" aria-hidden="true" />
            <SwapText text={session.channel} />
          </span>
        </>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
        <span className="hidden text-sm text-muted-foreground md:inline">
          Powered by <span className="font-medium text-foreground">Meta AI</span>
        </span>
        {session && session.state !== 'ended' && (
          <span className="max-sm:hidden">
            <Elapsed since={session.startedAt} />
          </span>
        )}
      </div>
    </header>
  );
}
