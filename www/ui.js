'use strict';
// Lapisan tampilan TAPAK: menimpa fungsi panel dari app.js dengan versi ramah pengguna
const T=(i,t,fn,c='')=>`<button class="tile ${c}" onclick="${fn}"><b>${i}</b>${t}</button>`;
const ICON={Point:'📍',LineString:'〰️',Polygon:'⬠'},NAMA={Point:'Titik',LineString:'Jalur',Polygon:'Area'};
window.cycleCoord=()=>{S.coord={dd:'dms',dms:'utm',utm:'dd'}[S.coord];persist();hud()};
window.hud=function(){const g=$('#gps');
 if(fix&&fix.t){g.className='chip '+(fix.acc<=15?'ok':fix.acc<=50?'mid':'bad');$('#gtxt').textContent=fmt(fix.lat,fix.lon)+'  ±'+Math.round(fix.acc)+' m'}
 else{g.className='chip '+(fix?'mid':'bad');$('#gtxt').textContent=gpsMsg}
 let h='';
 if(target&&fix&&fix.t){const b=brg([fix.lat,fix.lon],[target.lat,target.lon]);
  h+=`🎯 <b>${esc(target.name)}</b><br>Jarak ${fd(map.distance([fix.lat,fix.lon],[target.lat,target.lon]))} · Arah ${b.toFixed(0)}° ${card(b)}<br><button onclick="target=null;if(tgl)map.removeLayer(tgl);hud()">Batalkan tujuan</button>`}
 if(pick)h+=`${h?'<hr>':''}📌 ${fmt(pick.lat,pick.lng)}<br><button onclick="navigator.clipboard&&navigator.clipboard.writeText('${pick.lat.toFixed(6)}, ${pick.lng.toFixed(6)}');toast('Koordinat disalin')">Salin</button><button onclick="newF('Point',[[pick.lng,pick.lat]])">Tandai</button><button onclick="setTarget(pick.lat,pick.lng,'Titik pilihan')">Tuju ke sini</button><button onclick="pick=null;map.removeLayer(pm);hud()">✕</button>`;
 const e=$('#hud');e.innerHTML=h;e.hidden=!h};
let t0=0;
window.trackUI=function(){const b=$('#bt'),t=$('#tbar');b.classList.toggle('rec',tracking);$('#nrect').textContent=tracking?'Berhenti':'Rekam';
 if(tracking){const s=Math.floor((Date.now()-t0)/1e3),p=n=>String(n).padStart(2,'0');t.hidden=false;t.innerHTML=`⏺ Merekam · ${fd(len(tcoords))} · ${p(Math.floor(s/3600))}:${p(Math.floor(s/60)%60)}:${p(s%60)}`}else t.hidden=true};
setInterval(trackUI,1000);
{const o=window.onFix;window.onFix=function(){o();trackUI()}}
window.toggleTrack=function(){
 if(!tracking){tracking=true;tcoords=[];t0=Date.now();tline=L.polyline([],{color:'#16a34a',weight:5}).addTo(map);toast('Rekam jejak dimulai.\nJaga layar tetap menyala.');trackUI()}
 else{if(!confirm('Berhenti merekam dan simpan jejak?'))return;tracking=false;map.removeLayer(tline);const c=tcoords;tcoords=[];trackUI();
  if(c.length>1)newF('LineString',c,{name:'Jejak '+new Date().toLocaleString('id-ID')});else toast('Jejak terlalu pendek, tidak disimpan')}};
window.pDraw=()=>sheet(`<h3>Tambah ke peta</h3><div class=grid>
 ${T('📍','Tandai lokasi saya',"if(!fix||!fix.t){needPerm(['location']);return toast('GPS belum siap')};closeSheet();newF('Point',[[fix.lon,fix.lat]])",'pri')}
 ${T('👆','Tandai titik di peta',"startMode('point')")}${T('〰️','Gambar jalur',"startMode('line')")}${T('⬠','Gambar area',"startMode('polygon')")}
 ${T('📏','Ukur jarak',"startMode('mline')")}${T('📐','Ukur luas',"startMode('marea')")}</div>`);
