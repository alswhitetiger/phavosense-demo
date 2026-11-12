'use strict';
/* PhavoSense 데모 — 서버 없이 브라우저(localStorage)만으로 기획안의 흐름을 재현한다.
   shortcut: 승인·로그인·열람 제한이 전부 브라우저 안에서 돌아가 개발자 도구로 우회 가능, 실서비스는 서버(API·DB·메일)에서 검사해야 한다. */

const $ = (s, el = document) => el.querySelector(s);
const KEY = 'phavosense-demo-v1';
const DAY = 864e5, IDLE_MS = 30 * 60e3, OTP_MS = 10 * 60e3, OTP_RESEND = 5, OTP_TRIES = 5, PER_PAGE = 10;
const GROUPS = ['gov', 'biz', 'farm'];
const COUNTRIES = ['KR', 'AE', 'SA', 'JO', 'US', 'OTHER'];
const COMPANY_MAIL = 'contact@knsuncles.com'; // shortcut: 데이터 요청 수신 주소 미정, 확정되면 교체
const FREE_MAIL = /@(gmail|naver|daum|hanmail|kakao|hotmail|outlook|yahoo|icloud|nate)\./i;
const TEAM = [['Daeyoung (Don) Kim', 'Managing Director'], ['Junghwa (John) Song', 'Managing Director'], ['Kyuhong (Kevin) Lee', 'Chief Brand Manager'], ['Dr. Ayman Turk', 'CTO']];
const TITLES = { company: 'nav.company', signup: 'signup.title', login: 'login.title', data: 'data.title', admin: 'admin.title', privacy: 'footer.privacy', terms: 'footer.terms' };

/* ---------- 작은 도구 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kstISO = ts => new Date(ts + 9 * 36e5).toISOString();
const ymd = ts => kstISO(ts).slice(0, 10);
const kst = ts => kstISO(ts).slice(0, 16).replace('T', ' ') + ' KST';
const code6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const cv = a => { const m = mean(a); return a.length < 2 || !m ? null : Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) / m * 100; };
const groupBy = (rs, k) => rs.reduce((o, r) => ((o[r[k]] ||= []).push(r), o), {});
const f2 = v => v == null ? '–' : v.toFixed(2);
const pct = v => v == null ? '–' : v.toFixed(1) + '%';
const passRate = rs => rs.length ? rs.filter(r => r.cordycepin >= PASS_CORDY).length / rs.length * 100 : null;
const monthRange = (from, to) => { // 'YYYY-MM' 두 달 사이 모든 달 — 데이터가 빈 달도 축에 남긴다
  const out = []; let [y, m] = from.split('-').map(Number);
  while (out.length < 600) { const s = `${y}-${String(m).padStart(2, '0')}`; out.push(s); if (s >= to) break; if (++m > 12) { m = 1; y++; } }
  return out;
};
const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;

/* ---------- 저장소 (데모 백엔드) ---------- */
function seed() {
  const now = Date.now();
  const base = { country: 'KR', phone: '010-0000-0000', createdAt: now - 40 * DAY };
  const ok = { status: 'approved', approvedAt: now - 30 * DAY, expiresAt: now + 335 * DAY };
  return {
    v: 1,
    users: [
      { ...base, email: 'admin@phavosense.demo', name: 'Admin', role: 'admin', status: 'approved' },
      { ...base, ...ok, email: 'gov@demo.go.kr', name: '김공공', org: '경상북도 농업기술원', type: 'gov', group: 'gov', dept: '품질관리과 · 연구사', purpose: '도내 동충하초 품질 현황 파악과 지원 정책 근거 마련' },
      { ...base, ...ok, email: 'farm@demo.kr', name: '박농부', org: '햇살농원', type: 'farm', group: 'farm', farm: 'F07', dept: '대표', purpose: '우리 농가 배치 품질 확인' },
      { ...base, email: 'buyer@demo.com', name: 'Lee Buyer', org: 'Demo Bio Co.', type: 'biz', group: 'biz', country: 'AE', dept: 'Sourcing · Manager', purpose: 'Supplier comparison for cordyceps sourcing', status: 'pending', createdAt: now - DAY },
    ],
    requests: [], logs: [], mails: [], records: null, cookie: null, session: null, otp: null,
    settings: {
      baseDate: BASE_DATE_DEFAULT, text: {},
      preview: { tests: true, speed: true, chart: true },
      datasets: Object.fromEntries(DATASETS.map(d => [d.id, { published: true, groups: [...d.groups] }])),
    },
  };
}
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d?.v === 1) return d; } catch { /* 깨진 저장값은 새로 시작 */ } return seed(); }
let db = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { toast(t('common.saveFail')); return false; } }
const records = () => db.records || SAMPLE;
const baseDate = () => db.settings.baseDate;
const mail = (to, subj, body) => db.mails.unshift({ at: Date.now(), to, subj, body });
function log(action, target = '') {
  db.logs.unshift({ at: Date.now(), email: db.session?.email || '-', action, target });
  if (db.logs.length > 1000) db.logs.length = 1000;
}

/* ---------- 다국어 ---------- */
let lang = 'ko', page = ''; // 빈 값에서 시작해야 첫 화면도 '새 페이지 진입'으로 본다
function t(k, vars) {
  const s = db.settings.text[lang]?.[k] || LANG[lang]?.[k] || LANG.en[k] || LANG.ko[k] || k;
  return vars ? s.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '') : s;
}
const T = (k, v) => esc(t(k, v));
const rt = (k, v) => T(k, v).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const regionName = id => { const r = REGIONS.find(x => x.id === id); return r ? r[lang] || r.en : id; };
const href = p => `#/${lang}/${p}`;
const go = p => { const h = href(p); if (location.hash === h) route(true); else location.hash = h; };
function detectLang() {
  for (const l of navigator.languages || [navigator.language]) { const c = (l || '').slice(0, 2); if (LANG[c]) return c; }
  return 'en';
}

/* ---------- 회원 상태 ---------- */
const me = () => db.session && db.users.find(u => u.email === db.session.email);
function access(u) {
  if (!u) return 'none';
  if (u.role === 'admin') return 'ok';
  if (u.status === 'approved') return u.expiresAt < Date.now() ? 'expired' : 'ok';
  return u.status; // pending | rejected | suspended
}
const groupOf = u => u.role === 'admin' ? 'admin' : u.group;
const visibleDatasets = u => DATASETS.filter(d => {
  const s = db.settings.datasets[d.id];
  return s?.published && (groupOf(u) === 'admin' || s.groups.includes(groupOf(u)));
});

