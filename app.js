'use strict';
// Never Twice: a habit tracker built on one rule — never skip it twice.
// Data stays on the phone in localStorage, one key per person.
const APP_VERSION = '2026-11-23.1';

const PEOPLE = [
  { id: 'sagar', name: 'Sagar' },
  { id: 'madhumita', name: 'Madhumita' },
];
const PERSON_KEY = 'nevertwice.person';
const keyFor = id => `nevertwice.v1.${id}`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL = [0, 1, 2, 3, 4, 5, 6];
const SUGGEST = [
  { emoji: '🏋️', name: 'Workout', full: '60-minute workout', small: '10-minute workout', days: [1, 2, 3, 5, 6] },
  { emoji: '📖', name: 'Read', full: 'One chapter', small: 'One page', days: ALL },
  { emoji: '🌙', name: 'In bed by 11:30 PM', full: 'Lights out by 11:30 PM', small: 'Phone away by 11:30 PM', days: ALL },
  { emoji: '🚶', name: 'Walk', full: '8,000 steps', small: '10-minute walk', days: ALL },
  { emoji: '🧘', name: 'Meditate', full: '15 minutes', small: '2 minutes', days: ALL },
  { emoji: '📞', name: 'Calls', full: 'Five calls', small: 'One call', days: [1, 2, 3, 4, 5] },
];

// ---------- dates ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const nice = s => parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const sundayOf = s => { const d = parse(s); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return ymd(d); }; // week ends Sunday

// ---------- state ----------
let person = load(PERSON_KEY) || 'sagar';
if (!PEOPLE.some(p => p.id === person)) person = 'sagar';
let S = fresh(load(keyFor(person)));
let view = 'today';
let weekEnd = null; // Sunday of the week shown in Review

function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function fresh(s) {
  s = s && typeof s === 'object' ? s : {};
  return { habits: Array.isArray(s.habits) ? s.habits : [], log: s.log || {}, reviews: s.reviews || {}, drafts: s.drafts || {} };
}
function save() {
  try { localStorage.setItem(keyFor(person), JSON.stringify(S)); localStorage.setItem(PERSON_KEY, JSON.stringify(person)); }
  catch { toast('Could not save on this phone'); }
}
const uid = () => Math.random().toString(36).slice(2, 9);
const active = () => S.habits.filter(h => !h.archived);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

// ---------- the rule ----------
// A habit's timeline: every scheduled day from its start to `upto`, plus any extra day you logged.
// A past scheduled day with no entry counts as a miss. Today with no entry is "open".
function timeline(h, upto = today()) {
  const out = []; const t = today();
  for (let k = h.created; k <= upto; k = addDays(k, 1)) {
    const s = (S.log[k] || {})[h.id];
    const sched = h.days.includes(parse(k).getDay());
    if (s) out.push({ d: k, s });
    else if (sched) out.push({ d: k, s: k < t ? 'miss' : 'open' });
  }
  return out;
}
function missRun(tl) {
  let n = 0;
  for (let i = tl.length - 1; i >= 0; i--) {
    if (tl[i].s === 'open') continue;
    if (tl[i].s === 'miss') n++; else break;
  }
  return n;
}
function stats(h) {
  const tl = timeline(h).filter(x => x.s !== 'open');
  let firsts = 0, returned = 0, doubles = 0, full = 0, small = 0, miss = 0;
  tl.forEach((x, i) => {
    if (x.s === 'full') full++; else if (x.s === 'small') small++; else miss++;
    if (x.s === 'miss' && (i === 0 || tl[i - 1].s !== 'miss')) {
      if (tl[i + 1]) { firsts++; if (tl[i + 1].s !== 'miss') returned++; }
    }
    if (x.s === 'miss' && i > 0 && tl[i - 1].s === 'miss' && (i < 2 || tl[i - 2].s !== 'miss')) doubles++;
  });
  return { firsts, returned, doubles, full, small, miss, total: tl.length };
}
function nextDay(h, from) {
  for (let i = 1; i <= 7; i++) { const k = addDays(from, i); if (h.days.includes(parse(k).getDay())) return k; }
  return null;
}
function lastWasComeback(tl) {
  // true when today is logged done and the entry before it was a miss
  const i = tl.length - 1;
  return i > 0 && tl[i].d === today() && (tl[i].s === 'full' || tl[i].s === 'small') && tl[i - 1].s === 'miss';
}

