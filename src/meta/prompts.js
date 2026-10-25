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

// ─── Private DM answers → structured constraints ────────────────────────────

export const CONSTRAINTS_INSTRUCTIONS = `You turn one person's PRIVATE answers (sent to Orbit by DM) into structured planning constraints.

You get the plan being discussed (public) and the person's answers. Answers are casual and may be blank.
- can_attend: false only if they clearly say they can't make it at all.
- availability: their availability in plain words. time_windows: the same as concrete windows. Resolve relative days against the current date provided. Use 24-hour "HH:MM", and "" for an open end (e.g. "after 6" → start "18:00", end "").
- budget: has_budget_limit true only if they gave a limit; max_per_person_usd is that number (0 if no limit).
- dietary_needs: each need or allergy as a short phrase ("vegetarian", "sesame allergy").
- preferred_options: options they prefer, using the option labels from the plan when they match.
- avoid: things they don't want.
- other_notes: anything else that matters for planning, briefly.
Never invent constraints that weren't stated.`;

export const CONSTRAINTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['can_attend', 'availability', 'time_windows', 'has_budget_limit', 'max_per_person_usd', 'dietary_needs', 'preferred_options', 'avoid', 'other_notes'],
  properties: {
    can_attend: { type: 'boolean' },
    availability: str('Availability in plain words, or ""'),
    time_windows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'start', 'end'],
        properties: { date: str('YYYY-MM-DD or ""'), start: str('HH:MM or ""'), end: str('HH:MM or ""') },
      },
    },
    has_budget_limit: { type: 'boolean' },
    max_per_person_usd: { type: 'number' },
    dietary_needs: strList('Dietary needs and allergies'),
    preferred_options: strList('Preferred options'),
    avoid: strList('Things to avoid'),
    other_notes: str('Other planning-relevant notes, or ""'),
  },
};

// ─── Resolve the final plan ─────────────────────────────────────────────────

export const RESOLVE_PLAN_INSTRUCTIONS = `You are Orbit. Pick ONE final plan for a group of friends that satisfies everyone's constraints, then write a short announcement for the group chat.

You get the public summary of the group's call and each person's PRIVATE constraints.

Choosing the plan:
- Pick a date and start time inside everyone's availability windows. If windows don't all overlap, maximize how many people can come.
- Pick the option that respects every dietary need and stays within the lowest stated budget. Prefer options people said they like.
- location: if a specific location was said in the call (e.g. "the Chipotle downtown"), use it exactly. Otherwise use the option name plus the default area provided (e.g. "Chipotle, Downtown").
- end_time: a reasonable end (about 1.5–2 hours for a meal) in 24-hour HH:MM.
- feasible: false only if no plan works for most people; then explain neutrally in public_message.

public_message (posted in the GROUP chat), the most important rule:
- Announce the plan warmly in 1–3 short sentences. You may say who is coming.
- NEVER mention or hint at anyone's budget, prices, money, dietary needs, allergies, health, or private notes, and never say WHY an option or time was chosen if the reason came from a private constraint. "Chipotle works for everyone" is fine; "Chipotle because it's cheap / has vegetarian options / fits Sam's budget" is NOT.

private_rationale: your actual reasoning, including constraints. It is stored privately and never shown to the group.`;

export const RESOLVE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['feasible', 'title', 'choice', 'place_name', 'location', 'date', 'start_time', 'end_time', 'attendees', 'not_attending', 'public_message', 'private_rationale'],
  properties: {
    feasible: { type: 'boolean' },
    title: str('Short event title, e.g. "Chipotle hangout"'),
    choice: str('The option picked, matching an option label when possible'),
    place_name: str('Name of the place, e.g. "Chipotle"'),
    location: str('Where: specific location from the call, or "<place>, <default area>"'),
    date: str('YYYY-MM-DD'),
    start_time: str('HH:MM, 24-hour'),
    end_time: str('HH:MM, 24-hour'),
    attendees: strList('Names of people coming'),
    not_attending: strList("Names of people who can't come"),
    public_message: str('Neutral announcement for the group chat'),
    private_rationale: str('Reasoning including private constraints (kept private)'),
  },
};
