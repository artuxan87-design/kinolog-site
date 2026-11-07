'use strict';
// Публичные страницы сайта кинолога. Данные берутся из базы (правятся в админке),
// стартовое наполнение лежит в content/*.json.
const fs = require('fs');
const path = require('path');
const S = require('../lib/seo');
const R = require('../lib/richtext');
const V = require('../lib/visuals');

const ROOT = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
const { icon, badge: ibadge } = V;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
const rubK = k => rub(Math.round(k / 100));
const price = (p, from, unit) => p == null ? '<span class="tbd">Цена по договорённости</span>' : (from ? 'от ' : '') + rubK(p) + (unit ? ' <small>' + esc(unit) + '</small>' : '');
const plainPrice = (p, from) => p == null ? '' : (from ? 'от ' : '') + rubK(p);
const dateRu = iso => iso ? new Date(iso + (String(iso).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function files() { return { site: read('site.json'), solutions: read('solutions.json'), services: read('services.json'), cases: read('cases.json'), blog: read('blog.json') }; }

function load(store) {
  const base = read('solutions.json');
  return { settings: store.s, site: { ...store.c.site, steps: (store.c.site.steps && store.c.site.steps.length ? store.c.site.steps : files().site.steps) }, sol: { categories: base.categories, base: base.base, items: store.c.solutions }, srv: { items: store.c.services }, cases: { items: store.c.cases }, posts: store.publishedPosts(), allPosts: store.c.posts || [] };
}

// Что владельцу осталось заполнить: список {text, href}
function missing(d, store, paySettings) {
  const out = [], s = d.site, c = s.contacts;
  const add = (text, href) => out.push({ text, href });
  if (!store.d.admin.passHash) add('Задать свой пароль администратора', '/admin/settings');
  if (!s.domain) add('Указать домен сайта (до этого сайт закрыт от поисковиков)', '/admin/site');
  if (!c.telegram && !c.whatsappPhone && !c.email && !c.phone) add('Указать контакты для связи: телефон, Telegram, WhatsApp или e-mail', '/admin/site');
  if (!s.operator.name || !s.operator.inn) add('Заполнить реквизиты оператора персональных данных (ФИО, ИНН)', '/admin/site');
  if (!(s.trainer && s.trainer.photo)) add('Загрузить своё фото на страницу «О кинологе»', '/admin/site');
  if (!(s.gallery && s.gallery.length)) add('Добавить фото в галерею', '/admin/site');
  if (!(s.seo && s.seo.metrikaId)) add('Подключить Яндекс Метрику: указать номер счётчика', '/admin/site');
  if (!(s.seo && s.seo.yandexVerification)) add('Подтвердить сайт в Яндекс Вебмастере: вставить код проверки', '/admin/site');
  const noSrv = d.srv.items.filter(i => i.price == null).length;
  if (noSrv) add(`Указать цены услуг (без цены: ${noSrv})`, '/admin/services');
  const noCourse = d.sol.items.filter(i => i.price == null).length;
  if (noCourse) add(`Указать цены курсов (без цены: ${noCourse})`, '/admin/solutions');
  if (!d.allPosts.some(p => p.published)) add('Написать первую статью в блог', '/admin/posts');
  const real = paySettings.available.filter(p => p.id !== 'test');
  if (!real.length) add('Подключить оплату: ввести ключи ЮKassa, Робокассы или другого провайдера', '/admin/payments');
  if (paySettings.testMode && real.length) add('Выключить тестовый режим оплаты, когда проверите платёж', '/admin/payments');
  if (!paySettings.baseUrl && real.length) add('Указать адрес сайта (https://...) для уведомлений от банка', '/admin/payments');
  return out;
}

const cityIn = d => (d.site.seo && d.site.seo.cityIn) || (d.site.contacts.city ? 'в городе ' + d.site.contacts.city : '');
// Фирменный знак: одна непрерывная линия соединяет человека и собаку
const LOGO = '<svg class="logo-svg" viewBox="0 0 40 40" width="38" height="38" aria-hidden="true" focusable="false"><rect width="40" height="40" rx="11" fill="#2d4233"/><circle cx="11" cy="12" r="3" fill="#d4a373"/><path d="M11 17c0 9 3 12 8 12 4 0 5-4 8-4s4-3 4-6l2-6-4 2c-2-2-5-2-7 0" fill="none" stroke="#f7f8f5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'К';

const NAV = [['services/', 'Услуги и цены'], ['courses/', 'Курсы'], ['blog/', 'Блог'], ['about/', 'О кинологе'], ['partners/', 'Партнёрам']];

// opts: title, desc, path (без path страница закрыта от индексации), active, body, image, type, jsonld, noindex
function layout(d, o) {
  const site = d.site, c = site.contacts, seo = site.seo || {};
  const base = d.base || '';
  const noindex = o.noindex || !d.open || o.path === undefined;
  const title = o.rawTitle || (o.title ? o.title + ' — ' + site.name : (seo.title || site.name + ': ' + site.role));
  const headTags = S.head({ site, base, path: o.path === undefined ? '/' : o.path, title, desc: o.desc || seo.description, image: o.image, type: o.type, noindex, jsonld: o.jsonld || [], published: o.published, modified: o.modified });
  const active = o.active;
  const phoneHref = c.phone ? 'tel:' + c.phone.replace(/[^\d+]/g, '') : '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headTags}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
${S.metrika(seo.metrikaId)}
</head>
<body>
<a class="skip" href="#main">К содержимому</a>
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="/">${LOGO}<span>${esc(site.name)}</span></a>
    <button class="burger" aria-label="Меню" aria-expanded="false"><span></span><span></span></button>
    <nav class="nav" aria-label="Основное меню">
      ${NAV.map(([h, t]) => `<a href="/${h}"${active === h ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
      <a class="btn btn-sm" href="/contact/">Записаться</a>
    </nav>
  </div>
</header>
<main id="main">
${o.body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div>
      <div class="logo">${LOGO}<span>${esc(site.name)}</span></div>
      <p class="muted">${esc(site.role)}</p>
    </div>
    <div class="foot-links">
      ${NAV.map(([h, t]) => `<a href="/${h}">${t}</a>`).join('')}
      <a href="/contact/">Записаться</a>
      <a href="/privacy/">Политика обработки персональных данных</a>
    </div>
    <div class="foot-links">
      ${c.phone ? `<a href="${esc(phoneHref)}">${esc(c.phone)}</a>` : ''}
      ${c.telegram ? `<a href="https://t.me/${esc(c.telegram)}" rel="noopener">Telegram</a>` : ''}
      ${c.whatsappPhone ? `<a href="https://wa.me/${esc(c.whatsappPhone.replace(/\D/g, ''))}" rel="noopener">WhatsApp</a>` : ''}
      ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
      ${c.city ? `<span class="muted">${esc(c.city)}</span>` : ''}
    </div>
  </div>
  <div class="wrap muted small">© ${new Date().getFullYear()} ${esc(site.name)}</div>
</footer>
<script src="/assets/main.js"></script>
</body>
</html>
`;
}

// ---------- Общие блоки ----------
const HEROART = '<svg class="cover heroart" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Иллюстрация: линия связи человека и собаки"><defs><linearGradient id="ha" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9efe6"/><stop offset="1" stop-color="#cfdccb"/></linearGradient></defs><rect width="400" height="300" fill="url(#ha)"/><circle cx="310" cy="70" r="46" fill="#f3d9b8" opacity=".75"/><path d="M0 230c60-30 120-10 190-24s130-30 210 6v88H0z" fill="#4a6b53" opacity=".35"/><path d="M0 255c80-24 150 0 230-12 70-10 120-8 170 6v51H0z" fill="#2d4233" opacity=".55"/><circle cx="110" cy="105" r="14" fill="#d4a373"/><path d="M110 125c0 52 24 80 66 80 36 0 46-34 74-34s38-24 38-50l16-44-34 16c-18-16-44-16-60 0" fill="none" stroke="#2d4233" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const imgOrCover = (src, alt, type, acc, ic, cls = '') => src
  ? `<img class="photo ${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`
  : V.cover(type || 'dog', acc || 'teal', ic || 'paw');

function svcCard(s) {
  return `<a class="card svc-card acc-${V.accent(s.accent)}" href="/services/${esc(s.id)}/">
    <div class="card-img">${imgOrCover(s.image, s.title, 'dog', s.accent, s.icon)}<span class="card-ico">${icon(s.icon || 'paw', 22)}</span></div>
    <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
    <div class="card-foot"><span class="price">${price(s.price, s.from, s.unit)}</span><span class="muted small">Подробнее →</span></div>
  </a>`;
}

function courseTotals(i) {
  if (!i.perDay || i.price == null) return '';
  return `<ul class="totals"><li><b>30 дней</b><span>${rubK(i.price * 30)}</span></li><li><b>60 дней</b><span>${rubK(i.price * 60)}</span></li></ul>`;
}
function coursePrice(i) { return i.perDay && i.price != null ? rubK(i.price) + ' <small>за сутки проживания</small>' : price(i.price, false, ''); }

function courseCard(i) {
  return `<a class="card sol acc-${V.accent(i.accent)}" href="/courses/${esc(i.slug)}/">
    <div class="card-img">${imgOrCover(i.image, i.title, i.cover, i.accent, i.icon)}<span class="card-ico">${icon(i.icon || 'paw', 22)}</span></div>
    <div class="card-top"><span class="muted small">${esc(i.niche || '')}</span></div>
    <h3>${esc(i.title)}</h3><p>${esc(i.summary)}</p>
    <div class="card-foot"><span class="price">${coursePrice(i)}</span><span class="muted small">${esc(i.term || '')}</span></div>
  </a>`;
}

function postCard(p) {
  return `<a class="card post-card" href="/blog/${esc(p.slug)}/">
    ${p.cover ? `<div class="card-img"><img class="photo" src="${esc(p.cover)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>` : `<div class="card-img acc-teal">${V.cover('dog', 'teal', 'book')}<span class="card-ico">${icon('book', 22)}</span></div>`}
    <div class="card-top"><span class="muted small">${esc(dateRu(p.date))}</span></div>
    <h3>${esc(p.title)}</h3><p>${esc(p.excerpt || R.plain(p.body, 140))}</p>
  </a>`;
}

function crumbs(items) { return `<p class="crumbs">${items.map(([t, h]) => h ? `<a href="${h}">${esc(t)}</a>` : esc(t)).join(' / ')}</p>`; }

function cta(d) {
  return `<section class="sec" id="zayavka"><div class="wrap"><div class="cta cta-form">
    <div><h2>Расскажите о вашей собаке</h2><p>Напишите, что беспокоит. Перезвоню в течение рабочего дня и предложу формат занятий.</p></div>
    <form class="form" method="post" action="/contact">
      <label>Порода и возраст питомца<input name="breed" maxlength="100" autocomplete="off"></label>
      <label>Главная задача<select name="task"><option value="">Выберите</option><option>Тянет поводок</option><option>Страх или агрессия</option><option>Базовое послушание</option><option>Лает или портит вещи дома</option><option>Щенок</option><option>Другое</option></select></label>
      <label>Как к вам обращаться<input name="name" required autocomplete="name"></label>
      <label>Контактный телефон или Telegram<input name="contact" required autocomplete="tel"></label>
      <label class="check"><input type="checkbox" name="consent" value="1" required> <span>Согласен на обработку персональных данных по <a href="/privacy/" target="_blank">политике</a></span></label>
      <button class="btn btn-sand" type="submit">Отправить заявку на разбор</button>
    </form>
  </div></div></section>`;
}

// Цифры из настроек партнёрской программы
function facts(d, extra = []) {
  const s = d.settings, r = s.rates.service, sum = r.l1 + r.l2 + r.l3;
  const list = [
    { icon: 'tree', value: '3', label: 'линии партнёров' },
    { icon: 'percent', value: `${r.l1}/${r.l2}/${r.l3} %`, label: `ставки по линиям на услуги, сумма ${sum} %` },
    { icon: 'clock', value: `${s.holdDays} дн.`, label: 'удержание до выплаты' },
    { icon: 'wallet', value: rubK(s.minPayout), label: 'минимальная выплата' },
  ].concat(extra);
  return `<div class="facts-band">${list.map(f => `<div class="fact">${ibadge(f.icon, 'teal', 22)}<b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div>`;
}

function flow(d) {
  const f = d.sol.base.partnerFlow || [];
  return `<ol class="flow">${f.map((s, n) => `<li>${ibadge(s.icon, 'teal', 24)}<b>${esc(s.title)}</b><span>${esc(s.text)}</span>${n < f.length - 1 ? `<i class="flow-arrow">${icon('arrow', 18)}</i>` : ''}</li>`).join('')}</ol>`;
}

function commissionViz(d, type = 'service', sample = 2000) {
  const s = d.settings, r = s.rates[type], cap = 25, sum = r.l1 + r.l2 + r.l3;
  const rows = [['1-я линия', 'Вы привели клиента', r.l1], ['2-я линия', 'Клиента привёл партнёр, которого пригласили вы', r.l2], ['3-я линия', 'Следующий уровень цепочки', r.l3]];
  return `<div class="viz"><div class="viz-bars">${rows.map(([t, x, v], n) => `<div class="viz-row"><div class="viz-lbl"><b>${t}</b><small>${x}</small></div><div class="viz-track"><div class="viz-fill l${n + 1}" style="width:${Math.max(4, v / cap * 100)}%"></div></div><div class="viz-val">${v} %</div></div>`).join('')}</div>
  <div class="viz-total"><div class="viz-track"><div class="viz-fill all" style="width:${sum / cap * 100}%"></div></div><small>Сумма ставок ${sum} % из возможных ${cap} %</small></div>
  <div class="viz-example"><b>Пример расчёта</b><span>Заказ на ${rub(sample)}: 1-я линия получает ${rub(Math.round(sample * r.l1 / 100))}, 2-я ${rub(Math.round(sample * r.l2 / 100))}, 3-я ${rub(Math.round(sample * r.l3 / 100))}.</span></div></div>`;
}

function metrics(k) {
  return k.metrics && k.metrics.length ? `<div class="metrics">${k.metrics.map(m => `<div class="metric"><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div>` : '';
}

// ---------- Главная ----------
function home(d) {
  const site = d.site, t = site.trainer || {}, seo = site.seo || {};
  const k = d.cases.items.filter(x => x.public).slice(0, 2);
  const posts = d.posts.slice(0, 3);
  const faqs = d.sol.base.faq || [];
  const hero = site.hero || {}, problems = site.problems || [];
  const heroFacts = (hero.facts && hero.facts.length) ? hero.facts : [];
  const minPrice = d.srv.items.filter(s => s.price != null).map(s => s.price).sort((a, b) => a - b)[0];
  return layout(d, {
    path: '/', active: '', desc: seo.description, body: `
<section class="hero">
  <div class="wrap hero-in">
    <div>
      ${hero.badge ? `<p class="status"><i></i>${esc(hero.badge)}</p>` : ''}
      <h1>${esc(hero.title || site.role)}</h1>
      <p class="lead">${esc(hero.lead || site.tagline)}</p>
      <div class="actions"><a class="btn btn-sand" href="#zayavka">${esc(hero.cta || 'Записаться')}</a><a class="btn btn-ghost" href="/services/">Услуги и цены</a></div>
      ${hero.note ? `<p class="micro">${esc(hero.note)}</p>` : ''}
      <ul class="facts">${heroFacts.map(f => `<li><b>${esc(f.value)}</b>${esc(f.label)}</li>`).join('')}</ul>
    </div>
    <div class="hero-photo${t.photo ? '' : ' noimg'}">${t.photo ? `<img class="photo" src="${esc(t.photo)}" alt="${esc(site.name)}, кинолог ${esc(site.contacts.city || '')}" width="520" height="620" fetchpriority="high">` : HEROART}</div>
  </div>
</section>

<section class="sec tight">
  <div class="wrap">
    <h2>С какими проблемами обращаются</h2>
    <div class="grid4">${problems.map(x => `<div class="point">${ibadge(x.icon || 'paw', 'teal', 24)}<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join('')}</div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-head"><h2>Форматы работы и стоимость</h2><a href="/services/">Все услуги →</a></div>
    <div class="grid">${d.srv.items.map(svcCard).join('')}</div>
  </div>
</section>

<section class="sec alt">
  <div class="wrap">
    <div class="sec-head"><h2>Курсы и программы</h2><a href="/courses/">Все курсы →</a></div>
    <div class="grid">${d.sol.items.map(courseCard).join('')}</div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <h2>Как строится работа</h2>
    <ol class="steps">${site.steps.map(s => `<li><span class="step-ico">${icon(s.icon || 'check', 22)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>
  </div>
</section>

<section class="sec alt"><div class="wrap split about-strip">
  <div class="about-photo acc-teal${t.photo ? '' : ' noimg'}">${t.photo ? `<img class="photo" src="${esc(t.photo)}" alt="${esc(site.name)}" loading="lazy" width="220" height="293">` : V.cover('dog', 'teal', 'paw')}</div>
  <div><p class="eyebrow">Кто с вами работает</p><h2>${esc(t.name || site.name)}</h2>
  ${(t.about || []).slice(0, 2).map(p => `<p>${esc(p)}</p>`).join('')}
  <a class="btn btn-ghost" href="/about/">Подробнее обо мне</a></div>
</div></section>

${k.length ? `<section class="sec"><div class="wrap"><div class="sec-head"><h2>Истории питомцев</h2><a href="/stories/">Все истории →</a></div>
<div class="grid">${k.map(storyCard).join('')}</div></div></section>` : ''}

${posts.length ? `<section class="sec ${k.length ? 'alt' : ''}"><div class="wrap"><div class="sec-head"><h2>Блог кинолога</h2><a href="/blog/">Все статьи →</a></div>
<div class="grid">${posts.map(postCard).join('')}</div></div></section>` : ''}

<section class="sec ${posts.length && !k.length ? '' : 'alt'}"><div class="wrap split">
  <div><p class="eyebrow">Партнёрская программа</p><h2>Рекомендуйте кинолога и получайте процент</h2>
  <p>Ветеринарам, грумерам, владельцам зоомагазинов и просто любителям собак: приводите клиентов по личной ссылке и получайте вознаграждение с оплаченных занятий. Вход бесплатный.</p>
  <a class="btn btn-ghost" href="/partners/">Условия программы</a></div>
  ${facts(d)}
</div></section>

${faqs.length ? `<section class="sec"><div class="wrap narrow"><h2>Частые вопросы</h2>${faqs.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>` : ''}

${cta(d)}
`,
    jsonld: [S.business(site, d.base), ...(faqs.length ? [S.faq(faqs)] : [])],
  });
}

function storyCard(c) {
  return `<a class="card" href="/stories/#${esc(c.slug)}">
    <div class="card-img acc-pink">${c.photo ? `<img class="photo" src="${esc(c.photo)}" alt="${esc(c.title)}" loading="lazy" decoding="async">` : V.cover('dog', 'pink', 'heart')}</div>
    <h3>${esc(c.title)}</h3><p>${esc(c.task)}</p></a>`;
}

// ---------- Услуги и цены ----------
function servicesPage(d) {
  const site = d.site, ci = cityIn(d);
  return layout(d, {
    path: '/services/', active: 'services/', title: `Услуги кинолога ${ci} и цены`,
    desc: `Занятия с кинологом ${ci}: прогулки по городу, выезд за город, коррекция поведения. Цены на сайте. ${site.name}.`,
    body: `
<section class="page-head"><div class="wrap">
  ${crumbs([['Главная', '/'], ['Услуги и цены']])}
  <h1>Услуги кинолога ${esc(ci)} и цены</h1>
  <p class="lead">Цены указаны заранее. Если задача нестандартная, называю стоимость после первой встречи.</p>
</div></section>
<section class="sec tight"><div class="wrap">
  <div class="grid svc-grid">${d.srv.items.map(svcCard).join('')}</div>
</div></section>
<section class="sec alt"><div class="wrap">
  <div class="sec-head"><h2>Курсы и программы</h2><a href="/courses/">Все курсы →</a></div>
  <div class="grid">${d.sol.items.map(courseCard).join('')}</div>
</div></section>
${cta(d)}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Услуги и цены', '/services/']])],
  });
}

function servicePage(d, s) {
  const site = d.site, ci = cityIn(d);
  const url = `/services/${s.id}/`;
  const others = d.srv.items.filter(x => x.id !== s.id);
  return layout(d, {
    path: url, active: 'services/', title: `${s.title} ${ci}`, desc: s.seoDesc || `${s.title} ${ci}. ${s.text}`, image: s.image,
    body: `
<section class="page-head"><div class="wrap sol-head">
  <div>
    ${crumbs([['Главная', '/'], ['Услуги и цены', '/services/'], [s.title]])}
    <h1>${esc(s.title)} ${esc(ci)}</h1>
    <p class="lead">${esc(s.text)}</p>
    ${s.image ? `<img class="photo wide" src="${esc(s.image)}" alt="${esc(s.title)}" loading="lazy">` : ''}
  </div>
  <aside class="buy acc-${V.accent(s.accent)}">
    <div class="buy-price">${price(s.price, s.from, s.unit)}</div>
    <a class="btn" href="/contact/?s=${encodeURIComponent(s.title)}">Записаться</a>
    <p class="small muted">Оплата после согласования: онлайн на сайте или по договорённости.</p>
  </aside>
</div></section>
${(s.details || []).length ? `<section class="sec tight"><div class="wrap"><h2>Что входит</h2><ul class="checks">${s.details.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></section>` : ''}
${others.length ? `<section class="sec alt"><div class="wrap"><h2>Другие услуги</h2><div class="grid">${others.map(svcCard).join('')}</div></div></section>` : ''}
${cta(d)}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Услуги и цены', '/services/'], [s.title, url]]), {
      '@context': 'https://schema.org', '@type': 'Service', name: s.title, description: s.text, provider: { '@id': d.base + '/#business' },
      ...(site.contacts.city ? { areaServed: { '@type': 'City', name: site.contacts.city } } : {}),
      ...(s.price != null ? { offers: { '@type': 'Offer', price: String(Math.round(s.price / 100)), priceCurrency: 'RUB', availability: 'https://schema.org/InStock' } } : {}),
    }],
  });
}

// ---------- Курсы ----------
function coursesPage(d) {
  const ci = cityIn(d);
  return layout(d, {
    path: '/courses/', active: 'courses/', title: `Курсы послушания и дрессировки ${ci}`,
    desc: `Курс послушания ${ci}: собака живёт у кинолога 30–60 дней, коррекция поведения, программы для щенков и взрослых собак.`,
    body: `
<section class="page-head"><div class="wrap">
  ${crumbs([['Главная', '/'], ['Курсы']])}
  <h1>Курсы послушания и дрессировки ${esc(ci)}</h1>
  <p class="lead">Выберите формат: проживание собаки у кинолога или программа коррекции поведения с вашим участием.</p>
</div></section>
<section class="sec tight"><div class="wrap"><div class="grid">${d.sol.items.map(courseCard).join('')}</div></div></section>
${cta(d)}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Курсы', '/courses/']])],
  });
}

function coursePage(d, i) {
  const site = d.site, ci = cityIn(d);
  const url = `/courses/${i.slug}/`;
  const faqs = d.sol.base.faq || [];
  return layout(d, {
    path: url, active: 'courses/', title: i.seoTitle || `${i.title} ${ci}`, rawTitle: i.seoTitle ? i.seoTitle + ' — ' + site.name : '', desc: i.seoDesc || i.summary, image: i.image,
    body: `
<section class="page-head"><div class="wrap sol-head">
  <div>
    ${crumbs([['Главная', '/'], ['Курсы', '/courses/'], [i.title]])}
    <h1>${esc(i.title)}</h1>
    <p class="lead">${esc(i.summary)}</p>
    ${i.image ? `<img class="photo wide" src="${esc(i.image)}" alt="${esc(i.title)}" loading="lazy">` : ''}
    ${i.forWhom ? `<p><b>Для кого:</b> ${esc(i.forWhom)}</p>` : ''}
    ${i.format ? `<p><b>Формат:</b> ${esc(i.format)}</p>` : ''}
  </div>
  <aside class="buy acc-${V.accent(i.accent)}">
    <div class="buy-price">${coursePrice(i)}</div>
    ${courseTotals(i)}
    ${i.term ? `<div class="muted">Срок: ${esc(i.term)}</div>` : ''}
    <a class="btn" href="/contact/?s=${encodeURIComponent(i.title)}">Записаться</a>
    <p class="small muted">Точный срок и итоговая цена называются после первой встречи с собакой.</p>
  </aside>
</div></section>
${(i.features || []).length ? `<section class="sec tight"><div class="wrap"><h2>Что входит</h2><ul class="checks">${i.features.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></section>` : ''}
${(i.program || []).length ? `<section class="sec alt"><div class="wrap"><h2>Как проходит курс</h2><ol class="steps">${i.program.map((x, n) => `<li><span class="step-ico">${n + 1}</span><p>${esc(x)}</p></li>`).join('')}</ol></div></section>` : ''}
${faqs.length ? `<section class="sec"><div class="wrap narrow"><h2>Вопросы и ответы</h2>${faqs.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>` : ''}
${cta(d)}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Курсы', '/courses/'], [i.title, url]]), {
      '@context': 'https://schema.org', '@type': 'Service', name: i.title, description: i.summary, provider: { '@id': d.base + '/#business' },
      ...(site.contacts.city ? { areaServed: { '@type': 'City', name: site.contacts.city } } : {}),
      ...(i.price != null ? { offers: { '@type': 'Offer', price: String(Math.round(i.price / 100)), priceCurrency: 'RUB' } } : {}),
    }, ...(faqs.length ? [S.faq(faqs)] : [])],
  });
}

// ---------- Истории ----------
function storiesPage(d) {
  const items = d.cases.items.filter(c => c.public);
  const ci = cityIn(d);
  return layout(d, {
    path: '/stories/', active: '', title: `Истории питомцев: результаты дрессировки ${ci}`,
    desc: `Реальные истории собак и их владельцев: что беспокоило, как работали и какой получился результат. Кинолог ${d.site.name}.`,
    body: `
<section class="page-head"><div class="wrap">
  ${crumbs([['Главная', '/'], ['Истории питомцев']])}
  <h1>Истории питомцев</h1>
  <p class="lead">Что беспокоило владельцев, как мы работали и что получилось.</p>
</div></section>
<section class="sec tight"><div class="wrap">
  ${items.length ? items.map(c => `<article class="case" id="${esc(c.slug)}">
    <div><h2>${esc(c.title)}</h2><p class="muted">${esc(c.client)}</p>
    ${c.photo || c.photoAfter ? `<div class="ba">${c.photo ? `<figure><img class="photo" src="${esc(c.photo)}" alt="${esc(c.title)}: до" loading="lazy"><figcaption>До</figcaption></figure>` : ''}${c.photoAfter ? `<figure><img class="photo" src="${esc(c.photoAfter)}" alt="${esc(c.title)}: после" loading="lazy"><figcaption>После</figcaption></figure>` : ''}</div>` : ''}
    ${metrics(c)}
    <h3>Задача</h3><p>${esc(c.task)}</p>
    <h3>Результат</h3><p>${esc(c.status)}</p>
    ${c.video ? R.render('@видео ' + c.video) : ''}</div>
    <div><h3>Что сделано</h3><ul class="checks">${(c.done || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
  </article>`).join('') : '<p class="lead">Истории появятся здесь после согласования с владельцами.</p>'}
</div></section>
${cta(d)}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Истории питомцев', '/stories/']])],
  });
}

// ---------- Блог ----------
function blogPage(d) {
  const ci = cityIn(d);
  return layout(d, {
    path: '/blog/', active: 'blog/', title: 'Блог кинолога',
    desc: `Статьи кинолога ${ci}: воспитание и дрессировка собак, поведение, выбор кинолога, советы владельцам.`,
    body: `
<section class="page-head"><div class="wrap">
  ${crumbs([['Главная', '/'], ['Блог']])}
  <h1>Блог кинолога</h1>
  <p class="lead">Практические советы по воспитанию, дрессировке и поведению собак.</p>
</div></section>
<section class="sec tight"><div class="wrap">
  ${d.posts.length ? `<div class="grid">${d.posts.map(postCard).join('')}</div>` : '<p class="lead">Статьи скоро появятся.</p>'}
</div></section>
${cta(d)}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Блог', '/blog/']])],
  });
}

function postPage(d, p) {
  const site = d.site, url = `/blog/${p.slug}/`;
  const body = R.render(p.body);
  const more = d.posts.filter(x => x.slug !== p.slug).slice(0, 3);
  const desc = p.seoDesc || p.excerpt || R.plain(p.body, 160);
  return layout(d, {
    path: url, active: 'blog/', rawTitle: (p.seoTitle || p.title) + ' — ' + site.name, desc, image: p.cover, type: 'article', published: p.date, modified: p.updated || p.date,
    body: `
<article class="page-head post"><div class="wrap narrow">
  ${crumbs([['Главная', '/'], ['Блог', '/blog/'], [p.title]])}
  <h1>${esc(p.title)}</h1>
  <p class="muted small"><time datetime="${esc(p.date)}">${esc(dateRu(p.date))}</time> · ${R.readMinutes(p.body)} мин чтения · ${esc(site.name)}</p>
  ${p.cover ? `<img class="photo wide" src="${esc(p.cover)}" alt="${esc(p.title)}" fetchpriority="high">` : ''}
  <div class="post-body">${body}</div>
  ${(p.tags || []).length ? `<p class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</p>` : ''}
</div></article>
<section class="sec"><div class="wrap narrow"><div class="cta"><div><h2>Нужна помощь с вашей собакой?</h2><p>Запишитесь на консультацию, обсудим задачу и подберём формат занятий.</p></div><a class="btn btn-light" href="/contact/">Записаться</a></div></div></section>
${more.length ? `<section class="sec alt"><div class="wrap"><h2>Читайте также</h2><div class="grid">${more.map(postCard).join('')}</div></div></section>` : ''}`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Блог', '/blog/'], [p.title, url]]), {
      '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: desc, datePublished: p.date, dateModified: p.updated || p.date,
      ...(p.cover ? { image: S.abs(d.base, p.cover) } : {}),
      author: { '@type': 'Person', name: (site.trainer && site.trainer.name) || site.name }, publisher: { '@id': d.base + '/#business' }, mainEntityOfPage: d.base + url,
    }],
  });
}

// ---------- О кинологе, заявка, служебные ----------
function aboutPage(d) {
  const site = d.site, t = site.trainer || {}, ci = cityIn(d);
  const g = site.gallery || [];
  return layout(d, {
    path: '/about/', active: 'about/', title: `О кинологе: ${t.name || site.name}`,
    desc: `${t.name || site.name}: кинолог ${ci}${t.experience ? ', опыт ' + t.experience.toLowerCase() : ''}. ${(t.credentials || []).join(', ')}.`, image: t.photo,
    body: `
<section class="page-head"><div class="wrap about">
  <div class="about-photo acc-teal${t.photo ? '' : ' noimg'}">${t.photo ? `<img class="photo" src="${esc(t.photo)}" alt="${esc(t.name || site.name)}, кинолог" width="454" height="605">` : V.cover('dog', 'teal', 'paw')}</div>
  <div>
    ${crumbs([['Главная', '/'], ['О кинологе']])}
    <h1>${esc(t.name || site.name)}</h1>
    <p class="lead">${esc(site.role)}</p>
    ${(t.about || []).map(p => `<p>${esc(p)}</p>`).join('')}
    ${(t.credentials || []).length ? `<ul class="checks">${t.credentials.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${(site.areas || []).length ? `<h3>Где работаю</h3><ul class="checks">${site.areas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="actions"><a class="btn" href="/contact/">Записаться</a><a class="btn btn-ghost" href="/services/">Услуги и цены</a></div>
  </div>
</div></section>
${g.length ? `<section class="sec tight"><div class="wrap"><h2>Фото</h2><div class="gallery">${g.map(x => `<figure><a href="${esc(x.src)}" target="_blank" rel="noopener"><img class="photo" src="${esc(x.src)}" alt="${esc(x.alt || 'Фото с занятий')}" loading="lazy" decoding="async"></a></figure>`).join('')}</div></div></section>` : ''}
${cta(d)}`,
    jsonld: [S.business(site, d.base), S.breadcrumbs(d.base, [['Главная', '/'], ['О кинологе', '/about/']])],
  });
}

function contactPage(d, { s = '', ref = '', errs = [], form = {} } = {}) {
  const sel = form.solution || s || '';
  const c = d.site.contacts;
  const opts = d.srv.items.map(i => i.title).concat(d.sol.items.map(i => i.title)).concat(['Другое']);
  return layout(d, {
    path: '/contact/', active: '', title: 'Записаться к кинологу', desc: `Запись на занятия и консультацию к кинологу ${cityIn(d)}. Оставьте заявку, и я перезвоню.`,
    body: `
<section class="page-head"><div class="wrap narrow">
  <h1>Записаться на консультацию</h1>
  <p class="lead">Коротко расскажите о собаке и задаче. Перезвоню в течение рабочего дня.</p>
  ${c.phone || c.telegram || c.whatsappPhone ? `<p class="actions">${c.phone ? `<a class="btn btn-ghost" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${icon('phone', 18)} ${esc(c.phone)}</a>` : ''}${c.telegram ? `<a class="btn btn-ghost" href="https://t.me/${esc(c.telegram)}" rel="noopener">Telegram</a>` : ''}${c.whatsappPhone ? `<a class="btn btn-ghost" href="https://wa.me/${esc(c.whatsappPhone.replace(/\D/g, ''))}" rel="noopener">WhatsApp</a>` : ''}</p>` : ''}
  ${errs.length ? `<div class="alert">${errs.map(e => `<div>${esc(e)}</div>`).join('')}</div>` : ''}
  <form class="form" method="post" action="/contact">
    <label>Имя<input name="name" required autocomplete="name" value="${esc(form.name)}"></label>
    <label>Телефон или ник в мессенджере<input name="contact" required autocomplete="tel" value="${esc(form.contact)}"></label>
    <label>Что интересует<select name="solution"><option value="">Пока не выбрал</option>${opts.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
    <label>О собаке и задаче<textarea name="text" rows="4" placeholder="Порода, возраст, что беспокоит">${esc(form.text)}</textarea></label>
    <label>Код партнёра, если вас пригласили<input name="code" value="${esc(form.code || ref)}" placeholder="необязательно" maxlength="12"></label>
    <label class="check"><input type="checkbox" name="consent" value="1" required> <span>Согласен на обработку персональных данных по <a href="/privacy/" target="_blank">политике</a></span></label>
    <button class="btn" type="submit">Отправить заявку</button>
  </form>
</div></section>`,
    jsonld: [S.breadcrumbs(d.base, [['Главная', '/'], ['Записаться', '/contact/']])],
  });
}

function thanksPage(d, lead) {
  const c = d.site.contacts;
  const msg = encodeURIComponent(`Здравствуйте! Заявка №${lead.id} с сайта, ${lead.name}.`);
  const links = [
    c.telegram ? `<a class="btn btn-ghost" href="https://t.me/${esc(c.telegram)}">Написать в Telegram</a>` : '',
    c.whatsappPhone ? `<a class="btn btn-ghost" href="https://wa.me/${esc(c.whatsappPhone.replace(/\D/g, ''))}?text=${msg}">Написать в WhatsApp</a>` : '',
  ].join('');
  return layout(d, { title: 'Заявка принята', body: `
<section class="page-head"><div class="wrap narrow">
  <h1>Заявка №${lead.id} принята</h1>
  <p class="lead">Перезвоню по контакту, который вы оставили.</p>
  ${links ? `<div class="actions">${links}</div>` : ''}
  <p><a href="/">На главную</a></p>
</div></section>` });
}

function privacyPage(d) {
  const o = d.site.operator;
  const v = x => x ? esc(x) : '<span class="tbd">уточняется</span>';
  return layout(d, { path: '/privacy/', title: 'Политика обработки персональных данных', body: `
<section class="page-head"><div class="wrap narrow doc">
  <h1>Политика обработки персональных данных</h1>
  <p class="tbd-note">Черновик. Перед публикацией сайта заполнить реквизиты оператора в админке и согласовать текст с юристом.</p>
  <h2>1. Оператор</h2>
  <p>${v(o.name)}, ИНН ${v(o.inn)}${o.ogrnip ? ', ОГРНИП ' + esc(o.ogrnip) : ''}, адрес: ${v(o.address)}. Политика опубликована во исполнение ч. 2 ст. 18.1 Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».</p>
  <h2>2. Какие данные и зачем</h2>
  <p>Посетители, оставившие заявку: имя, телефон или ник в мессенджере, сведения о собаке и задаче, код партнёра. Цель: ответ на заявку, заключение и исполнение договора на оказание услуг.</p>
  <p>Партнёры: ФИО, телефон, e-mail, пароль (хранится в виде хеша), сведения о налоговом статусе, ИНН и реквизиты для выплат. Цель: участие в партнёрской программе, расчёт и выплата вознаграждения.</p>
  <h2>3. Основание</h2>
  <p>Согласие субъекта, которое он даёт отметкой в форме (п. 1 ч. 1 ст. 6 и ст. 9 152-ФЗ), а также исполнение договора (п. 5 ч. 1 ст. 6).</p>
  <h2>4. Как обрабатываются</h2>
  <p>Данные хранятся в базе на сервере оператора на территории РФ (ч. 5 ст. 18 152-ФЗ). Передача третьим лицам: платёжному сервису и налоговым органам в объёме, необходимом для оплаты и выплат. На сайте может работать Яндекс Метрика: она собирает обезличенную статистику посещений.</p>
  <h2>5. Срок</h2>
  <p>Заявки: до достижения цели или отзыва согласия, но не дольше 1 года. Данные партнёров: на время участия и далее в пределах сроков, установленных налоговым и бухгалтерским законодательством.</p>
  <h2>6. Права субъекта</h2>
  <p>Получить сведения об обработке, потребовать уточнения или удаления данных, отозвать согласие (ст. 14 и ч. 2 ст. 9 152-ФЗ). Запрос направляется по контактам на сайте.</p>
</div></section>` });
}

function notFound(d) {
  return layout(d, { title: 'Страница не найдена', body: `<section class="page-head"><div class="wrap narrow"><h1>Страница не найдена</h1><p class="lead">Возможно, ссылка устарела. Загляните в раздел <a href="/services/">«Услуги и цены»</a> или <a href="/blog/">блог</a>.</p><a class="btn" href="/">На главную</a></div></section>` });
}

module.exports = { files, load, missing, facts, flow, commissionViz, metrics, layout, esc, rub, price, cta, home, servicesPage, servicePage, coursesPage, coursePage, storiesPage, blogPage, postPage, aboutPage, contactPage, thanksPage, privacyPage, notFound, cityIn };
