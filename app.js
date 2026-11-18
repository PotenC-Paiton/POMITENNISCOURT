// POTENC Tennis — dashboard anggota & booking lapangan (Firebase Auth + Firestore)
import { firebaseConfig } from './firebase-config.js?v=20261118h';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const C = window.COURT_CONFIG || {};
const STEP = C.slotMinutes || 60;
const OPEN = (C.openHour ?? 6) * 60;
const CLOSE = (C.closeHour ?? 22) * 60;
const DAYS_AHEAD = C.daysAhead || 14;
const COURTS = C.courts && C.courts.length ? C.courts : ['Court 1'];
const AUTH_DOMAIN = C.authDomain || 'potenc.tennis';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const pad = n => String(n).padStart(2, '0');
const fmtMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
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
const USER_RE = /^[a-z0-9._-]{3,20}$/;   // login: tetap menerima username lama (mis. potenc.admin)
const NEW_USER_RE = /^[a-z0-9]{3,20}$/;   // daftar baru: cukup huruf dan angka

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
}
function setMsg(id, text, kind) { const e = $(id); e.textContent = text || ''; e.className = 'form-msg' + (kind ? ' ' + kind : ''); }
function showView(name) { ['setup', 'auth', 'pending', 'app'].forEach(v => { $('view-' + v).hidden = v !== name; }); }
function busy(form, on) { form.querySelectorAll('button[type=submit]').forEach(b => { b.disabled = on; }); }

function authError(e) {
  const c = e && e.code || '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Incorrect username or password.';
  if (c === 'auth/email-already-in-use') return 'That username is already taken. Please choose another.';
  if (c === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (c === 'auth/too-many-requests') return 'Too many attempts. Please try again in a few minutes.';
  if (c === 'auth/network-request-failed') return 'No internet connection.';
  if (c === 'auth/operation-not-allowed') return 'Email/Password sign-in is not enabled in the Firebase Console.';
  if (c === 'permission-denied') return 'Access denied by security rules.';
  return (e && e.message) || 'Something went wrong.';
}

// ── state ──────────────────────────────────────────────
let F = null;           // modul firebase
let auth, db;
let me = null;          // {uid, ...data user}
let unsubs = [];        // listener data
let unsubMe = null;
const S = { bookings: new Map(), closed: new Map(), recurring: [], users: [], notices: [] };
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
  boot().catch(e => { console.error(e); showView('setup'); $('view-setup').querySelector('p').textContent = 'Failed to load Firebase: ' + e.message; });
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
      pendingView('Account record not found',
        'Your login exists, but its registration record is missing (it may have been deleted by an admin, or registration was interrupted). Re-apply so an admin can approve you.', true);
      return;
    }
    me = { uid: user.uid, ...snap.data() };
    document.body.classList.toggle('is-pengurus', isPengurus());
    if (me.status === 'approved') { enterApp(); return; }
    stopData();
    if (me.status === 'rejected') pendingView('Account inactive', 'Your registration was rejected or your account was deactivated by an admin. Contact an admin if you think this is a mistake.');
    else pendingView('Awaiting approval', `Hi ${me.name || me.username}, your registration has been received and is waiting for admin approval. This page will open automatically once you are approved.`);
  }, err => { console.error(err); pendingView('Failed to load account', authError(err)); });
}

