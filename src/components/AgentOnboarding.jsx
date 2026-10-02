import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { runAgentOnboarding } from '../engine/agentClient.js';
import { ONBOARDING_CUSTOMERS } from '../engine/agents/simulatedSources.js';
import { AGENTS } from '../engine/agents/onboardingFlow.js';
import '../agents.css';

// ─────────────────────────────────────────────────────────────
// Agentic onboarding — demo console. Plays one run of the onboarding
// agents: who was handed what, every tool call (and the IDBI requests
// inside it), each fact with its source tier, the data contracts, the
// questions MITRA asks, and the brief. Read-only: closing it leaves the
// customer's profile exactly as it was.
// ─────────────────────────────────────────────────────────────

const PACE = {
  demo: { thought: 650, tool_call: 170, tool_result: 240, fact: 120, handoff: 320, agent: 120, gap: 260, insight: 200, contract: 40, brief: 400, rm_task: 160, flag: 80 },
  fast: {},
};

const AGENT_HUE = { orchestrator: 168, identity: 200, core: 172, aa: 260, portfolio: 32, protection: 340, gaps: 48, dialogue: 140, insights: 190, narrator: 290 };
const agentName = Object.fromEntries(AGENTS.map((a) => [a.id, a.name]));
const nameToId = Object.fromEntries(AGENTS.map((a) => [a.name, a.id]));

const MODE_LABEL = {
  live: 'Live IDBI sandbox · other sources simulated',
  simulated: 'API server · simulated sources',
  browser: 'In-browser · simulated sources',
};

function initial() {
  return {
    mode: null, agents: {}, trace: [], calls: {}, facts: [], gaps: [], contracts: { 1: [], 2: [] },
    insights: [], flags: [], rmTasks: [], briefs: {}, done: null, error: null, startedAt: null,
  };
}

function reduce(state, event) {
  if (event.type === 'reset') return initial();
  const s = { ...state };
  switch (event.type) {
    case 'run':
      s.mode = event.mode;
      s.startedAt = event.at;
      s.agents = Object.fromEntries(event.agents.map((a) => [a.id, { ...a, status: 'idle', tools: 0 }]));
      s.trace = [{ kind: 'plan', key: 'plan', plan: event.plan }];
      break;
    case 'agent':
      s.agents = { ...s.agents, [event.agent]: { ...s.agents[event.agent], status: event.status, note: event.note } };
      break;
    case 'thought':
      s.trace = [...s.trace, { kind: 'thought', key: `th${s.trace.length}`, agent: event.agent, text: event.text }];
      break;
    case 'handoff':
      s.trace = [...s.trace, { kind: 'handoff', key: `ho${s.trace.length}`, from: event.from, to: nameToId[event.to] || event.to, note: event.note }];
      break;
    case 'tool_call': {
      const call = { ...event, children: [], status: 'running' };
      s.calls = { ...s.calls, [event.id]: call };
      s.agents = { ...s.agents, [event.agent]: { ...s.agents[event.agent], tools: (s.agents[event.agent]?.tools || 0) + 1 } };
      if (event.parent && s.calls[event.parent]) {
        const parent = s.calls[event.parent];
        s.calls[event.parent] = { ...parent, children: [...parent.children, event.id] };
      } else {
        s.trace = [...s.trace, { kind: 'tool', key: event.id, id: event.id }];
      }
      break;
    }
    case 'tool_result':
      if (s.calls[event.id]) s.calls = { ...s.calls, [event.id]: { ...s.calls[event.id], ...event, children: s.calls[event.id].children, status: event.ok ? 'ok' : 'failed' } };
      break;
    case 'fact':
      s.facts = [...s.facts.filter((f) => f.field !== event.field), event];
      s.trace = [...s.trace, { kind: 'fact', key: `fa${s.trace.length}`, ...event }];
      break;
    case 'gap':
      s.gaps = [...s.gaps, event];
      s.trace = [...s.trace, { kind: 'gap', key: `ga${s.trace.length}`, ...event }];
      break;
    case 'contract':
      s.contracts = { ...s.contracts, [event.pass]: [...s.contracts[event.pass], event] };
      break;
    case 'insight': s.insights = [...s.insights, event]; break;
    case 'flag': s.flags = [...s.flags, event]; break;
    case 'rm_task': s.rmTasks = [...s.rmTasks, event]; break;
    case 'brief': s.briefs = { ...s.briefs, [event.audience]: event }; break;
    case 'done': s.done = event; break;
    case 'error': s.error = event.message; break;
    default: break;
  }
  return s;
}

