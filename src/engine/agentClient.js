// Runs the agentic onboarding demo. The API server streams the run (and can
// reach the live IDBI sandbox); when there is no server — the static hosted
// demo — the same flow runs here in the browser on simulated sources.
import { runOnboardingFlow } from './agents/onboardingFlow.js';
import { simulatedTools, ONBOARDING_CUSTOMERS } from './agents/simulatedSources.js';

async function streamFromServer({ customer, onEvent, signal }) {
  const response = await fetch('/api/agents/onboard', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer }),
    signal,
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) return false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
  return true;
}

const titleCase = (value) => String(value || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// The onboarding customers the IDBI sandbox holds, as its APIs name them.
// Only customers the demo flow can run are offered; on any failure the
// caller keeps its built-in list.
export async function loadOnboardingCustomers() {
  try {
    const response = await fetch('/api/idbi/customers', { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
    if (!response.ok) return [];
    const { customers = [] } = await response.json();
    const runnable = new Set(ONBOARDING_CUSTOMERS.map((c) => c.id));
    return customers
      .filter((c) => runnable.has(c.key))
      .map((c) => ({ id: c.key, label: titleCase(c.name) || ONBOARDING_CUSTOMERS.find((o) => o.id === c.key).label, cifHint: `••••${String(c.cifId).slice(-4)}` }));
  } catch { return []; }
}

export async function runAgentOnboarding({ customer, onEvent, signal }) {
  let received = 0;
  const count = (event) => { received++; onEvent(event); };
  try {
    if (await streamFromServer({ customer, onEvent: count, signal })) return 'server';
  } catch (error) {
    // Only an unreachable server falls back; a run that broke midway is
    // reported, not silently replayed from the start on other data.
    if (signal?.aborted || received) throw error;
  }
  await runOnboardingFlow({ customer, tools: simulatedTools(customer, { signal }), emit: onEvent, signal, mode: 'browser' });
  return 'browser';
}
