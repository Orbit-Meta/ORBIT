import { CalendarDays, CircleHelp, Clock, Lock, MapPin, Sparkles, Ticket, Utensils } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Reveal, RevealLine, SoftText, SuccessCheck, SwapText } from '@/components/motion';
import { clockTime, planWhen } from '@/lib/format';

// The plan itself and Muse Spark's live thinking live in the hero card (Overview.jsx).

const KIND_ICON = { place: MapPin, food: Utensils, activity: Ticket, time: Clock, other: Sparkles };

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Status labels swap in place; a reply draws a check (success check). Never shows what anyone said. */
function CheckIns({ round }) {
  const label = { replied: 'Replied privately', waiting: 'Waiting', unreachable: "Couldn't DM" };
  return (
    <Section title="Private check-ins">
      <ul className="space-y-2">
        {round.invited.map((p) => (
          <Reveal as="li" key={p.name}>
            <RevealLine n={1} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{p.name}</span>
              <Badge variant={p.status === 'replied' ? 'default' : p.status === 'unreachable' ? 'destructive' : 'outline'} className="gap-1 rounded-full px-2.5">
                {p.status === 'replied' && <SuccessCheck show style={{ '--check-y-amount': '6px' }} />}
                <SwapText text={label[p.status]} />
              </Badge>
            </RevealLine>
          </Reveal>
        ))}
        {(round.unregistered ?? []).map((n) => (
          <Reveal as="li" key={n}>
            <RevealLine n={1} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{n}</span>
              <Badge variant="outline" className="rounded-full px-2.5">
                Not in the crew yet
              </Badge>
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
    <div className="space-y-6">
      {(day.label || day.date) && (
        <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <SoftText text={[day.label, day.date && planWhen(day.date)].filter(Boolean).join(' · ')} />
        </Badge>
      )}

      {summary.people.length > 0 && (
        <Section title="Who's free">
          <ul className="space-y-2.5">
            {summary.people.map((p) => (
              <Reveal as="li" key={p.name} className="text-sm">
                <RevealLine n={1} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{p.name}</span>
                  {p.availability ? <SoftText text={p.availability} /> : <span className="text-muted-foreground">not sure yet</span>}
                  {!p.in_call && (
                    <Badge variant="outline" className="rounded-full text-[11px]">
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
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {o.label}
                      {o.location && <span className="font-normal text-muted-foreground">· {o.location}</span>}
                    </span>
                  </RevealLine>
                </Reveal>
              );
            })}
          </div>
        </Section>
      )}

      {summary.decisions.length > 0 && (
        <Section title="Decided">
          <ul className="space-y-2">
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
          <ul className="space-y-2">
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
    </div>
  );
}

export function NotesCard({ insights, round }) {
  const empty = !insights && !round;
  return (
    <Card className="min-h-0 gap-0 rounded-3xl border-0 py-0 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <CardHeader className="px-7 pt-6 pb-3">
        <CardTitle className="text-lg tracking-tight">Muse Spark notes</CardTitle>
        <CardDescription>
          <SoftText text={insights ? `${insights.final ? 'Final recap' : 'Updated live'} · ${clockTime(insights.at)}` : 'What the call has settled so far'} />
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full">
          <div className="space-y-6 px-7 pt-2 pb-7">
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
                  Notes show up here as the plan takes shape.
                </RevealLine>
              </Reveal>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
