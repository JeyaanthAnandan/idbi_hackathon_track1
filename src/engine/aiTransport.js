// Which AI providers the MITRA API can reach with its own server-held keys.
// The browser never holds those keys: when a provider is available here, its
// calls go through /api/ai/* and the server adds the key. A key a tester
// pastes in Settings still works and is used directly from that browser.
let status = { deepseek: false, sarvam: false };

export const setAiStatus = (value) => { status = { deepseek: Boolean(value?.deepseek), sarvam: Boolean(value?.sarvam) }; };
export const serverAi = () => status;
