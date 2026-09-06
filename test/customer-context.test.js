import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

for (const mode of ['priya', 'arjun', 'empty', 'holdings-only', 'statement-only', 'deficit']) test(`all review paths survive ${mode} data`, () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const memory = new Map();
    globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) };
    const api = await import('./src/engine/api.js');
    const mode = process.env.TEST_PERSONA;
    if (['priya','arjun'].includes(mode)) localStorage.setItem('mitra_persona', mode);
    else {
      const { buildCustomPersona } = await import('./src/engine/personaBuilder.js');
      const { parseBankStatementCSV } = await import('./src/engine/statementImport.js');
      const transactions = ['statement-only','deficit'].includes(mode) ? parseBankStatementCSV('date,description,amount,type\\n2026-05-01,Salary,60000,credit\\n2026-05-02,Rent,30000,debit\\n2026-06-01,Salary,60000,credit\\n2026-06-02,Rent,30000,debit\\n2026-07-01,Salary,60000,credit\\n2026-07-02,Rent,30000,debit') : [];
      const { persona } = buildCustomPersona({ name: 'Isolated Test Customer', age: 35, transactions, holdings: mode === 'holdings-only' ? [{ type:'Stocks', label:'Test holding', value: 50000, liquid:true, growth:0 }] : [] });
      if (mode === 'deficit') {
        persona.monthlySummary.push({ month: 'Aug', income: 60000, spend: 80000, invested: 0 });
        persona.monthlySummary.forEach(m => m.spend = 80000);
        persona.dataQuality.transactionMonths = 4;
      }
      globalThis.fetch = async () => new Response(JSON.stringify({ available:true, session:{ id:'isolated', name:'Isolated Test Customer' }, profile:{ persona }, chat:[], onboarded:true, riskProfile:'Balanced' }), { headers:{ 'content-type':'application/json' } });
      await api.initializeApi();
    }
    const { respond } = await import('./src/engine/advisor.js');
    if (mode === 'holdings-only') {
      const { equityExposure, marketPulse, drift } = await import('./src/engine/analytics.js');
      assert.equal(equityExposure(), 100);
      assert.equal(marketPulse().equity, 50000);
      assert.equal(drift().current.find(row => row.name === 'Equity').pct, 100);
    }
    const { ADVISOR_TOOL_DEFINITIONS, executeAdvisorTool } = await import('./src/engine/advisorTools.js');
    const prompts = ['hello','show my portfolio','analyse my spending','invest my surplus','show my goals','save tax','unused subscriptions','emergency fund','financial health score','compare FD vs mutual funds','market crash','ideal portfolio','calculate ₹5000 for 10 years','market pulse','rebalance my portfolio','round-up','compare me with peers','guaranteed returns','am i protected','talk to a human advisor','xray my portfolio','harvest capital gains','prepay my loan or invest','money personality','afford all my goals'];
    for (const prompt of prompts) {
      const response = respond(prompt);
      assert.ok(response?.text, prompt);
      assert.doesNotMatch(JSON.stringify(response), /NaN|Infinity|undefined/, prompt);
      if (!['priya','arjun'].includes(mode)) assert.doesNotMatch(response.text, /Priya|Arjun|Europe Trip/);
    }
    if (mode === 'deficit') { assert.equal(respond('invest my surplus').cta, undefined); assert.match(respond('invest my surplus').text,/shortfall/); }
    if (!['priya','arjun'].includes(mode)) {
      assert.equal(respond('save tax').widget.type,'tax-unavailable');
      assert.equal(respond('am i protected').widget.type,'protection-unavailable');
      assert.equal(respond('xray my portfolio').widget.type,'xray-unavailable');
      assert.match(respond('prepay my loan or invest').text,/No verified active-loan/);
    }
    console.log(JSON.stringify({ mode, prompts: prompts.length }));
  `], { cwd: process.cwd(), env: { ...process.env, TEST_PERSONA: mode }, encoding: 'utf8' });
  assert.equal(JSON.parse(result).prompts, 25);
});
