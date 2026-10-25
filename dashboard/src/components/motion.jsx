// React wrappers for the transitions.dev snippets in src/transitions.css. Each one follows the
// "JavaScript orchestration" section of its reference file in .claude/skills/transitions-dev/
// (same classes, same reflows, durations read from the CSS variables) and animates only when
// its own value changes, never on unrelated re-renders.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const cssMs = (name, fallback) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

/* ── 18 Texts reveal ── staggered blurred rise, once, when the block mounts.
   Same trigger as the reference: force a reflow so the hidden state is computed, then add
   .is-shown. No requestAnimationFrame, so it also plays in background tabs. */
export function Reveal({ as: Tag = 'div', skip = false, className, children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(skip);
  useLayoutEffect(() => {
    if (shown) return;
    void ref.current?.offsetHeight; // force reflow
    setShown(true);
  }, [shown]);
  return (
    <Tag ref={ref} className={cn('t-stagger', shown && 'is-shown', className)} {...rest}>
      {children}
    </Tag>
  );
}

/** A line inside <Reveal>; n=2 rides in --stagger-stagger after n=1. */
export function RevealLine({ as: Tag = 'div', n = 1, className, children, ...rest }) {
  return (
    <Tag className={cn('t-stagger-line', `t-stagger-line--${n}`, className)} {...rest}>
      {children}
    </Tag>
  );
}

/* ── 30 Streaming text ── words that are new since the last render resolve in one by one. */
export function StreamText({ text, className }) {
  const ref = useRef(null);
  const prevWords = useRef([]);
  useLayoutEffect(() => {
    const el = ref.current;
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    let same = 0;
    while (same < prevWords.current.length && same < words.length && prevWords.current[same] === words[same]) same++;
    [...el.children].slice(same).forEach((s) => s.remove()); // words the model revised
    const fresh = words.slice(same).map((w) => {
      const s = document.createElement('span');
      s.className = 't-stream-w';
      s.textContent = `${w} `;
      el.appendChild(s);
      return s;
    });
    prevWords.current = words;
    void el.offsetWidth; // flush the hidden rest state
    const gap = cssMs('--stream-gap', 60);
    const timers = fresh.map((s, i) => setTimeout(() => s.classList.add('is-in'), i * gap));
    return () => timers.forEach(clearTimeout);
  }, [text]);
  return <span ref={ref} className={className} />;
}

/* ── 28 Thinking states ── shimmering status line; swaps (out up, in from below) when it changes. */
export function ThinkingLine({ text, className }) {
  const box = useRef(null);
  const live = useRef(null);
  const current = useRef(null);
  useLayoutEffect(() => {
    const b = box.current;
    if (current.current === null) {
      const sizer = document.createElement('span');
      sizer.className = 't-think-sizer';
      sizer.setAttribute('aria-hidden', 'true');
      sizer.textContent = text;
      const line = document.createElement('span');
      line.className = 't-think-text';
      line.textContent = text;
      line.dataset.text = text;
      b.replaceChildren(sizer, line);
      live.current = line;
      current.current = text;
      return;
    }
    if (current.current === text) return;
    current.current = text;
    const swap = cssMs('--think-swap', 150);
    const gap = cssMs('--think-gap', 50);
    const leaving = live.current;
    b.querySelector('.t-think-sizer').textContent = text; // the box hugs the current state
    leaving.classList.add('is-exit');
    const next = document.createElement('span');
    next.className = 't-think-text is-enter-start';
    next.textContent = text;
    next.dataset.text = text;
    b.appendChild(next);
    live.current = next;
    setTimeout(() => {
      void next.offsetWidth; // flush the enter-start rest state
      next.classList.remove('is-enter-start');
    }, gap);
    setTimeout(() => leaving.remove(), swap + gap);
  }, [text]);
  return <span ref={box} className={cn('t-think', className)} style={{ textAlign: 'left' }} />;
}

/* ── 34 Text swap soft ── a value that changed cross-blurs into the new one in place. */
export function SoftText({ text, className }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const prev = el.dataset.text;
    if (prev === undefined) {
      el.textContent = text;
      el.dataset.text = text;
      return;
    }
    if (prev === text) return;
    el.dataset.text = text;
    clearTimeout(el._softTimer);
    const out = document.createElement('span');
    out.className = 't-text-soft-old';
    out.setAttribute('aria-hidden', 'true');
    out.textContent = prev;
    const inn = document.createElement('span');
    inn.className = 't-text-soft-new';
    inn.textContent = text;
    const w0 = el.getBoundingClientRect().width;
    el.classList.remove('is-swapping');
    el.replaceChildren(out, inn);
    const w1 = inn.getBoundingClientRect().width;
    el.style.width = `${w0}px`;
    void el.offsetWidth; // force reflow so every transition runs
    el.classList.add('is-swapping');
    el.style.width = `${w1}px`;
    el._softTimer = setTimeout(() => {
      el.classList.remove('is-swapping');
      el.style.removeProperty('width');
      el.textContent = text;
    }, Math.max(cssMs('--text-soft-dur', 200), cssMs('--text-soft-resize-dur', 240)) + 40);
  }, [text]);
  return <span ref={ref} className={cn('t-text-soft', className)} />;
}

