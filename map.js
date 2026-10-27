/* OpenStreetMap data via OpenFreeMap; MapLibre GL JS draws the map. */
const BusMap=(()=>{
 let map=null, mapReady=false, markers=[], routeId='1002', view='routes', mode='campus', selectedStop=null, onStopClick=()=>{};
 let initialization=null, resizeObserver=null;
 const liveRoutes=new Map(), campusIds=new Set(CAMPUS_STOPS.map(s=>s.id));
 const color=id=>id==='1002'?'#d94e79':id?.startsWith('급행')?'#df332f':['43','91','192','193'].includes(id)?'#2a8c60':'#d9a800';
 const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
 function decodePath(encoded){
  let i=0,lat=0,lon=0; const points=[];
  while(i<encoded.length){const delta=[];
   for(let j=0;j<2;j++){let shift=0,result=0,b;
    do{b=encoded.charCodeAt(i++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32&&i<=encoded.length);
    delta.push((result&1)?~(result>>1):(result>>1));
   }
   lat+=delta[0];lon+=delta[1];points.push([lat/1e5,lon/1e5]);
  }
  return points;
 }
 const routePoints=()=>!routeId?[]:liveRoutes.get(routeId)?.vertex.map(p=>[p.LATITUDE,p.LONGITUDE])||(ROUTE_MAPS[routeId]?decodePath(ROUTE_MAPS[routeId].path):[]);
 const routeStops=()=>{
  if(!routeId)return [];
  const live=liveRoutes.get(routeId);
  return live?live.stops.map(s=>({id:s.BUSSTOP_ID,name:s.BUSSTOP_NAME,ars:s.ARS_ID,lat:s.LAT,lon:s.LON})):(ROUTE_STOP_ORDER[routeId]||[]).map(id=>ALL_STOPS[id]);
 };
 function setLoading(loading){
  const panel=document.querySelector('#mapLoading');
  if(panel)panel.hidden=!loading;
  document.querySelector('#map')?.setAttribute('aria-busy',String(loading));
 }
 function showStatus(title,message){
  const panel=document.querySelector('#mapFailure');
  panel.querySelector('b').textContent=title;panel.querySelector('p').textContent=message;panel.hidden=false;
 }
 function loadLibrary(){
  return new Promise((resolve,reject)=>{
   if(window.maplibregl?.Map)return resolve();
   const script=document.createElement('script');
   script.src='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js';script.async=true;
   const finish=error=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove?.();reject(error);}else resolve();};
   const timer=setTimeout(()=>finish(new Error('지도 라이브러리 연결 시간 초과')),15000);
   script.onload=()=>finish(window.maplibregl?.Map?null:new Error('지도 라이브러리를 사용할 수 없음'));
   script.onerror=()=>finish(new Error('지도 라이브러리 연결 실패'));
   document.head.appendChild(script);
  });
 }
 function waitForMap(targetMap){
  return new Promise((resolve,reject)=>{
   let done=false,lastError=null;
   const onError=event=>{lastError=event.error||new Error('지도 배경 연결 실패');};
   const finish=error=>{
    if(done)return;done=true;clearTimeout(timer);
    targetMap.off?.('load',onLoad);targetMap.off?.('error',onError);
    error?reject(error):resolve();
   };
   const onLoad=()=>finish();
   const timer=setTimeout(()=>finish(lastError||new Error('지도 배경 연결 시간 초과')),20000);
   // A failed tile can recover while the rest of the map continues loading.
   targetMap.on('error',onError);targetMap.once('load',onLoad);
   if(targetMap.loaded?.())finish();
  });
 }
 function disposeMap(){
  mapReady=false;resizeObserver?.disconnect();resizeObserver=null;
  markers.forEach(marker=>marker.remove?.());markers=[];
  map?.remove?.();map=null;
 }
 function observeSize(){
  const container=document.querySelector('#map');
  if(!window.ResizeObserver||!container)return;
  let width=0,height=0;
  resizeObserver=new window.ResizeObserver(entries=>{
   const size=entries[0]?.contentRect;
   if(!size||!size.width||!size.height||(size.width===width&&size.height===height))return;
   width=size.width;height=size.height;
   relayout();
  });
  resizeObserver.observe(container);
 }
 function init(options={}){
  onStopClick=options.onStopClick||onStopClick;
  if(initialization)return initialization;
  if(mapReady)return Promise.resolve(true);
  disposeMap();setLoading(true);
  const panel=document.querySelector('#mapFailure');
  panel.hidden=true;panel.dataset.mapStatus='loading';delete panel.dataset.mapError;
  initialization=initialize().finally(()=>{initialization=null;});
  return initialization;
 }
 async function initialize(){
  let phase='library';
  try{
   await loadLibrary();phase='map';
   map=new maplibregl.Map({container:'map',style:BUS_CONFIG.mapStyleUrl||'https://tiles.openfreemap.org/styles/liberty',center:[CAMPUS_STOPS[0].lon,CAMPUS_STOPS[0].lat],zoom:13,attributionControl:true});
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
   phase='background';await waitForMap(map);mapReady=true;
   phase='stops';draw();setMode(mode);
   observeSize();
   const panel=document.querySelector('#mapFailure');
   panel.hidden=true;panel.dataset.mapStatus='ready';panel.dataset.mapPhase='ready';delete panel.dataset.mapError;
   return true;
  }catch(error){
   disposeMap();
   const panel=document.querySelector('#mapFailure');
   panel.dataset.mapStatus='failed';panel.dataset.mapPhase=phase;panel.dataset.mapError=String(error?.message||error);
   showStatus('지도를 불러오지 못했습니다.','인터넷 연결을 확인한 뒤 다시 불러오거나 공식 지도를 열어주세요.');
   return false;
  }finally{setLoading(false);}
 }
 function retry(options={}){
  if(initialization)return initialization;
  disposeMap();return init(options);
 }
 function addStop(s,isCampus,inRoute){
  if(!s||!Number.isFinite(Number(s.lat))||!Number.isFinite(Number(s.lon)))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='kakao-stop '+(isCampus?'campus-stop':'route-stop')+(inRoute?' on-route':'')+(selectedStop===s.id?' active':'');
  button.title=s.name+' · '+s.ars;
  button.setAttribute('aria-label',s.name+' 정류장 '+s.ars+', 상세 보기');
  if(isCampus)button.textContent=String(Math.floor(CAMPUS_STOPS.findIndex(p=>p.id===s.id)/2)+1);
  const label=document.createElement('span');label.className='kakao-stop-label';label.textContent=s.name+' · '+s.ars;button.appendChild(label);
  button.addEventListener('click',event=>{event.stopPropagation();onStopClick(s.id);});
  const markerElement=document.createElement('div');
  markerElement.appendChild(button);
  markers.push(new maplibregl.Marker({element:markerElement,anchor:'center'}).setLngLat([Number(s.lon),Number(s.lat)]).addTo(map));
 }
 function draw(){
  if(!mapReady)return;
  markers.forEach(marker=>marker.remove());markers=[];
  const stops=routeStops();
  const points=view==='routes'?routePoints():[];
  const data={type:'FeatureCollection',features:points.length>1?[{type:'Feature',geometry:{type:'LineString',coordinates:points.map(([lat,lon])=>[lon,lat])},properties:{}}]:[]};
  if(map.getSource('bus-route')){map.getSource('bus-route').setData(data);map.setPaintProperty('bus-route-line','line-color',color(routeId));}
  else{map.addSource('bus-route',{type:'geojson',data});map.addLayer({id:'bus-route-line',type:'line',source:'bus-route',paint:{'line-color':color(routeId),'line-width':5,'line-opacity':0.85}});}
  const seen=new Set();
  if(view==='routes')for(const s of stops){if(!s||seen.has(s.id)||campusIds.has(s.id))continue;seen.add(s.id);addStop(s,false,true);}
  const routeIds=new Set(stops.filter(Boolean).map(s=>s.id));
  for(const s of CAMPUS_STOPS)addStop(s,true,view==='stops'||!routeId||routeIds.has(s.id));
 }
 function fit(points,padding=50,animate=false){
  if(!map||!points.length)return;
  const bounds=new maplibregl.LngLatBounds();
  points.forEach(([lat,lon])=>bounds.extend([lon,lat]));
  map.resize();map.fitBounds(bounds,{padding:{top:65,right:padding,bottom:75,left:padding},maxZoom:15,duration:animate&&!reducedMotion()?550:0});
 }
 function setMode(nextMode,{animate=false}={}){mode=nextMode==='route'&&routeId?'route':'campus';if(!map)return;if(mode==='route'&&view==='routes')fit(routePoints(),50,animate);else fit(CAMPUS_STOPS.map(s=>[s.lat,s.lon]),40,animate);}
 function setRoute(id,{fitRoute=false,animate=false}={}){routeId=id||null;if(!routeId)selectedStop=null;draw();if(fitRoute)setMode(routeId?'route':'campus',{animate});}
 function relayout(){if(mapReady&&document.querySelector('#map')?.offsetWidth)map.resize();}
 function setView(nextView){view=nextView;draw();requestAnimationFrame(()=>{if(!map)return;relayout();if(view==='stops')setMode('campus');});}
 function focusStop(id){selectedStop=id;const s=ALL_STOPS[id]||CAMPUS_STOPS.find(p=>p.id===id)||routeStops().find(p=>p?.id===id);draw();if(map&&s)map.flyTo({center:[s.lon,s.lat],zoom:15,duration:reducedMotion()?0:400});}
 function focusGroup(name){selectedStop=null;draw();const group=CAMPUS_STOPS.filter(s=>s.name===name);if(group.length)fit(group.map(s=>[s.lat,s.lon]),75);else setMode('campus');}
 function setLiveRoute(id,data){liveRoutes.set(id,data);if(id!==routeId)return;draw();if(mode==='route')setMode('route');}
 return{init,retry,setRoute,setView,setMode,focusStop,focusGroup,setLiveRoute,decodePath,relayout,clearSelection:()=>{selectedStop=null;draw();},isReady:()=>mapReady};
})();
