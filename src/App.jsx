import React, { useEffect, useRef, useState } from 'react';
import BankHome from './components/BankHome.jsx';
import WealthDashboard from './components/WealthDashboard.jsx';
import AvatarChat from './components/AvatarChat.jsx';
import OnboardingChoice from './components/OnboardingChoice.jsx';
import Auth from './components/Auth.jsx';
import Simulator from './components/Simulator.jsx';
import WebApp from './components/WebApp.jsx';
import Avatar from './components/Avatar.jsx';
import { listVoices, getPreferredVoiceName, setPreferredVoiceName, speak } from './engine/speech.js';
import { awardXP } from './engine/xp.js';
import Icon from './components/Icons.jsx';
import { getDeepSeekKey, setDeepSeekKey, LANGUAGES } from './engine/deepseek.js';
import {
  hasSarvam, getSarvamKey, setSarvamKey, clearSarvamKey, sarvamKeyFromEnv,
  SARVAM_SPEAKERS, getSarvamSpeaker, setSarvamSpeaker, verifySarvamKey,
} from './engine/sarvam.js';
import { getSession, logOut, isOnboarded, markOnboarded, getStoredRiskProfile, setStoredRiskProfile } from './engine/auth.js';
import { PERSONA_LIST, getActivePersonaId, switchPersona, customer } from './data/customer.js';

const THEME_KEY = 'mitra_theme';
const getTheme = () => localStorage.getItem(THEME_KEY) || 'system';
const applyTheme = (t) => {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
};
applyTheme(getTheme()); // apply once at module load, before first paint — no flash