function Tier({ tier }) {
  if (!tier) return null;
  return <span className={`ag-tier ag-tier-${tier.toLowerCase()}`}>{tier}</span>;
}

function AgentDot({ id }) {
  return <span className="ag-dot" style={{ '--h': AGENT_HUE[id] ?? 180 }} aria-hidden />;
}

function ToolCall({ call, calls, depth = 0 }) {
  const [open, setOpen] = useState(false);
  if (!call) return null;
  return (
    <div className={`ag-call ag-call-${call.status} ${depth ? 'ag-call-child' : ''}`} style={{ '--h': AGENT_HUE[call.agent] ?? 180 }}>
      <button className="ag-call-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ag-call-state" aria-hidden>{call.status === 'running' ? <i className="ag-spin" /> : call.status === 'ok' ? '✓' : '✕'}</span>
        {!depth && <span className="ag-call-agent">{agentName[call.agent]}</span>}
        <code className="ag-call-tool">{call.tool}</code>
        {call.api && <span className="ag-api">API {call.api}</span>}
        <span className="ag-call-meta">
          <Tier tier={call.tier} />
          {call.ms !== undefined && <span className="ag-ms">{call.ms} ms</span>}
        </span>
      </button>
      {(call.summary || call.error) && <div className={`ag-call-summary ${call.error ? 'is-error' : ''}`}>{call.error || call.summary}</div>}
      {open && (
        <div className="ag-call-detail">
          <div className="ag-kv"><span>args</span><pre>{JSON.stringify(call.args, null, 2)}</pre></div>
          {call.requestId && <div className="ag-kv"><span>request id</span><code>{call.requestId}</code></div>}
        </div>
      )}
      {call.children.length > 0 && (
        <div className="ag-children">
          {call.children.map((id) => <ToolCall key={id} call={calls[id]} calls={calls} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

function TraceItem({ item, calls }) {
  switch (item.kind) {
    case 'plan':
      return (
        <div className="ag-plan">
          <div className="ag-section-title">Orchestrator plan</div>
          <ol>
            {item.plan.map((p) => (
              <li key={p.agent}><AgentDot id={p.agent} /><b>{agentName[p.agent]}</b> — {p.goal}{p.parallel && <span className="ag-par">∥ {agentName[p.parallel]}</span>}</li>
            ))}
          </ol>
        </div>
      );
    case 'thought':
      return <div className="ag-thought" style={{ '--h': AGENT_HUE[item.agent] ?? 180 }}><span className="ag-thought-who">{agentName[item.agent]}</span>{item.text}</div>;
    case 'handoff':
      return <div className="ag-handoff"><AgentDot id={item.from} />{agentName[item.from] || item.from}<span className="ag-arrow">→</span><AgentDot id={item.to} />{agentName[item.to] || item.to}<span className="ag-handoff-note">{item.note}</span></div>;
    case 'tool':
      return <ToolCall call={calls[item.id]} calls={calls} />;
    case 'fact':
      return <div className="ag-fact-line"><span className="ag-plus">+</span><span className="ag-fact-label">{item.label}</span><span className="ag-fact-value">{item.display}</span><Tier tier={item.tier} /></div>;
    case 'gap':
      return <div className="ag-gap-line"><span className="ag-q">?</span><code>{item.field}</code><span className="ag-who">→ {item.who === 'rm' ? 'RM' : item.who === 'mitra' ? 'MITRA' : 'customer'}</span><span className="ag-gap-q">{item.question}</span></div>;
    default:
      return null;
  }
}

export default function AgentOnboarding({ onClose }) {
  const [customer, setCustomer] = useState(ONBOARDING_CUSTOMERS[0].id);
  const [pace, setPace] = useState('demo');
  const [state, dispatch] = useReducer(reduce, undefined, initial);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState('trace'); // phone-width tabs
  const [now, setNow] = useState(Date.now());
  const abortRef = useRef(null);
  const paceRef = useRef(pace);
  const traceRef = useRef(null);
  const stick = useRef(true);
  paceRef.current = pace;

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'reset' });
    setRunning(true);
    stick.current = true;

    // Events arrive faster than anyone can read them; a queue replays them
    // at presentation pace without slowing the run itself.
    const queue = [];
    let streamDone = false;
    let wake = null;
    const player = (async () => {
      for (;;) {
        if (controller.signal.aborted) return;
        if (!queue.length) {
          if (streamDone) return;
          await new Promise((r) => { wake = r; });
          continue;
        }
        const event = queue.shift();
        dispatch(event);
        const delay = PACE[paceRef.current][event.type] || 0;
        if (delay) await new Promise((r) => setTimeout(r, delay));
      }
    })();
    const push = (event) => { queue.push(event); wake?.(); wake = null; };
    try {
      await runAgentOnboarding({ customer, signal: controller.signal, onEvent: push });
    } catch (error) {
      if (!controller.signal.aborted) push({ type: 'error', message: error.message });
    }
    streamDone = true;
    wake?.();
    await player;
    if (abortRef.current === controller) setRunning(false);
  };

  const stop = () => { abortRef.current?.abort(); setRunning(false); };

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    const el = traceRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [state.trace, state.calls]);

  const agents = AGENTS.map((a) => state.agents[a.id] || { ...a, status: 'idle', tools: 0 });
  const toolCount = Object.keys(state.calls).length;
  const failed = Object.values(state.calls).filter((c) => c.status === 'failed').length;
  const elapsed = state.startedAt ? ((state.done ? state.startedAt + state.done.ms : running ? now : state.startedAt) - state.startedAt) / 1000 : 0;
  const contracts = state.contracts[2].length ? state.contracts[2] : state.contracts[1];
  const firstPassReady = useMemo(() => new Set(state.contracts[1].filter((c) => c.ready).map((c) => c.id)), [state.contracts]);
  const tierCounts = state.facts.reduce((m, f) => ({ ...m, [f.tier]: (m[f.tier] || 0) + 1 }), {});
  const idle = !running && !state.mode;

  return createPortal(
    <div className="ag-root" role="dialog" aria-modal="true" aria-label="Agentic onboarding demo">
      <header className="ag-top">
        <div className="ag-title">
          <div className="ag-eyebrow">MITRA · agentic onboarding <span className="ag-demo-tag">demo</span></div>
          <h2>Onboard a customer with agents</h2>
        </div>
        <div className="ag-controls">
          <label className="ag-select">
            <span>Customer</span>
            <select value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={running}>
              {ONBOARDING_CUSTOMERS.map((c) => <option key={c.id} value={c.id}>{c.label} · CIF {c.cifHint}</option>)}
            </select>
          </label>
          <div className="ag-seg" role="group" aria-label="Playback pace">
            {['demo', 'fast'].map((p) => <button key={p} className={pace === p ? 'on' : ''} onClick={() => setPace(p)}>{p === 'demo' ? 'Presenter pace' : 'Real time'}</button>)}
          </div>
          {running
            ? <button className="ag-btn ag-btn-ghost" onClick={stop}>Stop</button>
            : <button className="ag-btn" onClick={start}>{state.mode ? 'Run again' : 'Start onboarding'}</button>}
          <button className="ag-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </header>

      <div className="ag-status">
        {state.mode && <span className={`ag-mode ag-mode-${state.mode}`}>{MODE_LABEL[state.mode]}</span>}
        <span>{toolCount} tool calls{failed ? ` · ${failed} failed` : ''}</span>
        <span>{state.facts.length} facts</span>
        <span>{elapsed.toFixed(1)} s</span>
        {Object.entries(tierCounts).map(([t, n]) => <span key={t} className="ag-tiercount"><Tier tier={t} /> {n}</span>)}
        <span className="ag-readonly">Read-only · the customer’s profile is not changed</span>
      </div>

      <nav className="ag-tabs" aria-label="Sections">
        {[['agents', 'Agents'], ['trace', 'Trace'], ['results', 'Results']].map(([id, label]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>

      <main className={`ag-grid ag-view-${view}`}>
        <aside className="ag-col ag-agents">
          <div className="ag-section-title">Agents</div>
          {agents.map((a) => (
            <div key={a.id} className={`ag-agent ag-agent-${a.status}`} style={{ '--h': AGENT_HUE[a.id] }}>
              <span className="ag-agent-orb" aria-hidden />
              <div className="ag-agent-body">
                <div className="ag-agent-name">{a.name}</div>
                <div className="ag-agent-role">{a.note || a.role}</div>
              </div>
              <div className="ag-agent-side">
                <span className="ag-agent-status">{a.status === 'idle' ? '' : a.status}</span>
                {a.tools > 0 && <span className="ag-agent-tools">{a.tools} call{a.tools === 1 ? '' : 's'}</span>}
              </div>
            </div>
          ))}
          <div className="ag-legend">
            <div className="ag-section-title">Source tiers</div>
            <p><Tier tier="LIVE" /> IDBI sandbox, this run</p>
            <p><Tier tier="SIMULATED" /> stand-in with the real API’s shape</p>
            <p><Tier tier="DECLARED" /> the customer said it</p>
            <p><Tier tier="DERIVED" /> computed by MITRA’s engine</p>
            <p><Tier tier="ESTIMATED" /> default, to be confirmed</p>
          </div>
        </aside>

        <section className="ag-col ag-trace" ref={traceRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
          {idle && (
            <div className="ag-empty">
              <div className="ag-empty-title">Ten agents, one customer picture</div>
              <p>Pick a customer and press <b>Start onboarding</b>. The orchestrator confirms KYC, then Core Banking and the Account Aggregator work in parallel. Portfolio and Protection run only under an active consent. The Gap Analyzer checks each insight’s data contract, MITRA asks the customer only for what is missing, and the Insight Engine and Narrator write the RM brief.</p>
              <p className="ag-empty-note">Every tool call is shown, including each IDBI gateway request inside it. Click a call to see its arguments, with identifiers masked.</p>
            </div>
          )}
          {state.trace.map((item) => <TraceItem key={item.key} item={item} calls={state.calls} />)}
          {state.error && <div className="ag-error">Run failed: {state.error}</div>}
          {state.done && <div className="ag-done">✓ Onboarding run complete in {(state.done.ms / 1000).toFixed(1)} s. {state.done.stats.insightsReady} of {state.done.stats.insightsTotal} insights ready.</div>}
        </section>

        <aside className="ag-col ag-results">
          <div className="ag-panel">
            <div className="ag-section-title">Fact ledger <span className="ag-count">{state.facts.length}</span></div>
            {!state.facts.length && <p className="ag-muted">Facts appear here as agents find them, each tagged with where it came from.</p>}
            <div className="ag-ledger">
              {state.facts.map((f) => (
                <div key={f.field} className="ag-ledger-row" title={`${f.field} · ${f.source}`}>
                  <span className="ag-ledger-label">{f.label}</span>
                  <span className="ag-ledger-value">{f.display}</span>
                  <Tier tier={f.tier} />
                  <span className="ag-ledger-src">{f.source}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ag-panel">
            <div className="ag-section-title">Data contracts <span className="ag-count">{contracts.filter((c) => c.ready).length}/{contracts.length || 8}</span></div>
            {!contracts.length && <p className="ag-muted">Each insight lists the facts it needs. Nothing is computed on a guess.</p>}
            {contracts.map((c) => {
              const insight = state.insights.find((i) => i.id === c.id);
              const unlocked = state.contracts[2].length && c.ready && !firstPassReady.has(c.id);
              return (
                <div key={c.id} className={`ag-contract ${c.ready ? 'is-ready' : 'is-blocked'}`}>
                  <div className="ag-contract-head">
                    <span className="ag-contract-state" aria-hidden>{c.ready ? '●' : '○'}</span>
                    <b>{c.title}</b>
                    {unlocked ? <span className="ag-unlocked">unlocked by customer</span> : null}
                  </div>
                  <div className="ag-contract-body">
                    {insight ? insight.value : c.ready ? 'Ready to compute' : `Needs ${c.missing.join(', ')}`}
                  </div>
                </div>
              );
            })}
          </div>

          {state.rmTasks.length > 0 && (
            <div className="ag-panel">
              <div className="ag-section-title">Tasks for the RM</div>
              {state.rmTasks.map((t) => <div key={t.field} className="ag-task"><b>{t.insights.join(', ')}</b>{t.task}</div>)}
            </div>
          )}

          {state.flags.length > 0 && (
            <div className="ag-panel">
              <div className="ag-section-title">Risk flags</div>
              {state.flags.map((f) => <div key={f.code + f.text} className={`ag-flag ag-flag-${f.level}`}><span>{f.code}</span>{f.text}</div>)}
            </div>
          )}

          {state.briefs.rm && (
            <div className="ag-panel ag-brief">
              <div className="ag-section-title">RM brief <span className="ag-gen">{state.briefs.rm.generator === 'ai' ? 'MITRA AI · figures checked' : 'policy engine'}</span></div>
              {state.briefs.rm.points.map((p) => <p key={p.title}><b>{p.title}</b> {p.text}</p>)}
            </div>
          )}
          {state.briefs.customer && (
            <div className="ag-panel ag-brief ag-brief-customer">
              <div className="ag-section-title">MITRA’s first message</div>
              <p>{state.briefs.customer.text}</p>
            </div>
          )}
        </aside>
      </main>
    </div>,
    document.body,
  );
}
