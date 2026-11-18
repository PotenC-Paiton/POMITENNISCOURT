// POTENC Tennis — dashboard anggota & booking lapangan (Firebase Auth + Firestore)
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const C = window.COURT_CONFIG || {};
const STEP = C.slotMinutes || 60;
const OPEN = (C.openHour ?? 6) * 60;
const CLOSE = (C.closeHour ?? 22) * 60;
const DAYS_AHEAD = C.daysAhead || 14;
const COURTS = C.courts && C.courts.length ? C.courts : ['Lapangan 1'];
const AUTH_DOMAIN = C.authDomain || 'potenc.tennis';
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const pad = n => String(n).padStart(2, '0');
const fmtMin = m => pad(Math.floor(m / 60)) + '.' + pad(m % 60);
const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dayDate = i => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; };
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const longDate = d => DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
const shortDate = d => DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slotStarts = () => { const o = []; for (let m = OPEN; m + STEP <= CLOSE; m += STEP) o.push(m); return o; };
const slotId = (date, courtIdx, start) => `${date}_${courtIdx}_${pad(Math.floor(start / 60))}${pad(start % 60)}`;
const emailOf = u => `${u}@${AUTH_DOMAIN}`;
const USER_RE = /^[a-z0-9._-]{3,20}$/;

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}
function setMsg(id, text, kind) { const e = $(id); e.textContent = text || ''; e.className = 'form-msg' + (kind ? ' ' + kind : ''); }
function showView(name) { ['setup', 'auth', 'pending', 'app'].forEach(v => { $('view-' + v).hidden = v !== name; }); }
function busy(form, on) { form.querySelectorAll('button[type=submit]').forEach(b => { b.disabled = on; }); }

function authError(e) {
  const c = e && e.code || '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Username atau password salah.';
  if (c === 'auth/email-already-in-use') return 'Username sudah dipakai, pilih yang lain.';
  if (c === 'auth/weak-password') return 'Password minimal 6 karakter.';
  if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (c === 'auth/network-request-failed') return 'Tidak ada koneksi internet.';
  if (c === 'auth/operation-not-allowed') return 'Login Email/Password belum diaktifkan di Firebase Console.';
  if (c === 'permission-denied') return 'Akses ditolak oleh aturan keamanan.';
  return (e && e.message) || 'Terjadi kesalahan.';
}

// ── state ──────────────────────────────────────────────
let F = null;           // modul firebase
let auth, db;
let me = null;          // {uid, ...data user}
let unsubs = [];        // listener data
let unsubMe = null;
const S = { bookings: new Map(), closed: new Map(), recurring: [], users: [] };
let dayIdx = 0, courtIdx = 0, memberFilter = 'pending', page = 'home';
let started = false;

const isPengurus = () => me && me.status === 'approved' && me.role === 'pengurus';

// ── boot ───────────────────────────────────────────────
document.title = (C.siteName || 'POTENC Tennis');
$$('.brand-name').forEach(e => { e.textContent = C.siteName || 'POTENC Tennis'; });
$$('.brand-tag').forEach(e => { e.textContent = C.tagline || ''; });
$('unit-list').innerHTML = (C.units || []).map(u => `<option value="${esc(u)}">`).join('');
$('rules').innerHTML = (C.rules || []).map(r => `<li>${esc(r)}</li>`).join('');

if (!firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
  showView('setup');
} else {
  boot().catch(e => { console.error(e); showView('setup'); $('view-setup').querySelector('p').textContent = 'Gagal memuat Firebase: ' + e.message; });
}

async function boot() {
  const [app, a, f] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
  ]);
  F = { ...a, ...f };
  const fbApp = app.initializeApp(firebaseConfig);
  auth = a.getAuth(fbApp);
  db = f.getFirestore(fbApp);
  wireStatic();
  a.onAuthStateChanged(auth, onAuth);
}

