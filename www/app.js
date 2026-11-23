'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C=window.Capacitor,native=C&&C.isNativePlatform&&C.isNativePlatform();
const plug=n=>C&&((C.Plugins&&C.Plugins[n])||(C.registerPlugin&&C.registerPlugin(n)));
// ---------- penyimpanan (IndexedDB) ----------
const dbp=new Promise((r,j)=>{const q=indexedDB.open('pm',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
const kv={get:async k=>{const d=await dbp;return new Promise((r,j)=>{const q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})},
set:async(k,v)=>{const d=await dbp;return new Promise((r,j)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r();t.onerror=t.onabort=()=>j(t.error||new Error('Transaksi dibatalkan'))})}};
const kvg=k=>kv.get(k).catch(e=>{console.error('baca gagal',k,e)});
let F=[],PM=[],S={coord:'dd',unit:'metric',base:'osm'},mode=null,draft=[],fix=null,tracking=false,tcoords=[],tline,target=null,cur=null,pick=null,hdg=null;
let saveWarned=false,t0=0,bgP=null,trkSaved=0,tcase=null;
const persist=()=>Promise.all([kv.set('F',F),kv.set('S',S)]).then(()=>{saveWarned=false}).catch(e=>{console.error('simpan gagal',e);if(!saveWarned){saveWarned=true;toast('⚠ Data GAGAL tersimpan (penyimpanan penuh?). Ekspor data Anda sekarang.')}});
const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2800)};
// ---------- peta ----------
const map=L.map('map',{zoomControl:false,attributionControl:false}).setView([-0.03,109.33],12);
map.createPane('pdf').style.zIndex=250;
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const bases={osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
topo:L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17}),
sat:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19})};
let baseL=null;
function setBase(k){if(baseL)map.removeLayer(baseL);baseL=bases[k]||null;if(baseL)baseL.addTo(map).bringToBack();S.base=k;persist()}
const FL=L.layerGroup().addTo(map),DG=L.layerGroup().addTo(map),GL=L.layerGroup().addTo(map);
function draw(){FL.clearLayers();F.forEach(f=>{const ll=f.coords.map(c=>[c[1],c[0]]),st={color:'#168C91',weight:4};let l;
 if(f.type!='Point')(f.type=='LineString'?L.polyline:L.polygon)(ll,{color:'#fff',weight:8,opacity:.9,fill:false,interactive:false}).addTo(FL);
 if(f.type=='Point')l=L.circleMarker(ll[0],{radius:9,color:'#fff',weight:3,fillColor:'#168C91',fillOpacity:1});
 else if(f.type=='LineString')l=L.polyline(ll,st);else l=L.polygon(ll,{...st,fillOpacity:.2});
 l.on('click',e=>{L.DomEvent.stopPropagation(e);edit(f.id)});
 if(f.props.name&&f.type=='Point')l.bindTooltip(esc(f.props.name),{permanent:true,direction:'right',className:'lt'});
 l.addTo(FL)})}
// ---------- format koordinat & satuan ----------
const dms=(v,p,n)=>{const a=Math.abs(v),d=Math.floor(a),m=Math.floor((a-d)*60),s=((a-d)*60-m)*60;return `${d}°${m}'${s.toFixed(1)}"${v<0?n:p}`};
function fmt(lat,lon){if(S.coord=='dms')return dms(lat,'N','S')+' '+dms(lon,'E','W');
 if(S.coord=='utm'){const z=Math.floor((lon+180)/6)+1,p=proj4(`+proj=utm +zone=${z}${lat<0?' +south':''} +datum=WGS84 +units=m +no_defs`,[lon,lat]);return `UTM ${z}${lat<0?'S':'N'} ${p[0].toFixed(0)}E ${p[1].toFixed(0)}N`}
 return lat.toFixed(6)+', '+lon.toFixed(6)}