// 마지막 사용 시각은 별도 키에 둔다: 30초마다 본 데이터를 다시 쓰면 다른 탭의 변경을 덮어쓴다
const LAST_KEY = KEY + '-last';
let lastActive = 0;
['pointerdown', 'pointermove', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
function checkIdle() { // true = 방금 자동 로그아웃됨
  if (!db.session) return false;
  const last = Math.max(lastActive, Number(localStorage.getItem(LAST_KEY)) || 0); // 다른 탭의 사용도 사용으로 본다
  if (Date.now() - last > IDLE_MS) { log('auto'); db.session = null; save(); toast(t('data.idle')); return true; }
  localStorage.setItem(LAST_KEY, String(last)); return false;
}
setInterval(() => { if (checkIdle()) { route(); toast(t('data.idle')); } }, 30e3); // route의 '로그인해 주세요' 안내가 자동 로그아웃 안내를 덮지 않게

/* ---------- 공통 UI ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}
function openDialog(html) {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog" class="dlg-x"><button class="icon-btn" aria-label="${T('common.close')}">×</button></form>${html}`;
  d.showModal();
  d.querySelector('input:not([type=hidden]), textarea')?.focus();
}
const label = (a, b = '') => `<div class="sec-label"><span>${a}</span><span>${b}</span></div>`;
const empty = () => `<p class="empty">${T('common.empty')}</p>`;
function field(name, key, o = {}) {
  const id = 'f-' + name;
  const a = `id="${id}" name="${name}"${o.req ? ' required' : ''}${o.hint ? ` aria-describedby="${id}-h"` : ''} ${o.attrs || ''}`;
  const ctl = o.textarea ? `<textarea ${a} rows="4"></textarea>` : o.options ? `<select ${a}>${o.options}</select>` : `<input type="${o.type || 'text'}" ${a}>`;
  return `<div class="field"><label for="${id}"${o.req ? ' class="req"' : ''}>${T(key)}</label>${ctl}${o.hint ? `<small class="hint" id="${id}-h">${T(o.hint)}</small>` : ''}</div>`;
}

/* ---------- 차트 (SVG/CSS, 외부 라이브러리 없음) ---------- */
function bars(items, fmt = f2, max) {
  if (!items.length) return empty();
  max = max || Math.max(...items.map(i => i.v ?? 0)) || 1;
  return `<div class="bars">${items.map((i, n) => `<div class="bar"><span class="bar-k">${esc(i.k)}</span><span class="bar-t"><i style="transform:scaleX(${Math.min(1, (i.v ?? 0) / max).toFixed(3)});animation-delay:${n * 40}ms"></i></span><span class="bar-v num">${fmt(i.v)}</span></div>`).join('')}</div>`;
}
function lineChart(labels, series, fmt = f2) {
  const vals = series.flatMap(s => s.vals).filter(v => v != null);
  if (!vals.length) return empty();
  const W = 560, H = 210, L = 46, R = 14, TP = 14, B = 28;
  const vMin = Math.min(...vals), vMax = Math.max(...vals), pad = (vMax - vMin) * .15 || Math.abs(vMax) * .1 || 1;
  const lo = Math.max(vMin >= 0 ? 0 : -Infinity, vMin - pad), hi = vMax + pad;
  const x = i => L + i * (W - L - R) / Math.max(1, labels.length - 1);
  const y = v => TP + (hi - v) / (hi - lo) * (H - TP - B);
  const step = Math.ceil(labels.length / 6);
  const grid = [0, 1, 2, 3].map(i => lo + (hi - lo) * i / 3).map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 8}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`).join('');
  const xl = labels.map((l, i) => i % step ? '' : `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`).join('');
  const lines = series.map((s, si) => {
    const pts = s.vals.map((v, i) => v == null ? null : [x(i).toFixed(1), y(v).toFixed(1), v, labels[i]]).filter(Boolean);
    return `<polyline class="s${si}"${si ? '' : ' pathLength="1"'} points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>`
      + pts.map(p => `<g class="pt"><circle class="hit" cx="${p[0]}" cy="${p[1]}" r="10"/><circle class="dot d${si}" cx="${p[0]}" cy="${p[1]}" r="3"/><title>${esc(s.name)} · ${esc(p[3])} · ${fmt(p[2])}</title></g>`).join('');
  }).join('');
  const aria = series.map(s => { const v = s.vals.filter(n => n != null); return `${s.name}: ${fmt(v[0])} → ${fmt(v.at(-1))} (${labels[0]}–${labels.at(-1)})`; }).join('; ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}"><g class="grid">${grid}</g>${xl}${lines}</svg>`;
}

/* TLC 플레이트 — 기술의 원리(성분이 원점에서 올라가 분리됨)를 그대로 보여 주는 히어로 그래픽 */
const TLC = (() => {
  const O = 318, F = 58, H = O - F;
  const lanes = [[64, [.78, .42]], [108, [.78, .55, .3]], [152, [.78, .42, .18]], [196, [.66, .42]]];
  const spots = lanes.flatMap(([x, rfs], li) => rfs.map((rf, si) => {
    const y = O - rf * H;
    return `<ellipse class="spot${li ? '' : ' std'}" cx="${x}" cy="${y.toFixed(1)}" rx="${9 - si * 1.5}" ry="${4.6 - si * .7}" style="--dist:${(O - y).toFixed(1)}px;animation-delay:${400 + li * 140 + si * 90}ms"/>`;
  })).join('');
  return `<figure class="tlc" aria-hidden="true"><svg viewBox="0 0 240 380"><rect class="plate" x="24" y="14" width="192" height="340" rx="3"/>
    <line class="front" x1="24" x2="216" y1="${F}" y2="${F}"/><line class="origin" x1="24" x2="216" y1="${O}" y2="${O}"/>
    <text x="32" y="${F - 9}">SOLVENT FRONT</text><text x="32" y="${O + 18}">ORIGIN</text>
    ${lanes.map(([x], i) => `<line class="lane" x1="${x}" x2="${x}" y1="${F + 8}" y2="${O}"/><text x="${x}" y="${O + 36}" text-anchor="middle">${['STD', 'A', 'B', 'C'][i]}</text>`).join('')}
    ${spots}</svg><figcaption>TLC PLATE · 15 MIN · Rf 0–1</figcaption></figure>`;
})();

/* ---------- 레이아웃 ---------- */
function renderHeader() {
  const u = me();
  const nav = [['', 'nav.home'], ['data', 'nav.data'], ['company', 'nav.company']].concat(u?.role === 'admin' ? [['admin', 'nav.admin']] : []);
  const cur = page === 'home' ? '' : page;
  $('#header').innerHTML = `
    <a class="brand" href="${href('')}"><span class="brand-mark">PhavoSense</span><span class="brand-by">${T('brand.by')}</span></a>
    <nav class="nav" aria-label="${T('nav.home')}">${nav.map(([p, k]) => `<a href="${href(p)}"${p === cur ? ' aria-current="page"' : ''}>${T(k)}</a>`).join('')}</nav>
    <div class="hdr-right">
      <div class="langs" role="group" aria-label="${T('footer.lang')}">${['ko', 'en', 'ar'].map(l => `<a href="#/${l}/${cur}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('')}</div>
      ${u ? `<span class="who">${esc(u.email)}</span><button type="button" class="link" data-act="logout">${T('nav.logout')}</button>`
          : `<a class="link" href="${href('login')}">${T('nav.login')}</a><a class="btn btn-sm" href="${href('signup')}">${T('nav.signup')}</a>`}
    </div>`;
  $('#skip').textContent = t('nav.skip');
}
function renderFooter() {
  $('#footer').innerHTML = `
    <div class="ft-top"><p class="ft-brand">PhavoSense</p><p class="ft-tag">${rt('footer.tag')}</p></div>
    <div class="ft-row">
      <nav class="ft-links" aria-label="${T('footer.terms')}"><a href="${href('privacy')}">${T('footer.privacy')}</a><a href="${href('terms')}">${T('footer.terms')}</a><button type="button" class="link" data-act="cookie">${T('cookie.settings')}</button></nav>
      <div class="field ft-lang"><label for="ft-lang">${T('footer.lang')}</label><select id="ft-lang" data-change="lang">${opt('ko', '한국어', lang)}${opt('en', 'English', lang)}${opt('ar', 'العربية', lang)}</select></div>
    </div>
    <div class="ft-row ft-small"><span>© 2026 KNS Uncles Inc.</span><span>${T('footer.contact')} · <span class="num">${COMPANY_MAIL}</span></span><span class="demo-flag">${T('common.demo')}</span></div>`;
}
function renderCookie(force) {
  const c = $('#cookie');
  if (db.cookie && !force) { c.hidden = true; return; }
  c.hidden = false;
  c.innerHTML = `<p>${T('cookie.text')} <a href="${href('privacy')}">${T('footer.privacy')}</a></p>
    <div class="cta-row"><button type="button" class="btn btn-ghost btn-sm" data-act="cookie-essential">${T('cookie.essential')}</button><button type="button" class="btn btn-ghost btn-sm" data-act="cookie-all">${T('cookie.all')}</button></div>`;
}
function renderWM() { // 스크린샷은 못 막으므로 유출 추적용 워터마크
  const el = $('#wm'), u = me();
  if (page !== 'data' || !u) { el.hidden = true; return; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="210"><text x="190" y="105" text-anchor="middle" transform="rotate(-22 190 105)" font-family="monospace" font-size="13" fill="#8F8B82" fill-opacity=".2">${esc(u.email)} · ${kst(Date.now())}</text></svg>`;
  el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  el.hidden = false;
}

