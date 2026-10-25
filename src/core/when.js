/** "2026-10-30", "18:00", "19:30" → "Friday, Oct 30 · 6:00–7:30 PM" (wall-clock time in the plan's time zone). */
export function formatWhen(date, start, end) {
  const day = date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : 'Date TBD';
  if (!start) return day;
  const [s, e] = [to12h(start), end ? to12h(end) : null];
  const range = e ? (s.ampm === e.ampm ? `${s.time}–${e.time} ${e.ampm}` : `${s.time} ${s.ampm}–${e.time} ${e.ampm}`) : `${s.time} ${s.ampm}`;
  return `${day} · ${range}`;
}

function to12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return { time: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, ampm: h < 12 ? 'AM' : 'PM' };
}
