// ─────────────────────────────────────────────────────────────────────────────
// The ONLY place Orbit talks to an AI service. Everything goes to Meta's
// Model API (https://dev.meta.ai/docs). See META_USAGE.md for every call site.
//
//   transcribe()      Muse Voice Transcribe, realtime WebSocket (live, per utterance)
//   transcribeFile()  Muse Voice Transcribe, file upload (fallback + demo mode)
//   reason()          Muse Spark, Responses API (structured JSON + live reasoning summary)
// ─────────────────────────────────────────────────────────────────────────────
import { config, requireEnv } from '../config.js';
import { bus } from '../dashboard/bus.js';

const AUDIO_ENCODING = 'PCM_24KHZ'; // 24 kHz mono PCM16
const BYTES_PER_MS = 48;
const FRAME_MS = 80;
const LAG_TOLERANCE_BYTES = 240 * BYTES_PER_MS; // normal network jitter stays under this
const FINAL_TIMEOUT_MS = 15_000;
const DEFAULT_LANGUAGES = ['English'];

function logCall(entry) {
  bus.emit('muse', { at: Date.now(), ...entry });
}

/**
 * Muse Voice Transcribe, realtime. One PUSH_TO_TALK session per utterance.
 *
 *   const stream = transcribe({ keywords, onPartial });
 *   stream.write(pcm);                      // 24 kHz mono PCM16, as it arrives
 *   const { text } = await stream.end();    // speaker went quiet → final text
 *   stream.abort();                         // throw away (e.g. a cough)
 *
 * Audio is sent every 80 ms. Muse closes streams that fall below real time, but
 * Discord sends nothing during a short pause and can drop packets. So we compare
 * bytes sent against the wall clock and pad with silence only once we're more
 * than 240 ms behind. Ordinary jitter never triggers padding, so speech isn't chopped.
 */
export function transcribe({ keywords = [], languageBias = DEFAULT_LANGUAGES, onPartial } = {}) {
  requireEnv('MODEL_API_KEY');
  const ws = new WebSocket(`${config.muse.baseUrl.replace(/^http/, 'ws')}/asr/realtime`);

  let sessionId = null;
  let acked = false;
  let ending = false;
  let inputClosed = false;
  let settled = false;
  let endRequestedAt = 0;
  let latestPartial = '';
  let queue = [];
  let pacer = null;
  let pacerStartedAt = 0;
  let bytesSent = 0;
  let timer = null;
  let resolveDone;
  let rejectDone;
  const done = new Promise((res, rej) => ((resolveDone = res), (rejectDone = rej)));
  done.catch(() => {}); // a stream can fail mid-utterance, before anyone awaits end()
  const openedAt = Date.now();

  const send = (data) => {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(data);
    return true;
  };

  function sendAudio(buf) {
    if (send(buf)) bytesSent += buf.length;
  }

  function flushQueue() {
    if (queue.length) sendAudio(Buffer.concat(queue));
    queue = [];
  }

  function paceTick() {
    flushQueue();
    const behind = (Date.now() - pacerStartedAt) * BYTES_PER_MS - bytesSent;
    if (behind > LAG_TOLERANCE_BYTES) sendAudio(Buffer.alloc(behind - (behind % 2))); // silence
  }

  function closeInput() {
    if (inputClosed) return;
    inputClosed = true;
    clearInterval(pacer);
    flushQueue();
    send(JSON.stringify({ type: 'endStream' }));
  }

  function settle(err, text = '', { silent = false } = {}) {
    if (settled) return;
    settled = true;
    clearInterval(pacer);
    clearTimeout(timer);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    if (!silent) {
      logCall({
        tool: 'Muse Voice Transcribe',
        endpoint: 'realtime',
        ok: !err,
        // Success: time from "speaker went quiet" to final text. Failure: time since open.
        ms: Date.now() - (endRequestedAt || openedAt),
        sessionId,
        note: err ? err.message : `${text.trim().split(/\s+/).filter(Boolean).length} words`,
      });
    }
    err ? rejectDone(err) : resolveDone({ text: text.trim(), sessionId });
  }

  ws.addEventListener('open', () => {
    send(
      JSON.stringify({
        authorization: { accessToken: `Bearer ${config.muse.apiKey}` },
        audioEncoding: AUDIO_ENCODING,
        model: config.muse.transcribeModel,
        mode: 'PUSH_TO_TALK',
        partialMode: 'CUMULATIVE',
        emitAudioProgress: false,
        keywords,
        languageBias,
      }),
    );
  });

  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    const msg = JSON.parse(event.data);

    if (!msg.type) {
      // Handshake ack: the only server frame without a `type`.
      if (!msg.sessionId) return settle(new Error(`Muse Voice Transcribe handshake failed: ${event.data}`));
      sessionId = msg.sessionId;
      acked = true;
      if (ending) return closeInput(); // the whole utterance finished before the ack
      pacerStartedAt = Date.now();
      paceTick(); // send whatever was spoken while the handshake was in flight
      pacer = setInterval(paceTick, FRAME_MS);
      return;
    }

    if (msg.type === 'transcript') {
      if (msg.final) return settle(null, msg.transcript);
      latestPartial = msg.transcript;
      onPartial?.(msg.transcript);
    } else if (msg.type === 'error') {
      settle(new Error(`Muse Voice Transcribe: ${msg.message}`));
    }
    // Unknown event types are ignored, per the docs.
  });

  ws.addEventListener('close', (event) => {
    if (event.code === 1000 && inputClosed) settle(null, latestPartial);
    else settle(new Error(`Muse Voice Transcribe closed with code ${event.code}${event.reason ? ` (${event.reason})` : ''}`));
  });

  return {
    write(pcm) {
      if (!ending && !settled) queue.push(pcm);
    },
    end() {
      if (!ending) {
        ending = true;
        endRequestedAt = Date.now();
        timer = setTimeout(() => settle(new Error('Muse Voice Transcribe timed out waiting for the final transcript')), FINAL_TIMEOUT_MS);
        if (acked) closeInput();
      }
      return done;
    },
    abort() {
      settle(new Error('aborted'), '', { silent: true });
    },
  };
}