/* ---------- 페이지: 홈 ---------- */
function pageHome(app) {
  const recs = records(), pv = db.settings.preview;
  const counts = recs.reduce((o, r) => { const m = r.date.slice(0, 7); o[m] = (o[m] || 0) + 1; return o; }, {});
  const ms = Object.keys(counts).sort(), byMonth = monthRange(ms[0], ms.at(-1)).map(m => [m, counts[m] || 0]);
  const preview = [
    pv.tests && `<div class="kpi"><span class="kpi-k">${T('home.open.tests')}</span><span class="kpi-v num">${recs.length.toLocaleString('en')}</span></div>`,
    pv.speed && `<div class="kpi"><span class="kpi-k">${T('home.open.speed')}</span><span class="kpi-v num">15<small>${T('home.open.min')}</small></span></div>`,
    pv.chart && `<figure class="kpi kpi-wide"><figcaption class="kpi-k">${T('home.open.chart')}</figcaption>${lineChart(byMonth.map(([m]) => m.slice(2)), [{ name: t('home.open.chart'), vals: byMonth.map(([, n]) => n) }], v => Math.round(v).toString())}</figure>`,
  ].filter(Boolean);
  app.innerHTML = `
  <section class="hero">
    <div class="hero-grid">
      <div><p class="eyebrow reveal">${T('home.eyebrow')}</p><h1 class="display reveal" style="--i:1">${rt('home.h1')}</h1></div>
      ${TLC}
    </div>
    <div class="hero-foot">
      <p class="hero-lead reveal" style="--i:2">${rt('home.lead')}</p>
      <p class="hero-side reveal" style="--i:3">${T('home.side')}</p>
      <div class="cta-row reveal" style="--i:4"><a class="btn" href="${href('signup')}">${T('home.ctaSignup')}</a><a class="btn btn-ghost" href="${href('login')}">${T('home.ctaLogin')}</a></div>
    </div>
  </section>
  <div class="strip" aria-hidden="true"><span>SAMPLE / TLC PLATE / AI READING / REFINED DATA</span><span>KO · EN · AR</span></div>
  <section class="section theme-light">
    ${label(T('home.how.label'), T('home.how.sub'))}
    <h2 class="h2">${rt('home.how.title')}</h2>
    <ol class="steps">${[1, 2, 3].map(i => `<li class="step"><span class="step-n num">0${i}</span><h3>${T(`home.how.s${i}t`)}</h3><p>${T(`home.how.s${i}d`)}</p></li>`).join('')}</ol>
  </section>
  <section class="section">
    ${label(T('home.who.label'), T('home.who.sub'))}
    <h2 class="h2">${rt('home.who.title')}</h2>
    <div class="cards">${GROUPS.map((g, i) => `<article class="card"><span class="card-n num">00${i + 1}</span><h3>${T('type.' + g)}</h3>
      <dl><dt>${T('home.who.data')}</dt><dd>${T(`home.who.${g}Data`)}</dd><dt>${T('home.who.ins')}</dt><dd>${T(`home.who.${g}Ins`)}</dd></dl></article>`).join('')}</div>
  </section>
  <section class="section theme-tan">
    ${label(T('home.open.label'), T('home.open.sub'))}
    <div class="two"><h2 class="h2">${rt('home.open.title')}</h2><p class="muted">${T('home.open.note')}</p></div>
    <div class="preview">${preview.length ? preview.join('') : `<p class="empty">${T('home.open.none')}</p>`}</div>
    <p class="base">${T('common.baseDate')} <span class="num">${esc(baseDate())} KST</span></p>
  </section>
  <section class="section cta-band">
    <h2 class="h2">${rt('home.cta.title')}</h2>
    <div><p class="muted">${T('home.cta.desc')}</p>
    <div class="cta-row"><a class="btn" href="${href('signup')}">${T('home.ctaSignup')}</a><a class="btn btn-ghost" href="${href('company')}?inquiry">${T('home.cta.inquiry')}</a></div></div>
  </section>`;
}

/* ---------- 페이지: 회사 ---------- */
function pageCompany(app) {
  const initials = n => n.replace(/^Dr\. /, '').split(' ').filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join('').slice(0, 2);
  app.innerHTML = `
  <section class="hero hero-sm">${label(T('company.label'), T('company.sub'))}<h1 class="display">${rt('company.title')}</h1></section>
  <section class="section split"><h2 class="eyebrow">${T('company.missionLabel')}</h2><p class="lede">${T('company.mission')}</p></section>
  <section class="section theme-light">
    ${label(T('company.historyLabel'), 'HISTORY')}
    <ol class="timeline">${t('company.timeline').split('\n').map(l => { const [y, x] = l.split('|'); return `<li><span class="num">${esc(y)}</span><p>${esc(x)}</p></li>`; }).join('')}</ol>
    ${label(T('company.teamLabel'), 'TEAM')}
    <ul class="team">${TEAM.map(([n, r]) => `<li><span class="avatar num" aria-hidden="true">${initials(n)}</span><b>${esc(n)}</b><span>${esc(r)}</span></li>`).join('')}</ul>
    <p class="hint">${T('company.sample')}</p>
  </section>
  <section class="section" id="inquiry">
    ${label(T('company.inqTitle'), 'CONTACT')}
    <div class="two"><div><h2 class="h2">${T('company.inqTitle')}</h2><p class="muted">${T('company.inqDesc')}</p></div>
    <form class="form" data-form="inquiry">
      <div class="row2">${field('name', 'form.name', { req: 1, attrs: 'autocomplete="name" maxlength="60"' })}${field('org', 'form.org', { req: 1, attrs: 'autocomplete="organization" maxlength="100"' })}</div>
      <div class="row2">${field('email', 'form.email', { req: 1, type: 'email', attrs: 'autocomplete="email" maxlength="120"' })}${field('phone', 'form.phone', { type: 'tel', attrs: 'autocomplete="tel" maxlength="30"' })}</div>
      ${field('message', 'form.message', { req: 1, textarea: 1, attrs: 'maxlength="1000"' })}
      <label class="check"><input type="checkbox" name="agree" required> <span>${T('form.agree')}</span></label>
      <button class="btn">${T('form.send')}</button>
    </form></div>
  </section>`;
}

