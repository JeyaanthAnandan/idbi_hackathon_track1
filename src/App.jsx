import React, { useEffect, useRef, useState } from 'react';
import BankHome from './components/BankHome.jsx';
import WealthDashboard from './components/WealthDashboard.jsx';
import AvatarChat from './components/AvatarChat.jsx';
import Onboarding from './components/Onboarding.jsx';
import Simulator from './components/Simulator.jsx';
import Avatar from './components/Avatar.jsx';
import { getApiKey, setApiKey } from './engine/llm.js';
import { listVoices, getPreferredVoiceName, setPreferredVoiceName, speak } from './engine/speech.js';
import { awardXP } from './engine/xp.js';
import Icon from './components/Icons.jsx';

function Settings() {
  const [key, setKey] = useState(getApiKey());
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
    <div className="settings">
      <div className="eyebrow">Settings · this device</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 34, fontWeight: 600, letterSpacing: '-0.04em', marginTop: 6 }}>
        How MITRA behaves
      </div>

      <label className="settings-label">MITRA's voice</label>
      <p className="settings-note">
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
        onClick={() => speak("Hi Priya! I'm MITRA, your wealth advisor. This is how I sound.")}
      >
        ▶ Preview voice
      </button>

      <label className="settings-label">AI conversation · optional</label>
      <p className="settings-note">
        MITRA's advisory engine runs fully on-device for this demo. Optionally plug in an
        Anthropic API key to unlock open-ended conversation (grounded in the same customer data).
      </p>
      <div className="settings-row">
        <input
          type="password"
          placeholder="sk-ant-… (optional)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <button
        className="ghost-btn"
        onClick={() => {
          setApiKey(key);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        {saved ? 'Saved' : 'Save key'}
      </button>

      <div className="app-footnote" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 14 }}>
        Hybrid AI · deterministic engine + optional LLM
        <br />Voice · Web Speech API, mic works best in Chrome
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

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [riskProfile, setRiskProfile] = useState('Balanced');
  const [tab, setTab] = useState('home');
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [framed, setFramed] = useState(false);
  const screenRef = useRef(null);

  const night = !onboarded || NIGHT_TABS.has(tab);

  // Scroll choreography: elements float up and settle as they enter the
  // viewport (Apple product-page reveals), staggered slightly per element.
  useEffect(() => {
    const root = screenRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
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
      <button className="frame-toggle" onClick={() => setFramed(!framed)}>
        {framed ? 'Full window' : 'Phone demo'}
      </button>

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
            className={`tab-pane ${onboarded && tab === 'mitra' ? 'tab-pane-fill' : ''}`}
            key={onboarded ? tab : 'onboard'}
          >
            {!onboarded ? (
              <Onboarding
                onDone={(profile) => {
                  setRiskProfile(profile);
                  setOnboarded(true);
                  awardXP(50, 'onboarding');
                  setTab('mitra');
                }}
              />
            ) : (
              <>
                {tab === 'home' && <BankHome onOpenMitra={() => setTab('mitra')} />}
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

        {onboarded && (
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
