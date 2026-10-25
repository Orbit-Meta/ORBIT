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
| 2 | Muse Spark | `src/core/liveInsights.js` → `reason()` | Updates availability, options, and open questions on the live screen as the call goes on | Planned (Phase 3) |
| 3 | Muse Spark | `src/core/summarizeCall.js` → `reason()` | Builds the end-of-call summary JSON (availability, options, open questions, decisions) | Planned (Phase 3) |
| 4 | Muse Spark | `src/core/askQuestions.js` → `reason()` | On "Any questions, Meta?", finds only the gaps the call hasn't covered (diet, unresolved times) and writes short questions | Planned (Phase 3b) |
| 5 | Muse Spark | `src/core/collectConstraints.js` → `reason()` | Turns private DM replies into structured constraints | Planned (Phase 4) |
| 6 | Muse Spark | `src/core/resolvePlan.js` → `reason()` | Picks a plan that satisfies all constraints and writes a neutral group message | Planned (Phase 4) |

## Meta open-source model (runs locally, not part of the Muse API)

| # | Meta model | Where (file → function) | What it does | Status |
|---|---|---|---|---|
| 7 | **MMS-TTS** (`facebook/mms-tts-eng`, run with transformers.js as `Xenova/mms-tts-eng`) | `src/meta/tts.js` → `speak()`, called from `src/core/askQuestions.js` | Speaks Muse Spark's clarifying questions aloud in the voice call. The Meta Model API has no TTS, so we use Meta's open-weights speech model. | Planned (Phase 3b) |

Non-Meta AI services used: **none**.

## Log by phase
- **Phase 1:** no AI calls. The voice receive test saves raw audio to local WAV files only.
- **Phase 2:** Muse Voice Transcribe, realtime with file-upload fallback. Every call is shown in the live screen's "Meta AI activity" panel, with latency and Muse session ID.
