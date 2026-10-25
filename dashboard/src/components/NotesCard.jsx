import { CalendarDays, CircleHelp, Clock, ExternalLink, Lock, MapPin, Sparkles, Ticket, Users, Utensils } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Reveal, RevealLine, SoftText, StreamText, SuccessCheck, SwapText, ThinkingLine, usePresence } from '@/components/motion';
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

/** Panel reveal in, shimmering status line (thinking states), reasoning words stream in. */
function Thinking({ thinking }) {
  const { ref, mounted, open, value } = usePresence(thinking);
  if (!mounted) return null;
  const paragraphs = value.text ? value.text.split(/\n\s*\n/).filter((p) => p.trim()) : [];
  const latest = paragraphs.at(-1) ?? '';
  return (
    <div ref={ref} className="t-panel-slide rounded-lg border bg-muted/60 p-3" data-open={open} style={{ '--panel-translate-y': '8px' }}>
      <div className="flex items-center gap-2 text-sm font-medium" role="status">
        <ThinkingLine text={`Muse Spark is thinking · ${value.task}`} />
      </div>
      <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground italic">
        {value.private ? (
          <span className="inline-flex items-center gap-1.5 not-italic">
            <Lock className="size-3.5" aria-hidden="true" /> Reasoning hidden: this step uses private answers.
          </span>
        ) : latest ? (
          <StreamText key={paragraphs.length} text={latest} />
        ) : (
          'Reading the conversation…'
        )}
      </p>
    </div>
  );
}

/** The final plan slides into the card (panel reveal); the calendar confirmation draws a check. */
function PlanBanner({ plan }) {
  const { ref, mounted, open, value } = usePresence(plan);
  if (!mounted) return null;
  const p = value.plan;
  if (!p.feasible) {
    return (
      <div ref={ref} className="t-panel-slide rounded-xl border p-4" data-open={open} style={{ '--panel-translate-y': '16px' }}>
        <p className="font-semibold">Couldn't lock in a plan yet</p>
        <p className="mt-1 text-sm text-muted-foreground">{value.publicMessage}</p>
      </div>
    );
  }
  return (
    <div ref={ref} className="t-panel-slide rounded-xl bg-primary p-5 text-primary-foreground" data-open={open} style={{ '--panel-translate-y': '16px' }}>
      <p className="text-xs font-medium tracking-wide text-white/60 uppercase">It's a plan</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{p.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/85">{value.publicMessage}</p>
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
      {value.calendar && (
        <Reveal>
          <RevealLine n={1}>
            <a
              href={value.calendar.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-meta transition-colors hover:bg-white/90"
            >
              <SuccessCheck show style={{ '--check-y-amount': '8px' }} />
              On Google Calendar · {value.calendar.invited.length} invited <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </RevealLine>
        </Reveal>
      )}
    </div>
  );
}

/** Status labels swap in place; a reply draws a check (success check). Never shows what anyone said. */
function CheckIns({ round }) {
  const label = { replied: 'Replied privately', waiting: 'Waiting', unreachable: "Couldn't DM" };
  return (
    <Section title="Private check-ins">
      <ul className="space-y-1.5">
        {round.invited.map((p) => (
          <Reveal as="li" key={p.name}>
            <RevealLine n={1} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{p.name}</span>
              <Badge variant={p.status === 'replied' ? 'default' : p.status === 'unreachable' ? 'destructive' : 'outline'} className="gap-1">
                {p.status === 'replied' && <SuccessCheck show style={{ '--check-y-amount': '6px' }} />}
                <SwapText text={label[p.status]} />
              </Badge>
            </RevealLine>
          </Reveal>
        ))}
        {(round.unregistered ?? []).map((n) => (
          <Reveal as="li" key={n}>
            <RevealLine n={1} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{n}</span>
              <Badge variant="outline">Not in the crew yet</Badge>
            </RevealLine>
          </Reveal>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden="true" /> Only Orbit sees what people answered.
      </p>
    </Section>
  );
}

/** Values that change cross-blur in place (text swap soft); new items rise in (texts reveal). */
function Notes({ summary }) {
  const day = summary.proposed_day;
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xl font-semibold tracking-tight">
          <SoftText text={summary.headline} />
        </p>
        {(day.label || day.date) && (
          <Badge variant="secondary" className="gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <SoftText text={[day.label, day.date && planWhen(day.date)].filter(Boolean).join(' · ')} />
          </Badge>
        )}
      </div>

      {summary.people.length > 0 && (
        <Section title="Who's free">
          <ul className="space-y-2">
            {summary.people.map((p) => (
              <Reveal as="li" key={p.name} className="text-sm">
                <RevealLine n={1} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{p.name}</span>
                  {p.availability ? <SoftText text={p.availability} /> : <span className="text-muted-foreground">not sure yet</span>}
                  {!p.in_call && (
                    <Badge variant="outline" className="text-[11px]">
                      Missed the call
                    </Badge>
                  )}
                </RevealLine>
                {p.notes && (
                  <RevealLine n={2} as="p" className="text-muted-foreground">
                    <SoftText text={p.notes} />
                  </RevealLine>
                )}
              </Reveal>
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
                <Reveal key={o.label}>
                  <RevealLine n={1}>
                    <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1 text-sm font-normal">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {o.label}
                      {o.location && <span className="text-muted-foreground">· {o.location}</span>}
                    </Badge>
                  </RevealLine>
                </Reveal>
              );
            })}
          </div>
        </Section>
      )}

      {summary.decisions.length > 0 && (
        <Section title="Decided">
          <ul className="space-y-1.5">
            {summary.decisions.map((d) => (
              <Reveal as="li" key={d}>
                <RevealLine n={1} className="flex gap-2 text-sm">
                  <SuccessCheck show className="mt-0.5 shrink-0" style={{ '--check-y-amount': '6px' }} /> {d}
                </RevealLine>
              </Reveal>
            ))}
          </ul>
        </Section>
      )}

      {summary.open_questions.length > 0 && (
        <Section title="Still open">
          <ul className="space-y-1.5">
            {summary.open_questions.map((q) => (
              <Reveal as="li" key={q}>
                <RevealLine n={1} className="flex gap-2 text-sm">
                  <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> {q}
                </RevealLine>
              </Reveal>
            ))}
          </ul>
        </Section>
      )}

      {summary.needs_input_from.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Waiting on <SoftText className="font-medium text-foreground" text={summary.needs_input_from.join(', ')} />
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
          <SoftText text={insights ? `${insights.final ? 'Final recap' : 'Updated live'} · ${clockTime(insights.at)}` : 'The plan, as it takes shape'} />
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full">
          <div className="space-y-5 p-6">
            <Thinking thinking={thinking} />
            <PlanBanner plan={plan} />
            {insights && <Notes summary={insights.summary} />}
            {round && (
              <>
                <Separator />
                <CheckIns round={round} />
              </>
            )}
            {empty && (
              <Reveal className="py-10 text-center">
                <RevealLine n={1} as="p" className="text-sm text-muted-foreground">
                  The plan shows up here as it takes shape.
                </RevealLine>
              </Reveal>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
