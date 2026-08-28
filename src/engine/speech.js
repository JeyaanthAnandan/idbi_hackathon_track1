// Voice layer — Sarvam AI first, Web Speech API as the fallback.
//
// Sarvam (Bulbul v3 TTS + Saaras v3 STT) is what makes MITRA actually usable
// in India: a real Tamil/Telugu/Kannada/Malayalam voice on every device, and
// a mic that identifies which language the customer spoke instead of making
// them pick one first. Without a Sarvam key everything silently falls back to
// the browser's own speech engine, so the demo never breaks.
import { SPEECH_LANG } from './deepseek.js';
import { hasSarvam, synthesize, transcribe, getSarvamSpeaker } from './sarvam.js';
import { recordUtterance, canRecord } from './recorder.js';

const VOICE_PREF = 'mitra_voice';

let voices = [];

// ── Web Speech fallback: rank installed voices, best-sounding first ──
// Higher score = more natural. Neural/online voices > enhanced > defaults.
function scoreVoice(v) {
  const name = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural|online/.test(name)) s += 60;
  if (/premium|enhanced/.test(name)) s += 40;
  if (name.includes('google')) s += 30;
  if (v.lang === 'en-IN') s += 25;
  if (/en-GB|en-AU/.test(v.lang)) s += 10;
  if (v.lang.startsWith('en')) s += 10;
  if (/female|veena|kanya|isha|neerja|samantha|karen|tessa|moira|serena|sonia|libby|aria|ava|zira/.test(name)) s += 15;
  if (/male|daniel|rishi|alex|fred|eddy|reed|grandpa|rocko|bahh|albert|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|whisper|wobble|zarvox/.test(name)) s -= 40;
  return s;
}

