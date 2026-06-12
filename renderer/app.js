// Claude Dock — renderer (by Haris AI)
(function () {
  // ---------- pixel robot (15x11) ----------
  var ROWS = [
    "....a.....a....", "....a.....a....", ".ooooooooooooo.",
    ".obbbbbbbbbbbo.", ".obbbbbbbbbbbo.", ".obhpbbbbbhpbo.",
    ".ocppbbbbbppco.", ".obbbbmmmbbbbo.", ".obbbbbbbbbbbo.",
    ".ooooooooooooo.", "...oo.....oo..."
  ];
  function robot(col, w, delay) {
    var map = { a: col.o, o: col.o, b: col.b, h: '#FFFFFF', p: col.pupil || '#0A1628', c: col.cheek || '#FF7FE2', m: col.mouth || col.pupil || '#0A1628' };
    var base = '', eyes = '', ant = '';
    for (var r = 0; r < ROWS.length; r++) { var row = ROWS[r]; for (var c = 0; c < row.length; c++) { var ch = row[c]; if (ch === '.') continue; var f = map[ch]; if (!f || f === 'transparent') continue; var rect = '<rect x="' + c + '" y="' + r + '" width="1" height="1" fill="' + f + '"/>'; if (ch === 'h' || ch === 'p') eyes += rect; else if (ch === 'a') ant += rect; else base += rect; } }
    var h = Math.round(w * ROWS.length / 15); var d = delay || 0;
    return '<svg viewBox="0 0 15 11" width="' + w + '" height="' + h + '" shape-rendering="crispEdges">' + base + '<g class="ant" style="animation-delay:' + (d * 0.7) + 's">' + ant + '</g><g class="eyes" style="animation-delay:' + d + 's">' + eyes + '</g></svg>';
  }
  function darken(hex, f) { var n = parseInt(hex.replace('#', ''), 16); var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; r = Math.round(r * (1 - f)); g = Math.round(g * (1 - f)); b = Math.round(b * (1 - f)); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
  function fileUrl(p) { var s = String(p).replace(/\\/g, '/'); if (!s.startsWith('/')) s = '/' + s; return 'file://' + s; }

  // ---------- elements ----------
  var net = document.getElementById('net'), nodesEl = document.getElementById('nodes'),
      orb = document.getElementById('orb'), agent = document.getElementById('agent'),
      pulseLayer = document.getElementById('pulseLayer'), shockEl = document.getElementById('shock'),
      ctx = document.getElementById('ctx'),
      modalwrap = document.getElementById('modalwrap'), modalTitle = document.getElementById('modalTitle'),
      modalInput = document.getElementById('modalInput'), modalHint = document.getElementById('modalHint'),
      modalOk = document.getElementById('modalOk'), modalCancel = document.getElementById('modalCancel');

  agent.innerHTML = robot({ b: '#1AE3FF', o: '#0B5E78', pupil: '#06223A', cheek: '#FF7FE2', mouth: '#06223A' }, 62, 0);

  // ---------- state ----------
  var clients = [], items = [], nodeEls = [], lineEls = [], glowEls = [];
  var BR = 150, NODE = 64;
  var ox = window.innerWidth / 2, oy = window.innerHeight / 2;
  var expanded = false, dragging = false, dragMoved = false, dragOff = { x: 0, y: 0 };
  var menuOpen = false, modalOpen = false, ignoring = true;

  function setIgnore(flag) { if (flag !== ignoring) { ignoring = flag; if (window.dock) window.dock.setIgnore(flag); } }

  // ---------- build ----------
  function rebuildNodes() {
    nodesEl.innerHTML = ''; net.innerHTML = ''; nodeEls = []; lineEls = []; glowEls = [];
    items = [];
    clients.forEach(function (c) { items.push({ type: 'client', data: c }); });
    items.push({ type: 'add' });

    items.forEach(function (it, i) {
      var gl = document.createElementNS('http://www.w3.org/2000/svg', 'line'); gl.setAttribute('class', 'lineGlow'); net.appendChild(gl); glowEls.push(gl);
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('class', 'line' + (it.type !== 'client' ? ' dash' : '')); net.appendChild(ln); lineEls.push(ln);
      var nn = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); nn.setAttribute('class', 'netnode'); nn.setAttribute('r', '2.6'); net.appendChild(nn); it._nn = nn;

      var node = document.createElement('div'); node.className = 'node';
      var wrap = document.createElement('div'); wrap.className = 'botwrap';
      var bot = document.createElement('div'); bot.className = 'bot'; bot.style.animationDelay = (i * 0.3) + 's';
      var lbl = document.createElement('div'); lbl.className = 'lbl';

      if (it.type === 'add') {
        bot.innerHTML = '<div class="addcircle"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>';
        lbl.textContent = 'Add client';
        node.addEventListener('click', function (e) { e.stopPropagation(); onAdd(); });
      } else {
        var c = it.data; var color = c.color || '#85B7EB';
        var halo = document.createElement('div'); halo.className = 'halo'; halo.style.setProperty('--c', color); wrap.appendChild(halo);
        if (c.avatar) { bot.innerHTML = '<img class="avatar" src="' + fileUrl(c.avatar) + '" style="--c:' + color + '"/>'; }
        else { bot.innerHTML = robot({ b: color, o: darken(color, 0.42), pupil: '#0A1628', cheek: '#FF7FE2', mouth: '#0A1628' }, 46, (i % 5) * 0.6); }
        lbl.textContent = c.displayName || c.id;
        node.addEventListener('click', function (e) { e.stopPropagation(); window.dock.open(c.id); flash(lineEls[i]); });
        node.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); openCtx(e.clientX, e.clientY, c); });
      }
      wrap.appendChild(bot); wrap.appendChild(lbl); node.appendChild(wrap);
      nodesEl.appendChild(node); nodeEls.push(node); it._node = node;
    });
  }

  // ---------- adaptive layout ----------
  function zoneFor(ox, oy) {
    var W = window.innerWidth, H = window.innerHeight;
    var nearL = ox < W * 0.30, nearR = ox > W * 0.70, nearT = oy < H * 0.32, nearB = oy > H * 0.68;
    if ((nearL || nearR) && (nearT || nearB)) { var dir = nearT && nearL ? 45 : nearT && nearR ? 135 : nearB && nearR ? 225 : 315; return { mode: 'corner', dir: dir, arc: 128 }; }
    if (nearL || nearR || nearT || nearB) { var d = nearT ? 90 : nearB ? 270 : nearL ? 0 : 180; return { mode: 'edge', dir: d, arc: 175 }; }
    return { mode: 'center', dir: 0, arc: 360 };
  }
  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    var z = zoneFor(ox, oy); var n = items.length;
    items.forEach(function (it, i) {
      var ang;
      if (z.mode === 'center') ang = -90 + (360 / n) * i;
      else ang = (n === 1) ? z.dir : (z.dir - z.arc / 2 + z.arc * (i / (n - 1)));
      var rad = ang * Math.PI / 180;
      var x = ox + Math.cos(rad) * BR, y = oy + Math.sin(rad) * BR;
      x = Math.max(34, Math.min(W - 34, x)); y = Math.max(34, Math.min(H - 34, y));
      it._x = x; it._y = y;
      lineEls[i].setAttribute('x1', ox); lineEls[i].setAttribute('y1', oy); lineEls[i].setAttribute('x2', x); lineEls[i].setAttribute('y2', y);
      glowEls[i].setAttribute('x1', ox); glowEls[i].setAttribute('y1', oy); glowEls[i].setAttribute('x2', x); glowEls[i].setAttribute('y2', y);
      it._nn.setAttribute('cx', x); it._nn.setAttribute('cy', y);
    });
    orb.style.left = (ox - 52) + 'px'; orb.style.top = (oy - 52) + 'px';
    placeNodes();
  }
  function placeNodes() {
    items.forEach(function (it) {
      if (expanded) { it._node.style.left = (it._x - NODE / 2) + 'px'; it._node.style.top = (it._y - NODE / 2) + 'px'; it._node.classList.add('show'); }
      else { it._node.style.left = (ox - NODE / 2) + 'px'; it._node.style.top = (oy - NODE / 2) + 'px'; it._node.classList.remove('show'); }
    });
    net.style.opacity = expanded ? '1' : '0';
  }
  function expand() { if (expanded) return; expanded = true; placeNodes(); pulseLayer.style.opacity = '1'; buildPulses(); }
  function collapse() { if (!expanded) return; expanded = false; placeNodes(); pulseLayer.style.opacity = '0'; clearPulses(); }

  // ---------- pulses ----------
  var pulseAnims = [];
  function clearPulses() { pulseAnims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); pulseAnims = []; pulseLayer.innerHTML = ''; }
  function buildPulses() {
    clearPulses();
    items.forEach(function (it, i) {
      if (it.type !== 'client') return;
      var d = document.createElement('div'); d.className = 'pulse'; pulseLayer.appendChild(d);
      var a = d.animate([
        { transform: 'translate(' + (ox - 3.5) + 'px,' + (oy - 3.5) + 'px)', opacity: 0 },
        { opacity: 1, offset: .18 }, { opacity: 1, offset: .72 },
        { transform: 'translate(' + (it._x - 3.5) + 'px,' + (it._y - 3.5) + 'px)', opacity: 0 }
      ], { duration: 2600, iterations: Infinity, delay: i * 430, easing: 'linear' });
      pulseAnims.push(a);
    });
  }
  function flash(l) { if (!l) return; l.setAttribute('stroke-width', '3.4'); l.style.opacity = '.95'; setTimeout(function () { l.style.opacity = ''; l.setAttribute('stroke-width', '1.2'); }, 420); }
  function shock() { shockEl.classList.remove('go'); void shockEl.offsetWidth; shockEl.classList.add('go'); }

  // ---------- click-through hit testing ----------
  var CLUSTER = BR + 60;
  function onMove(e) {
    if (dragging) {
      var x = e.clientX - dragOff.x, y = e.clientY - dragOff.y;
      if (!dragMoved && Math.hypot(e.clientX - (ox + dragOff.x), e.clientY - (oy + dragOff.y)) > 0) { /* noop */ }
      if (!dragMoved && Math.hypot(x - ox, y - oy) > 3) { dragMoved = true; document.body.classList.add('dragging'); collapse(); }
      ox = Math.max(54, Math.min(window.innerWidth - 54, x));
      oy = Math.max(54, Math.min(window.innerHeight - 54, y));
      layout();
      return;
    }
    if (menuOpen || modalOpen) { setIgnore(false); return; }
    var d = Math.hypot(e.clientX - ox, e.clientY - oy);
    setIgnore(d >= CLUSTER);
    if (d < 84) expand(); else if (d > CLUSTER) collapse();
  }
  document.addEventListener('mousemove', onMove);
  orb.addEventListener('mousedown', function (e) { e.preventDefault(); dragging = true; dragMoved = false; dragOff = { x: e.clientX - ox, y: e.clientY - oy }; });
  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    var moved = dragMoved; dragging = false; dragMoved = false; document.body.classList.remove('dragging');
    if (moved && window.dock) window.dock.savePos({ x: ox, y: oy });
  });
  orb.addEventListener('dblclick', function (e) { e.preventDefault(); shock(); window.dock.openAll(); });

  // ---------- context menu ----------
  function openCtx(x, y, c) {
    ctx.innerHTML = '';
    var mk = function (label, fn, danger) { var b = document.createElement('button'); b.textContent = label; if (danger) b.className = 'danger'; b.addEventListener('click', function (ev) { ev.stopPropagation(); closeCtx(); fn(); }); ctx.appendChild(b); };
    mk('✏️  Rename', function () { onRename(c); });
    mk('🖼️  Change image', function () { window.dock.pickAvatar(c.id).then(applyList); });
    mk('↺  Reset image', function () { window.dock.resetAvatar(c.id).then(applyList); });
    var sep = document.createElement('div'); sep.className = 'sep'; ctx.appendChild(sep);
    mk('🚫  Hide', function () { window.dock.hide(c.id).then(applyList); }, true);
    ctx.style.left = Math.min(x, window.innerWidth - 170) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    ctx.classList.add('show'); menuOpen = true; setIgnore(false);
  }
  function closeCtx() { ctx.classList.remove('show'); menuOpen = false; }
  document.addEventListener('mousedown', function (e) { if (menuOpen && !ctx.contains(e.target)) closeCtx(); });

  // ---------- modal (add / rename) ----------
  var modalResolve = null;
  function showModal(title, placeholder, hint, okLabel, initial) {
    modalTitle.textContent = title; modalInput.placeholder = placeholder || ''; modalHint.textContent = hint || '';
    modalOk.textContent = okLabel || 'OK'; modalInput.value = initial || '';
    modalwrap.classList.add('show'); modalOpen = true; setIgnore(false);
    setTimeout(function () { modalInput.focus(); modalInput.select(); }, 30);
    return new Promise(function (res) { modalResolve = res; });
  }
  function closeModal(val) { modalwrap.classList.remove('show'); modalOpen = false; var r = modalResolve; modalResolve = null; if (r) r(val); }
  modalOk.addEventListener('click', function () { closeModal(modalInput.value.trim() || null); });
  modalCancel.addEventListener('click', function () { closeModal(null); });
  modalInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') closeModal(modalInput.value.trim() || null); if (e.key === 'Escape') closeModal(null); });

  function onAdd() {
    showModal('Add a client', 'e.g. Sierra', 'One word — letters & numbers', 'Add', '').then(function (name) {
      if (!name) return;
      window.dock.add(name).then(applyList).catch(function (err) { showModal('Try again', 'e.g. Sierra', String(err.message || err), 'Add', name).then(function (n) { if (n) window.dock.add(n).then(applyList).catch(function () {}); }); });
    });
  }
  function onRename(c) {
    showModal('Rename ' + (c.displayName || c.id), 'Display name', 'This only changes the label', 'Save', c.displayName || c.id).then(function (name) {
      if (!name) return; window.dock.rename(c.id, name).then(applyList);
    });
  }

  // ---------- refresh ----------
  function applyList(list) { if (Array.isArray(list)) { clients = list; rebuildNodes(); layout(); if (expanded) buildPulses(); } }
  function refresh() { window.dock.list().then(applyList); }

  // ---------- boot ----------
  function centerAgent() { ox = window.innerWidth / 2; oy = window.innerHeight / 2; layout(); if (window.dock) window.dock.savePos({ x: ox, y: oy }); }
  window.addEventListener('resize', function () { ox = Math.min(ox, window.innerWidth - 54); oy = Math.min(oy, window.innerHeight - 54); layout(); if (expanded) buildPulses(); });

  if (window.dock) {
    window.dock.onChanged(function () { refresh(); });
    window.dock.onCenter(function () { centerAgent(); });
    window.dock.getState().then(function (st) {
      clients = (st && st.clients) || [];
      if (st && st.pos && isFinite(st.pos.x) && isFinite(st.pos.y)) { ox = st.pos.x; oy = st.pos.y; }
      rebuildNodes(); layout();
    });
  } else {
    // fallback for opening the file directly in a browser (no Electron)
    clients = [{ id: 'Sierra', color: '#AFA9EC', displayName: 'Sierra' }, { id: 'Kevin', color: '#97C459', displayName: 'Kevin' }, { id: 'Aditya', color: '#FAC775', displayName: 'Aditya' }, { id: 'Brandon', color: '#85B7EB', displayName: 'Brandon' }];
    rebuildNodes(); layout();
  }
})();
