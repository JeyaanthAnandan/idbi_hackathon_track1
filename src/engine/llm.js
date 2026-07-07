// Optional LLM layer — if the user pastes an Anthropic API key in Settings,
// free-form questions outside the rule engine go to Claude, grounded with
// the customer's computed financial context. The prototype is fully
// functional without it (hybrid design = zero-dependency demo).
import { financialContext } from './advisor.js';

const KEY_STORAGE = 'mitra_api_key';

export const getApiKey = () => localStorage.getItem(KEY_STORAGE) || '';
export const setApiKey = (k) => localStorage.setItem(KEY_STORAGE, k.trim());

export async function askClaude(history, userText, riskProfile) {
  const key = getApiKey();
  if (!key) return null;

  const messages = [
    ...history.slice(-6).map((m) => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: userText },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: financialContext(riskProfile),
      messages,
    }),
  });
  if (!res.ok) throw new Error('LLM call failed: ' + res.status);
  const data = await res.json();
  return data.content?.[0]?.text || null;
}
