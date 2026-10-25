import {
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Sparkles,
  Ticket,
  Users,
  Utensils,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { clockTime, planWhen } from '@/lib/format';

const KIND_ICON = { place: MapPin, food: Utensils, activity: Ticket, time: Clock, other: Sparkles };

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Thinking({ thinking }) {
  if (!thinking) return null;
  const lines = thinking.text ? thinking.text.split('\n').filter(Boolean).slice(-3).join(' ') : 'Reading the conversation…';
  return (
    <div className="rounded-lg border bg-muted/60 p-3" role="status" aria-atomic="true">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Muse Spark is thinking
        <span className="font-normal text-muted-foreground">· {thinking.task}</span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground italic">
        {thinking.private ? (
          <span className="inline-flex items-center gap-1.5 not-italic">
            <Lock className="size-3.5" aria-hidden="true" /> Reasoning hidden: this step uses private answers.
          </span>
        ) : (
          lines
        )}
      </p>
    </div>
  );
}

/** The final plan: inverted black card, the one loud element on the screen. */
function PlanBanner({ plan }) {
  const p = plan.plan;
  if (!p.feasible) {
    return (
      <div className="rounded-xl border p-4">
        <p className="font-semibold">Couldn't lock in a plan yet</p>
        <p className="mt-1 text-sm text-muted-foreground">{plan.publicMessage}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-primary p-5 text-primary-foreground">
      <p className="text-xs font-medium tracking-wide text-white/60 uppercase">It's a plan</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{p.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/85">{plan.publicMessage}</p>
      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-white/60" aria-hidden="true" />
          <dt className="sr-only">When</dt>
          <dd>{planWhen(p.date, p.start_time, p.end_time)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-white/60" aria-hidden="true" />
          <dt className="sr-only">Where</dt>
          <dd>{p.location || p.place_name}</dd>
        </div>
        {p.attendees.length > 0 && (
          <div className="flex items-center gap-2">
            <Users className="size-4 text-white/60" aria-hidden="true" />
            <dt className="sr-only">Who</dt>
            <dd>{p.attendees.join(', ')}</dd>
          </div>
        )}
      </dl>
      {plan.calendar && (
        <a
          href={plan.calendar.htmlLink}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-meta transition-colors hover:bg-white/90"
        >
          On Google Calendar · {plan.calendar.invited.length} invited <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function CheckIns({ round }) {
  const label = { replied: 'Replied privately', waiting: 'Waiting', unreachable: "Couldn't DM" };
  return (
    <Section title="Private check-ins">
      <ul className="space-y-1.5">
        {round.invited.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{p.name}</span>
            <Badge variant={p.status === 'replied' ? 'default' : p.status === 'unreachable' ? 'destructive' : 'outline'} className="gap-1">
              {p.status === 'replied' && <Lock className="size-3" aria-hidden="true" />}
              {label[p.status]}
            </Badge>
          </li>
        ))}
        {(round.unregistered ?? []).map((n) => (
          <li key={n} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{n}</span>
            <Badge variant="outline">Not in the crew yet</Badge>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden="true" /> Only Orbit sees what people answered.
      </p>
    </Section>
  );
}

function Notes({ summary }) {
  const day = summary.proposed_day;
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xl font-semibold tracking-tight">{summary.headline}</p>
        {(day.label || day.date) && (
          <Badge variant="secondary" className="gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {[day.label, day.date && planWhen(day.date)].filter(Boolean).join(' · ')}
          </Badge>
        )}
      </div>

      {summary.people.length > 0 && (
        <Section title="Who's free">
          <ul className="space-y-2">
            {summary.people.map((p) => (
              <li key={p.name} className="text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{p.name}</span>
                  <span>{p.availability || <span className="text-muted-foreground">not sure yet</span>}</span>
                  {!p.in_call && (
                    <Badge variant="outline" className="text-[11px]">
                      Missed the call
                    </Badge>
                  )}
                </div>
                {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.options.length > 0 && (
        <Section title="Options">
          <div className="flex flex-wrap gap-2">
            {summary.options.map((o) => {
              const Icon = KIND_ICON[o.kind] ?? Sparkles;
              return (
                <Badge key={o.label} variant="outline" className="gap-1.5 rounded-full px-3 py-1 text-sm font-normal">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {o.label}
                  {o.location && <span className="text-muted-foreground">· {o.location}</span>}
                </Badge>
              );
            })}
          </div>
        </Section>
      )}

      {summary.decisions.length > 0 && (
        <Section title="Decided">
          <ul className="space-y-1.5">
            {summary.decisions.map((d) => (
              <li key={d} className="flex gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {d}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.open_questions.length > 0 && (
        <Section title="Still open">
          <ul className="space-y-1.5">
            {summary.open_questions.map((q) => (
              <li key={q} className="flex gap-2 text-sm">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> {q}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.needs_input_from.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Waiting on <span className="font-medium text-foreground">{summary.needs_input_from.join(', ')}</span>
        </p>
      )}
    </div>
  );
}

export function NotesCard({ insights, thinking, round, plan }) {
  const empty = !insights && !plan && !round && !thinking;
  return (
    <Card className="min-h-0 gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Muse Spark notes</CardTitle>
        <CardDescription>
          {insights ? `${insights.final ? 'Final recap' : 'Updated live'} · ${clockTime(insights.at)}` : 'The plan, as it takes shape'}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-6">
            <Thinking thinking={thinking} />
            {plan && <PlanBanner plan={plan} />}
            {insights && <Notes summary={insights.summary} />}
            {round && (
              <>
                <Separator />
                <CheckIns round={round} />
              </>
            )}
            {empty && <p className="py-10 text-center text-sm text-muted-foreground">The plan shows up here as it takes shape.</p>}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