// ---------- TODAY ----------
function renderToday() {
  const t = today();
  $('today-label').textContent = parse(t).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const hs = active();
  const list = $('today-list'), rest = $('rest-list');

  // Sunday review nudge
  const wk = t === sundayOf(t) ? t : addDays(sundayOf(t), -7);
  $('review-nudge').innerHTML = hs.length && !S.reviews[wk] && (t === wk || parse(t).getDay() === 1)
    ? `<div class="nudge"><div><b>${t === wk ? 'It’s Sunday.' : 'Missed Sunday’s review?'}</b><p>One minute. Nothing to type.</p></div><button class="btn small" data-go="review">Start</button></div>`
    : '';

  if (!hs.length) {
    $('today-summary').innerHTML = '';
    rest.innerHTML = '';
    list.innerHTML = `<div class="card empty">
      <p class="big">Never skip it twice.</p>
      <p class="muted">Pick a habit. Give it a small version for the days you are tired. Missing once is fine. Just come back on the next day.</p>
      <div class="sugs">${SUGGEST.map((s, i) => `<button class="btn ghost small" data-sug="${i}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div>
      <button class="btn primary" style="margin-top:14px" data-add>+ My own habit</button></div>`;
    return;
  }

  const todayHs = [], others = [];
  hs.forEach(h => {
    const scheduled = h.days.includes(parse(t).getDay());
    const logged = (S.log[t] || {})[h.id];
    (scheduled || logged ? todayHs : others).push(h);
  });

  const doneCount = todayHs.filter(h => ['full', 'small'].includes((S.log[t] || {})[h.id])).length;
  const atRisk = hs.filter(h => missRun(timeline(h)) >= 1).length;
  const st = hs.map(stats).reduce((a, b) => ({ firsts: a.firsts + b.firsts, returned: a.returned + b.returned }), { firsts: 0, returned: 0 });
  const rate = st.firsts ? Math.round(100 * st.returned / st.firsts) + '%' : '—';
  $('today-summary').innerHTML = `
    <div class="tile"><b>${doneCount} / ${todayHs.length}</b><span>done today</span></div>
    <div class="tile"><b style="color:${atRisk ? 'var(--amber)' : 'inherit'}">${atRisk}</b><span>comeback ${atRisk === 1 ? 'habit' : 'habits'}</span></div>
    <div class="tile"><b>${rate}</b><span>came back after a miss</span></div>`;

  list.innerHTML = todayHs.map(h => habitCard(h)).join('') ||
    `<div class="card"><p class="muted">Nothing planned today. Rest is part of it.</p></div>`;
  rest.innerHTML = others.length ? `<h3 class="section-title">Not planned today</h3>` + others.map(h => restCard(h)).join('') : '';
}

function dotsHtml(h, tl) {
  const shown = tl.slice(-14);
  return `<div class="dots">${shown.map((x, i) => {
    const prev = shown[i - 1] || tl[tl.length - shown.length + i - 1];
    const second = x.s === 'miss' && prev && prev.s === 'miss';
    const title = `${nice(x.d)}: ${{ full: 'done', small: 'small version', miss: 'missed', open: 'today' }[x.s]}`;
    return `<button class="dot ${x.s}${second ? ' second' : ''}" title="${title}" aria-label="${title}" data-edit="${h.id}" data-day="${x.d}"></button>`;
  }).join('')}<span class="lbl">last ${shown.length} days planned</span></div>`;
}

function habitCard(h) {
  const t = today();
  const tl = timeline(h);
  const run = missRun(tl);
  const s = (S.log[t] || {})[h.id];
  let cls = 'ok', badge = '<span class="badge ok">On track</span>', msg = '', actions = '';

  if (s === 'full' || s === 'small') {
    cls = 'done';
    badge = s === 'full' ? '<span class="badge done">Done ✓</span>' : '<span class="badge small">Small version ✓</span>';
    if (lastWasComeback(tl)) msg = `<p class="msg back"><b>You came back.</b> That counts more than any streak.</p>`;
    actions = `<button class="btn link" data-log="${h.id}" data-s="">Undo</button>`;
  } else if (s === 'miss') {
    cls = run >= 2 ? 'twice' : 'comeback';
    badge = `<span class="badge ${cls}">Missed today</span>`;
    msg = run >= 2
      ? `<p class="msg twice">That's twice in a row. Pick your comeback day now, and make it small: <b>${esc(h.small)}</b>.</p>`
      : `<p class="msg comeback">Fine, it happens. Next time is your comeback day${nextDay(h, t) ? ': <b>' + nice(nextDay(h, t)) + '</b>' : ''}. Don't skip it twice.</p>`;
    actions = `<button class="btn link" data-log="${h.id}" data-s="">Undo</button>`;
  } else {
    if (run >= 2) {
      cls = 'twice'; badge = `<span class="badge twice">Missed ${run} in a row</span>`;
      msg = `<p class="msg twice"><b>Come back today.</b> Do the small version and you're back on track.</p>`;
    } else if (run === 1) {
      cls = 'comeback'; badge = '<span class="badge comeback">Comeback day</span>';
      msg = `<p class="msg comeback"><b>You missed last time. Don't miss again today.</b> The small version counts.</p>`;
    }
    actions = run >= 1
      ? `<button class="btn amber grow" data-log="${h.id}" data-s="small">Small: ${esc(h.small)}</button>
         <button class="btn ghost grow" data-log="${h.id}" data-s="full">Full: ${esc(h.full)}</button>
         <button class="btn link" data-log="${h.id}" data-s="miss">Missed</button>`
      : `<button class="btn done grow" data-log="${h.id}" data-s="full">Done: ${esc(h.full)}</button>
         <button class="btn ghost grow" data-log="${h.id}" data-s="small">Small: ${esc(h.small)}</button>
         <button class="btn link" data-log="${h.id}" data-s="miss">Missed</button>`;
  }
  return `<div class="card habit ${cls}">
    <div class="h-top"><div class="h-emoji">${esc(h.emoji || '•')}</div>
      <div><div class="h-name">${esc(h.name)}</div><div class="h-sub">${daysText(h.days)}</div></div>${badge}</div>
    ${msg}${dotsHtml(h, tl)}<div class="actions">${actions}</div></div>`;
}

