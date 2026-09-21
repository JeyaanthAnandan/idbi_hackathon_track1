import React, { useEffect, useRef, useState } from 'react';
import TalkingHeadAvatar from './TalkingHeadAvatar.jsx';
import ChatWidget from './ChatWidgets.jsx';
import { PresenterBars } from './PresenterStudio.jsx';
import { callSceneForWidget } from '../engine/presenter.js';
import { holdings } from '../data/customer.js';
import AdvicePassport from './AdvicePassport.jsx';
import Icon from './Icons.jsx';
import { getCharacter, savedCharacter } from '../engine/characters.js';
import { getAvatarMode } from '../engine/avatarMode.js';
import useGuideTarget from './useGuideTarget.js';
import '../companion.css';

export default function FullScreenCall({ messages, caption, heard, interim, speaking, listening, transcribing, typing, preparing, secs, error, voiceOn, micLevel, direction, onSend, onMic, onMute, onEnd, onPause, onExplain, completion = 0 }) {
  const [input, setInput] = useState('');
  const [focus, setFocus] = useState(null);
  const [chartVisible, setChartVisible] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const [manualGesture, setManualGesture] = useState(null);
  // Greet with a namaste the instant the call opens — FullScreenCall remounts
  // fresh each time a call starts, so this state is naturally true exactly once
  // per call, ahead of any AI-directed gesture.
  const [justStarted, setJustStarted] = useState(true);
  // 2D mode restores the original pointing/gaze/guide-line behavior in full;
  // 3D mode uses TalkingHead's own gestures instead (no line, no point pose —
  // she can't visually "point at" a 2D DOM element with a 3D hand the same way).
  const [avatarMode, setAvatarModeState] = useState(getAvatarMode);
  const is2D = avatarMode !== '3d';
  useEffect(() => {
    const onModeChange = (event) => setAvatarModeState(event.detail);
    window.addEventListener('mitra-avatar-mode', onModeChange);
    return () => window.removeEventListener('mitra-avatar-mode', onModeChange);
  }, []);
  const rootRef = useRef(null), avatarRef = useRef(null), endRef = useRef(null);
  const person = getCharacter(savedCharacter());
  const latest = messages.filter((m) => m.from === 'mitra').at(-1);
  const widget = latest?.widget;
  const scene = callSceneForWidget(widget, holdings);
  const line = useGuideTarget(focus, avatarRef, is2D);
  const left = line && line.x2 < line.x1;
  const elevation = line ? Math.max(-25, Math.min(25, Math.atan2(line.y2 - line.y1, Math.abs(line.x2 - line.x1)) * 180 / Math.PI)) : 0;
  const gesture = justStarted ? 'wave' : celebrating ? 'thumbs-up' : listening ? 'listen'
    : is2D && focus ? (left ? 'point-left' : 'point-right')
    : manualGesture || (speaking ? 'explain' : 'idle');

  useEffect(() => {
    const timer = setTimeout(() => setJustStarted(false), 2600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    const app = document.getElementById('root'), inert = app?.inert;
    const overflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = 'hidden';
    endRef.current?.focus();
    return () => { if (app) app.inert = inert; document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  useEffect(() => {
    setFocus(null); setChartVisible(!!widget); setManualGesture(null);
    const timers = (direction?.steps || []).map((step, index) => setTimeout(() => {
      if (step.action === 'open_chart' && widget) setChartVisible(true);
      if (step.action === 'point') { if (step.target === 'call-chart' || step.target.startsWith('call-bar-')) setChartVisible(true); setFocus(step.target); }
      if (step.action === 'gesture') { setFocus(null); setManualGesture(step.target); }
    }, index * 650));
    return () => timers.forEach(clearTimeout);
  }, [direction, latest?.id]);

  useEffect(() => {
    if (!completion) return undefined;
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), 1600);
    return () => clearTimeout(timer);
  }, [completion]);
  useEffect(() => { if (speaking || typing) setCelebrating(false); }, [speaking, typing]);

  const submit = (text) => { if (typing || transcribing || !text.trim()) return; setInput(''); setCelebrating(false); onSend(text); };
  const status = listening ? 'Listening to you' : transcribing ? 'Transcribing your words…' : typing ? 'Working through your question…' : preparing ? 'Preparing voice…' : speaking ? `${person.name} is speaking` : 'Your turn';
  return <section ref={rootRef} className="mitra-call-room" role="dialog" aria-modal="true" aria-label="Full-screen MITRA conversation" data-surface="night" onKeyDown={(e) => {
    if (e.key === 'Escape') { e.preventDefault(); onEnd(); }
    if (e.key === 'Tab') {
      const controls = [...rootRef.current.querySelectorAll('button:not(:disabled), input, summary')].filter((element) => element.getClientRects().length);
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
    }
  }}>
    <header className="mitra-call-header"><div><span className="eyebrow">MITRA · Live conversation</span><h1>Let’s talk about your money.</h1></div><span className="mitra-call-clock">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span><button ref={endRef} type="button" className="mitra-call-end" onClick={onEnd}><Icon name="phone" size={17} />End call</button></header>
    <div className="mitra-call-workspace">
      <aside className="mitra-call-guide"><div ref={avatarRef}><TalkingHeadAvatar size={270} stage speaking={speaking} mood={celebrating ? 'excited' : typing ? 'thinking' : 'happy'} gesture={gesture} gaze={is2D && focus ? (left ? 'left' : 'right') : 'center'} elevation={elevation} /></div><h2>{person.name}</h2><p role="status">{status}</p><div className="mitra-call-meter" aria-label={listening ? 'Microphone level' : 'Voice status'}>{[.4,.75,1,.6,.9,.5,.8].map((v,i) => <i key={i} style={{ height: `${6 + (listening ? micLevel : speaking ? .5 : .08) * v * 35}px` }} />)}</div>{is2D && <p className="mitra-call-hint">I’ll bring up the chart and show you where to look.</p>}<button type="button" className="ghost-btn" onClick={onPause}>Pause voice & microphone</button></aside>
      <div className="mitra-call-content">
        <section className="mitra-call-your-words" data-guide-target="call-transcript" aria-label="Your spoken transcript"><span className="eyebrow">Your words</span><p aria-live="polite">{interim || heard || (listening ? 'Listening… your transcript will appear here.' : 'Speak or type a question to begin.')}</p>{transcribing && <small>Turning your recording into text…</small>}</section>
        <div className={`mitra-call-panels ${widget && chartVisible ? 'has-chart' : ''}`}>
          <section className="mitra-call-transcript" aria-label="Complete conversation"><div className="mitra-call-panel-heading"><h2>Conversation</h2>{widget && <button type="button" onClick={() => { setChartVisible((v) => !v); setFocus(null); }}>{chartVisible ? 'Hide chart' : 'Open chart'}</button>}</div>
            {!messages.length && <p className="mitra-call-response">{caption || 'Connecting…'}</p>}
            {messages.map((message) => <article key={message.id} className={`mitra-call-message ${message.from}`} data-guide-target={message.id === latest?.id ? 'call-response' : undefined}><span>{message.from === 'user' ? 'You' : person.name}</span><p>{message.text}</p>{message.passport && <AdvicePassport passport={message.passport} />}</article>)}
            {(typing || preparing) && <p className="mitra-call-working" role="status">{status}</p>}
          </section>
          {widget && chartVisible && <section className="mitra-call-chart" data-guide-target="call-chart" aria-label="Chart for the current answer"><div className="mitra-call-panel-heading"><h2>Let me show you</h2>{is2D && <button type="button" onClick={() => setFocus('call-chart')}>Point here ↙</button>}</div><ChatWidget widget={widget} onChip={submit} />{scene && <div className="mitra-call-bars"><h3>{scene.title}</h3><p>Select a bar and I’ll explain it.</p><PresenterBars scene={scene} target={focus?.replace('call-bar-', '')} guidePrefix="call-bar-" disabled={typing || transcribing} onSelect={(index) => {
              const step = scene.steps[index];
              if (!step) return;
              setFocus(`call-bar-${step.target}`); onExplain?.(step, widget);
            }} /><p className="mitra-call-chart-note">{scene.note}</p></div>}<button className="ghost-btn" type="button" disabled={typing || transcribing} onClick={() => submit('Explain this')}>Explain this answer</button></section>}
        </div>
        {error && <div className="mitra-call-error" role="alert">{error}<button type="button" disabled={typing || transcribing} onClick={onMic}>Retry microphone</button></div>}
      </div>
    </div>
    <footer className="mitra-call-footer"><div className="mitra-call-suggestions">{['Show my portfolio', 'Analyse my spending', 'Invest my surplus', 'Show my goals'].map((prompt) => <button type="button" disabled={typing || transcribing} key={prompt} onClick={() => submit(prompt)}>{prompt}</button>)}</div><form onSubmit={(e) => { e.preventDefault(); submit(input); }}><button type="button" className={listening ? 'is-listening' : ''} aria-label={listening ? 'Finish speaking' : 'Speak to MITRA'} disabled={typing || transcribing} onClick={onMic}><Icon name="mic" size={20} /></button><input aria-label="Type a question during the call" placeholder="Ask anything about your plan…" value={input} onChange={(e) => setInput(e.target.value)} /><button type="submit" disabled={typing || transcribing || !input.trim()} aria-label="Send question"><Icon name="send" size={20} /></button><button type="button" onClick={onMute} aria-label={voiceOn ? 'Mute MITRA' : 'Unmute MITRA'}><Icon name={voiceOn ? 'speaker' : 'speakerOff'} size={20} /></button></form></footer>
    {is2D && line && <svg className="mitra-guide-line" aria-hidden="true"><path d={`M${line.x1} ${line.y1} Q${line.x1 + (line.x2-line.x1)*.6} ${line.y1} ${line.x2} ${line.y2}`} /><circle cx={line.x2} cy={line.y2} r="5" /></svg>}
  </section>;
}
