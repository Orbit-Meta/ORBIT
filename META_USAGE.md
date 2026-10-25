# Where Meta AI is used in Orbit

All Meta AI calls go through one module: `src/meta/muse.js`. Nothing else in the codebase calls an AI service.

**API:** Meta Model API, `https://api.meta.ai/v1`, with `Authorization: Bearer $MODEL_API_KEY` ([docs](https://dev.meta.ai/docs/overview)).

| Function in `muse.js` | Meta tool and endpoint | How we call it |
|---|---|---|
| `transcribe()` | **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`), realtime WebSocket `wss://api.meta.ai/v1/asr/realtime` | One short session per utterance, per Discord speaker. Audio is 24 kHz mono PCM16. Partial results stream to the live screen. |
| `transcribeFile()` | **Muse Voice Transcribe**, `POST /v1/asr/transcribe` (WAV, ≤10 min) | Demo/replay mode (Phase 6) |
| `reason()` | **Muse Spark** (`muse-spark-1.3`), Responses API `POST /v1/responses` | Structured JSON output via `text.format`, plus streamed reasoning summaries (`reasoning.summary`) sent to the live screen |

## Call sites

| # | Meta tool | Where (file → function) | What it does | Status |
|---|---|---|---|---|
| 1 | Muse Voice Transcribe (realtime) | `src/voice/transcriber.js` → `begin()` calls `transcribe()` | Opens one live session per utterance, per Discord speaker, and streams the audio. Partial text goes to the live screen; the final text becomes a speaker-labeled transcript line. Name keywords plus "Meta"/"Orbit" improve recognition. | Built (Phase 2) |
| 1b | Muse Voice Transcribe (file) | `src/voice/transcriber.js` → `finish()` calls `transcribeFile()` | Fallback: if a realtime stream fails, the same utterance (kept in memory) is uploaded as a WAV | Built (Phase 2) |
| 2 | Muse Spark (effort `low`) | `src/voice/liveNotes.js` → `run()` calls `summarizeCall({ purpose: 'live' })` → `reason()` | Live notes during the call: who's free, options, decisions, and open questions, refreshed every ~12 s while people talk. The streamed reasoning summary appears on the live screen. | Built (Phase 3) |
| 3 | Muse Spark (effort `medium`) | `src/discord/recap.js` → `postRecap()` calls `summarizeCall({ purpose: 'recap' })` → `reason()` | The end-of-call or `/recap` summary JSON, posted to the recap channel for people who missed the call. Raw JSON is saved in `data/summaries/`. | Built (Phase 3) |
| 4 | Muse Spark (effort `low`) | `src/voice/askMeta.js` → `answerQuestions()` calls `askQuestions()` (`src/core/askQuestions.js`) → `reason()` | On "Any questions, Meta?" (or `/questions`), finds only what the plan is still missing (day, time, choice, who's coming) and writes up to 3 short spoken questions. Never asks about money or food restrictions out loud; a code-level guard drops any question that does. | Built (Phase 3b) |
| 5 | Muse Spark | `src/core/collectConstraints.js` → `reason()` | Turns private DM replies into structured constraints | Planned (Phase 4) |
| 6 | Muse Spark | `src/core/resolvePlan.js` → `reason()` | Picks a plan that satisfies all constraints and writes a neutral group message | Planned (Phase 4) |

## Meta open-source model (runs locally, not part of the Muse API)

| # | Meta model | Where (file → function) | What it does | Status |
|---|---|---|---|---|
| 7 | **MMS-TTS** (`facebook/mms-tts-eng`, run with transformers.js as `Xenova/mms-tts-eng`) | `src/meta/tts.js` → `synthesize()`, called from `src/voice/askMeta.js` → `speak()` | Speaks Muse Spark's questions aloud in the voice call. Loaded at startup (~10 s, cached in `data/models/`). Output is resampled to 48 kHz stereo and played through @discordjs/voice. Numbers and times are converted to words first, since MMS can't pronounce digits. The Meta Model API has no TTS, so we use Meta's open-weights speech model. | Built (Phase 3b) |

Non-Meta AI services used: **none**.

## Log by phase
- **Phase 1:** no AI calls. The voice receive test saves raw audio to local WAV files only.
- **Phase 2:** Muse Voice Transcribe, realtime with file-upload fallback. Every call is shown in the live screen's "Meta AI activity" panel, with latency and Muse session ID.
- **Phase 3:** Muse Spark via the Responses API.
  - Request settings: `text.format` = strict JSON schema (`CALL_SUMMARY_SCHEMA` in `src/meta/prompts.js`), `reasoning.summary: "auto"` streamed to the live screen, `store: false`.
  - Measured on a real 13-line call: live notes ~3–4 s (effort low), recap ~7–8 s (effort medium), ~1.3k input tokens.
- **Phase 3b:** Muse Spark gap questions (~1.3–4.7 s at effort low) plus Meta MMS-TTS, local, about 1 s per sentence once loaded. Both appear in the live screen's activity panel.
