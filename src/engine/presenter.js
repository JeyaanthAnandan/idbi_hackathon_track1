// Data and narration share one scene: a highlighted value can never drift
// away from the number MITRA is explaining. No model-generated money values.
const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const valid = (n) => typeof n === 'number' && Number.isFinite(n);

export function buildPresenterScene({ topic, holdings = [], spending = [], monthly = 0, years = 10, rate = 0, series = [] }) {
  if (topic === 'spending') {
    const bars = spending.filter((s) => valid(s.amount) && s.amount >= 0).map((s, i) => ({
      id: `spend-${i}`, label: s.category, value: s.amount,
      reference: valid(s.avg3m) && s.avg3m >= 0 ? s.avg3m : null,
    }));
    const total = bars.reduce((sum, bar) => sum + bar.value, 0);
    return {
      title: 'Where your money goes', eyebrow: 'SPENDING BREAKDOWN', unit: 'Amount spent', bars,
      stats: [{ label: 'Shown categories', value: total }, { label: 'Categories', text: String(bars.length) }],
      note: 'Selected statement period. Outlined markers show the three-month average where available.',
      steps: [
        { target: null, label: 'The overview', text: bars.length ? `Let’s open your spending breakdown. These ${bars.length} categories total ${money(total)}. Select any bar and I’ll explain it.` : 'There is no spending data to explain yet. Connect accounts or upload a statement first.' },
        ...bars.map((b) => ({ target: b.id, label: b.label, text: `${b.label} accounts for ${money(b.value)}.${b.reference === null ? ' A comparison average is not available.' : ` The three-month average is ${money(b.reference)}. That is ${money(Math.abs(b.value - b.reference))} ${b.value >= b.reference ? 'above' : 'below'} the average.`}` })),
      ],
    };
  }
  if (topic === 'growth') {
    const invested = monthly * years * 12;
    const future = series.at(-1)?.value ?? invested;
    const gain = future - invested;
    const bars = [
      { id: 'contributions', label: 'You contribute', value: invested },
      { id: 'growth', label: 'Projected growth', value: gain },
      { id: 'value', label: 'Projected value', value: future },
    ];
    return {
      title: 'See what your monthly SIP could become', eyebrow: 'YOUR WHAT-IF STUDIO', unit: 'Projected amount', bars, series,
      stats: [{ label: 'Monthly SIP', value: monthly }, { label: 'Time horizon', text: `${years} years` }, { label: 'Assumed annual return', text: `${rate}%` }],
      note: `Illustration at ${rate}% annually, with monthly contributions at the start of each month. Before fees, taxes and inflation. Returns are not guaranteed.`,
      steps: [
        { target: null, label: 'Set the scene', text: `Let me bring up a projection. We’re modelling ${money(monthly)} a month for ${years} years, assuming ${rate} percent annually. This is a scenario, not a promised return.` },
        { target: 'contributions', label: 'Your contribution', text: `Look at this first bar. You would contribute ${money(invested)} of your own money over ${years} years.` },
        { target: 'growth', label: 'The growth', text: `This middle bar shows ${money(Math.abs(gain))} of projected ${gain >= 0 ? 'growth' : 'loss'}. It is separate from your contributions and depends on the assumed return.` },
        { target: 'value', label: 'The full picture', text: `The last bar combines the two: ${money(future)} in projected portfolio value. Change the monthly amount or return below and I’ll update the picture.` },
      ],
    };
  }
  const eligible = holdings.filter((h) => valid(h.value) && h.value >= 0 && valid(h.cost) && h.cost >= 0);
  const omitted = holdings.length - eligible.length;
  const bars = eligible.map((h, i) => ({ id: `holding-${i}`, label: h.label || h.name || h.type || 'Holding', value: h.value - h.cost, cost: h.cost, current: h.value }));
  const cost = eligible.reduce((sum, h) => sum + h.cost, 0);
  const value = eligible.reduce((sum, h) => sum + h.value, 0);
  return {
    title: 'Your investments, explained', eyebrow: 'PORTFOLIO GAIN / LOSS', unit: 'Unrealised gain / loss', bars,
    stats: [{ label: 'Recorded cost', value: cost }, { label: 'Current value', value }, { label: 'Unrealised gain / loss', value: value - cost }].map((stat) => bars.length ? stat : { label: stat.label, text: 'Unavailable' }),
    note: `Current value minus recorded cost; excludes realised profit, fees and taxes.${omitted ? ` ${omitted} holding(s) excluded because cost or value is missing.` : ''} This is a snapshot, not a historical return chart.`,
    steps: [
      { target: null, label: 'Your overview', text: bars.length ? `Let’s look at the investments with a recorded cost. Their current value is ${money(value)}, against ${money(cost)} invested. That is an unrealised ${value >= cost ? 'gain' : 'loss'} of ${money(Math.abs(value - cost))}.` : 'I need both cost and current value to explain gains. Those values are not available for your holdings yet.' },
      ...bars.map((b) => ({ target: b.id, label: b.label, text: `Here is ${b.label}. Its recorded cost is ${money(b.cost)}, and its current value is ${money(b.current)}. This bar shows an unrealised ${b.value >= 0 ? 'gain' : 'loss'} of ${money(Math.abs(b.value))}.` })),
    ],
  };
}

export function presenterIntent(text) {
  const q = text.toLowerCase();
  if (/\b(stop|pause|wait|hold on)\b/.test(q)) return 'pause';
  if (/\b(next|continue|carry on)\b/.test(q)) return 'next';
  if (/\b(repeat|again|replay)\b/.test(q)) return 'repeat';
  if (/\b(spend|spending|expenses|expense|dining|budget)\b/.test(q)) return 'spending';
  if (/\b(sip|future|growth|projection|project|invest monthly)\b/.test(q)) return 'growth';
  if (/\b(profit|profits|gain|gains|loss|losses|portfolio|holdings)\b/.test(q)) return 'portfolio';
  return null;
}

// Carry the actual chat result into the explanation instead of opening an
// unrelated default scenario. Unsupported widgets keep their existing UI.
export function presentationForWidget(widget) {
  if (!widget?.data) return null;
  if (widget.type === 'allocation') return { topic: 'portfolio', label: 'Explain investment gains' };
  if (widget.type === 'spending' && Array.isArray(widget.data.categories)) {
    return { topic: 'spending', spending: widget.data.categories, label: 'Explain this chart' };
  }
  if (widget.type === 'sip') {
    const { monthly, years, rate } = widget.data;
    if (![monthly, years, rate].every(valid) || monthly < 0 || years <= 0 || years > 100 || rate < 0 || rate > 100) return null;
    return { topic: 'growth', scenario: { monthly, years, rate }, label: 'Explain this projection' };
  }
  return null;
}

// Reuse the presentation's figures and per-bar explanations inside a call.
export function callSceneForWidget(widget, holdings = []) {
  const request = presentationForWidget(widget);
  if (!request) return null;
  if (request.topic === 'growth' && !valid(widget.data.fv)) return null;
  return buildPresenterScene({ topic: request.topic, holdings, spending: request.spending,
    ...request.scenario, series: request.topic === 'growth' ? [{ value: widget.data.fv }] : [],
  });
}

export function callChartTargets(widget, holdings = []) {
  return (callSceneForWidget(widget, holdings)?.bars || []).slice(0, 30).map((bar) => ({ id: `call-bar-${bar.id}`, label: bar.label }));
}
