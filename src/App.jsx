import React, { useEffect, useRef, useState } from 'react';
import BankHome from './components/BankHome.jsx';
import WealthDashboard from './components/WealthDashboard.jsx';
import AvatarChat from './components/AvatarChat.jsx';
import OnboardingChoice from './components/OnboardingChoice.jsx';
import Auth from './components/Auth.jsx';
import Simulator from './components/Simulator.jsx';
import Avatar from './components/Avatar.jsx';
import { listVoices, getPreferredVoiceName, setPreferredVoiceName, speak } from './engine/speech.js';
import { awardXP } from './engine/xp.js';
import Icon from './components/Icons.jsx';
import { getDeepSeekKey, setDeepSeekKey } from './engine/deepseek.js';
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

function Settings() {
  const [key, setKey] = useState(getDeepSeekKey());
  const [saved, setSaved] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState(getPreferredVoiceName());

  useEffect(() => {
    setVoices(listVoices());
    // some browsers load voices asynchronously
    const t = setTimeout(() => setVoices(listVoices()), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: 18, marginBottom: 6 }}>Settings</h2>

      <AccountSection />
      <ThemePicker />
      <PersonaPicker />

      <label className="settings-label">MITRA's voice</label>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 6 }}>
        Voice quality depends on your device. Pick the one that sounds most natural —
        voices marked “Natural” or “Google” usually sound best.
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

      <label className="settings-label">
        MITRA AI · DeepSeek {key ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>· active</span> : ''}
      </label>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        MITRA's advisory engine runs fully on-device. Add a DeepSeek key to unlock the AI layer —
        reasoning-mode answers, 8 Indian languages, the Offer X-Ray scam checker, and natural-language
        goal creation. All grounded in the same computed customer data.
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
        className="primary-btn"
        style={{ marginTop: 14 }}
        onClick={() => {
          setDeepSeekKey(key);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? 'Saved' : 'Save'}
      </button>
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        Prototype stores the key in your browser for a zero-backend demo. In production it must live
        server-side — the app never ships the key to a real bank build.
      </div>

      <div style={{ marginTop: 26, fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
        <b>Prototype notes</b>
        <br />• Hybrid AI: deterministic advisory engine + optional LLM
        <br />• Voice: Web Speech API (mic works best in Chrome)
        <br />• All figures computed live from synthetic bank data
        <br />• Advisory content is illustrative, not investment advice
      </div>
    </div>
  );
}

const REVEAL_SELECTOR = [
  '.balance-card', '.marquee', '.brief-strip', '.quick-grid', '.mitra-banner',
  '.section-title', '.list-card', '.giant-word', '.card', '.nudge',
  '.wealth-hero', '.sim-card', '.sim > .primary-btn', '.ob-option',
].join(', ');

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

  return (
    <>
      {!DEMO && (
        <button className="frame-toggle" onClick={() => setFramed(!framed)}>
          {framed ? 'Full window' : 'Phone demo'}
        </button>
      )}

      <div className={`app-shell ${framed ? 'framed' : 'full'}`}>
        {framed && (
          <>
            <div className="notch" />
            <div className="statusbar">
              <span>1:47</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                5G
                <span style={{ display: 'inline-flex', gap: 2 }}>
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

        <div className="screen" ref={screenRef}>
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
              ['simulate', 'clock', 'Time Machine'],
              ['settings', 'gear', 'Settings'],
            ].map(([id, ic, label]) =>
              id === 'mitra' ? (
                <button
                  key={id}
                  className={`nav-item orb ${tab === id ? 'active' : ''}`}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                >
                  <span className="orb-ring">
                    <Avatar size={40} mood="happy" />
                  </span>
                  {label}
                </button>
              ) : (
                <button
                  key={id}
                  className={`nav-item ${tab === id ? 'active' : ''}`}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                >
                  <span className="ni">
                    <Icon name={ic} size={19} />
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
