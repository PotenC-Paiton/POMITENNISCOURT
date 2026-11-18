// Jadwal & booking lapangan tenis — tanpa server.
// Data jadwal dibaca dari data/bookings.json (diedit admin di GitHub);
// permintaan booking dikirim ke admin lewat WhatsApp.
(function () {
  const C = window.COURT_CONFIG || {};
  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const $ = id => document.getElementById(id);

  let data = { bookings: [], recurring: [], closed: [] };
  let dayIdx = 0;
  let court = (C.courts && C.courts[0]) || 'Lapangan 1';
  let picked = null; // {date, startMin}

  const pad = n => String(n).padStart(2, '0');
  const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const fmtMin = m => pad(Math.floor(m / 60)) + '.' + pad(m % 60);
  const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dayDate = i => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; };
  const longDate = d => DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  const sameCourt = x => !x.court || x.court === court;

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function closedReason(d) {
    const c = (data.closed || []).find(x => x.date === isoDate(d));
    return c ? (c.reason || 'Tutup') : null;
  }

  // Siapa yang memakai slot [s, s+slot) pada tanggal d (atau null)
  function occupant(d, s) {
    const e = s + (C.slotMinutes || 60), iso = isoDate(d), wd = d.getDay();
    const hit = x => sameCourt(x) && toMin(x.start) < e && toMin(x.end) > s;
    const b = (data.bookings || []).find(x => x.date === iso && hit(x));
    if (b) return b.name || 'Terisi';
    const r = (data.recurring || []).find(x => Number(x.day) === wd && hit(x));
    if (r) return r.label || 'Jadwal rutin';
    return null;
  }

  function slotStarts() {
    const out = [], step = C.slotMinutes || 60;
    for (let m = (C.openHour ?? 6) * 60; m + step <= (C.closeHour ?? 22) * 60; m += step) out.push(m);
    return out;
  }

  function renderDays() {
    const n = C.daysAhead || 14;
    $('day-strip').innerHTML = Array.from({ length: n }, (_, i) => {
      const d = dayDate(i);
      const cls = ['day-chip', i === dayIdx ? 'active' : '', closedReason(d) ? 'closed' : ''].join(' ');
      return `<button type="button" class="${cls}" data-i="${i}"><small>${DAYS[d.getDay()].slice(0, 3)}</small><b>${d.getDate()}</b><small>${MONTHS[d.getMonth()]}</small></button>`;
    }).join('');
    $('prev-day').disabled = dayIdx === 0;
    $('next-day').disabled = dayIdx === n - 1;
    const active = $('day-strip').querySelector('.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderSlots() {
    const d = dayDate(dayIdx);
    $('day-label').textContent = longDate(d);
    const closed = closedReason(d);
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const step = C.slotMinutes || 60;
    $('slots').innerHTML = slotStarts().map(s => {
      const label = fmtMin(s) + ' – ' + fmtMin(s + step);
      if (closed) return `<div class="slot past"><span class="t">${label}</span><span class="s">${esc(closed)}</span></div>`;
      if (dayIdx === 0 && s + step <= nowMin) return `<div class="slot past"><span class="t">${label}</span><span class="s">Sudah lewat</span></div>`;
      const who = occupant(d, s);
      if (who) return `<div class="slot booked"><span class="t">${label}</span><span class="s">${esc(who)}</span></div>`;
      return `<button type="button" class="slot free" data-s="${s}"><span class="t">${label}</span><span class="s">Tersedia</span></button>`;
    }).join('');
  }

  function render() { renderDays(); renderSlots(); }

  // Durasi maksimum dari slot yang dipilih: berhenti di slot terisi / jam tutup (maks 2 jam)
  function maxDuration(d, s) {
    const step = C.slotMinutes || 60, close = (C.closeHour ?? 22) * 60;
    let k = 0;
    while (k < Math.max(1, Math.round(120 / step)) && s + (k + 1) * step <= close && !occupant(d, s + k * step)) k++;
    return Math.max(1, k);
  }

  function openBooking(s) {
    const d = dayDate(dayIdx), step = C.slotMinutes || 60;
    picked = { date: d, start: s };
    $('slot-sum').textContent = court + ' · ' + longDate(d) + ' · mulai ' + fmtMin(s);
    const n = maxDuration(d, s);
    $('f-dur').innerHTML = Array.from({ length: n }, (_, i) => {
      const mins = (i + 1) * step;
      return `<option value="${mins}">${mins >= 60 ? (mins / 60) + ' jam' : mins + ' menit'} (s/d ${fmtMin(s + mins)})</option>`;
    }).join('');
    try { $('f-name').value = localStorage.getItem('tc_name') || ''; $('f-unit').value = localStorage.getItem('tc_unit') || ''; } catch (e) {}
    $('btn-send').textContent = C.adminWhatsApp ? 'Kirim via WhatsApp' : 'Salin teks permintaan';
    $('dlg-note').textContent = C.adminWhatsApp
      ? 'WhatsApp akan terbuka dengan pesan yang sudah terisi. Slot baru tampil "Terisi" setelah dikonfirmasi admin.'
      : 'Nomor WhatsApp admin belum diatur — teks permintaan akan disalin agar bisa dikirim manual.';
    $('book-dialog').showModal();
  }

  function buildMessage() {
    const mins = Number($('f-dur').value), s = picked.start;
    const lines = [
      'Halo Admin, saya ingin booking lapangan tenis:',
      '• Lapangan: ' + court,
      '• Tanggal: ' + longDate(picked.date),
      '• Jam: ' + fmtMin(s) + ' – ' + fmtMin(s + mins),
      '• Nama: ' + $('f-name').value.trim(),
    ];
    if ($('f-unit').value.trim()) lines.push('• Unit: ' + $('f-unit').value.trim());
    lines.push('• Jumlah pemain: ' + $('f-players').value);
    if ($('f-note').value.trim()) lines.push('• Catatan: ' + $('f-note').value.trim());
    lines.push('Terima kasih.');
    return lines.join('\n');
  }

  async function sendBooking(ev) {
    ev.preventDefault();
    if (!$('f-name').value.trim()) { $('f-name').focus(); return; }
    try { localStorage.setItem('tc_name', $('f-name').value.trim()); localStorage.setItem('tc_unit', $('f-unit').value.trim()); } catch (e) {}
    const msg = buildMessage();
    if (C.adminWhatsApp) {
      window.open('https://wa.me/' + encodeURIComponent(C.adminWhatsApp) + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
      toast('Membuka WhatsApp…');
    } else {
      try { await navigator.clipboard.writeText(msg); toast('Teks permintaan disalin — kirim ke admin.'); }
      catch (e) { window.prompt('Salin teks berikut dan kirim ke admin:', msg); }
    }
    $('book-dialog').close();
  }

  async function loadData() {
    try {
      const res = await fetch('data/bookings.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      data = { bookings: j.bookings || [], recurring: j.recurring || [], closed: j.closed || [] };
      $('data-note').hidden = true;
    } catch (e) {
      $('data-note').hidden = false;
      $('data-note').textContent = 'Data jadwal belum bisa dimuat (' + (location.protocol === 'file:' ? 'buka lewat GitHub Pages atau server lokal' : e.message) + '). Semua slot ditampilkan tersedia.';
    }
    render();
  }

  function init() {
    document.title = (C.siteName || 'Tennis Court') + ' — Booking';
    $('site-name').textContent = C.siteName || 'Tennis Court';
    $('site-tagline').textContent = C.tagline || '';
    $('footer-name').textContent = C.siteName || 'Tennis Court';
    const courts = C.courts && C.courts.length ? C.courts : ['Lapangan 1'];
    $('court-select').innerHTML = courts.map(c => `<option>${esc(c)}</option>`).join('');
    $('court-select').hidden = courts.length < 2;
    $('info-grid').innerHTML = (C.info || []).map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join('');
    $('rules').innerHTML = (C.rules || []).map(r => `<li>${esc(r)}</li>`).join('');

    $('court-select').addEventListener('change', e => { court = e.target.value; renderSlots(); });
    $('prev-day').addEventListener('click', () => { if (dayIdx > 0) { dayIdx--; render(); } });
    $('next-day').addEventListener('click', () => { if (dayIdx < (C.daysAhead || 14) - 1) { dayIdx++; render(); } });
    $('day-strip').addEventListener('click', e => { const b = e.target.closest('.day-chip'); if (b) { dayIdx = Number(b.dataset.i); render(); } });
    $('slots').addEventListener('click', e => { const b = e.target.closest('.slot.free'); if (b) openBooking(Number(b.dataset.s)); });
    $('book-form').addEventListener('submit', sendBooking);
    $('btn-cancel').addEventListener('click', () => $('book-dialog').close());

    render();
    loadData();
  }

  init();
})();
