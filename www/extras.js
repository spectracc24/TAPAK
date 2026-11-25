'use strict';
// Fitur tambahan v1.6: persetujuan syarat & privasi, tautan ke website, laporan bug/penyalahgunaan.
// Memakai global dari app.js/ui.js: $, kv, kvg, native, toast, dlg, sheet, I, esc.
const CFG = window.TAPAK_CFG || {};

// ---------- buka website (dengan pemberitahuan alihan) ----------
window.openExt = async (url, nama) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return toast('Alamat website tidak valid');
  const host = url.replace(/^https?:\/\//i, '').split('/')[0];
  // Card konfirmasi hanya dibuat ketika fungsi dipanggil (mis. dari tombol Dukung Pengembang).
  const ok = await dlg({ title: 'Dukung pengembang', body: `Terima kasih atas dukungan Anda untuk TAPAK. Anda akan diarahkan ke website <b>${esc(host)}</b>. TAPAK tetap terbuka di latar.`, ok: 'Lanjut ke website', cancel: 'Batal' });
  if (!ok) return;
  if (native) location.href = url; else window.open(url, '_blank', 'noopener,noreferrer');
};
window.supportDev = () => window.openExt(CFG.site, 'website Spectra CC');

// ---------- persetujuan syarat & kebijakan privasi (sekali; muncul lagi hanya bila versinya naik) ----------
const CONSENT_V = 1;
window.acceptConsent = () => {
  if (!$('#cs-ok').checked) return;
  kv.set('consent', { v: CONSENT_V, t: Date.now() }).catch(() => { });
  $('#consent').hidden = true; if (window.startFlow) startFlow();
};
window.consentTick = () => { $('#cs-go').disabled = !$('#cs-ok').checked };
window.needConsent = async () => { const c = await kvg('consent'); return !(c && c.v >= CONSENT_V) };

// ---------- laporan bug / penyalahgunaan ----------
const RP = { type: 'Bug', wid: null, busy: false, last: 0 };
const rpBody = (d, c) => `${d}\n\n--\nJenis laporan: ${RP.type}\nVersi TAPAK: ${window.APP_VER || '-'}\nPerangkat: ${navigator.userAgent}${c ? '\nKontak: ' + c : ''}`;
const rpReady = () => !!(CFG.formspreeId && CFG.hcaptchaSiteKey);
function loadHCaptcha() {
  if (window.hcaptcha && window.hcaptcha.render) return Promise.resolve();
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), 12000);
    window.__hcLoaded = () => { clearTimeout(t); res() };
    const s = document.createElement('script'); s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=__hcLoaded'; s.async = true;
    s.onerror = () => { clearTimeout(t); rej(new Error('gagal')) }; document.head.appendChild(s);
  });
}
window.rpType = t => { RP.type = t; document.querySelectorAll('#sheet [data-rt]').forEach(b => b.classList.toggle('on', b.dataset.rt === t)) };
window.pReport = () => {
  RP.type = 'Bug'; RP.wid = null; const online = navigator.onLine !== false;
  sheet(`<h3>Laporkan bug / penyalahgunaan</h3>
 <p class=lead>Menemukan error, atau melihat TAPAK dipakai untuk hal yang tidak semestinya? Tulis di sini. Laporan dikirim lewat email ke tim Spectra CC.</p>
 <h4>Jenis laporan</h4><div class=chips><button class=on data-rt=Bug onclick="rpType('Bug')">Bug</button><button data-rt=Penyalahgunaan onclick="rpType('Penyalahgunaan')">Penyalahgunaan</button></div>
 <h4>Deskripsi</h4><textarea id=rpd rows=5 maxlength=1500 placeholder="Apa yang terjadi? Apa yang Anda lakukan sebelumnya? Bagaimana seharusnya?"></textarea>
 <input id=rpc type=email inputmode=email maxlength=100 placeholder="Email Anda (opsional, bila ingin dibalas)">
 ${rpReady() ? '<div id=rpcap class=rpcap></div>' : ''}
 <p id=rpst class=lead>${online ? (rpReady() ? '' : 'Mengirim akan membuka aplikasi email Anda dengan laporan yang sudah terisi.') : 'Tidak ada sinyal. Laporan hanya bisa dikirim saat HP terhubung internet.'}</p>
 <button class="btn btn-p wide" id=rpsend onclick="rpSend()">${I('send')}Kirim laporan</button>
 <p class=foot style="margin-top:12px">Laporan memuat teks di atas, versi TAPAK, dan jenis perangkat. Data peta Anda tidak ikut terkirim.</p>`);
  if (online && rpReady()) loadHCaptcha().then(() => { if ($('#rpcap')) RP.wid = hcaptcha.render('rpcap', { sitekey: CFG.hcaptchaSiteKey, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }) })
    .catch(() => { const e = $('#rpst'); if (e) e.textContent = 'Captcha gagal dimuat. Periksa sinyal, lalu buka lagi menu ini.' });
};
window.rpSend = async () => {
  if (RP.busy) return;
  const d = ($('#rpd').value || '').trim(), c = ($('#rpc').value || '').trim();
  if (d.length < 10) return toast('Tulis deskripsi minimal 10 karakter');
  if (c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return toast('Format email belum benar');
  if (navigator.onLine === false) return toast('Tidak bisa mengirim laporan: tidak ada sinyal internet.\nCoba lagi saat terhubung.');
  if (Date.now() - RP.last < 60000) return toast('Tunggu sebentar sebelum mengirim laporan lagi');
  if (!rpReady()) { location.href = `mailto:${CFG.email}?subject=${encodeURIComponent(RP.type)}&body=${encodeURIComponent(rpBody(d, c))}`; return }
  const tok = window.hcaptcha && RP.wid != null ? hcaptcha.getResponse(RP.wid) : '';
  if (!tok) return toast('Centang captcha “Saya bukan robot” dulu');
  RP.busy = true; const b = $('#rpsend'); b.disabled = true;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch('https://formspree.io/f/' + encodeURIComponent(CFG.formspreeId), {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: RP.type, jenis: RP.type, pesan: rpBody(d, ''), ...(c ? { email: c } : {}), 'h-captcha-response': tok })
    });
    clearTimeout(to);
    if (!r.ok) throw new Error('status ' + r.status);
    RP.last = Date.now(); closeSheet(); toast('Laporan terkirim. Terima kasih!');
  } catch (e) {
    console.error('laporan', e); try { hcaptcha.reset(RP.wid) } catch (x) { }
    toast(navigator.onLine === false || e.name === 'AbortError' || e instanceof TypeError ? 'Laporan gagal terkirim: sinyal tidak ada atau terlalu lemah.\nCoba lagi nanti.' : 'Laporan gagal terkirim. Coba lagi sebentar lagi.');
  } finally { RP.busy = false; if (b) b.disabled = false }
};
