# Orbit — Progress

| Phase | Status |
|---|---|
| 0. Plan & verify | ✅ Done |
| 1. Bot skeleton + **voice receive spike** + crew self-registration | ✅ Done; verified live by Sasha |
| 2. Voice capture + Muse Voice Transcribe + live screen (transcript) | ✅ Done; live call produced an accurate 13-line, speaker-labeled transcript |
| 3. Muse Spark summary + live screen (rolling insights, reasoning) | ✅ Done |
| 3b. "Any questions, Meta?" spoken gap questions | ✅ Done |
| 4. Private constraints + plan resolution | ✅ Done |
| 5. Google Calendar | 🧪 Code complete and tested with Google traffic intercepted; waiting for you to run `npm run google:auth` and test live |
| 6. Demo hardening | ⏳ Not started |

## Decisions
- **Runtime:** Node.js v24.21.0, npm 11.19.0.
- **Discord libraries:** discord.js 14.27.0 and @discordjs/voice 0.19.2. DAVE is handled by @snazzah/davey 0.1.12. Opus decoding uses opusscript.
- **Voice receive spike:** moved into Phase 1 (approved). If receive fails under DAVE, the fallback is a Stage channel (approved).
- **Location:** use the specific place if one was said in the call (e.g. "the Chipotle on 5th"). Otherwise use the option name plus `DEFAULT_AREA` (e.g. "Chipotle – Downtown").
- **Meta API:** `https://api.meta.ai/v1`, Bearer `MODEL_API_KEY`.
- **Transcription:** realtime Muse Voice Transcribe, one session per utterance per speaker. Discord gives 48 kHz stereo; we downmix and resample to 24 kHz mono PCM16. Discord already separates speakers, so we don't need DIARIZATION mode.
- **Reasoning:** Muse Spark on the Responses API.
  - JSON output uses `text.format` with a JSON schema.
  - The live screen shows streamed `reasoning.summary`.
  - We use the standard `muse-spark-1.3`, not `-contributor`, because contributor mode lets Meta train on content, and private constraints pass through Spark.
- **Live screen:** a local web page (`http://localhost:DASHBOARD_PORT`) fed by Server-Sent Events. It shows live transcript partials, rolling Muse Spark insights, reasoning summaries, and a log of Muse calls. Private DM content is never sent to it; it only shows "✓ replied privately".
- **Text-to-speech:** Meta's open-source **MMS-TTS** (`Xenova/mms-tts-eng`, the ONNX build of `facebook/mms-tts-eng`), run locally with `@huggingface/transformers` 4.3.1 (approved). It's not part of the Muse API, but it is a Meta model. License is CC-BY-NC, which is fine for a hackathon. Tested on the dev machine: about 10 s to load the first time (we preload at startup), 0.7 s to synthesize 7.3 s of speech, output 16 kHz mono.
- **Spoken questions and zero-ego:** spoken questions cover time and logistics gaps only. For diet and budget, the bot says it will DM each person privately. Those are never asked out loud (approved).
- **Crew self-registration (replaces `ORBIT_CREW` in `.env`):**
  - `/orbit-setup` posts a "Join Orbit" button. Clicking it opens a Discord modal asking for the person's email.
  - `/link-email` does the same thing directly; `/unlink` removes you.
  - Data is stored in `data/people.json`. Confirmations are ephemeral (only that person sees them), and emails are never posted in a channel.
  - The crew is everyone who has registered. Absent members are registered people who weren't in the voice call.
- **Calendar privacy:** events are created with `guestsCanSeeOtherGuests: false`, so invitees don't see each other's emails.
- **GitHub:** remote `https://github.com/Orbit-Meta/ORBIT`, branch `main`. Repo-local git identity: `sasha <sashanasdaq@gmail.com>`.
- **Secrets:** all in `.env` (gitignored). `.env.example` is committed.

### Phase 1 decisions
- **Audio decoding:** opusscript decodes each Opus packet directly to **24 kHz mono PCM16**, which is Muse's `PCM_24KHZ` format, so there's no resampling step.
  - Verified with a 440 Hz round-trip test: frequency and amplitude come out the same.
  - Decoding packet by packet means a bad packet costs 20 ms of audio instead of the whole stream.
  - prism-media is not used.