function refreshVoices() {
  if (typeof window === 'undefined') return;
  voices = window.speechSynthesis?.getVoices?.() || [];
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

export function listVoices() {
  refreshVoices();
  return voices
    .filter((v) => v.lang.startsWith('en'))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

// Best installed voice for any language code (hi, ta, te, bn, mr, gu, kn, ml…)
function voiceForLang(langCode) {
  refreshVoices();
  const prefix = (SPEECH_LANG[langCode] || 'en-IN').slice(0, 2);
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  return (
    pool.find((v) => /natural|neural|online|google/i.test(v.name)) ||
    pool.find((v) => /female|lekha|swara|veena/i.test(v.name)) ||
    pool[0] ||
    null
  );
}

export const getPreferredVoiceName = () => localStorage.getItem(VOICE_PREF) || '';
export const setPreferredVoiceName = (name) => localStorage.setItem(VOICE_PREF, name);

function currentVoice() {
  refreshVoices();
  const pref = getPreferredVoiceName();
  if (pref) {
    const match = voices.find((v) => v.name === pref);
    if (match) return match;
  }
  return listVoices()[0] || null;
}

// ── playback state ───────────────────────────────────────────
// One utterance at a time. `token` invalidates in-flight Sarvam requests when
// the customer interrupts, so a slow response can't speak over the next reply.
let audioEl = null;
let token = 0;

function stopAudio() {
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl = null;
  }
}

// Plays a *growing* list of clips back to back as one continuous reply.
// Long answers arrive batch by batch, so playback starts on the first batch
// while the rest are still being synthesized. `done()` says no more are
// coming, which is what lets the player know when the reply has truly ended.
function createPlayer({ onEnd, myToken }) {
  const urls = [];
  let i = 0;
  let playing = false;
  let complete = false;

  const step = () => {
    if (myToken !== token) return; // interrupted by the next utterance
    if (i >= urls.length) {
      playing = false;
      if (complete) {
        urls.forEach(URL.revokeObjectURL);
        audioEl = null;
        onEnd?.();
      }
      return; // more batches still landing — the next push resumes us
    }
    playing = true;
    const el = new Audio(urls[i++]);
    audioEl = el;
    el.onended = step;
    el.onerror = step; // a bad clip shouldn't strand the rest of the reply
    el.play().catch(() => step());
  };

  return {
    push(next) {
      urls.push(...next);
      if (!playing) step();
    },
    done() {
      complete = true;
      if (!playing) step();
    },
    discard() {
      urls.forEach(URL.revokeObjectURL);
    },
  };
}

function speakWebSpeech(text, { onStart, onEnd, lang }) {
  if (!window.speechSynthesis) {
    onEnd?.();
    return false;
  }
  window.speechSynthesis.cancel();
  // strip emoji/markdown, and add gentle pauses at sentence breaks
  const clean = text
    .replace(/[*_#`]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/₹/g, lang === 'en' ? ' rupees ' : ' ₹ ')
    .replace(/\s+/g, ' ')
    .trim();
  const u = new SpeechSynthesisUtterance(clean);
  const v = lang === 'en' ? currentVoice() : voiceForLang(lang);
  if (v) u.voice = v;
  u.lang = SPEECH_LANG[lang] || 'en-IN';
  u.rate = 0.98;
  u.pitch = 1.04;
  u.onstart = () => onStart?.('device');
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return true;
}

/**
 * Speak a reply. Sarvam's Bulbul voice when a key is present, otherwise the
 * browser's. onStart fires when audio actually begins, so the avatar's mouth
 * only moves once there is sound, and receives the engine that produced it
 * ('sarvam' | 'device') so the UI can never claim the wrong one. onFallback
 * fires if we had to drop to the browser voice — the caller surfaces that
 * rather than letting MITRA silently turn robotic, which reads to the
 * customer as the product breaking.
 */
export function speak(text, { onStart, onEnd, onFallback, lang = 'en' } = {}) {
  stopSpeaking();
  const myToken = ++token;
  if (!text?.trim()) {
    onEnd?.();
    return false;
  }

  if (hasSarvam()) {
    const player = createPlayer({ onEnd, myToken });
    let started = false;

    synthesize(text, {
      lang,
      speaker: getSarvamSpeaker(),
      onBatch: (urls) => {
        if (myToken !== token) {
          urls.forEach(URL.revokeObjectURL);
          return;
        }
        if (!started) {
          started = true;
          onStart?.('sarvam');
        }
        player.push(urls);
      },
    })
      .then((all) => {
        if (myToken !== token) {
          player.discard();
          return;
        }
        if (!all.length) throw new Error('empty-audio');
        player.done();
      })
      .catch(() => {
        if (myToken !== token) return;
        // Already speaking in Sarvam's voice — switching to the robotic one
        // mid-sentence is worse than just ending the reply there.
        if (started) {
          player.done();
          return;
        }
        onFallback?.();
        speakWebSpeech(text, { onStart, onEnd, lang });
      });
    return true;
  }

  return speakWebSpeech(text, { onStart, onEnd, lang });
}

/**
 * Speak a reply that is still being written. Sentences are pushed in as the
 * LLM streams them; each is synthesized in order and queued, so MITRA starts
 * talking while she is still composing rather than after.
 */
export function speakStream({ lang = 'en', onStart, onEnd, onFallback } = {}) {
  stopSpeaking();
  const myToken = ++token;

  if (!hasSarvam()) {
    // browser voice can't stream — buffer and speak once at the end
    let buffered = '';
    return {
      push: (t) => { buffered += (buffered ? ' ' : '') + t; },
      end: () => speakWebSpeech(buffered, { onStart, onEnd, lang }),
    };
  }

  const player = createPlayer({ onEnd, myToken });
  let started = false;
  let chain = Promise.resolve(); // serialises synthesis so audio stays in order
  let all = '';

  return {
    push(sentence) {
      if (!sentence?.trim() || myToken !== token) return;
      all += (all ? ' ' : '') + sentence;
      chain = chain.then(async () => {
        if (myToken !== token) return;
        try {
          const urls = await synthesize(sentence, { lang, speaker: getSarvamSpeaker() });
          if (myToken !== token) {
            urls.forEach(URL.revokeObjectURL);
            return;
          }
          if (!started) {
            started = true;
            onStart?.('sarvam');
          }
          player.push(urls);
        } catch {
          // one sentence failing shouldn't strand the rest of the reply
        }
      });
    },
    end() {
      chain = chain.then(() => {
        if (myToken !== token) return;
        if (started) {
          player.done();
          return;
        }
        // nothing ever synthesized — say the whole thing in the browser voice
        onFallback?.();
        speakWebSpeech(all, { onStart, onEnd, lang });
      });
    },
  };
}

export function stopSpeaking() {
  token++;
  stopAudio();
  window.speechSynthesis?.cancel();
}

// ── listening ────────────────────────────────────────────────
// Same call signature as before so callers don't care which engine ran:
//   listen({ onResult(text, detectedLang), onEnd, onError, lang })
// `lang: null` asks Sarvam to auto-detect — that's what lets a customer just
// start speaking Tamil and have MITRA answer in Tamil.
function listenWebSpeech({ onResult, onEnd, onError, lang }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError?.('Voice input needs Chrome/Edge.');
    return null;
  }
  const rec = new SR();
  rec.lang = SPEECH_LANG[lang] || 'en-IN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => onResult?.(e.results[0][0].transcript, null);
  rec.onend = () => onEnd?.();
  rec.onerror = (e) => onError?.(e.error);
  rec.start();
  return rec;
}

export function listen({ onResult, onEnd, onError, onLevel, onTranscribing, lang = 'en', autoDetect = true }) {
  if (!hasSarvam() || !canRecord()) {
    return listenWebSpeech({ onResult, onEnd, onError, lang });
  }

  const session = recordUtterance({ onLevel });
  let finished = false;

  session.result
    .then(async (blob) => {
      onEnd?.();          // mic is closed; we're on to transcription
      onTranscribing?.(true);
      // autoDetect leaves language_code as 'unknown' so Saaras identifies it
      const { transcript, detected, confidence } = await transcribe(blob, {
        lang: autoDetect ? null : lang,
      });
      onTranscribing?.(false);
      finished = true;
      if (!transcript) {
        onError?.('no-speech');
        return;
      }
      // only trust a confident detection — a shaky one would flip MITRA's
      // language mid-conversation for no good reason
      onResult?.(transcript, confidence >= 0.6 ? detected : null);
    })
    .catch((err) => {
      onTranscribing?.(false);
      if (finished) return;
      const msg = err?.message || 'mic-failed';
      onEnd?.();
      if (msg !== 'aborted') onError?.(msg);
    });

  // matches the Web Speech recognition handle the callers already use
  return { stop: () => session.stop(), abort: () => session.abort() };
}
