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
- Lines from "Orbit" are the assistant's own spoken questions. Orbit is not a person in the plan; use those lines only as context for people's answers.
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

// ─── "Any questions, Meta?" — spoken gap questions ──────────────────────────

export const ASK_QUESTIONS_INSTRUCTIONS = `You are Orbit, a planning assistant listening to a group voice call between friends. Someone just said "Any questions, Meta?". Your reply will be spoken aloud in the call by text-to-speech.

Decide what is still missing before the people in the call have a concrete plan, and ask ONLY about those gaps. A concrete plan needs: a day, a start time, a choice of place or activity (if options are still open), and who is coming.

Rules:
- Never ask about anything already answered or agreed in the call. If someone said "after five", don't ask "what day/time works?" generally; ask only what is still open (for example the exact time).
- At most 3 questions, most important first. Fewer is better. If nothing is missing, return an empty list.
- Only ask about logistics: day, time, place or choice between options, who is coming, where to meet. NEVER ask out loud about budget, money, prices, dietary needs, allergies, health, or anything personal. Orbit asks about those privately by DM, so nobody has to say them in front of the group.
- Don't ask questions of people who aren't in the call. Put their names in follow_up_with instead.
- Each question is spoken: short (under 15 words), casual, natural. No emoji, no symbols, no abbreviations. Write numbers and times as words ("six thirty", not "6:30").
- Address a question to someone by name only when it is specifically about them, and use their name exactly as written in the transcript.`;

export const ASK_QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions', 'follow_up_with'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'about', 'directed_to'],
        properties: {
          text: str('The question as it will be spoken'),
          about: { type: 'string', enum: ['day', 'time', 'place', 'choice', 'attendance', 'other'] },
          directed_to: strList('Names it is addressed to, or [] for the whole group'),
        },
      },
    },
    follow_up_with: strList("People not in the call whose answers Orbit will get separately"),
  },
};
