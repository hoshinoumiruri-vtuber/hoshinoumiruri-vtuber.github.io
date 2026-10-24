// Fan site prototype. Plain script, no build step. Data files are written by tools/build.py.
const $ = (s) => document.querySelector(s);
// Interface language. The Japanese pages live under /ja/ and load ja.js (window.JA: Chinese wording -> Japanese)
// before this file. t() looks a piece of wording up there, and gives it back unchanged on the Chinese pages.
// Titles of streams and songs are never translated.
const LANG = /^\/ja(\/|$)/.test(location.pathname) || window.FORCE_JA ? 'ja' : 'zh';   // FORCE_JA: for a test page opened from a file
const P = LANG === 'ja' ? '/ja' : '';
const t = (s) => (LANG === 'ja' && window.JA && s in window.JA ? window.JA[s] : s);
// Which language a title is in, for the browser to pick the right letter shapes: kana means Japanese.
const lg = (s) => (/[\u3040-\u30ff]/.test(s) ? ' lang="ja"' : LANG === 'ja' && /[\u4e00-\u9fff]/.test(s) ? ' lang="zh-Hant"' : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hms = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
const date = (d) => d ? d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) : t('日期不明');
const thumb = (id, big) => 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + (big ? '/hqdefault.jpg' : '/mqdefault.jpg');
// Addresses. On the web every stream and every song has an address of its own (/s/KEY/, /song/NAME/), and the
// pages at those addresses are written out by build.py so that search engines can read them. Opened straight from
// a file (tools/shot.sh) there is only one page, so the same routes are carried after the # instead.
const REAL = location.protocol !== 'file:';
function U(r) {
  if (!REAL) return '#' + r;
  const i = r.indexOf('='), k = i < 0 ? r : r.slice(0, i), v = i < 0 ? '' : r.slice(i + 1);
  return P + (k === 'home' ? '/' : k === 'browse' ? '/streams/' : k === 'c' ? '/streams/#c=' + v : k === 'songs' ? '/songs/' : k === 'hl' ? '/moments/' : k === 'about' ? '/about/' : k === 'games' ? '/games/' : k === 'game' ? '/game/' + v + '/' : k === 'videos' ? '/videos/' : k === 'fanart' ? '/fanart/' :
    k === 's' ? '/s/' + v + '/' : k === 'song' ? '/song/' + v + '/' : '/search/#q=' + v);
}
function go(r) { if (REAL) { history.pushState(null, '', U(r)); route(); } else location.hash = r; }
const link = (s) => U('s=' + encodeURIComponent(s.k));
// window.PRE lets a test page hand the data in directly (see tools/shot.sh).
const get = (p) => window.PRE && window.PRE[p] ? Promise.resolve(window.PRE[p]) : fetch((REAL ? '/data/' : 'data/') + p).then((r) => r.json());
let videos = [], games = [], originals = [], sshown = 24;
let streams = [], songs = [], byKey = {}, songsOf = {}, months = {}, groups = [], cats = [], cat = '', shown = 24, cur = null;

// Playing. The video always plays from YouTube, nothing is hosted here. On a stream's own page it plays in the
// large frame while that frame is in view, anywhere else in the small player that follows the page.
function play(id, start, label, fan) {
  if (!id) return;
  start = Math.max(0, Math.round(start || 0));
  const frame = '<iframe allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&start=' + start + '"></iframe>';
  const stage = $('#stage');
  if (stage && cur && cur.y === id && stage.getBoundingClientRect().bottom > 160) {
    stage.innerHTML = frame;
    closeDock();
    return;
  }
  if (stage && stage.querySelector('iframe')) stage.innerHTML = poster(cur);
  $('#dock').hidden = false;
  $('#dockframe').innerHTML = frame;
  const bk = streams.some((x) => x.bk && x.y === id);
  $('#now').innerHTML = (fan ? '<span class="fanchip" title="' + FAN + t('">粉絲頻道</span> ') : bk ? '<span class="fanchip">' + t('備份頻道') + '</span> ' : '') + esc(label || '') + '<a target="_blank" rel="noopener" href="https://youtu.be/' + encodeURIComponent(id) + '?t=' + start + '">YouTube ↗</a>';
}
function closeDock() { $('#dock').hidden = true; $('#dockframe').innerHTML = ''; }
$('#dockx').addEventListener('click', closeDock);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDock(); });
// The home banner as a carousel of news (user 2026-10-21): every 6 s, arrows and dots, a swipe on a phone, still while the
// pointer is on it or the tab is hidden. Only the slide leaving and the one coming move; the others wait off screen.
function newsCarousel() {
  const box = document.getElementById('news'); if (!box || box.dataset.on) return; box.dataset.on = '1';
  const slides = [...box.querySelectorAll('.slide')], dots = box.querySelector('.ndots'); let cur = 0, timer = null, hold = false;
  slides.forEach((sl, i) => {
    const im = sl.querySelector('img'); if (im && /news-(mv|lovenovels)/.test(im.getAttribute('src'))) { sl.classList.add('fit'); const bk = document.createElement('span'); bk.className = 'back'; bk.style.backgroundImage = 'url(' + im.getAttribute('src') + ')'; sl.insertBefore(bk, im); }
    const d = document.createElement('i'); d.onclick = () => go(i, true); dots.appendChild(d);
  });
  const mark = () => [...dots.children].forEach((d, k) => d.classList.toggle('on', k === cur));
  function go(i, user) {
    i = (i + slides.length) % slides.length; if (i === cur) return;
    const dir = user && i < cur ? -1 : 1;
    slides.forEach((s, k) => { if (k !== i && k !== cur) { s.style.transition = 'none'; s.classList.remove('on'); s.style.transform = 'translateX(102%)'; } });   // 102%: a fractional width must not show a sliver of the waiting one
    const inc = slides[i], out = slides[cur];
    inc.style.transition = 'none'; inc.style.transform = dir < 0 ? 'translateX(-102%)' : 'translateX(102%)'; void inc.offsetWidth;
    out.style.transition = ''; out.style.transform = dir < 0 ? 'translateX(102%)' : 'translateX(-102%)'; out.classList.remove('on');
    inc.style.transition = ''; inc.style.transform = ''; inc.classList.add('on'); cur = i; mark(); restart();
  }
  const restart = () => { clearInterval(timer); timer = setInterval(() => { if (!hold && !document.hidden) go(cur + 1); }, 6000); };
  box.addEventListener('pointerenter', () => { hold = true; }); box.addEventListener('pointerleave', () => { hold = false; });
  box.querySelectorAll('.narr button').forEach((b) => { b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); go(cur + +b.dataset.d, true); }; });
  let x0 = null, moved = false;
  box.addEventListener('pointerdown', (e) => { x0 = e.clientX; moved = false; });
  box.addEventListener('pointerup', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) { moved = true; go(cur + (e.clientX < x0 ? 1 : -1), true); } x0 = null; });
  box.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  mark(); restart();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  if (b.closest('summary') || b.tagName === 'A') e.preventDefault();
  play(b.dataset.id, +b.dataset.s, b.dataset.label, b.classList.contains('fan'));
});
const pb = (cls, id, s, text, label, title) => id ? '<button type="button" class="' + cls + '" data-id="' + esc(id) + '" data-s="' + (s || 0) + '" data-label="' + esc(label) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + text + '</button>' : '<span></span>';

// A single-song video is on the fan channel, not on Ruri's own. Every place that links to one says so.
const FAN = t('粉絲頻道「琉星播放器」的影片，不是琉璃頻道的影片');
const clip = (x, label) => pb('pill fan', x.c, 0, t('切片<small>粉絲頻道</small>'), label, FAN);
// Where a performance plays from: the place in Ruri's own stream when the stream is on her channel, else the fan clip.
const from = (x, cls, text) => { const st = byKey[x.k] || {}, label = x.t + '／' + x.a + '（' + date(x.d) + '）'; return st.y && !(x.m && x.c) ? pb(cls, st.y, Math.max(x.s - 2, 0), text, label, t('從琉璃頻道原直播的這個時間點播放')) : pb(cls + ' fan', x.c, 0, text, label, FAN); };

// The night sky behind the page: three layers of stars at random places, drawn once as box shadows.
// The shooting stars and the twinkle are CSS only, and stop for people who ask for less motion.
(() => {
  const W = Math.max(screen.width, 1600), H = Math.max(screen.height, 1000);
  const stars = (n, a) => Array.from({ length: n }, () => Math.round(Math.random() * W) + 'px ' + Math.round(Math.random() * H) + 'px 0 rgba(255,255,255,' + (a * (.5 + Math.random() / 2)).toFixed(2) + ')').join(',');
  document.querySelectorAll('#sky i').forEach((el, i) => { el.style.boxShadow = stars([260, 110, 36][i], [.5, .75, 1][i]); });
})();

function month(m) { return months[m] || (months[m] = get('m/' + m + '.json')); }
const mkey = (s) => s.d.slice(0, 6) || 'nodate';
// A stream can be in several categories (cs). It is listed under each of them; its card shows the main one (c).
const inCat = (s, c) => (s.cs || [s.c]).includes(c);
const dot = (c) => '<i class="dot k-' + esc(c) + '"></i>';

function card(s, i) {
  return '<a class="card" href="' + link(s) + '"><div class="thumb">' +
    (s.y ? '<img alt="" ' + (i > 23 ? 'loading="lazy" ' : '') + 'src="' + thumb(s.y) + '">' : t('<span class="noarc">主頻道沒有存檔</span>')) +
    (s.songs ? '<span class="badge n">♪ ' + s.songs + '</span>' : '') + '<span class="badge">' + hms(s.dur) + '</span></div>' +
    '<div class="ctitle"' + lg(s.t) + '>' + esc(s.t) + '</div><div class="cline">' + dot(s.c) + esc(t(s.c)) + '　' + date(s.d) + (s.bk ? '　<span class="fanchip">' + t('備份頻道') + '</span>' : '') + '</div></a>';
}

