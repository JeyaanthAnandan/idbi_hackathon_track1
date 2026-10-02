// Runs the agentic onboarding demo. The API server streams the run (and can
// reach the live IDBI sandbox); when there is no server — the static hosted
// demo — the same flow runs here in the browser on simulated sources.
import { runOnboardingFlow } from './agents/onboardingFlow.js';
import { simulatedTools } from './agents/simulatedSources.js';

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