/**
 * Muse Voice Transcribe, file upload (POST /asr/transcribe). WAV, mono, 16 or 24 kHz, ≤10 min.
 * Used when a realtime stream fails, and by demo mode (Phase 6).
 */
export async function transcribeFile(wav, { keywords = [], languageBias = DEFAULT_LANGUAGES } = {}) {
  requireEnv('MODEL_API_KEY');
  const started = Date.now();
  const form = new FormData();
  form.append(
    'request',
    new Blob([JSON.stringify({ model: config.muse.transcribeModel, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', keywords, languageBias })], {
      type: 'application/json',
    }),
  );
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');

  try {
    const res = await fetch(`${config.muse.baseUrl}/asr/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.muse.apiKey}`, Accept: 'application/json' },
      body: form,
    });
    if (!res.ok) throw new Error(`Muse Voice Transcribe file upload failed: HTTP ${res.status} ${await res.text()}`);
    const json = await res.json();
    const text = (json.transcript ?? '').trim();
    logCall({ tool: 'Muse Voice Transcribe', endpoint: 'file', ok: true, ms: Date.now() - started, sessionId: json.sessionId, note: `${text.split(/\s+/).filter(Boolean).length} words` });
    return { text, sessionId: json.sessionId };
  } catch (err) {
    logCall({ tool: 'Muse Voice Transcribe', endpoint: 'file', ok: false, ms: Date.now() - started, note: err.message });
    throw err;
  }
}

/**
 * Muse Spark via the Responses API (POST /responses), streamed.
 *
 *   const { data } = await reason({
 *     task: 'call recap',                 // label for the live screen's activity log
 *     instructions, input,                // developer instructions + user content
 *     schema, schemaName,                 // JSON Schema → output is guaranteed to match
 *     effort: 'low',                      // minimal | low | medium | high | xhigh | max
 *     onReasoning: (summarySoFar) => {},  // Spark's reasoning summary as it streams
 *   });
 *
 * store: false — Meta doesn't keep these responses (private constraints pass through here later).
 */
export async function reason({ task, instructions, input, schema, schemaName, effort = 'low', onReasoning, maxOutputTokens = 8000, timeoutMs = 90_000 }) {
  requireEnv('MODEL_API_KEY');
  const started = Date.now();
  let reasoning = '';
  let text = '';
  let response = null;

  try {
    const res = await fetch(`${config.muse.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.muse.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: config.muse.sparkModel,
        instructions,
        input,
        text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
        reasoning: { effort, summary: 'auto' },
        max_output_tokens: maxOutputTokens,
        store: false,
        stream: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Muse Spark HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

    for await (const event of readServerSentEvents(res.body)) {
      switch (event.type) {
        case 'response.reasoning_summary_text.delta':
          reasoning += event.delta;
          onReasoning?.(reasoning);
          break;
        case 'response.reasoning_summary_part.added':
          if (reasoning) reasoning += '\n\n';
          break;
        case 'response.output_text.delta':
          text += event.delta;
          break;
        case 'response.completed':
        case 'response.incomplete':
        case 'response.failed':
          response = event.response;
          break;
        case 'error':
          throw new Error(`Muse Spark: ${event.message}`);
      }
    }

    if (!response) throw new Error('Muse Spark stream ended without a final response');
    if (response.status !== 'completed') {
      const why = response.error?.message ?? response.incomplete_details?.reason ?? response.status;
      throw new Error(`Muse Spark response ${response.status}: ${why}`);
    }
    const finalText =
      response.output_text ??
      response.output?.filter((o) => o.type === 'message').flatMap((o) => o.content).find((c) => c.type === 'output_text')?.text ??
      text;
    const data = JSON.parse(finalText);

    const usage = response.usage ?? {};
    logCall({
      tool: 'Muse Spark',
      endpoint: task,
      ok: true,
      ms: Date.now() - started,
      sessionId: response.id,
      note: `${usage.input_tokens ?? '?'} in · ${usage.output_tokens ?? '?'} out tokens (${usage.output_tokens_details?.reasoning_tokens ?? 0} reasoning) · effort ${effort}`,
    });
    return { data, reasoning, usage, responseId: response.id };
  } catch (err) {
    logCall({ tool: 'Muse Spark', endpoint: task, ok: false, ms: Date.now() - started, note: err.message });
    throw err;
  }
}

/** Parse a text/event-stream body into JSON event objects. */
async function* readServerSentEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data && data !== '[DONE]') yield JSON.parse(data);
    }
  }
}