function pendingView(title, text, reapply) {
  $('pending-title').textContent = title;
  $('pending-text').textContent = text;
  let btn = $('btn-reapply');
  if (reapply && !btn) {
    btn = document.createElement('button');
    btn.id = 'btn-reapply'; btn.type = 'button'; btn.className = 'btn primary'; btn.textContent = 'Re-apply';
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
  const name = prompt('Full name:', username) || username;
  try {
    await F.setDoc(F.doc(db, 'users', u.uid), { username, name, unit: '', phone: '', role: 'member', status: 'pending', createdAt: F.serverTimestamp() });
    toast('Registration submitted again.');
  } catch (e) { alert(authError(e)); }
}

async function doLogin(ev) {
  ev.preventDefault();
  const form = ev.target, u = $('li-user').value.trim().toLowerCase(), p = $('li-pass').value;
  if (!USER_RE.test(u)) { setMsg('li-msg', 'Invalid username.', 'err'); return; }
  busy(form, true); setMsg('li-msg', 'Signing in…');
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
  if (/\s/.test(u)) { setMsg('rg-msg', 'Username cannot contain spaces. Use letters and numbers only.', 'err'); return; }
  if (!NEW_USER_RE.test(u)) { setMsg('rg-msg', 'Username: letters and numbers only, 3–20 characters (e.g. budi01).', 'err'); return; }
  if (!name) { setMsg('rg-msg', 'Full name is required.', 'err'); return; }
  if (p1.length < 6) { setMsg('rg-msg', 'Password: at least 6 characters (letters and/or numbers).', 'err'); return; }
  if (p1 !== p2) { setMsg('rg-msg', 'Passwords do not match.', 'err'); return; }
  busy(form, true); setMsg('rg-msg', 'Registering…');
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
  $('greet').textContent = 'Hi, ' + (me.name || me.username) + (isPengurus() ? ' (Admin)' : '');
  fillProfile();
  if (!isPengurus() && (page === 'members' || page === 'court' || page === 'approvals')) goPage('home');
  if (started && started === me.role) { renderAll(); return; }
  if (started) stopData();          // peran berubah (mis. diangkat jadi pengurus) → pasang ulang listener
  started = me.role;
  // mulai dari Senin minggu ini, supaya reservasi yang sudah lewat di minggu ini ikut terhitung kuota
  const from = weekStart(isoDate(dayDate(0))), to = isoDate(dayDate(DAYS_AHEAD - 1));
  const onErr = e => { console.error(e); toast('Failed to load data: ' + authError(e)); };
  unsubs.push(F.onSnapshot(F.query(F.collection(db, 'bookings'), F.where('date', '>=', from), F.where('date', '<=', to)), snap => {
    S.bookings = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }])); renderAll();
  }, onErr));
  unsubs.push(F.onSnapshot(F.collection(db, 'closed'), snap => {
    S.closed = new Map(snap.docs.map(d => [d.id, d.data()])); renderAll();
  }, onErr));
  unsubs.push(F.onSnapshot(F.collection(db, 'recurring'), snap => {
    S.recurring = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAll();
  }, onErr));
  // notifikasi milik saya (booking disetujui / ditolak / dibatalkan admin)
  unsubs.push(F.onSnapshot(F.query(F.collection(db, 'notices'), F.where('uid', '==', me.uid)), snap => {
    S.notices = snap.docs.map(d => ({ id: d.id, ...d.data() })); safeRender('Notices', renderNotices);
  }, e => console.warn('notices', e)));
  if (isPengurus()) {
    unsubs.push(F.onSnapshot(F.collection(db, 'users'), snap => {
      S.users = snap.docs.map(d => ({ uid: d.id, ...d.data() })); renderMembers(); safeRender('Dashboard', renderHome);
    }, onErr));
  }
  renderAll();
}

// ── status booking ─────────────────────────────────────
// booking lama tanpa field status dianggap sudah disetujui
const isPendingB = b => b && b.status === 'pending';
// kelompokkan dokumen slot menjadi reservasi (satu grup = satu reservasi)
function groupBookings(filter) {
  const groups = new Map();
  S.bookings.forEach(b => {
    if (!filter(b)) return;
    const k = b.group || b.id;
    const g = groups.get(k) || { key: k, date: b.date, court: b.court, start: b.start, end: b.end, ids: [], uid: b.uid, name: b.name, username: b.username, note: b.note, pending: isPendingB(b), createdAt: b.createdAt };
    g.start = Math.min(g.start, b.start); g.end = Math.max(g.end, b.end); g.ids.push(b.id);
    groups.set(k, g);
  });
  return [...groups.values()].sort((a, b) => (a.date + pad(a.start)).localeCompare(b.date + pad(b.start)));
}
async function notify(uid, text, kind) {
  try { await F.addDoc(F.collection(db, 'notices'), { uid, text, kind, by: me.username, createdAt: F.serverTimestamp() }); }
  catch (e) { console.warn('notice not sent', e); }
}
async function approveGroup(g) {
  const batch = F.writeBatch(db);
  g.ids.forEach(id => batch.update(F.doc(db, 'bookings', id), { status: 'approved', approvedBy: me.username, approvedAt: F.serverTimestamp() }));
  await batch.commit();
  await notify(g.uid, `Your booking on ${shortDate(fromIso(g.date))}, ${fmtMin(g.start)}–${fmtMin(g.end)} (${g.court}) was approved.`, 'approved');
  toast('Booking approved.');
}
async function rejectGroup(g, verb) {
  const reason = prompt(`${verb === 'cancelled' ? 'Cancel' : 'Reject'} the booking of ${g.name}, ${shortDate(fromIso(g.date))} ${fmtMin(g.start)}–${fmtMin(g.end)}?\nReason (optional):`, '');
  if (reason === null) return false;
  await cancelIds(g.ids);
  await notify(g.uid, `Your booking on ${shortDate(fromIso(g.date))}, ${fmtMin(g.start)}–${fmtMin(g.end)} (${g.court}) was ${verb} by an admin.${reason.trim() ? ' Reason: ' + reason.trim() : ''}`, verb);
  toast(verb === 'cancelled' ? 'Booking cancelled.' : 'Booking rejected.');
  return true;
}
function groupOf(id) { const b = S.bookings.get(id); return b ? groupBookings(x => (x.group || x.id) === (b.group || b.id))[0] : null; }

