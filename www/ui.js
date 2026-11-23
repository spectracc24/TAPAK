'use strict';
// Lapisan tampilan TAPAK · gaya Spectra CC (Manrope/Inter, ikon garis, kartu, garis tiga warna)
const I=(n,c='')=>`<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const ICO=n=>`<span class=ico>${I(n)}</span>`;
const T=(i,t,fn,c='')=>`<button class="tile ${c}" onclick="${fn}">${ICO(i)}<span>${t}</span></button>`;
const FT={Point:'pin',LineString:'route',Polygon:'polygon'},NAMA={Point:'Titik',LineString:'Jalur',Polygon:'Area'};

// ---------- logo (vektor dari situs Spectra CC) ----------
const ARCS='<path d="M-90.5 -165.9A189 189 0 1 0 163.8 -94.2" style="stroke:var(--lg-o)"/><path d="M67.5 -112.3A131 131 0 1 0 112.8 66.7" style="stroke:var(--lg-m)"/><path d="M71 0A71 71 0 1 0 0 71" style="stroke:var(--lg-i)"/>';
const MARK=`<svg viewBox="-210 -210 420 420" class="mk" aria-hidden="true" fill="none" stroke-width="32" stroke-linecap="round">${ARCS}<circle r="19" stroke="none" style="fill:var(--lg-d)"/></svg>`;
const LOGO=`${MARK}<span class="wm"><b>Spectra CC</b><i>Citra Cendekia</i></span>`;
// tanda aplikasi: kontur Spectra CC dengan pin TAPAK di pusat (sama dengan ikon launcher)
const APPMARK_IN=`${ARCS}<path fill-rule="evenodd" stroke="none" style="fill:var(--lg-d)" d="M0 41C-7 32 -27 12 -27 -12A27 27 0 0 1 27 -12C27 12 7 32 0 41ZM9.5 -12A9.5 9.5 0 1 0 -9.5 -12A9.5 9.5 0 1 0 9.5 -12Z"/>`;
const APPMARK=(c='')=>`<svg viewBox="-210 -210 420 420" class="${c}" aria-hidden="true" fill="none" stroke-width="32" stroke-linecap="round">${APPMARK_IN}</svg>`;
$$('[data-logo]').forEach(e=>e.innerHTML=LOGO);
$('#appmark').innerHTML=APPMARK_IN;

// ---------- tema (ikuti sistem / terang / gelap) ----------
function applyTheme(t){const r=document.documentElement;if(t==='light'||t==='dark')r.dataset.theme=t;else delete r.dataset.theme;
 const m=document.querySelector('meta[name=theme-color]');if(m)m.content=(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))?'#0A1827':'#17324d'}
kvg('S').then(s=>{if(s&&s.theme)applyTheme(s.theme)});

// ---------- sheet ----------
function sheet(h,c=''){const s=$('#sheet');s.className=c;s.innerHTML=`<div class=grab></div><button class="icon-btn x" onclick=closeSheet() aria-label=Tutup>${I('close')}</button>${h}`;s.hidden=false;s.scrollTop=0}
function closeSheet(){$('#sheet').hidden=true}

// ---------- HUD & jejak ----------
window.cycleCoord=()=>{S.coord={dd:'dms',dms:'utm',utm:'dd'}[S.coord];persist();hud()};
function hud(){const g=$('#gps');
 if(fix&&fix.t){g.className='chip '+(fix.acc<=15?'ok':fix.acc<=50?'mid':'bad');$('#gtxt').textContent=fmt(fix.lat,fix.lon)+'  ±'+Math.round(fix.acc)+' m'}
 else{g.className='chip '+(fix?'mid':'bad');$('#gtxt').textContent=gpsMsg}
 let h='';
 if(target&&fix&&fix.t){const b=brg([fix.lat,fix.lon],[target.lat,target.lon]);
  h+=`<div style="display:flex;gap:8px;align-items:center">${I('target')}<b>${esc(target.name)}</b></div>Jarak ${fd(map.distance([fix.lat,fix.lon],[target.lat,target.lon]))} · Arah ${b.toFixed(0)}° ${card(b)}<div class=row><button class="btn btn-o sm" onclick="target=null;if(tgl)map.removeLayer(tgl);hud()">Batalkan tujuan</button></div>`}
 if(pick)h+=`${h?'<hr>':''}<div style="display:flex;gap:8px;align-items:center">${I('pin')}<b>${fmt(pick.lat,pick.lng)}</b></div>
  <div class=row><button class="btn btn-o sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${pick.lat.toFixed(6)}, ${pick.lng.toFixed(6)}');toast('Koordinat disalin')">${I('copy')}Salin</button>
  <button class="btn btn-p sm" onclick="newF('Point',[[pick.lng,pick.lat]])">Tandai</button>
  <button class="btn btn-o sm" onclick="setTarget(pick.lat,pick.lng,'Titik pilihan')">Tuju</button>
  <button class="btn btn-o sm ic-only" onclick="pick=null;map.removeLayer(pm);hud()" aria-label=Tutup>${I('close')}</button></div>`;
 const e=$('#hud');e.innerHTML=h;e.hidden=!h}
window.trackUI=function(){const b=$('#bt'),t=$('#tbar');b.classList.toggle('rec',tracking);$('#nrect').textContent=tracking?'Berhenti':'Rekam';
 b.querySelector('use').setAttribute('href',tracking?'#i-stop':'#i-rec');
 if(tracking){const s=Math.floor((Date.now()-t0)/1e3),p=n=>String(n).padStart(2,'0');t.hidden=false;t.innerHTML=`<i class=rd></i>Merekam · ${fd(len(tcoords))} · ${p(Math.floor(s/3600))}:${p(Math.floor(s/60)%60)}:${p(s%60)}`}else t.hidden=true};
setInterval(trackUI,1000);
{const o=window.onFix;window.onFix=function(){o();trackUI()}}
window.toggleTrack=function(){
 if(!tracking){startTrack();toast('Rekam jejak dimulai.\nTetap jalan saat layar dikunci atau TAPAK diminimalkan.');trackUI()}
 else{if(!confirm('Berhenti merekam dan simpan jejak?'))return;endTrack().then(c=>{trackUI();
  if(c.length>1)newF('LineString',c,{name:'Jejak '+new Date().toLocaleString('id-ID')});else toast('Jejak terlalu pendek, tidak disimpan')})}};

// ---------- panel ----------
window.pDraw=()=>sheet(`<h3>Tambah ke peta</h3><div class=grid>
 ${T('locate','Tandai lokasi saya',"if(!fix||!fix.t){needPerm(['location']);return toast('GPS belum siap')};closeSheet();newF('Point',[[fix.lon,fix.lat]])",'pri')}
 ${T('hand','Tandai titik di peta',"startMode('point')")}${T('route','Gambar jalur',"startMode('line')")}${T('polygon','Gambar area',"startMode('polygon')")}
 ${T('ruler','Ukur jarak',"startMode('mline')")}${T('contour','Ukur luas',"startMode('marea')")}</div>`);
window.pMeasure=pDraw;

const fmtOff=o=>`${Math.abs(o.e).toFixed(0)} m ${o.e>=0?'ke timur':'ke barat'}, ${Math.abs(o.n).toFixed(0)} m ${o.n>=0?'ke utara':'ke selatan'}`;
function pmCard(m){const g=m.geo,off=pmOffset(m),shifted=Math.abs(off.e)>.4||Math.abs(off.n)>.4,bad=g&&(!g.exact||g.rms>5);
 const sub=g?`${esc(g.crs)} · ±${g.rms} m`:'Diimpor dengan versi lama';
 const info=g?`<div class=geo><b>Proyeksi:</b> ${esc(g.crs)}<br><b>Galat titik kontrol:</b> ±${g.rms} m dari ${g.n} titik (maks ${g.maxErr} m)<br><b>Resolusi hasil:</b> ${g.res} m per piksel${g.viewports>1?`<br><b>Viewport:</b> ${g.viewports} ditemukan, bingkai peta utama (terluas) dipakai`:''}${shifted?`<br><b>Geser manual:</b> ${fmtOff(off)}`:''}</div>`
  :`<div class=geo>Peta ini diimpor sebelum ada diagnostik georeferensi. Hapus lalu impor ulang agar memakai perhitungan terbaru.</div>`;
 return `<div class=pm><div class=pm-h>${ICO('pdf')}<span><strong>${esc(m.name)}</strong><small>${sub}</small></span></div>
 ${bad?`<p class=note style="margin-bottom:0"><b>Perhatian:</b> ${esc(g.warn||'titik kontrol georeferensi tidak konsisten')}. Posisi peta mungkin melenceng.</p>`:''}
 <label>Opasitas <input type=range min=.1 max=1 step=.1 value=${m.op} oninput="opPM(${m.id},this.value)"></label>
 <div class=row><button class="btn btn-o sm" onclick="closeSheet();map.fitBounds(pmBounds(PM.find(x=>x.id==${m.id})))">${I('search')}Lihat</button>
 <button class="btn btn-o sm" onclick="togglePM(${m.id})">${I('eye')}Tampil/sembunyi</button>
 <button class="btn btn-o sm" onclick="pNudge(${m.id})">${I('sliders')}Geser</button>
 <button class="btn btn-d sm" onclick="delPM(${m.id})">${I('trash')}Hapus</button></div>
 ${info}<div class=row><button class="btn btn-o sm" onclick="copyGeo(${m.id})">${I('copy')}Salin info georeferensi</button></div></div>`}
window.pLayers=()=>sheet(`<h3>Peta</h3><h4>Peta dasar (butuh internet)</h4><div class=grid>
 ${Object.entries({osm:['road','Peta jalan'],topo:['contour','Peta kontur'],sat:['satellite','Citra satelit'],none:['offline','Tanpa peta online']}).map(([k,[i,v]])=>T(i,v,`setBase('${k}');pLayers()`,S.base==k?'sel':'')).join('')}</div>
 <h4>Peta PDF (tanpa internet)</h4><button class="btn btn-p wide" onclick="$('#pdfin').click()">${I('plus')}Impor peta PDF</button>
 ${PM.length?PM.map(pmCard).join(''):'<p class=lead style="margin-top:12px">Belum ada peta PDF. Gunakan GeoPDF hasil ekspor ArcMap atau QGIS.</p>'}`);
let nudgeStep=5;
window.pNudge=(id,keep)=>{const m=PM.find(x=>x.id==id);if(!m)return;const o=pmOffset(m),sh=Math.abs(o.e)>.4||Math.abs(o.n)>.4;
 sheet(`<h3>Geser peta PDF</h3><p class=lead>${esc(m.name)}<br>${sh?'Geseran kini: '+fmtOff(o):'Belum digeser.'}</p>
 <div class=chips>${[1,5,10,50].map(n=>`<button class="${n==nudgeStep?'on':''}" onclick="nudgeStep=${n};pNudge(${id},1)">${n} m</button>`).join('')}</div>
 <div class=pad><span></span><button class="btn btn-o" onclick="nudgePM(${id},0,nudgeStep)" aria-label=Utara>${I('up')}</button><span></span>
 <button class="btn btn-o" onclick="nudgePM(${id},-nudgeStep,0)" aria-label=Barat>${I('left')}</button><span class=c>geser<br>${nudgeStep} m</span><button class="btn btn-o" onclick="nudgePM(${id},nudgeStep,0)" aria-label=Timur>${I('right')}</button>
 <span></span><button class="btn btn-o" onclick="nudgePM(${id},0,-nudgeStep)" aria-label=Selatan>${I('down')}</button><span></span></div>
 <div class=row style="justify-content:center"><button class="btn btn-o sm" onclick="resetPM(${id})">${I('undo')}Kembalikan</button><button class="btn btn-p sm" onclick="pLayers()">Selesai</button></div>
 <p class=lead style="margin-top:12px">Hanya menggeser gambar peta PDF untuk kalibrasi visual. Koordinat data Anda tidak berubah.</p>`,'compact')};
window.pList=()=>sheet(`<h3>Data saya (${F.length})</h3>${F.length?'':`<div class=empty>${ICO('pin')}<br>Belum ada data.<br>Tekan <b>Tambah</b> untuk memulai.</div>`}
 ${F.slice().reverse().map(f=>{const c=f.coords[0],d=fix&&fix.t?` · ${fd(map.distance([fix.lat,fix.lon],[c[1],c[0]]))} dari Anda`:'';
 return`<div class=item onclick="edit(${f.id});map.fitBounds(L.latLngBounds(gf(${f.id}).coords.map(c=>[c[1],c[0]])),{maxZoom:17})">${ICO(FT[f.type])}<span><strong>${esc(f.props.name||'(tanpa nama)')}</strong><small>${NAMA[f.type]} · ${f.photos.length} foto${d}</small></span>${I('chev')}</div>`}).join('')}`);
window.addAttr=(k='')=>$('#cu').insertAdjacentHTML('beforeend',`<div class=r><input value="${esc(k)}" placeholder="Nama data"><input placeholder="Isi"></div>`);
function edit(id){cur=id;const f=gf(id);if(!f)return;
 const cu=Object.entries(f.props.custom).map(([k,v])=>`<div class=r><input value="${esc(k)}" placeholder="Nama data"><input value="${esc(v)}" placeholder="Isi"></div>`).join('');
 const ph=f.photos.map((p,i)=>`<span class=th><img src="${p.data}" alt="">${p.lat.toFixed(5)}<br>${p.lon.toFixed(5)}<br><a onclick="delPhoto(${i})">hapus</a></span>`).join('');
 const m=f.type=='Point'?'':f.type=='LineString'?`Panjang ${fd(len(f.coords))}`:`Luas ${fa(area(f.coords))} · Keliling ${fd(len([...f.coords,f.coords[0]]))}`,c0=f.coords[0];
 sheet(`<h3>${NAMA[f.type]}</h3><p class=lead>${m?m+'<br>':''}${fmt(c0[1],c0[0])}</p>
 <input id=en placeholder="Nama / judul" value="${esc(f.props.name)}"><textarea id=ed rows=2 placeholder="Keterangan">${esc(f.props.desc)}</textarea>
 <h4>Data tambahan</h4><div id=cu>${cu}</div><div class=chips>${['Jenis','Jumlah','Kondisi','Pelaku'].map(k=>`<button onclick="addAttr('${k}')">${I('plus')}${k}</button>`).join('')}<button onclick="addAttr()">${I('plus')}Lainnya</button></div>
 <h4>Foto (otomatis berlokasi)</h4><div>${ph}</div><div class=row><button class="btn btn-o sm" onclick="takePhoto('cam')">${I('camera')}Ambil foto</button><button class="btn btn-o sm" onclick="takePhoto('gal')">${I('image')}Dari galeri</button></div>
 <h4>Aksi</h4><div class=row><button class="btn btn-p" onclick="grab();closeSheet();toast('Tersimpan')">${I('save')}Simpan</button>
 <button class="btn btn-o" onclick="grab();setTarget(${c0[1]},${c0[0]},gf(cur).props.name||'Objek');closeSheet()">${I('target')}Tuju ke sini</button>
 <button class="btn btn-o" onclick="grab();closeSheet();map.fitBounds(L.latLngBounds(gf(cur).coords.map(c=>[c[1],c[0]])),{maxZoom:18})">${I('search')}Lihat di peta</button>
 <button class="btn btn-d" onclick=delF()>${I('trash')}Hapus</button></div>`)}
window.pMenu=function(){const o=(k,a)=>Object.entries(a).map(([v,t])=>`<option value=${v} ${(S[k]||'auto')==v?'selected':''}>${t}</option>`).join('');
 sheet(`<h3>Lainnya</h3><h4>Koordinat</h4><select onchange="S.coord=this.value;persist();hud()">${o('coord',{dd:'Derajat desimal (-0.12345, 109.12345)',dms:'Derajat-menit-detik',utm:'UTM'})}</select>
 <h4>Satuan jarak &amp; luas</h4><select onchange="S.unit=this.value;persist()">${o('unit',{metric:'Meter / Kilometer / Hektar',imperial:'Kaki / Mil / Acre',nautical:'Mil laut'})}</select>
 <h4>Tampilan</h4><select onchange="S.theme=this.value;persist();applyTheme(this.value)">${o('theme',{auto:'Ikuti sistem',light:'Terang',dark:'Gelap'})}</select>
 <h4>Simpan &amp; bagikan data</h4><div class=grid>${T('globe','GeoJSON','expGJ()')}${T('layers','KMZ (Google Earth)','expKMZ()')}${T('db','SHP (ArcGIS/QGIS)','expSHP()')}</div>
 <p class=lead style="margin-top:10px">Pilih aplikasi tujuan (Files, Drive, WhatsApp, dll).</p>
 <h4>Info</h4><div class=row><button class="btn btn-o" onclick=pHelp()>${I('help')}Cara pakai</button><button class="btn btn-o" onclick=pAbout()>${I('info')}Tentang TAPAK</button></div>
 <p class=foot>TAPAK v${esc(window.APP_VER||'')} · dikembangkan oleh Spectra CC</p>`)};
window.pHelp=()=>sheet(`<h3>Cara pakai</h3>
 <h4>Peta tanpa sinyal</h4><p>Peta → Impor peta PDF → pilih berkas GeoPDF dari HP.</p>
 <h4>Peta PDF terasa melenceng?</h4><p>Buka Peta dan lihat kartu peta PDF: proyeksi dan galat titik kontrol tertera di sana. Bandingkan dengan peta dasar, atur opasitas, lalu pakai <b>Geser</b> bila perlu kalibrasi. <b>Salin info georeferensi</b> membantu menelusuri penyebabnya.</p>
 <h4>Menandai temuan</h4><p>Tambah → Tandai lokasi saya. Isi nama dan data, ambil foto, lalu Simpan.</p>
 <h4>Merekam jalur patroli</h4><p>Tekan Rekam saat mulai, Berhenti saat selesai. Rekaman <b>tetap berjalan</b> saat layar dikunci atau TAPAK diminimalkan; notifikasi “TAPAK sedang merekam jejak” akan tampil. Jangan menutup TAPAK dari daftar aplikasi. Di HP Xiaomi, Oppo, Vivo, atau Samsung, atur Baterai TAPAK ke “Tanpa batasan”.</p>
 <h4>Mengukur</h4><p>Tambah → Ukur jarak / Ukur luas, lalu ketuk titik-titik di peta.</p>
 <h4>Menuju sebuah titik</h4><p>Buka data → Tuju ke sini. Jarak dan arah tampil di atas.</p>
 <h4>Mengirim data</h4><p>Lainnya → pilih GeoJSON, KMZ, atau SHP.</p>
 <h4>Ganti format koordinat</h4><p>Ketuk kotak koordinat di kiri atas.</p>`);
window.pAbout=()=>sheet(`<div class=about>${APPMARK('appmark')}<h3>TAPAK</h3><p class=tg>Teknologi Akuisisi dan Pencatatan Hutan Kita</p><p class=lead>Every Track Tells a Story.<br>Peta, jejak, dan catatan lapangan untuk perlindungan hutan berbasis masyarakat. Bekerja tanpa internet.</p>
 <div class=byline><small>Dikembangkan oleh</small><span class=logo>${LOGO}</span>
 <p class=sl>Science into Sustainable Solutions.</p><p class=mut style="margin:0">Konsultan geospasial untuk keberlanjutan lingkungan<br>Terdaftar AHU-015113.AH.01.30 Tahun 2025<br>Kubu Raya, Kalimantan Barat, Indonesia</p></div>
 <p class=foot>Versi ${esc(window.APP_VER||'')} · © 2026 Spectra Citra Cendekia</p></div>`);
setTimeout(()=>$('#splash').classList.add('off'),1700);
kvg('seen').then(v=>{if(!v)setTimeout(()=>$('#welcome').hidden=false,1800)});
window.closeWelcome=()=>{$('#welcome').hidden=true;kv.set('seen',1).catch(()=>{})};
trackUI();hud();
