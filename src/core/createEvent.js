import { insertEvent } from '../google/calendar.js';

/**
 * Core action: create_event (connector-ready: plain JSON in, JSON out).
 * Puts the resolved plan on the organizer's Google Calendar and emails invites.
 *
 * @param {object} args
 * @param {object} args.plan          Public plan from resolvePlan() (title, date, start_time, end_time, location, …)
 * @param {{ name: string, email: string }[]} args.attendees
 * @param {string} args.description   Public text only (the guarded announcement)
 * @param {string} args.timezone      IANA zone the plan's wall-clock times are in
 * @param {boolean} [args.sendInvites]
 * @returns {Promise<{ eventId: string, htmlLink: string, invited: string[], start: string, end: string }>}
 */
export async function createEvent({ plan, attendees, description, timezone, sendInvites = true }) {
  if (!plan.feasible) throw new Error("There's no workable plan to put on the calendar.");
  if (!plan.date || !plan.start_time) throw new Error('The plan has no date or start time yet.');
  const { start, end } = eventTimes(plan);

  const created = await insertEvent(
    {
      summary: plan.title,
      location: plan.location,
      description,
      start: { dateTime: start, timeZone: timezone },
      end: { dateTime: end, timeZone: timezone },
      attendees: attendees.map((a) => ({ email: a.email, displayName: a.name })),
      guestsCanSeeOtherGuests: false, // invitees don't see each other's email addresses
      guestsCanInviteOthers: false,
      reminders: { useDefault: true },
      source: { title: 'Planned with Orbit', url: 'https://github.com/Orbit-Meta/ORBIT' },
    },
    { sendInvites },
  );
  return { eventId: created.id, htmlLink: created.htmlLink, invited: attendees.map((a) => a.name), start, end };
}

/** Local wall-clock start/end; default length 2 h; an end before the start rolls to the next day. */
export function eventTimes({ date, start_time, end_time }) {
  const toMin = (hm) => {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = toMin(start_time);
  let endMin = end_time ? toMin(end_time) : startMin + 120;
  if (endMin <= startMin) endMin += 24 * 60;
  const stamp = (mins) => {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + Math.floor(mins / 1440));
    const m = mins % 1440;
    return `${day.toISOString().slice(0, 10)}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
  };
  return { start: stamp(startMin), end: stamp(endMin) };
}