// ── jadwal: siapa yang memakai slot ────────────────────
function closedReason(iso) { const c = S.closed.get(iso); return c ? (c.reason || 'Closed') : null; }
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
// Minggu = Senin s/d Minggu. Mengembalikan tanggal Senin (ISO) dari minggu tanggal tsb.
function weekStart(iso) { const d = fromIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); }
// Jumlah reservasi (grup booking) milik saya di minggu yang sama dengan tanggal iso
function myReservationsInWeek(iso) {
  const ws = weekStart(iso), groups = new Set();
  S.bookings.forEach(b => { if (b.uid === me.uid && weekStart(b.date) === ws) groups.add(b.group || b.id); });
  return groups.size;
}
const MAX_RES = C.maxReservationsPerWeek || 2;
const MAX_RES_MIN = (C.maxHoursPerReservation || 2) * 60;

// ── render ─────────────────────────────────────────────
// Setiap bagian digambar terpisah: bila satu gagal, bagian lain tetap tampil dan pesan errornya terlihat.
function safeRender(name, fn) {
  try { fn(); }
  catch (e) {
    console.error('Failed to render ' + name, e);
    const box = $('render-error');
    if (box) { box.hidden = false; box.textContent = `Part of the page failed to load (${name}): ${e && e.message}. Try reloading (Ctrl+F5); if it keeps appearing, send this message to the app admin.`; }
  }
}
function renderAll() {
  if (!me || me.status !== 'approved') return;
  safeRender('Dashboard', renderHome); safeRender('Booking', renderBooking); safeRender('Manage Courts', renderCourt);
  safeRender('Approvals', renderApprovals);
}

function renderNotices() {
  const list = [...(S.notices || [])].sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0)).slice(0, 10);
  $('notices').hidden = !list.length;
  $('notices').innerHTML = list.map(n => `<div class="notice ${esc(n.kind || '')}"><span>${esc(n.text)}</span><button type="button" class="btn ghost mini" data-dismiss="${esc(n.id)}">Dismiss</button></div>`).join('');
}

