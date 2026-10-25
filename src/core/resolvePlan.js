import { reason } from '../meta/muse.js';
import { RESOLVE_PLAN_INSTRUCTIONS, RESOLVE_PLAN_SCHEMA } from '../meta/prompts.js';
import { findLeaks, privateTerms } from './privacyGuard.js';
import { formatWhen } from './when.js';

/**
 * Core action: resolve_plan (connector-ready: plain JSON in, JSON out).
 * Muse Spark picks one plan that satisfies everyone's private constraints. Everything it
 * writes for the group then goes through a code-level leak check before it is returned.
 *
 * @param {object} args
 * @param {object} args.summary      Public call summary (CALL_SUMMARY_SCHEMA)
 * @param {{ name: string, constraints: object, raw?: object }[]} args.people  PRIVATE constraints per person
 * @param {string[]} [args.noReply]  Invited people who didn't answer (use their public availability only)
 * @param {string} args.publicText   Everything said out loud (the transcript); terms in it aren't private
 * @param {string} args.timezone
 * @param {string} args.defaultArea  Used as the location when no specific place was said
 * @param {Date}   [args.now]
 * @returns {Promise<{ plan: object, publicMessage: string, privateRationale: string, blockedLeaks: string[] }>}
 *   `plan` and `publicMessage` are safe for the group; `privateRationale` is not.
 */
export async function resolvePlan({ summary, people, noReply = [], publicText, timezone, defaultArea, now = new Date() }) {
  const today = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const input = [
    `Current date: ${today} (${timezone})`,
    `Default area for locations: ${defaultArea}`,
    '',
    'Public summary of the call (JSON):',
    JSON.stringify(summary),
    '',
    'PRIVATE constraints per person (JSON, never reveal in public_message):',
    JSON.stringify(people.map((p) => ({ name: p.name, ...p.constraints }))),
    '',
    `Invited but didn't reply privately (use only what the public summary says about them): ${noReply.join(', ') || 'nobody'}`,
  ].join('\n');

  const { data } = await reason({
    task: 'resolve plan',
    instructions: RESOLVE_PLAN_INSTRUCTIONS,
    input,
    schema: RESOLVE_PLAN_SCHEMA,
    schemaName: 'final_plan',
    effort: 'medium',
    // No onReasoning: the reasoning summary would mention private constraints.
  });

  // ── Leak guard: anything private that wasn't said in the call must not reach the group ──
  const terms = privateTerms(
    people.flatMap((p) => [JSON.stringify(p.constraints), ...Object.values(p.raw ?? {})]),
    `${publicText}\n${JSON.stringify(summary)}`,
  );
  const blockedLeaks = [];
  const guard = (text, fallback) => {
    const leaks = findLeaks(text, terms);
    if (!leaks.length) return text;
    blockedLeaks.push(...leaks);
    return fallback;
  };

  const plan = {
    feasible: data.feasible,
    choice: data.choice,
    place_name: data.place_name,
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    attendees: data.attendees,
    not_attending: data.not_attending,
  };
  plan.title = guard(data.title, `${data.place_name} hangout`);
  plan.location = guard(data.location || `${data.place_name}, ${defaultArea}`, `${data.place_name}, ${defaultArea}`);

  const template = data.feasible
    ? `We're on: ${plan.place_name} (${plan.location}), ${formatWhen(plan.date, plan.start_time, plan.end_time)}.${plan.attendees.length ? ` See you there, ${plan.attendees.join(', ')}!` : ''}`
    : "I couldn't find a time and place that works for everyone yet. Let's try another day.";
  const publicMessage = guard(data.public_message, template);

  return { plan, publicMessage, privateRationale: data.private_rationale, blockedLeaks: [...new Set(blockedLeaks)] };
}