// ── auth ───────────────────────────────────────────────
function onAuth(user) {
  if (unsubMe) { unsubMe(); unsubMe = null; }
  stopData();
  me = null;
  if (!user) { showView('auth'); return; }
  unsubMe = F.onSnapshot(F.doc(db, 'users', user.uid), snap => {
    if (!snap.exists()) {
      me = null;
      pendingView('Data akun tidak ditemukan',
        'Akun login ada, tetapi data pendaftarannya tidak ada (mungkin dihapus pengurus atau pendaftaran terputus). Ajukan ulang agar pengurus bisa memverifikasi.', true);
      return;
    }
    me = { uid: user.uid, ...snap.data() };
    document.body.classList.toggle('is-pengurus', isPengurus());
    if (me.status === 'approved') { enterApp(); return; }
    stopData();
    if (me.status === 'rejected') pendingView('Akun tidak aktif', 'Pendaftaran Anda ditolak atau akun dinonaktifkan pengurus. Hubungi pengurus bila ini keliru.');
    else pendingView('Menunggu verifikasi', `Halo ${me.name || me.username}, pendaftaran Anda sudah diterima dan sedang menunggu verifikasi pengurus. Halaman ini akan terbuka otomatis setelah disetujui.`);
  }, err => { console.error(err); pendingView('Gagal memuat akun', authError(err)); });
}

function pendingView(title, text, reapply) {
  $('pending-title').textContent = title;
  $('pending-text').textContent = text;
  let btn = $('btn-reapply');
  if (reapply && !btn) {
    btn = document.createElement('button');
    btn.id = 'btn-reapply'; btn.type = 'button'; btn.className = 'btn primary'; btn.textContent = 'Ajukan ulang';
    btn.style.marginRight = '8px';
    btn.addEventListener('click', reapplyAccount);
    $('view-pending').querySelector('[data-action=logout]').before(btn);
  }
  if (btn) btn.hidden = !reapply;
  showView('pending');
}

async function reapplyAccount() {
  const u = auth.currentUser; if (!u) return;
  const username = (u.email || '').split('@')[0];
  const name = prompt('Nama lengkap:', username) || username;
  try {
    await F.setDoc(F.doc(db, 'users', u.uid), { username, name, unit: '', phone: '', role: 'member', status: 'pending', createdAt: F.serverTimestamp() });
    toast('Pendaftaran diajukan ulang.');
  } catch (e) { alert(authError(e)); }
}

async function doLogin(ev) {
  ev.preventDefault();
  const form = ev.target, u = $('li-user').value.trim().toLowerCase(), p = $('li-pass').value;
  if (!USER_RE.test(u)) { setMsg('li-msg', 'Username tidak valid.', 'err'); return; }
  busy(form, true); setMsg('li-msg', 'Memeriksa…');
  try { await F.signInWithEmailAndPassword(auth, emailOf(u), p); setMsg('li-msg', ''); form.reset(); }
  catch (e) { setMsg('li-msg', authError(e), 'err'); }
  finally { busy(form, false); }
}

async function doRegister(ev) {
  ev.preventDefault();
  const form = ev.target;
  const u = $('rg-user').value.trim().toLowerCase(), name = $('rg-name').value.trim();
  const unit = $('rg-unit').value.trim(), phone = $('rg-phone').value.trim();
  const p1 = $('rg-pass').value, p2 = $('rg-pass2').value;
  if (!USER_RE.test(u)) { setMsg('rg-msg', 'Username 3–20 karakter: huruf kecil, angka, titik, _ atau -.', 'err'); return; }
  if (!name) { setMsg('rg-msg', 'Nama wajib diisi.', 'err'); return; }
  if (p1.length < 6) { setMsg('rg-msg', 'Password minimal 6 karakter.', 'err'); return; }
  if (p1 !== p2) { setMsg('rg-msg', 'Ulangi password tidak sama.', 'err'); return; }
  busy(form, true); setMsg('rg-msg', 'Mendaftarkan…');
  let cred = null;
  try {
    cred = await F.createUserWithEmailAndPassword(auth, emailOf(u), p1);
    await F.setDoc(F.doc(db, 'users', cred.user.uid), { username: u, name, unit, phone, role: 'member', status: 'pending', createdAt: F.serverTimestamp() });
    form.reset(); setMsg('rg-msg', '');
  } catch (e) {
    setMsg('rg-msg', authError(e), 'err');
    // data profil gagal tersimpan → hapus akun login agar username bisa dipakai lagi
    if (cred && cred.user) { try { await F.deleteUser(cred.user); } catch (x) { console.error(x); } }
  } finally { busy(form, false); }
}

