// Explicit opt-in live checks. Only synthetic text leaves this process.
// Run: node --env-file=.env scripts/verify-providers.mjs
const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)) };
const sarvamKey = process.env.VITE_SARVAM_API_KEY || process.env.SARVAM_API_KEY;
const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
if (sarvamKey) memory.set('mitra_sarvam_key', sarvamKey);
if (deepseekKey) memory.set('mitra_deepseek_key', deepseekKey);
const { selectSarvamAdvisorTool, translateSarvam, verifySarvamKey, synthesize, transcribe } = await import('../src/engine/sarvam.js');
const { selectDeepSeekAdvisorTool } = await import('../src/engine/deepseek.js');
const { ADVISOR_TOOL_DEFINITIONS, validateAdvisorToolCall, figuresPreserved } = await import('../src/engine/advisorTools.js');
const probes = [
  ['fees', 'Please examine what the fund manager charges me', 'review_fees'],
  ['definition', 'What does systematic investment plan mean?', 'explain_concept'],
  ['ambiguity', 'What about that thing?', 'clarify_request'],
];
for (const [provider, key, router] of [['Sarvam', sarvamKey, selectSarvamAdvisorTool], ['DeepSeek', deepseekKey, selectDeepSeekAdvisorTool]]) {
  if (!key) { console.log(JSON.stringify({ provider, status: 'NOT_CONFIGURED' })); continue; }
  for (const [probe, text, expected] of probes) {
    const start = Date.now();
    try {
      const call = await router({ messages: [{ role: 'user', content: text }], tools: ADVISOR_TOOL_DEFINITIONS, signal: AbortSignal.timeout(12000) });
      const ok = validateAdvisorToolCall(call).ok && call.name === expected;
      console.log(JSON.stringify({ provider, probe, status: ok ? 'PASS' : 'FAIL', tool: call.name, expected, elapsedMs: Date.now() - start }));
    } catch (error) {
      console.log(JSON.stringify({ provider, probe, status: 'UNAVAILABLE', error: error.name, elapsedMs: Date.now() - start }));
    }
  }
}
if (sarvamKey) {
  try { await verifySarvamKey(); console.log(JSON.stringify({ provider: 'Sarvam', probe: 'tts', status: 'PASS' })); }
  catch (error) { console.log(JSON.stringify({ provider: 'Sarvam', probe: 'tts', status: 'UNAVAILABLE', error: error.name })); }
  for (const lang of ['hi', 'ta']) {
    const source = 'Invest ₹5,000 each month for 10 years at 11%. Returns are not guaranteed.';
    try {
      const translated = await translateSarvam(source, lang);
      console.log(JSON.stringify({ provider: 'Sarvam', probe: `translation-${lang}`, status: translated !== source && figuresPreserved(source, translated) ? 'PASS' : 'FAIL' }));
    } catch (error) { console.log(JSON.stringify({ provider: 'Sarvam', probe: `translation-${lang}`, status: 'UNAVAILABLE', error: error.name })); }
  }
  try {
    const urls = await synthesize('Please show my portfolio.', { lang: 'en' });
    try {
      const blob = await (await fetch(urls[0])).blob();
      const result = await transcribe(blob);
      console.log(JSON.stringify({ provider: 'Sarvam', probe: 'synthetic-audio-transcription', status: /portfolio/i.test(result.transcript) ? 'PASS' : 'FAIL', detected: result.detected }));
    } finally { urls.forEach((url) => URL.revokeObjectURL(url)); }
  } catch (error) { console.log(JSON.stringify({ provider: 'Sarvam', probe: 'synthetic-audio-transcription', status: 'UNAVAILABLE', error: error.name })); }
}
