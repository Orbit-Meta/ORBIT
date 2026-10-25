import { useEffect, useReducer } from 'react';

// Mirrors the bot's event bus (src/dashboard/server.js). Private DM answers never reach this stream:
// the round only carries names + replied/waiting, and the plan is the privacy-guarded public plan.
const MAX_MUSE_LOG = 60;

const empty = { connected: false, session: null, finals: [], partials: {}, muse: [], insights: null, thinking: null, round: null, plan: null };

function reducer(state, { type, data }) {
  switch (type) {
    case 'open':
      return { ...state, connected: true };
    case 'error':
      return { ...state, connected: false };
    case 'snapshot':
      return { ...empty, connected: true, ...data, thinking: data.thinking?.active ? data.thinking : null };
    case 'session': {
      const newCall = data.state === 'listening' && state.session?.startedAt !== data.startedAt;
      return newCall
        ? { ...state, session: data, finals: [], partials: {}, insights: null, round: null, plan: null }
        : { ...state, session: data };
    }
    case 'partial':
      return { ...state, partials: { ...state.partials, [data.userId]: data } };
    case 'partial-clear': {
      const { [data.userId]: _, ...rest } = state.partials;
      return { ...state, partials: rest };
    }
    case 'final': {
      const { [data.userId]: _, ...rest } = state.partials;
      return { ...state, finals: [...state.finals, data], partials: rest };
    }
    case 'muse':
      return { ...state, muse: [...state.muse, data].slice(-MAX_MUSE_LOG) };
    case 'insights':
      return { ...state, insights: data };
    case 'thinking':
      return { ...state, thinking: data.active ? data : null };
    case 'round':
      return { ...state, round: data };
    case 'plan':
      return { ...state, plan: data };
    default:
      return state;
  }
}

const EVENTS = ['snapshot', 'session', 'partial', 'partial-clear', 'final', 'muse', 'insights', 'thinking', 'round', 'plan'];

export function useOrbitStream() {
  const [state, dispatch] = useReducer(reducer, empty);
  useEffect(() => {
    const es = new EventSource('/events');
    es.onopen = () => dispatch({ type: 'open' });
    es.onerror = () => dispatch({ type: 'error' });
    for (const type of EVENTS) es.addEventListener(type, (e) => dispatch({ type, data: JSON.parse(e.data) }));
    return () => es.close();
  }, []);
  return state;
}