window.pMeasure=pDraw;
window.pLayers=()=>sheet(`<h3>Peta</h3><h4>Peta dasar (butuh internet)</h4><div class=grid>
 ${Object.entries({osm:['🛣','Peta Jalan'],topo:['⛰','Peta Kontur'],sat:['🛰','Citra Satelit'],none:['📴','Tanpa peta online']}).map(([k,[i,v]])=>T(i,v,`setBase('${k}');pLayers()`,S.base==k?'sel':'')).join('')}</div>
 <h4>Peta PDF (tanpa internet)</h4><button class="btn pri" onclick="$('#pdfin').click()">＋ Impor Peta PDF</button>
 ${PM.length?'':'<p class=mut>Belum ada peta PDF. Gunakan GeoPDF hasil ekspor ArcMap/QGIS.</p>'}
 ${PM.map(m=>`<div class=item><b>📄</b><span>${esc(m.name)}<br><small>Kejelasan</small><input type=range min=.1 max=1 step=.1 value=${m.op} oninput="opPM(${m.id},this.value)"></span></div>
 <button class=btn onclick="closeSheet();map.fitBounds(PM.find(x=>x.id==${m.id}).bounds)">Lihat</button><button class=btn onclick="togglePM(${m.id})">Tampil/Sembunyi</button><button class="btn del" onclick="delPM(${m.id})">Hapus</button>`).join('')}`);
window.pList=()=>sheet(`<h3>Data saya (${F.length})</h3>${F.length?'':'<div class=empty>Belum ada data.<br>Tekan tombol hijau ＋ untuk menambah.</div>'}
 ${F.slice().reverse().map(f=>{const c=f.coords[0],d=fix&&fix.t?` · ${fd(map.distance([fix.lat,fix.lon],[c[1],c[0]]))} dari Anda`:'';
 return`<div class=item onclick="edit(${f.id});map.fitBounds(L.latLngBounds(gf(${f.id}).coords.map(c=>[c[1],c[0]])),{maxZoom:17})"><b>${ICON[f.type]}</b><span>${esc(f.props.name||'(tanpa nama)')}<br><small>${NAMA[f.type]} · 📷 ${f.photos.length}${d}</small></span>›</div>`}).join('')}`);
window.addAttr=(k='')=>$('#cu').insertAdjacentHTML('beforeend',`<div class=r><input value="${esc(k)}" placeholder="Nama data"><input placeholder="Isi"></div>`);
window.edit=function(id){cur=id;const f=gf(id);if(!f)return;
 const cu=Object.entries(f.props.custom).map(([k,v])=>`<div class=r><input value="${esc(k)}" placeholder="Nama data"><input value="${esc(v)}" placeholder="Isi"></div>`).join('');
 const ph=f.photos.map((p,i)=>`<span class=th><img src="${p.data}">${p.lat.toFixed(5)}<br>${p.lon.toFixed(5)}<br><a onclick="delPhoto(${i})">hapus</a></span>`).join('');
 const m=f.type=='Point'?'':f.type=='LineString'?`Panjang ${fd(len(f.coords))}`:`Luas ${fa(area(f.coords))} · Keliling ${fd(len([...f.coords,f.coords[0]]))}`,c0=f.coords[0];
 sheet(`<h3>${ICON[f.type]} ${NAMA[f.type]}</h3><p class=mut>${m?m+'<br>':''}${fmt(c0[1],c0[0])}</p>
 <input id=en placeholder="Nama / judul" value="${esc(f.props.name)}"><textarea id=ed rows=2 placeholder="Keterangan">${esc(f.props.desc)}</textarea>
 <h4>Data tambahan</h4><div id=cu>${cu}</div><div class=chips>${['Jenis','Jumlah','Kondisi','Pelaku'].map(k=>`<button onclick="addAttr('${k}')">+ ${k}</button>`).join('')}<button onclick="addAttr()">+ Lainnya</button></div>
 <h4>Foto (otomatis berlokasi)</h4><div>${ph}</div><button class=btn onclick="takePhoto('cam')">📷 Ambil foto</button><button class=btn onclick="takePhoto('gal')">🖼 Dari galeri</button>
 <h4>Aksi</h4><button class="btn pri" onclick="grab();closeSheet();toast('Tersimpan')">💾 Simpan</button>
 <button class=btn onclick="grab();setTarget(${c0[1]},${c0[0]},gf(cur).props.name||'Objek');closeSheet()">🎯 Tuju ke sini</button>
 <button class=btn onclick="grab();closeSheet();map.fitBounds(L.latLngBounds(gf(cur).coords.map(c=>[c[1],c[0]])),{maxZoom:18})">🔍 Lihat di peta</button>
 <button class="btn del" onclick=delF()>🗑 Hapus</button>`)};