function restCard(h) {
  const tl = timeline(h); const run = missRun(tl); const nx = nextDay(h, today());
  const badge = run >= 2 ? `<span class="badge twice">Missed ${run} in a row</span>`
    : run === 1 ? '<span class="badge comeback">Next is comeback day</span>' : '<span class="badge ok">On track</span>';
  return `<div class="card rest habit ${run >= 2 ? 'twice' : run ? 'comeback' : 'ok'}">
    <div class="h-top"><div class="h-emoji">${esc(h.emoji || '•')}</div>
      <div><div class="h-name">${esc(h.name)}</div><div class="h-sub">Next: ${nx ? nice(nx) : '—'}</div></div>${badge}</div>
    <div class="actions"><button class="btn ghost small" data-log="${h.id}" data-s="full">Did it anyway</button></div></div>`;
}

function daysText(days) {
  const d = [...days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  return `${d.length}× a week · ` + d.map(i => DOW[(i)]).join(' ');
}

function setLog(hid, day, s) {
  S.log[day] = S.log[day] || {};
  const h = S.habits.find(x => x.id === hid);
  const wasRun = h ? missRun(timeline(h, addDays(day, -1)).filter(x => x.d < day)) : 0;
  if (s) S.log[day][hid] = s; else delete S.log[day][hid];
  if (!Object.keys(S.log[day]).length) delete S.log[day];
  save();
  if ((s === 'full' || s === 'small') && day === today()) {
    buzz(wasRun ? [30, 60, 30] : 20);
    toast(wasRun ? 'You came back. That’s the habit.' : s === 'small' ? 'Small still counts.' : 'Done. Nice.');
  }
  if (s === 'miss' && wasRun >= 1) toast('Twice in a row. Plan the comeback in Review.');
  render();
}

// ---------- edit a past day ----------
function editDay(hid, day) {
  const h = S.habits.find(x => x.id === hid); if (!h) return;
  const cur = (S.log[day] || {})[hid] || (day < today() ? 'miss' : '');
  openSheet(`<h2>${esc(h.emoji)} ${esc(h.name)}</h2><p class="muted" style="margin-bottom:14px">${nice(day)}</p>
    <div class="stack">
      <button class="btn ${cur === 'full' ? 'done' : 'ghost'}" data-set="full">Done: ${esc(h.full)}</button>
      <button class="btn ${cur === 'small' ? 'amber' : 'ghost'}" data-set="small">Small: ${esc(h.small)}</button>
      <button class="btn ${cur === 'miss' ? 'danger' : 'ghost'}" data-set="miss">Missed</button>
      ${!h.days.includes(parse(day).getDay()) ? `<button class="btn link" data-set="">Not planned that day</button>` : ''}
    </div>`, el => {
    el.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { closeSheet(); setLog(hid, day, b.dataset.set); });
  });
}

