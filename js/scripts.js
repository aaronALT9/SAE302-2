'use strict';
/* SAÉ 303-2 – Chart.js (+ GSAP) – data: Defra Family Food FYE 2025 */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = { fall: '#34a15f', rise: '#99FF66', home: '#34a15f', out: '#99FF66', ink: '#e9f1ec', grid: 'rgba(255,255,255,.12)' };
  const $ = (s) => document.querySelector(s);
  const n0 = (v) => Math.round(v).toLocaleString('en-GB');
  const fmt = (n, d = 1) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const state = { base: 2022, type: 'all', sort: 'fall', selected: '', t: reduce ? 1 : 0 };
  let groups = [], years = [], view = [], chartGroups, chartSpend, spendData, spendMode = 'gbp';

  if (typeof Chart === 'undefined' || typeof gsap === 'undefined') {
    document.body.insertAdjacentHTML('afterbegin', '<p role="alert">Libraries could not be loaded.</p>');
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  if (reduce) Chart.defaults.animation = false;
  Chart.defaults.font.family = '"Hanken Grotesk", Roboto, Arial, sans-serif';
  Chart.defaults.color = C.ink;
  Chart.defaults.borderColor = C.grid;
  Chart.defaults.elements.bar.borderRadius = 6;

  /* ---------- data ---------- */
  Promise.all([fetch('data/food-groups.json'), fetch('data/expenditure.json')])
    .then((r) => Promise.all(r.map((x) => x.json())))
    .then(([g, e]) => { groups = g.groups; years = g.years; spendData = e; init(); })
    .catch(() => {
      document.getElementById('fig2').insertAdjacentHTML('afterbegin',
        '<p role="alert">Data could not be loaded. Open this page through a web server, not by double-clicking the file.</p>');
    });

  function rows() {
    const i0 = years.indexOf(state.base), i1 = years.length - 1;
    const list = groups.filter((g) => state.type === 'all' || g.type === state.type).map((g) => ({
      name: g.name, unit: g.unit, v0: g.values[i0], v1: g.values[i1],
      pct: (g.values[i1] - g.values[i0]) / g.values[i0] * 100
    }));
    const sorts = { fall: (a, b) => a.pct - b.pct, rise: (a, b) => b.pct - a.pct, alpha: (a, b) => a.name.localeCompare(b.name) };
    return list.sort(sorts[state.sort]);
  }

  /* ---------- Figure 2 : Chart.js ---------- */
  function shade(ctx, color) {
    const r = view[ctx.dataIndex];
    return state.selected && r && r.name !== state.selected ? color + '55' : color;
  }
  function fillData() {
    view = rows();
    chartGroups.data.labels = view.map((r) => r.name);
    chartGroups.data.datasets[0].data = view.map((r) => (r.pct < 0 ? r.pct * state.t : null));
    chartGroups.data.datasets[1].data = view.map((r) => (r.pct >= 0 ? r.pct * state.t : null));
    $('#box-groups').style.height = Math.max(300, view.length * 30 + 110) + 'px';
  }
  function buildGroups() {
    chartGroups = new Chart($('#chart-groups'), {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Bought less', data: [], backgroundColor: (c) => shade(c, C.fall) },
        { label: 'Bought more', data: [], backgroundColor: (c) => shade(c, C.rise), borderWidth: 0 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, min: -40, max: 20, title: { display: true, text: 'Change in purchases per person (%)' }, ticks: { callback: (v) => v + '%' } },
          y: { stacked: true, ticks: { autoSkip: false } } },
        plugins: {
          legend: { position: 'top' },
          tooltip: { callbacks: { label: (c) => {
            const r = view[c.dataIndex];
            return fmt(r.pct) + '%  (' + n0(r.v0) + ' → ' + n0(r.v1) + ' ' + r.unit + ' a week)';
          } } } },
        onClick: (e, els) => { if (els.length) select(view[els[0].index].name); },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
      }
    });
  }
  function refresh(mode) {
    fillData();
    chartGroups.update(mode);
    fillTable();
    $('#chart-groups').setAttribute('aria-label', 'Horizontal bar chart: change in purchases since FYE ' + state.base +
      '. Largest fall: ' + view.slice().sort((a, b) => a.pct - b.pct)[0].name + '. Full data in the table below.');
  }
  function fillTable() {
    $('#table-groups thead').innerHTML = '<tr><th>Food group</th><th>FYE ' + state.base + '</th><th>FYE 2025</th><th>Change</th></tr>';
    $('#table-groups tbody').innerHTML = view.map((r) =>
      '<tr><td>' + r.name + '</td><td>' + n0(r.v0) + ' ' + r.unit + '</td><td>' + n0(r.v1) + ' ' + r.unit + '</td><td>' + fmt(r.pct) + '%</td></tr>').join('');
  }

  /* ---------- selection panel (GSAP counter driven by a Chart.js click) ---------- */
  const counter = { v: 0 };
  function select(name) {
    state.selected = name;
    $('#focus').value = name;
    const r = view.find((x) => x.name === name);
    chartGroups.update('none');
    if (!r) return;
    $('#detail-name').textContent = r.name;
    $('#detail-unit').textContent = r.unit + ' per person per week in FYE 2025';
    $('#detail-text').textContent = 'That is ' + fmt(Math.abs(r.pct)) + '% ' + (r.pct < 0 ? 'less' : 'more') +
      ' than the ' + n0(r.v0) + ' ' + r.unit + ' bought in FYE ' + state.base + '.';
    gsap.killTweensOf(counter);
    gsap.to(counter, { v: r.v1, duration: reduce ? 0 : 0.9, ease: 'power2.out',
      onUpdate: () => { $('#detail-value').textContent = Math.round(counter.v).toLocaleString('en-GB'); } });
    gsap.fromTo('#detail', { opacity: 0.4, y: 8 }, { opacity: 1, y: 0, duration: reduce ? 0 : 0.4 });
  }

  /* ---------- replay: GSAP tweens the data that Chart.js draws ---------- */
  function replay() {
    gsap.killTweensOf(state);
    state.t = 0;
    gsap.to(state, { t: 1, duration: reduce ? 0 : 1.8, ease: 'power2.out',
      onUpdate: () => { fillData(); chartGroups.update('none'); } });
  }

  /* ---------- Figure 1 ---------- */
  function spendValues() {
    const { home, out } = spendData;
    if (spendMode === 'gbp') return [home, out];
    const tot = home.map((h, i) => h + out[i]);
    return [home.map((h, i) => h / tot[i] * 100), out.map((o, i) => o / tot[i] * 100)];
  }
  function buildSpend() {
    const [h, o] = spendValues();
    chartSpend = new Chart($('#chart-spend'), {
      type: 'bar',
      data: { labels: spendData.years, datasets: [
        { label: 'At home', data: h, backgroundColor: C.home },
        { label: 'Eating out', data: o, backgroundColor: C.out, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '£ per person per week' }, ticks: { callback: (v) => '£' + v } } },
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (c) =>
          c.dataset.label + ': ' + (spendMode === 'gbp' ? '£' + fmt(c.parsed.y, 2) : fmt(c.parsed.y) + '%') } } } }
    });
  }
  function setSpendMode(mode) {
    spendMode = mode;
    const [h, o] = spendValues();
    chartSpend.data.datasets[0].data = h;
    chartSpend.data.datasets[1].data = o;
    const pct = mode === 'share';
    chartSpend.options.scales.y.title.text = pct ? 'Share of total spending (%)' : '£ per person per week';
    chartSpend.options.scales.y.ticks.callback = (v) => (pct ? v + '%' : '£' + v);
    chartSpend.update();
    document.querySelectorAll('#fig1 [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  /* ---------- page effects (GSAP) ---------- */
  function effects() {
    gsap.to('#progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
    document.querySelectorAll('[data-count]').forEach((el) => {
      const o = { v: 0 }, target = parseFloat(el.dataset.count), d = +el.dataset.dec || 0;
      const write = () => { el.textContent = (el.dataset.prefix || '') + fmt(o.v, d) + (el.dataset.suffix || ''); };
      if (reduce) return;
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true,
        onEnter: () => gsap.to(o, { v: target, duration: 1.4, ease: 'power1.out', onUpdate: write }) });
      o.v = 0; write();
    });
    if (!reduce) document.querySelectorAll('.reveal').forEach((el) =>
      gsap.from(el, { opacity: 0, y: 24, duration: 0.7, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));
    ScrollTrigger.create({ trigger: '#fig2', start: 'top 70%', once: true, onEnter: replay });
  }

  /* ---------- events ---------- */
  function init() {
    $('#focus').insertAdjacentHTML('beforeend', groups.map((g) => '<option>' + g.name + '</option>').join(''));
    buildGroups(); buildSpend(); refresh('none'); effects();

    $('#controls').addEventListener('submit', (e) => e.preventDefault());
    $('#controls').addEventListener('change', (e) => {
      const { name, value } = e.target;
      if (name === 'base') state.base = +value;
      else if (name === 'type') state.type = value;
      else if (name === 'sort') state.sort = value;
      else if (name === 'focus') { select(value); return; }
      if (state.selected && !rows().some((r) => r.name === state.selected)) state.selected = '';
      refresh();
      if (state.selected) select(state.selected);
    });
    $('#replay').addEventListener('click', replay);
    $('#fig1').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) setSpendMode(b.dataset.mode);
    });
  }
})();