function fd(m){if(S.unit=='imperial'){const f=m*3.28084;return f<5280?f.toFixed(0)+' ft':(f/5280).toFixed(2)+' mi'}
 if(S.unit=='nautical')return(m/1852).toFixed(2)+' nm';return m<1000?m.toFixed(0)+' m':(m/1000).toFixed(2)+' km'}
function fa(a){if(S.unit=='imperial'){const ac=a/4046.856;return ac<640?ac.toFixed(2)+' acre':(ac/640).toFixed(2)+' mi²'}
 return a<1e4?a.toFixed(0)+' m²':a<1e6?(a/1e4).toFixed(2)+' ha':(a/1e6).toFixed(2)+' km²'}
const len=c=>c.reduce((s,p,i)=>i?s+map.distance([c[i-1][1],c[i-1][0]],[p[1],p[0]]):0,0);
function area(c){let a=0;const R=6378137,r=Math.PI/180;for(let i=0;i<c.length;i++){const p=c[i],q=c[(i+1)%c.length];a+=(q[0]-p[0])*r*(2+Math.sin(p[1]*r)+Math.sin(q[1]*r))}return Math.abs(a*R*R/2)}
function brg(a,b){const r=Math.PI/180,dl=(b[1]-a[1])*r,y=Math.sin(dl)*Math.cos(b[0]*r),x=Math.cos(a[0]*r)*Math.sin(b[0]*r)-Math.sin(a[0]*r)*Math.cos(b[0]*r)*Math.cos(dl);return(Math.atan2(y,x)/r+360)%360}
const card=d=>['U','TL','T','TG','S','BD','B','BL'][Math.round(d/45)%8];
// ---------- GPS, kompas, HUD ----------
let gpsMsg='Mencari GPS… (pergi ke tempat terbuka)',gpsOn=false;
const applyFix=(lat,lon,acc,hd,sp)=>{fix={lat,lon,acc,hd,sp,t:Date.now()};kv.set('last',fix).catch(()=>{});onFix()};
let gpsWatch=null,gpsRetry=0;
function watchGPS(G,cb){
 // Capacitor 8: 'timeout' berlaku untuk watchPosition dan 'interval' bawaannya = timeout -> atur eksplisit,
 // lalu pasang ulang watch bila berhenti karena galat agar GPS tidak mati diam-diam.
 gpsWatch=G.watchPosition({enableHighAccuracy:true,timeout:120000,maximumAge:0,interval:2000,minimumUpdateInterval:1000},(p,e)=>{
  if(p){gpsRetry=0;cb(p);return}
  if(e&&!fix){gpsMsg='GPS belum mendapat sinyal. Pastikan Lokasi HP aktif & berada di area terbuka.';hud()}
  if(e&&gpsRetry<30){gpsRetry++;const old=gpsWatch;gpsWatch=null;Promise.resolve(old).then(id=>id!=null&&G.clearWatch({id})).catch(()=>{});setTimeout(()=>{if(!gpsWatch)watchGPS(G,cb)},3000)}
 });
 gpsWatch.catch(()=>{gpsWatch=null;gpsOn=false})}
async function startGPS(){const G=plug('Geolocation');
 const cb=p=>{if(p)applyFix(p.coords.latitude,p.coords.longitude,p.coords.accuracy,p.coords.heading,p.coords.speed)};
 if(G&&native){
  if(gpsOn)return;
  let st;try{st=await G.checkPermissions()}catch(e){st={location:'granted'}}
  if(st.location!=='granted'&&st.coarseLocation!=='granted'){gpsMsg='Izin lokasi belum diberikan.';hud();return}
  if(st.location!=='granted'){gpsMsg='Lokasi hanya "perkiraan". Aktifkan "Gunakan lokasi presisi" di Pengaturan > Aplikasi > TAPAK > Izin.';hud()}
  gpsOn=true;
  G.getCurrentPosition({enableHighAccuracy:false,timeout:15000,maximumAge:600000}).then(cb).catch(()=>{});
  watchGPS(G,cb)
 }else if(navigator.geolocation&&!gpsOn){gpsOn=true;navigator.geolocation.watchPosition(cb,()=>{},{enableHighAccuracy:true})}}
