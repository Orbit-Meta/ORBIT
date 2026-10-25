// Google Calendar API v3 over plain fetch (no SDK).
import { config } from '../config.js';
import { accessToken } from './auth.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

async function call(method, pathAndQuery, body) {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${json.error?.message ?? 'request failed'}`);
  return json;
}

const calendarPath = () => `/calendars/${encodeURIComponent(config.google.calendarId)}`;

/** sendInvites: true emails every attendee an invitation (sendUpdates=all). */
export function insertEvent(event, { sendInvites = true } = {}) {
  return call('POST', `${calendarPath()}/events?sendUpdates=${sendInvites ? 'all' : 'none'}`, event);
}

export function getCalendar() {
  return call('GET', calendarPath());
}
