import { reason } from '../meta/muse.js';
import { ASK_QUESTIONS_INSTRUCTIONS, ASK_QUESTIONS_SCHEMA } from '../meta/prompts.js';

// Zero-ego guard, enforced in code on top of the prompt: these topics are never asked out loud.
const PRIVATE_TOPICS = /\b(budget|money|cash|price|prices|pricey|cost|costs|expensive|cheap|afford|pay|paying|dollars?|diet|dietary|vegan|vegetarian|allerg\w*|gluten|halal|kosher|lactose|health|medical)\b/i;
const DM_PROMISE = "I'll DM each of you privately about food preferences and budget.";

/**
 * Core action: ask_questions (connector-ready: plain JSON in, JSON out).
 * Finds only what the plan is still missing and phrases it to be spoken aloud.
 *
 * @param {object} args
 * @param {{speaker: string, text: string}[]} args.lines  Transcript so far
 * @param {string[]} args.inCall
 * @param {string[]} [args.absent]
 * @param {object|null} [args.notes]  Latest call summary, if any (CALL_SUMMARY_SCHEMA)
 * @param {(text: string) => void} [args.onReasoning]
 * @returns {Promise<{ questions: {text, about, directed_to}[], followUpWith: string[], dropped: string[], spokenText: string }>}
 */
export async function askQuestions({ lines, inCall, absent = [], notes = null, onReasoning }) {
  const input = [
    `People in the call: ${inCall.join(', ')}`,
    `Crew members NOT in the call: ${absent.join(', ') || 'none registered'}`,
    notes ? `\nCurrent notes on the plan (JSON):\n${JSON.stringify(notes)}` : '',
    '',
    'Transcript:',
    ...lines.map((l) => `${l.speaker}: ${l.text}`),
  ].join('\n');

  const { data } = await reason({
    task: 'questions',
    instructions: ASK_QUESTIONS_INSTRUCTIONS,
    input,
    schema: ASK_QUESTIONS_SCHEMA,
    schemaName: 'gap_questions',
    effort: 'low', // people are waiting in the call
    onReasoning,
  });

  const questions = data.questions
    .filter((q) => !PRIVATE_TOPICS.test(q.text))
    .slice(0, 3)
    .map((q) => ({ ...q, text: /[.?!]$/.test(q.text.trim()) ? q.text.trim() : `${q.text.trim()}?` })); // so TTS pauses between them
  const dropped = data.questions.filter((q) => PRIVATE_TOPICS.test(q.text)).map((q) => q.text);
  const followUpWith = data.follow_up_with;

  const parts = [];
  if (questions.length === 0) parts.push("Nope, I think you've covered everything I need.");
  else parts.push(questions.length === 1 ? 'Just one question.' : 'A couple of quick questions.', ...questions.map((q) => q.text));
  if (followUpWith.length) parts.push(`I'll check with ${joinNames(followUpWith)} separately.`);
  parts.push(DM_PROMISE);

  return { questions, followUpWith, dropped, spokenText: parts.join(' ') };
}

function joinNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