async function doLogout() { stopData(); await F.signOut(auth); }

// ── data listeners ─────────────────────────────────────
function stopData() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; started = false; }

function enterApp() {
  showView('app');
  document.body.classList.toggle('is-pengurus', isPengurus());
  $('greet').textContent = 'Halo, ' + (me.name || me.username) + (isPengurus() ? ' (Pengurus)' : '');
  fillProfile();
  if (!isPengurus() && (page === 'members' || page === 'court')) goPage('home');
  if (started && started === me.role) { renderAll(); return; }
  if (started) stopData();          // peran berubah (mis. diangkat jadi pengurus) → pasang ulang listener
  started = me.role;
  const from = isoDate(dayDate(0)), to = isoDate(dayDate(DAYS_AHEAD - 1));
  const onErr = e => { console.error(e); toast('Gagal memuat data: ' + authError(e)); };
  unsubs.push(F.onSnapshot(F.query(F.collection(db, 'bookings'), F.where('date', '>=', from), F.where('date', '<=', to)), snap => {
    S.bookings = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }])); renderAll();
  }, onErr));
  unsubs.push(F.onSnapshot(F.collection(db, 'closed'), snap => {
    S.closed = new Map(snap.docs.map(d => [d.id, d.data()])); renderAll();
  }, onErr));
  unsubs.push(F.onSnapshot(F.collection(db, 'recurring'), snap => {
    S.recurring = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  }, onErr));
  if (isPengurus()) {
    unsubs.push(F.onSnapshot(F.collection(db, 'users'), snap => {
      S.users = snap.docs.map(d => ({ uid: d.id, ...d.data() })); renderMembers(); renderHome();
    }, onErr));
  }
  renderAll();
}

// ── jadwal: siapa yang memakai slot ────────────────────
function closedReason(iso) { const c = S.closed.get(iso); return c ? (c.reason || 'Tutup') : null; }
function occupant(iso, ci, s) {
  const b = S.bookings.get(slotId(iso, ci, s));
  if (b) return { kind: 'booking', b };
  const wd = fromIso(iso).getDay(), e = s + STEP;
  const r = S.recurring.find(x => Number(x.day) === wd && (x.court ? x.court === COURTS[ci] : ci === 0) && toMin(x.start) < e && toMin(x.end) > s);
  if (r) return { kind: 'recurring', r };
  return null;
}
function isPastSlot(iso, s) {
  if (iso !== isoDate(dayDate(0))) return iso < isoDate(dayDate(0));
  const n = new Date(); return s + STEP <= n.getHours() * 60 + n.getMinutes();
}
function myMinutesOn(iso) { let m = 0; S.bookings.forEach(b => { if (b.uid === me.uid && b.date === iso) m += STEP; }); return m; }

// ── render ─────────────────────────────────────────────
function renderAll() { if (!me || me.status !== 'approved') return; renderHome(); renderBooking(); renderCourt(); }

