# Where Meta AI is used in Orbit

All of Orbit's AI is Meta, and all of it lives in `src/meta/`:
- `src/meta/muse.js`: the only module that calls the **Meta Model API** (Muse Voice Transcribe and Muse Spark)
- `src/meta/tts.js`: runs Meta's open-source **MMS-TTS** voice model locally
- `src/meta/prompts.js`: every instruction and JSON schema sent to Muse Spark

**Non-Meta AI services used: none.** Google Calendar and Discord are ordinary APIs, not AI.

**API:** Meta Model API, `https://api.meta.ai/v1`, with `Authorization: Bearer $MODEL_API_KEY` ([docs](https://dev.meta.ai/docs/overview)).

## The three entry points in `muse.js`

| Function | Meta tool and endpoint | How Orbit calls it |
|---|---|---|
| `transcribe()` | **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`), realtime WebSocket `wss://api.meta.ai/v1/asr/realtime` | One `PUSH_TO_TALK` session per utterance, per Discord speaker. Audio is 24 kHz mono PCM16, kept at real-time pace. Partial text streams to the live screen. Names plus "Meta"/"Orbit" are passed as `keywords`. |
| `transcribeFile()` | **Muse Voice Transcribe**, `POST /v1/asr/transcribe` (WAV, ≤10 min) | Fallback when a realtime stream fails. In demo `file` mode it uses `mode: "DIARIZATION"` to get speaker-labeled turns. |
| `reason()` | **Muse Spark** (`muse-spark-1.3`), Responses API `POST /v1/responses`, streamed | Strict JSON-schema output via `text.format`. `reasoning.summary` streams to the live screen (except for private steps). Uses `store: false` and retries once on rate limits, server errors, or timeouts. |

## Every call site

| # | Meta tool | Where (file → function) | What it does |
|---|---|---|---|
| 1 | Muse Voice Transcribe (realtime) | `src/voice/transcriber.js` → `begin()` → `transcribe()` | Live speech-to-text for each person in the call. The final text becomes a speaker-labeled transcript line. |
| 1b | Muse Voice Transcribe (file) | `src/voice/transcriber.js` → `finish()` → `transcribeFile()` | If a realtime stream fails, the same utterance (kept in memory) is uploaded as a WAV instead. |
| 2 | Muse Spark (effort `low`) | `src/voice/liveNotes.js` → `run()` → `summarizeCall({ purpose: 'live' })` | Live notes during the call (who's free, options, decisions, open questions), refreshed about every 12 s while people talk. |
| 3 | Muse Spark (effort `medium`) | `src/discord/recap.js` → `postRecap()` → `summarizeCall({ purpose: 'recap' })` | The recap posted for people who missed the call. Relative dates ("this Friday") are resolved to real dates. |
| 4 | Muse Spark (effort `low`) | `src/voice/askMeta.js` → `answerQuestions()` → `askQuestions()` | On "Any questions, Meta?" (or `/questions`): asks only what the plan is still missing, at most 3 questions. Never asks about money or diet out loud; a code-level guard enforces this. |
| 5 | Muse Spark (effort `low`) | `src/plan/round.js` → `handleRoundInteraction()` → `collectConstraints()` | Turns one person's **private** DM answers into structured constraints, stored only in `data/private/`. Reasoning is not streamed. |
| 6 | Muse Spark (effort `medium`) | `src/plan/round.js` → `resolveRound()` → `resolvePlan()` | Picks the plan that satisfies everyone's private constraints and writes a neutral announcement, which then passes a code-level leak check. Reasoning is not streamed; the rationale stays private. |
| 7 | **Meta MMS-TTS** (`facebook/mms-tts-eng`, run locally via transformers.js as `Xenova/mms-tts-eng`) | `src/meta/tts.js` → `synthesize()`, called from `src/voice/askMeta.js` → `speak()` | Speaks Orbit's questions aloud in the voice call. The Meta Model API has no text-to-speech, so we use Meta's open-weights model. Numbers and times are converted to words first. |
| 8 | Meta MMS-TTS → Muse Voice Transcribe | `src/demo/runDemo.js` → `speakIntoPipeline()` | Demo `audio` mode: each script line is spoken by MMS-TTS and streamed through the same realtime transcription path as live Discord audio. |
| 9 | Muse Voice Transcribe (`DIARIZATION`) | `src/demo/runDemo.js` → `runDemo({ mode: 'file' })` → `transcribeFile()` | Demo `file` mode: your own recording of a call is transcribed with speaker labels and replayed. |

The core actions in `src/core/` (`summarizeCall`, `askQuestions`, `collectConstraints`, `resolvePlan`, `createEvent`) take plain JSON in and return JSON out, so they can later be exposed as Muse connector tools.

## Measured (real calls, 2026-10-25)
- **Muse Voice Transcribe realtime:** final text arrives shortly after each speaker stops. Every call is logged on the live screen with its latency.
- **Muse Spark:** live notes ~3–4 s (low effort), questions ~1.3–4.7 s (low), recap ~7–8 s (medium). About 0.5–1.3k input tokens per call.
- **MMS-TTS:** ~10 s to load once at startup, then about 1 s per sentence.

## Log by phase
- **Phase 1:** no AI calls (voice receive test only).
- **Phase 2:** Muse Voice Transcribe (realtime, with file-upload fallback).
- **Phase 3:** Muse Spark live notes and recap.
- **Phase 3b:** Muse Spark gap questions and Meta MMS-TTS.
- **Phase 4:** Muse Spark reads private answers and resolves the plan. `npm run test:privacy` proves private answers stay private.
- **Phase 5:** no new AI (Google Calendar).
- **Phase 6:**
  - Demo modes reuse the same Meta pipeline (`audio`: MMS-TTS → Muse Voice Transcribe; `file`: Muse Voice Transcribe diarization).
  - Muse Spark retries once on transient errors.
  - `npm run check` verifies the Muse key by listing models, without making any AI call.