// ---------- HABITS ----------
function renderHabits() {
  const hs = active();
  $('habit-list').innerHTML = hs.length ? hs.map(h => `<div class="card hrow" data-habit="${h.id}">
      <div class="h-emoji">${esc(h.emoji || '•')}</div>
      <div style="flex:1;min-width:0"><div class="h-name">${esc(h.name)}</div>
      <div class="h-sub">${daysText(h.days)}</div>
      <div class="h-sub">Full: ${esc(h.full)} · Small: ${esc(h.small)}</div></div>
      <span class="muted">Edit ›</span></div>`).join('')
    : `<div class="card"><p class="muted">No habits yet. Add one.</p></div>`;

  const all = hs.map(h => ({ h, s: stats(h) }));
  const sum = all.reduce((a, { s }) => { for (const k in s) a[k] = (a[k] || 0) + s[k]; return a; }, {});
  const rate = sum.firsts ? Math.round(100 * sum.returned / sum.firsts) + '%' : '—';
  const showUp = sum.total ? Math.round(100 * (sum.full + sum.small) / sum.total) + '%' : '—';
  $('stats').innerHTML = `
    <div class="tile"><b>${rate}</b><span>came back after one miss (${sum.returned || 0} of ${sum.firsts || 0})</span></div>
    <div class="tile"><b>${sum.doubles || 0}</b><span>times missed twice in a row</span></div>
    <div class="tile"><b>${showUp}</b><span>planned days you showed up</span></div>
    <div class="tile"><b>${sum.small || 0}</b><span>days the small version saved</span></div>` +
    all.map(({ h, s }) => `<div class="tile"><b>${s.firsts ? Math.round(100 * s.returned / s.firsts) + '%' : '—'}</b>
      <span>${esc(h.emoji)} ${esc(h.name)}: came back · ${s.doubles} double ${s.doubles === 1 ? 'miss' : 'misses'}</span></div>`).join('');
  $('version').textContent = `Version ${APP_VERSION}`;
}

function editHabit(h, preset) {
  const isNew = !h;
  const d = h || Object.assign({ emoji: '✨', name: '', full: '', small: '', days: [...ALL] }, preset || {});
  let days = [...d.days];
  openSheet(`<h2>${isNew ? 'Add a habit' : 'Edit habit'}</h2>
    ${isNew ? `<p class="muted" style="margin-bottom:8px">Tap one to add it:</p><div class="quick">${SUGGEST.map((s, i) => `<button class="btn ghost small" data-q="${i}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div>
      <p class="muted" style="margin-bottom:8px">Or type your own:</p>` : ''}
    <input id="f-name" value="${esc(d.name)}" placeholder="e.g. Drink 2 L water" style="margin-bottom:10px">
    <details class="more" ${isNew ? '' : 'open'}><summary>More options</summary>
      <div class="row2"><label style="flex:0 0 76px">Icon <input id="f-emoji" value="${esc(d.emoji)}" maxlength="4"></label>
        <label>Full version <input id="f-full" value="${esc(d.full)}" placeholder="Same as the name"></label></div>
      <label>Small version, for comeback days <input id="f-small" value="${esc(d.small)}" placeholder="Just 2 minutes"></label>
      <label>Days</label><div class="daypick">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button data-d="${i}" class="${days.includes(i) ? 'on' : ''}">${DOW[i]}</button>`).join('')}</div>
    </details>
    <div class="stack"><button class="btn primary" id="f-save">${isNew ? 'Add' : 'Save'}</button>
      ${isNew ? '' : '<button class="btn danger" id="f-del">Remove habit</button>'}</div>`, el => {
    const paintDays = () => el.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', days.includes(+b.dataset.d)));
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      const i = +b.dataset.d; days = days.includes(i) ? days.filter(x => x !== i) : [...days, i]; paintDays();
    });
    el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { closeSheet(); addSuggestion(+b.dataset.q); });
    $('f-save').onclick = () => {
      const name = $('f-name').value.trim();
      if (!name) return toast('Give the habit a name');
      if (!days.length) return toast('Pick at least one day');
      const rec = { emoji: $('f-emoji').value.trim() || '•', name, full: $('f-full').value.trim() || name,
        small: $('f-small').value.trim() || 'Just 2 minutes', days: days.sort() };
      if (isNew) S.habits.push({ id: uid(), created: today(), ...rec }); else Object.assign(h, rec);
      save(); closeSheet(); render(); toast(isNew ? 'Habit added' : 'Saved');
    };
    const del = $('f-del');
    if (del) del.onclick = () => {
      if (!confirm(`Remove “${h.name}”? Its history stays in your backup file but leaves the app.`)) return;
      h.archived = true; save(); closeSheet(); render();
    };
  });
}