function renderApprovals() {
  if (!isPengurus()) return;
  const pend = groupBookings(b => isPendingB(b) && !isPastSlot(b.date, b.start));
  $('appr-n').textContent = pend.length; $('appr-card').hidden = !pend.length;
  $('appr-badge').textContent = pend.length; $('appr-badge').hidden = !pend.length;
  const when = t => t && t.toDate ? shortDate(t.toDate()) + ' ' + fmtMin(t.toDate().getHours() * 60 + t.toDate().getMinutes()) : '-';
  $('appr-rows').innerHTML = pend.length ? pend.map(g => `<tr>
      <td><b>${esc(g.name)}</b><div class="muted small">${esc(g.username || '')}</div></td>
      <td>${esc(longDate(fromIso(g.date)))}</td><td><b>${fmtMin(g.start)}–${fmtMin(g.end)}</b></td><td>${esc(g.court)}</td>
      <td>${esc(g.note || '-')}</td><td>${when(g.createdAt)}</td>
      <td class="act"><button class="btn primary mini" data-appr="${esc(g.key)}">Approve</button><button class="btn ghost mini" data-rej="${esc(g.key)}">Reject</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No bookings waiting for approval.</td></tr>';
}

function renderHome() {
  if (!me) return;
  const today = isoDate(dayDate(0)), starts = slotStarts(), cl = closedReason(today);
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const label = o => o.kind === 'booking' ? (isPendingB(o.b) ? 'Requested by ' + o.b.name + ' (pending)' : 'Booked by ' + o.b.name) : 'Booked: ' + (o.r.label || 'recurring schedule');

  // ── status tiap lapangan sekarang ──
  $('now-grid').innerHTML = COURTS.map((c, ci) => {
    let cls = 'free', state = 'Free', sub = '';
    if (cl) { cls = 'off'; state = 'Closed'; sub = cl; }
    else if (nowMin < OPEN || nowMin >= CLOSE) {
      cls = 'off'; state = 'Outside opening hours';
      sub = 'Open ' + fmtMin(OPEN) + ' – ' + fmtMin(CLOSE);
    } else {
      const cur = starts.find(s => s <= nowMin && nowMin < s + STEP);
      const o = occupant(today, ci, cur);
      if (o) {
        let end = cur + STEP;   // perpanjang selama slot berikutnya dipakai orang/jadwal yang sama
        while (end < CLOSE) { const n = occupant(today, ci, end); if (!n || label(n) !== label(o)) break; end += STEP; }
        const mine = o.kind === 'booking' && o.b.uid === me.uid;
        cls = mine ? 'mine' : 'busy'; state = mine ? 'In use by you' : 'In use';
        sub = (mine ? '' : label(o) + ' · ') + 'until ' + fmtMin(end);
      } else {
        let end = cur + STEP;
        while (end < CLOSE && !occupant(today, ci, end)) end += STEP;
        sub = end >= CLOSE ? 'Free until closing (' + fmtMin(CLOSE) + ')' : 'Free until ' + fmtMin(end);
      }
    }
    return `<div class="now ${cls}"><span class="court">${esc(c)} · now</span><span class="state">${esc(state)}</span><span class="sub">${esc(sub)}</span></div>`;
  }).join('');

  // ── booking saya (dikelompokkan per grup) ──
  const mine = groupBookings(b => b.uid === me.uid && !isPastSlot(b.date, b.start));
  const when = g => (g.date === today ? 'Today' : shortDate(fromIso(g.date))) + ' · ' + fmtMin(g.start) + '–' + fmtMin(g.end);
  const tag = g => g.pending ? ' <span class="tag pend">Awaiting approval</span>' : ' <span class="tag ok">Approved</span>';
  const row = g => `<li><span><b>${esc(when(g))}</b> · ${esc(g.court)}${tag(g)}</span><button class="btn ghost mini" type="button" data-cancel-group="${esc(g.ids.join(','))}">Cancel</button></li>`;
  if (mine.length) {
    const n = mine[0];
    $('next-booking').innerHTML = `<div class="next-box${n.pending ? ' pend' : ''}"><span class="small">Next booking${n.pending ? ' · awaiting admin approval' : ''}</span><b>${esc(when(n))}</b><span>${esc(n.court)}</span></div>`;
    $('my-bookings').innerHTML = mine.map(row).join('');
  } else {
    $('next-booking').innerHTML = '';
    $('my-bookings').innerHTML = '<li class="empty">No bookings yet. Pick a free slot or open the Booking page.</li>';
  }
  if (!isPengurus()) {
    const used = myReservationsInWeek(today);
    $('next-booking').insertAdjacentHTML('afterbegin', `<p class="small" style="margin:0 0 8px">This week's quota: <b>${used}/${MAX_RES}</b> reservations <span class="muted">· max ${MAX_RES_MIN / 60} hours per reservation</span></p>`);
  }

  // ── slot kosong hari ini (klik = booking) ──
  if (cl) $('free-today').innerHTML = `<p class="muted">Courts are closed today: ${esc(cl)}</p>`;
  else {
    $('free-today').innerHTML = COURTS.map((c, ci) => {
      const free = starts.filter(s => !isPastSlot(today, s) && !occupant(today, ci, s));
      return `<div class="free-court"><div class="lbl">${esc(c)}</div>${free.length
        ? `<div class="chips">${free.map(s => `<button type="button" class="chip" data-quick="${ci}:${s}">${fmtMin(s)}</button>`).join('')}</div>`
        : '<span class="muted small">Fully booked / past</span>'}</div>`;
    }).join('');
  }

  // ── jadwal hari ini ──
  const items = [];
  if (!cl) COURTS.forEach((c, ci) => starts.forEach(s => { const o = occupant(today, ci, s); if (o) items.push({ s, c, who: label(o) }); }));
  items.sort((a, b) => a.s - b.s || a.c.localeCompare(b.c));
  $('today-list').innerHTML = cl ? `<li class="empty">Courts are closed today: ${esc(cl)}</li>`
    : items.length ? items.map(x => `<li><span><b>${fmtMin(x.s)}–${fmtMin(x.s + STEP)}</b> · ${esc(x.c)}</span><span class="muted">${esc(x.who)}</span></li>`).join('')
    : '<li class="empty">No one has booked a court today.</li>';

  // ── khusus pengurus ──
  if (isPengurus()) {
    const pend = S.users.filter(u => u.status === 'pending').length;
    $('st-pending').textContent = pend;
    $('pending-card').hidden = !pend;
    $('pending-badge').textContent = pend; $('pending-badge').hidden = !pend;
    $('st-members').textContent = S.users.filter(u => u.status === 'approved').length;
    const bars = []; let weekMin = 0;
    for (let i = 0; i < 7; i++) {
      const iso = isoDate(dayDate(i)); let m = 0;
      if (!closedReason(iso)) COURTS.forEach((c, ci) => starts.forEach(s => { if (occupant(iso, ci, s)) m += STEP; }));
      weekMin += m; bars.push({ d: dayDate(i), h: m / 60, closed: !!closedReason(iso) });
    }
    $('st-week').textContent = Math.round(weekMin / 60 * 10) / 10;
    const maxH = Math.max(1, ...bars.map(b => b.h));
    $('week-bars').innerHTML = bars.map(b => `<div class="bar" title="${esc(longDate(b.d))}"><b>${b.closed ? 'closed' : b.h}</b><i style="height:${Math.round(b.h / maxH * 100)}%"></i><span>${DAYS[b.d.getDay()].slice(0, 3)}</span></div>`).join('');
  }
}