/* ── 04 Text states swap ── a status label exits up and the new one enters from below. */
export function SwapText({ text, className }) {
  const ref = useRef(null);
  const shown = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (shown.current === null) {
      el.textContent = text;
      shown.current = text;
      return;
    }
    if (shown.current === text) return;
    shown.current = text;
    el.classList.add('is-exit');
    const t = setTimeout(() => {
      el.textContent = text;
      el.classList.remove('is-exit');
      el.classList.add('is-enter-start');
      void el.offsetHeight; // force reflow so the next change transitions
      el.classList.remove('is-enter-start');
    }, cssMs('--text-swap-dur', 150));
    return () => clearTimeout(t);
  }, [text]);
  return <span ref={ref} className={cn('t-text-swap', className)} />;
}

/* ── 02 Number pop-in ── only the digits that changed pop in; no pop on first paint. */
export function PopNumber({ value, className }) {
  const ref = useRef(null);
  const shown = useRef(null);
  useLayoutEffect(() => {
    const str = String(value);
    if (shown.current === str) return;
    const group = ref.current;
    const prev = shown.current ?? '';
    const animate = shown.current !== null;
    shown.current = str;
    let same = 0;
    while (same < prev.length && same < str.length && prev[same] === str[same]) same++;
    group.classList.remove('is-animating');
    group.replaceChildren();
    const chars = [...str];
    chars.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 't-digit';
      span.textContent = ch;
      if (i < same) span.dataset.same = '';
      if (i === chars.length - 2) span.dataset.stagger = '1';
      else if (i === chars.length - 1) span.dataset.stagger = '2';
      group.appendChild(span);
    });
    if (!animate) return;
    void group.offsetHeight; // force reflow
    group.classList.add('is-animating');
  }, [value]);
  return <span ref={ref} className={cn('t-digit-group tabular-nums', className)} aria-label={String(value)} />;
}