function addSuggestion(i) {
  const s = SUGGEST[i];
  S.habits.push({ id: uid(), created: today(), ...s, days: [...s.days] });
  save(); render(); toast(`${s.name} added. Edit it under Habits.`);
}

// ---------- REVIEW ----------
// No typing: the app answers "what did I commit to" and "what did I miss twice" from the log.
// For each habit missed twice you get two taps: put the comeback in the calendar, or make the habit smaller.
function defaultWeek() {
  const t = today(); const thisSun = sundayOf(t);
  const lastSun = addDays(thisSun, -7);
  if (t !== thisSun && !S.reviews[lastSun] && active().some(h => h.created <= lastSun)) return lastSun;
  return thisSun;
}
function weekData(end) {
  const start = addDays(end, -6);
  return active().filter(h => h.created <= end).map(h => {
    const tl = timeline(h, end > today() ? today() : end);
    const wk = tl.filter(x => x.d >= start && x.d <= end);
    const c = { full: 0, small: 0, miss: 0, open: 0 };
    wk.forEach(x => c[x.s]++);
    let planned = 0;
    for (let k = start; k <= end; k = addDays(k, 1)) if (k >= h.created && h.days.includes(parse(k).getDay())) planned++;
    const twiceDays = [];
    tl.forEach((x, i) => { if (x.d >= start && x.s === 'miss' && i > 0 && tl[i - 1].s === 'miss') twiceDays.push(x.d); });
    return { h, c, planned, twiceDays };
  });
}
function comebackDay(h) {
  const t = today();
  return h.days.includes(parse(t).getDay()) && !(S.log[t] || {})[h.id] ? t : nextDay(h, t) || addDays(t, 1);
}