function renderHome() {
  if (!me) return;
  const today = isoDate(dayDate(0)), starts = slotStarts();
  let taken = 0, free = 0;
  const todayItems = [];
  COURTS.forEach((c, ci) => starts.forEach(s => {
    const o = occupant(today, ci, s);
    if (closedReason(today)) return;
    if (o) { taken++; todayItems.push({ s, c, o }); } else if (!isPastSlot(today, s)) free++;
  }));
  $('st-today').textContent = taken;
  $('st-free').textContent = free;

  // 7 hari ke depan
  const bars = [];
  let weekMin = 0;
  for (let i = 0; i < 7; i++) {
    const iso = isoDate(dayDate(i)); let m = 0;
    if (!closedReason(iso)) COURTS.forEach((c, ci) => starts.forEach(s => { if (occupant(iso, ci, s)) m += STEP; }));
    weekMin += m; bars.push({ d: dayDate(i), h: m / 60, closed: !!closedReason(iso) });
  }
  $('st-week').textContent = Math.round(weekMin / 60 * 10) / 10;
  const maxH = Math.max(1, ...bars.map(b => b.h));
  $('week-bars').innerHTML = bars.map(b => `<div class="bar" title="${esc(longDate(b.d))}"><b>${b.closed ? 'tutup' : b.h}</b><i style="height:${Math.round(b.h / maxH * 100)}%"></i><span>${DAYS[b.d.getDay()].slice(0, 3)}</span></div>`).join('');

  // booking saya (dikelompokkan per grup)
  const groups = new Map();
  S.bookings.forEach(b => {
    if (b.uid !== me.uid || isPastSlot(b.date, b.start)) return;
    const g = groups.get(b.group || b.id) || { date: b.date, court: b.court, start: b.start, end: b.end, ids: [] };
    g.start = Math.min(g.start, b.start); g.end = Math.max(g.end, b.end); g.ids.push(b.id);
    groups.set(b.group || b.id, g);
  });
  const mine = [...groups.values()].sort((a, b) => (a.date + pad(a.start)).localeCompare(b.date + pad(b.start)));
  $('st-mine').textContent = mine.length;
  $('my-bookings').innerHTML = mine.length ? mine.map(g =>
    `<li><span><b>${esc(shortDate(fromIso(g.date)))}</b> · ${fmtMin(g.start)}–${fmtMin(g.end)}${COURTS.length > 1 ? ' · ' + esc(g.court) : ''}</span>
     <button class="btn ghost mini" type="button" data-cancel-group="${esc(g.ids.join(','))}">Batal</button></li>`).join('')
    : '<li class="empty">Belum ada booking. Buka menu Booking untuk memesan lapangan.</li>';

  todayItems.sort((a, b) => a.s - b.s);
  $('today-list').innerHTML = closedReason(today) ? `<li class="empty">Lapangan tutup hari ini: ${esc(closedReason(today))}</li>`
    : todayItems.length ? todayItems.map(x => `<li><span><b>${fmtMin(x.s)}–${fmtMin(x.s + STEP)}</b>${COURTS.length > 1 ? ' · ' + esc(x.c) : ''}</span><span class="muted">${esc(x.o.kind === 'booking' ? x.o.b.name : x.o.r.label)}</span></li>`).join('')
    : '<li class="empty">Belum ada yang memakai lapangan hari ini.</li>';

  if (isPengurus()) {
    const pend = S.users.filter(u => u.status === 'pending').length;
    $('st-members').textContent = S.users.filter(u => u.status === 'approved').length;
    $('st-pending').textContent = pend;
    $('pending-badge').textContent = pend; $('pending-badge').hidden = !pend;
  }
}

function renderBooking() {
  $('court-select').hidden = COURTS.length < 2;
  if (!$('court-select').options.length) $('court-select').innerHTML = COURTS.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('');
  $('day-strip').innerHTML = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = dayDate(i), cl = closedReason(isoDate(d));
    return `<button type="button" class="day-chip${i === dayIdx ? ' active' : ''}${cl ? ' closed' : ''}" data-i="${i}" title="${cl ? esc(cl) : ''}"><small>${DAYS[d.getDay()].slice(0, 3)}</small><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()]}</small></button>`;
  }).join('');
  $('prev-day').disabled = dayIdx === 0;
  $('next-day').disabled = dayIdx === DAYS_AHEAD - 1;
  const d = dayDate(dayIdx), iso = isoDate(d), cl = closedReason(iso);
  $('day-label').textContent = longDate(d);
  $('slots').innerHTML = slotStarts().map(s => {
    const label = fmtMin(s) + ' – ' + fmtMin(s + STEP);
    if (cl) return `<div class="slot past"><span class="t">${label}</span><span class="s">${esc(cl)}</span></div>`;
    const o = occupant(iso, courtIdx, s), past = isPastSlot(iso, s);
    if (o && o.kind === 'booking') {
      const mine = o.b.uid === me.uid;
      const can = (mine && !past) || isPengurus();
      return `<div class="slot ${mine ? 'mine' : 'booked'}${can && !mine ? ' clickable' : ''}" ${can ? `data-booking="${esc(o.b.id)}" role="button" tabindex="0"` : ''}><span class="t">${label}</span><span class="s">${esc(mine ? 'Booking saya' : o.b.name)}</span></div>`;
    }
    if (o) return `<div class="slot booked"><span class="t">${label}</span><span class="s">${esc(o.r.label || 'Jadwal rutin')}</span></div>`;
    if (past) return `<div class="slot past"><span class="t">${label}</span><span class="s">Sudah lewat</span></div>`;
    return `<button type="button" class="slot free" data-s="${s}"><span class="t">${label}</span><span class="s">Tersedia</span></button>`;
  }).join('');
}