function renderBooking() {
  // semua lapangan tampil berdampingan (kolom per lapangan), jadi dropdown tidak dipakai
  $('court-select').hidden = true;
  if (!$('court-select').options.length) $('court-select').innerHTML = COURTS.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('');
  $('day-strip').innerHTML = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = dayDate(i), cl = closedReason(isoDate(d));
    return `<button type="button" class="day-chip${i === dayIdx ? ' active' : ''}${cl ? ' closed' : ''}" data-i="${i}" title="${cl ? esc(cl) : ''}"><small>${DAYS[d.getDay()].slice(0, 3)}</small><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()]}</small></button>`;
  }).join('');
  $('prev-day').disabled = dayIdx === 0;
  $('next-day').disabled = dayIdx === DAYS_AHEAD - 1;
  const d = dayDate(dayIdx), iso = isoDate(d), cl = closedReason(iso);
  $('day-label').textContent = longDate(d);
  const cell = (ci, s) => {
    if (cl) return `<div class="slot past"><span class="s">${esc(cl)}</span></div>`;
    const o = occupant(iso, ci, s), past = isPastSlot(iso, s);
    if (o && o.kind === 'booking') {
      const mine = o.b.uid === me.uid, pend = isPendingB(o.b);
      const can = (mine && !past) || isPengurus();
      const cls = pend ? 'pending' : mine ? 'mine' : 'booked';
      const who = mine ? 'you' : o.b.name;
      const txt = pend ? `Requested by ${who} · awaiting approval` : `Booked by ${who}`;
      return `<div class="slot ${cls}${can ? ' clickable' : ''}" ${can ? `data-booking="${esc(o.b.id)}" role="button" tabindex="0"` : ''} title="${esc(txt)}"><span class="s">${esc(txt)}</span></div>`;
    }
    if (o) return `<div class="slot booked" title="${esc('Booked: ' + (o.r.label || 'recurring schedule'))}"><span class="s">${esc('Booked: ' + (o.r.label || 'recurring schedule'))}</span></div>`;
    if (past) return `<div class="slot past"><span class="s">Past</span></div>`;
    return `<button type="button" class="slot free" data-s="${s}" data-c="${ci}" aria-label="Book ${esc(COURTS[ci])} at ${fmtMin(s)}"><span class="s">Available</span></button>`;
  };
  const el = $('slots');
  el.className = 'sched';
  el.style.gridTemplateColumns = `76px repeat(${COURTS.length}, minmax(0, 1fr))`;
  el.innerHTML = '<div class="sh-blank"></div>' + COURTS.map(c => `<div class="sh">${esc(c)}</div>`).join('')
    + slotStarts().map(s => `<div class="tl">${fmtMin(s)}<small>${fmtMin(s + STEP)}</small></div>` + COURTS.map((c, ci) => cell(ci, s)).join('')).join('');
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
    if (u.status === 'pending') act = `<button class="btn primary mini" data-mact="approve" data-uid="${u.uid}">Approve</button><button class="btn ghost mini" data-mact="reject" data-uid="${u.uid}">Reject</button>`;
    else if (u.status === 'approved' && !self) act = (u.role === 'pengurus'
      ? `<button class="btn ghost mini" data-mact="member" data-uid="${u.uid}">Make member</button>`
      : `<button class="btn ghost mini" data-mact="pengurus" data-uid="${u.uid}">Make admin</button>`)
      + `<button class="btn ghost mini" data-mact="reject" data-uid="${u.uid}">Deactivate</button>`;
    else if (u.status === 'rejected') act = `<button class="btn primary mini" data-mact="approve" data-uid="${u.uid}">Activate</button><button class="btn danger mini" data-mact="delete" data-uid="${u.uid}">Delete</button>`;
    return `<tr><td><b>${esc(u.name)}</b>${self ? ' <span class="muted small">(you)</span>' : ''}</td><td>${esc(u.username)}</td><td>${esc(u.unit || '-')}</td><td>${esc(u.phone || '-')}</td>
      <td><span class="role ${u.role === 'pengurus' ? 'pengurus' : ''}">${u.role === 'pengurus' ? 'Admin' : 'Member'}</span></td><td>${when(u.createdAt)}</td><td class="act">${act}</td></tr>`;
  }).join('') : `<tr><td colspan="7" class="muted">No data.</td></tr>`;
}