// Home: one featured stream, then shelves.
function drawRandoms() {
  const pool = streams.filter((s) => s.y).sort(() => Math.random() - .5);
  $('#randoms').innerHTML = pool.slice(0, 8).map(card).join('');
}
// The picked moments on the home page: a few, different every time, with a button for the next few.
async function drawHomeHl() {
  const all = await loadMoments();
  if (!all.length) return;
  $('#homehlcount').textContent = all.length + t(' 個時刻');
  $('#homehl').innerHTML = all.slice().sort(() => Math.random() - .5).slice(0, 6).map(hlbox).join('');
}
function drawCal() {
  const day = {};
  streams.forEach((s) => { if (s.d && !day[s.d]) day[s.d] = s; });
  const ds = Object.keys(day).sort();
  if (!ds.length) return;
  const at = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)));
  const first = at(ds[0]), last = at(ds[ds.length - 1]), w = new Date(first);
  // weeks start on Monday
  w.setUTCDate(w.getUTCDate() - (w.getUTCDay() + 6) % 7);
  let html = '', gap = 9;
  while (w <= last) {
    let label = '', cells = '';
    gap++;
    for (let i = 0; i < 7; i++) {
      const k = w.toISOString().slice(0, 10).replace(/-/g, ''), s = day[k];
      if ((w.getUTCDate() === 1 || (!html && i === 0)) && gap > 2) label = (w.getUTCMonth() === 0 || !html ? w.getUTCFullYear() + '.' : '') + (w.getUTCMonth() + 1);
      cells += w < first || w > last ? '<i style="visibility:hidden"></i>' : s ? '<a class="k-' + esc(s.c) + '" href="' + link(s) + '" title="' + esc(date(k) + ' ' + s.t) + '"></a>' : '<i></i>';
      w.setUTCDate(w.getUTCDate() + 1);
    }
    if (label) gap = 0;
    html += '<span>' + label + '</span>' + cells;
  }
  $('#cal').innerHTML = html;
  $('#legend').innerHTML = cats.map((c) => '<span>' + dot(c) + esc(t(c)) + '</span>').join('');
}
function drawHome(m) {
  newsCarousel();
  const f = streams.find((s) => s.y);
  if (f) {
    const mine = songsOf[f.k] || [];
    $('#hero').innerHTML = '<div class="back" style="background-image:url(' + thumb(f.y, 1) + ')"></div><div class="in"><a href="' + link(f) + '"><img alt="" src="' + thumb(f.y, 1) + '"></a><div>' +
      t('<p class="kicker">最新直播　') + date(f.d) + '</p><h1' + lg(f.t) + '>' + esc(f.t) + '</h1><div class="sub">' + dot(f.c) + esc(t(f.c)) + '　' + hms(f.dur) + (mine.length ? '　' + mine.map((x) => esc(x.t)).slice(0, 5).join('、') + (mine.length > 5 ? t(' 等 ') + mine.length + t(' 首') : '') : '') + '</div>' +
      '<div class="acts">' + pb('btn go', f.y, 0, t('▶　播放'), f.t) + '<a class="btn" href="' + link(f) + '">' + (m.transcripts ? t('歌單與逐字稿') : t('看這場')) + '</a></div></div></div>';
  }
  $('#stats').innerHTML = t('收錄 <b>') + m.streams + t('</b> 場直播（累計 <b>') + m.airhours + t('</b> 小時）、<b>') + m.games + t('</b> 款遊戲、<b>') + groups.length + t('</b> 首歌、<b>') + m.songs + t('</b> 次演唱、<b>') + m.videos + t('</b> 支影片、<b>') + m.shorts + t('</b> 支 Shorts、<b>') + m.moments + t('</b> 個精選時刻');
  $('#recent').innerHTML = streams.slice(0, 12).map(card).join('');
  $('#topsongs').innerHTML = groups.slice(0, 10).map((v, i) => '<div class="trow"><span class="no">' + (i + 1) + '</span>' + from(v[0], 'pb', '▶') +
    '<div class=\"tt\"><b' + lg(v[0].t) + '>' + esc(v[0].t) + (covers(v).length ? '<i class="covtag">' + (covers(v)[0].own ? 'MV' : 'Cover') + '</i>' : '') + '</b><span' + lg(v[0].a) + '>' + esc(v[0].a) + '</span></div><span class="tm">' + v.length + t(' 次</span><span></span></div>')).join('');
  $('#gameshelf').innerHTML = games.filter((g) => g.g !== 'other').slice(0, 12).map(gcard).join('');
  drawCal();
  drawRandoms();
  drawHomeHl();
  $('#catshelves').innerHTML = [...cats.filter((c) => c !== '初配信' && c !== '其他'), ...cats.filter((c) => c === '初配信')].map((c) => {   // the debut streams are a milestone, so they are always shown, but they are the beginning of the channel: last
    const v = streams.filter((s) => inCat(s, c));
    return v.length < (c === '初配信' ? 1 : 4) ? '' : '<div class="shelfhead"><h2>' + dot(c) + esc(t(c)) + '</h2><a href="' + U('c=' + encodeURIComponent(c)) + t('\">全部 ') + v.length + t(' 場</a></div><div class="shelf">') + v.slice(0, 10).map((s) => card(s, 99)).join('') + '</div>';
  }).join('');
}

const gameOf = (s) => s.gm && s.gm !== 'other' ? games.find((g) => g.g === s.gm) : null;
const gamesOf = (s) => (s.gms || (s.gm ? [s.gm] : [])).filter((id) => id !== 'other').map((id) => games.find((g) => g.g === id)).filter(Boolean);
// Games: one card for each game, and one page for each game with the streams in which it was played.
// A stream that is in the site links to its page here, one that is not yet goes to YouTube and plays in the small player.
const gname = (g) => (LANG === 'ja' ? g.j : g.n);
const ghours = (g) => Math.round(g.s.reduce((a, x) => a + x.dur, 0) / 3600);
function gspan(g) {
  const ds = g.s.map((x) => x.d).filter(Boolean).sort();
  return !ds.length ? '' : ds[0].slice(0, 6) === ds[ds.length - 1].slice(0, 6) ? date(ds[0]).slice(0, 7) : date(ds[0]).slice(0, 7) + ' – ' + date(ds[ds.length - 1]).slice(0, 7);
}
function gcard(g) {
  const x = g.s.find((z) => z.y);
  return '<a class="card" href="' + U('game=' + encodeURIComponent(g.g)) + '"><div class="thumb">' + (x ? '<img alt="" loading="lazy" src="' + thumb(x.y) + '">' : '') +
    '<span class="badge n">' + g.s.length + t(' 場') + '</span><span class="badge">' + ghours(g) + t(' 小時') + '</span></div>' +
    '<div class="ctitle"' + lg(gname(g)) + '>' + esc(gname(g)) + '</div><div class="cline">' + esc(gspan(g)) + '</div></a>';
}
function scard(x, i) {
  if (x.k && byKey[x.k]) return card(byKey[x.k], i);
  return '<a class="card" href="https://youtu.be/' + encodeURIComponent(x.y) + '" target="_blank" rel="noopener" data-id="' + esc(x.y) + '" data-s="0" data-label="' + esc(x.t) + '"><div class="thumb">' +
    '<img alt="" ' + (i > 11 ? 'loading="lazy" ' : '') + 'src="' + thumb(x.y) + '"><span class="badge">' + hms(x.dur) + '</span></div><div class="ctitle"' + lg(x.t) + '>' + esc(x.t) + '</div>' +
    '<div class="cline">' + dot('遊戲') + esc(t('遊戲')) + (x.d ? '　' + date(x.d) : '') + '</div></a>';
}
function drawGames() {
  const real = games.filter((g) => g.g !== 'other'), rest = games.filter((g) => g.g === 'other');
  $('#gcount').textContent = real.length + t(' 款遊戲，') + games.reduce((n, g) => n + g.s.length, 0) + t(' 場直播');
  $('#glist').innerHTML = real.concat(rest).map(gcard).join('');
}
function drawGame(id) {
  const g = games.find((x) => x.g === id);
  if (!g) return go('games');
  document.title = gname(g) + '｜' + t('玩過的遊戲｜') + SITE;
  show('game');
  const span = gspan(g);
  $('#v-game').innerHTML = '<p class="crumb"><a href="' + U('games') + '">' + t('玩過的遊戲') + '</a></p><h1' + lg(gname(g)) + '>' + esc(gname(g)) + '</h1><p class="count">' + g.s.length + t(' 場直播') + '　' + ghours(g) + t(' 小時') + (span ? '　' + esc(span) : '') + '</p>' +
    gameVideos(g) + '<div id="gmoments"></div><div id="gbosses"></div><div id="gres"></div><div id="gquest"></div><div id="gend"></div><div class="grid">' + g.s.map(scard).join('') + '</div>';
  window.scrollTo(0, 0);
  gameBosses(g);
  gameRescues(g);
  gameEndings(g);
  gameQuests(g);
  gameMoments(g);
}
// The channel's videos and Shorts about the game (videos.json g, from the title or set by hand), newest first, as a
// shelf that scrolls sideways like the ones on the home page (user, 2026-10-16).
function gameVideos(g) {
  const vd = videos.filter((v) => (v.g || []).includes(g.g)).sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  return vd.length ? '<div class="shelfhead"><h3>' + t('影片與 Shorts') + ' <span class="count">' + vd.length + t(' 支') + '</span></h3></div><div class="shelf">' + vd.map((v) => vcard(v, 99)).join('') + '</div>' : '';
}
// The boss fights found in the streams of the game, one line a fight, by boss in the order she first fought them.
async function gameBosses(g) {
  const keys = new Set(g.s.map((x) => x.k).filter(Boolean));
  const found = (await loadBosses()).filter((b) => keys.has(b.k) && byKey[b.k]);
  if (!found.length || !$('#gbosses') || $('#v-game').hidden) return;
  // bosses.json is already in the order she fought them (two streams of one day by their start time)
  // one block a playthrough: a boss beaten again in 二周目 or Godhome is a record of that run, not her first win
  // the Colosseum trials are a group of their own, whichever stream they were in (user, 2026-10-16)
  const group = (b) => (bkind(b) === '競技場' ? '競技場' : bkind(b) === '單獨挑戰' ? '單獨挑戰' : b.p || '一周目');
  const runs = ['一周目', '二周目', '競技場', '神居', '單獨挑戰'];
  const several = new Set(found.map(group)).size > 1;
  // each kind is a table of its own, folded on its own (user 2026-10-18: all in one 里程碑 was too long)
  const TITLE = { 一周目: '一周目 boss', 二周目: '二周目 boss', 競技場: '競技場', 神居: '萬神殿', 單獨挑戰: '神居單獨挑戰' };
  const fold = (title, count, inner) => '<details class="fold"><summary><h3>' + t(title) + ' <span class="count">' + count + '</span></h3></summary>' + inner + '</details>';
  const part = (p) => {
    if (p === '單獨挑戰') {
      const hog = found.filter((b) => group(b) === p);
      return hog.length ? fold(TITLE[p], new Set(hog.map(baseName)).size + t(' 個 boss') + '・' + hog.reduce((a, b) => a + b.x, 0) + t(' 次'), '<div class="box">' + hogRows(hog, (b) => byKey[b.k], true) + '</div>') : '';
    }
    const by = new Map();
    found.filter((b) => group(b) === p).forEach((b) => { if (!by.has(b.n)) by.set(b.n, []); by.get(b.n).push(b); });
    if (!by.size) return '';
    const box = '<div class="box">' + [...by.values()].map((v) => v.map((b) => bossRow(byKey[b.k], b, true)).join('')).join('') + '</div>';
    // with one playthrough only (Silksong so far) one table called Boss 與連戰 (user 2026-10-18)
    return fold(several ? TITLE[p] : 'Boss 與連戰', several ? by.size + t(p === '競技場' || p === '神居' ? ' 項' : ' 個 boss') : by.size, box);
  };
  $('#gbosses').innerHTML = runs.map(part).join('');
}
// The grubs / fleas she freed in the streams of the game, in order (data/rescues.json, checked on the picture). Only the ones
// found are listed, so the heading gives the number found, not a share of all the grubs in the game.
async function gameRescues(g) {
  const keys = new Set(g.s.map((x) => x.k).filter(Boolean));
  const found = (await loadRescues()).filter((r) => keys.has(r.k) && byKey[r.k]);
  if (!found.length || !$('#gres') || $('#v-game').hidden) return;
  const what = found[0].c;
  const unit = t(what === '跳蚤' ? ' 隻跳蚤' : ' 隻毛毛蟲');
  // one list a playthrough, numbered from 1 in each (a grub freed again in 二周目 is that run's)
  const done = found.filter((r) => r.all);
  const freedOnly = found.filter((r) => !r.all);
  const runs = ['一周目', '二周目'].map((p) => freedOnly.filter((r) => (r.p || '一周目') === p)).filter((v) => v.length);
  const allRow = (p) => done.filter((r) => (r.p || '一周目') === p).map((r) => { const s = byKey[r.k]; return '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('全部救完') + '（' + s.t + '）') + '<span><b>' + t(what === '跳蚤' ? '跳蚤全部救完' : '毛毛蟲全部救完') + '</b><i class="covtag">' + t('全部救完') + '</i>' +
    '<br><a class="sub" href="' + U('s=' + encodeURIComponent(s.k)) + '"' + lg(s.t) + '>' + date(s.d) + '　' + esc(s.t) + '</a></span></div>'; }).join('');
  // numbered only once every one of the playthrough is in the list (46 grubs, 30 fleas); until then the area is shown
  const total = what === '跳蚤' ? 30 : 46;
  const list = (v) => '<div class="box">' + v.map((r, i) => { const s = byKey[r.k]; return '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('救' + what) + '（' + s.t + '）') + '<span><b>' + (v.length >= total ? t('第 {n} 隻').replace('{n}', i + 1) + (r.a ? '　' : '') : '') + (r.a ? esc(LANG === 'ja' && r.j ? r.j : r.a) : v.length >= total ? '' : t('救出' + what)) + '</b>' +
    '<br><a class="sub" href="' + U('s=' + encodeURIComponent(s.k)) + '"' + lg(s.t) + '>' + date(s.d) + '　' + esc(s.t) + '</a></span></div>'; }).join('') + allRow(v[0].p || '一周目') + '</div>';
  $('#gres').innerHTML = '<details class="fold"><summary><h3>' + t('救' + what) + ' <span class="count">' + freedOnly.length + unit + '</span></h3></summary>' +
    runs.map((v) => (runs.length > 1 ? '<h4>' + t(v[0].p || '一周目') + ' <span class="count">' + v.length + unit + '</span></h4>' : '') + list(v)).join('') + '</details>';
}
let rescueList = null;
const loadRescues = () => rescueList || (rescueList = get('rescues.json').catch(() => []));
// The endings she reached in the streams of the game, the first time each (data/endings.json, read off the ending card).
const endName = (r) => (r.e ? r.e + '　' : '') + esc(LANG === 'ja' && r.j ? r.j : r.n) + (r.all ? '<i class="covtag">' + t('全部收集') + '</i>' : '');
async function gameEndings(g) {
  const keys = new Set(g.s.map((x) => x.k).filter(Boolean));
  const found = (await loadEndings()).filter((r) => keys.has(r.k) && byKey[r.k]);
  if (!found.length || !$('#gend') || $('#v-game').hidden) return;
  $('#gend').innerHTML = '<details class="fold"><summary><h3>' + t('結局') + ' <span class="count">' + found.length + t(' 個') + '</span></h3></summary><div class="box">' +
    found.map((r) => { const s = byKey[r.k]; return '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('結局') + '（' + s.t + '）') + '<span><b>' + endName(r) + '</b>' +
      '<br><a class="sub" href="' + U('s=' + encodeURIComponent(s.k)) + '"' + lg(s.t) + '>' + date(s.d) + '　' + esc(s.t) + '</a></span></div>'; }).join('') + '</div></details>';
}
let endingList = null;
const loadEndings = () => endingList || (endingList = get('endings.json').catch(() => []));
// The quests she finished in the streams of the game (data/quests.json, the moment checked on the picture).
const questName = (r) => esc(LANG === 'ja' && r.j ? r.j : r.n);
async function gameQuests(g) {
  const keys = new Set(g.s.map((x) => x.k).filter(Boolean));
  const found = (await loadQuests()).filter((r) => keys.has(r.k) && byKey[r.k]);
  if (!found.length || !$('#gquest') || $('#v-game').hidden) return;
  $('#gquest').innerHTML = '<details class="fold"><summary><h3>' + t('任務') + ' <span class="count">' + found.length + t(' 個') + '</span></h3></summary><div class="box">' +
    found.map((r) => { const s = byKey[r.k]; return '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('任務') + '（' + s.t + '）') + '<span><b>' + questName(r) + '</b><i class="covtag">' + t('完成任務') + '</i>' +
      '<br><a class="sub" href="' + U('s=' + encodeURIComponent(s.k)) + '"' + lg(s.t) + '>' + date(s.d) + '　' + esc(s.t) + '</a></span></div>'; }).join('') + '</div></details>';
}
let questList = null;
const loadQuests = () => questList || (questList = get('quests.json').catch(() => []));
let storyList = null;
const loadStories = () => storyList || (storyList = get('stories.json').catch(() => []));
// The picked moments of the streams in which the game was played, newest first.
async function gameMoments(g) {
  const keys = new Set(g.s.map((x) => x.k).filter(Boolean));
  if (!keys.size) return;
  const found = (await loadMoments()).filter(([s]) => keys.has(s.k));
  if (!found.length || !$('#gmoments') || $('#v-game').hidden) return;
  found.sort((a, b) => b[0].d.localeCompare(a[0].d) || a[1].s - b[1].s);
  const draw = (all) => {
    $('#gmoments').innerHTML = '<h3>' + t('精選時刻') + ' <span class="count">' + found.length + t(' 個時刻') + '</span></h3>' + found.slice(0, all ? found.length : 5).map(hlbox).join('') +
      (!all && found.length > 5 ? '<p class="sub"><a href="#" id="gmall">' + t('查看全部') + ' (' + found.length + ')</a></p>' : '');
    const m = $('#gmall');
    if (m) m.addEventListener('click', (e) => { e.preventDefault(); draw(true); });
  };
  draw(false);
}

