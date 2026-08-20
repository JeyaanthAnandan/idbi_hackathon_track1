import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import ChatWidget from './ChatWidgets.jsx';
import { respond, fallbackResponse, financialContext } from '../engine/advisor.js';
import { speak, stopSpeaking, listen } from '../engine/speech.js';
import { fmt } from '../engine/analytics.js';
import { awardXP } from '../engine/xp.js';
import Icon from './Icons.jsx';
import {
  hasDeepSeek, reasonStream, complete, translate, analyzeOffer, extractGoal,
  chatMessages, LANGUAGES, langLabel,
} from '../engine/deepseek.js';
import { sipRequired } from '../engine/analytics.js';

let msgId = 0;
const mid = () => ++msgId;

export default function AvatarChat({ riskProfile, initialPrompt, onConsumeInitial }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [mood, setMood] = useState('happy');
  const [toast, setToast] = useState(null);
  const [lang, setLang] = useState('en');
  const langRef = useRef('en');
  langRef.current = lang;
  const [langMenu, setLangMenu] = useState(false);
  const [reasoningMode, setReasoningMode] = useState(false);
  const reasoningRef = useRef(false);
  reasoningRef.current = reasoningMode;
  const [offerMode, setOfferMode] = useState(false);
  const offerRef = useRef(false);
  offerRef.current = offerMode;
  // live streaming trace for reasoner mode { reasoning, answer }
  const [stream, setStream] = useState(null);
  const aiKey = hasDeepSeek();
  const bodyRef = useRef(null);
  const startedRef = useRef(false);

  // ── Live call state ──
  const [inCall, setInCall] = useState(false);
  const [callCaption, setCallCaption] = useState('');
  const [callListening, setCallListening] = useState(false);
  const [callSecs, setCallSecs] = useState(0);
  const [micOk, setMicOk] = useState(true);
  const inCallRef = useRef(false);
  const recRef = useRef(null);

  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };

  // Hands-free loop: after MITRA finishes speaking on a call, she listens again.
  const startCallListen = () => {
    if (!inCallRef.current) return;
    const rec = listen({
      lang: langRef.current,
      onResult: (t) => {
        setCallListening(false);
        handleSend(t);
      },
      onEnd: () => setCallListening(false),
      onError: () => {
        setCallListening(false);
        setMicOk(false);
      },
    });
    if (rec) {
      recRef.current = rec;
      setCallListening(true);
    } else {
      setMicOk(false);
    }
  };

  const pushMitra = (resp) => {
    setMood(resp.mood || 'happy');
    setMessages((m) => [...m, { id: mid(), from: 'mitra', ...resp }]);
    if (inCallRef.current) {
      setCallCaption(resp.text);
      speak(resp.text, {
        lang: langRef.current,
        onStart: () => setSpeaking(true),
        onEnd: () => {
          setSpeaking(false);
          startCallListen();
        },
      });
      return;
    }
    if (voiceOn) {
      speak(resp.text, {
        lang: langRef.current,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      });
    }
  };

  const startCall = () => {
    inCallRef.current = true;
    setInCall(true);
    setCallSecs(0);
    setMicOk(true);
    setCallCaption('');
    stopSpeaking();
    setTimeout(() => {
      pushMitra({
        mood: 'happy',
        text:
          langRef.current === 'hi'
            ? `हाँ ${'Priya'} जी, मैं सुन रही हूँ। पैसों की कोई भी बात — बेझिझक पूछिए।`
            : `Hi Priya, you're on a secure line with me. Ask me anything about your money — I'm listening.`,
      });
    }, 700);
  };

  const endCall = () => {
    inCallRef.current = false;
    setInCall(false);
    setCallListening(false);
    stopSpeaking();
    setSpeaking(false);
    try { recRef.current?.abort?.(); } catch { /* recognition may already be closed */ }
  };

  useEffect(() => {
    if (!inCall) return;
    const id = setInterval(() => setCallSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [inCall]);

  // localise a finished English reply into the active language (DeepSeek).
  const localise = async (resp) => {
    if (langRef.current === 'en' || !hasDeepSeek()) return resp;
    try {
      const text = await translate(resp.text, langRef.current);
      return { ...resp, text };
    } catch {
      return resp;
    }
  };

  const GOAL_TRIGGERS = /^(add|create|new|set)\s+(a\s+)?goal|^goal[:\-]|^i want to (buy|save|afford)|^save (up )?for/i;

  const handleSend = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    setInput('');
    stopSpeaking();
    setSpeaking(false);
    setMessages((m) => [...m, { id: mid(), from: 'user', text }]);
    setMood('thinking');

    // ── Enter Offer Analyzer mode (from a chip) ──
    if (/^check (an|another) offer/i.test(text)) {
      setOfferMode(true);
      offerRef.current = true;
      pushMitra({
        text: aiKey
          ? 'Go ahead — paste the message, WhatsApp forward, or scheme details and I\'ll check it for red flags.'
          : 'Add a DeepSeek key in Settings and I can analyse any offer for scams. For now, here\'s my manual checklist:',
        mood: 'thinking',
        widget: aiKey ? undefined : { type: 'shield', data: { checks: [
          { flag: '"Guaranteed" high returns', why: 'Nothing safe beats ~8% guaranteed in India' },
          { flag: 'Urgency to act now', why: 'Real investments never expire in hours' },
          { flag: 'Pay to a personal account', why: 'Regulated firms collect only in their own name' },
        ] } },
      });
      if (!aiKey) { setOfferMode(false); offerRef.current = false; }
      return;
    }

    setTyping(true);
    awardXP(10, 'first-chat');

    // ── Offer Analyzer mode: the next message is the offer to inspect ──
    if (offerRef.current) {
      setOfferMode(false);
      await runOfferAnalysis(text);
      return;
    }
    // ── Natural-language goal creation ──
    if (aiKey && GOAL_TRIGGERS.test(text)) {
      await runGoalCreate(text);
      return;
    }

    await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));

    // ── Rule engine first (precise, auditable numbers) ──
    const ruled = respond(text, riskProfile, hasDeepSeek() ? 'en' : langRef.current);
    if (ruled) {
      setTyping(false);
      pushMitra(await localise(ruled));
      return;
    }

    // ── Free-form → DeepSeek (reasoning trace or grounded chat) ──
    if (aiKey) {
      const history = messages.filter((m) => m.text);
      if (reasoningRef.current) {
        await runReasoner(history, text);
        return;
      }
      try {
        const { content } = await complete({
          system: financialContext(riskProfile),
          messages: chatMessages(history, text),
        });
        setTyping(false);
        pushMitra(await localise({ text: content, mood: 'happy', chips: ['Show my portfolio', 'Invest my surplus'] }));
        return;
      } catch {
        /* fall through */
      }
    }
    setTyping(false);
    pushMitra(fallbackResponse());
  };

  // ── Reasoning mode: stream R1's chain-of-thought, then the answer ──
  const runReasoner = async (history, text) => {
    setTyping(false);
    setMood('thinking');
    setStream({ reasoning: '', answer: '' });
    try {
      const { answer, reasoning } = await reasonStream({
        system: financialContext(riskProfile) + ' Think step by step about the customer\'s numbers before answering.',
        messages: chatMessages(history, text),
        onReasoning: (c) => setStream((s) => ({ ...s, reasoning: (s?.reasoning || '') + c })),
        onAnswer: (c) => setStream((s) => ({ ...s, answer: (s?.answer || '') + c })),
      });
      setStream(null);
      const localised = await localise({ text: answer || 'Let me get back to you on that.', mood: 'happy' });
      setMessages((m) => [...m, { id: mid(), from: 'mitra', ...localised, reasoning: reasoning, chips: ['Show my portfolio', 'Invest my surplus'] }]);
      if (voiceOn) speak(localised.text, { lang: langRef.current, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
      awardXP(25, 'reasoning');
    } catch {
      setStream(null);
      pushMitra(fallbackResponse());
    }
  };

  // ── Offer Analyzer: scam / mis-selling verdict on pasted text ──
  const runOfferAnalysis = async (text) => {
    setTyping(true);
    setMood('thinking');
    try {
      const a = await analyzeOffer(text);
      setTyping(false);
      if (!a) { pushMitra(fallbackResponse()); return; }
      const verdictLine = { safe: 'This looks legitimate', caution: 'Be careful with this one', avoid: 'Please do not proceed' }[a.verdict] || '';
      awardXP(20, 'offer-analysis');
      pushMitra(await localise({
        mood: a.verdict === 'avoid' ? 'thinking' : 'happy',
        text: `${verdictLine}. ${a.headline}`,
        widget: { type: 'offer', data: a },
        chips: ['Where should I invest instead?', 'Check another offer', 'Am I protected?'],
      }));
    } catch {
      setTyping(false);
      pushMitra(fallbackResponse());
    }
  };

  // ── Natural-language goal creation → SIP plan ──
  const runGoalCreate = async (text) => {
    setTyping(true);
    try {
      const g = await extractGoal(text);
      setTyping(false);
      if (!g || !g.ok) {
        pushMitra(await localise({ text: "I couldn't quite catch that goal — tell me what you want and roughly when, like \"a car in 3 years\".", mood: 'thinking', chips: ['Invest my surplus'] }));
        return;
      }
      const monthly = sipRequired(g.target, 11, g.years || 3, 0);
      awardXP(20, 'nl-goal');
      pushMitra(await localise({
        mood: 'excited',
        text: `Love it — ${g.name}. To reach ${fmt(g.target)} in ${g.years} year${g.years > 1 ? 's' : ''}, invest about ${fmt(monthly)}/month in an equity SIP (~11% p.a.). ${g.note || ''} Shall I start it?`,
        widget: { type: 'sip', data: { monthly, rate: 11, years: g.years, fv: g.target, fvIdle: g.target * 0.6 } },
        chips: [`Start ${fmt(Math.round(monthly / 500) * 500)}/mo SIP`, 'Show my goals'],
        cta: { label: `Start SIP for ${g.name}`, type: 'sip-setup', amount: Math.round(monthly / 500) * 500 },
      }));
    } catch {
      setTyping(false);
      pushMitra(fallbackResponse());
    }
  };

  // greet on first open / handle deep-linked prompt from dashboard nudges
  useEffect(() => {
    if (initialPrompt) {
      if (!startedRef.current) startedRef.current = true;
      handleSend(initialPrompt);
      onConsumeInitial?.();
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        pushMitra(respond('hello', riskProfile));
      }, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, stream]);

  useEffect(
    () => () => {
      inCallRef.current = false;
      stopSpeaking();
      try { recRef.current?.abort?.(); } catch { /* noop */ }
    },
    []
  );

  const handleMic = () => {
    if (listening) return;
    stopSpeaking();
    setSpeaking(false);
    const rec = listen({
      lang: langRef.current,
      onResult: (transcript) => handleSend(transcript),
      onEnd: () => setListening(false),
      onError: (e) => {
        setListening(false);
        showToast(typeof e === 'string' ? e : 'Voice input unavailable — type instead');
      },
    });
    if (rec) setListening(true);
  };

  const handleCta = (cta) => {
    if (cta.type === 'roundup') {
      awardXP(30, 'roundup');
      showToast(`Round-Up investing enabled · +30 XP`);
      setTimeout(() => {
        pushMitra({
          mood: 'excited',
          text: `Round-Up is live. From your next UPI payment, I'll quietly sweep the spare change into a liquid fund — roughly ${fmt(cta.amount)}/month of invisible investing. Small drops, big ocean.`,
          chips: ['Invest my surplus', 'Show my goals'],
        });
      }, 900);
      return;
    }
    awardXP(40, 'sip-setup');
    showToast(`SIP mandate of ${fmt(cta.amount)}/mo created · +40 XP`);
    setTimeout(() => {
      pushMitra({
        mood: 'excited',
        text: `Done. Your SIP of ${fmt(cta.amount)}/month is set up, debiting on the 5th — right after salary credit. I'll review it every quarter and nudge you to step it up when your income grows. You just future-proofed yourself, that felt good didn't it?`,
        chips: ['Show my goals', "How's my financial health?", 'Compare me with my peers'],
      });
    }, 900);
  };

  const last = messages[messages.length - 1];

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <div style={{ flex: 1 }}>
          <div className="ch-name">MITRA<sup>®</sup></div>
          <div className="ch-status">
            <span className="status-dot" /> {typing ? 'Analysing your data…' : speaking ? 'Speaking…' : 'AI Wealth Advisor · Online'}
          </div>
        </div>
        {aiKey && (
          <button
            className={`icon-btn ${reasoningMode ? 'active' : ''}`}
            title={reasoningMode ? 'Reasoning mode on — shows MITRA thinking' : 'Turn on reasoning mode'}
            onClick={() => setReasoningMode((v) => !v)}
          >
            <Icon name="bulb" size={15} />
          </button>
        )}
        <button className="icon-btn" title="Call MITRA" onClick={startCall}>
          <Icon name="phone" size={15} />
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className={`icon-btn ${lang !== 'en' ? 'active' : ''}`}
            title="Language"
            onClick={() => setLangMenu((v) => !v)}
          >
            {LANGUAGES.find((l) => l.code === lang)?.short || 'A'}
          </button>
          {langMenu && (
            <div className="lang-menu">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={`lang-item ${l.code === lang ? 'active' : ''}`}
                  disabled={l.code !== 'en' && l.code !== 'hi' && !aiKey}
                  onClick={() => {
                    setLangMenu(false);
                    if (l.code === lang) return;
                    setLang(l.code);
                    langRef.current = l.code;
                    stopSpeaking();
                    setSpeaking(false);
                    setTimeout(() => handleSend(l.code === 'en' ? 'hello' : l.code === 'hi' ? 'नमस्ते' : 'hello'), 150);
                  }}
                >
                  <span>{l.native}</span>
                  <small>{l.label}{l.code !== 'en' && l.code !== 'hi' && !aiKey ? ' · needs AI key' : ''}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className={`icon-btn ${voiceOn ? 'active' : ''}`}
          title="Toggle voice"
          onClick={() => {
            if (voiceOn) { stopSpeaking(); setSpeaking(false); }
            setVoiceOn(!voiceOn);
          }}
        >
          <Icon name={voiceOn ? 'speaker' : 'speakerOff'} size={15} />
        </button>
      </div>

      <div className="avatar-stage">
        <div className="avatar-svg-wrap">
          <Avatar speaking={speaking} mood={typing ? 'thinking' : mood} size={108} />
        </div>
        <div className="avatar-caption">A friend who knows your entire financial picture.</div>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m) =>
          m.from === 'user' ? (
            <div className="msg-row user" key={m.id}>
              <div className="bubble user">{m.text}</div>
            </div>
          ) : (
            <React.Fragment key={m.id}>
              <div className="msg-row">
                <div className="mini-avatar">
                  <Avatar size={30} mood="happy" />
                </div>
                <div className="bubble mitra">{m.text}</div>
              </div>
              {m.reasoning && (
                <div className="why-box">
                  <details>
                    <summary>See how MITRA reasoned</summary>
                    <div className="reasoning-text">{m.reasoning}</div>
                  </details>
                </div>
              )}
              {m.widget && <ChatWidget widget={m.widget} onChip={handleSend} />}
              {m.why && (
                <div className="why-box">
                  <details>
                    <summary>Why this advice?</summary>
                    <ul>
                      {m.why.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
              {m.cta && (
                <button className="cta-btn" onClick={() => handleCta(m.cta)}>
                  {m.cta.label}
                </button>
              )}
            </React.Fragment>
          )
        )}
        {typing && (
          <div className="msg-row">
            <div className="mini-avatar">
              <Avatar size={30} mood="thinking" />
            </div>
            <div className="bubble mitra">
              <span className="typing"><i /><i /><i /></span>
            </div>
          </div>
        )}
        {stream && (
          <>
            <div className="reason-trace">
              <div className="reason-trace-head">
                <span className="reason-pulse" />
                {stream.answer ? 'Answering…' : 'MITRA is reasoning through your numbers…'}
              </div>
              {stream.reasoning && <div className="reason-trace-body">{stream.reasoning}</div>}
            </div>
            {stream.answer && (
              <div className="msg-row">
                <div className="mini-avatar">
                  <Avatar size={30} mood="happy" />
                </div>
                <div className="bubble mitra">{stream.answer}</div>
              </div>
            )}
          </>
        )}
        {!typing && last?.from === 'mitra' && last.chips && (
          <div className="chips">
            {last.chips.map((c) => (
              <button className="chip" key={c} onClick={() => handleSend(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-input">
        <button className={`mic-btn ${listening ? 'listening' : ''}`} onClick={handleMic} title="Speak to MITRA">
          <Icon name="mic" size={16} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={
            offerMode
              ? 'Paste the offer / message to check…'
              : listening
              ? 'Listening…'
              : reasoningMode
              ? 'Ask anything — I\'ll reason it out…'
              : 'Ask about goals, tax, SIPs…'
          }
        />
        <button className="send-btn" onClick={() => handleSend()} title="Send">
          <Icon name="send" size={16} />
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {inCall && (
        <div className="call-overlay">
          <div className="call-topbar">
            <span>
              MITRA <b>· Secure line</b>
            </span>
            <span>
              {String(Math.floor(callSecs / 60)).padStart(2, '0')}:{String(callSecs % 60).padStart(2, '0')}
            </span>
          </div>

          <div className="call-stage">
            <div className={`call-rings ${speaking ? 'speaking' : callListening ? 'listening' : ''}`}>
              <Avatar size={150} speaking={speaking} mood={mood} />
            </div>
            <div className="call-name">
              MITRA<sup>®</sup>
            </div>
            <div className="call-status">
              {speaking ? 'Speaking…' : callListening ? 'Listening — go ahead' : typing ? 'Thinking…' : 'On call'}
            </div>
            <div className="call-caption">{callCaption}</div>
            {!micOk && (
              <div style={{ fontSize: 9.5, color: 'rgba(236,234,227,0.5)', textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: "'Space Grotesk', monospace", fontWeight: 700 }}>
                Mic unavailable — tap a question
              </div>
            )}
            <div className="call-chips">
              {['Invest my surplus', 'Am I protected?', 'Harvest my capital gains'].map((c) => (
                <button key={c} className="call-chip" onClick={() => handleSend(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="call-actions">
            <button
              className={`call-mic ${callListening ? 'on' : ''}`}
              title="Push to talk"
              onClick={() => {
                stopSpeaking();
                setSpeaking(false);
                startCallListen();
              }}
            >
              <Icon name="mic" size={17} />
            </button>
            <button className="call-end" title="End call" onClick={endCall}>
              <Icon name="x" size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