function renderCourt() {
  if (!isPengurus()) return;
  const today = isoDate(dayDate(0));
  const closed = [...S.closed.entries()].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));
  $('closed-list').innerHTML = closed.length ? closed.map(([d, c]) =>
    `<li><span><b>${esc(longDate(fromIso(d)))}</b> · ${esc(c.reason || '')}</span><button class="btn ghost mini" data-del-closed="${esc(d)}">Delete</button></li>`).join('')
    : '<li class="empty">No closed dates.</li>';
  const rec = [...S.recurring].sort((a, b) => (a.day - b.day) || String(a.start).localeCompare(String(b.start)));
  $('recurring-list').innerHTML = rec.length ? rec.map(r =>
    `<li><span><b>${DAYS[r.day]}</b> ${esc(r.start)}–${esc(r.end)}${COURTS.length > 1 ? ' · ' + esc(r.court || COURTS[0]) : ''} · ${esc(r.label)}</span><button class="btn ghost mini" data-del-rec="${esc(r.id)}">Delete</button></li>`).join('')
    : '<li class="empty">No recurring schedule yet.</li>';
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
  if (!isPengurus() && myReservationsInWeek(iso) >= MAX_RES) {
    const ws = fromIso(weekStart(iso)), we = new Date(ws); we.setDate(we.getDate() + 6);
    toast(`You have used all ${MAX_RES} reservations for the week of ${shortDate(ws)} – ${shortDate(we)}.`);
    return;
  }
  const limit = isPengurus() ? Infinity : MAX_RES_MIN;
  let n = 0;
  while (s + (n + 1) * STEP <= CLOSE && (n + 1) * STEP <= limit && !occupant(iso, courtIdx, s + n * STEP)) n++;
  pick = { iso, s };
  $('bk-sum').textContent = COURTS[courtIdx] + ' · ' + longDate(fromIso(iso)) + ' · starting ' + fmtMin(s);
  $('bk-dur').innerHTML = Array.from({ length: Math.max(1, n) }, (_, i) => {
    const m = (i + 1) * STEP; return `<option value="${m}">${m % 60 ? m + ' min' : m / 60 + (m === 60 ? ' hour' : ' hours')} (until ${fmtMin(s + m)})</option>`;
  }).join('');
  $('bk-note').value = ''; setMsg('bk-msg', '');
  $('dlg-book').showModal();
}

async function doBook(ev) {
  ev.preventDefault();
  const form = ev.target, mins = Number($('bk-dur').value), { iso, s } = pick;
  const ids = []; for (let m = 0; m < mins; m += STEP) ids.push(slotId(iso, courtIdx, s + m));
  busy(form, true); setMsg('bk-msg', 'Saving…');
  try {
    await F.runTransaction(db, async tx => {
      const refs = ids.map(id => F.doc(db, 'bookings', id));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      if (snaps.some(x => x.exists())) throw new Error('BENTROK');
      refs.forEach((r, i) => tx.set(r, {
        date: iso, court: COURTS[courtIdx], courtIdx, start: s + i * STEP, end: s + (i + 1) * STEP,
        uid: me.uid, username: me.username, name: me.name || me.username, note: $('bk-note').value.trim(),
        group: ids[0], createdAt: F.serverTimestamp(),
        // booking member menunggu persetujuan admin; booking admin langsung disetujui
        status: isPengurus() ? 'approved' : 'pending',
      }));
    });
    $('dlg-book').close();
    toast(isPengurus() ? 'Booking saved.' : 'Request sent — waiting for admin approval.');
  } catch (e) {
    setMsg('bk-msg', e.message === 'BENTROK' ? 'This slot was just booked by someone else. Please pick another slot.' : authError(e), 'err');
  } finally { busy(form, false); }
}