// The channel's own uploads and Shorts. They play here like everything else. A Short is upright, so its card is
// too, showing the middle of the picture YouTube gives for it.
const vcard = (v, i) => '<a class="card" href="https://' + (v.kind === 's' ? 'www.youtube.com/shorts/' : 'youtu.be/') + encodeURIComponent(v.y) + '" target="_blank" rel="noopener" data-id="' + esc(v.y) + '" data-s="0" data-label="' + esc(v.t) + '">' +
  '<div class="thumb"><img alt="" ' + (i > 11 ? 'loading="lazy" ' : '') + 'src="' + thumb(v.y, v.kind === 's') + '">' + (v.dur ? '<span class="badge">' + hms(v.dur) + '</span>' : '') + '</div><div class="ctitle"' + lg(v.t) + '>' + esc(v.t) + '</div>' + (v.d ? '<div class="cline">' + date(v.d) + '</div>' : '') + '</a>';
let vcat = '';
function drawVideos() {
  // Newest first once the dates are known; the ones without a date keep the order of the channel's list.
  const all = videos.some((v) => v.d) ? videos.slice().sort((a, b) => (b.d || '').localeCompare(a.d || '')) : videos;
  const kinds = ['原創曲', 'Cover', '歌回精華', '直播精華', '企劃', '其他'].filter((c) => all.some((v) => v.c === c));
  $('#vchips').innerHTML = '<a data-vc="" href="#" class="' + (vcat ? '' : 'on') + '">' + t('全部') + '<i>' + all.length + '</i></a>' +
    kinds.map((c) => '<a data-vc="' + c + '" href="#" class="' + (vcat === c ? 'on' : '') + '">' + esc(t(c)) + '<i>' + all.filter((v) => v.c === c).length + '</i></a>').join('');
  const by = vcat ? all.filter((v) => v.c === vcat) : all;
  const vv = by.filter((v) => v.kind === 'v'), ss = by.filter((v) => v.kind === 's');
  $('#vcount').textContent = vv.length + t(' 支');
  $('#scount').textContent = ss.length + t(' 支');
  $('#vlist').innerHTML = vv.map(vcard).join('');
  $('#slist').innerHTML = ss.slice(0, sshown).map(vcard).join('');
  $('#smore').hidden = ss.length <= sshown;
}

// Fan art: the pictures of Ruri's repository fanart. The ones with a theme (a call for pictures) are apart from the rest.
// A picture that has a second version (with and without words) is one tile with a switch. The artist is left blank when nobody knows.
let fanart = null;
const asset = (f) => (REAL ? '/' : '') + f;                 // files are at the root of the site in both languages (P is /ja on the Japanese pages)
const faTitle = (w) => (LANG === 'ja' && w.j) || w.z;
function faTile(w, i) {
  const alt = w.alt ? '<button type="button" class="faalt" data-i="' + i + '" data-on="0">' + esc(t('切換：') + ((LANG === 'ja' && w.alt.j) || w.alt.z)) + '</button>' : '';
  return '<figure class="fa" id="fa' + i + '"><a href="' + asset(w.f) + '" target="_blank" rel="noopener"><img src="' + asset(w.t) + '" width="' + w.w + '" height="' + w.h + '" loading="lazy" alt="' + esc(faTitle(w) || w.a) + '"></a>' +
    '<figcaption>' + (faTitle(w) ? '<b>' + esc(faTitle(w)) + '</b>' : '') + (w.a ? '<span>' + esc(w.a) + '</span>' : '') + alt + '</figcaption></figure>';
}
async function drawFanart() {
  if (!fanart) { try { fanart = await get('fanart.json'); } catch (e) { fanart = { themes: {}, works: [] }; } }
  const all = fanart.works.map((w, i) => [w, i]);
  const plain = all.filter(([w]) => !w.th);
  // the pictures Ruri drew herself: a row of their own at the very bottom, after the themes (user 2026-10-19)
  const own = (fanart.own || []).map((w) => '<figure class="fa"><a href="' + asset(w.f) + '" target="_blank" rel="noopener"><img src="' + asset(w.t) + '" width="' + w.w + '" height="' + w.h + '" loading="lazy" alt="' + esc(t('琉璃畫的圖')) + '"></a></figure>').join('');
  let html = own && plain.length ? '<div class="shelfhead"><h2>' + t('大家畫的圖') + '</h2><span class="count">' + plain.length + t(' 張') + '</span></div>' : '';
  html += plain.length ? '<div class="famason">' + plain.map(([w, i]) => faTile(w, i)).join('') + '</div>' : '';
  Object.keys(fanart.themes).sort((a, b) => fanart.themes[b].d.localeCompare(fanart.themes[a].d)).forEach((k) => {
    const th = fanart.themes[k], items = all.filter(([w]) => w.th === k);
    if (!items.length) return;
    const ss = th.st.map((y) => byKey[y]).filter(Boolean);
    html += '<div class="shelfhead"><h2>' + esc(LANG === 'ja' ? th.j : th.z) + '</h2><span class="count">' + items.length + t(' 張') + '</span></div><p class="count">' + esc(LANG === 'ja' ? th.dj : th.dz) +
      (ss.length ? '<br>' + t('相關直播：') + ss.map((s) => '<a href="' + link(s) + '">' + esc(((s.t.match(/【(.+?)】/) || [])[1] || s.t).slice(0, 20)) + '</a>').join('、') : '') + '</p>' +
      '<div class="famason">' + items.map(([w, i]) => faTile(w, i)).join('') + '</div>';
  });
  if (own) html += '<div class="shelfhead"><h2>' + t('琉璃畫的圖') + '</h2><span class="count">' + fanart.own.length + t(' 張') + '</span></div><div class="famason">' + own + '</div>';
  $('#fanart').innerHTML = html || '<p class="count">' + t('還沒有圖。') + '</p>';
}
$('#fanart').addEventListener('click', (e) => {
  const b = e.target.closest('.faalt');
  if (!b) return;
  const w = fanart.works[+b.dataset.i], on = b.dataset.on !== '1', fig = b.closest('figure');
  const v = on ? w.alt : w, img = fig.querySelector('img');
  img.src = asset(v.t); fig.querySelector('a').href = asset(v.f); b.dataset.on = on ? '1' : '0';
});

