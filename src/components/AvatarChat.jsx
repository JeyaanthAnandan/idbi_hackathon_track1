import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from './Avatar.jsx';
import Ring from './Ring.jsx';
import ChatWidget from './ChatWidgets.jsx';
import {
  respond, fallbackResponse, financialContext, analyzeOfferOffline, figuresAreGrounded,
} from '../engine/advisor.js';
import { speak, speakStream, stopSpeaking, listen } from '../engine/speech.js';
import { fmt } from '../engine/analytics.js';
import { customer } from '../data/customer.js';
import { awardXP } from '../engine/xp.js';
import Icon from './Icons.jsx';
import {
  hasDeepSeek, reasonStream, complete, translate, analyzeOffer, extractGoal,
  chatMessages, LANGUAGES, langLabel,
} from '../engine/deepseek.js';
import { sipRequired } from '../engine/analytics.js';
import { applyAction } from '../engine/portfolioState.js';
import { loadChatHistory, saveChatHistory } from '../engine/chatHistory.js';
import {
  hasSarvam, translateSarvam, translateToEnglish, chatSarvam, chatSarvamStream, toSarvamLang,
} from '../engine/sarvam.js';

// Seeded from wall-clock time so ids from a fresh mount never collide with
// ids already sitting in restored (persisted) history.
let msgId = Date.now();
const mid = () => ++msgId;