let detailIds = [];
function openDetail(id) {
  const b = S.bookings.get(id); if (!b) return;
  detailIds = [...S.bookings.values()].filter(x => (x.group || x.id) === (b.group || b.id)).map(x => x.id);
  const all = detailIds.map(i => S.bookings.get(i));
  const st = Math.min(...all.map(x => x.start)), en = Math.max(...all.map(x => x.end));
  $('dt-body').innerHTML = [['Name', b.name], ['Username', b.username], ['Date', longDate(fromIso(b.date))], ['Time', fmtMin(st) + ' – ' + fmtMin(en)],
    ['Court', b.court], ['Status', isPendingB(b) ? 'Awaiting approval' : 'Approved'], ['Note', b.note || '-']].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const own = b.uid === me.uid, adminPend = isPengurus() && isPendingB(b);
  $('dt-approve').hidden = !adminPend;
  $('dt-reject').hidden = !adminPend;
  // pemilik membatalkan sendiri; admin membatalkan booking orang lain yang sudah disetujui
  $('dt-cancel').hidden = !(own || (isPengurus() && !isPendingB(b)));
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
  const g = groupOf(detailIds[0]); if (!g) return;
  busy(ev.target, true);
  try {
    if (g.uid !== me.uid && isPengurus()) { if (await rejectGroup(g, 'cancelled')) $('dlg-detail').close(); }
    else { if (!confirm('Cancel this booking?')) return; await cancelIds(detailIds); $('dlg-detail').close(); toast('Booking cancelled.'); }
  }
  catch (e) { setMsg('dt-msg', authError(e), 'err'); }
  finally { busy(ev.target, false); }
}

// ── aksi pengurus ──────────────────────────────────────
async function memberAction(act, uid) {
  const u = S.users.find(x => x.uid === uid); if (!u) return;
  const ref = F.doc(db, 'users', uid);
  try {
    if (act === 'approve') await F.updateDoc(ref, { status: 'approved', approvedBy: me.username, approvedAt: F.serverTimestamp() });
    else if (act === 'reject') { if (!confirm(`${u.status === 'pending' ? 'Reject the registration of' : 'Deactivate the account of'} ${u.name}?`)) return; await F.updateDoc(ref, { status: 'rejected', rejectedBy: me.username, rejectedAt: F.serverTimestamp() }); }
    else if (act === 'pengurus') { if (!confirm(`Make ${u.name} an admin? Admins can approve members and manage the courts.`)) return; await F.updateDoc(ref, { role: 'pengurus' }); }
    else if (act === 'member') { if (!confirm(`Change ${u.name} back to a regular member?`)) return; await F.updateDoc(ref, { role: 'member' }); }
    else if (act === 'delete') { if (!confirm(`Delete the record of ${u.name}? This person can re-apply with the same username.`)) return; await F.deleteDoc(ref); }
    toast('Saved.');
  } catch (e) { alert(authError(e)); }
}

async function addClosed(ev) {
  ev.preventDefault();
  const d = $('cl-date').value, r = $('cl-reason').value.trim();
  if (!d || !r) return;
  try { await F.setDoc(F.doc(db, 'closed', d), { reason: r, by: me.username }); ev.target.reset(); toast('Closed date added.'); }
  catch (e) { alert(authError(e)); }
}
async function addRecurring(ev) {
  ev.preventDefault();
  const day = Number($('rc-day').value), start = $('rc-start').value, end = $('rc-end').value, label = $('rc-label').value.trim();
  if (toMin(end) <= toMin(start)) { alert('End time must be after start time.'); return; }
  try { await F.addDoc(F.collection(db, 'recurring'), { day, start, end, court: COURTS[Number($('rc-court').value) || 0], label, by: me.username }); $('rc-label').value = ''; toast('Recurring schedule added.'); }
  catch (e) { alert(authError(e)); }
}

