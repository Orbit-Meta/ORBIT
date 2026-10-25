import { reason } from '../meta/muse.js';
import { CALL_SUMMARY_INSTRUCTIONS, CALL_SUMMARY_SCHEMA } from '../meta/prompts.js';

/**
 * Core action: summarize_call (connector-ready: plain JSON in, JSON out).
 *
 * @param {object}   args
 * @param {{speaker: string, text: string, startedAt: string}[]} args.lines  Speaker-labeled transcript
 * @param {string[]} args.inCall      Names of people in the call
 * @param {string[]} [args.absent]    Crew members who were not in the call
 * @param {string}   args.timezone    IANA time zone, used to resolve "this Friday"
 * @param {Date}     [args.now]
 * @param {'live'|'recap'} [args.purpose]  live = fast notes during the call; recap = final summary
 * @param {(text: string) => void} [args.onReasoning]  Muse Spark's reasoning summary as it streams
 * @returns {Promise<object>} Matches CALL_SUMMARY_SCHEMA
 */
export async function summarizeCall({ lines, inCall, absent = [], timezone, now = new Date(), purpose = 'recap', onReasoning }) {
  const when = now.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: timezone, hour12: false });

  const input = [
    `Current date and time: ${when} (${timezone})`,
    `People in the call: ${inCall.join(', ') || 'unknown'}`,
    `Crew members NOT in the call: ${absent.join(', ') || 'none registered'}`,
    '',
    'Transcript:',
    ...lines.map((l) => `[${time(l.startedAt)}] ${l.speaker}: ${l.text}`),
  ].join('\n');

  const { data } = await reason({
    task: purpose === 'live' ? 'live notes' : 'call recap',
    instructions: CALL_SUMMARY_INSTRUCTIONS,
    input,
    schema: CALL_SUMMARY_SCHEMA,
    schemaName: 'call_summary',
    effort: purpose === 'live' ? 'low' : 'medium',
    onReasoning,
  });
  return data;
}
