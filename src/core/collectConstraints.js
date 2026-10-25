import { reason } from '../meta/muse.js';
import { CONSTRAINTS_INSTRUCTIONS, CONSTRAINTS_SCHEMA } from '../meta/prompts.js';

/**
 * Core action: collect_constraints (connector-ready: plain JSON in, JSON out).
 * Turns one person's PRIVATE DM answers into structured constraints.
 * Muse Spark's reasoning is deliberately not streamed anywhere: it could quote private answers.
 *
 * @param {object} args
 * @param {string} args.person
 * @param {{ preference: string, availability: string, budget: string, dietary: string, other: string }} args.answers
 * @param {object} args.summary   Public call summary (CALL_SUMMARY_SCHEMA)
 * @param {string} args.timezone
 * @param {Date}   [args.now]
 * @returns {Promise<object>} Matches CONSTRAINTS_SCHEMA
 */
export async function collectConstraints({ person, answers, summary, timezone, now = new Date() }) {
  const today = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const input = [
    `Current date: ${today} (${timezone})`,
    `Plan being discussed (public): ${summary.headline}; day: ${summary.proposed_day.label || '?'} ${summary.proposed_day.date}`,
    `Options: ${summary.options.map((o) => o.label + (o.location ? ` (${o.location})` : '')).join(', ') || 'none yet'}`,
    '',
    `${person}'s private answers:`,
    `- Preferred option: ${answers.preference || '(blank)'}`,
    `- When they're free: ${answers.availability || '(blank)'}`,
    `- Budget: ${answers.budget || '(blank)'}`,
    `- Dietary needs / allergies: ${answers.dietary || '(blank)'}`,
    `- Anything else: ${answers.other || '(blank)'}`,
  ].join('\n');

  const { data } = await reason({
    task: 'private answers',
    instructions: CONSTRAINTS_INSTRUCTIONS,
    input,
    schema: CONSTRAINTS_SCHEMA,
    schemaName: 'private_constraints',
    effort: 'low',
  });
  return data;
}
