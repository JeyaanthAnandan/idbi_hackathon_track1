// Voice layer — Web Speech API. TTS for MITRA's replies, STT for the mic.
// Voice quality varies by device, so we rank all installed voices and pick
// the most natural-sounding one; the user can override in Settings.
import { SPEECH_LANG } from './deepseek.js';

const VOICE_PREF = 'mitra_voice';

let voices = [];

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

export function speak(text, { onStart, onEnd, lang = 'en' } = {}) {
  if (!window.speechSynthesis) return false;
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
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

export function listen({ onResult, onEnd, onError, lang = 'en' }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError?.('Voice input needs Chrome/Edge.');
    return null;
  }
  const rec = new SR();
  rec.lang = SPEECH_LANG[lang] || 'en-IN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => onResult?.(e.results[0][0].transcript);
  rec.onend = () => onEnd?.();
  rec.onerror = (e) => onError?.(e.error);
  rec.start();
  return rec;
}
