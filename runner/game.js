// The little running game (like the dinosaur of Chrome). Ruri runs to the right, jumps the snails and the guava knights,
// and has to mind the flying edamame and stars. Her head turns now and then from the side view (A) to the three-quarter view (B).
// Sprites are in sprites.js (written by runner-src/gen.py). Everything is drawn on one canvas of 640x220 game pixels.
(function () {
  'use strict';
  const VER = 'v23';
  function texts(search) {
    const JA = /[?&]lang=ja/.test(search);
    const TX = JA ? {
      ttl: 'ほしのランナー', how: 'スペースキー・↑・画面のどこをタップしてもジャンプ（ゲーム画面の上でなくてOK）。ゲームパッドのAボタンや上方向でもOK。かたつむり・グァバ騎士・カエルはとびこえて、枝豆と星はよけよう。',
      start: 'スペースキーか画面タップでスタート', over: 'ぶつかった！ スペースキーかタップでもう一度', back: '← 配信データベースへ戻る', hi: 'ハイスコア',
      badge: '星空かたつむりバッジをゲット！', badgeR: '虹色かたつむりバッジをゲット！', badge2: 'ホームに戻って探してみよう。どこかが変わっているよ。', home: 'ホームへ戻る', close: 'とじる',
    } : {
      ttl: '琉璃跑跑', how: '按空白鍵、↑ 或點畫面任何地方跳起來（手機點哪裡都可以，不用壓在遊戲上），也可以用搖桿的 A 鍵或方向上。蝸牛、芭樂騎士和青蛙要跳過去，毛豆和星星要閃開。',
      start: '按空白鍵或點一下（任何地方）開始', over: '撞到了！按空白鍵或點一下再玩一次', back: '← 回到直播資料庫', hi: '最高分',
      badge: '拿到星空蝸牛徽章了！', badgeR: '拿到彩虹蝸牛徽章了！', badge2: '回到首頁找找看，有地方不一樣了。', home: '回到首頁', close: '關閉',
    };
    return { JA, TX };
  }

  // The game itself. It does not touch the page: what it needs comes in env (the canvas, the address, the colours, the best score)
  // and what it has to say goes out through env (the line under the game, the best score to keep). The page takes the keys, the
  // touches and the game pad and passes them on.
  // Addresses for tests: ?bot plays by itself, ?score=N starts at N points, ?fps shows the frame times, ?notrail takes the trail away.
  function core(env) {
    const SEARCH = env.search;
    const BOT = /[?&]bot/.test(SEARCH), START = +((SEARCH.match(/[?&]score=(\d+)/) || [])[1] || 0);
    const RS = env.stats;
    const { TX, JA } = texts(SEARCH);

    // Sprites become small canvases once, and are drawn at SC times their size.
    const SC = 2;
    const img = {};
    for (const name in SPRITES) {
      const rows = SPRITES[name], c = env.makeCanvas(rows[0].length, rows.length);
      const x = c.getContext('2d');
      rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { x.fillStyle = SPRITE_PAL[r[i]]; x.fillRect(i, y, 1, 1); } });
      img[name] = c;
    }
    const cv = env.canvas, ctx = cv.getContext('2d');
    const msg = { v: '', set textContent(t) { this.v = t; env.msg(t); }, get textContent() { return this.v; } };
    // The picture has K times the pixels of the game (640x220), as many as the screen really shows it with. Things then move by
    // 1/K of a game pixel, not by whole ones: at a speed like 6.3 pixels a step, whole pixels made them go 6, 6, 7, 6 and tremble
    // every few frames (user, 2026-10-14).
    const K = env.scale || 1;
    cv.width = 640 * K; cv.height = 220 * K;
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const snap = (v) => Math.round(v * K) / K;
    const TRAIL = !/[?&]notrail/.test(SEARCH);                  // the faint copy behind each obstacle: on (user, 2026-10-14), ?notrail takes it away
    const W = 640, H = 220, GROUND = 190, G = .7, JUMP = -12.6;
    const fg = env.fg, mut = env.mut;
    let hi = env.hi, saved = hi;
    // The best score goes to the page, which keeps it: when she is hit, once when she changes, and now and then while it rises (the page
    // writes it when it is left).
    const saveHi = (now) => { if (hi > saved) { saved = hi; env.saveHi(hi, !!now); } };
    let guest = null, air = 0, state = 'ready', tick = 0, speed = 6, score = 0, y = 0, vy = 0, obs = [], nextGap = 0, turnAt = 0, turnLeft = 0, pebbles = [];
    for (let i = 0; i < 24; i++) pebbles.push([Math.random() * W, GROUND + 6 + Math.random() * 18, 1 + Math.floor(Math.random() * 3)]);
    // The speed goes from 6 to 12 pixels a frame, which it reaches at the score 660. (14 was too fast for people: the search showed
    // gaps of 3 to 5 frames, 50 to 80 ms, between a jump that is too early and one that is too late.)
    const speedAt = (sc) => Math.min(12, 6 + sc / 110);
    const RURI = { x: 60, w: 28 * SC, h: 36 * SC };

    // What the score brings (user, 2026-10-14): the snails change colour like the badges of the membership, pink at 100, blue at
    // 250, purple at 500, rainbow at 700; the frogs come at 400; at 500 Ruri changes to hairstyle B; at 600 the starry snail
    // floats by and the starry snail badge is won; at 700 the rainbow snail badge. The last three are 100 apart on purpose: the
    // score runs faster and the game is harder there, so each is further in effort than the one before. About 10, 24, 35, 41,
    // 47 and 53 s of play. Before: 200/400/600/1000, then all times 0.8, then 100/280/520/800.
    const PINK = 100, BLUE = 250, FROGS = 400, PURPLE = 500, BADGE = 600, RAINBOW = 700;
    const tierOf = (sc) => sc >= RAINBOW ? 4 : sc >= PURPLE ? 3 : sc >= BLUE ? 2 : sc >= PINK ? 1 : 0;
    const spr = (k, tier, f) => k.s === 'snail' ? 'snail' + tier + '_' + f : k.s + f;
    // Kinds of obstacle: the sprite, how high its bottom is above the ground, how far the hit box is inside the picture, whether it flies
    const KINDS = {
      snail: { s: 'snail', up: 0, inset: 4 },
      guava: { s: 'guava', up: 0, inset: 6 },
      frogW: { s: 'frogwave', up: 0, inset: 8 },
      frogT: { s: 'frogteeth', up: 0, inset: 8 },
      frogK: { s: 'frogknife', up: 0, inset: 8 },
      podLow: { s: 'edamame', up: 34, inset: 5, fly: 1 },
      podHigh: { s: 'edamame', up: 112, inset: 5, fly: 1 },
      starLow: { s: 'star', up: 28, inset: 6, fly: 1 },
      starHigh: { s: 'star', up: 108, inset: 6, fly: 1 },
    };
    // Is there a way through? Plays the next few seconds for every possible time of jumping, with the speed rising as it does in the
    // game, and with a bigger body than she has (margin up and down, mx in front and behind), so that a way through that exists only
    // to the frame does not count. The search is over (frame, phase of the jump): every jump is the same curve, so her state is only
    // how many frames she has been in the air (0 = on the ground). YT[p] is her height after p frames of a jump. No strings, no
    // recursion: it runs at every spawn and must not make the game stutter. wait = true: she does not jump in the first frame (the bot).
    const YT = [0];
    { let yy = 0, vv = JUMP; do { vv += G; yy = Math.max(0, yy - vv); YT.push(yy); } while (yy > 0); }
    const AIR = YT.length - 1;                                   // YT[AIR] is 0: she is down again
    function beatable(list, margin, mx, wait) {
      const n = list.length, X = new Float64Array(n), ax = RURI.x + 10 - mx, aw = RURI.w - 24 + 2 * mx, ah = RURI.h - 12 + 2 * margin;
      let T = 0;
      for (let i = 0; i < n; i++) { X[i] = list[i].x; T = Math.max(T, Math.ceil((list[i].x + list[i].w - RURI.x) / (speed * list[i].v)) + 2); }
      T = Math.min(T, 300);
      let cur = new Uint8Array(AIR + 1), nxt = new Uint8Array(AIR + 1), sc = score, sp = speed;
      cur[air] = 1;
      const bx = new Float64Array(n), by = new Float64Array(n), bw = new Float64Array(n), bh = new Float64Array(n);
      for (let t = 0; t < T; t++) {
        sc += sp / 40; sp = speedAt(sc);
        let near = 0;
        for (let i = 0; i < n; i++) {
          const o = list[i], ins = o.k.inset;
          X[i] -= sp * o.v;
          bx[i] = X[i] + ins; bw[i] = o.w - 2 * ins; bh[i] = o.h - 2 * ins;
          by[i] = (o.k.fly && o.k.s === 'star' ? o.y0 + Math.sin((tick + t + 1) / 14 + o.ph) * 12 : o.y) + ins;
          if (ax < bx[i] + bw[i] && ax + aw > bx[i]) near = 1;   // only the ones over or under her can hit in this frame
        }
        const free = (p) => {
          if (!near) return true;
          const ay = GROUND - YT[p] - RURI.h + 8 - margin;
          for (let i = 0; i < n; i++) if (ax < bx[i] + bw[i] && ax + aw > bx[i] && ay < by[i] + bh[i] && ay + ah > by[i]) return false;
          return true;
        };
        nxt.fill(0);
        let alive = 0;
        if (cur[0]) {
          if (free(0)) { nxt[0] = 1; alive = 1; }
          if (!(wait && t === 0) && free(1)) { nxt[1] = 1; alive = 1; }
        }
        for (let p = 1; p < AIR; p++) {
          if (!cur[p]) continue;
          const q = p + 1 === AIR ? 0 : p + 1;
          if (free(q)) { nxt[q] = 1; alive = 1; }
        }
        if (!alive) return false;
        const sw = cur; cur = nxt; nxt = sw;
      }
      return true;
    }
    // Put the obstacles of the last spawn (from index i) further right until the way through is there, with a margin of 6 pixels up
    // and down and 5 frames (about 80 ms) of timing in front and behind.
    function make_fair(i) {
      const x0 = obs.slice(i).map((o) => o.x);
      for (const fr of [5, 3, 1.5]) {                            // frames of timing to spare; less only when the full margin cannot be had
        let shift = 0;
        obs.slice(i).forEach((o, j) => { o.x = x0[j]; });
        while (shift < 640 && !beatable(obs, fr > 2 ? 6 : 3, fr * speed)) { obs.slice(i).forEach((o) => { o.x += 16; }); shift += 16; }
        if (shift < 640) return shift;
      }
      obs.length = i;                                            // no way through wherever it is put (a group too long for one jump): leave it out
      RS.dropped = (RS.dropped || 0) + 1;
      return 0;
    }
    // Difficulty, as in the dinosaur game: the speed rises, the flying ones are faster than the ground, the ground ones come in groups
    // of two or three, and the gaps get tighter (but never shorter than a jump needs).
    function spawn() {
      const first = obs.length;
      const pool = ['snail', 'snail', 'guava', 'guava'];
      if (score > 120) pool.push('podLow', 'starLow');
      if (score >= FROGS) pool.push('frogW', 'frogK', 'frogW', 'frogK', 'frogT');          // the frogs of the stickers; the one with teeth is rarer, to frighten
      if (score > 260) pool.push('podHigh', 'starHigh', 'podLow', 'starLow');
      const name = pool[Math.floor(Math.random() * pool.length)], k = KINDS[name], tier = tierOf(score), im = img[spr(k, tier, 0)];
      let n = 1;
      if (!k.fly) { const r = Math.random(); if (score > 60 && r < .35) n = 2; if (score > 220 && r < .15) n = 3; }
      let x = W + 10, last = 0;
      for (let i = 0; i < n; i++) {
        // in a group a snail may stand next to a guava knight
        const kk = i && score > 380 && Math.random() < .4 ? KINDS[name === 'snail' ? 'guava' : 'snail'] : k, ii = img[spr(kk, tier, 0)];
        const o = { k: kk, x, w: ii.width * SC, h: ii.height * SC, tier, ph: Math.random() * 6, v: kk.fly ? 1.25 + Math.min(.35, score / 1500) : 1 };
        o.y = GROUND - kk.up - o.h; o.y0 = o.y;
        obs.push(o); x += o.w + 4 + Math.random() * 8; last = x;
      }
      // The guava knight marches: faster than the snails and the frogs, also in a group with them, where he walks past them (user).
      if (!k.fly) obs.slice(first).forEach((o) => { o.v = o.k.s === 'guava' ? 1.18 : 1; });
      const w = last - (W + 10);
      // the gap after it must leave room to land: a jump at this speed, times a factor that goes down from 1.9 to 1.0 as the speed rises
      const f = 1.0 + .9 * Math.max(0, 1 - (speed - 6) / 8) * Math.random() + (Math.random() < .25 ? .35 : 0) * (speed < 11);
      nextGap = speed * 37 * f * (n > 1 ? 1.1 : 1) + w + 20;
      // A pair, ground then air (from score 350, now and then): a high star that arrives only a few frames after the ground one has gone by.
      // She cannot jump with the star over her head, and has to jump the ground one early enough to be down again by then.
      if (!k.fly && score > 350 && Math.random() < .3) {
        const g = obs[obs.length - 1], vs = 1.25 + Math.min(.35, score / 1500), kk = KINDS.starHigh, ii = img.star0;
        const out = (g.x + g.w - (RURI.x + 10)) / speed;                          // frames until the ground one has passed her
        const T2 = out + 3 + Math.random() * 7;                                   // the star comes this many frames after that
        const o = { k: kk, x: RURI.x + RURI.w - 14 - kk.inset + vs * speed * T2, w: ii.width * SC, h: ii.height * SC, tier, ph: Math.random() * 6, v: vs };
        o.y = GROUND - kk.up - o.h; o.y0 = o.y;
        obs.push(o);
        nextGap = Math.max(nextGap, (o.x - (W + 10)) + speed * 37 * 1.4);
      }
      const t0 = performance.now(), sh = make_fair(first); nextGap += sh;
      RS.ms = Math.max(RS.ms || 0, performance.now() - t0); RS.spawns++; RS.shifts += sh > 0;
    }
    function reset() { if (env.start) env.start(); state = 'run'; tick = 0; score = START; speed = speedAt(START); y = 0; vy = 0; obs = []; air = 0; guest = null; nextGap = 160; turnAt = 240 + Math.random() * 200; turnLeft = 0; msg.textContent = ''; }
    function jump() {
      if (state === 'ready' || state === 'over') { if (state === 'over' && tick < 25) return; reset(); }
      if (state === 'run' && y === 0) { vy = JUMP; }
    }
    const press = () => { lastInput = performance.now(); resume() || jump(); };
    const pause = () => { if (state === 'run') { state = 'paused'; msg.textContent = TX.start; } };
    function resume() { if (state === 'paused') { state = 'run'; msg.textContent = ''; return true; } return false; }

    function hit() {
      const a = { x: RURI.x + 10, y: GROUND - y - RURI.h + 8, w: RURI.w - 24, h: RURI.h - 12 };
      return obs.some((o) => {
        const i = o.k.inset, b = { x: o.x + i, y: o.y + i, w: o.w - 2 * i, h: o.h - 2 * i };
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      });
    }
    let prevY = 0;
    function step() {
      tick++;
      // where everything was before this step: the picture is drawn between the two (see frame)
      prevY = y; obs.forEach((o) => { o.px = o.x; o.py = o.y; }); pebbles.forEach((p) => { p[3] = p[0]; });
      if (state !== 'run') return;
      // Test only (?bot): she jumps at the last frame that still has a way through. One frame back in time for the call, because
      // this is before the obstacles of this step move and the search counts from after it (the stars bob with the time).
      if (BOT && y === 0) { tick--; const ok = beatable(obs, 0, 0, true); tick++; if (!ok) vy = JUMP; }
      score += speed / 40;
      speed = speedAt(score);
      // The best score is written when she is hit, when the page is left, and once when she changes (a write to the storage twice a second made the game stutter).
      if (Math.floor(score) > hi) { const was = hi; hi = Math.floor(score); if (was < BADGE && hi >= BADGE || was < RAINBOW && hi >= RAINBOW) saveHi(true); else if (tick % 60 === 0) saveHi(false); }
      vy += G; y = Math.max(0, y - vy); if (y === 0) vy = 0;
      air = y > 0 ? air + 1 : 0;
      obs.forEach((o) => { o.x -= speed * o.v; if (o.k.fly && o.k.s === 'star') o.y = o.y0 + Math.sin(tick / 14 + o.ph) * 12; });
      obs = obs.filter((o) => o.x + o.w > -10);
      nextGap -= speed;
      if (nextGap <= 0) spawn();
      pebbles.forEach((p) => { p[0] -= speed; if (p[0] < -4) p[0] += W + 8; });
      // At the score of the badge the starry snail floats by, high up, from the right to the left. It touches nothing.
      if (!guest && score >= BADGE && score - speed / 40 < BADGE) guest = { x: W + 20, t: 0 };
      if (guest) { guest.px = guest.x; guest.x -= speed * .45; guest.t++; if (guest.x < -60) guest = null; }
      if (tick >= turnAt && !turnLeft) { turnLeft = 34; turnAt = tick + 240 + Math.random() * 300; }   // the head turns to us for about half a second
      if (turnLeft) turnLeft--;
      if (hit()) {
        state = 'over'; tick = 0; msg.textContent = TX.over; RS.dead++;
        if (Math.floor(score) > hi) hi = Math.floor(score);
        saveHi(true);
        env.over(BADGE, RAINBOW, Math.floor(score));
      }
    }
    const pad = (n) => String(Math.floor(n)).padStart(5, '0');
    function draw(al) {
      if (state !== 'run') al = 1;
      const iy = prevY + (y - prevY) * al;                      // her height between the last two steps
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = mut; ctx.fillRect(0, GROUND, W, 2);
      pebbles.forEach((p) => ctx.fillRect(snap(p[3] === undefined || p[0] > p[3] ? p[0] : p[3] + (p[0] - p[3]) * al), Math.round(p[1]), p[2] * 2, 2));
      // Ruri. Which version of the face: A the side, B turned to us. At the start she looks about; when she has hit something she looks at us.
      let face = 'A';
      if (state === 'ready') face = Math.floor(tick / 70) % 3 === 1 ? 'B' : 'A';
      else if (state === 'over') face = 'B';
      else if (turnLeft) face = 'B';
      const pose = state === 'over' ? 'dead' : y > 0 ? 'jump' : (Math.floor(tick / 6) % 2 ? 'run2' : 'run1');
      // When the snails turn purple she changes to hairstyle B: short dark hair with stars, a white blouse.
      // For half a second at the change the two looks flicker.
      let lookB = state !== 'ready' && score >= PURPLE;
      if (lookB && score < PURPLE + speed / 40 * 30) lookB = Math.floor(tick / 4) % 2 === 0;
      const sname = 'ruri' + face + (lookB ? 'b' : '') + '_' + (state === 'ready' ? 'run1' : pose);
      const sp = img[sname];
      ctx.drawImage(sp, RURI.x, snap(GROUND - iy - sp.height * SC + 2), sp.width * SC, sp.height * SC);
      if (lookB) {                                               // the stars in her hair, each with its own time
        const top = snap(GROUND - iy - sp.height * SC + 2), rows = SPRITES[sname], dy = pose === 'jump' ? -3 : 0;
        RURI_STARS.forEach(([sx, sy], i) => {
          const c = (rows[sy + dy] || '')[sx];
          if (c !== 'J' && c !== 'j' && c !== 'I') return;       // only where there is hair in this frame
          const lv = (Math.floor(tick / 7) + i * 2) % 7;
          if (lv > 2) return;
          ctx.fillStyle = lv === 0 ? '#ffffff' : lv === 1 ? '#c8d4ff' : '#8a9cf0';
          ctx.fillRect(RURI.x + sx * SC, top + (sy + dy) * SC, SC, SC);
        });
      }
      if (guest) {
        const gx = snap(guest.px === undefined ? guest.x : guest.px + (guest.x - guest.px) * al), gy = snap(46 + Math.sin(guest.t / 16) * 8);
        const gi = img['snail5_' + (Math.floor(guest.t / 12) % 2)];
        ctx.drawImage(gi, gx, gy, gi.width * SC, gi.height * SC);
        for (let i = 0; i < 7; i++) {                             // a trail of little stars behind it
          const lv = (Math.floor(guest.t / 5) + i * 3) % 6;
          if (lv > 2) continue;
          ctx.fillStyle = lv === 0 ? '#ffffff' : lv === 1 ? '#c8d4ff' : '#8a9cf0';
          ctx.fillRect(gx + gi.width * SC + 6 + i * 11, gy + 6 + ((i * 7) % 5) * 4 + Math.sin((guest.t + i * 9) / 7) * 3, SC, SC);
        }
      }
      obs.forEach((o) => {
        const s = img[spr(o.k, o.tier, o.k.fly ? Math.floor(tick / 8) % 2 : Math.floor(tick / (o.k.s === 'guava' ? 5 : 9)) % 2)];
        const ox = o.px === undefined ? o.x : o.px + (o.x - o.px) * al, oy = o.py === undefined ? o.y : o.py + (o.y - o.py) * al;
        if (TRAIL && state === 'run') {                              // a faint copy half a step behind, like the blur of a film: a late frame shows less
          ctx.globalAlpha = .3; ctx.drawImage(s, snap(ox + (o.x - (o.px === undefined ? o.x : o.px)) * -.5), snap(oy), o.w, o.h); ctx.globalAlpha = 1;
        }
        ctx.drawImage(s, snap(ox), snap(oy), o.w, o.h);
      });
      // The score line, from sprites (the fonts of the device gave the label another face on a computer): the label, the best, the score.
      let tx = W - 12;
      const num = (n) => { const d = pad(n); for (let i = d.length - 1; i >= 0; i--) { tx -= 12; ctx.drawImage(img['d' + d[i]], tx, 10, 10, 14); } };
      num(score); tx -= 18; num(hi); tx -= 8;
      const lab = img[JA ? 'hi_ja' : 'hi_zh']; tx -= lab.width; ctx.drawImage(lab, tx, 10 + Math.round((14 - lab.height) / 2));
      if (FPS) {                                                 // the measure, written on the picture itself so that it is seen to be on
        ctx.font = '700 11px ui-monospace, monospace'; ctx.fillStyle = '#ffe36a'; ctx.textAlign = 'left';
        ctx.fillText('FPS ' + VER + ' x' + K + '  frames ' + st.n + '  >25ms ' + st.long + '  max ' + Math.round(st.max) + '  worst after press ' + st.worst, 8, 14);
        st.after.slice(-3).forEach((a, i) => ctx.fillText(a.d.join(',') + ' [' + a.s.join('') + ']', 8, 28 + i * 13));
      }
    }
    let last = 0, acc = 0, lastInput = 0, lastDt = 16, hold = 0;
    // ?fps shows under the game how long the frames took, and the ones right after a press: to find out on the phone itself
    // whether the browser holds a frame back when the screen is touched.
    const FPS = /[?&]fps/.test(SEARCH), fpsBox = { set textContent(t) { env.how(t); } };
    if (FPS) fpsBox.textContent = 'FPS ' + VER + ' x' + K + ' ...';
    const st = { n: 0, long: 0, max: 0, after: [], cur: null, worst: 0 };
    function fpsNote(dt, steps) {
      st.n++; if (dt > 25) st.long++; if (dt > st.max) st.max = dt;
      if (lastInput) { st.cur = { left: 6, d: [], s: [] }; lastInput = 0; }
      if (st.cur) { st.cur.d.push(Math.round(dt)); st.cur.s.push(steps); if (--st.cur.left === 0) { st.after.push(st.cur); st.worst = Math.max(st.worst, ...st.cur.d); if (st.after.length > 4) st.after.shift(); st.cur = null; } }
      if (st.n % 30 === 0) fpsBox.textContent = 'FPS ' + VER + ' | frames ' + st.n + ' | over 25 ms: ' + st.long + ' | longest ' + Math.round(st.max) + ' ms | worst after a press ' + st.worst + ' ms | last presses (ms of the 6 frames after, steps): ' + st.after.map((a) => a.d.join(',') + ' [' + a.s.join('') + ']').join('  /  ');
    }
    const STEP = 1000 / 60;
    function frame(t) {
      const dt = t - last; let nsteps = 0;
      // One late frame on its own is forgiven: it counts as one step, and the time it lost is not made up. Measured on an iPhone
      // 15 Pro (2026-10-13): the frame after every touch comes 26 ms late (43 ms, then 7 ms) whatever the page does, in Safari and
      // in Chrome, and making the time up moved everything two steps at once: a stop, then a jump back into place. The late frame
      // itself cannot be helped from a page (a worker with an OffscreenCanvas took it away but its frames landed unevenly on the
      // screen, which looked worse; see DECISIONS.md). A device that is slow all the time (two late frames in a row) keeps the real
      // time, so the game does not run in slow motion there.
      const lone = dt > 25 && dt < 70 && lastDt < 22;
      acc += lone ? STEP - acc : Math.min(100, dt); last = t; lastDt = dt;
      if (lone) hold = 2;                                        // and the short frame that follows it is one step as well
      else if (hold && dt < 12) { acc = STEP; hold--; } else hold = 0;
      // On a 60 Hz screen a frame is one step, whatever the clock says to the millisecond: with the plain accumulator a frame now and
      // then got no step and the next one two, which looked like dropped frames.
      // Only when the frame itself took about 1/60 s: on a screen of 75 or 144 Hz the same rule would run the game too fast.
      if (Math.abs(dt - STEP) < 2.5 && Math.abs(acc - STEP) < 5 || lone || hold) { step(); acc = 0; nsteps = 1; } else while (acc >= STEP) { step(); acc -= STEP; nsteps++; }
      if (FPS) fpsNote(dt, nsteps);
      // The picture is drawn between the last two steps, by how far the clock is into the next one, so that a screen that is not
      // at 60 Hz shows even movement.
      draw(acc / STEP);
      env.raf(frame);
    }
    msg.textContent = TX.start;
    env.raf((t) => { last = t; frame(t); });
    return { press, pause, save: () => saveHi(true), setHi: (v) => { if (v > hi) { hi = saved = v; } } };
  }

  // The page side: the words, the night sky, the keys, the touches, the game pad, and the best score.
  const SEARCH = location.search, { JA, TX } = texts(SEARCH);
  window.__runner = { stats: { dead: 0, shifts: 0, spawns: 0 } };          // read by the tests
  document.documentElement.lang = JA ? 'ja' : 'zh-Hant';
  document.title = TX.ttl + '｜星ノ海琉璃';
  document.getElementById('ttl').textContent = TX.ttl;
  const howEl = document.getElementById('how'), msgEl = document.getElementById('msg');
  howEl.textContent = TX.how;
  const back = document.getElementById('back'); back.textContent = TX.back; back.href = JA ? '/ja/' : '/';
  // The night sky, as on the other pages.
  const W0 = Math.max(screen.width, innerWidth), H0 = Math.max(screen.height, innerHeight);
  const stars = (n, a) => Array.from({ length: n }, () => Math.round(Math.random() * W0) + 'px ' + Math.round(Math.random() * H0) + 'px 0 rgba(255,255,255,' + (a * (.5 + Math.random() / 2)).toFixed(2) + ')').join(',');
  document.querySelectorAll('#sky i').forEach((el, i) => { el.style.boxShadow = stars([260, 110, 36][i], [.5, .75, 1][i]); });

  const css = getComputedStyle(document.documentElement);
  const color = (v, d) => (css.getPropertyValue(v) || d).trim() || d;
  let hi = 0, best = 0;
  try { hi = +localStorage.getItem('runner-hi') || 0; } catch (e) {}
  best = hi;
  const keep = () => { if (best > hi) { hi = best; try { localStorage.setItem('runner-hi', hi); } catch (e) {} if (window.RuriAccount) RuriAccount.savedChanged(); } };
  // how many screen pixels one game pixel takes, as a whole number (2 on most phones, 1 or 2 on a computer)
  const cvw = document.getElementById('cv').getBoundingClientRect().width || 640;
  const scale = Math.max(1, Math.min(4, Math.ceil(cvw * (window.devicePixelRatio || 1) / 640 - .15)));
  const api = core({
    search: SEARCH, hi, fg: color('--fg', '#ddd'), mut: color('--mut', '#99a'), scale, canvas: document.getElementById('cv'), stats: window.__runner.stats,
    makeCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    msg: (v) => { msgEl.textContent = v; }, how: (v) => { howEl.textContent = v; },
    saveHi: (v, now) => { best = Math.max(best, v); if (now) keep(); }, raf: (f) => requestAnimationFrame(f),
    start: () => window.RuriAccount && RuriAccount.start(),
    // the cards of the badges first, then (when the score can go on the leaderboard) the leaderboard's own
    over: (star, rainbow, sc) => { const q = []; if (best >= star && !has('star')) q.push('star'); if (best >= rainbow && !has('rainbow')) q.push('rainbow');
      cards(q, false, () => window.RuriAccount && RuriAccount.over({ value: sc, meta: { touch: 'ontouchstart' in window } })); },
  });

  // The badges. When a game ends with a best score that has reached one (the starry snail, then the rainbow snail), a card comes
  // up with its picture and asks the player to go back to the front page and look for what has changed (without saying where:
  // user, 2026-10-14). Each card once only (kept in the storage). Two won in the same game come one after the other, each to be
  // closed with its cross or by a tap beside it. No jump is taken while one is up. ?badge shows both again for a look.
  // The picture chosen on the site (app.js, runner-face) becomes the badge just won.
  const KEY = { star: 'runner-badge-star', rainbow: 'runner-badge-rainbow' };
  const has = (k) => { try { return !!localStorage.getItem(KEY[k]) || (k === 'star' && !!localStorage.getItem('runner-badge')); } catch (e) { return true; } };
  let cardUp = false, cardGone = 0;
  function cards(list, force, done) {
    const k = list.shift();
    if (!k) { if (done) done(); return; }
    if (!force) { try { localStorage.setItem(KEY[k], '1'); localStorage.setItem('runner-face', k); } catch (e) { return; } if (window.RuriAccount) RuriAccount.savedChanged(); }
    cardUp = true;
    const el = document.createElement('div');
    el.id = 'badge'; el.className = k;
    el.innerHTML = '<div class="card" role="dialog" aria-modal="true"><button type="button" class="x" aria-label="' + TX.close + '">✕</button>' +
      '<div class="rays"></div><img src="/runner/snail-' + k + '.png" alt="" width="160" height="160">' +
      '<h2>' + (k === 'star' ? TX.badge : TX.badgeR) + '</h2>' +
      // with another card to come, this one has neither the hint nor the way to the front page: both are on the last one
      (list.length ? '' : '<p>' + TX.badge2 + '</p><a class="go" href="' + (JA ? '/ja/' : '/') + '">' + TX.home + '</a>') + '</div>';
    const shut = () => { el.remove(); cardUp = false; cardGone = performance.now(); setTimeout(() => cards(list, force, done), list.length ? 250 : 0); };
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.x')) shut(); });
    document.body.appendChild(el);
  }
  if (/[?&]badge/.test(SEARCH)) setTimeout(() => cards(['star', 'rainbow'], true), 600);
  // The leaderboard, sign-in and the cloud save (games/account.js): shows nothing until an API is set there. No score from the
  // test addresses (?score=N, ?bot). Saves merge both ways: the higher best score, every badge either side has.
  let raBusy = false;
  if (window.RuriAccount) RuriAccount.mount({
    game: 'runner', lang: JA ? 'ja' : 'zh', slot: document.getElementById('board'), noBoard: /[?&](score=|bot)/.test(SEARCH),
    busy: (b) => { raBusy = b; if (!b) cardGone = performance.now(); },
    keys: ['runner-hi', 'runner-badge-star', 'runner-badge-rainbow', 'runner-badge', 'runner-face'],
    merge: (a, b) => { const m = { ...b, ...a }; m['runner-hi'] = String(Math.max(+a['runner-hi'] || 0, +b['runner-hi'] || 0)); return m; },
    reload: () => { const h = +localStorage.getItem('runner-hi') || 0; if (h > hi) { hi = best = h; api.setHi(h); } },
  });
  const press = () => { if (!cardUp && !raBusy && performance.now() - cardGone > 350) api.press(); };
  addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) press(); } });
  // A tap anywhere on the page, not only on the picture, so that a thumb need not cover the game on a phone. The listeners promise
  // not to refuse the default (passive); scrolling and zooming are switched off in the style sheet (touch-action: none).
  document.addEventListener('touchstart', (e) => { if (e.target.closest && e.target.closest('a')) return; press(); }, { passive: true });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.target.closest('a')) return; press(); }, { passive: true });
  // No menu of the browser in the middle of a game: the long press (context menu), the start of a selection, a double tap.
  // The link back is the one thing that keeps its normal behaviour.
  for (const ev of ['contextmenu', 'selectstart', 'dblclick', 'gesturestart']) {
    document.addEventListener(ev, (e) => { if (!(e.target.closest && e.target.closest('a'))) e.preventDefault(); });
  }
  addEventListener('blur', () => api.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) api.pause(); });
  addEventListener('pagehide', () => { api.save(); keep(); });
  // A game pad: the A button (or any of the four face buttons), up on the direction pad, or the stick pushed up. The browser only
  // shows a pad after one of its buttons has been pressed, and it has no event for a press: the state is read at every frame.
  let padDown = false;
  function pollPad() {
    if (!navigator.getGamepads) return;
    let down = false;
    for (const p of navigator.getGamepads()) {
      if (!p || !p.connected) continue;
      const b = p.buttons, on = (i) => b[i] && (b[i].pressed || b[i].value > .5);
      if (on(0) || on(1) || on(2) || on(3) || on(12) || (p.axes.length > 1 && p.axes[1] < -.5) || (p.axes.length > 3 && p.axes[3] < -.5)) down = true;
    }
    if (down && !padDown) press();
    padDown = down;
  }
  (function padLoop() { pollPad(); requestAnimationFrame(padLoop); })();
})();