function renderMembers() {
  if (!isPengurus()) return;
  const q = $('member-search').value.trim().toLowerCase();
  const cnt = st => S.users.filter(u => u.status === st).length;
  $('mf-pending').textContent = '(' + cnt('pending') + ')';
  $('mf-approved').textContent = '(' + cnt('approved') + ')';
  $('mf-rejected').textContent = '(' + cnt('rejected') + ')';
  const rows = S.users.filter(u => u.status === memberFilter)
    .filter(u => !q || [u.name, u.username, u.unit].some(x => String(x || '').toLowerCase().includes(q)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const when = t => t && t.toDate ? shortDate(t.toDate()) : '-';
  $('member-rows').innerHTML = rows.length ? rows.map(u => {
    const self = u.uid === me.uid;
    let act = '';
    if (u.status === 'pending') act = `<button class="btn primary mini" data-mact="approve" data-uid="${u.uid}">Setujui</button><button class="btn ghost mini" data-mact="reject" data-uid="${u.uid}">Tolak</button>`;
    else if (u.status === 'approved' && !self) act = (u.role === 'pengurus'
      ? `<button class="btn ghost mini" data-mact="member" data-uid="${u.uid}">Jadikan anggota</button>`
      : `<button class="btn ghost mini" data-mact="pengurus" data-uid="${u.uid}">Jadikan pengurus</button>`)
      + `<button class="btn ghost mini" data-mact="reject" data-uid="${u.uid}">Nonaktifkan</button>`;
    else if (u.status === 'rejected') act = `<button class="btn primary mini" data-mact="approve" data-uid="${u.uid}">Aktifkan</button><button class="btn danger mini" data-mact="delete" data-uid="${u.uid}">Hapus</button>`;
    return `<tr><td><b>${esc(u.name)}</b>${self ? ' <span class="muted small">(Anda)</span>' : ''}</td><td>${esc(u.username)}</td><td>${esc(u.unit || '-')}</td><td>${esc(u.phone || '-')}</td>
      <td><span class="role ${u.role === 'pengurus' ? 'pengurus' : ''}">${u.role === 'pengurus' ? 'Pengurus' : 'Anggota'}</span></td><td>${when(u.createdAt)}</td><td class="act">${act}</td></tr>`;
  }).join('') : `<tr><td colspan="7" class="muted">Tidak ada data.</td></tr>`;
}

function renderCourt() {
  if (!isPengurus()) return;
  const today = isoDate(dayDate(0));
  const closed = [...S.closed.entries()].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));
  $('closed-list').innerHTML = closed.length ? closed.map(([d, c]) =>
    `<li><span><b>${esc(longDate(fromIso(d)))}</b> · ${esc(c.reason || '')}</span><button class="btn ghost mini" data-del-closed="${esc(d)}">Hapus</button></li>`).join('')
    : '<li class="empty">Tidak ada tanggal tutup.</li>';
  const rec = [...S.recurring].sort((a, b) => (a.day - b.day) || String(a.start).localeCompare(String(b.start)));
  $('recurring-list').innerHTML = rec.length ? rec.map(r =>
    `<li><span><b>${DAYS[r.day]}</b> ${esc(r.start)}–${esc(r.end)}${COURTS.length > 1 ? ' · ' + esc(r.court || COURTS[0]) : ''} · ${esc(r.label)}</span><button class="btn ghost mini" data-del-rec="${esc(r.id)}">Hapus</button></li>`).join('')
    : '<li class="empty">Belum ada jadwal rutin.</li>';
}

