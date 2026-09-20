// Runs only the published /Development/*test fixtures, never production.
// Raw responses stay in ignored .data; the report contains field types, not values.
import fs from 'node:fs/promises';
import path from 'node:path';

const specDir = process.argv[2] || 'API-openspec';
const output = '.data/idbi-audit';
const origin = 'https://sandboxpocgatewayprod.idbi.bank.in';
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const scenarios = new Map();
for (const file of (await fs.readdir(specDir)).filter(f => f.endsWith('.yaml')).sort()) {
  const text = await fs.readFile(path.join(specDir, file), 'utf8');
  const endpoint = text.match(/^  (\/Development\/[^:]+):/m)?.[1];
  if (!endpoint || !/test(?:01)?$/i.test(endpoint)) throw new Error(`Non-test endpoint in ${file}`);
  const name = text.match(/x-api-name: "([^"]+)"/)?.[1]?.trim();
  const examples = [...text.matchAll(/value: ("(?:\\.|[^"\\])*")/g)].flatMap(match => {
    try { const payload = JSON.parse(JSON.parse(match[1])); return payload.errors ? [] : [payload]; }
    catch { return []; }
  });
  for (const payload of examples) scenarios.set(endpoint + JSON.stringify(payload), { endpoint, name, payload });
}
function shape(value, prefix = '$', fields = {}) {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  fields[prefix] = [...new Set([...(fields[prefix] || []), type])];
  if (Array.isArray(value)) value.forEach(item => shape(item, `${prefix}[]`, fields));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => shape(item, `${prefix}.${key}`, fields));
  return fields;
}
const report = { checkedAt: new Date().toISOString(), origin, distinctRoutes: new Set([...scenarios.values()].map(s => s.endpoint)).size, results: [] };
let index = 0;
for (const { endpoint, name, payload } of scenarios.values()) {
  const id = String(++index).padStart(2, '0');
  const started = Date.now();
  try {
    const response = await fetch(origin + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    await fs.writeFile(`${output}/${id}.json`, JSON.stringify(data ?? { nonJson: true }), { mode: 0o600 });
    const status = data?.status ?? data?.responseStatus ?? null;
    const applicationError = Boolean(data?.errors?.length || data?.error || /fail|error|reject/i.test(String(status)));
    const result = { id, name, endpoint, http: response.status, applicationStatus: typeof status === 'string' && /^[A-Z_ -]+$/i.test(status) ? status : null, applicationError, json: data !== null, elapsedMs: Date.now() - started, fields: shape(data) };
    report.results.push(result);
    console.log(`${id} ${name}: HTTP ${response.status}, applicationError=${applicationError}, fields=${Object.keys(result.fields).length}`);
  } catch (error) {
    report.results.push({ id, name, endpoint, transportError: error.name, elapsedMs: Date.now() - started });
    console.log(`${id} ${name}: ${error.name}`);
  }
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
}
console.log(`Verified ${report.results.length} scenarios across ${report.distinctRoutes} routes. Private report: ${output}/report.json`);