let gm,gc,tgl;
function onFix(){const ll=[fix.lat,fix.lon];
 if(!gm){gm=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#17324D',fillOpacity:1}).addTo(GL);gc=L.circle(ll,{radius:fix.acc,weight:1,color:'#168C91',fillColor:'#168C91',fillOpacity:.12}).addTo(GL)}
 else{gm.setLatLng(ll);gc.setLatLng(ll).setRadius(fix.acc)}
 if(tracking&&fix.acc<=50){const l=tcoords[tcoords.length-1];if(!l||map.distance([l[1],l[0]],ll)>3){tcoords.push([fix.lon,fix.lat]);const tl=tcoords.map(c=>[c[1],c[0]]);tline.setLatLngs(tl);if(tcase)tcase.setLatLngs(tl);saveTrk()}}
 if(fix.hd!=null&&fix.sp>1)setHdg(fix.hd);
 if(target){if(tgl)map.removeLayer(tgl);tgl=L.polyline([ll,[target.lat,target.lon]],{color:'#168C91',weight:3,dashArray:'6 8'}).addTo(map)}
 hud()}
function hud(){} // diganti oleh ui.js
function setTarget(lat,lon,name){target={lat,lon,name};hud();if(fix)onFix()}
function setHdg(h){hdg=h;$('#ar').style.transform=`rotate(${h}deg)`;$('#hd').textContent=Math.round(h)+'° '+card(h)}
addEventListener('deviceorientationabsolute',e=>{if(e.alpha!=null)setHdg((360-e.alpha)%360)},true);
function locate(){if(fix)map.setView([fix.lat,fix.lon],Math.max(map.getZoom(),16));else toast('GPS belum mendapat sinyal')}
let pm;function setPick(ll){pick=ll;if(pm)map.removeLayer(pm);pm=L.circleMarker(ll,{radius:7,color:'#17324D',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(map);hud()}
// ---------- track (tetap merekam saat layar dikunci / aplikasi diminimalkan) ----------
// Android menghentikan GPS WebView begitu aplikasi di latar belakang. Maka saat merekam, TAPAK menjalankan
// layanan latar depan (foreground service) lewat plugin @capacitor-community/background-geolocation,
// dengan notifikasi permanen. Titik juga disimpan ke IndexedDB berkala agar jejak selamat bila aplikasi tertutup.
const BG=()=>native&&plug('BackgroundGeolocation');
function bgStart(){const B=BG();if(!B){if(native)toast('Rekam latar belakang tidak tersedia di build ini');return}
 if(bgP)return;
 bgP=B.addWatcher({backgroundTitle:'TAPAK sedang merekam jejak',backgroundMessage:'Spectra CC · Ketuk untuk membuka TAPAK',requestPermissions:false,stale:false,distanceFilter:3},(l,e)=>{
  if(e){if(e.code==='NOT_AUTHORIZED'){toast('Izin lokasi diperlukan agar rekaman tetap jalan di latar belakang');bgStop()}return}
  if(l)applyFix(l.latitude,l.longitude,l.accuracy,l.bearing,l.speed)}).catch(err=>{bgP=null;console.error('bg watcher',err);toast('Rekam di latar belakang gagal aktif. Biarkan TAPAK tetap terbuka.')})}
async function bgStop(){const B=BG(),p=bgP;bgP=null;if(!B||!p)return;try{const id=await p;if(id!=null)await B.removeWatcher({id})}catch(e){console.error('bg stop',e)}}
function saveTrk(force){const n=Date.now();if(!force&&n-trkSaved<8000)return;trkSaved=n;kv.set('trk',{t0,coords:tcoords}).catch(()=>{})}
function startTrack(c,t){tracking=true;tcoords=c||[];t0=t||Date.now();if(tline)map.removeLayer(tline);if(tcase)map.removeLayer(tcase);
 const tl=tcoords.map(p=>[p[1],p[0]]);tcase=L.polyline(tl,{color:'#fff',weight:9,opacity:.9,interactive:false}).addTo(map);
 tline=L.polyline(tl,{color:'#367A55',weight:5}).addTo(map);saveTrk(true);bgStart()}
async function endTrack(){tracking=false;if(tline){map.removeLayer(tline);tline=null}if(tcase){map.removeLayer(tcase);tcase=null}const c=tcoords;tcoords=[];await bgStop();trkSaved=0;kv.set('trk',null).catch(()=>{});return c}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&tracking)saveTrk(true)});
// ---------- menggambar & mengukur ----------
function startMode(m){closeSheet();mode=m;draft=[];DG.clearLayers();$('#dbar').hidden=false;$('#dinfo').textContent=m=='point'?'Ketuk peta untuk menaruh titik':'Ketuk peta untuk menambah vertex'}
function measText(){if(draft.length<2)return 'Ketuk peta untuk menambah vertex';
 if(mode=='polygon'||mode=='marea')return draft.length>2?`Luas ${fa(area(draft))} • Keliling ${fd(len([...draft,draft[0]]))}`:`Panjang ${fd(len(draft))}`;return `Panjang ${fd(len(draft))}`}
