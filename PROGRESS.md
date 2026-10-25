# Orbit — Progress

| Phase | Status |
|---|---|
| 0. Plan & verify | ✅ Done; waiting on credentials in `.env` and "go" |
| 1. Bot skeleton + **voice receive spike** + crew self-registration | ⏳ Not started |
| 2. Voice capture + Muse Voice Transcribe + live screen (transcript) | ⏳ Not started |
| 3. Muse Spark summary + live screen (rolling insights, reasoning) | ⏳ Not started |
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
- **Storage:** JSON files under `data/` (gitignored). Private constraints are kept in a separate file.

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
- **Dev environment note:** Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI. Edit files with Node or the editor, not `Get-Content`/`Set-Content`.
- **Not in the docs:** realtime handshake field names for `ENDPOINTING` settings. We don't need them; we use `PUSH_TO_TALK` per utterance.
