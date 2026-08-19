import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from './Avatar.jsx';
import Ring from './Ring.jsx';
import ChatWidget from './ChatWidgets.jsx';
import { respond, fallbackResponse } from '../engine/advisor.js';
import { askClaude, getApiKey } from '../engine/llm.js';
import { speak, stopSpeaking, listen } from '../engine/speech.js';
import { fmt } from '../engine/analytics.js';
import { awardXP } from '../engine/xp.js';
import Icon from './Icons.jsx';

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
  const bodyRef = useRef(null);
  const startedRef = useRef(false);
  const wrapRef = useRef(null);
  // the call is a full-bleed takeover: it has to escape the scrolling
  // screen so it covers the status bar and the nav pill too
  const [shell, setShell] = useState(null);

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

  const handleSend = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    setInput('');
    stopSpeaking();
    setSpeaking(false);
    setMessages((m) => [...m, { id: mid(), from: 'user', text }]);
    setTyping(true);
    setMood('thinking');

    // small pause so the typing indicator reads naturally
    await new Promise((r) => setTimeout(r, 650 + Math.random() * 450));

    awardXP(10, 'first-chat');
    const ruled = respond(text, riskProfile, langRef.current);
    if (ruled) {
      setTyping(false);
      pushMitra(ruled);
      return;
    }

    // outside the rule engine → try LLM if key present, else graceful fallback
    if (getApiKey()) {
      try {
        const history = messages.filter((m) => m.text);
        const llmText = await askClaude(history, text, riskProfile);
        setTyping(false);
        pushMitra({ text: llmText, mood: 'happy', chips: ['Show my portfolio', 'Invest my surplus'] });
        return;
      } catch {
        // fall through to rule fallback
      }
    }
    setTyping(false);
    pushMitra(fallbackResponse());
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
    setShell(wrapRef.current?.closest('.app-shell') ?? null);
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

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
    <div className="chat-wrap" ref={wrapRef}>
      <div className="chat-header">
        <Ring size={52} dot={6} color="rgba(15,140,126,0.5)">
          <Avatar size={42} speaking={speaking} mood={typing ? 'thinking' : mood} />
        </Ring>
        <div style={{ flex: 1 }}>
          <div className="ch-name">MITRA<sup>®</sup></div>
          <div className="ch-status">
            {typing ? 'Analysing · en-IN' : speaking ? `Speaking · ${lang === 'hi' ? 'hi-IN' : 'en-IN'}` : `Online · ${lang === 'hi' ? 'hi-IN' : 'en-IN'}`}
          </div>
        </div>
        <button className="icon-btn" title="Call MITRA" onClick={startCall}>
          <Icon name="phone" size={15} />
        </button>
        <button
          className={`icon-btn ${lang === 'hi' ? 'active' : ''}`}
          title="हिंदी / English"
          onClick={() => {
            const next = lang === 'hi' ? 'en' : 'hi';
            setLang(next);
            langRef.current = next;
            stopSpeaking();
            setSpeaking(false);
            setTimeout(() => handleSend(next === 'hi' ? 'नमस्ते' : 'hello'), 150);
          }}
        >
          {lang === 'hi' ? 'अ' : 'A'}
        </button>
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

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m) =>
          m.from === 'user' ? (
            <div className="msg-row user" key={m.id}>
              <div className="bubble user">{m.text}</div>
            </div>
          ) : (
            <React.Fragment key={m.id}>
              <div className="msg-row">
                <div className="bubble mitra">
                  {m.meta && <div className="bubble-meta">{m.meta}</div>}
                  {m.text}
                </div>
              </div>
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
            <div className="bubble mitra">
              <span className="typing"><i /><i /><i /></span>
            </div>
          </div>
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
          placeholder={listening ? 'Listening…' : 'Ask about goals, tax, SIPs…'}
        />
        <button className="send-btn" onClick={() => handleSend()} title="Send">
          <Icon name="send" size={16} />
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {inCall && shell && createPortal(
        <div className="call-overlay">
          <div className="call-topbar">
            <span><b>● Secure line</b></span>
            <span className="call-timer">
              {String(Math.floor(callSecs / 60)).padStart(2, '0')}:{String(callSecs % 60).padStart(2, '0')}
            </span>
          </div>

          <div className="call-stage">
            <div className={`call-rings ${speaking ? 'speaking' : callListening ? 'listening' : ''}`}>
              <span className="call-inner-ring" />
              <span className="call-orbit"><i /></span>
              <Avatar size={160} speaking={speaking} mood={mood} />
            </div>
            <div className="call-name">
              MITRA<sup>®</sup>
            </div>
            <div className="call-status">
              {speaking
                ? 'Speaking · hands-free'
                : callListening
                ? 'Listening · go ahead'
                : typing
                ? 'Thinking…'
                : 'On call · hands-free'}
            </div>
            <div className="call-caption">{callCaption}</div>
            {!micOk && <div className="call-mic-note">Mic unavailable — tap a question</div>}
          </div>

          <div className="call-chips">
            {['Invest my surplus', 'Am I protected?', 'Harvest my gains'].map((c) => (
              <button key={c} className="call-chip" onClick={() => handleSend(c)}>
                {c}
              </button>
            ))}
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
              <Icon name="mic" size={18} />
            </button>
            <button className="call-end" title="End call" onClick={endCall}>
              <Icon name="x" size={22} />
            </button>
            <button
              className={`call-mic ${voiceOn ? '' : 'on'}`}
              title="Toggle MITRA's voice"
              onClick={() => {
                if (voiceOn) { stopSpeaking(); setSpeaking(false); }
                setVoiceOn(!voiceOn);
              }}
            >
              <Icon name={voiceOn ? 'speaker' : 'speakerOff'} size={18} />
            </button>
          </div>
        </div>,
        shell
      )}
    </div>
  );
}
