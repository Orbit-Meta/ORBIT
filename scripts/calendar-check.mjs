// Creates one test event tomorrow 6–7 PM on the organizer's calendar, with NO invites:
//   npm run google:test
// Use it to confirm the Calendar connection before a demo. Delete the event afterward.
const { config } = await import('../src/config.js');
const { isCalendarConnected } = await import('../src/google/auth.js');
const { createEvent } = await import('../src/core/createEvent.js');

if (!isCalendarConnected()) {
  console.error('❌ Google Calendar is not connected. Run `npm run google:auth` first.');
  process.exit(1);
}
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: config.timezone }); // YYYY-MM-DD
const plan = { feasible: true, title: 'Orbit test event (safe to delete)', date: tomorrow, start_time: '18:00', end_time: '19:00', location: `Chipotle, ${config.defaultArea}` };
const r = await createEvent({ plan, attendees: [], description: 'Created by `npm run google:test` to check the Orbit ↔ Google Calendar connection.', timezone: config.timezone, sendInvites: false });
console.log(`✅ Created "${plan.title}" for ${r.start} → ${r.end} (${config.timezone})`);
console.log(`   ${r.htmlLink}`);