// 陸禮 on the character page: two outfits, two faces each; the buttons choose the outfit, the picture or its button the face
{
  const img = $('#luimg img'); let set = '1', face = 'a';
  const draw = () => { img.src = (REAL ? '/' : '') + 'img/lu-' + set + face + '.webp'; };
  $('#luset').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    set = b.dataset.set; face = set === '2' ? 'b' : 'a'; draw();          // the second outfit opens on the wink (user 2026-10-19)
    $('#luset').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const flip = () => { face = face === 'a' ? 'b' : 'a'; draw(); };
  $('#luimg').addEventListener('click', flip); $('#luface').addEventListener('click', flip);
  // the other three pictures are loaded once the page is idle, so a switch shows at once
  addEventListener('load', () => ['1b', '2a', '2b'].forEach((k) => { new Image().src = (REAL ? '/' : '') + 'img/lu-' + k + '.webp'; }));
}

// All streams, with filters.
function drawBrowse() {
  const y = $('#year').value, q = $('#hq').value.trim().toLowerCase(), sort = $('#sort').value;
  let hit = streams.filter((s) => (!cat || inCat(s, cat)) && (!y || s.d.startsWith(y)) &&
    (!q || s.t.toLowerCase().includes(q) || (songsOf[s.k] || []).some((x) => (x.t + ' ' + x.a).toLowerCase().includes(q))));
  if (sort === 'old') hit = hit.slice().reverse();
  if (sort === 'songs') hit = hit.slice().sort((a, b) => b.songs - a.songs);
  if (sort === 'long') hit = hit.slice().sort((a, b) => b.dur - a.dur);
  $('#homecount').textContent = hit.length + t(' 場直播');
  $('#cards').innerHTML = hit.slice(0, shown).map(card).join('');
  $('#more').hidden = hit.length <= shown;
  document.querySelectorAll('#chips a').forEach((a) => a.classList.toggle('on', a.dataset.c === cat));
}

