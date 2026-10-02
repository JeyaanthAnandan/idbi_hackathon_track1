// ─────────────────────────────────────────────────────────────
// Multilingual conversation helpers shared by every MITRA chat surface —
// the customer's chat and call (components/AvatarChat.jsx) and the RM
// console's copilot (components/rm/MitraRail.jsx).
//
// The reasoning always happens in English, so every surface gets the same
// audited figures in all nine languages:
//   1. find the language the question was asked in (speech: Saaras;
//      text: script, then Sarvam language ID for Hindi/Marathi/romanised);
//   2. in Auto mode, switch the reply language to match;
//   3. translate the question to English for the engine and the AI;
//   4. translate the reply back, line by line, keeping every figure intact;
//   5. speak it in the language the reply is actually written in.
// ─────────────────────────────────────────────────────────────
import { hasSarvam, identifyLanguage, isLatinScript, translateToEnglish, translateSarvam } from './sarvam.js';
import { hasDeepSeek, translate as translateWithDeepSeek } from './deepseek.js';
import { detectLanguage, scriptLanguage } from './languageDetect.js';
import { figuresPreserved } from './advisorTools.js';

export const canTranslate = () => hasSarvam() || hasDeepSeek();

// The language a message was written or spoken in, or null when it should
// not influence the reply language (a tapped button, or plain English while
// English is pinned). `romanized` is an Indian language in Latin letters.
export async function inputLanguage(text, { spokenLang = null, tapped = false, langMode = 'auto', currentLang = 'en' } = {}) {
  if (spokenLang) return { lang: spokenLang, romanized: false };
  if (tapped) return { lang: null, romanized: false };
  const mayBeVernacular = !isLatinScript(text) || langMode === 'auto' || currentLang !== 'en';
  if (!mayBeVernacular) return { lang: null, romanized: false };
  return detectLanguage(text, { identify: hasSarvam() ? identifyLanguage : null });
}

// The reply language after a message in `detected`. Auto follows the
// customer; a pinned language never moves. Without a translator only
// English and MITRA's hand-written Hindi exist.
export function nextReplyLanguage({ detected, langMode = 'auto', currentLang = 'en' }) {
  if (langMode !== 'auto' || !detected || detected === currentLang) return currentLang;
  if (!canTranslate() && !['en', 'hi'].includes(detected)) return currentLang;
  return detected;
}

export async function questionInEnglish(text, { romanized = false } = {}) {
  if (!hasSarvam() || (isLatinScript(text) && !romanized)) return text;
  try {
    const translated = await translateToEnglish(text, { force: romanized });
    return figuresPreserved(text, translated) ? translated : text;
  } catch { return text; }
}

export async function replyInLanguage(text, lang) {
  if (!text || lang === 'en' || !canTranslate()) return text;
  try {
    const translated = hasSarvam()
      ? await translateSarvam(text, lang, { check: figuresPreserved })
      : await translateWithDeepSeek(text, lang);
    return figuresPreserved(text, translated) ? translated : text;
  } catch { return text; }
}

// Speak in the language the reply is actually written in: a reply that could
// not be translated is still English (a Tamil voice reading English sounds
// broken), and a reply written in another script — "draft a Marathi call
// script" asked in English — needs that script's voice. Devanagari can't say
// Hindi from Marathi, so it gets the Hindi voice unless Marathi is selected.
export function voiceLanguageFor(text, lang) {
  const script = scriptLanguage(text);
  if (script === 'latin') return 'en';
  if (script === 'deva') return ['hi', 'mr'].includes(lang) ? lang : 'hi';
  return script;
}
