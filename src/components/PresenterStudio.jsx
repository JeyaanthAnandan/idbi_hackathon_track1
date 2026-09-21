import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPresenterScene, presenterIntent } from '../engine/presenter.js';
import { cashflow, fmt, fmtCompact, sipFutureValue } from '../engine/analytics.js';
import { holdings, spendByCategory, dataQuality } from '../data/customer.js';
import { speak, stopSpeaking, listen } from '../engine/speech.js';
import { returnScenario } from '../data/policy.js';
import Avatar from './Avatar.jsx';
import TalkingHeadAvatar from './TalkingHeadAvatar.jsx';
import { supportsTalkingHead } from '../engine/talkingHeadMotion.js';
import { CHARACTERS, getCharacter, savedCharacter, saveCharacter } from '../engine/characters.js';

// Only one 3D avatar exists today (see talkingHeadMotion.js) — on a device that
// can render it, the stage always shows that single character regardless of
// which of the 4 SVG characters is selected, so the "change character" picker
// (which only affects the 2D SVG) would be misleading there. It still applies
// normally on devices where TalkingHeadAvatar falls back to the SVG avatar.
const hideCharacterPicker = supportsTalkingHead();
import '../presenter.css';
import '../presenter-integrated.css';

const TOPICS = [['portfolio', 'Investment gains'], ['spending', 'Spending'], ['growth', 'SIP projection']];

export function PresenterBars({ scene, target, onSelect, guidePrefix, disabled = false }) {
  const extent = Math.max(1, ...scene.bars.map((b) => Math.max(Math.abs(b.value), b.reference || 0)));
  return <div className="presenter-bars" aria-label={scene.unit}>
    {scene.bars.map((bar) => <button key={bar.id} type="button"
      className={`presenter-bar-row ${target === bar.id ? 'selected' : ''} ${bar.value < 0 ? 'negative' : ''}`}
      aria-pressed={target === bar.id} aria-label={`Explain ${bar.label}: ${fmt(bar.value)}`}
      data-guide-target={guidePrefix ? `${guidePrefix}${bar.id}` : undefined} disabled={disabled}
      onClick={() => onSelect(scene.steps.findIndex((step) => step.target === bar.id))}>
      <span className="presenter-bar-label">{bar.label}</span>
      <span className="presenter-bar-track">
        <span className="presenter-bar-fill" style={{ width: `${Math.abs(bar.value) / extent * 100}%` }} />
        {bar.reference !== null && bar.reference !== undefined && <span className="presenter-bar-average" style={{ left: `${bar.reference / extent * 100}%` }} />}
      </span>
      <strong>{fmtCompact(bar.value)}</strong>
      <span className="presenter-bar-pointer" aria-hidden="true">←</span>
    </button>)}
    {!scene.bars.length && <p className="presenter-empty">No values available. Try the SIP projection to explore a scenario.</p>}
    {scene.bars.some((b) => b.value < 0) && <p className="presenter-chart-key">Red bars show losses; lengths show their absolute amount.</p>}
  </div>;
}

