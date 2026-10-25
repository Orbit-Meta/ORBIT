# Orbit — Progress

| Phase | Status |
|---|---|
| 0. Plan & verify | ✅ Done |
| 1. Bot skeleton + **voice receive spike** + crew self-registration | ✅ Done; verified live by Sasha |
| 2. Voice capture + Muse Voice Transcribe + live screen (transcript) | ✅ Done; live call produced an accurate 13-line, speaker-labeled transcript |
| 3. Muse Spark summary + live screen (rolling insights, reasoning) | 🧪 Done and tested with real Muse Spark + a real Discord post; waiting for your review |
| 3b. "Any questions, Meta?" spoken gap questions | ⏳ Not started |
| 4. Private constraints + plan resolution | ⏳ Not started |
| 5. Google Calendar | ⏳ Not started |
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
- **Display names in transcripts:** a speaker label is the person's Discord display name (e.g. "лс забанили"). For the demo, consider readable display names.
- **Dev environment note:** Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI. Edit files with Node or the editor, not `Get-Content`/`Set-Content`.
- **Not in the docs:** realtime handshake field names for `ENDPOINTING` settings. We don't need them; we use `PUSH_TO_TALK` per utterance.