function fillProfile() {
  $('pf-user').value = me.username || '';
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#form-profile')) return;
  $('pf-name').value = me.name || ''; $('pf-unit').value = me.unit || ''; $('pf-phone').value = me.phone || '';
}

// ── aksi booking ───────────────────────────────────────
let pick = null;
function openBook(s) {
  const iso = isoDate(dayDate(dayIdx));
  const limit = isPengurus() ? Infinity : (C.maxHoursPerDay || 2) * 60 - myMinutesOn(iso);
  if (limit < STEP) { toast(`Batas ${C.maxHoursPerDay || 2} jam per hari sudah tercapai.`); return; }
  let n = 0;
  while (s + (n + 1) * STEP <= CLOSE && (n + 1) * STEP <= Math.min(limit, 4 * 60) && !occupant(iso, courtIdx, s + n * STEP)) n++;
  pick = { iso, s };
  $('bk-sum').textContent = COURTS[courtIdx] + ' · ' + longDate(fromIso(iso)) + ' · mulai ' + fmtMin(s);
  $('bk-dur').innerHTML = Array.from({ length: Math.max(1, n) }, (_, i) => {
    const m = (i + 1) * STEP; return `<option value="${m}">${m % 60 ? m + ' menit' : m / 60 + ' jam'} (s/d ${fmtMin(s + m)})</option>`;
  }).join('');
  $('bk-note').value = ''; setMsg('bk-msg', '');
  $('dlg-book').showModal();
}

async function doBook(ev) {
  ev.preventDefault();
  const form = ev.target, mins = Number($('bk-dur').value), { iso, s } = pick;
  const ids = []; for (let m = 0; m < mins; m += STEP) ids.push(slotId(iso, courtIdx, s + m));
  busy(form, true); setMsg('bk-msg', 'Menyimpan…');
  try {
    await F.runTransaction(db, async tx => {
      const refs = ids.map(id => F.doc(db, 'bookings', id));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      if (snaps.some(x => x.exists())) throw new Error('BENTROK');
      refs.forEach((r, i) => tx.set(r, {
        date: iso, court: COURTS[courtIdx], courtIdx, start: s + i * STEP, end: s + (i + 1) * STEP,
        uid: me.uid, username: me.username, name: me.name || me.username, note: $('bk-note').value.trim(),
        group: ids[0], createdAt: F.serverTimestamp(),
      }));
    });
    $('dlg-book').close(); toast('Booking tersimpan.');
  } catch (e) {
    setMsg('bk-msg', e.message === 'BENTROK' ? 'Slot baru saja dibooking orang lain. Pilih slot lain.' : authError(e), 'err');
  } finally { busy(form, false); }
}

let detailIds = [];
function openDetail(id) {
  const b = S.bookings.get(id); if (!b) return;
  detailIds = [...S.bookings.values()].filter(x => (x.group || x.id) === (b.group || b.id)).map(x => x.id);
  const all = detailIds.map(i => S.bookings.get(i));
  const st = Math.min(...all.map(x => x.start)), en = Math.max(...all.map(x => x.end));
  $('dt-body').innerHTML = [['Nama', b.name], ['Username', b.username], ['Tanggal', longDate(fromIso(b.date))], ['Jam', fmtMin(st) + ' – ' + fmtMin(en)],
    ['Lapangan', b.court], ['Catatan', b.note || '-']].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('dt-cancel').hidden = !(b.uid === me.uid || isPengurus());
  setMsg('dt-msg', '');
  $('dlg-detail').showModal();
}

async function cancelIds(ids) {
  const batch = F.writeBatch(db);
  ids.forEach(id => batch.delete(F.doc(db, 'bookings', id)));
  await batch.commit();
}

