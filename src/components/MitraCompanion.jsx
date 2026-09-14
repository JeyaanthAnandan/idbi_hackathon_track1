import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { CHARACTERS, getCharacter, savedCharacter, saveCharacter } from '../engine/characters.js';
import { UI_TARGETS, planAvatarDirection } from '../engine/avatarDirector.js';
import { hasSarvam, selectSarvamAdvisorTool } from '../engine/sarvam.js';
import { hasDeepSeek, selectDeepSeekAdvisorTool } from '../engine/deepseek.js';
import { speak, stopSpeaking } from '../engine/speech.js';
import useGuideTarget from './useGuideTarget.js';
import '../companion.css';

const TOUR = ['home-summary', 'wealth-allocation', 'simulator-chart'];
export default function MitraCompanion({ onNavigate, onAsk, enabled = true, busy = false }) {
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem('mitra-companion-dismissed') !== '1'; } catch { return true; } });
  const [inCall, setInCall] = useState(false);
  const [character, setCharacter] = useState(savedCharacter);
  const [copy, setCopy] = useState('What would you like to do today?');
  const [target, setTarget] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [gesture, setGesture] = useState('wave');
  const [planning, setPlanning] = useState(false);
  const [tour, setTour] = useState(-1);
  const [query, setQuery] = useState('');
  const avatarRef = useRef(null), request = useRef(null), speechOwner = useRef(false);
  const person = getCharacter(character);
  const visible = enabled && !inCall;
  const line = useGuideTarget(target, avatarRef, visible && open && !busy);
  const left = line && line.x2 < line.x1;
  const elevation = line ? Math.max(-25, Math.min(25, Math.atan2(line.y2 - line.y1, Math.abs(line.x2 - line.x1)) * 180 / Math.PI)) : 0;

  const cancel = () => {
    request.current?.abort();
    if (speechOwner.current) stopSpeaking();
    speechOwner.current = false; setSpeaking(false); setPlanning(false);
  };
  useEffect(() => {
    const changed = (e) => setCharacter(e.detail);
    const call = (e) => { setInCall(!!e.detail); if (e.detail) { cancel(); setTarget(null); } };
    window.addEventListener('mitra-character', changed);
    window.addEventListener('mitra-call-state', call);
    return () => { window.removeEventListener('mitra-character', changed); window.removeEventListener('mitra-call-state', call); request.current?.abort(); if (speechOwner.current) stopSpeaking(); };
  }, []);
  useEffect(() => { if (!enabled || busy) { cancel(); setTarget(null); } }, [enabled, busy]);

  const say = (text, finish = 'idle') => {
    setCopy(text); speechOwner.current = true;
    speak(text, { speaker: ({ asha: 'neha', aarav: 'kabir', tara: 'tanya', kabir: 'rahul' })[character], voiceGender: person.gender, playful: person.style === 'playful',
      onStart: () => setSpeaking(true), onEnd: () => { speechOwner.current = false; setSpeaking(false); setGesture(finish); },
    });
  };
  const showTarget = (id) => {
    const item = UI_TARGETS[id];
    if (!item) return;
    onNavigate(item.page); setTarget(id); setGesture('idle'); say(item.copy);
  };
  const tourStep = (index) => { cancel(); setTour(index); showTarget(TOUR[index]); };
  const finish = () => { cancel(); setTour(-1); setTarget(null); setGesture('thumbs-up'); say('You’re all set! Ask me whenever you want to explore your money.', 'thumbs-up'); };
  const guide = async (question) => {
    if (busy || !question.trim()) return;
    cancel(); setTour(-1); setPlanning(true); setQuery(''); setTarget(null);
    const controller = new AbortController(); request.current = controller;
    const plan = await planAvatarDirection({ question, surface: 'page', signal: controller.signal,
      routers: [hasSarvam() && selectSarvamAdvisorTool, hasDeepSeek() && selectDeepSeekAdvisorTool].filter(Boolean),
    });
    if (controller.signal.aborted) return;
    setPlanning(false);
    // A page guide has one visible destination at a time. Resolve its final
    // pointing target, then navigate before measuring the rendered element.
    const destination = [...plan.steps].reverse().find((step) => step.action === 'point' || step.action === 'navigate');
    if (destination) showTarget(destination.target);
    else { setGesture(plan.steps.at(-1)?.target || 'wave'); say('Hi! I can show your wealth, spending or future projections.'); }
  };
  const dismiss = () => { cancel(); setOpen(false); setTarget(null); setTour(-1); try { sessionStorage.setItem('mitra-companion-dismissed', '1'); } catch { /* optional preference */ } };
  if (!visible) return null;
  return <aside className={`mitra-companion ${open ? 'is-open' : 'is-collapsed'}`} aria-label="MITRA screen guide">
    <button ref={avatarRef} type="button" className="mitra-pet" aria-label={open ? 'Say hello to MITRA' : 'Open MITRA guide'} aria-expanded={open} disabled={busy} onClick={() => { setOpen(true); setTarget(null); setGesture('wave'); say(`Hi, I’m ${person.name}, your MITRA. What would you like to do today?`); }}>
      <Avatar size={110} stage speaking={speaking} gesture={line ? left ? 'point-left' : 'point-right' : gesture} gaze={line ? left ? 'left' : 'right' : 'center'} elevation={elevation} mood="happy" />
      {!open && <span>Need a hand?</span>}
    </button>
    {open && <div className="mitra-companion-bubble"><div className="mitra-companion-title"><strong>Hi, I’m {person.name} <span>✦</span></strong><button type="button" aria-label="Minimise MITRA guide" onClick={dismiss}>×</button></div><p aria-live="polite">{planning ? 'Finding the right place for you…' : copy}</p>
      {tour >= 0 ? <div className="mitra-companion-actions"><small>{tour + 1} / {TOUR.length}</small>{tour > 0 && <button type="button" disabled={busy} onClick={() => tourStep(tour - 1)}>Back</button>}<button type="button" disabled={busy} onClick={() => tour < TOUR.length - 1 ? tourStep(tour + 1) : finish()}>{tour < TOUR.length - 1 ? 'Next stop →' : 'Got it! 👍'}</button></div>
        : <div className="mitra-companion-actions"><button type="button" disabled={busy || planning} onClick={() => tourStep(0)}>Show me around</button><button type="button" disabled={busy || planning} onClick={() => guide('Show my wealth allocation')}>My wealth</button><button type="button" disabled={busy} onClick={() => { cancel(); setOpen(false); onAsk('Show my portfolio'); }}>Let’s talk ↗</button></div>}
      <form onSubmit={(e) => { e.preventDefault(); guide(query); }}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Where can I see my spending?" aria-label="Ask MITRA where to look" /><button type="submit" disabled={busy || planning || !query.trim()} aria-label="Find this section">→</button></form>
      <label className="mitra-companion-choice">Your guide <select aria-label="Choose your companion" value={character} disabled={speaking} onChange={(e) => { setCharacter(e.target.value); saveCharacter(e.target.value); }}>{CHARACTERS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.label}</option>)}</select></label>
    </div>}
    {line && <svg className="mitra-guide-line" aria-hidden="true"><path d={`M${line.x1} ${line.y1} Q${line.x1} ${line.y2} ${line.x2} ${line.y2}`} /><circle cx={line.x2} cy={line.y2} r="5" /></svg>}
  </aside>;
}
