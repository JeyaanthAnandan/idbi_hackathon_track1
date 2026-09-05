import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from './Avatar.jsx';
import Ring from './Ring.jsx';
import ChatWidget from './ChatWidgets.jsx';
import AdvicePassport from './AdvicePassport.jsx';
import AvatarGuide from './AvatarGuide.jsx';
import {
  respond, fallbackResponse, analyzeOfferOffline,
} from '../engine/advisor.js';
import { speak, stopSpeaking, listen } from '../engine/speech.js';
import { fmt } from '../engine/analytics.js';
import { customer } from '../data/customer.js';
import { awardXP } from '../engine/xp.js';
import Icon from './Icons.jsx';
import {
  hasDeepSeek, translate, analyzeOffer, extractGoal, selectDeepSeekAdvisorTool,
  chatMessages, LANGUAGES, langLabel,
} from '../engine/deepseek.js';
import { sipRequired } from '../engine/analytics.js';
import { applyAction } from '../engine/portfolioState.js';
import { loadChatHistory, saveChatHistory } from '../engine/chatHistory.js';
import {
  hasSarvam, translateSarvam, translateToEnglish, selectSarvamAdvisorTool, toSarvamLang,
} from '../engine/sarvam.js';
import {
  ADVISOR_TOOL_DEFINITIONS, executeAdvisorTool, validateAdvisorResponse,
  validateAdvisorToolCall, validateGoalDraft, validateOfferAnalysis, figuresPreserved,
} from '../engine/advisorTools.js';
import { buildAdvicePassport } from '../engine/advicePassport.js';
import { createAdviceReceipt } from '../engine/api.js';
import { returnScenario } from '../data/policy.js';

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
  const [offerMode, setOfferMode] = useState(false);
  const offerRef = useRef(false);
  offerRef.current = offerMode;
  // Sarvam turns the mic into a real Indian-language ear: it transcribes after
  // recording (so there's a short "understanding" beat) and reports which
  // language was actually spoken.
  const [transcribing, setTranscribing] = useState(false);
  const transcribingRef = useRef(false);
  const updateTranscribing = (value) => {
    transcribingRef.current = value;
    setTranscribing(value);
  };
  const [micLevel, setMicLevel] = useState(0);
  // true only while a reply had to be spoken by the browser instead of Sarvam,
  // so a degraded voice is visible rather than just sounding broken
  const [voiceDegraded, setVoiceDegraded] = useState(false);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
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
  const [guideFocus, setGuideFocus] = useState(null);

  // ── Live call state ──
  const [inCall, setInCall] = useState(false);
  const [callCaption, setCallCaption] = useState('');
  const [callHeard, setCallHeard] = useState('');
  const [callError, setCallError] = useState('');
  const [preparingVoice, setPreparingVoice] = useState(false);
  const [callListening, setCallListening] = useState(false);
  const [callSecs, setCallSecs] = useState(0);
  const [micOk, setMicOk] = useState(true);
  const inCallRef = useRef(false);
  const callSessionRef = useRef(0);
  const callListeningRef = useRef(false);
  const recRef = useRef(null);
  const lastQuestionRef = useRef('');

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
    if (!inCallRef.current || callListeningRef.current || transcribingRef.current) return;
    const callSession = callSessionRef.current;
    setCallError('');
    setMicOk(true);
    try {
      const rec = listen({
        lang: langRef.current,
        onLevel: setMicLevel,
        onTranscribing: (value) => {
          if (inCallRef.current && callSession === callSessionRef.current) updateTranscribing(value);
        },
        onResult: (t, detected) => {
          if (!inCallRef.current || callSession !== callSessionRef.current) return;
          callListeningRef.current = false;
          recRef.current = null;
          setCallListening(false);
          setCallHeard(t);
          setCallCaption('Checking that against your financial plan…');
          applyDetectedLang(detected);
          handleSend(t);
        },
        onEnd: () => {
          if (callSession !== callSessionRef.current) return;
          callListeningRef.current = false;
          setCallListening(false);
          setMicLevel(0);
        },
        onError: (e) => {
          if (!inCallRef.current || callSession !== callSessionRef.current) return;
          callListeningRef.current = false;
          recRef.current = null;
          setCallListening(false);
          setMicLevel(0);
          updateTranscribing(false);
          const message =
            e === 'no-speech' ? "I didn't hear anything. Tap the microphone and try again."
            : e === 'NotAllowedError' || e === 'not-allowed' ? 'Microphone access is blocked. Allow it in your browser, then retry.'
            : typeof e === 'string' && e.startsWith('Sarvam') ? 'Voice transcription is temporarily unavailable. Retry or use a prompt below.'
            : typeof e === 'string' ? e
            : 'The microphone is unavailable. Retry or use a prompt below.';
          console.warn('[MITRA call] listening failed', { error: String(e) });
          setCallError(message);
          setMicOk(false);
        },
      });
      if (rec) {
        recRef.current = rec;
        callListeningRef.current = true;
        setCallListening(true);
      } else {
        setCallError('Voice input needs Chrome or Edge. You can still use the prompts below.');
        setMicOk(false);
      }
    } catch (error) {
      console.warn('[MITRA call] could not start microphone', { error: error?.message || String(error) });
      setCallError('The microphone could not start. Check browser permission and retry.');
      setMicOk(false);
    }
  };

  const pushMitra = (resp) => {
    const checked = validateAdvisorResponse(resp);
    const safeResp = checked.ok ? checked.value : { ...fallbackResponse(true), engineMode: 'POLICY_FALLBACK' };
    const id = mid();
    const passport = buildAdvicePassport({
      question: lastQuestionRef.current,
      response: safeResp,
      riskProfile,
      engineMode: safeResp.engineMode || 'DETERMINISTIC',
    });
    const firstGuideTarget = safeResp.widget ? 'result' : passport ? 'evidence' : safeResp.cta ? 'action' : null;
    setGuideFocus(firstGuideTarget ? { messageId: id, target: firstGuideTarget } : null);
    setMood(safeResp.mood || 'happy');
    setMessages((m) => [...m, { id, from: 'mitra', ...safeResp, passport }]);
    if (passport) {
      void createAdviceReceipt(passport)
        .then(({ receipt }) => setMessages((items) => items.map((item) => (item.id === id ? { ...item, passport: receipt } : item))))
        .catch(() => {});
    }
    const onFallback = () => {
      setPreparingVoice(false);
      if (inCallRef.current) setCallError("MITRA's neural voice is unavailable, so the device voice is being used.");
      showToast("Sarvam voice unreachable — using this device's voice");
    };
    const onStart = (engine) => {
      setPreparingVoice(false);
      setVoiceDegraded(engine === 'device');
      setSpeaking(true);
    };
    if (inCallRef.current) {
      setCallCaption(safeResp.text);
      setPreparingVoice(voiceOnRef.current);
      if (!voiceOnRef.current) {
        setPreparingVoice(false);
        setTimeout(startCallListen, 80);
        return;
      }
      speak(safeResp.text, {
        lang: langRef.current,
        onFallback,
        onStart,
        onEnd: () => {
          setPreparingVoice(false);
          setSpeaking(false);
          startCallListen();
        },
      });
      return;
    }
    if (voiceOn) {
      speak(safeResp.text, {
        lang: langRef.current,
        onFallback,
        onStart,
        onEnd: () => setSpeaking(false),
      });
    }
  };

  const startCall = () => {
    callSessionRef.current += 1;
    inCallRef.current = true;
    setInCall(true);
    setCallSecs(0);
    setMicOk(true);
    setCallError('');
    setCallHeard('');
    setCallCaption('Connecting to MITRA’s neural voice…');
    setPreparingVoice(true);
    stopSpeaking();
    setTimeout(async () => {
      if (!inCallRef.current) return;
      const first = customer.name.split(' ')[0];
      // hand-written Hindi stays; every other language is localised live
      const greeting =
        langRef.current === 'hi'
          ? { mood: 'happy', text: `हाँ ${first} जी, मैं सुन रही हूँ। पैसों की कोई भी बात — बेझिझक पूछिए।` }
          : await localise({
              mood: 'happy',
              text: `Hi ${first}, you're on a secure line with me. Ask me anything about your money — I'm listening.`,
            });
      if (!inCallRef.current) return;
      pushMitra(greeting);
    }, 700);
  };

  const endCall = () => {
    callSessionRef.current += 1;
    inCallRef.current = false;
    setInCall(false);
    callListeningRef.current = false;
    setCallListening(false);
    updateTranscribing(false);
    setPreparingVoice(false);
    stopSpeaking();
    setSpeaking(false);
    try { recRef.current?.abort?.(); } catch { /* recognition may already be closed */ }
    recRef.current = null;
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
      return figuresPreserved(resp.text, text) ? { ...resp, text } : resp;
    } catch {
      return resp;
    }
  };

  const GOAL_TRIGGERS = /^(add|create|new|set)\s+(a\s+)?goal|^goal[:\-]|^i want to (buy|save|afford)|^save (up )?for/i;

  const handleSend = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    if (inCallRef.current && callListeningRef.current) {
      callListeningRef.current = false;
      try { recRef.current?.abort?.(); } catch { /* the recorder may already be closed */ }
      recRef.current = null;
      setCallListening(false);
      setMicLevel(0);
    }
    if (inCallRef.current) setCallError('');
    setGuideFocus(null);
    lastQuestionRef.current = text;
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

    // Deterministic intents own both the numbers and the narration. An LLM is
    // used only to select a validated tool when keyword routing has no answer.
    const ruled = respond(engineText, riskProfile, canTranslate ? 'en' : langRef.current);
    const history = messages.filter((m) => m.text);
    if (ruled) {
      setTyping(false);
      pushMitra(await localise({ ...ruled, engineMode: 'DETERMINISTIC' }));
      return;
    }

    if (voiceAI || aiKey) {
      try {
        const messagesForRouter = chatMessages(history, engineText);
        const candidate = voiceAI
          ? await selectSarvamAdvisorTool({ messages: messagesForRouter, tools: ADVISOR_TOOL_DEFINITIONS })
          : await selectDeepSeekAdvisorTool({ messages: messagesForRouter, tools: ADVISOR_TOOL_DEFINITIONS });
        const toolCall = validateAdvisorToolCall(candidate);
        const response = toolCall.ok ? executeAdvisorTool(toolCall.value, riskProfile) : null;
        const safe = validateAdvisorResponse(response);
        if (safe.ok) {
          setTyping(false);
          pushMitra(await localise({ ...safe.value, toolRouted: true, engineMode: 'STRUCTURED_TOOL' }));
          return;
        }
      } catch (error) {
        console.warn('[MITRA advisor] tool routing failed; using policy fallback', { error: error?.message || String(error) });
        /* fall through to the honest deterministic fallback */
      }
    }

    setTyping(false);
    pushMitra(await localise(fallbackResponse(aiKey || voiceAI)));
  };

  // ── Offer Analyzer: scam / mis-selling verdict on pasted text ──
  // Uses schema-validated DeepSeek classification when configured; otherwise
  // falls back to the deterministic rule-based scorer.
  const runOfferAnalysis = async (text) => {
    setTyping(true);
    setMood('thinking');
    const finish = async (rawAnalysis) => {
      const a = validateOfferAnalysis(rawAnalysis);
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
      const g = validateGoalDraft(await extractGoal(text));
      setTyping(false);
      if (!g || !g.ok) {
        pushMitra(await localise({ text: "I couldn't quite catch that goal — tell me what you want and roughly when, like \"a car in 3 years\".", mood: 'thinking', chips: ['Invest my surplus'] }));
        return;
      }
      const assumedReturn = returnScenario(riskProfile).base;
      const monthly = sipRequired(g.target, assumedReturn, g.years || 3, 0);
      awardXP(20, 'nl-goal');
      pushMitra(await localise({
        mood: 'excited',
        text: `For the ${g.name} goal, the current ${riskProfile.toLowerCase()} policy scenario estimates about ${fmt(monthly)}/month at ${assumedReturn}% p.a. Returns are not guaranteed.${g.estimated ? ' The target is an estimate—confirm it before acting.' : ''}`,
        widget: { type: 'sip', data: { monthly, rate: assumedReturn, years: g.years, fv: g.target, fvIdle: g.target * 0.6 } },
        chips: [`Simulate ${fmt(Math.round(monthly / 500) * 500)}/mo SIP`, 'Show my goals'],
        cta: { label: `Simulate SIP for ${g.name}`, type: 'sip-setup', amount: Math.round(monthly / 500) * 500, source: 'nlgoal' },
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
  }, [messages, typing]);

  useEffect(() => {
    if (!guideFocus) return undefined;
    const timer = setTimeout(() => {
      document.getElementById(`advice-${guideFocus.target}-${guideFocus.messageId}`)?.scrollIntoView({
        behavior: 'smooth', block: 'center', inline: 'nearest',
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [guideFocus]);

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
      onTranscribing: updateTranscribing,
      onResult: (transcript, detected) => {
        applyDetectedLang(detected);
        handleSend(transcript);
      },
      onEnd: () => { setListening(false); setMicLevel(0); },
      onError: (e) => {
        setListening(false);
        setMicLevel(0);
        updateTranscribing(false);
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
    const simulated = (message, chips) => follow({
      mood: 'happy',
      text: `${message} This is a planning simulation only—no money, mandate, policy, or order was changed.`,
      chips,
    });

    switch (cta.type) {
      case 'roundup':
        applyAction('roundup', cta.amount);
        awardXP(30, 'roundup');
        showToast(`Round-Up scenario added · +30 XP`);
        simulated(`The plan now models roughly ${fmt(cta.amount)}/month from round-ups.`, ['Invest my surplus', 'Show my goals']);
        return;

      case 'protection-fix':
        applyAction('protection-fix', cta.amount);
        awardXP(35, 'protection-fix');
        showToast(`Protection scenario updated · +35 XP`);
        simulated(`The scenario now includes estimated cover at ${fmt(cta.amount)}/month; underwriting and actual premiums still need insurer confirmation.`, ['Show my health score', 'Show my portfolio']);
        return;

      case 'direct-switch':
        applyAction('direct-switch', 0);
        awardXP(25, 'xray-switch');
        showToast(`Direct-plan scenario updated · +25 XP`);
        simulated('The projection now models the lower expense ratio of a direct-plan switch. Review exit load and tax impact before placing any order.', ['Harvest my capital gains', 'Show my portfolio']);
        return;

      case 'harvest':
        applyAction('harvest', cta.amount);
        awardXP(20, 'harvest');
        showToast(`Tax-harvest scenario added · +20 XP`);
        simulated(`The scenario models harvesting up to ${fmt(cta.harvestable || 0)}, with estimated tax impact of ${fmt(cta.amount)}; a tax professional should confirm eligibility and transaction effects.`, ['X-ray my portfolio', 'Show my portfolio']);
        return;

      case 'prepay':
        applyAction('prepay', cta.amount);
        awardXP(30, 'prepay');
        showToast(`Prepayment scenario updated · +30 XP`);
        simulated(`The comparison now models a ${fmt(cta.amount)} principal prepayment.`, ['Invest my surplus', 'Show my goals']);
        return;

      case 'subs-cancel':
        applyAction('subs-cancel', cta.amount);
        awardXP(15, 'subs-cancel');
        showToast(`Subscription scenario updated · +15 XP`);
        simulated(`The cash-flow plan now excludes ${fmt(cta.amount)}/month of selected subscriptions.`, ['Invest my surplus', 'Show my goals']);
        return;

      case 'emergency-fix':
        applyAction('emergency-fix', cta.amount);
        awardXP(25, 'emergency-fix');
        showToast(`Emergency-fund scenario updated · +25 XP`);
        simulated(`The plan now models ${fmt(cta.amount)} moving to the emergency reserve.`, ["How's my financial health?", 'Invest my surplus']);
        return;

      case 'rm-handoff':
        awardXP(10, 'rm-handoff');
        showToast('Handoff brief prepared · +10 XP');
        simulated('A review brief is ready to share with a relationship manager after you confirm contact consent.', ['Show my portfolio']);
        return;

      case 'sip-setup':
        applyAction('sip', cta.amount, { source: cta.source });
        awardXP(40, 'sip-setup');
        showToast(`SIP scenario of ${fmt(cta.amount)}/mo added · +40 XP`);
        simulated(`The plan now models a ${fmt(cta.amount)}/month SIP.`, ['Show my goals', "How's my financial health?", 'Compare me with my peers']);
        return;

      default:
        showToast('Unsupported action — nothing changed');
    }
  };

  const last = messages[messages.length - 1];
  const guideTargetsFor = (message) => [
    ...(message.widget ? ['result'] : []),
    ...(message.passport ? ['evidence'] : []),
    ...(message.cta ? ['action'] : []),
  ];
  const activeGuideTargetFor = (message) => (
    guideFocus?.messageId === message.id ? guideFocus.target : guideTargetsFor(message)[0]
  );

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
              {m.widget && (
                <div
                  id={`advice-result-${m.id}`}
                  className={`advice-focus-target ${m.id === last?.id && activeGuideTargetFor(m) === 'result' ? 'is-guided' : ''}`}
                >
                  <ChatWidget widget={m.widget} onChip={handleSend} />
                </div>
              )}
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
              {m.passport && (
                <div
                  id={`advice-evidence-${m.id}`}
                  className={`advice-focus-target ${m.id === last?.id && activeGuideTargetFor(m) === 'evidence' ? 'is-guided' : ''}`}
                >
                  <AdvicePassport passport={m.passport} />
                </div>
              )}
              {m.cta && (
                <div
                  id={`advice-action-${m.id}`}
                  className={`advice-focus-target advice-action-target ${m.id === last?.id && activeGuideTargetFor(m) === 'action' ? 'is-guided' : ''}`}
                >
                  <button className="cta-btn" onClick={() => handleCta(m.cta)}>
                    {m.cta.label}
                  </button>
                </div>
              )}
              {m.id === last?.id && (m.widget || m.passport || m.cta) && (
                <AvatarGuide
                  targets={guideTargetsFor(m)}
                  active={activeGuideTargetFor(m)}
                  speaking={speaking}
                  mood={mood}
                  onSelect={(target) => setGuideFocus({ messageId: m.id, target })}
                />
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
                : preparingVoice
                ? 'Preparing voice…'
                : 'On call · hands-free'}
            </div>
            <div className="call-model-path" aria-label="AI model pipeline">
              <span className={callListening || transcribing ? 'active' : ''}>Saaras · hearing</span>
              <span className={typing ? 'active' : ''}>Policy + Sarvam · reasoning</span>
              <span className={speaking || preparingVoice ? 'active' : ''}>Bulbul · voice</span>
            </div>
            {callHeard && (
              <div className="call-heard">
                <span>You asked</span>
                “{callHeard}”
              </div>
            )}
            <div className="call-caption">{callCaption}</div>
            {callError && (
              <div className="call-error" role="alert">
                <span>{callError}</span>
                {!micOk && (
                  <button type="button" onClick={startCallListen}>Retry mic</button>
                )}
              </div>
            )}
          </div>

          <div className="call-chips">
            {['Invest my surplus', 'Am I protected?', 'Harvest my gains'].map((c) => (
              <button
                key={c}
                className="call-chip"
                disabled={typing || transcribing}
                onClick={() => {
                  setCallHeard(c);
                  setCallCaption('Checking that against your financial plan…');
                  handleSend(c);
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="call-actions">
            <button
              className={`call-mic ${callListening ? 'on' : ''}`}
              title={callListening ? 'Finish speaking' : 'Speak to MITRA'}
              aria-label={callListening ? 'Finish speaking' : 'Speak to MITRA'}
              disabled={transcribing || typing}
              onClick={() => {
                if (callListening) {
                  recRef.current?.stop?.();
                  return;
                }
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
                const next = !voiceOn;
                voiceOnRef.current = next;
                setVoiceOn(next);
                if (!next && inCallRef.current && !callListeningRef.current && !transcribingRef.current) {
                  setPreparingVoice(false);
                  startCallListen();
                }
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