- **Pause:** packets that arrive while paused are dropped before decoding. Nothing from a pause is decoded, stored, or sent.
- **Slash commands** are registered to the one server on startup, so they appear instantly. Commands work only in servers (no DMs).
- **Small additions beyond the spec** (needed for the flow or for consent; easy to remove if you'd rather not have them):
  - `/resume`: without it, `/pause` can't be undone.
  - A heads-up message (@mention) to anyone who joins the call while Orbit is listening.
  - Orbit leaves automatically when every human has left the call.
- **Stage channel fallback** is built in. When joining a Stage channel, Orbit tries to become a speaker; that needs the Mute Members permission, and without it Orbit only listens.
- **Startup check:** if `DISCORD_GUILD_ID` isn't a server the bot is in, startup prints the servers it is in plus an invite link.
- **Voice debugging:** set `ORBIT_VOICE_DEBUG=1` in `.env` for detailed voice and DAVE logs.
- **Storage:** JSON files under `data/` (gitignored). Private constraints are kept in a separate file.

### Phase 2 decisions
- **One Muse realtime session per utterance**, in `PUSH_TO_TALK` mode.
  - An utterance ends after 800 ms of silence.
  - Anything under 300 ms (a cough or click) is dropped without calling Muse.
  - We don't pay for silence between turns, and each line gets a clean speaker label.
- **Pacing:** audio is sent every 80 ms and kept within 240 ms of real time. Silence padding happens only beyond that, during pauses or packet loss. The tolerance is the `LAG_TOLERANCE_BYTES` constant in `src/meta/muse.js`.
- **Fallback:** each utterance's audio stays in memory until it's transcribed. If the realtime stream fails, it's retried through Muse's file-upload endpoint.
- **Recognition hints:**
  - `keywords` = display names in the call + crew names + "Meta" and "Orbit".
  - `languageBias` = `["English"]`.
- **Transcript files:** `data/transcripts/<ISO time>.json` and `.txt`, rewritten after every line and ordered by when each person started speaking.
- **Live screen:** `http://localhost:3000`, built with `node:http` and Server-Sent Events, no new dependencies.
  - It shows the live transcript with partial text and a "speaking" indicator, plus the Meta AI activity log (call count, average latency, each call).
  - Bound to 127.0.0.1 only.
- **WebSocket client:** Node 24's built-in `WebSocket`, so no `ws` dependency in the app.
- **Config validation:** an invalid `TIMEZONE` now stops startup with a clear message. A failure while recording one transcript line can't crash the bot.

### Phase 2 test results (protocol test double, no real Muse)
- **Handshake:** exactly matches the documented `RealtimeHandshakeRequest`.
- **Pacing:** stays within 240 ms of real time.
- **`endStream`:** sent correctly, and the final transcript is received.
- **Fallback:** realtime close code 1011 led to a file upload with valid multipart and WAV, and the transcript line was still recorded.
- **Ordering:** two overlapping speakers came out in the correct order.
- **Short sounds:** a 100 ms "cough" was dropped.
- **Live screen:** the page is served, a new viewer gets the current state plus live events, and the page script parses.

### Phase 3 decisions
- **`reason()` in `muse.js`:** Muse Spark through the Responses API, streamed, with `store: false`.
  - Output is enforced by a strict JSON schema.
  - Reasoning summaries stream to the live screen's "Muse Spark is thinking" strip.
  - Every call is logged with latency and tokens.
- **Prompts and schemas** are all in `src/meta/prompts.js`, readable for judges.
- **`summarizeCall()`** (`src/core/`) is a connector-ready pure function: transcript lines + who was in the call + absent crew + time zone in, `CALL_SUMMARY_SCHEMA` JSON out. Relative dates ("this Friday") are resolved against the current date in `TIMEZONE`.
- **Live notes:** `low` effort, throttled to roughly every 12 s while people talk (the first update waits 4 s to collect a few lines). Never more than one Spark call at a time.
- **Recap:** `medium` effort. It's posted to `DISCORD_RECAP_CHANNEL_ID` on `/recap`, and automatically when the call ends (`/stop` or everyone leaves) unless `/recap` already covered every line.
  - It @mentions registered crew members who weren't in the call.
  - Raw JSON is saved to `data/summaries/<transcript id>.json`.
  - `/recap` still works after `/stop` (it uses the most recent call).
- **Recap privacy:** the recap contains only what was said out loud in the call. The prompt tells Spark not to bring up budgets or diet unless someone said them aloud.

### Phase 3 test results (real Muse Spark, real Discord)
- **Input:** the real 13-line Phase 2 transcript.
- **Output:** correct. "This Friday" resolved to 2026-10-30. "Three after five" was corrected to "free after 5". slimy's 2 pm commitment was captured. Angel was flagged in `needs_input_from`.
- **Recap message:** posted to #general through the real `postRecap()`.
- **Bugs found and fixed:**
  - Live notes used a debounce, which never fired while people kept talking. Switched to a throttle.
  - The recap's call length used "now" instead of when the call ended.

### Phase 3b decisions
- **Wake phrase:** a final transcript line containing "question(s)" plus "Meta" (or how recognition might spell it: Metta, Mehta, Meda). Spoken triggers have a 30 s cooldown so echoes can't loop.
  - Backup: the `/questions` slash command, with no cooldown.
- **`askQuestions()`** (`src/core/`, connector-ready) returns `{ questions, followUpWith, dropped, spokenText }`.
  - At most 3 questions.
  - People who weren't in the call are never asked aloud ("I'll check with Angel separately").
  - The spoken reply always ends with "I'll DM each of you privately about food preferences and budget." (approved zero-ego behavior).
- **Zero-ego, two layers:**
  1. The prompt forbids asking about money, diet, or health aloud.
  2. A regex guard in `askQuestions.js` drops any question mentioning them before it's spoken.
- **Orbit's spoken turn** is added to the transcript as speaker "Orbit", so later answers make sense in the recap. The summary prompt says Orbit isn't a person in the plan.
  - Orbit's turn is also posted as text in the voice channel's chat, as a fallback and for accessibility.
- **TTS:** `@huggingface/transformers` 4.3.1 is now a dependency.
  - The model cache is in `data/models/` (gitignored, survives reinstalls).
  - npm 11 blocks `onnxruntime-node`'s postinstall, but that script only fetches optional GPU binaries; the CPU runtime works.

### Phase 3b test results (real Muse Spark + real MMS-TTS)
- **Wake phrase:** 7/7 correct (4 variants matched, 3 decoys rejected).
- **Real call + "Any questions, Meta?":** one question ("What exact time after five should we meet?") plus "I'll check with Angel separately." It didn't re-ask the day or place.
- **Adversarial (budget and allergy said out loud):** it asked only "sushi or tacos?" and "what time Saturday?". Nothing private was asked aloud.
- **Fully settled plan:** "Nope, I think you've covered everything I need."
- **TTS:** 9.1 s of speech became 452 Opus packets (about 453 expected), through the real `createAudioResource` path.
- **Fixed:** questions without a question mark ran together when spoken; punctuation is now added.

### Phase 4 decisions
- **When check-ins start:** right after the end-of-call recap (`/stop` or everyone leaving).
  - Orbit DMs registered crew members who missed the call, plus everyone in the call when `DM_EVERYONE=true`.
  - In-call people get a "Anything you'd rather not say in front of everyone?" framing.
  - `/ask @person` adds someone by hand.
  - Anyone who registers (`/link-email`) while check-ins are open is DM'd automatically.
  - People Muse Spark says we still need who aren't registered (e.g. Angel) are named in the status message with a prompt to run `/link-email`.
- **The DM:** a card with public plan info, plus **Answer privately** (opens one form: option dropdown, when free, budget, dietary needs, anything else) and **I can't make it**.
  - Orbit replies in the DM with what it understood, visible only to that person.
  - People can re-answer until the plan is resolved.
- **Group status message:** edited in place. It shows only names and "✅ replied / ⏳ waiting / ⚠️ couldn't DM". Declining also shows "replied" (zero-ego).
- **Resolving:** automatic when nobody is still waiting; `/resolve` forces it with the replies so far.
  - The plan is posted as a green "It's a plan" embed with When, Where, and Who's coming.
  - The public plan is saved to `data/plans/<id>.json` for Phase 5 (Calendar).
- **Privacy architecture:**
  1. **Separate storage:** private answers and Spark's rationale are stored only in `data/private/<round>.json`. Only `src/plan/round.js` imports `privateStore.js` (verified by grep).
  2. **No reasoning stream:** Muse Spark's reasoning summary is not streamed for the private steps. The live screen shows "🔒 Reasoning hidden."
  3. **Leak guard:** `src/core/privacyGuard.js` collects every private term that wasn't said out loud in the call (words, plus money-like numbers). Spark's title, location, and announcement are checked against it; if anything matches, that text is replaced by a template built only from plan fields.
  4. **Public-only messages:** group-facing builders (`format.js`) only receive public data.
  5. **Safe return value:** `resolveRound()` never returns the private rationale to callers.
- **Restarts:** round metadata (names and statuses only) is saved in `data/rounds/`, so DM buttons and `/resolve` keep working after a bot restart.

### Phase 4 test results
- **`npm run test:privacy`** (real Muse Spark, real round code, fake Discord client that records every message): **PASSED**.
  - Canaries (sesame allergy, landlord inspection, brother's surgery, $13 and $11 budgets, vegetarian, a decline) were found in 0 of: group messages and edits, live-screen events, the public plan file.
  - The same canaries were confirmed in the private store and in each owner's own DM. No one else's DM contained them.
  - The leak guard caught a deliberately leaky message ("under $13 and sesame-free").
  - The resolved plan was correct: Chipotle (sushi ruled out by the allergy and budgets) at 6:30 PM (Angel's window), with Jordan left out without explanation and a neutral announcement.
- **The DM card and modal build valid Discord JSON:** 5 labeled fields, option dropdown, 39-character title.

### Phase 5 decisions
- **No Google SDK:** OAuth and Calendar v3 are called with plain `fetch` (`src/google/auth.js`, `src/google/calendar.js`). No new dependency.
- **Sign-in (`npm run google:auth`):** Desktop-app OAuth with a loopback redirect on a random local port, plus PKCE and a state check.
  - Scopes: `calendar.events` plus `openid email` (only to show which account is connected).
  - Verifies the connection by reading the calendar's name; creates nothing.
- **Token storage:** `data/google-token.json` (gitignored), not `.env`, because the editor has overwritten `.env` before. `GOOGLE_REFRESH_TOKEN` in `.env` still overrides the file.
- **`createEvent()`** (`src/core/`, connector-ready) sends title, location, the guarded public message as the description, start/end in `TIMEZONE` (default 2 h, rolls past midnight), and attendees with `sendUpdates=all`.
  - `guestsCanSeeOtherGuests: false` and `guestsCanInviteOthers: false`.
- **Who gets invited:** the plan's attendee names matched to round members, then to their linked emails (fallback: every member who didn't decline).
  - People without a linked email are named in the confirmation ("use `/link-email`").
  - Email addresses are never posted.
- **Flow:** the plan is posted, the event is created, then a "📅 Added to Google Calendar" message is posted with the event link. The live screen's plan banner shows the calendar link.
- **Retry:** if Calendar fails (e.g. the 7-day testing-mode sign-in expired), the group sees why. After fixing it, `/resolve` retries just the calendar step for the latest plan.
- **`npm run google:test`:** creates one "Orbit test event (safe to delete)" tomorrow 6–7 PM with no invites, to check the connection before a demo.

### Phase 5 test results
- **`npm run test:privacy`** now also covers the calendar invite. Google traffic is intercepted (no real event); Muse Spark is real. **PASSED:**
  - The invite contains no private canaries.
  - It goes to exactly Sam, Riley, and Angel (Jordan declined).
  - `sendUpdates=all`, and the guest list is hidden.
  - No email addresses appear in the group channel or on the live screen.
- **Event time math:** checked for same-day events, a default 2 h length, past midnight, and New Year's Eve.
- **OAuth URL:** has the right scopes, PKCE S256, and `access_type=offline`.
- **Not yet tested live:** the real Google sign-in and real event creation. Both need your browser sign-in.

## Verification log (2026-10-25)
- **DAVE is mandatory:** Discord has enforced E2EE voice since March 2026.
- **@discordjs/voice 0.19.2:** contains PR #11449, the probable DAVE receive fix. Not publicly confirmed; packet-loss issue #11441 was closed without a fix.
- **Local check:** `generateDependencyReport()` passes on Windows (davey loads, native AES-GCM, FFmpeg 9.0.2 with libopus).
- **Meta Model API docs read:**
  - speech-to-text, realtime, transcribe, structured-output, reasoning, authentication, pricing
  - no TTS offered
  - realtime ASR requires audio at about real-time pace, 24 kHz PCM16 mono, and a handshake within 10 s
  - limits: 256 concurrent streams and 16k streams/hour

## Open issues
- **Phase 1 live test passed.** Sasha confirmed `/orbit-setup` and separate per-speaker audio streams both worked. Two speakers each produced a clean 10.0 s WAV.
  - **Voice receive works with DAVE on @discordjs/voice 0.19.2** in a regular voice channel, so the Stage fallback wasn't needed.
- **Minor:** a display name with no letters or digits turns into the filename `_`. This only affects the Phase 1 WAV files, which Phase 2 removes.
- **Angel (Partner 3) hasn't registered yet**, so the recap can't @mention them. They need to click Join Orbit or run `/link-email` before the Phase 4 DMs.
- **Echo risk:** if someone in the call uses speakers instead of headphones, their mic may pick up Orbit's voice and transcribe it as their line. Use headphones for the demo.
- **TTS and non-Latin names:** MMS-TTS (English) can't pronounce non-Latin names like "лс забанили"; they're skipped in speech but still shown in text.
- **Display names in transcripts:** a speaker label is the person's Discord display name (e.g. "лс забанили"). For the demo, consider readable display names.
- **Dev environment note:** Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI. Edit files with Node or the editor, not `Get-Content`/`Set-Content`.
- **Not in the docs:** realtime handshake field names for `ENDPOINTING` settings. We don't need them; we use `PUSH_TO_TALK` per utterance.