// One stream: player, time line, songs, busy moments, transcript.
const poster = (s) => s && s.y ? '<img alt="" src="' + thumb(s.y, 1) + '">' + pb('big', s.y, 0, '▶', s.t) : t('<div class="none">主頻道沒有這場的存檔</div>');
function songRow(s, x, i) {
  const label = x.t + '／' + x.a;
  return '<div class="trow"><span class="no">' + (i + 1) + '</span>' + pb('pb' + (x.m ? ' muted' : ''), s.y, Math.max(x.s - 2, 0), '▶', label, x.m ? t('原直播這段被版權靜音，聽不到聲音。可以聽粉絲頻道的切片') : t('從直播的這個時間點播放')) +
    '<div class="tt"><b' + lg(x.t) + '><a href="' + U('song=' + encodeURIComponent(x.g || '')) + t('" title="這首歌每一次的演唱">') + esc(x.t) + '</a></b><span' + lg(x.a) + '>' + esc(x.a) + (x.r ? t('　點歌') : '') + (x.o ? '　' + esc(x.o) : '') + '</span></div>' +
    '<span class="tm">' + (x.m ? '🔇 ' : '') + hms(x.s) + (x.e > x.s ? '　' + hms(x.e - x.s) : '') + '</span>' + clip(x, label) + '</div>';
}
async function drawStream(key) {
  const s = byKey[key];
  if (!s) { go('home'); return; }
  cur = s;
  document.title = s.t + '｜' + SITE;
  const mine = songsOf[key] || [];
  let fights = [], board = [], tales = [];
  const pos = (t) => (100 * Math.min(t, s.dur) / s.dur).toFixed(2) + '%';
  const tl = (hl) => !s.y ? '' : '<div class="tl">' + mine.map((x) => '<button type="button"' + (x.m ? ' class="muted"' : '') + ' style="left:' + pos(x.s) + ';width:' + pos(Math.max(x.e - x.s, 0)) + '" title="' + esc(hms(x.s) + ' ' + x.t) + '" data-id="' + esc(s.y) + '" data-s="' + x.s + '" data-label="' + esc(x.t) + '"></button>').join('') +
    hl.map((h) => '<button type="button" class="hot" style="left:' + pos(h.s) + '" title="' + hms(h.s) + t(' 聊天室') + kindName(h.k) + '" data-id="' + esc(s.y) + '" data-s="' + h.s + '" data-label="' + esc(s.t) + '"></button>').join('') +
    '</div><div class="tlab"><span>0:00</span><span>' + hms(s.dur / 2) + '</span><span>' + hms(s.dur) + '</span></div>';
  const head = (hl) => '<div class="shead">' + (s.y ? '<div class="back" style="background-image:url(' + thumb(s.y, 1) + ')"></div>' : '') + '<div class="in"><div><div id="stage">' + poster(s) + '</div>' + tl(hl) + '</div><div class="info">' +
    '<p class="kicker">' + (s.cs || [s.c]).map((c) => '<a href="' + U('c=' + encodeURIComponent(c)) + '">' + dot(c) + esc(t(c)) + '</a>').join('　') + '　' + date(s.d) + gamesOf(s).map((g) => '　<a href="' + U('game=' + encodeURIComponent(g.g)) + '"' + lg(gname(g)) + '>' + esc(gname(g)) + '</a>').join('') + '</p><h1' + lg(s.t) + '>' + esc(s.t) + '</h1>' +
    t('<div class="sub">長度 ') + hms(s.dur) + (mine.length ? '　' + mine.length + t(' 首歌') : '') + (s.bk ? '<br><span class="fanchip">' + t('備份頻道') + '</span> ' + t('琉璃的頻道沒有這場的存檔，播放的是備份頻道「琉星芭樂騎士直播補檔」的影片') : '') + '</div>' +
    '<div class="acts">' + pb('btn go', s.y, 0, t('▶　從頭播放'), s.t) + (s.y ? '<a class="btn" target="_blank" rel="noopener" href="https://youtu.be/' + encodeURIComponent(s.y) + '">YouTube ↗</a>' : '') + t('<button type="button" class="btn" id="share">分享連結</button></div></div></div></div>') +
    '<div class="tabs">' + (mine.length ? t('<a href="#" data-go="a-songs">歌曲 ') + mine.length + '</a>' : '') + (fights.length ? t('<a href="#" data-go="a-boss">里程碑 ') + fights.length + '</a>' : '') + (tales.length ? t('<a href="#" data-go="a-story">故事 ') + tales.length + '</a>' : '') + (board.length ? t('<a href="#" data-go="a-score">琉璃跑跑 ') + board.length + '</a>' : '') + (hl.length ? t('<a href="#" data-go="a-hl">精選時刻 ') + hl.length + '</a>' : '') + (s.seg ? t('<a href="#" data-go="a-tr">逐字稿</a>') : '') + t('<a href="#" data-go="a-more">其他直播</a></div>');
  let body = '';
  if (mine.length) body += (s.bk ? t('<h3 id="a-songs">歌曲</h3><p class="count">播放鍵連到備份頻道的直播存檔，從那首歌開始。<span class="fannote">「切片」是粉絲頻道「琉星播放器」的影片，不是琉璃頻道的影片。</span></p><div class="tracks cols">') : t('<h3 id="a-songs">歌曲</h3><p class="count">播放鍵連回琉璃頻道的原直播，從那首歌開始。<span class="fannote">「切片」是粉絲頻道「琉星播放器」的影片，不是琉璃頻道的影片。</span></p><div class="tracks cols">')) + mine.map((x, i) => songRow(s, x, i)).join('') + '</div>';
  const at = streams.indexOf(s);
  const others = streams.filter((o) => inCat(o, s.c) && o.k !== key && o.y).sort((a, b) => Math.abs(streams.indexOf(a) - at) - Math.abs(streams.indexOf(b) - at));
  const tail = others.length ? t('<h3 id="a-more">同分類的其他直播</h3><div class="shelf">') + others.slice(0, 8).map((o) => card(o, 99)).join('') + '</div>' : '';
  show('stream');
  $('#v-stream').innerHTML = head([]) + body + (s.seg || s.hl ? t('<p class="count">讀取中</p>') : '') + tail;
  window.scrollTo(0, 0);
  fights = (await loadBosses()).filter((b) => b.k === key).sort((a, b) => a.s - b.s);
  const freedAll = (await loadRescues()).filter((r) => r.k === key);
  const ends = (await loadEndings()).filter((r) => r.k === key);
  const qs = (await loadQuests()).filter((r) => r.k === key);
  const freed = freedAll.filter((r) => !r.all);
  if (cur !== s) return;
  // the grubs / fleas freed in this stream: one line at the end of the 里程碑 box, a button a rescue
  const freedRow = freed.length ? '<div class="seg"><span class="t"></span><span><b>' + t(freed[0].c === '跳蚤' ? '救了 {n} 隻跳蚤' : '救了 {n} 隻毛毛蟲').replace('{n}', freed.length) + '</b>　' +
    freed.map((r) => pb('pill', s.y, Math.max(r.s - 5, 0), hms(r.s), t('救' + r.c) + '（' + s.t + '）')).join(' ') + '</span></div>' : '';
  const doneRow = freedAll.filter((r) => r.all).map((r) => '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('全部救完') + '（' + s.t + '）') + '<span><b>' + t(r.c === '跳蚤' ? '跳蚤全部救完' : '毛毛蟲全部救完') + '</b><i class="covtag">' + t('全部救完') + '</i></span></div>').join('');
  // the endings reached for the first time in this stream, one line each
  const endRows = ends.map((r) => '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('結局') + '（' + s.t + '）') + '<span><b>' + endName(r) + '</b><i class="covtag">' + t('新結局') + '</i></span></div>').join('');
  const questRows = qs.map((r) => '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), t('任務') + '（' + s.t + '）') + '<span><b>' + questName(r) + '</b><i class="covtag">' + t('完成任務') + '</i></span></div>').join('');
  const hog = fights.filter(tierOf), plain = fights.filter((b) => !tierOf(b));
  const hogBlock = hog.length ? '<div class="seg"><span class="t"></span><span class="sub">' + t('神居單獨挑戰') + '　' + new Set(hog.map(baseName)).size + t(' 個 boss') + '・' + hog.reduce((a, b) => a + b.x, 0) + t(' 次') + '</span></div>' + hogRows(hog, () => s) : '';
  if (fights.length || freedAll.length || ends.length || qs.length) body += t('<h3 id="a-boss">里程碑') + (fights.length && fights[0].p && fights[0].p !== '一周目' ? ' <span class="count">' + t(fights[0].p) + '</span>' : '') + '</h3><div class="box">' + plain.map((b) => bossRow(s, b)).join('') + hogBlock + freedRow + doneRow + questRows + endRows + '</div>';
  if (hog.length) fights = plain.concat([...new Set(hog.map(baseName))]);   // the tab counts a boss of the Hall of Gods once
  if (freedAll.length && !fights.length) fights = freedAll;   // so that the tab shows
  if (ends.length && !fights.length) fights = ends;
  if (qs.length && !fights.length) fights = qs;
  // the ghost stories told in this stream (the 和風恐怖故事 streams): one line each, a button from where it starts
  tales = (await loadStories()).filter((r) => r.k === key);
  if (cur !== s) return;
  if (tales.length) body += t('<h3 id="a-story">故事</h3><p class="count">這場講的每一則故事。故事名和大意是我們整理的，點時間從故事開頭播。</p><div class="box">') +
    tales.map((r) => '<div class="seg">' + pb('t', s.y, Math.max(r.s - 3, 0), hms(r.s), r.n + '（' + s.t + '）') + '<span><b' + lg(r.n) + '>' + esc(r.n) + '</b>' + (r.x ? '<i class="covtag">' + esc(t(r.x)) + '</i>' : '') +
      ' <span class="sub">' + Math.max(1, Math.round((r.e - r.s) / 60)) + t(' 分鐘') + '</span><br><span class="sub"' + lg(r.m) + '>' + esc(r.m) + '</span></span></div>').join('') + '</div>';
  // 琉璃跑跑 played in this stream: each viewer's best score as reported in the chat (data/scores.json, best first)
  board = (await loadScores()).filter((r) => r.k === key);
  if (cur !== s) return;
  if (board.length) body += t('<h3 id="a-score">琉璃跑跑 聊天室的分數</h3><p class="count">聊天室回報的最高分，每人一個。點時間可以看到回報的那一刻。</p><div class="box">') +
    board.map((r, i) => '<div class="seg">' + pb('t', s.y, Math.max(r.s - 5, 0), hms(r.s), s.t) + '<span><b>' + (i + 1) + '. ' + esc(r.n) + '</b>　' + r.v + t(' 分') + '</span></div>').join('') + '</div>';
  if (!s.seg && !s.hl) { $('#v-stream').innerHTML = head([]) + body + tail; return; }
  const d = (await month(mkey(s)))[key];
  if (cur !== s || !d) return;
  if (d.hl.length) body += t('<h3 id="a-hl">聊天室有反應的時刻</h3><div class="box">') + d.hl.map((h) => '<div class="seg">' + pb('t', s.y, h.s, hms(h.s), s.t) + '<span>' + (h.c ? '<b>' + esc(h.c) + '</b>' + (h.t ? '<br><span class="sub">' + esc(h.t) + '</span>' : '') : esc(h.t) + t(' <span class="fanchip">未審，不公開</span>')) + ' <span class="sub">' + h.a + t(' 人') + kindName(h.k) + '</span></span></div>').join('') + '</div>';
  if (!d.seg.length) { $('#v-stream').innerHTML = head(d.hl) + body + tail; return; }   // the public site carries no full transcript
  body += t('<h3 id="a-tr">逐字稿</h3><input id="trq" class="field" type="search" placeholder="在這場裡找一句話"><p class="count" id="trn"></p><div id="tr"></div>');
  $('#v-stream').innerHTML = head(d.hl) + body + tail;
  const lines = () => {
    const q = $('#trq').value.trim();
    const hit = q ? d.seg.filter((g) => g[1].includes(q)) : d.seg;
    $('#trn').textContent = q ? t('找到 ') + hit.length + t(' 句') : t('共 ') + d.seg.length + t(' 句，語音辨識產生，可能有錯字。點時間可以從那一句開始播。');
    $('#tr').innerHTML = hit.map((g) => '<div class="seg">' + pb('t', s.y, g[0], hms(g[0]), s.t) + '<span>' + (q ? esc(g[1]).split(esc(q)).join('<mark>' + esc(q) + '</mark>') : esc(g[1])) + '</span></div>').join('');
  };
  $('#trq').addEventListener('input', lines);
  lines();
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { e.preventDefault(); const el = document.getElementById(go.dataset.go); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
  if (e.target.id === 'share') {
    const b = e.target, done = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = t('分享連結'); }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => done(t('已複製連結')), () => done(t('請複製網址列')));
    else done(t('請複製網址列'));
  }
});

// The badges of the game. Whoever has won one (the starry snail at 600 points, the rainbow snail at 700; the starry one also for
// those who won it when it was lower) can choose the picture at the top left: Ruri, or a snail they own. With a snail the name
// beside it reads 星ノ海蝸牛. A press on the picture opens the choice. The game sets the choice to the badge just won.
// Done again whenever the page is shown: coming back from the game with the back button, the browser may put the page back as it
// was, without running this file again.
const FACES = { ruri: ['/img/avatar.webp', '琉璃'], star: ['/runner/snail-star.png', '星空蝸牛'], rainbow: ['/runner/snail-rainbow.png', '彩虹蝸牛'] };
function ownedFaces() {
  const g = (k) => localStorage.getItem(k), hi = +g('runner-hi') || 0, o = ['ruri'];
  if (hi >= 600 || g('runner-badge-star') || g('runner-badge')) o.push('star');
  if (hi >= 700 || g('runner-badge-rainbow')) o.push('rainbow');
  return o;
}
function showBadge() {
  try {
    const own = ownedFaces(), av = document.querySelector('.ava'), nm = document.querySelector('.brand b');
    if (!av || own.length < 2) return;
    let face = localStorage.getItem('runner-face');
    if (!own.includes(face)) face = own[own.length - 1];            // nothing chosen yet: the best badge
    if (av.getAttribute('src') !== FACES[face][0]) av.src = FACES[face][0];
    av.style.imageRendering = face === 'ruri' ? '' : 'pixelated';
    av.classList.add('pick'); av.title = t('換頭像');
    if (nm) nm.textContent = t(face === 'ruri' ? '星ノ海琉璃' : '星ノ海蝸牛');
  } catch (e) {}
}
showBadge();
addEventListener('pageshow', showBadge);
{
  const av = document.querySelector('.ava');
  const shut = () => { const m = $('#facepick'); if (m) m.remove(); };
  if (av) av.addEventListener('click', (e) => {
    let own = ['ruri'];
    try { own = ownedFaces(); } catch (err) {}
    if (own.length < 2) return;                                     // no badge: the picture is the link to the front page, as before
    e.preventDefault(); e.stopPropagation();
    if ($('#facepick')) return shut();
    const m = document.createElement('div');
    m.id = 'facepick';
    m.innerHTML = own.map((k) => '<button type="button" data-face="' + k + '"><img src="' + FACES[k][0] + '" alt="" width="44" height="44"' + (k === 'ruri' ? '' : ' style="image-rendering:pixelated"') + '><span>' + esc(t(FACES[k][1])) + '</span></button>').join('');
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      ev.preventDefault(); ev.stopPropagation();
      try { localStorage.setItem('runner-face', b.dataset.face); } catch (err) {}
      shut(); showBadge();
    });
    av.closest('.brand').after(m);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#facepick')) shut(); });
}
// In the light theme, pointing at the snail turns the page to the night sky, slowly, and leaving it brings the day back: the game
// is always played at night. Nothing is saved, the theme the visitor chose stays the chosen one.
{
  const root = document.documentElement, sn = $('#snail');
  let off = 0, lit = false;
  // The night comes slowly (2.2 s), the day comes back a little faster (1.4 s).
  const fade = (sec) => { root.style.setProperty('--fd', sec + 's'); root.classList.add('fade'); clearTimeout(off); off = setTimeout(() => root.classList.remove('fade'), sec * 1000 + 200); };
  const night = () => { if (root.dataset.theme !== 'light') return; lit = true; fade(2.2); root.dataset.theme = 'dark'; };
  const day = () => { if (!lit) return; lit = false; fade(1.4); root.dataset.theme = 'light'; };
  if (sn) { sn.addEventListener('mouseenter', night); sn.addEventListener('mouseleave', day); sn.addEventListener('focus', night); sn.addEventListener('blur', day); }
  addEventListener('pageshow', day);                         // coming back from the game with the back button
}
// The snail at the bottom leads to the game, in the language of the page.
{ const sn = $('#snail'); if (sn && LANG === 'ja') sn.href = '/runner/?lang=ja'; }

// Songs. One row a song, opened to see every time it was sung.
// Her own cover videos (full ones and Shorts), found by the song name in the title ("X cover by ..." or the first #tag),
// so that a song she also released as a cover shows it at the top of its list (user, 2026-10-15).
const songKey = (x) => (x || '').toLowerCase().replace(/稅/g, '税').replace(/\s+/g, '');
let coversOf = null;
function covers(v) {
  if (!coversOf) {
    coversOf = {};
    videos.filter((x) => x.c === 'Cover').forEach((x) => {
      const m = x.t.match(/^(.+?)\s+cover by/i) || x.t.match(/#(\S+)/);
      if (m) (coversOf[songKey(m[1])] || (coversOf[songKey(m[1])] = [])).push(x);
    });
    // her own songs: every 原創曲 video whose title names the song (the MV first), user 2026-10-15
    const own = new Set(songs.filter((x) => x.a === '星ノ海琉璃').map((x) => x.t));
    own.forEach((n) => {
      const vs = videos.filter((x) => x.c === '原創曲' && x.t.includes(n));
      vs.sort((p, q) => /Music Video/i.test(q.t) - /Music Video/i.test(p.t) || (p.kind === 's') - (q.kind === 's') || (p.d || '').localeCompare(q.d || ''));
      if (vs.length) coversOf[songKey(n)] = vs.map((x) => Object.assign({ own: 1 }, x));
    });
  }
  return coversOf[songKey(v[0].g)] || coversOf[songKey(v[0].t)] || [];
}
const ownLabel = (x) => x.kind === 's' ? t('短影音') : /Music Video/i.test(x.t) ? 'MV' : (x.t.match(/【([^】]+)】/) || [0, t('其他影片')])[1];
const coverRow = (v) => { const c = covers(v); return c.length ? '<div class="perf coverrow"><time>' + (c[0].own ? t('原創曲影片') : t('Cover 影片')) + '</time><span class="covs">' +
  c.map((x) => pb('pill cov', x.y, 0, x.own ? ownLabel(x) : x.kind === 's' ? t('短影音') : t('完整版'), x.t)).join('') + '</span></div>' : ''; };
// The cover videos and the original song's MV, newest first, at the top of the songs page.
function drawCoverShelf() {
  if (!$('#songcovers')) return;
  const by = (c) => videos.filter((v) => v.c === c && v.kind !== 's').sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  const list = by('Cover');
  // her own songs first (user 2026-10-21): the MV and the other videos of the song, the full ones then the Shorts; a title
  // on the home carousel is one of them, so the home no longer has a button of its own for the MV
  // one card a song, to the song's own page (user 2026-10-21), the newest song first
  const own = originals.slice().sort((a, b) => b.d.localeCompare(a.d)).map((o) => '<a class="card" href="' + U('song=' + encodeURIComponent(o.t)) + '"><div class="thumb"><img alt="" src="' + thumb(o.y) + '"></div><div class="ctitle"' + lg(o.t) + '>' + esc(o.t) + '</div><div class="cline">' + t('原創曲') + '　' + date(o.d) + '</div></a>');
  const head = (h, more) => '<div class="shelfhead"><h2>' + t(h) + '</h2>' + (more ? '<a href="' + U('videos') + '">' + t('所有影片') + '</a>' : '') + '</div>';
  $('#songcovers').innerHTML = (own.length ? head('原創曲') + '<div class="shelf">' + own.join('') + '</div>' : '') +
    (list.length ? head('Cover 作品', true) + '<div class="shelf">' + list.map(vcard).join('') + '</div>' : '');
}
function perf(x) {
  const st = byKey[x.k] || {}, label = x.t + '／' + x.a + '（' + date(x.d) + '）';
  return '<div class="perf"><time>' + date(x.d) + (x.r ? '<small class="pnote">' + t('點歌') + '</small>' : '') + (x.o ? '<small class="pnote">' + esc(x.o) + '</small>' : '') + '</time>' + (st.y ? pb('pill' + (x.m ? ' muted' : ''), st.y, Math.max(x.s - 2, 0), (x.m ? '🔇 ' : '') + hms(x.s), label, x.m ? t('原直播這段被版權靜音，聽不到聲音。可以聽粉絲頻道的切片') : st.bk ? t('從備份頻道的直播存檔的這個時間點播放') : t('從琉璃頻道原直播的這個時間點播放')) : '<span></span>') + clip(x, label) +
    '<a class="pill" href="' + U('s=' + encodeURIComponent(x.k)) + (st.bk ? t('\">備份直播</a></div>') : t('\">原直播</a></div>'));
}
const songItem = (v, i, single, show) => '<details data-g="' + esc(v[0].g || '') + '"><summary' + (single ? ' class="single"' : '') + '><span class="no">' + (i + 1) + '</span>' + from(v[0], 'pb', '▶') + '<div class=\"tt\"><b' + lg(v[0].t) + '>' + esc(v[0].t) + (covers(v).length ? '<i class="covtag">' + (covers(v)[0].own ? 'MV' : 'Cover') + '</i>' : '') + '</b><span' + lg(v[0].a) + '>' + esc(v[0].a) + '</span></div>' +
  (single || show === 'date' ? '<span class="tm">' + date(v[0].d) + '</span>' : show === 'count' ? '<span class="tm">' + v.length + t(' 次') + '</span>' : '<span class="tm">' + v.length + t(' 次</span><span class="tm last">') + date(v[0].d) + '</span>') + '</summary><div class="perfs">' + coverRow(v) + '<div class="perf perfhead"><span>' + t('日期') + '</span><span>' + t('時間點') + '</span><span>' + t('切片') + '</span><span>' + t('原直播') + '</span></div>' + v.map(perf).join('') + '</div></details>';
// Her own songs have a page of their own (user 2026-10-21): the MV at the top like a stream's page, then the other
// videos of the song with its Shorts, the lyrics, the credits from the MV's description, and the times she sang it live.
function drawOriginal(o, v) {
  document.title = o.t + '｜' + SITE;
  const mv = videos.find((x) => x.y === o.y) || { y: o.y, t: o.t, dur: 0 };
  const vids = videos.filter((x) => x.c === '原創曲' && x.y !== o.y && x.t.includes(o.t)).sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  const rel = vids.filter((x) => x.kind !== 's').concat(vids.filter((x) => x.kind === 's'));     // one shelf, the full videos then the Shorts (user 2026-10-21)
  const tab = (id, label, n) => '<a href="#" data-go="' + id + '">' + t(label) + (n ? ' ' + n : '') + '</a>';
  let h = '<div class="shead"><div class="back" style="background-image:url(' + thumb(o.y, 1) + ')"></div><div class="in"><div><div id="stage"><img alt="" src="' + thumb(o.y, 1) + '">' + pb('big', o.y, 0, '▶', mv.t) + '</div></div><div class="info">' +
    '<p class="kicker"><a href="' + U('songs') + '">' + t('原創曲') + '</a>　' + date(o.d) + '</p><h1' + lg(o.t) + '>' + esc(o.t) + '</h1>' +
    '<div class="sub">星ノ海琉璃' + (mv.dur ? t('　MV 長度 ') + hms(mv.dur) : '') + (v ? '　' + t('直播唱過 ') + v.length + t(' 次') : '') + '</div>' +
    '<div class="acts">' + pb('btn go', o.y, 0, t('▶　播放 MV'), mv.t) + '<a class="btn" target="_blank" rel="noopener" href="https://youtu.be/' + encodeURIComponent(o.y) + '">YouTube ↗</a>' +
    (o.bc ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(o.bc) + '">' + t('高音質音檔 Bandcamp') + ' ↗</a>' : '') + t('<button type="button" class="btn" id="share">分享連結</button></div></div></div></div>') +
    '<div class="tabs">' + (rel.length ? tab('a-vids', '相關影片', rel.length) : '') + (o.ly ? tab('a-lyrics', '歌詞') : '') + (o.cr.length ? tab('a-credits', '製作人員') : '') + (v ? tab('a-live', '直播裡的演唱', v.length) : '') + '</div>';
  if (rel.length) h += '<h3 id="a-vids">' + t('相關影片') + '</h3><div class="shelf">' + rel.map(vcard).join('') + '</div>';
  if (o.ly) h += '<h3 id="a-lyrics">' + t('歌詞') + '</h3><div class="lyrics" lang="zh-Hant">' + o.ly.split('\n\n').map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') + '</div>';
  if (o.cr.length) h += '<h3 id="a-credits">' + t('製作人員') + '</h3><dl class="credits">' + o.cr.map(([r, n, u]) => '<dt>' + esc(t(r)) + '</dt><dd>' + (u ? '<a target="_blank" rel="noopener" href="' + esc(u) + '">' + esc(n) + '</a>' : esc(n)) + '</dd>').join('') + '</dl>';
  if (v) h += '<h3 id="a-live">' + t('直播裡的演唱') + '</h3><div class="perfs">' + '<div class="perf perfhead"><span>' + t('日期') + '</span><span>' + t('時間點') + '</span><span>' + t('切片') + '</span><span>' + t('原直播') + '</span></div>' + v.map(perf).join('') + '</div>';
  show('orig');
  $('#v-orig').innerHTML = h;
}
const originalOf = (g) => originals.find((o) => songKey(o.t) === songKey(g));
function drawSong(g) {
  const v = groups.find((x) => x[0].g === g), o = originalOf(g);
  if (o) return drawOriginal(o, v);
  if (!v) return go('songs');
  document.title = v[0].t + '｜' + SITE;
  show('songs');
  $('#songq').value = v[0].t;
  drawSongs();
  drawCoverShelf();
  const d = [...document.querySelectorAll('#songlist details')].find((el) => el.dataset.g === g);
  if (d) d.open = true;
}
// Orders of the song list. The title order is the browser's Japanese dictionary order (Intl.Collator 'ja'): the one that put
// kana, letters and Chinese titles in the most natural order on a phone (user, 2026-10-12). Kanji go by their code, not their reading.
const KANA = (() => { try { return new Intl.Collator('ja'); } catch (e) { return new Intl.Collator(); } })();
function sortRows(rows, how) {                       // rows: [[performance, ...]], the newest first inside each
  if (how === 'recent') return rows.sort((a, b) => b[0].d.localeCompare(a[0].d) || a[0].s - b[0].s);
  if (how === 'artist') return rows.sort((a, b) => KANA.compare(a[0].a, b[0].a) || KANA.compare(a[0].t, b[0].t));
  if (how === 'kana') return rows.sort((a, b) => KANA.compare(a[0].t, b[0].t) || b.length - a.length);
  return rows;                                       // by count: the order they already have
}
function drawSongs() {
  const how = $('#songsort').value;
  $('#songgroupwrap').hidden = how !== 'recent';               // one row for each time it was sung only makes sense in the order of time (user, 2026-10-12)
  const grouped = how !== 'recent' || $('#songgroup').checked;
  const q = $('#songq').value.trim().toLowerCase();
  const ok = (x) => !q || (x.t + ' ' + x.a).toLowerCase().includes(q);
  let rows;
  if (grouped) {
    rows = sortRows(groups.filter((v) => ok(v[0])), $('#songsort').value);
    $('#songcount').textContent = rows.length + t(' 首歌，共 ') + rows.reduce((n, v) => n + v.length, 0) + t(' 次演唱');
  } else {
    rows = sortRows(songs.filter(ok).reverse().map((x) => [x]), $('#songsort').value);
    $('#songcount').textContent = rows.length + t(' 次演唱');
  }
  $('#songlist').innerHTML = rows.map((v, i) => songItem(v, i, !grouped)).join('');
}

// One search for everything: stream titles, songs, then the transcripts. The transcripts are read month by month,
// which is fine for a prototype, see design/research.md.
let srchSort = 'count', srchAll = false, srchRedraw = () => {};
async function search(q) {
  srchAll = false;
  show('search');
  document.title = t('搜尋｜') + SITE;
  $('#sq').value = q;
  $('#stitle').textContent = '「' + q + t('」的搜尋結果');
  const low = q.toLowerCase();
  const st = streams.filter((s) => s.t.toLowerCase().includes(low));
  const sg = groups.filter((v) => (v[0].t + ' ' + v[0].a).toLowerCase().includes(low));
  // The songs found can be put in order; the right side shows what the order is about: the count for "times sung", the date for the others.
  const songShelf = () => {
    const rows = sortRows(sg.slice(), srchSort), more = !srchAll && rows.length > 8;
    return rows.slice(0, srchAll ? rows.length : 8).map((v, i) => songItem(v, i, false, srchSort === 'count' ? 'count' : 'date')).join('') +
      (more ? '<p class="sub"><a href="#" id="songmore">' + t('查看全部') + '</a></p>' : '');
  };
  const sortOpts = [['count', '排序：唱過次數'], ['recent', '排序：最近唱的'], ['kana', '排序：歌名'], ['artist', '排序：原唱']].map(([k, n]) => '<option value="' + k + '"' + (k === srchSort ? ' selected' : '') + '>' + esc(t(n)) + '</option>').join('');
  let top = '';
  if (sg.length) top += '<div class="shelfhead"><h2>' + t('歌曲') + '</h2><span class="count">' + sg.length + t(' 首') + (sg.length > 1 ? '　<select id="srchsort" class="field">' + sortOpts + '</select>' : '') + '</span></div><div class="tracks" id="srchsongs">' + songShelf() + '</div>';
  srchRedraw = () => { const el = $('#srchsongs'); if (el) el.innerHTML = songShelf(); };
  const gm = games.filter((g) => g.g !== 'other' && (g.n + ' ' + g.j).toLowerCase().includes(low));
  if (gm.length) top += '<div class="shelfhead"><h2>' + t('遊戲') + '</h2><span class="count">' + gm.length + t(' 款') + '</span></div><div class="shelf">' + gm.slice(0, 12).map(gcard).join('') + '</div>';
  const vd = videos.filter((v) => v.t.toLowerCase().includes(low));
  if (vd.length) top += '<div class="shelfhead"><h2>' + t('影片與 Shorts') + '</h2><span class="count">' + vd.length + t(' 支') + '</span></div><div class="shelf">' + vd.slice(0, 12).map((v) => vcard(v, 99)).join('') + '</div>';
  if (st.length) top += t('<div class="shelfhead"><h2>直播</h2><span class="count">') + st.length + t(' 場</span></div><div class="shelf">') + st.slice(0, 12).map((s) => card(s, 99)).join('') + '</div>';
  if (!streams.some((x) => x.seg)) { $('#sres').innerHTML = top || t('<p class="count">沒有找到。</p>'); return; }
  const out = (n, html, note) => { $('#sres').innerHTML = top + t('<div class="shelfhead"><h2>琉璃說過的話</h2><span class="count">') + note + '</span></div>' + (html || (n === null ? '' : t('<p class="count">逐字稿裡沒有找到。</p>')));
    srchRedraw(); const sel = $('#srchsort'); if (sel) sel.value = srchSort; };
  if (q.length < 2) return out(null, '', t('至少要兩個字'));
  out(null, '', t('搜尋中'));
  const ms = [...new Set(streams.filter((s) => s.seg).map(mkey))];
  let n = 0, html = '';
  for (const m of ms) {
    const d = await month(m);
    if ($('#sq').value !== q) return;
    for (const s of streams) {
      if (!d[s.k]) continue;
      const hit = d[s.k].seg.filter((g) => g[1].includes(q));
      if (!hit.length) continue;
      n += hit.length;
      html += '<div class="box"><a href="' + link(s) + '">' + esc(s.t) + '</a><div class="sub">' + dot(s.c) + esc(t(s.c)) + '　' + date(s.d) + '　' + hit.length + t(' 處</div>') +
        hit.slice(0, 20).map((g) => '<div class="seg">' + pb('t', s.y, Math.max(g[0] - 3, 0), hms(g[0]), s.t) + '<span>' + esc(g[1]).split(esc(q)).join('<mark>' + esc(q) + '</mark>') + '</span></div>').join('') +
        (hit.length > 20 ? t('<p class="sub">這場還有 ') + (hit.length - 20) + t(' 處，進這場的頁面可以看全部</p>') : '') + '</div>';
    }
    out(n, html, n + t(' 處') + (ms.indexOf(m) + 1 < ms.length ? t('，已查 ') + (ms.indexOf(m) + 1) + ' / ' + ms.length + t(' 個月') : ''));
  }
}

// The picked moments, sorted and filtered by what the visitor chooses. They are all loaded first (a few small files
// on the public site), then listed, so that "random" does not reshuffle while the months come in.
const hlbox = ([s, h]) => '<div class="box"><div class="seg">' + pb('t', s.y, h.s, hms(h.s), s.t) + '<span>' + (h.c ? '<b>' + esc(h.c) + '</b>' + (h.t ? '<br><span class="sub">' + esc(h.t) + '</span>' : '') : esc(h.t) + t(' <span class="fanchip">未審，不公開</span>')) + '</span></div>' +
      '<div class="sub">' + dot(s.c) + esc(t(s.c)) + '　' + date(s.d) + '　<a href="' + link(s) + '">' + esc(s.t.slice(0, 44)) + '</a>　' + h.a + t(' 人') + kindName(h.k) + '</div></div>';
function kindName(k) { return t(k === '驚' ? '嚇到' : k === '指' ? '一起指路' : k === '勝' ? '一起慶祝過關' : k === '答' ? '一起回答' : '笑了'); }   // 答: several viewers sending the same answer to her question (2026-10-15)   // 指: viewers pointing the way in a game, 勝: cheering a win (2026-10-14)
let hlAll = null, hlSort = 'new', hlCat = '', hlGame = '', hlKind = '';   // hlKind: the kind of reaction (笑, 驚, 指 or 勝)
function renderHl() {
  const list = hlAll.filter(([s, h]) => (!hlCat || inCat(s, hlCat)) && (!hlGame || (s.gms || [s.gm]).includes(hlGame)) && (!hlKind || h.k === hlKind));
  const by = {
    new: (a, b) => b[0].d.localeCompare(a[0].d) || a[1].s - b[1].s,
    old: (a, b) => a[0].d.localeCompare(b[0].d) || a[1].s - b[1].s,
    top: (a, b) => b[1].a - a[1].a || b[0].d.localeCompare(a[0].d),
  };
  if (hlSort === 'rand') list.sort(() => Math.random() - .5); else list.sort(by[hlSort]);
  $('#hlcount').textContent = list.length + t(' 個時刻');
  $('#hllist').innerHTML = list.map(hlbox).join('');
}
// Every picked moment as [stream, moment], from one small file (the month files are the fallback).
let momentPairs = null;
// The boss fights of the Hollow Knight / Silksong streams (data/bosses.json, checked by hand): who she fought in a stream,
// about how many tries (the times the boss music started again), and where the try that won begins.
let bossList = null;
let scoreList = null;
const loadScores = () => scoreList || (scoreList = get('scores.json').catch(() => []));
const loadBosses = () => bossList || (bossList = get('bosses.json').catch(() => []));
const bname = (b) => (LANG === 'ja' && b.j ? b.j : b.n);
const tierOf = (b) => (b.n.match(/（(調諧|晉升|輻輝)）$/) || [])[1];      // a single fight in Godhome's Hall of Gods, at that tier
const bkind = (b) => (/^競技場/.test(b.n) ? '競技場' : /門（/.test(b.n) ? '神居' : tierOf(b) ? '單獨挑戰' : 'Boss');
const baseName = (b) => bname(b).replace(/（[^（）]+）$/, '');
const tierName = (b) => (bname(b).match(/（([^（）]+)）$/) || [])[1] || '';
// The Hall of Gods fights, one line a boss (there can be a hundred in a stream, user 2026-10-18): a button a tier with how
// many tries, to the first try at that tier, and the first win at a tier where she earned its mark
function hogRows(list, sOf, withStream) {
  const by = new Map();
  list.forEach((b) => { const n = baseName(b); if (!by.has(n)) by.set(n, []); by.get(n).push(b); });
  return [...by].map(([n, v]) => {
    const tiers = new Map();
    v.forEach((b) => { const k = tierName(b); if (!tiers.has(k)) tiers.set(k, []); tiers.get(k).push(b); });
    const parts = [...tiers].map(([tn, bs]) => {
      const x = bs.reduce((a, b) => a + b.x, 0), s0 = sOf(bs[0]), win = bs.find((b) => b.w);
      return pb('pill', s0.y, Math.max(bs[0].s - 2, 0), esc(tn) + ' ' + x + t(' 次'), n + '（' + s0.t + '）') +
        (win ? ' ' + pb('pill', sOf(win).y, Math.max(win.w - 2, 0), esc(tn) + t(' 第一次打過') + (withStream ? '' : ' ' + hms(win.w)), n + '（' + sOf(win).t + '）') : '');
    });
    return '<div class="seg"><span class="t"></span><span><b' + lg(n) + '>' + esc(n) + '</b>　' + parts.join(' ') + '</span></div>';
  }).join('');
}
function bossRow(s, b, withStream) {
  const label = bname(b) + '（' + s.t + '）';
  // her first meeting / first win of the boss in 一周目 (f / fw, worked out in build.py); a trial or a pantheon is "challenged" and "cleared"
  const boss = bkind(b) === 'Boss';
  const firsts = (b.f ? '<i class="covtag">' + t(boss ? '第一次遇到' : '第一次挑戰') + '</i>' : '') + (b.fw ? '<i class="covtag">' + t(boss ? '第一次打過' : '第一次通過') + '</i>' : '');
  return '<div class="seg">' + pb('t', s.y, b.s, hms(b.s), label) + '<span><b' + lg(bname(b)) + '>' + esc(bname(b)) + '</b>' + firsts + '　<span class="sub">' + (b.x > 1 ? t('挑戰約 {n} 次').replace('{n}', b.x) : t('挑戰 1 次')) + '</span>' +
    (b.w ? '　' + pb('pill', s.y, Math.max(b.w - 2, 0), t('打贏的那次 ') + hms(b.w), label) : '') +
    (withStream ? '<br><a class="sub" href="' + U('s=' + encodeURIComponent(s.k)) + '"' + lg(s.t) + '>' + date(s.d) + '　' + esc(s.t) + '</a>' : '') + '</span></div>';
}

function loadMoments() {
  if (!momentPairs) {
    momentPairs = get('moments.json').then((a) => a.map((h) => [byKey[h.sk], h]).filter(([s]) => s)).catch(async () => {
      const all = [];
      for (const m of [...new Set(streams.filter((s) => s.hl).map(mkey))]) {
        const d = await month(m);
        streams.forEach((s) => (d[s.k] ? d[s.k].hl : []).forEach((h) => all.push([s, h])));
      }
      return all;
    });
  }
  return momentPairs;
}
async function drawHl() {
  if (hlAll) return renderHl();
  $('#hlcount').textContent = t('讀取中');
  hlAll = await loadMoments();
  const cs = [...new Set(hlAll.flatMap(([s]) => s.cs || [s.c]))];
  cs.forEach((c) => $('#hlcat').insertAdjacentHTML('beforeend', '<option value="' + esc(c) + '">' + esc(t(c)) + '</option>'));
  // Only the games that have a picked moment, the most of them first.
  const n = {};
  hlAll.forEach(([s]) => (s.gms || [s.gm]).forEach((id) => { if (id && id !== 'other') n[id] = (n[id] || 0) + 1; }));
  Object.keys(n).sort((a, b) => n[b] - n[a]).forEach((id) => {
    const g = games.find((x) => x.g === id);
    if (g) $('#hlgame').insertAdjacentHTML('beforeend', '<option value="' + esc(id) + '">' + esc(gname(g)) + ' · ' + n[id] + '</option>');
  });
  renderHl();
}
$('#hlsort').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !hlAll) return;
  hlSort = b.dataset.sort;
  document.querySelectorAll('#hlsort button').forEach((x) => x.classList.toggle('on', x === b));
  renderHl();                                     // pressing "random" again shuffles again
});
// The choice of game only exists while the category is the games (user, 2026-10-12), and is cleared when it is left.
$('#hlkind').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !hlAll) return;
  hlKind = b.dataset.kind;
  document.querySelectorAll('#hlkind button').forEach((x) => x.classList.toggle('on', x === b));
  renderHl();
});
$('#hlcat').addEventListener('change', () => {
  hlCat = $('#hlcat').value;
  $('#hlgame').hidden = hlCat !== '遊戲';
  if (hlCat !== '遊戲') { hlGame = ''; $('#hlgame').value = ''; }
  if (hlAll) renderHl();
});
$('#hlgame').addEventListener('change', () => { hlGame = $('#hlgame').value; if (hlAll) renderHl(); });