function renderReview() {
  if (!weekEnd) weekEnd = defaultWeek();
  const start = addDays(weekEnd, -6);
  const saved = S.reviews[weekEnd];
  $('wk-title').textContent = weekEnd === sundayOf(today()) ? 'This week' : weekEnd === addDays(sundayOf(today()), -7) ? 'Last week' : 'Weekly review';
  $('wk-range').textContent = `${nice(start)} – ${nice(weekEnd)}`;
  $('wk-next').disabled = weekEnd >= sundayOf(today());

  const data = weekData(weekEnd);
  $('rv-commit').innerHTML = data.length ? data.map(({ h, c, planned }) => `<div class="rv-row">${esc(h.emoji)} <span>${esc(h.name)}</span>
      <span class="n">${c.full ? `<span class="pill full">${c.full} done</span>` : ''}${c.small ? `<span class="pill small">${c.small} small</span>` : ''}${c.miss ? `<span class="pill miss">${c.miss} missed</span>` : ''} of ${planned} planned</span></div>`).join('')
    : `<p class="muted">No habits in this week.</p>`;

  const twice = data.filter(x => x.twiceDays.length);
  $('rv-twice').innerHTML = !data.length ? '' : twice.length
    ? `<h3>Missed twice</h3><p class="muted" style="margin:2px 0 6px">Plan the comeback, and keep it small.</p>` +
      twice.map(({ h, twiceDays }) => `<div class="tw"><div class="rv-row">${esc(h.emoji)} <span><b>${esc(h.name)}</b></span>
        <span class="n"><span class="pill miss">twice</span> ${twiceDays.map(nice).join(', ')}</span></div>
        <div class="actions"><button class="btn amber grow" data-cal="${h.id}">📅 Comeback ${nice(comebackDay(h))}: ${esc(h.small)}</button>
        <button class="btn ghost grow" data-shrink="${h.id}">Make it smaller</button></div></div>`).join('')
    : `<p class="good" style="font-size:17px">✓ Nothing missed twice. The rule held.</p>`;

  $('rv-saved').textContent = saved ? `Reviewed ${new Date(saved.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : '';
  $('rv-save').textContent = saved ? 'Reviewed ✓' : 'Done ✓';
  $('rv-save').disabled = !!saved;
}

function addToCalendar(h) {
  const d = comebackDay(h);
  const [Y, M, D] = d.split('-');
  const st = `${Y}${M}${D}T070000`, en = `${Y}${M}${D}T073000`;
  const title = `Comeback: ${h.name} (${h.small})`;
  const details = `Never skip it twice. Just the small version: ${h.small}.`;
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const e = s => s.replace(/[\\,;]/g, m => '\\' + m);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Never Twice//EN', 'BEGIN:VEVENT', `UID:${uid()}@nevertwice`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${st}`, `DTEND:${en}`,
      `SUMMARY:${e(title)}`, `DESCRIPTION:${e(details)}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY',
      `DESCRIPTION:${e(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    saveFile(new Blob([ics], { type: 'text/calendar' }), 'comeback.ics');
  } else {
    window.open('https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: title, details, dates: `${st}/${en}` }), '_blank', 'noopener');
  }
}
function shrink(h) {
  const v = prompt(`Smaller version of “${h.name}”`, h.small);
  if (v && v.trim()) { h.small = v.trim(); save(); renderReview(); toast('Smaller it is. Easier to come back.'); }
}
function saveReview() {
  const twiceList = weekData(weekEnd).filter(x => x.twiceDays.length).map(x => x.h.name);
  S.reviews[weekEnd] = { twiceList, at: Date.now() };
  save(); buzz([20, 40, 20]); toast('Week reviewed.'); renderReview();
}

// ---------- backup ----------
function saveFile(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function exportData() {
  saveFile(new Blob([JSON.stringify({ app: 'never-twice', person, version: APP_VERSION, data: S }, null, 2)], { type: 'application/json' }),
    `never-twice-${person}-${today()}.json`);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (j.app !== 'never-twice' || !j.data) throw 0;
      if (j.person && j.person !== person) return toast(`That backup belongs to ${PEOPLE.find(p => p.id === j.person)?.name || j.person}. Switch person first.`);
      if (!confirm('Replace what is on this phone with the backup?')) return;
      S = fresh(j.data); save(); render(); toast('Backup loaded');
    } catch { toast('That file is not a Never Twice backup'); }
  };
  r.readAsText(file);
}

// ---------- install ----------
const APP_URL = 'https://sagarchakraborty-creator.github.io/never-twice/';
let installEvt = null;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installHidden() { try { return localStorage.getItem('nevertwice.installHide') === '1'; } catch { return false; } }
function renderInstall() {
  $('install-card').innerHTML = isInstalled() || installHidden() ? '' : `<div class="card installcard">
    <img src="icons/icon-192.png" alt="" width="48" height="48">
    <div><b>Get Never Twice on your home screen</b><p class="muted">Opens full-screen like a normal app and works offline.</p></div>
    <div class="actions" style="flex-basis:100%"><button class="btn primary grow" data-install>⬇ Install app</button>
    <button class="btn link" data-install-hide>Not now</button></div></div>`;
  $('install-btn').hidden = isInstalled();
}
async function doInstall() {
  if (installEvt) { // Chrome / Edge: the browser's own one-tap install box
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    installEvt = null;
    if (outcome !== 'accepted') toast('Not installed. Tap Install again any time.');
    return;
  }
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua), android = /Android/i.test(ua), iosOther = ios && /CriOS|FxiOS|EdgiOS/i.test(ua);
  const steps = ios && iosOther ? ['Copy the link below and open it in <b>Safari</b>. iPhone can only install from Safari.', 'In Safari, tap <b>Share</b> ⬆ at the bottom.', 'Tap <b>Add to Home Screen</b>, then <b>Add</b>.']
    : ios ? ['Tap <b>Share</b> ⬆ at the bottom of Safari.', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. Open Never Twice from your home screen.']
    : android ? ['Tap the <b>⋮</b> menu at the top right of Chrome.', 'Tap <b>Install app</b> (or <b>Add to Home screen</b>).', 'Tap <b>Install</b>. Open Never Twice from your home screen.']
    : ['On your phone, open the link below (or scan the QR code on the download page).', 'Android: Chrome ⋮ → <b>Install app</b>. iPhone: Safari Share → <b>Add to Home Screen</b>.'];
  openSheet(`<h2>Install Never Twice</h2><ol class="isteps">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <div class="stack"><button class="btn ghost" id="copy-link">Copy link</button><button class="btn link" id="close-sheet">Close</button></div>`, el => {
    $('copy-link').onclick = async () => { try { await navigator.clipboard.writeText(APP_URL); toast('Link copied'); } catch { toast(APP_URL); } };
    $('close-sheet').onclick = closeSheet;
  });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; renderInstall(); toast('Installed. Open Never Twice from your home screen.'); });