function redrawDraft(){DG.clearLayers();const ll=draft.map(c=>[c[1],c[0]]);ll.forEach(p=>L.circleMarker(p,{radius:5,color:'#17324D',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(DG));
 if(ll.length>1)((mode=='polygon'||mode=='marea')&&ll.length>2?L.polygon:L.polyline)(ll,{color:'#168C91',weight:3,dashArray:'6 8'}).addTo(DG);
 $('#dinfo').textContent=measText()}
const undo=()=>{draft.pop();redrawDraft()};
function cancel(){mode=null;draft=[];DG.clearLayers();$('#dbar').hidden=true}
function finish(){const m=mode,d=draft.slice();
 if(m=='line'||m=='polygon'){if(d.length<(m=='line'?2:3))return toast('Vertex kurang');cancel();newF(m=='line'?'LineString':'Polygon',d)}else cancel()}
map.on('click',e=>{const p=[e.latlng.lng,e.latlng.lat];
 if(mode=='point'){cancel();newF('Point',[p]);return}
 if(mode){draft.push(p);redrawDraft();return}
 setPick(e.latlng)});
function newF(type,coords,props){const f={id:Date.now(),type,coords,props:{name:'',desc:'',custom:{},...props},photos:[]};F.push(f);persist();draw();edit(f.id)}
const gf=id=>F.find(f=>f.id==id);
// ---------- editor atribut & foto ----------
function grab(){const f=gf(cur);if(!f||!$('#en'))return;f.props.name=$('#en').value;f.props.desc=$('#ed').value;const c={};
 document.querySelectorAll('#cu .r').forEach(r=>{const k=r.children[0].value.trim();if(k)c[k]=r.children[1].value});f.props.custom=c;persist();draw()}
function delF(){if(!confirm('Hapus objek ini?'))return;F=F.filter(f=>f.id!=cur);persist();draw();closeSheet()}
function delPhoto(i){grab();gf(cur).photos.splice(i,1);persist();edit(cur)}
function readGPS(url){try{const g=piexif.load(url).GPS,h=piexif.GPSHelper;if(g[piexif.GPSIFD.GPSLatitude]&&g[piexif.GPSIFD.GPSLongitude])
 return[h.dmsRationalToDeg(g[piexif.GPSIFD.GPSLatitude],g[piexif.GPSIFD.GPSLatitudeRef]),h.dmsRationalToDeg(g[piexif.GPSIFD.GPSLongitude],g[piexif.GPSIFD.GPSLongitudeRef])]}catch(e){}return null}
function writeGPS(url,lat,lon){try{let ex;try{ex=piexif.load(url)}catch(e){ex={'0th':{},Exif:{},GPS:{}}}const G=piexif.GPSIFD,g={};
 g[G.GPSLatitudeRef]=lat<0?'S':'N';g[G.GPSLatitude]=piexif.GPSHelper.degToDmsRational(Math.abs(lat));
 g[G.GPSLongitudeRef]=lon<0?'W':'E';g[G.GPSLongitude]=piexif.GPSHelper.degToDmsRational(Math.abs(lon));ex.GPS=g;return piexif.insert(piexif.dump(ex),url)}catch(e){return url}}
async function addPhoto(inp){const file=inp.files[0];inp.value='';if(!file)return;grab();const f=gf(cur);
 const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)});
 let pos=readGPS(url),src='exif';
 if(!pos){if(fix&&Date.now()-fix.t<12e4){pos=[fix.lat,fix.lon];src='gps'}else{pos=[f.coords[0][1],f.coords[0][0]];src='objek'}}
 const img=new Image();img.src=url;await img.decode();const k=Math.min(1,1600/Math.max(img.width,img.height)),cv=document.createElement('canvas');
 cv.width=img.width*k;cv.height=img.height*k;cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
 const data=writeGPS(cv.toDataURL('image/jpeg',.85),pos[0],pos[1]),id=Date.now();
 f.photos.push({id,name:`foto_${id}.jpg`,data,lat:pos[0],lon:pos[1],src,time:new Date().toISOString()});persist();edit(cur);toast('Foto tersimpan + geotag ('+src+')')}
