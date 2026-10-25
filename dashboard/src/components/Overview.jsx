import { CalendarDays, ExternalLink, Lock, MapPin, MessagesSquare, Sparkles, Users } from 'lucide-react';
import { PopNumber, Reveal, RevealLine, SoftText, StreamText, SuccessCheck, ThinkingLine } from '@/components/motion';
import { planWhen } from '@/lib/format';
import { avgLatency, wordsIn } from '@/lib/stats';

/** A small smooth trend line (midpoint-smoothed), like the reference's tile sparklines. */
function Sparkline({ values, className }) {
  const w = 220;
  const h = 40;
  if (values.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
  }
  d += ` T${pts.at(-1)[0]},${pts.at(-1)[1]}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatTile({ icon: Icon, label, value, unit, chip, trend }) {
  return (
    <div className="flex min-w-0 flex-col rounded-3xl bg-sand p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-7 place-items-center rounded-lg bg-black/[0.06]">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-bold tracking-tight">
          <PopNumber value={value} />
          {unit && <span className="ml-1.5 text-lg font-semibold text-muted-foreground">{unit}</span>}
        </span>
        {chip && <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums">{chip}</span>}
      </div>
      <Sparkline values={trend} className="mt-auto h-12 w-full pt-3 text-neutral-800" />
    </div>
  );
}

/** The one bold card: Muse Spark's thinking, the plan taking shape, then the final plan. */
function PlanHero({ insights, thinking, plan }) {
  const p = plan?.plan;
  const reasoning = thinking?.text ? thinking.text.split(/\n\s*\n/).filter((s) => s.trim()) : [];
  return (
    <div
      className="relative flex min-w-0 flex-col overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground"
      style={{ '--think-base': '#8d8d8d', '--think-highlight': '#ffffff' }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-white/60">
        <span className="grid size-7 place-items-center rounded-lg bg-white/10 text-white">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        {p?.feasible ? "It's a plan" : p ? 'No plan yet' : insights ? 'Plan taking shape' : 'The plan'}
      </div>

      {/* Each state remounts its block so it rises in with the texts reveal. */}
      {p?.feasible ? (
        <Reveal key="plan" className="mt-3 min-w-0">
          <RevealLine n={1} as="p" className="truncate text-2xl font-bold tracking-tight">
            {p.title}
          </RevealLine>
          <RevealLine n={2} className="mt-2 space-y-1 text-sm text-white/80">
            <p className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-white/50" aria-hidden="true" /> {planWhen(p.date, p.start_time, p.end_time)}
            </p>
            <p className="flex items-center gap-2 truncate">
              <MapPin className="size-4 shrink-0 text-white/50" aria-hidden="true" /> {p.location || p.place_name}
            </p>
            {p.attendees.length > 0 && (
              <p className="flex items-center gap-2 truncate">
                <Users className="size-4 shrink-0 text-white/50" aria-hidden="true" /> {p.attendees.join(', ')}
              </p>
            )}
          </RevealLine>
        </Reveal>
      ) : insights ? (
        <Reveal key="shaping" className="mt-3 min-w-0">
          <RevealLine n={1} as="p" className="line-clamp-2 text-xl font-bold tracking-tight">
            <SoftText text={insights.summary.headline} />
          </RevealLine>
          {insights.summary.needs_input_from.length > 0 && (
            <RevealLine n={2} as="p" className="mt-1.5 text-sm text-white/60">
              Waiting on {insights.summary.needs_input_from.join(', ')}
            </RevealLine>
          )}
        </Reveal>
      ) : (
        <Reveal key="idle" className="mt-3">
          <RevealLine n={1} as="p" className="text-xl font-bold tracking-tight">
            Talk it through
          </RevealLine>
          <RevealLine n={2} as="p" className="mt-1.5 text-sm text-white/60">
            Muse Spark turns the call into one plan for everyone.
          </RevealLine>
        </Reveal>
      )}

      <div className="mt-auto pt-3">
        {thinking ? (
          <div className="text-sm" role="status">
            <ThinkingLine text={`Muse Spark is thinking · ${thinking.task}`} className="max-w-full font-medium" />
            <p className="mt-1 line-clamp-1 text-xs text-white/50 italic">
              {thinking.private ? (
                <span className="inline-flex items-center gap-1.5 not-italic">
                  <Lock className="size-3" aria-hidden="true" /> Reasoning hidden: private answers
                </span>
              ) : reasoning.length ? (
                <StreamText key={reasoning.length} text={reasoning.at(-1)} />
              ) : (
                'Reading the conversation…'
              )}
            </p>
          </div>
        ) : plan?.calendar ? (
          <Reveal key="cal">
            <RevealLine n={1}>
              <a
                href={plan.calendar.htmlLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-meta transition-colors hover:bg-white/90"
              >
                <SuccessCheck show style={{ '--check-y-amount': '8px' }} />
                On Google Calendar · {plan.calendar.invited.length} invited
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </RevealLine>
          </Reveal>
        ) : null}
      </div>
    </div>
  );
}

export function Overview({ finals, muse, insights, thinking, plan }) {
  const spoken = finals.filter((e) => e.userId !== 'orbit');
  const words = spoken.reduce((s, e) => s + wordsIn(e.text), 0);
  const avg = avgLatency(muse);
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr]">
      <StatTile
        icon={MessagesSquare}
        label="Conversation"
        value={finals.length}
        unit={finals.length === 1 ? 'line' : 'lines'}
        chip={`${words} words`}
        trend={spoken.slice(-16).map((e) => wordsIn(e.text))}
      />
      <StatTile
        icon={Sparkles}
        label="Meta AI calls"
        value={muse.length}
        chip={avg === null ? null : `${avg} ms avg`}
        trend={muse.filter((c) => c.ok && typeof c.ms === 'number').slice(-16).map((c) => c.ms)}
      />
      <div className="sm:col-span-2 xl:col-span-1 grid">
        <PlanHero insights={insights} thinking={thinking} plan={plan} />
      </div>
    </div>
  );
}