function GrowthTimeline({ series, target }) {
  const max = Math.max(1, ...series.map((p) => p.value));
  const x = (i) => 12 + i / Math.max(1, series.length - 1) * 576;
  const y = (v) => 113 - v / max * 100;
  const path = (key) => series.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[key])}`).join(' ');
  return <div className={`presenter-timeline focus-${target}`}>
    <svg viewBox="0 0 600 128" role="img" aria-label="Projected value and contributions over time">
      <path d={`${path('value')} L588,113 L12,113 Z`} fill="rgba(15,140,126,.1)" />
      <path d={path('value')} fill="none" stroke="#087d70" strokeWidth="3" />
      <path d={path('invested')} fill="none" stroke="#718781" strokeWidth="2" strokeDasharray="5 5" />
      <circle cx="588" cy={y(series.at(-1)?.value || 0)} r="5" fill="#e97430" />
    </svg>
    <div><span>Today</span><span>— Projected value · - - Contributions</span><span>Year {series.at(-1)?.year}</span></div>
  </div>;
}

export default function PresenterStudio({ onClose, riskProfile = 'Balanced', demo = false, embedded = false, compact = false, initialTopic = 'portfolio', initialScenario, initialSpending, initialVoice = true, onAsk }) {
  const [topic, setTopic] = useState(initialTopic);
  const [monthly, setMonthly] = useState(() => initialScenario?.monthly ?? Math.max(1000, Math.min(50000, Math.round(Math.max(0, cashflow().surplus) / 500) * 500)));
  const [years, setYears] = useState(initialScenario?.years ?? 10);
  const [rate, setRate] = useState(initialScenario?.rate ?? returnScenario(riskProfile).base);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(initialVoice);
  const [status, setStatus] = useState('Ready when you are');
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [character, setCharacter] = useState(savedCharacter);
  const [chooseOpen, setChooseOpen] = useState(!embedded);
  const [completed, setCompleted] = useState(false);
  const [previewGesture, setPreviewGesture] = useState('wave');
  const [sample, setSample] = useState('');
  const [elevation, setElevation] = useState(0);
  const person = getCharacter(character);
  const actionTimer = useRef(null);
  const [replay, setReplay] = useState(0);
  const generation = useRef(0);
  const mic = useRef(null);
  const mounted = useRef(false);
  const voiceSession = useRef(0);
  const closeRef = useRef(null);
  const surfaceRef = useRef(null);
  const isDemoData = demo || dataQuality.sources?.some((source) => /synthetic|demo/i.test(source));
  const series = useMemo(() => Array.from({ length: Math.ceil(years) + 1 }, (_, index) => {
    const year = Math.min(index, years);
    return { year, value: sipFutureValue(monthly, rate, year), invested: monthly * year * 12 };
  }), [monthly, rate, years]);
  const scene = useMemo(() => buildPresenterScene({ topic, holdings, spending: initialSpending || spendByCategory, monthly, years, rate, series }), [topic, monthly, years, rate, series, initialSpending]);
  const current = scene.steps[Math.min(step, scene.steps.length - 1)];
  const right = (step > scene.steps.length / 2) !== flipped;
  const gesture = completed ? 'thumbs-up' : listening ? 'listen' : previewGesture || (current.target ? right ? 'point-left' : 'point-right' : speaking ? 'explain' : 'idle');

  useEffect(() => {
    actionTimer.current = setTimeout(() => setPreviewGesture(null), 2600);
    return () => clearTimeout(actionTimer.current);
  }, []);

  useEffect(() => {
    // Recalculate the pointing elevation when layout or the active bar changes.
    const update = () => {
      const bar = surfaceRef.current?.querySelector('.presenter-bar-row.selected');
      const face = surfaceRef.current?.querySelector('.presenter-avatar-wrap');
      if (!bar || !face) { setElevation(0); return; }
      const a = bar.getBoundingClientRect(), b = face.getBoundingClientRect();
      const angle = Math.atan2(a.top + a.height / 2 - (b.top + b.height * .66), Math.max(100, Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)))) * 180 / Math.PI;
      setElevation(Math.max(-25, Math.min(25, angle)));
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    const settle = setTimeout(update, 1100);
    return () => { observer?.disconnect(); clearTimeout(settle); };
  }, [current.target, right, topic]);

  useEffect(() => {
    mounted.current = true;
    const previousFocus = document.activeElement;
    const inOverlay = !!surfaceRef.current?.closest('.presenter-overlay');
    const appRoot = document.getElementById('root');
    const previousInert = appRoot?.inert;
    const previousOverflow = document.body.style.overflow;
    if (inOverlay) {
      if (appRoot) appRoot.inert = true;
      document.body.style.overflow = 'hidden';
    }
    closeRef.current?.focus();
    return () => {
      mounted.current = false;
      voiceSession.current++;
      generation.current++;
      stopSpeaking();
      mic.current?.abort?.();
      clearTimeout(actionTimer.current);
      if (inOverlay) {
        if (appRoot) appRoot.inert = previousInert;
        document.body.style.overflow = previousOverflow;
      }
      previousFocus?.focus?.();
    };
  }, []);

  // Each step owns one audio utterance. Completion advances the chart;
  // changing topic, interrupting or leaving invalidates all old callbacks.
  useEffect(() => {
    const run = ++generation.current;
    let timer, gestureTimer;
    setSpeaking(false);
    if (!playing && !sample) { setStatus(completed ? 'Nice work · you’ve got this!' : 'Ready · let’s explore'); return undefined; }
    const active = () => mounted.current && generation.current === run;
    const done = () => {
      if (!active()) return;
      setSpeaking(false);
      if (sample) {
        setSample(''); setCompleted(true); setPreviewGesture(null);
        setNotice('That’s the vibe! Now select a chart and let’s explore your numbers.');
        return;
      }
      setStatus('Next insight…');
      timer = setTimeout(() => {
        if (!active()) return;
        if (step < scene.steps.length - 1) setStep((s) => s + 1);
        else { setPlaying(false); setCompleted(true); setNotice('You’ve got the picture! Try another view or change the scenario.'); }
      }, 650);
    };
    if (voice) {
      setStatus('Preparing voice…');
      const supported = speak(sample || current.text, {
        lang: 'en',
        speaker: ({ asha: 'neha', aarav: 'kabir', tara: 'tanya', kabir: 'rahul' })[character],
        voiceGender: person.gender,
        playful: person.style === 'playful',
        onStart: (engine) => { if (active()) {
          setSpeaking(true); setStatus(engine === 'sarvam' ? `${person.name} is explaining` : `${person.name} · device voice`);
          if (sample) gestureTimer = setTimeout(() => { if (active()) setPreviewGesture(right ? 'point-left' : 'point-right'); }, 2300);
        } },
        onEnd: done,
        onFallback: () => { if (active()) setNotice('Using your device voice.'); },
      });
      if (!supported) {
        setVoice(false);
        setSample('');
        setNotice('Audio is unavailable. The caption walkthrough still works.');
      }
    } else {
      setStatus('Caption walkthrough');
      if (sample) gestureTimer = setTimeout(() => { if (active()) setPreviewGesture(right ? 'point-left' : 'point-right'); }, 2300);
      timer = setTimeout(done, Math.max(4500, (sample || current.text).split(/\s+/).length * 280));
    }
    return () => { generation.current++; clearTimeout(timer); clearTimeout(gestureTimer); stopSpeaking(); };
  }, [playing, step, current, scene, voice, replay, sample, character, completed]);

  const interrupt = () => {
    generation.current++;
    voiceSession.current++;
    stopSpeaking();
    mic.current?.abort?.();
    mic.current = null;
    setListening(false);
    setSpeaking(false);
    setPlaying(false);
    setSample('');
    setCompleted(false);
    setPreviewGesture(null);
    clearTimeout(actionTimer.current);
  };
  const selectStep = (index) => { interrupt(); setStep(index); setPlaying(true); setReplay((v) => v + 1); setNotice(''); };
  const selectTopic = (next) => { interrupt(); setTopic(next); setStep(0); setNotice(''); };
  const command = (question) => {
    interrupt();
    const intent = presenterIntent(question);
    setText('');
    if (intent === 'pause') { setNotice('Paused. Take your time.'); return; }
    if (intent === 'next') { selectStep(Math.min(step + 1, scene.steps.length - 1)); return; }
    if (intent === 'repeat') { selectStep(step); return; }
    if (intent) { setTopic(intent); setStep(0); setPlaying(true); setReplay((v) => v + 1); setNotice(''); return; }
    const match = scene.steps.findIndex((s) => s.target && question.toLowerCase().includes(s.label.toLowerCase()));
    if (match >= 0) { selectStep(match); return; }
    if (onAsk) { onAsk(question); return; }
    setNotice('Try “show my profits”, “explain spending”, “show SIP growth”, “next”, or select a bar. For other questions, return to MITRA chat.');
  };
  const startMic = () => {
    if (listening) { mic.current?.stop?.(); return; }
    interrupt();
    const run = ++voiceSession.current;
    const active = () => mounted.current && voiceSession.current === run;
    setNotice('');
    setListening(true);
    setStatus('Listening · ask in English');
    try {
      mic.current = listen({ lang: 'en', autoDetect: false,
        onResult: (value) => { if (active()) { setListening(false); command(value); } },
        onEnd: () => { if (active()) setListening(false); },
        onTranscribing: (value) => { if (active() && value) setStatus('Understanding…'); },
        onError: () => { if (active()) { setListening(false); setStatus('Microphone unavailable'); setNotice('Could not hear that. Type your request below or try the microphone again.'); } },
      });
      if (!mic.current) { setListening(false); setNotice('Voice input is unavailable here. You can type your request.'); }
    } catch { setListening(false); setNotice('Microphone unavailable. Type your request below.'); }
  };
  const adjust = (setter, value) => { interrupt(); setter(Number(value)); setStep(0); setNotice('Scenario updated. Play the explanation to hear the new figures.'); };
  const perform = (action) => {
    interrupt();
    setPreviewGesture(action);
    actionTimer.current = setTimeout(() => setPreviewGesture(null), 2600);
  };
  const meetCharacter = () => {
    interrupt();
    setPreviewGesture('wave');
    setSample(`Hi! I’m ${person.name}, your money buddy. Let’s make these numbers click. I’ll point out what matters, and you can stop me whenever you like. Ready? You’ve got this!`);
    setReplay((v) => v + 1);
  };

  const Surface = embedded ? 'section' : 'main';
  return <Surface ref={surfaceRef} className={`presenter-studio ${embedded ? 'presenter-integrated' : ''} ${compact ? 'presenter-compact' : ''}`} aria-label="MITRA chart explanation" onKeyDown={(e) => {
    if (e.key === 'Escape') interrupt();
    if (e.key === 'Tab' && surfaceRef.current?.closest('.presenter-overlay')) {
      const controls = Array.from(surfaceRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)'));
      const first = controls[0];
      const last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    {embedded ? <header className="integrated-presenter-heading">
      <div><span className="web-eyebrow">MITRA · Guided insights</span><h2>Your numbers, explained.</h2></div>
      <button ref={closeRef} type="button" className="ghost-btn" onClick={() => { interrupt(); onClose(); }}><span aria-hidden="true">← </span>{compact ? 'Back to chat' : 'Back to overview'}</button>
    </header> : <header className="presenter-header">
      <div className="presenter-brand"><span className="presenter-brand-mark">m<span>•</span></span><div><b>MITRA</b><span>Your wealth, in conversation</span></div></div>
      <span className="presenter-preview-tag">Presenter prototype</span>
      <button ref={closeRef} type="button" onClick={() => { interrupt(); onClose(); }} className="presenter-exit">Back to MITRA ↗</button>
    </header>}
    <div className="presenter-toolbar">
      <nav aria-label="Presentation topic">{TOPICS.map(([id, label], i) => <button key={id} type="button" aria-pressed={topic === id} onClick={() => selectTopic(id)} className={topic === id ? 'active' : ''}><span>0{i + 1}</span>{label}</button>)}</nav>
      <div className="presenter-stage-tools"><button type="button" onClick={() => setFlipped((v) => !v)}>⇄ Switch sides</button><button type="button" aria-pressed={voice} onClick={() => { interrupt(); setVoice((v) => !v); }}>Voice {voice ? 'on' : 'off'}</button></div>
    </div>
    {embedded && !hideCharacterPicker && <button className="integrated-character-toggle" type="button" aria-expanded={chooseOpen} onClick={() => setChooseOpen((value) => !value)}><Avatar character={character} size={32} /><span>Your guide: <strong>{person.name}</strong></span><span>{chooseOpen ? 'Done' : 'Change character'}⌄</span></button>}
    {!hideCharacterPicker && <section className="presenter-character-picker" aria-label="Choose your animated guide" hidden={!chooseOpen}>
      <div><strong>Pick your money buddy</strong><span>A little personality. The same clear numbers.</span></div>
      <div className="presenter-character-options">{CHARACTERS.map((choice) => <button type="button" key={choice.id} aria-pressed={character === choice.id} className={character === choice.id ? 'chosen' : ''} onClick={() => {
        interrupt(); setCharacter(choice.id); saveCharacter(choice.id); setPreviewGesture('wave');
        actionTimer.current = setTimeout(() => setPreviewGesture(null), 2600);
      }}><Avatar character={choice.id} size={46} /><span><strong>{choice.name}</strong><small>{choice.label}</small></span>{character === choice.id && <i aria-hidden="true">✓</i>}</button>)}</div>
    </section>}
    <div className={`presenter-stage ${right ? 'presenter-on-right' : ''}`}>
      <section className={`presenter-person ${speaking ? 'is-talking' : ''} ${completed ? 'is-celebrating' : ''}`} aria-label={`${person.name}, animated presenter`}>
        <div className="presenter-person-heading"><span className={`presenter-live-dot ${speaking || listening ? 'active' : ''}`} /><span>{listening ? 'Listening to you' : speaking ? 'Explaining your numbers' : 'Meet your money guide'}</span></div>
        <div className="presenter-character-bubble" aria-live="polite">{completed ? 'You’ve got this! ✨' : listening ? 'I’m all ears…' : sample ? `Hey! I’m ${person.name} 👋` : current.target ? 'Let’s look right here.' : 'Big numbers, small steps.'}</div>
        <div className="presenter-avatar-wrap">
          <TalkingHeadAvatar character={character} size={330} stage speaking={speaking} mood={completed ? 'excited' : listening ? 'thinking' : 'happy'} gesture={gesture} gaze={current.target && !completed ? right ? 'left' : 'right' : 'center'} elevation={elevation} />
          {completed && <div className="presenter-celebration" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>}
        </div>
        <div className="presenter-person-name"><strong>{person.name}<span>●</span></strong><span>{person.style === 'playful' ? 'Your curious money buddy' : 'Your friendly wealth guide'}</span></div>
        <button type="button" className="presenter-meet" onClick={meetCharacter}>▶ Meet {person.name}</button>
        <div className="presenter-gesture-controls" aria-label="Try character actions">
          <button type="button" onClick={() => perform('wave')}>👋 Wave</button>
          <button type="button" onClick={() => perform(right ? 'point-left' : 'point-right')}>☞ Point</button>
          <button type="button" onClick={() => perform('thumbs-up')}>👍 Nice!</button>
        </div>
      </section>
      <section className="presenter-board" aria-labelledby="presenter-chart-title">
        <div className="presenter-board-heading"><span>{scene.eyebrow}</span><span>{isDemoData ? 'Demo data' : 'Current data snapshot'}</span></div>
        <h1 id="presenter-chart-title">{scene.title}</h1>
        <div className="presenter-stats">{scene.stats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong>{stat.text ?? fmtCompact(stat.value)}</strong></div>)}</div>
        <div className="presenter-chart-heading"><span>{scene.unit}</span><span>Select a bar to hear why ↙</span></div>
        <PresenterBars key={topic} scene={scene} target={current.target} onSelect={selectStep} />
        {topic === 'growth' && <><GrowthTimeline series={series} target={current.target} /><div className="presenter-sliders">
          <label>Monthly SIP <strong>{fmt(monthly)}</strong><input type="range" min="0" max={Math.max(50000, monthly)} step="any" value={monthly} onChange={(e) => adjust(setMonthly, Math.round(Number(e.target.value) / 500) * 500)} /></label>
          <label>Years <strong>{years}</strong><input type="range" min={Math.min(1, years)} max={Math.max(30, years)} step="any" value={years} onChange={(e) => adjust(setYears, Math.max(.5, Math.round(Number(e.target.value) * 2) / 2))} /></label>
          <label>Annual return <strong>{rate}%</strong><input type="range" min="0" max={Math.max(15, rate)} step="any" value={rate} onChange={(e) => adjust(setRate, Math.round(Number(e.target.value) * 2) / 2)} /></label>
        </div></>}
        <p className="presenter-data-note">{scene.note}</p>
      </section>
    </div>
    <section className="presenter-conversation" aria-label="Presentation controls and captions">
      <div className="presenter-caption-meta"><span><i className={speaking ? 'animated' : ''}>▂▅▃▆▂</i>{status}</span><span>{step + 1} / {scene.steps.length} · {current.label}</span></div>
      <p className="presenter-caption" aria-live="polite">{sample || current.text}</p>
      <div className="presenter-transport">
        <button type="button" className="presenter-play" onClick={() => { if (playing || listening || sample) interrupt(); else { interrupt(); setPlaying(true); setReplay((v) => v + 1); setNotice(''); } }}>{playing || listening || sample ? 'Ⅱ Pause' : '▶ Play explanation'}</button>
        <button type="button" disabled={step === 0} onClick={() => selectStep(step - 1)}>← Previous</button>
        <button type="button" disabled={step === scene.steps.length - 1} onClick={() => selectStep(step + 1)}>Next →</button>
        <span className="presenter-transport-hint">You can interrupt at any time</span>
      </div>
      <form className="presenter-ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) command(text.trim()); }}>
        <button type="button" aria-label={listening ? 'Finish speaking' : 'Ask MITRA by voice'} aria-pressed={listening} className={listening ? 'listening' : ''} onClick={startMic}>{listening ? '■' : '🎙'}</button>
        <input aria-label="Ask the presenter" value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “show my profits” or “explain spending”…" />
        <button type="submit" disabled={!text.trim()}>Ask ↗</button>
      </form>
      {notice && <p className="presenter-notice" role="status">{notice}</p>}
    </section>
  </Surface>;
}