async function doCancelDetail(ev) {
  ev.preventDefault();
  if (!confirm('Batalkan booking ini?')) return;
  busy(ev.target, true);
  try { await cancelIds(detailIds); $('dlg-detail').close(); toast('Booking dibatalkan.'); }
  catch (e) { setMsg('dt-msg', authError(e), 'err'); }
  finally { busy(ev.target, false); }
}

// ── aksi pengurus ──────────────────────────────────────
async function memberAction(act, uid) {
  const u = S.users.find(x => x.uid === uid); if (!u) return;
  const ref = F.doc(db, 'users', uid);
  try {
    if (act === 'approve') await F.updateDoc(ref, { status: 'approved', approvedBy: me.username, approvedAt: F.serverTimestamp() });
    else if (act === 'reject') { if (!confirm(`${u.status === 'pending' ? 'Tolak pendaftaran' : 'Nonaktifkan akun'} ${u.name}?`)) return; await F.updateDoc(ref, { status: 'rejected', rejectedBy: me.username, rejectedAt: F.serverTimestamp() }); }
    else if (act === 'pengurus') { if (!confirm(`Jadikan ${u.name} pengurus? Pengurus bisa memverifikasi anggota dan mengatur lapangan.`)) return; await F.updateDoc(ref, { role: 'pengurus' }); }
    else if (act === 'member') { if (!confirm(`Turunkan ${u.name} menjadi anggota biasa?`)) return; await F.updateDoc(ref, { role: 'member' }); }
    else if (act === 'delete') { if (!confirm(`Hapus data ${u.name}? Orang ini bisa mengajukan ulang dengan username yang sama.`)) return; await F.deleteDoc(ref); }
    toast('Tersimpan.');
  } catch (e) { alert(authError(e)); }
}

async function addClosed(ev) {
  ev.preventDefault();
  const d = $('cl-date').value, r = $('cl-reason').value.trim();
  if (!d || !r) return;
  try { await F.setDoc(F.doc(db, 'closed', d), { reason: r, by: me.username }); ev.target.reset(); toast('Tanggal tutup ditambahkan.'); }
  catch (e) { alert(authError(e)); }
}
async function addRecurring(ev) {
  ev.preventDefault();
  const day = Number($('rc-day').value), start = $('rc-start').value, end = $('rc-end').value, label = $('rc-label').value.trim();
  if (toMin(end) <= toMin(start)) { alert('Jam selesai harus setelah jam mulai.'); return; }
  try { await F.addDoc(F.collection(db, 'recurring'), { day, start, end, court: COURTS[Number($('rc-court').value) || 0], label, by: me.username }); $('rc-label').value = ''; toast('Jadwal rutin ditambahkan.'); }
  catch (e) { alert(authError(e)); }
}

