// ─────────────────────────────────────────────────────────────
// Chat persistence — the MITRA conversation used to reset every time you
// switched tabs or reloaded. Now it survives, like a real chat app.
// ─────────────────────────────────────────────────────────────
const KEY = 'mitra_chat_history';
const MAX_HISTORY = 40;
import { getBootstrap, saveServerState } from './api.js';

export function loadChatHistory() {
  if (getBootstrap().session) return getBootstrap().chat || [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveChatHistory(messages) {
  try {
    localStorage.setItem(KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    void saveServerState({ kind: 'chat', chat: messages.slice(-MAX_HISTORY) }).catch(() => {});
  } catch {
    /* storage full or unavailable — chat just won't persist this session */
  }
}

export function clearChatHistory() {
  localStorage.removeItem(KEY);
  void saveServerState({ kind: 'chat', chat: [] }).catch(() => {});
}