// Section ids carry a v- so that the address (#home, #songs) never makes the browser jump to one.
function show(name) {
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== 'v-' + name; });
  document.querySelectorAll('#top nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (name === 'game' ? 'games' : name === 'orig' ? 'songs' : name)));
  if (name !== 'stream') cur = null;
}
const SITE = t('星ノ海琉璃 直播資料庫');
function where() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!REAL) return h;
  const p = decodeURIComponent(location.pathname).split('/');
  if (p[1] === 'ja') p.splice(1, 1);
  if (p[1] === 's' && p[2]) return 's=' + p[2];
  if (p[1] === 'song' && p[2]) return 'song=' + p[2];
  if (p[1] === 'streams') return h.startsWith('c=') ? h : 'browse';
  if (p[1] === 'songs') return 'songs';
  if (p[1] === 'moments') return 'hl';
  if (p[1] === 'about') return 'about';
  if (p[1] === 'videos') return 'videos';
  if (p[1] === 'fanart') return 'fanart';
  if (p[1] === 'games') return 'games';
  if (p[1] === 'game' && p[2]) return 'game=' + p[2];
  if (p[1] === 'search') return h.startsWith('q=') ? h : 'q=';
  if (/^(s|c|q|song|game)=|^(songs|hl|browse|about|videos|games|fanart)$/.test(h)) { history.replaceState(null, '', U(h.replace(/=(.*)/, (m, v) => '=' + encodeURIComponent(v)))); return h; }   // an address from before the pages had their own
  if (p[1] && p[1] !== 'index.html') history.replaceState(null, '', P + '/');   // an address that does not exist
  return 'home';
}
function route() {
  const h = where();
  const sw = $('#langsw');
  if (sw && REAL) sw.href = (LANG === 'ja' ? location.pathname.replace(/^\/ja/, '') || '/' : '/ja' + location.pathname) + location.hash;
  document.title = SITE;
  if (h.startsWith('s=')) return drawStream(h.slice(2));
  if (h.startsWith('q=')) return search(h.slice(2));
  window.scrollTo(0, 0);
  if (h.startsWith('song=')) return drawSong(h.slice(5));
  if (h === 'songs') { document.title = t('唱過的歌｜') + SITE; $('#songq').value = ''; drawSongs(); drawCoverShelf(); return show('songs'); }
  if (h === 'hl') { document.title = t('精選時刻｜') + SITE; show('hl'); return drawHl(); }
  if (h.startsWith('game=')) return drawGame(h.slice(5));
  if (h === 'games') { document.title = t('玩過的遊戲｜') + SITE; show('games'); return drawGames(); }
  if (h === 'videos') { document.title = t('影片與 Shorts｜') + SITE; show('videos'); return drawVideos(); }
  if (h === 'fanart') { document.title = t('Fan art｜') + SITE; show('fanart'); return drawFanart(); }
  if (h === 'about') { document.title = t('角色設定｜') + SITE; return show('about'); }
  if (h === 'browse' || h.startsWith('c=')) { cat = h.startsWith('c=') ? h.slice(2) : ''; shown = 24; document.title = (cat ? t(cat) : t('所有直播')) + '｜' + SITE; show('browse'); return drawBrowse(); }
  show('home');
}
// On the web a link to another page of the site changes the address and the view without loading the page again,
// so that whatever is playing keeps playing.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || !REAL || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const u = a.getAttribute('href');
  if (!u.startsWith('/') || u.startsWith('//') || a.id === 'langsw' || a.id === 'snail' || u.startsWith('/img/') || u.startsWith('/runner/') || /^(\/ja)?\/(credits|privacy|legal)\//.test(u)) return;   // pages of their own, outside the app   // the other language is another set of pages
  e.preventDefault();
  history.pushState(null, '', u);
  route();
});
window.addEventListener('popstate', route);