// ── profil ─────────────────────────────────────────────
async function saveProfile(ev) {
  ev.preventDefault();
  busy(ev.target, true);
  try { await F.updateDoc(F.doc(db, 'users', me.uid), { name: $('pf-name').value.trim(), unit: $('pf-unit').value.trim(), phone: $('pf-phone').value.trim() }); setMsg('pf-msg', 'Tersimpan.', 'ok'); }
  catch (e) { setMsg('pf-msg', authError(e), 'err'); }
  finally { busy(ev.target, false); }
}
async function changePassword(ev) {
  ev.preventDefault();
  const o = $('pw-old').value, n1 = $('pw-new').value, n2 = $('pw-new2').value;
  if (n1.length < 6) { setMsg('pw-msg', 'Password baru minimal 6 karakter.', 'err'); return; }
  if (n1 !== n2) { setMsg('pw-msg', 'Ulangi password baru tidak sama.', 'err'); return; }
  busy(ev.target, true);
  try {
    const u = auth.currentUser;
    await F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, o));
    await F.updatePassword(u, n1);
    ev.target.reset(); setMsg('pw-msg', 'Password diganti.', 'ok');
  } catch (e) { setMsg('pw-msg', e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' ? 'Password lama salah.' : authError(e), 'err'); }
  finally { busy(ev.target, false); }
}

// ── navigasi & event ───────────────────────────────────
function goPage(p) {
  page = p;
  $$('[data-page-view]').forEach(s => { s.hidden = s.dataset.pageView !== p; });
  $$('#mainnav [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  if (p === 'members') renderMembers();
  window.scrollTo({ top: 0 });
}

function wireStatic() {
  $$('[data-auth]').forEach(b => b.addEventListener('click', () => {
    $$('[data-auth]').forEach(x => x.classList.toggle('active', x === b));
    $('form-login').hidden = b.dataset.auth !== 'login';
    $('form-register').hidden = b.dataset.auth !== 'register';
  }));
  $('form-login').addEventListener('submit', doLogin);
  $('form-register').addEventListener('submit', doRegister);
  $$('[data-action=logout]').forEach(b => b.addEventListener('click', doLogout));
  $('mainnav').addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) goPage(b.dataset.page); });

  $('court-select').addEventListener('change', e => { courtIdx = Number(e.target.value); renderBooking(); });
  $('prev-day').addEventListener('click', () => { if (dayIdx > 0) { dayIdx--; renderBooking(); } });
  $('next-day').addEventListener('click', () => { if (dayIdx < DAYS_AHEAD - 1) { dayIdx++; renderBooking(); } });
  $('day-strip').addEventListener('click', e => { const b = e.target.closest('.day-chip'); if (b) { dayIdx = Number(b.dataset.i); renderBooking(); } });
  $('slots').addEventListener('click', e => {
    const f = e.target.closest('.slot.free'); if (f) { openBook(Number(f.dataset.s)); return; }
    const b = e.target.closest('[data-booking]'); if (b) openDetail(b.dataset.booking);
  });
  $('form-book').addEventListener('submit', doBook);
  $('form-detail').addEventListener('submit', doCancelDetail);
  $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  $('my-bookings').addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel-group]'); if (!b) return;
    if (!confirm('Batalkan booking ini?')) return;
    try { await cancelIds(b.dataset.cancelGroup.split(',')); toast('Booking dibatalkan.'); } catch (x) { alert(authError(x)); }
  });

  $('member-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-mf]'); if (!b) return;
    memberFilter = b.dataset.mf; $$('#member-tabs .tab').forEach(x => x.classList.toggle('active', x === b)); renderMembers();
  });
  $('member-search').addEventListener('input', renderMembers);
  $('member-rows').addEventListener('click', e => { const b = e.target.closest('[data-mact]'); if (b) memberAction(b.dataset.mact, b.dataset.uid); });

  const times = []; for (let m = OPEN; m <= CLOSE; m += STEP) times.push(pad(Math.floor(m / 60)) + ':' + pad(m % 60));
  $('rc-day').innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  $('rc-start').innerHTML = times.slice(0, -1).map(t => `<option>${t}</option>`).join('');
  $('rc-end').innerHTML = times.slice(1).map(t => `<option>${t}</option>`).join('');
  $('rc-court').innerHTML = COURTS.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('');
  $('rc-court').hidden = COURTS.length < 2;
  $('form-closed').addEventListener('submit', addClosed);
  $('form-recurring').addEventListener('submit', addRecurring);
  $('closed-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-del-closed]'); if (!b || !confirm('Hapus tanggal tutup ini?')) return;
    try { await F.deleteDoc(F.doc(db, 'closed', b.dataset.delClosed)); } catch (x) { alert(authError(x)); }
  });
  $('recurring-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-del-rec]'); if (!b || !confirm('Hapus jadwal rutin ini?')) return;
    try { await F.deleteDoc(F.doc(db, 'recurring', b.dataset.delRec)); } catch (x) { alert(authError(x)); }
  });

  $('form-profile').addEventListener('submit', saveProfile);
  $('form-password').addEventListener('submit', changePassword);

  // pergantian hari saat aplikasi dibiarkan terbuka
  setInterval(() => { if (me && me.status === 'approved') renderAll(); }, 60000);
}