// ---------- GeoPDF (georeferensi & warp: lihat georef.js, diuji di test/georef.test.js) ----------
const MAX_PDF=100*1048576,isPDF=b=>new TextDecoder('latin1').decode(new Uint8Array(b,0,Math.min(1024,b.byteLength))).includes('%PDF-');
const PL={};
// batas tampil = batas dasar + geseran manual (dx,dy dalam meter Mercator)
const pmBounds=m=>{const a=Georef.merc(m.bounds[0][1],m.bounds[0][0]),b=Georef.merc(m.bounds[1][1],m.bounds[1][0]),dx=m.dx||0,dy=m.dy||0,s=Georef.unmerc(a[0]+dx,a[1]+dy),n=Georef.unmerc(b[0]+dx,b[1]+dy);return[[s[1],s[0]],[n[1],n[0]]]};
async function importPDF(file){if(!file)return;if(file.size>MAX_PDF)return toast('Berkas terlalu besar (maksimal '+MAX_PDF/1048576+' MB)');toast('Memproses PDF… (bisa beberapa detik)');
 try{const buf=await file.arrayBuffer();if(!isPDF(buf))throw'Berkas ini bukan PDF';
  pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:buf.slice(0),isEvalSupported:false,enableXfa:false}).promise,page=await pdf.getPage(1);
  const info=await Georef.parse(new Uint8Array(buf),page.ref&&page.ref.num);
  if(!info.chosen)throw'PDF tidak punya georeferensi terbaca. Butuh GeoPDF: ArcMap centang "Export Map Georeference Information", QGIS centang "Create Geospatial PDF".';
  const model=Georef.buildModel(info.chosen),v1=page.getViewport({scale:1}),vp=page.getViewport({scale:Math.min(4,3600/Math.max(v1.width,v1.height))}),cv=document.createElement('canvas');
  cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
  const cx=cv.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:cx,viewport:vp,background:'#ffffff'}).promise;
  const src=cx.getImageData(0,0,cv.width,cv.height),o=Georef.warp({data:src.data,w:cv.width,h:cv.height},vp.transform,model);
  const oc=document.createElement('canvas');oc.width=o.W;oc.height=o.H;oc.getContext('2d').putImageData(new ImageData(o.data,o.W,o.H),0,0);
  const v=info.chosen,geo={crs:model.crs.label,exact:model.exact,rms:+model.rms.toFixed(2),maxErr:+model.maxErr.toFixed(2),n:model.n,warn:model.warn,res:+o.ps.toFixed(2),
   viewports:info.viewports.length,chosen:{name:v.name,bbox:v.bbox,gcs:{type:v.gcs.type,epsg:v.gcs.epsg,wkt:v.gcs.wkt&&v.gcs.wkt.slice(0,600)},gpts:v.gpts,lpts:v.lpts}};
  const m={id:Date.now(),name:file.name,bounds:o.bounds,img:oc.toDataURL('image/webp',.85),op:1,dx:0,dy:0,geo};
  PM.push(m);try{await kv.set('PM',PM)}catch(e){PM.pop();throw'Penyimpanan tidak cukup untuk peta ini'}
  showPM(m);map.fitBounds(pmBounds(m));
  toast(model.warn?'Peta PDF dimuat, tetapi: '+model.warn:model.rms>5?'Peta PDF dimuat. Peringatan: titik kontrol georeferensi tidak konsisten (galat '+model.rms.toFixed(0)+' m)':'Peta PDF dimuat · '+model.crs.label+' · galat ±'+model.rms.toFixed(1)+' m');
  pLayers()}catch(e){toast('Gagal: '+(e.message||e));console.error(e)}}