window.pMenu=function(){const o=(k,a)=>Object.entries(a).map(([v,t])=>`<option value=${v} ${S[k]==v?'selected':''}>${t}</option>`).join('');
 sheet(`<h3>Lainnya</h3><h4>Koordinat</h4><select onchange="S.coord=this.value;persist();hud()">${o('coord',{dd:'Derajat desimal (-0.12345, 109.12345)',dms:'Derajat-menit-detik',utm:'UTM'})}</select>
 <h4>Satuan jarak & luas</h4><select onchange="S.unit=this.value;persist()">${o('unit',{metric:'Meter / Kilometer / Hektar',imperial:'Kaki / Mil / Acre',nautical:'Mil laut'})}</select>
 <h4>Simpan & bagikan data</h4><div class=grid>${T('🌐','GeoJSON','expGJ()')}${T('🌍','KMZ (Google Earth)','expKMZ()')}${T('🗂','SHP (ArcGIS/QGIS)','expSHP()')}</div>
 <p class=mut>Pilih aplikasi tujuan (Files, Drive, WhatsApp, dll).</p>
 <h4>Info</h4><button class=btn onclick=pHelp()>❓ Cara pakai</button><button class=btn onclick=pAbout()>ℹ️ Tentang TAPAK</button>`)};
window.pHelp=()=>sheet(`<h3>Cara pakai</h3>
 <p><b>📴 Peta tanpa sinyal</b><br>Peta → Impor Peta PDF → pilih berkas GeoPDF dari HP.</p>
 <p><b>📍 Menandai temuan</b><br>Tambah → Tandai lokasi saya. Isi nama dan data, ambil foto, lalu Simpan.</p>
 <p><b>⏺ Merekam jalur patroli</b><br>Tekan Rekam saat mulai, Berhenti saat selesai. Jaga layar tetap menyala.</p>
 <p><b>📏 Mengukur</b><br>Tambah → Ukur jarak / Ukur luas, lalu ketuk titik-titik di peta.</p>
 <p><b>🧭 Menuju sebuah titik</b><br>Buka data → Tuju ke sini. Jarak dan arah tampil di atas.</p>
 <p><b>📤 Mengirim data</b><br>Lainnya → pilih GeoJSON, KMZ, atau SHP.</p>
 <p><b>🔤 Ganti format koordinat</b><br>Ketuk kotak koordinat di kiri atas.</p>`);
window.pAbout=()=>sheet(`<div class=about>${$('#logo').outerHTML}<h3>TAPAK</h3><p><b>Teknologi Akuisisi dan Pencatatan Hutan Kita</b></p><p><em>Every Track Tells a Story.</em></p>
 <p class=mut>Peta, jejak, dan catatan lapangan untuk perlindungan hutan berbasis masyarakat.<br>Bekerja tanpa internet. Versi 1.0</p></div>`);
setTimeout(()=>$('#splash').classList.add('off'),1700);
kvg('seen').then(v=>{if(!v)setTimeout(()=>$('#welcome').hidden=false,1800)});
window.closeWelcome=()=>{$('#welcome').hidden=true;kv.set('seen',1).catch(()=>{})};
trackUI();