/* ---------- 페이지: 가입 신청 ---------- */
let signupDone = false;
function pageSignup(app) {
  const body = signupDone
    ? `<div class="done" role="status" tabindex="-1"><h2 class="h3">${T('signup.doneTitle')}</h2><p>${T('signup.doneDesc')}</p><p class="steps-line num">${T('signup.steps')}</p><a class="btn btn-ghost" href="${href('')}">${T('nav.home')}</a></div>`
    : `<form class="form" data-form="signup" data-change="freemail">
      <p class="notice err" id="signup-err" role="alert" tabindex="-1" hidden></p>
      <div class="row2">${field('name', 'form.name', { req: 1, attrs: 'autocomplete="name" maxlength="60"' })}${field('phone', 'form.phone', { req: 1, type: 'tel', attrs: 'autocomplete="tel" maxlength="30"' })}</div>
      ${field('email', 'form.email', { req: 1, type: 'email', hint: 'form.emailHint', attrs: 'autocomplete="email" maxlength="120"' })}
      <p class="notice" id="free-warn" hidden>${T('form.freeMail')}</p>
      ${field('org', 'form.org', { req: 1, attrs: 'autocomplete="organization" maxlength="100"' })}
      <fieldset class="field"><legend class="req">${T('form.type')}</legend><div class="radios">${GROUPS.map((g, i) => `<label><input type="radio" name="type" value="${g}" required${i ? '' : ' checked'}> ${T('type.' + g)}</label>`).join('')}</div></fieldset>
      <div class="row2">${field('country', 'form.country', { req: 1, options: COUNTRIES.map(c => opt(c, T('country.' + c), 'KR')).join('') })}${field('dept', 'form.dept', { attrs: 'autocomplete="organization-title" maxlength="80"' })}</div>
      ${field('purpose', 'form.purpose', { req: 1, textarea: 1, hint: 'form.purposeHint', attrs: 'maxlength="300"' })}
      <label class="check"><input type="checkbox" name="agree" required> <span>${T('form.agree')} <a href="${href('terms')}" target="_blank" rel="noopener">${T('footer.terms')}</a> · <a href="${href('privacy')}" target="_blank" rel="noopener">${T('footer.privacy')}</a></span></label>
      <button class="btn">${T('signup.submit')}</button>
    </form>`;
  app.innerHTML = `<section class="auth">
    <div class="auth-side">${label(T('signup.label'), T('signup.sub'))}<h1 class="h2">${T('signup.title')}</h1><p class="muted">${T('signup.desc')}</p><p class="steps-line num">${T('signup.steps')}</p></div>
    <div class="auth-main">${body}</div></section>`;
}