/* ── 10 Success check ── the check fades, rotates upright, bobs, and draws its stroke. */
export function SuccessCheck({ show, className, style }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    // Calibrate the dash to this path's real length (rounded up by 1), per the reference.
    const path = ref.current.querySelector('path');
    const len = String(Math.ceil(path.getTotalLength()) + 1);
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
  }, []);
  return (
    <span ref={ref} className={cn('t-success-check', className)} data-state={show ? 'in' : 'out'} style={style} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" className="size-3.5">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ── 35 Donut chart ── ring sectors with even gaps and rounded corners; segments morph to new
   shares. Geometry and tween are the reference's ringPath/donut functions. */
function bezier(x1, y1, x2, y2) {
  return (t) => {
    let lo = 0;
    let hi = 1;
    let u = t;
    for (let i = 0; i < 24; i++) {
      u = (lo + hi) / 2;
      const x = 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u;
      if (x < t) lo = u;
      else hi = u;
    }
    return 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
  };
}
function easeOf(value) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(value);
  if (!m) return (t) => t;
  const [a, b, c, d] = m[1].split(',').map(parseFloat);
  return bezier(a, b, c, d);
}
function ringPath(cx, cy, ro, ri, a0, a1, gap, cr) {
  const Ro = ro - cr;
  const Ri = ri + cr;
  const h = gap / 2 + cr;
  if (Ro <= Ri) return '';
  const dO = Math.asin(Math.min(1, h / Ro));
  const dI = Math.asin(Math.min(1, h / Ri));
  const o0 = a0 + dO;
  const o1 = a1 - dO;
  const i0 = a0 + dI;
  const i1 = a1 - dI;
  if (i1 - i0 <= 0 || o1 - o0 <= 0) return ''; // too small to draw
  const pt = (r, a) => (cx + r * Math.sin(a)).toFixed(3) + ' ' + (cy - r * Math.cos(a)).toFixed(3);
  const lo = o1 - o0 > Math.PI ? 1 : 0;
  const li = i1 - i0 > Math.PI ? 1 : 0;
  return `M${pt(Ro, o0)}A${Ro} ${Ro} 0 ${lo} 1 ${pt(Ro, o1)}L${pt(Ri, i1)}A${Ri} ${Ri} 0 ${li} 0 ${pt(Ri, i0)}Z`;
}

/** values and colors stay in the same order so each segment morphs into its own new share. */
export function Donut({ values, colors, size = 140, thickness = 14, dim = -1, children }) {
  const svgRef = useRef(null);
  const current = useRef(null);
  const raf = useRef(0);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const segs = [...svg.querySelectorAll('.t-donut-seg')];
    const c = size / 2;
    const ro = c;
    const ri = ro - thickness;
    const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const draw = (vals) => {
      const total = vals.reduce((a, b) => a + b, 0);
      const gap = parseFloat(token('--chart-gap')) || 0;
      const cr = parseFloat(token('--chart-corner')) || 0;
      const nonZero = vals.filter((v) => v > 0).length;
      let a = 0;
      vals.forEach((v, k) => {
        const span = total ? (v / total) * Math.PI * 2 : 0;
        // A single segment would leave a gap at the top; draw it as a full ring instead.
        segs[k].setAttribute('d', nonZero === 1 && v > 0 ? ringPath(c, c, ro, ri, 0, Math.PI * 2 - 0.0001, 0, cr) : ringPath(c, c, ro, ri, a, a + span, gap, cr));
        segs[k].style.strokeWidth = 2 * cr;
        a += span;
      });
    };
    cancelAnimationFrame(raf.current);
    const from = current.current;
    const to = values.slice();
    current.current = to;
    const dur = parseFloat(token('--chart-morph-dur')) || 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || !dur || reduce) {
      draw(to);
      return;
    }
    const ease = easeOf(token('--chart-morph-ease'));
    const t0 = performance.now();
    (function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      const e = ease(t);
      draw(from.map((f, k) => f + (to[k] - f) * e));
      if (t < 1) raf.current = requestAnimationFrame(step);
    })(t0);
  }, [values.join(','), size, thickness]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <div className="t-donut" style={{ width: size, height: size }}>
      <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {colors.map((color, k) => (
          <path key={k} className={cn('t-donut-seg', dim >= 0 && dim !== k && 'is-dim')} style={{ fill: color, stroke: color }} />
        ))}
      </svg>
      <div className="t-donut-center">{children}</div>
    </div>
  );
}

/* ── 07 Panel reveal ── mount closed, reflow, open; on hide, close and unmount after the
   close transition. Attach the returned ref to the .t-panel-slide element. */
export function usePresence(value) {
  const show = Boolean(value);
  const last = useRef(value);
  if (value) last.current = value;
  const ref = useRef(null);
  const [mounted, setMounted] = useState(show);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    setOpen(false);
    const t = setTimeout(() => setMounted(false), cssMs('--panel-close-dur', 350));
    return () => clearTimeout(t);
  }, [show]);
  useLayoutEffect(() => {
    if (!show || !mounted || open || !ref.current) return;
    void ref.current.offsetHeight; // force reflow so the closed state is the transition's start
    setOpen(true);
  }, [show, mounted, open]);
  return { ref, mounted, open, value: last.current };
}
