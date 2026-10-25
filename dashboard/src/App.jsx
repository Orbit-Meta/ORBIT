import { Header } from '@/components/Header';
import { TranscriptCard } from '@/components/TranscriptCard';
import { NotesCard } from '@/components/NotesCard';
import { ActivityCard } from '@/components/ActivityCard';
import { useOrbitStream } from '@/hooks/useOrbitStream';

export default function App() {
  const s = useOrbitStream();
  return (
    <div className="flex h-dvh flex-col">
      <Header session={s.session} />
      {/* Phones: one scrolling column with fixed-height cards. Desktop/projector: fills the screen, no page scroll. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] lg:overflow-hidden [&>*]:min-w-0 max-lg:[&_[data-slot=card]]:h-[70dvh]">
        <TranscriptCard finals={s.finals} partials={s.partials} />
        <div className="grid min-h-0 grid-cols-1 gap-4 sm:gap-6 lg:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
          <NotesCard insights={s.insights} thinking={s.thinking} round={s.round} plan={s.plan} />
          <ActivityCard muse={s.muse} />
        </div>
      </main>
      <footer className="flex h-10 shrink-0 items-center border-t px-4 text-xs text-muted-foreground sm:px-6">
        <span className="min-w-0 truncate">
          All AI in Orbit is Meta: <span className="text-foreground">Muse Voice Transcribe</span> · <span className="text-foreground">Muse Spark</span> ·{' '}
          <span className="text-foreground">MMS-TTS</span>
        </span>
      </footer>
    </div>
  );
}