function showPM(m){PL[m.id]=L.imageOverlay(m.img,pmBounds(m),{pane:'pdf',opacity:m.op}).addTo(map)}
function togglePM(id){const l=PL[id];map.hasLayer(l)?map.removeLayer(l):l.addTo(map)}
function opPM(id,v){PL[id].setOpacity(+v);PM.find(m=>m.id==id).op=+v;kv.set('PM',PM)}
// geser manual (kalibrasi): east/north dalam meter di tanah
function nudgePM(id,east,north){const m=PM.find(x=>x.id==id);if(!m)return;const lat=(m.bounds[0][0]+m.bounds[1][0])/2,k=1/Math.cos(lat*Math.PI/180);
 m.dx=(m.dx||0)+east*k;m.dy=(m.dy||0)+north*k;PL[id].setBounds(pmBounds(m));kv.set('PM',PM).catch(()=>{});if(window.pNudge)pNudge(id,true)}
function resetPM(id){const m=PM.find(x=>x.id==id);if(!m)return;m.dx=0;m.dy=0;PL[id].setBounds(pmBounds(m));kv.set('PM',PM).catch(()=>{});if(window.pNudge)pNudge(id,true)}
function pmOffset(m){const lat=(m.bounds[0][0]+m.bounds[1][0])/2,c=Math.cos(lat*Math.PI/180);return{e:(m.dx||0)*c,n:(m.dy||0)*c}}
function copyGeo(id){const m=PM.find(x=>x.id==id);if(!m)return;const t=JSON.stringify({app:'TAPAK '+(window.APP_VER||''),file:m.name,bounds:m.bounds,offsetM:pmOffset(m),geo:m.geo||null},null,1);
 (navigator.clipboard&&navigator.clipboard.writeText(t).then(()=>toast('Info georeferensi disalin')).catch(()=>toast('Gagal menyalin')))||toast('Penyalinan tidak didukung')}
async function delPM(id){if(!confirm('Hapus peta ini?'))return;if(PL[id]){map.removeLayer(PL[id]);delete PL[id]}PM=PM.filter(m=>m.id!=id);await kv.set('PM',PM);pLayers()}
// ---------- ekspor ----------
async function purgeExports(){if(!native)return;try{const Filesystem=plug('Filesystem'),r=await Filesystem.readdir({path:'',directory:'CACHE'});
 for(const f of r.files||[]){const nm=f.name||f;if(/^patroli.*\.(geojson|kmz|zip)$/.test(nm))await Filesystem.deleteFile({path:nm,directory:'CACHE'}).catch(()=>{})}}catch(e){}}
