export function clockTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/** "2026-10-30", "18:30", "20:00" → "Friday, Oct 30 · 6:30–8:00 PM" (plan times are wall-clock in the bot's TIMEZONE). */
export function planWhen(date, start, end) {
  const day = date ? new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) : '';
  if (!start) return day;
  const to12 = (hm) => {
    const [h, m] = hm.split(':').map(Number);
    return { t: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, ap: h < 12 ? 'AM' : 'PM' };
  };
  const s = to12(start);
  const e = end ? to12(end) : null;
  const range = e ? (s.ap === e.ap ? `${s.t}–${e.t} ${e.ap}` : `${s.t} ${s.ap}–${e.t} ${e.ap}`) : `${s.t} ${s.ap}`;
  return [day, range].filter(Boolean).join(' · ');
}

export function initials(name = '?') {
  const parts = [...name.trim()].length ? name.trim().split(/\s+/) : ['?'];
  return parts.slice(0, 2).map((p) => [...p][0]?.toUpperCase() ?? '').join('') || '?';
}