// ---------- shell ----------
function render() {
  renderInstall();
  const p = PEOPLE.find(x => x.id === person);
  $('person-btn').textContent = `${p.name} ▾`;
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== `view-${view}`);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'today') renderToday();
  if (view === 'review') renderReview();
  if (view === 'habits') renderHabits();
}
function go(v) { view = v; if (v === 'review') weekEnd = null; render(); scrollTo(0, 0); }

let sheetOpen = false;
function openSheet(html, bind) {
  const el = $('sheet'); el.innerHTML = html; el.hidden = false; $('sheet-bg').hidden = false; sheetOpen = true;
  bind && bind(el);
}
function closeSheet() { $('sheet').hidden = true; $('sheet-bg').hidden = true; sheetOpen = false; }
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-habit], [data-go]'); if (!b) return;
  if (b.dataset.install !== undefined) return doInstall();
  if (b.dataset.installHide !== undefined) { try { localStorage.setItem('nevertwice.installHide', '1'); } catch {} return renderInstall(); }
  if (b.dataset.cal) return addToCalendar(S.habits.find(h => h.id === b.dataset.cal));
  if (b.dataset.shrink) return shrink(S.habits.find(h => h.id === b.dataset.shrink));
  if (b.dataset.view) return go(b.dataset.view);
  if (b.dataset.go) return go(b.dataset.go);
  if (b.dataset.log !== undefined) return setLog(b.dataset.log, today(), b.dataset.s);
  if (b.dataset.edit) return editDay(b.dataset.edit, b.dataset.day);
  if (b.dataset.sug !== undefined) return addSuggestion(+b.dataset.sug);
  if (b.dataset.add !== undefined) return editHabit(null);
  if (b.dataset.habit) return editHabit(S.habits.find(h => h.id === b.dataset.habit));
});
$('sheet-bg').onclick = closeSheet;
$('add-habit').onclick = () => editHabit(null);
$('person-btn').onclick = () => openSheet(`<h2>Who is using the app?</h2><div class="stack">${PEOPLE.map(p =>
  `<button class="btn ${p.id === person ? 'primary' : 'ghost'}" data-p="${p.id}">${p.name}</button>`).join('')}</div>
  <p class="muted" style="margin-top:12px">Each person has their own habits and reviews on this phone.</p>`, el => {
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    person = b.dataset.p; S = fresh(load(keyFor(person))); save(); closeSheet(); weekEnd = null; render();
  });
});
$('wk-prev').onclick = () => { weekEnd = addDays(weekEnd, -7); renderReview(); };
$('wk-next').onclick = () => { weekEnd = addDays(weekEnd, 7); renderReview(); };
$('rv-save').onclick = saveReview;
$('export').onclick = exportData;
$('import').onchange = e => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; };

// Re-render when the app comes back to the front (the day may have changed).
let lastDay = today();
document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); render(); } });

const startView = location.hash.slice(1);
if (['today', 'review', 'habits'].includes(startView)) view = startView;
render();

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'activated' && navigator.serviceWorker.controller && !sheetOpen) location.reload();
        });
      });
    }).catch(() => {});
  });
}