async function out(name,blob){const b64=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(blob)});
 if(native){const Filesystem=plug('Filesystem'),Share=plug('Share');const w=await Filesystem.writeFile({path:name,data:b64,directory:'CACHE'});await Share.share({title:name,url:w.uri})}
 else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click()}}
const geom=f=>({type:f.type,coordinates:f.type=='Point'?f.coords[0]:f.type=='Polygon'?[[...f.coords,f.coords[0]]]:f.coords});
const gj=(trunc)=>({type:'FeatureCollection',features:F.map(f=>{const p={nama:f.props.name,deskripsi:f.props.desc};
 for(const[k,v]of Object.entries(f.props.custom))p[trunc?k.slice(0,10):k]=v;p[trunc?'foto':'foto']=f.photos.map(x=>x.name).join(';');return{type:'Feature',properties:p,geometry:geom(f)}})});
const expGJ=()=>out('patroli.geojson',new Blob([JSON.stringify({...gj(),generator:'TAPAK - Spectra CC (Spectra Citra Cendekia)'},null,1)],{type:'application/geo+json'}));
async function expKMZ(){const z=new JSZip();let k='<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Patroli</name><description>Dibuat dengan TAPAK · Spectra CC (Spectra Citra Cendekia)</description><Style id="s"><LineStyle><color>ff481de1</color><width>3</width></LineStyle><PolyStyle><color>55481de1</color></PolyStyle></Style>';
 F.forEach(f=>{const co=f.coords.map(c=>c[0]+','+c[1]+',0').join(' '),g=f.type=='Point'?`<Point><coordinates>${co}</coordinates></Point>`:f.type=='LineString'?`<LineString><coordinates>${co}</coordinates></LineString>`:`<Polygon><outerBoundaryIs><LinearRing><coordinates>${co} ${f.coords[0][0]},${f.coords[0][1]},0</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
 const ed=Object.entries(f.props.custom).map(([a,b])=>`<Data name="${esc(a)}"><value>${esc(b)}</value></Data>`).join('');
 const im=f.photos.map(p=>{z.file('files/'+p.name,p.data.split(',')[1],{base64:true});return`<img src="files/${p.name}" width="400"/>`}).join('');
 k+=`<Placemark><name>${esc(f.props.name||f.type)}</name><description><![CDATA[${esc(f.props.desc||'').replace(/\n/g,'<br/>')}<br/>${im}]]></description><styleUrl>#s</styleUrl><ExtendedData>${ed}</ExtendedData>${g}</Placemark>`});
 z.file('doc.kml',k+'</Document></kml>');out('patroli.kmz',await z.generateAsync({type:'blob'}))}
async function expSHP(){if(!window.shpwrite)return toast('Modul SHP tidak termuat');
 try{const b64=await shpwrite.zip(gj(true),{folder:'patroli',types:{point:'titik',polygon:'poligon',line:'garis'}}),z=await JSZip.loadAsync(b64,{base64:true});
 F.forEach(f=>f.photos.forEach(p=>z.file('patroli/foto/'+p.name,p.data.split(',')[1],{base64:true})));out('patroli_shp.zip',await z.generateAsync({type:'blob'}))}catch(e){toast('SHP gagal: '+e.message)}}
// ---------- start ----------
(async()=>{try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}purgeExports();
S={...S,...(await kvg('S')||{})};F=await kvg('F')||[];const last=await kvg('last');if(last){fix={...last,t:0};map.setView([last.lat,last.lon],14);gpsMsg='Posisi terakhir diketahui; menunggu GPS…'}PM=await kvg('PM')||[];setBase(S.base);draw();PM.forEach(showPM);startGPS();hud();
const tk=await kvg('trk');if(tk&&tk.coords&&tk.coords.length){startTrack(tk.coords,tk.t0);if(window.trackUI)trackUI();toast('Rekaman jejak sebelumnya dilanjutkan ('+tk.coords.length+' titik)')}})();