function ThemePicker() {
  const [theme, setTheme] = useState(getTheme());
  const options = [
    ['system', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  return (
    <>
      <label className="settings-label">Appearance</label>
      <div className="settings-row" role="radiogroup" aria-label="Appearance" style={{ gap: 8 }}>
        {options.map(([id, label]) => (
          <button
            key={id}
            className="ghost-btn"
            role="radio"
            aria-checked={theme === id}
            style={theme === id ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : undefined}
            onClick={() => {
              localStorage.setItem(THEME_KEY, id);
              applyTheme(id);
              setTheme(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

function PersonaPicker() {
  const active = getActivePersonaId();
  return (
    <>
      <label className="settings-label">Switch demo customer</label>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 6 }}>
        MITRA's advice is computed from data, not hand-tuned for one customer — switch and every
        score, nudge and projection changes. Resets XP and chat for a clean run.
      </p>
      {PERSONA_LIST.map((p) => (
        <button
          key={p.id}
          className="ghost-btn"
          style={{
            display: 'block', width: '100%', textAlign: 'left', marginTop: 8,
            ...(p.id === active ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : {}),
          }}
          disabled={p.id === active}
          onClick={() => {
            if (window.confirm(`Switch to ${p.label}? This resets XP, applied advice and chat, then reloads.`)) {
              switchPersona(p.id);
            }
          }}
        >
          <div style={{ fontWeight: 700 }}>{p.label}{p.id === active ? ' · active' : ''}</div>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 400, marginTop: 2 }}>{p.blurb}</div>
        </button>
      ))}
    </>
  );
}

function AccountSection() {
  const session = getSession();
  if (!session) return null;
  return (
    <>
      <label className="settings-label">Account</label>
      <p style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, marginBottom: 2 }}>{session.name}</p>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>
        {session.demo ? 'Demo session · not saved' : session.email}
      </p>
      <button
        className="ghost-btn"
        onClick={() => {
          if (window.confirm('Log out of MITRA?')) {
            logOut();
            window.location.reload();
          }
        }}
      >
        Log out
      </button>
    </>
  );
}

// Sarvam is MITRA's voice. It ships configured from .env, so this panel is
// about *choosing how she sounds* rather than about pasting a key — the key
// field is only there so a judge can swap in their own on a hosted build.
function SarvamSection() {
  const [speaker, setSpeaker] = useState(getSarvamSpeaker());
  const [previewLang, setPreviewLang] = useState('hi');
  const [key, setKey] = useState(() => (sarvamKeyFromEnv() ? '' : getSarvamKey()));
  const [status, setStatus] = useState(null); // 'checking' | 'ok' | 'fail'
  const [playing, setPlaying] = useState(false);
  const active = hasSarvam();
  const fromEnv = sarvamKeyFromEnv();

  const PREVIEW = {
    en: "Hi, I'm MITRA. Your surplus this month is 18,500 rupees — shall we put it to work?",
    hi: 'नमस्ते, मैं मित्रा हूँ। इस महीने आपके पास 18,500 रुपये बचे हैं — इन्हें निवेश करें?',
    ta: 'வணக்கம், நான் மித்ரா. இந்த மாதம் உங்களிடம் 18,500 ரூபாய் மிச்சம் இருக்கு — முதலீடு செய்யலாமா?',
    te: 'నమస్కారం, నేను మిత్ర. ఈ నెల మీ దగ్గర 18,500 రూపాయలు మిగిలాయి — పెట్టుబడి పెడదామా?',
    bn: 'নমস্কার, আমি মিত্রা। এই মাসে আপনার 18,500 টাকা বেঁচেছে — বিনিয়োগ করব?',
    mr: 'नमस्कार, मी मित्रा. या महिन्यात तुमच्याकडे 18,500 रुपये शिल्लक आहेत — गुंतवणूक करूया?',
    gu: 'નમસ્તે, હું મિત્રા છું. આ મહિને તમારી પાસે 18,500 રૂપિયા બચ્યા છે — રોકાણ કરીએ?',
    kn: 'ನಮಸ್ಕಾರ, ನಾನು ಮಿತ್ರಾ. ಈ ತಿಂಗಳು ನಿಮ್ಮ ಬಳಿ 18,500 ರೂಪಾಯಿ ಉಳಿದಿದೆ — ಹೂಡಿಕೆ ಮಾಡೋಣವೇ?',
    ml: 'നമസ്കാരം, ഞാൻ മിത്ര. ഈ മാസം നിങ്ങൾക്ക് 18,500 രൂപ ബാക്കിയുണ്ട് — നിക്ഷേപിക്കാമോ?',
  };

  return (
    <>
      <label className="settings-label">
        MITRA's voice · Sarvam AI{' '}
        {active && <span style={{ color: 'var(--green)', fontWeight: 600 }}>· active</span>}
      </label>
      <p className="settings-note">
        Bulbul v3 speaks all 9 languages with a real Indian voice, and Saaras v3 works out
        which language you spoke — so you can just talk, in whatever you're comfortable in.
        {fromEnv && ' Configured for this build.'}
      </p>

      <div className="settings-row">
        <select
          value={speaker}
          onChange={(e) => {
            setSpeaker(e.target.value);
            setSarvamSpeaker(e.target.value);
          }}
        >
          {SARVAM_SPEAKERS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} — {v.tone}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <select value={previewLang} onChange={(e) => setPreviewLang(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              Preview in {l.label} ({l.native})
            </option>
          ))}
        </select>
      </div>
      <button
        className="ghost-btn"
        disabled={playing}
        onClick={() => {
          setPlaying(true);
          speak(PREVIEW[previewLang] || PREVIEW.en, {
            lang: previewLang,
            onEnd: () => setPlaying(false),
          });
        }}
      >
        {playing ? '● Speaking…' : '▶ Hear this voice'}
      </button>

      <div className="settings-row">
        <input
          type="password"
          placeholder={fromEnv ? 'Using the built-in key — paste to override' : 'sk_… Sarvam API key'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <div className="settings-row" style={{ display: 'flex', gap: 8 }}>
        <button
          className="ghost-btn"
          disabled={status === 'checking'}
          onClick={async () => {
            setStatus('checking');
            const hadOverride = !sarvamKeyFromEnv();
            const previous = getSarvamKey();
            key.trim() ? setSarvamKey(key) : clearSarvamKey();
            try {
              await verifySarvamKey();
              setStatus('ok');
            } catch {
              // never leave a dead key in place — restore what worked before
              if (hadOverride) setSarvamKey(previous);
              else clearSarvamKey();
              setStatus('fail');
            }
            setTimeout(() => setStatus(null), 2600);
          }}
        >
          {status === 'checking' ? 'Checking…' : status === 'ok' ? 'Key verified' : status === 'fail' ? 'Key rejected' : 'Save & test key'}
        </button>
        {!fromEnv && key && (
          <button
            className="ghost-btn"
            onClick={() => {
              clearSarvamKey();
              setKey('');
            }}
          >
            Reset
          </button>
        )}
      </div>
    </>
  );
}

function Settings() {
  const [key, setKey] = useState(getDeepSeekKey());
  const [saved, setSaved] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState(getPreferredVoiceName());
  const sarvamActive = hasSarvam();

  useEffect(() => {
    setVoices(listVoices());
    // some browsers load voices asynchronously
    const t = setTimeout(() => setVoices(listVoices()), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="settings">
      <div className="eyebrow">Settings · this device</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 600, letterSpacing: '-0.04em', marginTop: 6 }}>
        How MITRA behaves
      </div>

      <AccountSection />
      <ThemePicker />
      <PersonaPicker />

      <SarvamSection />

      {/* Only worth showing when Sarvam is off — otherwise the browser voice
          never runs, and offering a dead setting is just confusing. */}
      {!sarvamActive && (
        <>
          <label className="settings-label">Fallback voice · this device</label>
          <p className="settings-note">
            Sarvam is off, so MITRA uses your browser's voice. Quality depends on your device —
            voices marked “Natural” or “Google” usually sound best, and most devices have no
            Tamil, Telugu, Kannada or Malayalam voice at all.
          </p>
          <div className="settings-row">
            <select
              value={voiceName}
              onChange={(e) => {
                setVoiceName(e.target.value);
                setPreferredVoiceName(e.target.value);
              }}
            >
              <option value="">Auto (best available)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
          <button
            className="ghost-btn"
            onClick={() => speak(`Hi ${customer.name.split(' ')[0]}! I'm MITRA, your wealth advisor. This is how I sound.`)}
          >
            ▶ Preview voice
          </button>
        </>
      )}

      <label className="settings-label">
        MITRA AI · DeepSeek {key ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>· active</span> : ''}
      </label>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        MITRA's advisory engine runs fully on-device. Add a DeepSeek key to unlock the reasoning
        layer — visible chain-of-thought answers, the Offer X-Ray scam checker, and natural-language
        goal creation. Languages and voice are handled by Sarvam above. All grounded in the same
        computed customer data.
      </p>
      <div className="settings-row">
        <input
          type="password"
          placeholder="sk-… DeepSeek API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <button
        className="ghost-btn"
        onClick={() => {
          setDeepSeekKey(key);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? 'Saved' : 'Save key'}
      </button>
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        Prototype stores the key in your browser for a zero-backend demo. In production it must live
        server-side — the app never ships the key to a real bank build.
      </div>

      <div className="app-footnote" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 14 }}>
        Hybrid AI · deterministic engine + optional LLM
        <br />Voice · {sarvamActive ? 'Sarvam Bulbul v3 + Saaras v3, with Web Speech fallback' : 'Web Speech API, mic works best in Chrome'}
        <br />Languages · 9 Indian languages, spoken language auto-detected
        <br />All figures computed live from synthetic bank data
        <br />Advisory content is illustrative, not investment advice
      </div>
    </div>
  );
}

const REVEAL_SELECTOR = [
  '.balance-card', '.brief-strip', '.mitra-banner',
  '.section-title', '.list-card', '.giant-word', '.card', '.nudge',
  '.wealth-hero', '.sim-card', '.sim-hero', '.ob-options',
].join(', ');

// Screens that run on the night surface. The whole app inverts around
// these — status bar, nav pill and every card read the same variables.
const NIGHT_TABS = new Set(['simulate']);

// The desktop shell needs real room: enough width for dashboard + chat rail
// side by side, and enough height for the rail's own nav to breathe. Below
// either threshold the phone shell is the better answer, not a squeezed
// version of the web one.
const WEB_SHELL_MQ = '(min-width: 1024px) and (min-height: 600px)';

function useRoomForWebShell() {
  const [roomy, setRoomy] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WEB_SHELL_MQ).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(WEB_SHELL_MQ);
    const onChange = (e) => setRoomy(e.matches);
    setRoomy(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return roomy;
}

// Optional deep-link for demos / screenshots:
//   ?demo=1&screen=home|wealth|mitra|simulate|settings&frame=1
// jumps straight past onboarding to a given tab (and phone frame). Handy for
// capturing marketing shots and for a "resume where I was" style entry.
const demoParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const DEMO = demoParams.get('demo') === '1';
const DEMO_SCREEN = demoParams.get('screen') || 'home';

// After the Connect/Upload onboarding paths finish (which finalize via a
// full page reload, since customer.js binds the active persona at module
// load), this lets the reload land straight on MITRA chat instead of Home.
// Read once at module load (not inside a useState initializer) — React
// StrictMode double-invokes those in dev, and this read also clears the
// flag as a side effect, so the second invocation would silently lose it.
let INITIAL_LAND_TAB = null;
try {
  INITIAL_LAND_TAB = sessionStorage.getItem('mitra_land_tab');
  if (INITIAL_LAND_TAB) sessionStorage.removeItem('mitra_land_tab');
} catch {
  // sessionStorage unavailable — fall through to the default tab
}

export default function App() {
  const [session, setSession] = useState(DEMO ? { name: customer.name, demo: true } : getSession());
  const [onboarded, setOnboarded] = useState(DEMO || isOnboarded());
  const [riskProfile, setRiskProfile] = useState(DEMO ? 'Balanced' : (getStoredRiskProfile() || 'Balanced'));
  const [tab, setTab] = useState(DEMO ? DEMO_SCREEN : (INITIAL_LAND_TAB || 'home'));
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [framed, setFramed] = useState(demoParams.get('frame') === '1');
  const screenRef = useRef(null);
  const roomForWebShell = useRoomForWebShell();

  const night = !onboarded || NIGHT_TABS.has(tab);

  // Sign-in and onboarding are full-bleed night-surface flows built for the
  // phone shell; the desktop workspace takes over once there is an
  // onboarded customer with data to lay out.
  const webShell = !!session && onboarded && roomForWebShell && !framed;

  // Scroll choreography: elements float up and settle as they enter the
  // viewport (Apple product-page reveals), staggered slightly per element.
  useEffect(() => {
    const root = screenRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (DEMO) return; // demo/screenshot mode: everything rendered fully visible
    const els = root.querySelectorAll(REVEAL_SELECTOR);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('reveal-in');
            io.unobserve(en.target);
          }
        });
      },
      { root, threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    els.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(el);
    });
    return () => io.disconnect();
  }, [tab, onboarded]);

  const askMitra = (prompt) => {
    setPendingPrompt(prompt);
    setTab('mitra');
  };

  if (webShell) {
    return (
      <>
        {!DEMO && (
          <button className="frame-toggle on-web" onClick={() => setFramed(true)}>
            Phone demo
          </button>
        )}
        <WebApp
          riskProfile={riskProfile}
          tab={tab}
          onTab={setTab}
          settingsPanel={<Settings />}
        />
      </>
    );
  }

  return (
    <>
      {!DEMO && (
        <button className="frame-toggle" onClick={() => setFramed(!framed)}>
          {framed ? 'Full window' : 'Phone demo'}
        </button>
      )}

      <div
        className={`app-shell ${framed ? 'framed' : 'full'}`}
        data-surface={night ? 'night' : 'day'}
      >
        {framed && (
          <>
            <div className="notch" />
            <div className="statusbar">
              <span>1:47</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                5G
                <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}>
                  <i style={{ width: 3, height: 8, background: 'currentColor', borderRadius: 1 }} />
                  <i style={{ width: 3, height: 11, background: 'currentColor', borderRadius: 1 }} />
                  <i style={{ width: 3, height: 14, background: 'currentColor', borderRadius: 1 }} />
                </span>
                <span
                  style={{
                    width: 22, height: 11, border: '1px solid currentColor', borderRadius: 3,
                    position: 'relative', display: 'inline-block',
                  }}
                >
                  <i style={{ position: 'absolute', inset: 1.5, width: '80%', background: 'currentColor', borderRadius: 1 }} />
                </span>
              </span>
            </div>
          </>
        )}

        <div className={`screen ${onboarded ? 'has-nav' : ''}`} ref={screenRef}>
          <div
            className={`tab-pane ${session && onboarded && tab === 'mitra' ? 'tab-pane-fill' : ''}`}
            key={!session ? 'auth' : !onboarded ? 'onboard' : tab}
          >
            {!session ? (
              <Auth onAuthed={(s) => setSession(s)} />
            ) : !onboarded ? (
              <OnboardingChoice
                onDone={(profile) => {
                  setRiskProfile(profile);
                  setStoredRiskProfile(profile);
                  markOnboarded();
                  setOnboarded(true);
                  awardXP(50, 'onboarding');
                  setTab('mitra');
                }}
              />
            ) : (
              <>
                {tab === 'home' && (
                  <BankHome onOpenMitra={() => setTab('mitra')} onAsk={askMitra} riskProfile={riskProfile} />
                )}
                {tab === 'wealth' && <WealthDashboard onAsk={askMitra} riskProfile={riskProfile} />}
                {tab === 'mitra' && (
                  <AvatarChat
                    riskProfile={riskProfile}
                    initialPrompt={pendingPrompt}
                    onConsumeInitial={() => setPendingPrompt(null)}
                  />
                )}
                {tab === 'simulate' && <Simulator onAsk={askMitra} />}
                {tab === 'settings' && <Settings />}
              </>
            )}
          </div>
        </div>

        {session && onboarded && (
          <div className="bottom-nav">
            {[
              ['home', 'home', 'Home'],
              ['wealth', 'chart', 'Wealth'],
              ['mitra', null, 'MITRA'],
              ['simulate', 'clock', 'Machine'],
              ['settings', 'gear', 'Settings'],
            ].map(([id, ic, label]) =>
              id === 'mitra' ? (
                <button
                  key={id}
                  className={`nav-item orb ${tab === id ? 'active' : ''}`}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                  aria-label={label}
                >
                  <span className="orb-ring">
                    <Avatar size={36} mood="happy" />
                  </span>
                </button>
              ) : (
                <button
                  key={id}
                  className={`nav-item ${tab === id ? 'active' : ''}`}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                >
                  <span className="ni">
                    <Icon name={ic} size={18} />
                  </span>
                  {label}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