// Random picks. A song: not one of the last 30 picks. It plays from Ruri's own stream when that is possible.
const recent = [];
document.querySelectorAll('.randsong').forEach((b) => b.addEventListener('click', () => {
  const pool = songs.filter((x) => (((byKey[x.k] || {}).y && !x.m) || x.c) && !recent.includes(x));
  if (!pool.length) return;
  const x = pool[Math.floor(Math.random() * pool.length)], st = byKey[x.k] || {}, label = x.t + '／' + x.a + '（' + date(x.d) + '）';
  recent.push(x);
  if (recent.length > 30) recent.shift();
  if (st.y && !x.m) play(st.y, Math.max(x.s - 2, 0), label); else play(x.c, 0, label, true);    // a muted performance plays from the clip
}));
$('#reroll').addEventListener('click', drawRandoms);
$('#rehl').addEventListener('click', drawHomeHl);
$('#theme').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('theme', document.documentElement.dataset.theme); } catch (e) { /* private window */ }
});
$('#songq').addEventListener('input', drawSongs);
$('#songgroup').addEventListener('change', drawSongs);
$('#songsort').addEventListener('change', drawSongs);
document.addEventListener('change', (e) => { if (e.target.id === 'srchsort') { srchSort = e.target.value; srchRedraw(); } });
document.addEventListener('click', (e) => { if (e.target.id === 'songmore') { e.preventDefault(); srchAll = true; srchRedraw(); } });
['#hq', '#year', '#sort'].forEach((s) => $(s).addEventListener('input', () => { shown = 24; drawBrowse(); }));
$('#more').addEventListener('click', () => { shown += 24; drawBrowse(); });
$('#vchips').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-vc]');
  if (!a) return;
  e.preventDefault();
  vcat = a.dataset.vc; sshown = 24; drawVideos();
});
$('#smore').addEventListener('click', () => { sshown += 24; drawVideos(); });
$('#sf').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#sq').value.trim(); if (q) go('q=' + encodeURIComponent(q)); });
window.addEventListener('hashchange', route);

