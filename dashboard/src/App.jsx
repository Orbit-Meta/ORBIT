import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { Overview } from '@/components/Overview';
import { TranscriptCard } from '@/components/TranscriptCard';
import { NotesCard } from '@/components/NotesCard';
import { ActivityPanel } from '@/components/ActivityPanel';
import { SoftText } from '@/components/motion';
import { useOrbitStream } from '@/hooks/useOrbitStream';
import { clockTime } from '@/lib/format';

function Title({ session }) {
  const sub = !session
    ? 'Waiting for a call · type /join in Discord'
    : session.state === 'ended'
      ? `${session.channel} · call ended`
      : `${session.channel} · started ${clockTime(session.startedAt).replace(/:\d\d(?= )/, '')}`;
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Live call</h1>
      <p className="text-sm text-muted-foreground">
        <SoftText text={sub} />
      </p>
    </div>
  );
}

export default function App() {
  const s = useOrbitStream();
  return (
    <div className="h-dvh bg-frame xl:p-3">
      <div className="flex h-full overflow-hidden bg-background xl:rounded-[28px]">
        <Sidebar className="max-lg:hidden" session={s.session} finals={s.finals} partials={s.partials} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header className="lg:hidden" session={s.session} />
          <main className="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden">
            <div className="flex flex-col gap-5 p-4 sm:p-7 xl:h-full">
              <Title session={s.session} />
              <Overview finals={s.finals} muse={s.muse} insights={s.insights} thinking={s.thinking} plan={s.plan} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] xl:min-h-0 xl:flex-1 max-xl:[&_[data-slot=card]]:h-[70dvh] [&>*]:min-w-0">
                <TranscriptCard finals={s.finals} partials={s.partials} />
                <NotesCard insights={s.insights} round={s.round} />
              </div>
              <ActivityPanel className="overflow-hidden rounded-3xl bg-secondary xl:hidden" muse={s.muse} />
            </div>
          </main>
        </div>

        <ActivityPanel className="w-[340px] shrink-0 bg-secondary max-xl:hidden" muse={s.muse} />
      </div>
    </div>
  );
}
