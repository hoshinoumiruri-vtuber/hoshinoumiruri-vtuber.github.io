// Leaderboards, Google sign-in and cloud saves for the games (design/accounts-leaderboard.md), shared by every game page.
// Nothing shows unless an API is configured for the address the page is on (the public site, or the tests below).
// A page calls RuriAccount.mount({ game, lang, slot, keys, merge, bindNames }) once, then start() when a game begins and
// over({ value, binds, meta }) when it ends (a lost boss fight: { lost: true, kills, binds, meta }); savedChanged() after it writes its own keys to localStorage.
// Test: on 127.0.0.1 it talks to `wrangler dev` (api/test/run.sh) and signs in without Google. On localhost (the address
// Google and Turnstile accept) it talks to the deployed test API with the real Google sign-in.
(function () {
  'use strict';
  const LOCAL = location.hostname === '127.0.0.1', TEST = location.hostname === 'localhost';
  const LIVE = location.hostname === 'hoshinoumiruri-vtuber.github.io';
  // the public site has the API since 2026-10-20 (the runner's leaderboard, user); the preview has none
  const CONF = {
    api: LOCAL ? 'http://127.0.0.1:8787' : TEST || LIVE ? 'https://ruri-games-api.hoshinoumiruri.workers.dev' : '',
    googleClientId: '672289615826-j2hlp9v7nujru7ov1kidj394iurd6n24.apps.googleusercontent.com', turnstileSiteKey: '0x4AAAAAAFdmeacQ4LwYSu-y',
    dev: LOCAL,
  };
  const T = {
    zh: { board: '排行榜', close: '關閉', rank: '名次', name: '名字', score: '分數', time: '時間', result: '成績', kills: (n) => '打倒 ' + n + ' 隻', empty: '還沒有紀錄', loading: '載入中…', sending: '登錄中…', fail: '連不上排行榜，等一下再試',
      submitT: '可以登上排行榜！', submitP: '用 Google 登入，登錄成績並備份存檔。', skip: '略過', signin: '用 Google 登入', send: '登錄',
      nameT: '排行榜上要顯示的名字', nameP: '這個名字會公開顯示在排行榜上，請不要用本名。1 到 12 個字。', taken: '這個名字有人用了，換一個吧', badName: '名字要 1 到 12 個字',
      sent: (r) => '登錄好了！目前第 ' + r + ' 名', sentNo: '登錄好了！', inapp: '這個 App 裡的瀏覽器不能用 Google 登入，請用 Chrome 或 Safari 開啟這一頁再登錄。',
      restore: '登入取回紀錄', me: (n) => '已登入：' + n, out: '登出', del: '刪除我的資料', delQ: '確定要刪除你在這個網站的帳號嗎？你的名字、全部的紀錄和雲端存檔都會刪除，無法復原。之後要再使用，需要重新登入並登錄名字。', deleted: '已刪除',
      devName: '開發模式：輸入一個測試帳號代號（不是 Google 登入）', banned: '這個帳號不能登錄排行榜', slow: '太快了，等一下再試', implausible: '這個成績無法登錄',
      all: '全部', onlyLocks: '只看有開：' },
    ja: { board: 'ランキング', close: 'とじる', rank: '順位', name: '名前', score: 'スコア', time: 'タイム', result: '記録', kills: (n) => n + ' 体撃破', empty: 'まだ記録がありません', loading: '読み込み中…', sending: '登録中…', fail: 'ランキングに接続できません。しばらくしてからもう一度',
      submitT: 'ランキング入り！', submitP: 'Google でログインすると、記録を登録してセーブデータをバックアップできます。', skip: 'スキップ', signin: 'Google でログイン', send: '登録',
      nameT: 'ランキングに表示する名前', nameP: 'この名前はランキングに公開されます。本名は使わないでください。1〜12 文字。', taken: 'この名前は使われています。別の名前にしてください', badName: '名前は 1〜12 文字です',
      sent: (r) => '登録しました！ 現在 ' + r + ' 位', sentNo: '登録しました！', inapp: 'このアプリ内ブラウザでは Google ログインができません。Chrome か Safari でこのページを開いてください。',
      restore: 'ログインして記録を取り戻す', me: (n) => 'ログイン中：' + n, out: 'ログアウト', del: 'データを削除', delQ: 'このサイトのアカウントを削除しますか？名前とすべての記録・クラウドのセーブデータが削除され、元に戻せません。また使うときは、もう一度ログインして名前を登録してください。', deleted: '削除しました',
      devName: '開発モード：テスト用アカウント名を入力（Google ログインではありません）', banned: 'このアカウントはランキングに登録できません', slow: '少し待ってからもう一度', implausible: 'この記録は登録できません',
      all: 'すべて', onlyLocks: '縛り：' },
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  const SKEY = 'ruri-session', NKEY = 'ruri-name';
  const inApp = () => /FBAN|FBAV|Instagram|Line\/|Discord|MicroMessenger|; wv\)|WebView/i.test(navigator.userAgent);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let G = null, L = T.zh, open = 0, run = null, boardCache = null, saveTimer = 0, saveVersion = 0;

  async function call(method, path, body, auth) {
    const h = { 'Content-Type': 'application/json' }, s = store.get(SKEY);
    if (auth && s) h.Authorization = 'Bearer ' + s;
    const r = await fetch(CONF.api + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && auth) { store.set(SKEY, null); store.set(NKEY, null); paintMe(); }
    if (!r.ok) { const e = new Error(j.error || 'http'); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  // Turnstile: one token per write. In development the API takes 'dev'. The check shows inside the card it is for
  // (user 2026-10-21: in the corner it was easy to miss when it asks for a click); a background save has no card and
  // uses the corner.
  let tsReady = null;
  function turnstile(host) {
    if (CONF.dev) return Promise.resolve('dev');
    tsReady = tsReady || new Promise((res) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = res; document.head.appendChild(s); });
    return tsReady.then(() => new Promise((res, rej) => {
      const box = document.createElement('div');
      if (host) { box.className = 'ra-ts'; host.appendChild(box); } else { box.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:100'; document.body.appendChild(box); }
      window.turnstile.render(box, { sitekey: CONF.turnstileSiteKey, size: 'flexible', callback: (t) => { box.remove(); res(t); }, 'error-callback': () => { box.remove(); rej(new Error('turnstile')); } });
    }));
  }

  // ------------------------------------------------------------ sign-in
  let gisReady = null;
  function googleToken(host) {
    if (CONF.dev) {
      const id = prompt(L.devName, 'tester'); return Promise.resolve(id ? 'dev:' + id : null);
    }
    gisReady = gisReady || new Promise((res) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = res; document.head.appendChild(s); });
    return gisReady.then(() => new Promise((res) => {
      window.google.accounts.id.initialize({ client_id: CONF.googleClientId, callback: (r) => res(r.credential), ux_mode: 'popup' });
      host.innerHTML = ''; window.google.accounts.id.renderButton(host, { theme: 'filled_blue', shape: 'pill', text: 'signin_with' });
    }));
  }
  async function signIn(host) {
    const tok = await googleToken(host);
    if (!tok) return false;
    const r = await call('POST', '/auth/google', { idToken: tok });
    store.set(SKEY, r.session); store.set(NKEY, r.name);
    // signed in: the Google button goes, so nobody keeps pressing it (user 2026-10-20)
    if (host) host.remove();
    await syncSave(true);
    paintMe();
    return true;
  }
  const signedIn = () => !!store.get(SKEY);

  // ------------------------------------------------------------ dialogs
  function dialog(html, onClose) {
    const el = document.createElement('div');
    el.className = 'ra-modal';
    el.innerHTML = '<div class="ra-card" role="dialog" aria-modal="true"><button type="button" class="ra-x" aria-label="' + L.close + '">✕</button>' + html + '</div>';
    const shut = () => { if (!el.isConnected) return; el.remove(); if (--open === 0) G.busy(false); if (onClose) onClose(); };
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.ra-x')) shut(); });
    for (const ev of ['touchstart', 'pointerdown', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
    document.body.appendChild(el); if (open++ === 0) G.busy(true);
    return { el, shut, $: (q) => el.querySelector(q) };
  }
  // a result: a score, a time, or (boss, a lost fight) only how many knights fell
  const fmt = (r) => r.lost ? L.kills(r.kills) : G.better === 'low' ? r.value.toFixed(2) + ' s' : String(Math.floor(r.value));

  async function openBoard(filter) {
    const d = dialog('<h2>🏆 ' + L.board + '</h2>' + (G.bindNames ? '<div class="ra-tabs"></div>' : '') + '<div class="ra-list">' + L.loading + '</div><div class="ra-me"></div>');
    if (G.bindNames) {
      const tabs = d.$('.ra-tabs'), cur = new Set(filter || []);
      tabs.innerHTML = '<span>' + L.onlyLocks + '</span>' + Object.entries(G.bindNames).map(([k, n]) => '<label><input type="checkbox" value="' + k + '"' + (cur.has(k) ? ' checked' : '') + '> ' + esc(n) + '</label>').join('');
      tabs.addEventListener('change', () => { const f = [...tabs.querySelectorAll('input:checked')].map((i) => i.value); d.shut(); openBoard(f); });
    }
    paintMe(d.$('.ra-me'));
    try {
      const b = await call('GET', '/board/' + G.game + (filter && filter.length ? '?binds=' + filter.join(',') : ''));
      if (!filter || !filter.length) boardCache = b;
      const me = store.get(NKEY);
      d.$('.ra-list').innerHTML = b.rows.length ? '<table><tr><th>' + L.rank + '<th>' + L.name + '<th>' + (G.better === 'low' ? L.result : L.score) + '</tr>' +
        b.rows.map((r) => '<tr' + (r.name === me ? ' class="ra-mine"' : '') + '><td>' + r.rank + '<td><span class="ra-nm">' + esc(r.name) + '</span>' +
          (r.binds.length && G.bindNames ? ' <small>' + r.binds.map((x) => esc(G.bindNames[x] || x)).join('・') + '</small>' : '') + '<td>' + fmt(r)).join('') + '</table>' : L.empty;
    } catch (e) { d.$('.ra-list').textContent = L.fail; }
  }
  function paintMe(host) {
    const hosts = host ? [host] : document.querySelectorAll('.ra-me');
    for (const h of hosts) {
      if (!CONF.api) continue;
      if (signedIn() && store.get(NKEY)) {
        h.innerHTML = L.me('<span class="ra-nm">' + esc(store.get(NKEY)) + '</span>') + ' · <a href="#" data-a="out">' + L.out + '</a> · <a href="#" data-a="del">' + L.del + '</a>';
      } else if (signedIn()) h.innerHTML = '<a href="#" data-a="out">' + L.out + '</a>';
      else h.innerHTML = inApp() ? '' : '<a href="#" data-a="in">' + L.restore + '</a><span class="ra-g"></span>';
      h.onclick = async (e) => {
        const a = e.target.dataset && e.target.dataset.a; if (!a) return; e.preventDefault();
        if (a === 'out') { store.set(SKEY, null); store.set(NKEY, null); paintMe(); }
        if (a === 'in') { try { await signIn(h.querySelector('.ra-g')); } catch (err) { alert(L.fail); } }
        if (a === 'del' && confirm(L.delQ)) { try { await call('DELETE', '/me', null, true); store.set(SKEY, null); store.set(NKEY, null); alert(L.deleted); paintMe(); } catch (err) { alert(L.fail); } }
      };
    }
  }
  function askName() {
    return new Promise((res) => {
      const d = dialog('<h2>' + L.nameT + '</h2><p>' + L.nameP + '</p><input class="ra-in" maxlength="24" autocomplete="off"><div class="ra-tsh"></div><p class="ra-err"></p><button type="button" class="ra-go">' + L.send + '</button>', () => res(null));
      const go = async () => {
        const n = d.$('.ra-in').value.trim();
        if (![...n].length || [...n].length > 12) { d.$('.ra-err').textContent = L.badName; return; }
        try { const r = await call('POST', '/player/name', { name: n, turnstile: await turnstile(d.$('.ra-tsh')) }, true); store.set(NKEY, r.name); paintMe(); res(r.name); d.el.remove(); if (--open === 0) G.busy(false); }
        catch (e) { d.$('.ra-err').textContent = e.message === 'name_taken' ? L.taken : e.message === 'bad_name' ? L.badName : L.fail; }
      };
      d.$('.ra-go').onclick = go; d.$('.ra-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      setTimeout(() => d.$('.ra-in').focus(), 50);
    });
  }

  // ------------------------------------------------------------ a game's life
  function start() {
    run = null;
    if (!CONF.api || G.noBoard) return;
    call('POST', '/run/start', { game: G.game }).then((r) => { run = r.run; }).catch(() => {});
  }
  // the board's own order: wins by value, then lost fights by knights taken down (a tie goes to the one there first)
  const key = (r) => [r.lost ? 0 : 1, r.lost ? r.kills : 0, G.better === 'low' ? -r.value : r.value];
  function qualifies(res) {
    const b = boardCache, beats = (x, y) => { const a = key(x), z = key(y); for (let i = 0; i < 3; i++) if (a[i] !== z[i]) return a[i] > z[i]; return false; };
    if (!b) return true;
    // a player shows once with their best: nothing to offer when that already beats this one
    const mine = signedIn() && b.rows.find((r) => r.name === store.get(NKEY));
    if (mine && !beats(res, mine)) return false;
    return b.rows.length < 50 || beats(res, b.rows[b.rows.length - 1]);
  }
  async function over(res) {
    if (!CONF.api || G.noBoard || !run || !res || !(res.lost ? res.kills > 0 : res.value > 0)) return;
    const ticket = run; run = null;
    if (!boardCache) { try { boardCache = await call('GET', '/board/' + G.game); } catch (e) { return; } }
    if (!qualifies(res)) return;
    const d = dialog('<h2>🏆 ' + L.submitT + '</h2><p class="ra-val">' + fmt(res) + '</p>' +
      (signedIn() ? '<button type="button" class="ra-go">' + L.send + '</button>' : inApp() ? '<p>' + L.inapp + '</p>' : '<p>' + L.submitP + '</p><div class="ra-g"><button type="button" class="ra-go">' + L.signin + '</button></div>') +
      '<div class="ra-tsh"></div><p class="ra-err"></p><button type="button" class="ra-skip">' + L.skip + '</button>');
    d.$('.ra-skip').onclick = d.shut;
    const busy = (on) => {
      for (const b of [d.$('.ra-go'), d.$('.ra-skip'), d.$('.ra-x')]) if (b) b.style.visibility = on ? 'hidden' : '';
      d.$('.ra-err').innerHTML = on ? '<span class="ra-spin"></span>' + L.sending : '';
    };
    const send = async () => {
      try {
        if (!signedIn() && !await signIn(d.$('.ra-g'))) return;
        if (!store.get(NKEY) && !await askName()) return;
        // while it goes (the Turnstile check, then the post) the buttons go and a spinner says so (user 2026-10-21: 略過
        // stayed a moment after the check and looked like the thing to press)
        busy(true);
        const r = await call('POST', '/score', { game: G.game, run: ticket, value: res.value || 0, ...(res.lost ? { won: false, kills: res.kills } : {}), binds: res.binds || [], meta: res.meta || {}, turnstile: await turnstile(d.$('.ra-tsh')) }, true);
        boardCache = null;
        busy(false);
        d.$('.ra-err').textContent = r.rank ? L.sent(r.rank) : L.sentNo;
        const go = d.$('.ra-go'); if (go) go.remove(); d.$('.ra-skip').textContent = L.close;
      } catch (e) {
        busy(false);
        d.$('.ra-err').textContent = e.message === 'banned' ? L.banned : e.message === 'slow_down' ? L.slow : e.message === 'implausible' || e.message === 'bad_run' ? L.implausible : L.fail;
      }
    };
    const go = d.$('.ra-go'); if (go) go.onclick = send;
  }

  // ------------------------------------------------------------ saves: the page's own keys, merged both ways
  const localSave = () => Object.fromEntries(G.keys.map((k) => [k, store.get(k)]).filter(([, v]) => v != null));
  function apply(data) { for (const [k, v] of Object.entries(data || {})) if (G.keys.includes(k)) store.set(k, v); }
  async function syncSave(first) {
    if (!signedIn() || !G.keys) return;
    try {
      const cloud = await call('GET', '/save/' + G.game, null, true);
      const remote = cloud.data ? JSON.parse(cloud.data) : null, mine = localSave();
      const merged = remote ? G.merge(mine, remote) : mine;
      if (remote) apply(merged);
      saveVersion = cloud.version;
      if (JSON.stringify(merged) !== JSON.stringify(remote)) {
        const r = await call('PUT', '/save/' + G.game, { version: saveVersion, data: merged, turnstile: await turnstile() }, true);
        saveVersion = r.version;
      }
      if (first && remote && G.reload) G.reload();
    } catch (e) {
      if (e.status === 409) setTimeout(() => syncSave(false), 1000);
    }
  }
  function savedChanged() {
    if (!signedIn()) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(() => syncSave(false), 30000);
  }

  function mount(opt) {
    G = { better: 'high', busy: () => {}, merge: (a, b) => ({ ...b, ...a }), ...opt };
    L = T[opt.lang === 'ja' ? 'ja' : 'zh'];
    if (!CONF.api) return;
    injectStyle();
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ra-btn'; btn.textContent = '🏆 ' + L.board;
    btn.addEventListener('click', () => openBoard());
    for (const ev of ['touchstart', 'pointerdown']) btn.addEventListener(ev, (e) => e.stopPropagation());
    const me = document.createElement('div'); me.className = 'ra-me ra-corner';
    (opt.slot || document.body).append(btn, me);
    paintMe();
    if (signedIn()) syncSave(true);
    addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); syncSave(false); } });
  }
  // players' names (.ra-nm) and the name field are in the system fonts: a page's own font (the boss game's pixel font)
  // has only some of the characters a name may use, Korean or emoji among them (user 2026-10-20)
  function injectStyle() {
    const s = document.createElement('style');
    s.textContent = `
.ra-btn{display:inline-block;margin:10px 6px 0;padding:7px 16px;border-radius:999px;border:1px solid #5a63c0;background:#1b1f52;color:#e8e6ff;font:inherit;font-weight:700;cursor:pointer}
.ra-corner{margin-top:6px;font-size:.85rem;opacity:.8}.ra-corner a,.ra-card a{color:#c2adff}
.ra-modal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,10,36,.78)}
.ra-card{position:relative;width:min(420px,100%);max-height:86vh;overflow:auto;padding:22px 18px 18px;border-radius:16px;text-align:center;background:linear-gradient(170deg,#2a2f78,#1b1f52 60%,#2a1f5e);border:1px solid #5a63c0;color:#e8e6ff;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.ra-card h2{margin:4px 0 12px;font-size:1.2rem}.ra-card p{margin:6px 0}.ra-val{font-size:1.6rem;font-weight:800}
.ra-x{position:absolute;top:8px;right:10px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff}
.ra-card table{width:100%;border-collapse:collapse;text-align:left;font-variant-numeric:tabular-nums}.ra-card td,.ra-card th{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.12)}.ra-list{max-height:min(52vh,460px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#7a73c8 transparent}.ra-list::-webkit-scrollbar{width:6px}.ra-list::-webkit-scrollbar-thumb{background:#7a73c8;border-radius:3px}.ra-list th{position:sticky;top:0;z-index:1;background:#20255f}.ra-spin{display:inline-block;width:.9em;height:.9em;margin-right:6px;vertical-align:-2px;border:2px solid rgba(255,255,255,.25);border-top-color:#c2adff;border-radius:50%;animation:ra-spin .8s linear infinite}@keyframes ra-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.ra-spin{animation-duration:2.4s}}.ra-ts{display:flex;justify-content:center;margin:8px 0 2px}.ra-ts:empty{display:none}
.ra-card td:first-child,.ra-card th:first-child{width:3em;text-align:right}.ra-card td:last-child,.ra-card th:last-child{text-align:right}
.ra-card small{opacity:.7}.ra-mine{background:rgba(194,173,255,.18)}
.ra-tabs{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:center;margin-bottom:10px;font-size:.9rem}
div.ra-g{display:flex;justify-content:center;min-height:44px;align-items:center}span.ra-g{display:flex;justify-content:center;margin-top:6px}span.ra-g:empty{display:none}.ra-go,.ra-skip{margin:8px 4px 0;padding:8px 20px;border-radius:999px;border:0;font:inherit;font-weight:700;cursor:pointer}.ra-go{background:#c2adff;color:#170f38}.ra-skip{background:rgba(255,255,255,.12);color:#fff}
.ra-in{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #5a63c0;background:#11143a;color:#fff;font:inherit;font-size:16px}.ra-nm,.ra-in{font-family:system-ui,-apple-system,"Segoe UI","Noto Sans TC","Noto Sans JP","PingFang TC","Hiragino Sans","Microsoft JhengHei","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.ra-err{min-height:1.2em;color:#ffd76a}.ra-me{margin-top:12px;font-size:.85rem}`;
    document.head.appendChild(s);
  }

  window.RuriAccount = { mount, start, over, savedChanged, openBoard, enabled: () => !!CONF.api };
})();
