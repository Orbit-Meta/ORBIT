import { Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { clockTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function Stat({ value, label }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ActivityCard({ muse }) {
  const ok = muse.filter((c) => c.ok && typeof c.ms === 'number');
  const avg = ok.length ? Math.round(ok.reduce((sum, c) => sum + c.ms, 0) / ok.length) : null;
  const calls = [...muse].reverse();
  return (
    <Card className="min-h-0 gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Meta AI activity</CardTitle>
        <CardDescription>Every call Orbit makes, live</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-0 pt-4">
        <div className="grid grid-cols-2 gap-3 px-6">
          <Stat value={muse.length} label="Meta AI calls" />
          <Stat value={avg === null ? '–' : `${avg} ms`} label="Average latency" />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {calls.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No calls yet.</p>
          ) : (
            <ul className="divide-y px-6 pb-3">
              {calls.map((c, i) => (
                <li key={`${c.at}-${i}`} className="py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    {c.ok ? <Check className="size-3.5 shrink-0 text-muted-foreground" aria-label="succeeded" /> : <X className="size-3.5 shrink-0 text-destructive" aria-label="failed" />}
                    <span className="font-medium">{c.tool}</span>
                    <span className="truncate text-muted-foreground">{c.endpoint}</span>
                    {typeof c.ms === 'number' && <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{c.ms} ms</span>}
                  </div>
                  <p className={cn('mt-0.5 truncate pl-5.5 text-xs text-muted-foreground', !c.ok && 'text-destructive')}>
                    {clockTime(c.at)} · {c.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