Promise.all([get('streams.json'), get('songs.json'), get('meta.json'), get('videos.json').catch(() => []), get('games.json').catch(() => []), get('originals.json').catch(() => [])]).then(([a, b, m, vs, gs, os]) => {
  streams = a; songs = b; videos = vs || []; games = gs || []; originals = os || [];
  streams.forEach((s) => { byKey[s.k] = s; });
  songs.forEach((x) => { (songsOf[x.k] || (songsOf[x.k] = [])).push(x); });
  Object.values(songsOf).forEach((v) => v.sort((p, q) => p.s - q.s));
  // The same song sung on different days is one group, newest first. Groups are ordered by how often it was sung.
  const g = new Map();
  songs.forEach((x) => { const k = x.g || x.t.toLowerCase(); (g.get(k) || g.set(k, []).get(k)).push(x); });
  groups = [...g.values()].map((v) => v.slice().sort((p, q) => q.d.localeCompare(p.d))).sort((p, q) => q.length - p.length || p[0].t.localeCompare(q[0].t, 'zh-Hant'));
  const n = {};
  streams.forEach((s) => (s.cs || [s.c]).forEach((c) => { n[c] = (n[c] || 0) + 1; }));
  cats = Object.keys(n).sort((p, q) => (p === '其他') - (q === '其他') || n[q] - n[p]);
  $('#chips').innerHTML = '<a data-c="" href="' + U('browse') + t('">全部<i>') + streams.length + '</i></a>' + cats.map((c) => '<a data-c="' + esc(c) + '" href="' + U('c=' + encodeURIComponent(c)) + '\">' + dot(c) + esc(t(c)) + '<i>' + n[c] + '</i></a>').join('');
  [...new Set(streams.map((s) => s.d.slice(0, 4)).filter(Boolean))].sort().reverse().forEach((y) => $('#year').insertAdjacentHTML('beforeend', '<option>' + y + '</option>'));
  $('#dtime').textContent = t('資料更新於 ') + m.built;
  // A visitor whose browser is set to Japanese is told once that there is a Japanese version. Nobody is sent
  // there automatically: a search engine's reader would then only ever see one of the two.
  let seen = 1;
  try { seen = localStorage.getItem('lang'); } catch (e) { /* private window */ }
  if (REAL && LANG === 'zh' && !seen && /^ja\b/i.test(navigator.language || '')) {
    $('main').insertAdjacentHTML('afterbegin', '<p id="langhint">日本語版があります。<a href="' + $('#langsw').href + '">日本語で見る</a><button type="button" title="閉じる">✕</button></p>');
    $('#langhint button').addEventListener('click', () => { $('#langhint').remove(); try { localStorage.setItem('lang', 'zh'); } catch (e) { /* private window */ } });
  }
  $('#langsw').addEventListener('click', () => { try { localStorage.setItem('lang', LANG === 'ja' ? 'zh' : 'ja'); } catch (e) { /* private window */ } });
  if ($('#static')) $('#static').remove();                  // the plain version of this page that build.py wrote for search engines
  if (REAL) document.querySelectorAll('a[href^="#"]').forEach((a) => { const r = a.getAttribute('href').slice(1); if (['home', 'browse', 'songs', 'hl', 'about', 'videos', 'games', 'fanart'].includes(r)) a.setAttribute('href', U(r)); });
  document.querySelectorAll('a[data-route]').forEach((a) => { a.setAttribute('href', U(a.dataset.route.replace(/=(.*)/, (m0, v) => '=' + encodeURIComponent(v)))); });
  if (!m.transcripts) $('#sq').placeholder = t('搜尋直播、歌曲');          // the public site has no transcripts to search
  drawHome(m);
  drawSongs();
  route();
  // Show the page once the typeface and the front-page picture are in (at most 1.5 s), so that it does not build up in front of the visitor.
  const hero = document.querySelector('#v-home:not([hidden]) .bimg img');
  const waits = [document.fonts && document.fonts.ready, hero && !hero.complete && new Promise((r) => { hero.onload = hero.onerror = r; })].filter(Boolean);
  Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 1500))]).then(() => requestAnimationFrame(() => document.documentElement.classList.add('ready')));
});