/* ---------- 페이지: 로그인 (이메일 인증번호) ---------- */
let L = { step: 'email', email: '', msg: '' };
const DEMO_ACCTS = [['gov@demo.go.kr', 'login.acctGov'], ['farm@demo.kr', 'login.acctFarm'], ['buyer@demo.com', 'login.acctBiz'], ['admin@phavosense.demo', 'login.acctAdmin']];
function statusMsg(u) {
  const s = access(u);
  if (s === 'none') return `${T('login.noUser')} <a href="${href('signup')}">${T('nav.signup')}</a>`;
  if (s === 'rejected') return `${T('login.rejected', { r: u.reason || '-' })} <a href="${href('signup')}">${T('login.reapply')}</a>`;
  return T({ pending: 'login.pending', suspended: 'login.suspended', expired: 'login.expiredAcc' }[s] || 'login.noUser');
}
function pageLogin(app) {
  const o = db.otp;
  if (L.step !== 'email' && !o) L = { step: 'email', email: L.email, msg: '' };
  const msg = L.msg ? `<p class="notice err" role="alert">${L.msg}</p>` : '';
  const codeField = field('code', 'login.code', { req: 1, attrs: 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"' });
  const body = L.step === 'email'
    ? `<form class="form" data-form="otp-send">${field('email', 'form.email', { req: 1, type: 'email', attrs: `autocomplete="email" value="${esc(L.email)}"` })}${msg}<button class="btn">${T('login.send')}</button></form>`
    : L.step === 'code'
    ? `<form class="form" data-form="otp-verify"><p class="notice">${T('login.sent', { email: o.email })}</p>${codeField}${msg}<button class="btn">${T('login.verify')}</button>
        <div class="row-links"><button type="button" class="link" data-act="otp-resend">${T('login.resend')}</button><span class="hint">${T('login.left', { n: OTP_RESEND - o.resends })}</span><button type="button" class="link" data-act="otp-reset">${T('login.change')}</button></div></form>`
    : `<form class="form" data-form="otp-2fa"><h2 class="h3">${T('login.twofa')}</h2><p class="hint">${T('login.twofaDesc')}</p>${codeField}${msg}<button class="btn">${T('login.verify')}</button>
        <div class="row-links"><button type="button" class="link" data-act="otp-reset">${T('login.change')}</button></div></form>`;
  const demo = o && L.step !== 'email' ? `<aside class="demo-box"><b>${T('login.demoMail')}</b> <span class="num">${L.step === '2fa' ? T('login.demoTotp', { c: o.totp }) : T('login.demoCode', { c: o.code })}</span></aside>` : '';
  app.innerHTML = `<section class="auth">
    <div class="auth-side">${label(T('login.label'), T('login.sub'))}<h1 class="h2">${T('login.title')}</h1><p class="muted">${T('login.desc')}</p>
      <div class="demo-accts"><p class="eyebrow">${T('login.demoAccts')}</p>${DEMO_ACCTS.map(([e, k]) => `<button type="button" class="acct" data-act="demo-fill" data-email="${e}"><span class="num">${e}</span><span>${T(k)}</span></button>`).join('')}</div></div>
    <div class="auth-main">${body}${demo}</div></section>`;
}
function issueOtp(email, resends) {
  db.otp = { email, code: code6(), exp: Date.now() + OTP_MS, resends, tries: 0 };
  mail(email, t('mail.otp'), t('mail.otpBody', { c: db.otp.code }));
}
function wrongCode(o) {
  o.tries++;
  if (o.tries >= OTP_TRIES) { db.otp = null; L = { step: 'email', email: o.email, msg: T('login.locked') }; }
  else L.msg = T('login.wrong', { n: OTP_TRIES - o.tries });
  save(); paint(); $('#f-code, #f-email')?.focus();
}
function signIn(email) {
  db.otp = null; db.session = { email, at: Date.now() }; lastActive = Date.now(); localStorage.setItem(LAST_KEY, String(lastActive));
  log('login'); save(); L = { step: 'email', email: '', msg: '' };
  go(me().role === 'admin' ? 'admin' : 'data');
}

/* ---------- 페이지: 파보센스 데이터 (승인 회원) ---------- */
let F = { period: '12', item: 'cordycepin', region: 'all', pg: 0 };
function pageData(app) {
  const u = me(), group = groupOf(u), all = records(), vis = visibleDatasets(u);
  const dm = [...new Set(all.map(r => r.date.slice(0, 7)))].sort();
  const months = monthRange(dm[0], dm.at(-1)); // '최근 N개월' = 달력 기준 N개월
  const keep = F.period === 'all' ? months : months.slice(-Number(F.period)), kset = new Set(keep);
  const rs = all.filter(r => kset.has(r.date.slice(0, 7)) && (F.region === 'all' || r.region === F.region));
  const own = u.farm ? rs.filter(r => r.farm === u.farm) : [];
  const rows = group === 'farm' ? own : rs; // 농가는 자기 배치만 표·지표로 본다
  const val = r => r[F.item], item = t('item.' + F.item);
  const monthly = list => keep.map(m => mean(list.filter(r => r.date.startsWith(m)).map(val)));
  const byKey = (k, fn) => Object.entries(groupBy(rs, k)).map(([key, l]) => ({ k: k === 'region' ? regionName(key) : key, v: fn(l) }));
  const charts = {
    trend: () => lineChart(keep.map(m => m.slice(2)), [{ name: item, vals: monthly(rs) }]),
    region: () => bars(byKey('region', l => mean(l.map(val))).sort((a, b) => b.v - a.v)),
    pass: () => bars(byKey('region', passRate).sort((a, b) => b.v - a.v), pct, 100),
    supplier: () => bars(byKey('supplier', l => mean(l.map(val))).sort((a, b) => a.k.localeCompare(b.k))),
    variance: () => bars(byKey('supplier', l => cv(l.map(val))).sort((a, b) => a.k.localeCompare(b.k)), pct),
    myfarm: () => u.farm
      ? `<p class="legend"><span><i class="sw"></i>${T('legend.mine')} (${esc(u.farm)})</span><span><i class="sw dash"></i>${T('legend.avg')}</span></p>${lineChart(keep.map(m => m.slice(2)), [{ name: t('legend.mine'), vals: monthly(own) }, { name: t('legend.avg'), vals: monthly(rs) }])}`
      : `<p class="empty">${T('ds.noFarm')}</p>`,
  };
  const card = d => `<article class="ds"><header><h2 class="ds-t">${T('ds.' + d.id)}</h2><p class="ds-d">${T('ds.' + d.id + 'D', { item })}</p></header>${charts[d.id]()}<footer class="ds-f">${T('common.baseDate')} <span class="num">${esc(baseDate())}</span></footer></article>`;
  const kpi = (k, v) => `<div class="kpi"><span class="kpi-k">${T(k)}</span><span class="kpi-v num">${v}</span></div>`;
  const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  F.pg = Math.min(Math.max(F.pg, 0), pages - 1);
  const table = `<section class="ds-table" aria-labelledby="tbl-t"><header class="tbl-head"><h2 class="ds-t" id="tbl-t">${T('ds.batches')}</h2><p class="ds-d">${T('data.rows', { n: sorted.length, p: PER_PAGE })} · ${T('ds.batchesD')} · ${T('common.baseDate')} <span class="num">${esc(baseDate())}</span></p></header>
    <div class="tbl-wrap"><table><thead><tr>${['col.date', 'col.region', 'col.supplier', 'col.batch', 'item.cordycepin', 'item.adenosine', 'col.result'].map(k => `<th scope="col">${T(k)}</th>`).join('')}</tr></thead><tbody>
    ${sorted.slice(F.pg * PER_PAGE, (F.pg + 1) * PER_PAGE).map(r => `<tr><td class="num">${esc(r.date)}</td><td>${esc(regionName(r.region))}</td><td class="num">${esc(r.supplier)}</td><td class="num">${esc(r.batch)}</td><td class="num">${f2(r.cordycepin)}</td><td class="num">${f2(r.adenosine)}</td><td>${r.cordycepin >= PASS_CORDY ? `<span class="tag ok">● ${T('res.pass')}</span>` : `<span class="tag no">○ ${T('res.fail')}</span>`}</td></tr>`).join('') || `<tr><td colspan="7">${T('common.empty')}</td></tr>`}
    </tbody></table></div>
    <nav class="pager" aria-label="${T('data.page', { a: F.pg + 1, b: pages })}"><button type="button" class="btn btn-ghost btn-sm" data-act="pg" data-d="-1"${F.pg ? '' : ' disabled'}>${T('data.prev')}</button><span class="num">${T('data.page', { a: F.pg + 1, b: pages })}</span><button type="button" class="btn btn-ghost btn-sm" data-act="pg" data-d="1"${F.pg < pages - 1 ? '' : ' disabled'}>${T('data.next')}</button></nav></section>`;
  const sel = (name, key, options) => `<div class="field"><label for="flt-${name}">${T(key)}</label><select id="flt-${name}" name="${name}" data-change="filter">${options}</select></div>`;
  const grid = vis.filter(d => d.id !== 'batches');
  app.innerHTML = `
  <div class="data-bar">
    <p><span>${T('common.baseDate')}</span> <b class="num">${esc(baseDate())} KST</b><span class="sep">·</span><span>${T('data.group')}</span> <b>${T('type.' + group)}</b>${u.expiresAt ? `<span class="sep">·</span><span>${T('data.expires')}</span> <b class="num">${ymd(u.expiresAt)}</b>` : ''}</p>
    <div class="cta-row"><button type="button" class="btn btn-sm" data-act="req">${T('data.request')}</button><button type="button" class="btn btn-ghost btn-sm" data-act="inq">${T('data.inquiry')}</button></div>
  </div>
  <section class="section data protected">
    ${label(T('data.label'), T('data.sub'))}
    <h1 class="h2">${T('data.title')}</h1>
    <div class="filters">
      ${sel('period', 'data.period', [['6', 'data.p6'], ['12', 'data.p12'], ['all', 'data.pAll']].map(([v, k]) => opt(v, T(k), F.period)).join(''))}
      ${sel('item', 'data.item', ['cordycepin', 'adenosine'].map(v => opt(v, T('item.' + v), F.item)).join(''))}
      ${sel('region', 'data.region', opt('all', T('data.all'), F.region) + REGIONS.map(r => opt(r.id, esc(regionName(r.id)), F.region)).join(''))}
    </div>
    <div class="kpis">${kpi('data.kTests', rows.length.toLocaleString('en'))}${kpi('data.kMean', f2(mean(rows.map(val))))}${kpi('data.kPass', pct(passRate(rows)))}${kpi('data.kCv', pct(cv(rows.map(val))))}</div>
    <p class="hint">${T('data.rule', { v: PASS_CORDY.toFixed(2) })} · ${esc(item)}</p>
    ${vis.length ? '' : `<p class="empty">${T('data.noDs')}</p>`}
    ${grid.length ? `<div class="ds-grid">${grid.map(card).join('')}</div>` : ''}
    ${vis.some(d => d.id === 'batches') ? table : ''}
    <p class="nodl">${T('data.noDl')}</p>
    ${u.role === 'admin' ? '' : `<button type="button" class="link danger" data-act="withdraw">${T('data.withdraw')}</button>`}
  </section>`;
}
const logView = () => log('view', `${visibleDatasets(me()).map(d => d.id).join(',')} | ${F.period}m · ${F.item} · ${F.region}`);

/* ---------- 페이지: 관리자 ---------- */
let AT = 'approve', TL = 'ko', TF = '', LQ = '';
const ADMIN_TABS = ['approve', 'members', 'publish', 'preview', 'text', 'requests', 'logs', 'mails'];
const tbl = (heads, rows, emptyKey) => rows.length
  ? `<div class="tbl-wrap"><table><thead><tr>${heads.map(h => `<th scope="col">${T(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<p class="empty">${T(emptyKey)}</p>`;
const statusTag = u => { const s = access(u); return `<span class="tag ${s === 'ok' ? 'ok' : 'no'}">${T('status.' + s)}</span>`; };
const ADMIN = {
  approve: () => tbl(['form.name', 'form.email', 'form.org', 'form.type', 'form.country', 'form.dept', 'form.purpose', 'admin.appliedAt', 'admin.action'],
    db.users.filter(u => u.status === 'pending').map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.org)}</td><td>${T('type.' + u.type)}</td><td>${T('country.' + u.country)}</td><td>${esc(u.dept || '–')}</td><td class="wrap">${esc(u.purpose)}</td><td class="num">${ymd(u.createdAt)}</td>
      <td><div class="act-cell"><select name="group" aria-label="${T('admin.group')}">${GROUPS.map(g => opt(g, T('type.' + g), u.type)).join('')}</select><select name="farm" aria-label="${T('admin.farm')}">${opt('', '–', '')}${FARMS.map(f => opt(f.id, f.id, '')).join('')}</select><button type="button" class="btn btn-sm" data-act="approve" data-email="${esc(u.email)}">${T('admin.approve')}</button>
      <input name="reason" maxlength="200" placeholder="${T('admin.reason')}" aria-label="${T('admin.reason')}"><button type="button" class="btn btn-ghost btn-sm" data-act="reject" data-email="${esc(u.email)}">${T('admin.reject')}</button></div></td></tr>`), 'admin.noPending'),
  members: () => tbl(['form.name', 'form.email', 'form.org', 'admin.status', 'admin.group', 'admin.farm', 'admin.exp', 'admin.action'],
    db.users.filter(u => u.role !== 'admin' && u.status !== 'pending').map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.org)}</td><td>${statusTag(u)}</td>
      <td><select name="group" aria-label="${T('admin.group')}">${GROUPS.map(g => opt(g, T('type.' + g), u.group)).join('')}</select></td>
      <td><select name="farm" aria-label="${T('admin.farm')}">${opt('', '–', u.farm || '')}${FARMS.map(f => opt(f.id, f.id, u.farm || '')).join('')}</select></td>
      <td><input type="date" name="exp" value="${u.expiresAt ? ymd(u.expiresAt) : ''}" aria-label="${T('admin.exp')}"></td>
      <td><div class="act-cell"><button type="button" class="btn btn-sm" data-act="member-save" data-email="${esc(u.email)}">${T('common.save')}</button>${u.status === 'rejected' ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-act="member-toggle" data-email="${esc(u.email)}">${T(u.status === 'suspended' ? 'admin.resume' : 'admin.suspend')}</button>`}</div></td></tr>`), 'admin.noMembers'),
  publish: () => `<p class="hint">${T('admin.pubHint')}</p>
    <div class="tbl-wrap"><table><thead><tr><th scope="col">${T('admin.dataset')}</th><th scope="col">${T('admin.published')}</th>${GROUPS.map(g => `<th scope="col">${T('type.' + g)}</th>`).join('')}</tr></thead><tbody>
    ${DATASETS.map(d => { const s = db.settings.datasets[d.id]; return `<tr><th scope="row">${T('ds.' + d.id)}</th><td><input type="checkbox" class="cb" data-change="ds-pub" data-id="${d.id}"${s.published ? ' checked' : ''} aria-label="${T('ds.' + d.id)} · ${T('admin.published')}"></td>${GROUPS.map(g => `<td><input type="checkbox" class="cb" data-change="ds-grp" data-id="${d.id}" data-g="${g}"${s.groups.includes(g) ? ' checked' : ''} aria-label="${T('ds.' + d.id)} · ${T('type.' + g)}"></td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>
    <div class="admin-row">
      <div class="field"><label for="f-base">${T('admin.baseDate')}</label><input type="date" id="f-base" data-change="base-date" value="${esc(baseDate())}"></div>
      <div class="field grow"><label for="f-csv">${T('admin.upload')}</label><input type="file" id="f-csv" accept=".csv,text/csv" data-change="csv" aria-describedby="f-csv-h"><small class="hint" id="f-csv-h">${T('admin.uploadHint', { r: REGIONS.map(x => x.id).join(' · ') })}</small></div>
    </div>
    <p class="hint">${T('admin.src', { n: records().length, s: t(db.records ? 'admin.srcUpload' : 'admin.srcSample') })} ${db.records ? `<button type="button" class="link" data-act="reset-data">${T('admin.resetData')}</button>` : ''}</p>`,
  preview: () => `<p class="hint">${T('admin.pvHint')}</p><div class="switches">${['tests', 'speed', 'chart'].map(k => `<label class="check switch"><input type="checkbox" class="cb" data-change="pv" data-k="${k}"${db.settings.preview[k] ? ' checked' : ''}> <span>${T('home.open.' + k)}</span></label>`).join('')}</div><p><a class="link" href="${href('')}">${T('nav.home')}</a></p>`,
  text: () => {
    const q = TF.toLowerCase(), dir = TL === 'ar' ? 'rtl' : 'ltr';
    const keys = Object.keys(LANG.ko).filter(k => !q || `${k} ${LANG.ko[k]} ${LANG[TL][k] || ''}`.toLowerCase().includes(q));
    return `<div class="admin-row"><div class="field"><label for="f-tl">${T('admin.textLang')}</label><select id="f-tl" data-change="tl">${['ko', 'en', 'ar'].map(l => opt(l, l.toUpperCase(), TL)).join('')}</select></div>
      <div class="field grow"><label for="f-tf">${T('admin.textFind')}</label><input type="search" id="f-tf" data-change="tf" value="${esc(TF)}"></div></div><p class="hint">${T('admin.textHint')}</p>
      <form data-form="texts" class="text-list">${keys.map(k => `<div class="text-row"><code>${esc(k)}</code><span class="def" lang="${TL}" dir="${dir}">${esc(LANG[TL][k] ?? LANG.en[k] ?? '')}</span><input name="${esc(k)}" value="${esc((db.settings.text[TL]?.[k] || '').replace(/\n/g, '\\n'))}" aria-label="${esc(k)}" dir="${dir}"></div>`).join('')}
      <div class="sticky-save"><button class="btn">${T('common.save')}</button></div></form>`;
  },
  requests: () => tbl(['admin.when', 'admin.who', 'form.org', 'req.items', 'admin.period', 'req.purpose', 'admin.status'],
    db.requests.map(r => `<tr><td class="num">${kst(r.at)}</td><td>${esc(r.email)}</td><td>${esc(r.org)}</td><td class="wrap">${r.items.map(i => T('ds.' + i)).join(', ')}</td><td class="num">${esc(r.from)} ~ ${esc(r.to)}</td><td class="wrap">${esc(r.purpose)}</td>
      <td><select data-change="rq-status" data-id="${r.id}" aria-label="${T('admin.status')}">${['received', 'review', 'done', 'denied'].map(s => opt(s, T('rq.' + s), r.status)).join('')}</select></td></tr>`), 'admin.reqEmpty'),
  logs: () => `<div class="admin-row"><div class="field grow"><label for="f-lq">${T('admin.logFind')}</label><input type="search" id="f-lq" data-change="lq" value="${esc(LQ)}"></div></div>`
    + tbl(['admin.when', 'admin.who', 'admin.what', 'admin.target'], db.logs.filter(l => !LQ || l.email.includes(LQ.toLowerCase())).slice(0, 200)
      .map(l => `<tr><td class="num">${kst(l.at)}</td><td>${esc(l.email)}</td><td>${T('act.' + l.action)}</td><td class="wrap num">${esc(l.target)}</td></tr>`), 'admin.logEmpty'),
  mails: () => `<p class="notice">${T('admin.mailNote')}</p>` + (db.mails.length
    ? db.mails.slice(0, 100).map(m => `<article class="mail"><p class="mail-h"><span class="num">${kst(m.at)}</span> · ${T('admin.to')} <b>${esc(m.to)}</b></p><h3>${esc(m.subj)}</h3><pre>${esc(m.body)}</pre></article>`).join('')
    : `<p class="empty">${T('admin.mailEmpty')}</p>`),
};
function pageAdmin(app) {
  const n = db.users.filter(u => u.status === 'pending').length;
  app.innerHTML = `<section class="section admin">
    ${label(T('admin.label'), T('admin.sub'))}
    <div class="admin-head"><h1 class="h2">${T('admin.title')}</h1><button type="button" class="btn btn-ghost btn-sm" data-act="reset-demo">${T('admin.reset')}</button></div>
    <div class="tabs">${ADMIN_TABS.map(k => `<button type="button" data-act="tab" data-k="${k}" aria-pressed="${k === AT}">${T('admin.t.' + k)}${k === 'approve' && n ? ` <span class="badge num">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="panel">${ADMIN[AT]()}</div>
  </section>`;
}

/* ---------- 페이지: 약관·방침 ---------- */
function pageLegal(app) {
  app.innerHTML = `<section class="section">${label(T(page + '.title'), 'LEGAL')}<div class="legal"><h1 class="h2">${T(page + '.title')}</h1><p class="notice">${T('legal.draft')}</p>
    ${t(page + '.body').split('\n').map(l => l.startsWith('## ') ? `<h2>${esc(l.slice(3))}</h2>` : `<p>${esc(l)}</p>`).join('')}</div></section>`;
}

/* ---------- 라우터 ---------- */
const PAGES = { home: pageHome, company: pageCompany, signup: pageSignup, login: pageLogin, data: pageData, admin: pageAdmin, privacy: pageLegal, terms: pageLegal };
function paint(anim) { // anim: 페이지에 처음 들어올 때만 등장 모션 — 필터·페이지 넘김마다 다시 움직이지 않게
  document.body.className = 'pg-' + page + (anim ? ' anim' : '');
  document.title = (TITLES[page] ? t(TITLES[page]) + ' · ' : '') + 'PhavoSense';
  renderHeader(); PAGES[page]($('#app')); renderFooter(); renderWM(); renderCookie();
  document.documentElement.style.setProperty('--hdr-h', $('#header').offsetHeight + 'px');
}
function route(nav) {
  const m = location.hash.match(/^#\/(ko|en|ar)\/?([a-z]*)/);
  if (!m) { location.replace(`#/${detectLang()}/`); return; }
  const prev = page;
  lang = m[1]; page = PAGES[m[2]] ? m[2] : 'home';
  if (prev !== page) signupDone = false;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const idled = checkIdle();
  if (db.session && access(me()) !== 'ok') { db.session = null; save(); } // 정지·만료·탈퇴된 세션은 끊는다
  const u = me();
  if ((page === 'data' && !u) || (page === 'admin' && u?.role !== 'admin')) {
    if (!idled) toast(t(page === 'admin' ? 'guard.admin' : 'guard.login'));
    go('login'); return;
  }
  if (page === 'data' && (nav || prev !== 'data')) { logView(); save(); }
  paint(nav || prev !== page);
  if (nav) { scrollTo(0, 0); $('#app').focus({ preventScroll: true }); }
  const anchor = location.hash.split('?')[1];
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
}

/* ---------- 이벤트 ---------- */
const userOf = el => db.users.find(x => x.email === el.dataset.email);
const ACT = {
  skip: () => $('#app').focus(), // href="#app" 은 해시 라우터가 홈으로 보내므로 직접 이동
  logout: () => { log('logout'); db.session = null; save(); go(''); },
  cookie: () => renderCookie(true),
  'cookie-essential': () => { db.cookie = 'essential'; save(); renderCookie(); },
  'cookie-all': () => { db.cookie = 'all'; save(); renderCookie(); },
  'demo-fill': el => { db.otp = null; L = { step: 'email', email: el.dataset.email, msg: '' }; save(); paint(); $('#f-email').focus(); },
  'otp-resend': () => {
    const o = db.otp; if (!o) return;
    if (o.resends >= OTP_RESEND) L.msg = T('login.resendMax');
    else { issueOtp(o.email, o.resends + 1); L.msg = ''; }
    save(); paint(); $('#f-code')?.focus();
  },
  'otp-reset': () => { L = { step: 'email', email: db.otp?.email || L.email, msg: '' }; db.otp = null; save(); paint(); },
  pg: el => { F.pg += Number(el.dataset.d); paint(); $(`[data-act=pg][data-d="${el.dataset.d}"]:not([disabled])`)?.focus(); },
  req: () => {
    const from = new Date(Date.parse(baseDate()) - 365 * DAY).toISOString().slice(0, 10);
    openDialog(`<h2 class="dlg-t">${T('req.title')}</h2><p class="muted">${T('req.desc')}</p>
      <form class="form" data-form="request"><p class="notice err" id="req-err" role="alert" hidden></p>
      <fieldset class="field"><legend class="req">${T('req.items')}</legend><div class="checks">${visibleDatasets(me()).map(d => `<label class="check"><input type="checkbox" name="items" value="${d.id}"> <span>${T('ds.' + d.id)}</span></label>`).join('')}</div></fieldset>
      <div class="row2">${field('from', 'req.from', { req: 1, type: 'date', attrs: `value="${from}"` })}${field('to', 'req.to', { req: 1, type: 'date', attrs: `value="${esc(baseDate())}"` })}</div>
      ${field('purpose', 'req.purpose', { req: 1, textarea: 1, attrs: 'maxlength="500"' })}<button class="btn">${T('req.submit')}</button></form>`);
  },
  inq: () => openDialog(`<h2 class="dlg-t">${T('inq.title')}</h2><p class="muted">${T('inq.desc')}</p><form class="form" data-form="inquiry">${field('message', 'form.message', { req: 1, textarea: 1, attrs: 'maxlength="1000"' })}<button class="btn">${T('form.send')}</button></form>`),
  withdraw: () => {
    if (!confirm(t('data.withdrawQ'))) return;
    const u = me();
    log('withdraw'); mail(COMPANY_MAIL, t('mail.withdraw', { email: u.email }), `${u.name} · ${u.org}`);
    db.users = db.users.filter(x => x !== u); db.session = null; save();
    toast(t('data.withdrawn')); go('');
  },
  tab: el => { AT = el.dataset.k; paint(); $(`[data-act=tab][data-k=${AT}]`).focus(); },
  approve: el => {
    const u = userOf(el); if (!u) return;
    const tr = el.closest('tr'), g = $('[name=group]', tr).value, farm = $('[name=farm]', tr);
    if (g === 'farm' && !farm.value) { toast(t('admin.farmReq')); farm.focus(); return; } // 농가는 농가 코드가 있어야 자기 배치가 보인다
    if (farm.value) u.farm = farm.value;
    Object.assign(u, { status: 'approved', group: GROUPS.includes(g) ? g : u.type, approvedAt: Date.now(), expiresAt: Date.now() + 365 * DAY });
    delete u.reason;
    mail(u.email, t('mail.approved'), t('mail.approvedBody', { d: ymd(u.expiresAt), url: location.href.split('#')[0] + href('login') }));
    log('admin:approve', u.email); save(); toast(t('admin.approved', { e: u.email })); paint();
  },
  reject: el => {
    const u = userOf(el); if (!u) return;
    const input = $('[name=reason]', el.closest('tr')), reason = input.value.trim();
    if (!reason) { toast(t('admin.reasonReq')); input.focus(); return; }
    Object.assign(u, { status: 'rejected', reason });
    mail(u.email, t('mail.rejected'), t('mail.rejectedBody', { r: reason }));
    log('admin:reject', u.email); save(); toast(t('admin.rejected', { e: u.email })); paint();
  },
  'member-save': el => {
    const u = userOf(el); if (!u) return;
    const tr = el.closest('tr'), g = $('[name=group]', tr).value, exp = $('[name=exp]', tr).value, farm = $('[name=farm]', tr).value;
    if (GROUPS.includes(g)) u.group = g;
    if (exp) u.expiresAt = Date.parse(exp + 'T23:59:59+09:00');
    if (farm) u.farm = farm; else delete u.farm;
    log('admin:member', u.email); save(); toast(t('common.saved')); paint();
  },
  'member-toggle': el => {
    const u = userOf(el); if (!u) return;
    u.status = u.status === 'suspended' ? 'approved' : 'suspended';
    log('admin:member', u.email); save(); paint();
  },
  'reset-data': () => { db.records = null; save(); toast(t('common.saved')); paint(); },
  'reset-demo': () => {
    if (!confirm(t('admin.resetQ'))) return;
    db = seed(); save();
    L = { step: 'email', email: '', msg: '' }; F = { period: '12', item: 'cordycepin', region: 'all', pg: 0 }; AT = 'approve';
    go('');
  },
};

const FORM = {
  signup: (f, d) => {
    const email = d.email.trim().toLowerCase(), old = db.users.find(u => u.email === email), err = $('#signup-err');
    if (old && old.status !== 'rejected') { err.innerHTML = `${T('signup.dup')} <a href="${href('login')}">${T('nav.login')}</a>`; err.hidden = false; err.focus(); return; }
    const u = { email, name: d.name.trim(), phone: d.phone.trim(), org: d.org.trim(), type: d.type, group: d.type, country: d.country, dept: (d.dept || '').trim(), purpose: d.purpose.trim(), status: 'pending', createdAt: Date.now() };
    if (!u.name || !u.phone || !u.org || !u.purpose || !GROUPS.includes(u.type) || !COUNTRIES.includes(u.country)) { err.textContent = t('form.blank'); err.hidden = false; err.focus(); return; }
    db.users = db.users.filter(x => x !== old).concat(u);
    mail(email, t('mail.received'), t('mail.receivedBody'));
    save(); signupDone = true; paint(); $('.done')?.focus?.();
  },
  inquiry: (f, d) => {
    const u = me();
    mail(COMPANY_MAIL, t('mail.inquiry', { org: d.org || u?.org || '-' }), `${d.name || u?.name || '-'} <${d.email || u?.email || '-'}> ${d.phone || ''}\n\n${d.message.trim()}`);
    save(); f.reset(); if ($('#dlg').open) $('#dlg').close(); toast(t('form.inquirySent'));
  },
  'otp-send': (f, d) => {
    const email = d.email.trim().toLowerCase(), u = db.users.find(x => x.email === email);
    L = { step: 'email', email, msg: '' };
    if (access(u) !== 'ok') { L.msg = statusMsg(u); paint(); $('#f-email').focus(); return; }
    issueOtp(email, 0); L.step = 'code'; save(); paint(); $('#f-code').focus();
  },
  'otp-verify': (f, d) => {
    const o = db.otp; if (!o) return paint();
    if (Date.now() > o.exp) { L.msg = T('login.expired'); paint(); return; }
    if (d.code.trim() !== o.code) return wrongCode(o);
    if (db.users.find(x => x.email === o.email)?.role === 'admin') { // 관리자는 2단계 인증 필수
      Object.assign(o, { code: null, totp: code6(), tries: 0 }); L = { step: '2fa', email: o.email, msg: '' };
      save(); paint(); $('#f-code').focus(); return;
    }
    signIn(o.email);
  },
  'otp-2fa': (f, d) => {
    const o = db.otp; if (!o?.totp) return paint();
    if (d.code.trim() !== o.totp) return wrongCode(o);
    signIn(o.email);
  },
  request: (f, d, fd) => {
    const items = fd.getAll('items').filter(i => DATASETS.some(x => x.id === i)), err = $('#req-err');
    const fail = k => { err.textContent = t(k); err.hidden = false; };
    if (!items.length) return fail('req.needItem');
    if (d.from > d.to) return fail('req.badRange');
    const u = me(), r = { id: Date.now(), email: u.email, org: u.org || '-', items, from: d.from, to: d.to, purpose: d.purpose.trim(), at: Date.now(), status: 'received' };
    db.requests.unshift(r);
    mail(COMPANY_MAIL, t('mail.request', { email: u.email }), `${r.org}\n${items.map(i => t('ds.' + i)).join(', ')}\n${r.from} ~ ${r.to}\n\n${r.purpose}`);
    log('request', items.join(',')); save(); $('#dlg').close(); toast(t('req.sent'));
  },
  texts: (f, d) => {
    const o = { ...db.settings.text[TL] }; // 검색으로 가려진 키의 기존 값은 지키고, 보이는 키만 갱신
    for (const [k, v] of Object.entries(d)) { const s = v.trim().replace(/\\n/g, '\n'); if (s) o[k] = s; else delete o[k]; }
    db.settings.text[TL] = o; save(); toast(t('common.saved')); paint();
  },
};

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines.shift().split(',').map(s => s.trim().toLowerCase());
  const need = ['date', 'region', 'supplier', 'farm', 'batch', 'cordycepin', 'adenosine'];
  const miss = need.filter(k => !head.includes(k));
  if (miss.length) throw new Error('missing ' + miss.join(', '));
  if (!lines.length || lines.length > 20000) throw new Error('rows 1–20000');
  // shortcut: 따옴표 안 쉼표는 지원 안 함, 엑셀 내보내기 그대로 쓰려면 CSV 파서 라이브러리로
  return lines.map((l, i) => {
    const c = l.split(','), o = {};
    head.forEach((h, j) => { o[h] = (c[j] || '').trim(); });
    const r = { date: o.date, region: o.region.toUpperCase(), supplier: o.supplier, farm: o.farm, batch: o.batch, cordycepin: Number(o.cordycepin), adenosine: Number(o.adenosine) };
    const realDay = !isNaN(Date.parse(r.date)) && new Date(r.date).toISOString().startsWith(r.date); // 2026-13-05, 2026-02-30 같은 없는 날짜 거부
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !realDay || !REGIONS.some(x => x.id === r.region) || !Number.isFinite(r.cordycepin) || !Number.isFinite(r.adenosine) || r.cordycepin < 0 || r.adenosine < 0) throw new Error(`line ${i + 2}`);
    return r;
  });
}

const CHG = {
  lang: el => { location.hash = `#/${el.value}/${page === 'home' ? '' : page}`; },
  filter: el => { F[el.name] = el.value; F.pg = 0; logView(); save(); paint(); $('#flt-' + el.name).focus(); },
  freemail: f => { $('#free-warn').hidden = !(f.elements.type.value !== 'farm' && FREE_MAIL.test(f.elements.email.value)); },
  'ds-pub': el => { db.settings.datasets[el.dataset.id].published = el.checked; save(); toast(t('common.saved')); },
  'ds-grp': el => {
    const s = db.settings.datasets[el.dataset.id], g = el.dataset.g;
    s.groups = el.checked ? [...new Set([...s.groups, g])] : s.groups.filter(x => x !== g); save(); toast(t('common.saved'));
  },
  pv: el => { db.settings.preview[el.dataset.k] = el.checked; save(); toast(t('common.saved')); },
  'base-date': el => { if (el.value) { db.settings.baseDate = el.value; save(); toast(t('common.saved')); } },
  csv: el => {
    const file = el.files[0]; if (!file) return;
    if (file.size > 2e6) { toast(t('admin.uploadErr', { e: '> 2 MB' })); return; }
    file.text().then(txt => {
      try {
        const prev = db.records; db.records = parseCSV(txt);
        if (save()) toast(t('admin.uploadOk', { n: db.records.length })); else db.records = prev; // 저장 못 하면 화면도 되돌린다
      }
      catch (e) { toast(t('admin.uploadErr', { e: e.message })); }
      paint();
    });
  },
  tl: el => { TL = el.value; paint(); $('#f-tl').focus(); },
  tf: el => { TF = el.value.trim(); paint(); $('#f-tf').focus(); },
  lq: el => { LQ = el.value.trim(); paint(); $('#f-lq').focus(); },
  'rq-status': el => { const r = db.requests.find(x => String(x.id) === el.dataset.id); if (r) { r.status = el.value; save(); toast(t('common.saved')); } },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el); }
});
document.addEventListener('submit', e => {
  const f = e.target, fn = FORM[f.dataset.form]; if (!fn) return;
  e.preventDefault();
  const fd = new FormData(f);
  fn(f, Object.fromEntries(fd), fd);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && CHG[el.dataset.change]) CHG[el.dataset.change](el);
});

// 열람 보호: 복사·우클릭·드래그·인쇄·저장 단축키 차단 (완벽한 차단은 불가 — 워터마크로 추적)
const blockCopy = e => { if (page === 'data' && e.target.closest?.('.protected, .data-bar')) { e.preventDefault(); toast(t('data.protect')); } };
['copy', 'cut', 'contextmenu', 'dragstart'].forEach(ev => document.addEventListener(ev, blockCopy));
document.addEventListener('keydown', e => {
  if (page === 'data' && (e.ctrlKey || e.metaKey) && ['p', 's'].includes(e.key.toLowerCase())) { e.preventDefault(); toast(t('data.protect')); }
});
addEventListener('resize', () => document.documentElement.style.setProperty('--hdr-h', $('#header').offsetHeight + 'px'));
addEventListener('hashchange', () => route(true));
addEventListener('storage', e => { // 다른 탭의 변경을 받아 온다. 화면은 로그인한 사람이 바뀔 때만 다시 그려 쓰던 입력을 지우지 않는다
  if (e.key !== KEY) return;
  const was = db.session?.email; db = load();
  if (db.session?.email !== was) route();
});
if (!window.PHAVO_TEST) route(false);
