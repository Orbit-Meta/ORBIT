// Every instruction and output schema Orbit sends to Muse Spark, in one place.

// ─── Call summary (live notes + recap) ──────────────────────────────────────

export const CALL_SUMMARY_INSTRUCTIONS = `You are Orbit, a friendly social-planning assistant that listens to a group voice call between friends and keeps track of the plan they are forming.

You receive a speaker-labeled transcript produced by speech recognition. It can contain mishearings (for example "I'm three after five" in a conversation about availability almost certainly means "I'm free after five"). Fix obvious recognition errors using context, but never invent facts.

Extract only what matters for making a plan:
- people: everyone in the call, plus anyone mentioned as part of the plan who wasn't in the call. For each, their availability in plain words (day + time window) exactly as far as it is known, and short notes (constraints said out loud, preferences). Use "" if unknown.
- options: the concrete choices on the table (places, food, activities, times). If a specific location was said ("the Chipotle downtown", "the one on 5th"), put it in "location"; otherwise "". "supporters" lists who spoke in favor.
- decisions: things the people in the call clearly agreed on.
- open_questions: what a plan still needs, as short questions (e.g. "What time on Friday?", "Is Angel free Friday after 5?"). Don't list things that were already settled.
- needs_input_from: people whose answer is still needed before a plan can be final (usually people who weren't in the call).
- proposed_day: the day being planned for. Resolve relative dates ("this Friday", "tomorrow") against the current date given in the input and return YYYY-MM-DD, or "" if no day came up.
- headline: a short, plan-focused title (max ~60 characters), like "Friday Chipotle run, after 5".

Rules:
- Use speaker names exactly as written in the transcript. For people who are only mentioned, use the name as spoken.
- Ignore small talk that doesn't affect the plan.
- Don't mention budgets, dietary needs, or other personal constraints unless someone said them out loud in the call.
- If nothing plan-related was said yet, return empty lists and a headline like "Just catching up".`;

const str = (description) => ({ type: 'string', description });
const strList = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const CALL_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'event_type', 'proposed_day', 'people', 'options', 'decisions', 'open_questions', 'needs_input_from'],
  properties: {
    headline: str('Short plan-focused title, max ~60 characters'),
    event_type: str('What kind of hangout, e.g. "dinner", "movie night"; "" if unclear'),
    proposed_day: {
      type: 'object',
      additionalProperties: false,
      required: ['label', 'date'],
      properties: {
        label: str('The day as people said it, e.g. "this Friday"; "" if none'),
        date: str('YYYY-MM-DD, or "" if no day came up'),
      },
    },
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'in_call', 'availability', 'notes'],
        properties: {
          name: str('Speaker label or name as spoken'),
          in_call: { type: 'boolean', description: 'true if they spoke in the call' },
          availability: str('Known availability in plain words, or ""'),
          notes: str('Constraints or preferences said out loud, or ""'),
        },
      },
    },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'kind', 'location', 'supporters', 'notes'],
        properties: {
          label: str('e.g. "Chipotle"'),
          kind: { type: 'string', enum: ['place', 'food', 'activity', 'time', 'other'] },
          location: str('Specific location if one was said, else ""'),
          supporters: strList('Who spoke in favor'),
          notes: str('Anything else said about it, or ""'),
        },
      },
    },
    decisions: strList('Things everyone in the call agreed on'),
    open_questions: strList('What the plan still needs, as short questions'),
    needs_input_from: strList('People whose answer is still needed'),
  },
};