export default function AvatarChat({ riskProfile, initialPrompt, onConsumeInitial }) {
  const [messages, setMessages] = useState(loadChatHistory);
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
  // Sarvam turns the mic into a real Indian-language ear: it transcribes after
  // recording (so there's a short "understanding" beat) and reports which
  // language was actually spoken.
  const [transcribing, setTranscribing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  // true only while a reply had to be spoken by the browser instead of Sarvam,
  // so a degraded voice is visible rather than just sounding broken
  const [voiceDegraded, setVoiceDegraded] = useState(false);
  const aiKey = hasDeepSeek();
  const voiceAI = hasSarvam();
  // vernacular needs *either* engine — Sarvam translates, DeepSeek translates
  const canTranslate = voiceAI || aiKey;
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

  // MITRA follows the customer's language instead of making them set it.
  // Saaras hands back the language it heard; we switch and say so once.
  const applyDetectedLang = (detected) => {
    if (!detected || detected === langRef.current) return;
    setLang(detected);
    langRef.current = detected;
    showToast(`Heard ${langLabel(detected)} — replying in ${langLabel(detected)}`);
    awardXP(15, 'lang-detect');
  };

  // Hands-free loop: after MITRA finishes speaking on a call, she listens again.
  const startCallListen = () => {
    if (!inCallRef.current) return;
    const rec = listen({
      lang: langRef.current,
      onLevel: setMicLevel,
      onTranscribing: setTranscribing,
      onResult: (t, detected) => {
        setCallListening(false);
        applyDetectedLang(detected);
        handleSend(t);
      },
      onEnd: () => { setCallListening(false); setMicLevel(0); },
      onError: (e) => {
        setCallListening(false);
        setMicLevel(0);
        setTranscribing(false);
        // "no speech" just means the customer stayed quiet — keep the line open
        if (e === 'no-speech') { startCallListen(); return; }
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
    const onFallback = () => showToast("Sarvam voice unreachable — using this device's voice");
    const onStart = (engine) => {
      setVoiceDegraded(engine === 'device');
      setSpeaking(true);
    };
    if (inCallRef.current) {
      setCallCaption(resp.text);
      speak(resp.text, {
        lang: langRef.current,
        onFallback,
        onStart,
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
        onFallback,
        onStart,
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
    setTimeout(async () => {
      const first = customer.name.split(' ')[0];
      // hand-written Hindi stays; every other language is localised live
      const greeting =
        langRef.current === 'hi'
          ? { mood: 'happy', text: `हाँ ${first} जी, मैं सुन रही हूँ। पैसों की कोई भी बात — बेझिझक पूछिए।` }
          : await localise({
              mood: 'happy',
              text: `Hi ${first}, you're on a secure line with me. Ask me anything about your money — I'm listening.`,
            });
      pushMitra(greeting);
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

  // Localise a finished English reply into the active language.
  // Sarvam's Mayura is preferred: 'modern-colloquial' keeps SIP, ELSS and the
  // ₹ figures in English inside a native-script sentence — which is how Indian
  // customers actually discuss money, and it keeps every number auditable.
  const localise = async (resp) => {
    if (langRef.current === 'en' || !canTranslate) return resp;
    try {
      const text = hasSarvam()
        ? await translateSarvam(resp.text, langRef.current)
        : await translate(resp.text, langRef.current);
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
        text: 'Go ahead — paste the message, WhatsApp forward, or scheme details and I\'ll check it for red flags.',
        mood: 'thinking',
      });
      return;
    }

    setTyping(true);
    awardXP(10, 'first-chat');

    // ── Offer Analyzer mode: the next message is the offer to inspect ──
    // The raw text goes through untranslated on purpose — a scam's URLs,
    // UPI handles and numbers are the evidence, and translating mangles them.
    if (offerRef.current) {
      setOfferMode(false);
      await runOfferAnalysis(text);
      return;
    }

    // MITRA's advisory engine — and every ₹ figure it quotes — is written once,
    // in English. Sarvam translates the question in and the answer back out, so
    // all nine languages get the same audited numbers rather than nine forked
    // rule sets. The customer still sees their own words in their own script.
    let engineText = text;
    if (langRef.current !== 'en' && voiceAI) {
      try {
        engineText = await translateToEnglish(text);
      } catch {
        /* translation down — let the engine try the raw text */
      }
    }

    // ── Natural-language goal creation ──
    if (aiKey && GOAL_TRIGGERS.test(engineText)) {
      await runGoalCreate(engineText);
      return;
    }

    // No artificial "thinking" pause here any more. It was 500–900ms of theatre
    // added back when the rule engine answered instantly; stacked on top of real
    // translation and synthesis latency it just made MITRA feel slow.

    // ── The engine still computes; the LLM now does the talking ──
    // respond() gives us the intent's real numbers plus the widget, CTA and
    // "why" trace — the parts that carry auditable data into the UI. What we no
    // longer use is its hand-written sentence: that gets generated, grounded in
    // financialContext(), so MITRA never says the same thing twice.
    const ruled = respond(engineText, riskProfile, canTranslate ? 'en' : langRef.current);
    const history = messages.filter((m) => m.text);
    const FREE_CHIPS = ['Show my portfolio', 'Invest my surplus', "How's my financial health?"];

    if (voiceAI) {
      const generated = await runGenerated(history, engineText, ruled);
      if (generated) return;
    }

    // Generation unavailable (no key, or Sarvam unreachable) — the templates
    // are kept precisely for this: MITRA still answers, from the same numbers.
    if (ruled) {
      setTyping(false);
      pushMitra(await localise(ruled));
      return;
    }

    if (aiKey) {
      if (reasoningRef.current) {
        await runReasoner(history, engineText);
        return;
      }
      try {
        const { content } = await complete({
          system: financialContext(riskProfile),
          messages: chatMessages(history, engineText),
        });
        if (content) {
          setTyping(false);
          pushMitra(await localise({ text: content, mood: 'happy', chips: FREE_CHIPS }));
          return;
        }
      } catch {
        /* fall through to Sarvam */
      }
    }

    if (voiceAI) {
      try {
        const content = await chatSarvam({
          system: financialContext(riskProfile),
          messages: chatMessages(history, engineText),
        });
        if (content) {
          setTyping(false);
          pushMitra(await localise({ text: content, mood: 'happy', chips: FREE_CHIPS }));
          return;
        }
      } catch {
        /* both engines unreachable — fall through to the honest fallback */
      }
    }

    setTyping(false);
    pushMitra(await localise(fallbackResponse(aiKey || voiceAI)));
  };

  // ── Generated reply: streams text into the bubble AND speech into the ear ──
  // Two streams run off one LLM response. Tokens land in the message as they
  // arrive (first token ~1.2s), and each completed sentence is handed straight
  // to TTS, so MITRA starts speaking while she is still composing. `ruled`
  // carries the engine's computed widget/CTA/why, which get attached to the
  // finished message — the generated prose never has to produce a number the
  // UI depends on.
  const runGenerated = async (history, engineText, ruled) => {
    const speaking = voiceOn || inCallRef.current;
    const vernacular = langRef.current !== 'en';
    const facts = financialContext(riskProfile);
    const id = mid();
    let opened = false;

    // In a vernacular session the reply has to be translated before it can be
    // shown or spoken, so streaming buys nothing — generate, then localise.
    const speaker = speaking && !vernacular
      ? speakStream({
          lang: langRef.current,
          onFallback: () => showToast("Sarvam voice unreachable — using this device's voice"),
          onStart: (engine) => { setVoiceDegraded(engine === 'device'); setSpeaking(true); },
          onEnd: () => { setSpeaking(false); if (inCallRef.current) startCallListen(); },
        })
      : null;

    try {
      const answer = await chatSarvamStream({
        system: facts + (ruled?.meta ? `\nThe customer asked about: ${ruled.meta}.` : ''),
        messages: chatMessages(history, engineText),
        onDelta: (_chunk, full) => {
          if (vernacular) return; // nothing readable to show until it's translated
          if (!opened) {
            opened = true;
            setTyping(false);
            setMood(ruled?.mood || 'happy');
            setMessages((m) => [...m, { id, from: 'mitra', text: full, meta: ruled?.meta, streaming: true }]);
            return;
          }
          setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: full } : x)));
        },
        onSentence: (sentence) => speaker?.push(sentence),
      });

      if (!answer) throw new Error('empty');

      // Reject a reply that quotes a figure the engine never computed.
      const check = figuresAreGrounded(answer, facts);
      if (!check.ok && ruled) {
        stopSpeaking();
        setSpeaking(false);
        if (opened) setMessages((m) => m.filter((x) => x.id !== id));
        return false; // caller falls through to the verified template
      }
      speaker?.end();

      // attach the engine's computed extras to the finished message
      const finished = {
        text: vernacular ? await translateSarvam(answer, langRef.current) : answer,
        meta: ruled?.meta,
        widget: ruled?.widget,
        why: ruled?.why,
        cta: ruled?.cta,
        chips: ruled?.chips || ['Show my portfolio', 'Invest my surplus', "How's my financial health?"],
      };
      setTyping(false);
      if (opened) {
        setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...finished, streaming: false } : x)));
      } else {
        setMood(ruled?.mood || 'happy');
        setMessages((m) => [...m, { id, from: 'mitra', ...finished }]);
        if (speaking) {
          speak(finished.text, {
            lang: langRef.current,
            onFallback: () => showToast("Sarvam voice unreachable — using this device's voice"),
            onStart: (engine) => { setVoiceDegraded(engine === 'device'); setSpeaking(true); },
            onEnd: () => { setSpeaking(false); if (inCallRef.current) startCallListen(); },
          });
        }
      }
      if (inCallRef.current) setCallCaption(finished.text);
      return true;
    } catch {
      // roll back the half-written bubble so the fallback isn't appended to it
      if (opened) setMessages((m) => m.filter((x) => x.id !== id));
      return false;
    }
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
      if (voiceOn) {
        speak(localised.text, {
          lang: langRef.current,
          onFallback: () => showToast("Sarvam voice unreachable — using this device's voice"),
          onStart: (engine) => { setVoiceDegraded(engine === 'device'); setSpeaking(true); },
          onEnd: () => setSpeaking(false),
        });
      }
      awardXP(25, 'reasoning');
    } catch {
      setStream(null);
      pushMitra(await localise(fallbackResponse()));
    }
  };

  // ── Offer Analyzer: scam / mis-selling verdict on pasted text ──
  // Uses DeepSeek when a key is set (richer, free-form reasoning); otherwise
  // falls back to the deterministic rule-based scorer — works fully offline.
  const runOfferAnalysis = async (text) => {
    setTyping(true);
    setMood('thinking');
    const finish = async (a) => {
      setTyping(false);
      if (!a) { pushMitra(await localise(fallbackResponse())); return; }
      const verdictLine = { safe: 'This looks legitimate', caution: 'Be careful with this one', avoid: 'Please do not proceed' }[a.verdict] || '';
      awardXP(20, 'offer-analysis');
      pushMitra(await localise({
        mood: a.verdict === 'avoid' ? 'thinking' : 'happy',
        text: `${verdictLine}. ${a.headline}`,
        widget: { type: 'offer', data: a },
        chips: ['Where should I invest instead?', 'Check another offer', 'Am I protected?'],
      }));
    };
    if (!aiKey) {
      await new Promise((r) => setTimeout(r, 500));
      await finish(analyzeOfferOffline(text));
      return;
    }
    try {
      const a = await analyzeOffer(text);
      await finish(a || analyzeOfferOffline(text));
    } catch {
      await finish(analyzeOfferOffline(text));
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
        cta: { label: `Start SIP for ${g.name}`, type: 'sip-setup', amount: Math.round(monthly / 500) * 500, source: 'nlgoal' },
      }));
    } catch {
      setTyping(false);
      pushMitra(await localise(fallbackResponse()));
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
      if (messages.length > 0) return; // restored history — pick up where we left off
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        pushMitra(respond('hello', riskProfile));
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    setShell(wrapRef.current?.closest('.app-shell') ?? null);
  }, []);

  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

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
    // tapping again while recording ends the turn early instead of doing nothing
    if (listening) {
      recRef.current?.stop?.();
      return;
    }
    if (transcribing) return;
    stopSpeaking();
    setSpeaking(false);
    const rec = listen({
      lang: langRef.current,
      onLevel: setMicLevel,
      onTranscribing: setTranscribing,
      onResult: (transcript, detected) => {
        applyDetectedLang(detected);
        handleSend(transcript);
      },
      onEnd: () => { setListening(false); setMicLevel(0); },
      onError: (e) => {
        setListening(false);
        setMicLevel(0);
        setTranscribing(false);
        const msg =
          e === 'no-speech' ? "I didn't catch that — try again"
          : e === 'NotAllowedError' || e === 'not-allowed' ? 'Mic permission blocked — allow it in your browser'
          : typeof e === 'string' && e.startsWith('Sarvam') ? 'Voice service unreachable — type instead'
          : typeof e === 'string' ? e
          : 'Voice input unavailable — type instead';
        showToast(msg);
      },
    });
    if (rec) {
      recRef.current = rec;
      setListening(true);
    }
  };

  const handleCta = (cta) => {
    const follow = (resp) => setTimeout(() => pushMitra(resp), 900);

    switch (cta.type) {
      case 'roundup':
        applyAction('roundup', cta.amount);
        awardXP(30, 'roundup');
        showToast(`Round-Up investing enabled · +30 XP`);
        follow({
          mood: 'excited',
          text: `Round-Up is live. From your next UPI payment, I'll quietly sweep the spare change into a liquid fund — roughly ${fmt(cta.amount)}/month of invisible investing. Small drops, big ocean.`,
          chips: ['Invest my surplus', 'Show my goals'],
        });
        return;

      case 'protection-fix':
        applyAction('protection-fix', cta.amount);
        awardXP(35, 'protection-fix');
        showToast(`Protection gap fixed · +35 XP`);
        follow({
          mood: 'excited',
          text: `Done — your life and health cover now meet the adequacy rule, for ${fmt(cta.amount)}/month. Your family's downside is covered no matter what happens to your income.`,
          chips: ['Show my health score', 'Show my portfolio', "Am I on track for my goals?"],
        });
        return;

      case 'direct-switch':
        applyAction('direct-switch', 0);
        awardXP(25, 'xray-switch');
        showToast(`Switched to Direct plan · +25 XP`);
        follow({
          mood: 'excited',
          text: `Switched. Same fund, same manager, same holdings — just without the distributor's cut. That saved percentage compounds silently for you from today.`,
          chips: ['Harvest my capital gains', 'Show my portfolio'],
        });
        return;

      case 'harvest':
        applyAction('harvest', cta.amount);
        awardXP(20, 'harvest');
        showToast(`${fmt(cta.amount)} tax-free gains locked in · +20 XP`);
        follow({
          mood: 'excited',
          text: `Orders placed — sold and re-bought instantly, cost basis reset, ${fmt(cta.amount)} of tax quietly avoided. I'll remind you to do this again next FY.`,
          chips: ['X-ray my portfolio', 'Show my portfolio'],
        });
        return;

      case 'prepay':
        applyAction('prepay', cta.amount);
        awardXP(30, 'prepay');
        showToast(`Loan prepaid by ${fmt(cta.amount)} · +30 XP`);
        follow({
          mood: 'excited',
          text: `${fmt(cta.amount)} applied to your loan principal — the interest and tenure both just shrank. One step closer to debt-free.`,
          chips: ['Invest my surplus', 'Show my goals'],
        });
        return;

      case 'subs-cancel':
        applyAction('subs-cancel', cta.amount);
        awardXP(15, 'subs-cancel');
        showToast(`Unused subscriptions cancelled · +15 XP`);
        follow({
          mood: 'excited',
          text: `Cancelled. ${fmt(cta.amount)}/month stops leaking out — that's now free capacity for your goals instead.`,
          chips: ['Invest my surplus', 'Show my goals'],
        });
        return;

      case 'emergency-fix':
        applyAction('emergency-fix', cta.amount);
        awardXP(25, 'emergency-fix');
        showToast(`Sweep-in FD funded · +25 XP`);
        follow({
          mood: 'excited',
          text: `Moved. Your safety net is now at the full 6-month target, still earning FD rates and withdrawable instantly if you ever need it.`,
          chips: ["How's my financial health?", 'Invest my surplus'],
        });
        return;

      case 'sip-setup':
      default:
        applyAction('sip', cta.amount, { source: cta.source });
        awardXP(40, 'sip-setup');
        showToast(`SIP mandate of ${fmt(cta.amount)}/mo created · +40 XP`);
        follow({
          mood: 'excited',
          text: `Done. Your SIP of ${fmt(cta.amount)}/month is set up, debiting on the 5th — right after salary credit. I'll review it every quarter and nudge you to step it up when your income grows. You just future-proofed yourself, that felt good didn't it?`,
          chips: ['Show my goals', "How's my financial health?", 'Compare me with my peers'],
        });
    }
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
            {transcribing
              ? `Understanding · ${voiceAI ? 'Saaras v3' : 'browser'}`
              : listening
              ? 'Listening…'
              : typing
              ? `Analysing · ${toSarvamLang(lang)}`
              : speaking
              ? `Speaking · ${toSarvamLang(lang)}${voiceAI && !voiceDegraded ? ' · Bulbul v3' : voiceDegraded ? ' · device voice' : ''}`
              : `Online · ${toSarvamLang(lang)}`}
          </div>
        </div>
        {aiKey && (
          <button
            className={`icon-btn ${reasoningMode ? 'active' : ''}`}
            title={reasoningMode ? 'Reasoning mode on — shows MITRA thinking' : 'Turn on reasoning mode'}
            aria-label={reasoningMode ? 'Reasoning mode on — shows MITRA thinking' : 'Turn on reasoning mode'}
            aria-pressed={reasoningMode}
            onClick={() => setReasoningMode((v) => !v)}
          >
            <Icon name="bulb" size={15} />
          </button>
        )}
        <button className="icon-btn" title="Call MITRA" aria-label="Call MITRA" onClick={startCall}>
          <Icon name="phone" size={15} />
        </button>
        <div style={{ position: 'relative' }}>
          <button
            className={`icon-btn ${lang !== 'en' ? 'active' : ''}`}
            title="Language"
            aria-label={`Language: ${langLabel(lang)}`}
            aria-haspopup="menu"
            aria-expanded={langMenu}
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
                  disabled={l.code !== 'en' && l.code !== 'hi' && !canTranslate}
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
                  <small>{l.label}{l.code !== 'en' && l.code !== 'hi' && !canTranslate ? ' · needs AI key' : ''}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className={`icon-btn ${voiceOn ? 'active' : ''}`}
          title="Toggle voice"
          aria-label={voiceOn ? 'Voice replies on — tap to mute' : 'Voice replies off — tap to unmute'}
          aria-pressed={voiceOn}
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
        <button
          className={`mic-btn ${listening ? 'listening' : ''} ${transcribing ? 'transcribing' : ''}`}
          onClick={handleMic}
          disabled={transcribing}
          style={listening ? { transform: `scale(${1 + micLevel * 0.18})` } : undefined}
          title={voiceAI ? 'Speak in any Indian language' : 'Speak to MITRA'}
          aria-label={listening ? 'Listening — tap to finish' : transcribing ? 'Understanding…' : 'Speak to MITRA'}
        >
          <Icon name="mic" size={16} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={
            offerMode
              ? 'Paste the offer / message to check…'
              : transcribing
              ? 'Understanding what you said…'
              : listening
              ? voiceAI ? 'Listening — speak any Indian language…' : 'Listening…'
              : reasoningMode
              ? 'Ask anything — I\'ll reason it out…'
              : 'Ask about goals, tax, SIPs…'
          }
        />
        <button className="send-btn" onClick={() => handleSend()} title="Send" aria-label="Send message">
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
            <div
              className={`call-rings ${speaking ? 'speaking' : callListening ? 'listening' : ''}`}
              style={callListening ? { '--mic-level': micLevel.toFixed(2) } : undefined}
            >
              <span className="call-inner-ring" />
              <span className="call-orbit"><i /></span>
              <Avatar size={160} speaking={speaking} mood={mood} />
            </div>
            <div className="call-name">
              MITRA<sup>®</sup>
            </div>
            <div className="call-status">
              {speaking
                ? `Speaking · ${toSarvamLang(lang)}`
                : transcribing
                ? 'Understanding…'
                : callListening
                ? 'Listening · go ahead'
                : typing
                ? 'Thinking…'
                : 'On call · hands-free'}
            </div>
            <div className="call-caption">{callCaption}</div>
            {!micOk && <div className="call-mic-note">Mic unavailable — tap a question below</div>}
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
              aria-label="Push to talk"
              onClick={() => {
                stopSpeaking();
                setSpeaking(false);
                startCallListen();
              }}
            >
              <Icon name="mic" size={18} />
            </button>
            <button className="call-end" title="End call" aria-label="End call" onClick={endCall}>
              <Icon name="x" size={20} />
            </button>
            <button
              className={`call-mic ${voiceOn ? '' : 'on'}`}
              title="Toggle MITRA's voice"
              aria-label={voiceOn ? "Mute MITRA's voice" : "Unmute MITRA's voice"}
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