// ── profil ─────────────────────────────────────────────
async function saveProfile(ev) {
  ev.preventDefault();
  busy(ev.target, true);
  try { await F.updateDoc(F.doc(db, 'users', me.uid), { name: $('pf-name').value.trim(), unit: $('pf-unit').value.trim(), phone: $('pf-phone').value.trim() }); setMsg('pf-msg', 'Saved.', 'ok'); }
  catch (e) { setMsg('pf-msg', authError(e), 'err'); }
  finally { busy(ev.target, false); }
}
async function changePassword(ev) {
  ev.preventDefault();
  const o = $('pw-old').value, n1 = $('pw-new').value, n2 = $('pw-new2').value;
  if (n1.length < 6) { setMsg('pw-msg', 'New password must be at least 6 characters.', 'err'); return; }
  if (n1 !== n2) { setMsg('pw-msg', 'New passwords do not match.', 'err'); return; }
  busy(ev.target, true);
  try {
    const u = auth.currentUser;
    await F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, o));
    await F.updatePassword(u, n1);
    ev.target.reset(); setMsg('pw-msg', 'Password changed.', 'ok');
  } catch (e) { setMsg('pw-msg', e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : authError(e), 'err'); }
  finally { busy(ev.target, false); }
}

// ── navigasi & event ───────────────────────────────────
function goPage(p) {
  page = p;
  $$('[data-page-view]').forEach(s => { s.hidden = s.dataset.pageView !== p; });
  $$('#mainnav [data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  if (p === 'members') renderMembers();
  if (p === 'approvals') safeRender('Approvals', renderApprovals);
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
    const f = e.target.closest('.slot.free'); if (f) { courtIdx = Number(f.dataset.c) || 0; openBook(Number(f.dataset.s)); return; }
    const b = e.target.closest('[data-booking]'); if (b) openDetail(b.dataset.booking);
  });
  $('form-book').addEventListener('submit', doBook);
  $('form-detail').addEventListener('submit', doCancelDetail);
  // persetujuan booking (admin)
  const act = async (fn) => { try { await fn(); } catch (x) { alert(authError(x)); } };
  $('dt-approve').addEventListener('click', () => act(async () => { const g = groupOf(detailIds[0]); if (g) { await approveGroup(g); $('dlg-detail').close(); } }));
  $('dt-reject').addEventListener('click', () => act(async () => { const g = groupOf(detailIds[0]); if (g && await rejectGroup(g, 'rejected')) $('dlg-detail').close(); }));
  $('appr-rows').addEventListener('click', e => {
    const a = e.target.closest('[data-appr]'), r = e.target.closest('[data-rej]');
    const key = (a || r) && (a || r).dataset[a ? 'appr' : 'rej']; if (!key) return;
    const g = groupBookings(b => (b.group || b.id) === key)[0]; if (!g) return;
    act(() => a ? approveGroup(g) : rejectGroup(g, 'rejected'));
  });
  $('appr-card').addEventListener('click', () => goPage('approvals'));
  $('notices').addEventListener('click', e => {
    const b = e.target.closest('[data-dismiss]'); if (b) act(() => F.deleteDoc(F.doc(db, 'notices', b.dataset.dismiss)));
  });
  $$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  $('free-today').addEventListener('click', e => {
    const b = e.target.closest('[data-quick]'); if (!b) return;
    const [ci, st] = b.dataset.quick.split(':').map(Number);
    dayIdx = 0; courtIdx = ci; $('court-select').value = String(ci); renderBooking(); openBook(st);
  });
  $('pending-card').addEventListener('click', () => {
    memberFilter = 'pending'; $$('#member-tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.mf === 'pending')); goPage('members');
  });
  $('my-bookings').addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel-group]'); if (!b) return;
    if (!confirm('Cancel this booking?')) return;
    try { await cancelIds(b.dataset.cancelGroup.split(',')); toast('Booking cancelled.'); } catch (x) { alert(authError(x)); }
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
    const b = e.target.closest('[data-del-closed]'); if (!b || !confirm('Delete this closed date?')) return;
    try { await F.deleteDoc(F.doc(db, 'closed', b.dataset.delClosed)); } catch (x) { alert(authError(x)); }
  });
  $('recurring-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-del-rec]'); if (!b || !confirm('Delete this recurring schedule?')) return;
    try { await F.deleteDoc(F.doc(db, 'recurring', b.dataset.delRec)); } catch (x) { alert(authError(x)); }
  });

  $('form-profile').addEventListener('submit', saveProfile);
  $('form-password').addEventListener('submit', changePassword);

  // pergantian hari saat aplikasi dibiarkan terbuka
  setInterval(() => { if (me && me.status === 'approved') renderAll(); }, 60000);
}
