// ─────────────────────────────────────────────────────────────
// A tiny agent runtime for the onboarding demo. It does not decide
// anything on its own: the flow in onboardingFlow.js is a fixed DAG, and
// this file only gives every agent the same way to think out loud, call a
// tool, and record a fact. Each of those becomes an event, so the same run
// can be streamed from the server or replayed in the browser.
//
// Runs on Node and in the browser — no imports, no globals.
// ─────────────────────────────────────────────────────────────

// Where a fact came from. The UI and the brief show this next to every
// value, so a simulated figure is never mistaken for a bank record.
export const TIERS = {
  LIVE: 'LIVE',             // returned by the IDBI sandbox gateway in this run
  SIMULATED: 'SIMULATED',   // a stand-in provider with a realistic shape
  DECLARED: 'DECLARED',     // the customer (or RM) said it
  DERIVED: 'DERIVED',       // computed by MITRA's engine from other facts
  ESTIMATED: 'ESTIMATED',   // a rule-based default, to be confirmed
};

const MASK_KEYS = /^(acctId|acid|acctNumber|accountId|accountID|cifId|custCifId|customerId|custId|mobile|partyIdentifierValue|vua|consentHandle|consentId|linkRefNumber|pan)$/i;

// Identifiers in tool arguments are shown masked. The sandbox ids are
// synthetic, but the trace should look the way a production one would.
export function redact(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => redact(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  if (MASK_KEYS.test(key) && (typeof value === 'string' || typeof value === 'number')) {
    const s = String(value);
    return s.length > 4 ? `••••${s.slice(-4)}` : '••••';
  }
  return value;
}

export const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new Error('Run cancelled'));
  const t = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(t); reject(new Error('Run cancelled')); }, { once: true });
});

export function createRun({ emit, signal, now = () => Date.now() }) {
  let seq = 0;
  const facts = new Map();
  const stats = { tools: 0, failedTools: 0, facts: 0 };

  const send = (event) => {
    if (signal?.aborted) throw new Error('Run cancelled');
    emit({ at: now(), ...event });
  };

  function fact(agent, field, value, { tier, source, label, display, asOf = null } = {}) {
    if (value === undefined || value === null) return;
    const entry = { field, value, tier, source, label: label || field, display: display ?? String(value), asOf, agent };
    facts.set(field, entry);
    stats.facts++;
    send({ type: 'fact', ...entry, value: typeof value === 'object' ? undefined : value });
  }

  function agent(name) {
    const ctx = {
      name,
      think: (text) => send({ type: 'thought', agent: name, text }),
      status: (status, note) => send({ type: 'agent', agent: name, status, note }),
      fact: (field, value, meta) => fact(name, field, value, meta),
      has: (field) => facts.has(field),
      get: (field) => facts.get(field)?.value,
      // A call the tool makes on the agent's behalf — e.g. one IDBI HTTP
      // request inside a statement fetch. `begin` shows it in flight and
      // returns the function that records its result.
      begin: (parent, { tool, api, args }) => {
        const id = `t${++seq}`;
        stats.tools++;
        send({ type: 'tool_call', id, parent, agent: name, tool, api, args: redact(args) });
        return ({ ms, ok = true, tier, summary, requestId, error }) => {
          if (!ok) stats.failedTools++;
          send({ type: 'tool_result', id, parent, ok, ms, tier, summary, requestId, error });
        };
      },
      subcall: (parent, call) => ctx.begin(parent, call)(call),
      // Calls `impl(callId)`, which returns { data, tier, summary, requestId };
      // the whole result comes back so the agent can tag facts with its tier.
      // A failure is reported on the trace and rethrown for the agent to handle.
      async tool(tool, args, impl, { api } = {}) {
        const id = `t${++seq}`;
        stats.tools++;
        send({ type: 'tool_call', id, agent: name, tool, api, args: redact(args) });
        const started = now();
        try {
          const out = await impl(id);
          send({ type: 'tool_result', id, ok: true, ms: now() - started, tier: out.tier, summary: out.summary, requestId: out.requestId });
          return out;
        } catch (error) {
          stats.failedTools++;
          if (signal?.aborted) throw error;
          send({ type: 'tool_result', id, ok: false, ms: now() - started, error: error.message });
          throw error;
        }
      },
    };
    return ctx;
  }

  return { agent, send, facts, stats };
}
