import { createHash } from 'node:crypto';
import { newId } from './store.mjs';

function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function normalizeAdvicePassport(input) {
  if (
    !input || typeof input !== 'object'
    || typeof input.question !== 'string' || !input.question.trim()
    || typeof input.summary !== 'string' || !input.summary.trim()
    || typeof input.policyVersion !== 'string' || !input.policyVersion.trim()
    || typeof input.dataAsOf !== 'string' || !input.dataAsOf.trim()
  ) return null;
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (input.action?.status === 'EXECUTED') return null;
  const actionStates = new Set(['EDUCATIONAL', 'SIMULATED', 'PENDING_CONFIRMATION']);
  const actionStatus = actionStates.has(input.action?.status) ? input.action.status : 'EDUCATIONAL';
  return {
    question: input.question.slice(0, 2000),
    summary: input.summary.slice(0, 4000),
    recommendationType: String(input.recommendationType || 'general').slice(0, 80),
    engineMode: String(input.engineMode || 'DETERMINISTIC').slice(0, 40),
    promptVersion: input.promptVersion ? String(input.promptVersion).slice(0, 80) : null,
    riskProfile: String(input.riskProfile || 'Unknown').slice(0, 40),
    policyVersion: String(input.policyVersion || '').slice(0, 80),
    dataAsOf: String(input.dataAsOf || '').slice(0, 40),
    confidence,
    sources: Array.isArray(input.sources) ? input.sources.slice(0, 20).map((item) => String(item).slice(0, 200)) : [],
    formula: String(input.formula || '').slice(0, 1000),
    evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 20).map((item) => ({
      field: String(item?.field || '').slice(0, 120),
      value: String(item?.value || '').slice(0, 300),
      source: String(item?.source || '').slice(0, 200),
      asOf: String(item?.asOf || '').slice(0, 40),
    })) : [],
    assumptions: Array.isArray(input.assumptions) ? input.assumptions.slice(0, 20).map((item) => String(item).slice(0, 1000)) : [],
    action: { type: String(input.action?.type || 'none').slice(0, 80), status: actionStatus },
  };
}

export function issueAdviceReceipt(db, userId, passport, issuedAt = new Date().toISOString()) {
  db.adviceReceipts ||= [];
  const previous = [...db.adviceReceipts].reverse().find((item) => item.userId === userId);
  const payload = {
    id: newId('adv'), userId, issuedAt,
    previousHash: previous?.receiptHash || null, ...passport,
  };
  const receiptHash = createHash('sha256').update(stableJSON(payload)).digest('hex');
  const receipt = { ...payload, receiptHash };
  db.adviceReceipts.push(receipt);
  return receipt;
}

export function verifyAdviceReceiptChain(items, userId) {
  let previousHash = null;
  for (const receipt of items.filter((item) => item.userId === userId)) {
    const { receiptHash, ...payload } = receipt;
    const expected = createHash('sha256').update(stableJSON(payload)).digest('hex');
    if (receipt.previousHash !== previousHash || receiptHash !== expected) return false;
    previousHash = receiptHash;
  }
  return true;
}
