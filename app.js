'use strict';
const $ = s => document.querySelector(s);
const escapeHtml = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stopNames = ['광주과학기술원후문','한국전자통신연구원','과기원','광주디자인진흥원'];
const S = {B:stopNames[0], E:stopNames[1], G:stopNames[2], D:stopNames[3]};
// Source-guide no-transfer estimates, maintained independently from timeline calculations.
const HUBS = [
 {name:'광주송정역',sub:'5번 출구 · KTX / ITX',icon:'train',rows:[['1002',S.B,24]]},
 {name:'광주역',sub:'ITX',icon:'train',rows:[['03',S.B,42],['30',S.E,56],['30',S.G,55]]},
 {name:'광주종합버스터미널',sub:'유스퀘어',icon:'bus',rows:[['급행 03',S.B,33],['03',S.B,38],['09',S.E,34],['09',S.G,33],['34',S.D,50,12]]},
 {name:'국립아시아문화전당',sub:'ACC',icon:'culture',rows:[['급행 05',S.B,30],['05',S.B,47],['09',S.B,54],['09',S.E,45],['09',S.G,44],['30',S.E,66],['30',S.G,65],['51',S.B,50],['51',S.E,46],['51',S.G,45]]},
 {name:'광주기아챔피언스필드',sub:'야구장',icon:'ball',rows:[['급행 05',S.B,20],['05',S.B,38],['51',S.B,41],['51',S.E,37],['51',S.G,36]]},
 {name:'비아고속버스정류소',sub:'고속버스',icon:'bus',rows:[['192',S.G,6]],note:'192번 장성마산 방면 · 배차 65–110분 유의'},
 {name:'KENTECH',sub:'한국에너지공과대학교',icon:'school',rows:[['1002',S.B,46]]}
];

const state = {view:'routes',route:'1002',filter:'all',directionStopId:null,type:'all',query:'',mapMode:'campus',stop:null,noResults:false,journey:null,returnView:null,fullTimeline:false};
const reducedMotion = () => typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const contentAnimations = new WeakMap();
function revealContent(element,{distance=18,duration=440}={}) {
 if(!element)return;
 contentAnimations.get(element)?.cancel();
 contentAnimations.delete(element);
 element.classList?.remove('motion-reveal');
 if(reducedMotion()||element.hidden)return;
 if(typeof element.animate!=='function'){
  void element.offsetWidth;
  element.classList?.add('motion-reveal');
  element.addEventListener?.('animationend',()=>element.classList.remove('motion-reveal'),{once:true});
  return;
 }
 const animation=element.animate([
  {opacity:.12,transform:`translateY(${distance}px)`},
  {opacity:1,transform:'translateY(0)'}
 ],{duration,easing:'cubic-bezier(.22,.7,.3,1)'});
 contentAnimations.set(element,animation);
 animation.onfinish=()=>{if(contentAnimations.get(element)===animation)contentAnimations.delete(element);};
}
function animateSelection(element) {
 if(!element)return;
 contentAnimations.get(element)?.cancel();
 contentAnimations.delete(element);
 element.classList?.remove('motion-selection');
 if(reducedMotion())return;
 if(typeof element.animate!=='function'){
  void element.offsetWidth;
  element.classList?.add('motion-selection');
  element.addEventListener?.('animationend',()=>element.classList.remove('motion-selection'),{once:true});
  return;
 }
 const animation=element.animate([
  {transform:'scale(.9)',boxShadow:'0 0 0 0 rgba(167,44,55,.4)'},
  {transform:'scale(1.035)',boxShadow:'0 0 0 8px rgba(167,44,55,.23)',offset:.5},
  {transform:'scale(1)',boxShadow:'0 0 0 0 rgba(167,44,55,0)'}
 ],{duration:720,easing:'cubic-bezier(.2,.7,.25,1)'});
 contentAnimations.set(element,animation);
 animation.onfinish=()=>{if(contentAnimations.get(element)===animation)contentAnimations.delete(element);};
}
const announce = message => { $('#uiStatus').textContent=message; };
const liveStopRecords = new Map();
const liveStopOrders = new Map();
const ROUTE_TYPES = {
 metropolitan:{label:'직행',colorGroup:'pink',color:'#d94e79'},
 express:{label:'급행',colorGroup:'express',color:'#df332f'},
 trunk:{label:'간선',colorGroup:'regular',color:'#d9a800'},
 branch:{label:'지선',colorGroup:'green',color:'#2a8c60'}
};
const routeById = id => routes.find(r=>r.id===id);
const displayRouteName = id => id==='1002'?'직행1002':id.replace('급행 ','급행');
const getRouteType = id => id==='1002'?'metropolitan':id.startsWith('급행')?'express':['43','91','192','193'].includes(id)?'branch':'trunk';
const colorGroup = id => ROUTE_TYPES[getRouteType(id)].colorGroup;
const badge = (id,large=false) => `<span class="route-badge ${colorGroup(id)} ${large?'large':''}">${id==='1002'?'<small>직행</small>1002':id.startsWith('급행')?`<small>급행</small>${id.slice(3)}`:id}</span>`;
const intervalValue = route => route.interval.replace(/분$/, '');
const isInfrequent = route => Math.max(...route.interval.match(/\d+/g).map(Number))>=100;
const routeStopIds = id => liveStopOrders.get(id) || ROUTE_STOP_ORDER[id];
const lookupStop = id => liveStopRecords.get(id) || CAMPUS_STOPS.find(s=>s.id===id) || ALL_STOPS[id];
const directionLabel = stop => {
 const campus=CAMPUS_STOPS.find(item=>item.id===stop?.id)||stop;
 return String(campus?.ars)==='4012'?'한국생산기술연구원':String(campus?.ars)==='5958'?'첨단병원입구':campus?.next;
};
const campusNamesForRoute = id => stopNames.filter(name=>CAMPUS_STOPS.some(s=>s.name===name&&routeStopIds(id).includes(s.id)));
const servedRoutesAtStop = id => routes.filter(r=>routeStopIds(r.id).includes(id)).map(r=>r.id);
function majorViaSummary(route) {
 const major=ROUTE_ANNOTATIONS[route.id].major;
 const terminal=route.stops.at(-1)[0];
 const cultureStops=['금남로4가역','국립아시아문화전당','문화전당역'];
 const universityStops=['조선대장미원','조선대해오름관'];
 const hasCultureGroup=cultureStops.every(name=>major.includes(name));
 const hasUniversityGroup=universityStops.every(name=>major.includes(name));
 let cultureAdded=false,universityAdded=false;
 const summarized=major.flatMap(name=>{
  if(hasCultureGroup&&cultureStops.includes(name)){
   if(cultureAdded)return [];
   cultureAdded=true;return ['국립아시아문화전당'];
  }
  if(hasUniversityGroup&&universityStops.includes(name)){
   if(universityAdded)return [];
   universityAdded=true;return ['조선대'];
  }
  return [name];
 });
 const withoutTerminal=summarized.filter(name=>name!==terminal);
 let beyondCampus=withoutTerminal.filter(name=>!stopNames.includes(name));
 if(terminal==='조선대해오름관'&&beyondCampus.length>2) beyondCampus=beyondCampus.filter(name=>name!=='조선대');
 const shown=(beyondCampus.length?beyondCampus:withoutTerminal).map(name=>name==='전대치과병원'?'전남대':name);
 const limit=route.id==='30'?3:2;
 return {places:shown.slice(0,limit),remaining:Math.max(0,shown.length-limit)};
}
function majorViaText(route) {
 const {places,remaining}=majorViaSummary(route);
 return places.join(' · ')+(remaining?` 외 ${remaining}곳`:'');
}
function majorViaHtml(route) {
 const {places,remaining}=majorViaSummary(route);
 if(route.id==='30'&&places.length===3){
  return `<span class="via-part">${escapeHtml(places[0])} · ${escapeHtml(places[1])}</span><span class="via-part">${escapeHtml(places[2])}</span>${remaining?`<span class="via-more">외 ${remaining}곳</span>`:''}`;
 }
 return places.map(name=>`<span class="via-part">${escapeHtml(name)}</span>`).join('')+(remaining?`<span class="via-more">외 ${remaining}곳</span>`:'');
}

function timelineStopName(routeId,name) {
 const important=ROUTE_ANNOTATIONS[routeId].major.includes(name);
 if(routeId==='03'&&name==='중흥삼거리역 (광주역)') return '중흥삼거리역 (<b>광주역</b>)';
 return important?`<b>${escapeHtml(name)}</b>`:escapeHtml(name);
}

function transferMark(name) {
 const mark=TRANSFER_MARKS[name];
 if(!mark) return '';
 const type=mark==='1호선'?'metro':mark==='ITX'?'rail':'bus';
 return `<em class="transfer-mark ${type}">${mark}</em>`;
}

function icon(name) {
 const paths={
  train:'<rect x="6" y="3" width="12" height="15" rx="3"/><path d="M6 10h12M9 21l2-3m4 3-2-3M9 6h6"/><circle cx="9.5" cy="14.5" r=".5"/><circle cx="14.5" cy="14.5" r=".5"/>',
  bus:'<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 21v-2m8 2v-2M9 6h6"/><circle cx="8.5" cy="15.5" r=".5"/><circle cx="15.5" cy="15.5" r=".5"/>',
  culture:'<path d="m3 8 9-5 9 5M4 9h16M6 9v10m6-10v10m6-10v10M3 21h18"/>',
  ball:'<circle cx="12" cy="12" r="9"/><path d="M6 5c8 4 8 10 0 14m12-14c-8 4-8 10 0 14"/>',
  school:'<path d="m2 9 10-5 10 5-10 5L2 9Zm4 3v6l6 3 6-3v-6m4-3v8"/>'
 };
 return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.bus}</svg>`;
}

function matchesFilter(r) {
 if(state.directionStopId) return routeStopIds(r.id).includes(state.directionStopId);
 return state.filter==='all'||campusNamesForRoute(r.id).includes(state.filter);
}

const normalizeSearch = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
function routeSearchText(r) {
 const destinations=HUBS.filter(h=>h.rows.some(row=>row[0]===r.id));
 return normalizeSearch([r.id,displayRouteName(r.id),r.head,majorViaText(r),...r.stops.map(s=>s[0]),...routeStopIds(r.id).map(id=>lookupStop(id)?.name||''),...destinations.flatMap(h=>[h.name,h.sub])].join(' '));
}
function filteredRoutes() {
 return routes.filter(r=>matchesFilter(r)
  &&(state.type==='all'||getRouteType(r.id)===state.type)
  &&(!state.query||routeSearchText(r).includes(normalizeSearch(state.query))));
}
function syncFilterControls() {
 $('#stopFilter').value=state.filter;
 $('#routeQuery').value=state.query;
 document.querySelectorAll('[data-type]').forEach(button=>{
  const selected=button.dataset.type===state.type;
  button.classList.toggle('chosen',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
 const active=state.filter!=='all'||state.type!=='all'||!!state.query;
 $('#resetFilters').hidden=!active;
 $('#clearSearch').hidden=!state.query;
 const stop=state.directionStopId?lookupStop(state.directionStopId):null;
 $('#directionFilter').hidden=!stop;
 $('#directionFilter').textContent=stop?`${stop.ars} · ${directionLabel(stop)} 방향 정류장 기준`:'';
}
function resetFilters() {
 state.filter='all';state.directionStopId=null;state.type='all';state.query='';
 state.stop=null;$('#selectedStopCard').hidden=true;BusMap.clearSelection();
 applyFilters({animate:true});renderStops();
}
function applyFilters({preserveStop=false,animate=false}={}) {
 const previousRoute=state.route,previousEmpty=state.noResults;
 state.journey=null;state.returnView=null;
 if(!preserveStop){state.stop=null;$('#selectedStopCard').hidden=true;BusMap.clearSelection();renderStops();}
 const list=filteredRoutes();
 state.noResults=!list.length;
 if(list.length&&!list.some(r=>r.id===state.route)) state.route=list[0].id;
 renderRouteList();renderDetail();
 BusMap.setRoute(state.noResults?null:state.route);
 if(state.noResults) setMapMode('campus');
 else if(state.mapMode==='route') BusMap.setMode('route');
 if(animate)revealContent($('#routeList'),{distance:14,duration:450});
 if(previousRoute!==state.route||previousEmpty!==state.noResults)revealContent($('#routeDetail'));
 announce(list.length?`${list.length}개 노선, ${displayRouteName(state.route)} 선택됨`:'조건에 맞는 노선이 없습니다. 필터를 초기화할 수 있습니다.');
}
function renderRouteList() {
 const list=filteredRoutes();
 const container=$('#routeList'),scrollLeft=container.scrollLeft,scrollTop=container.scrollTop;
 syncFilterControls();
 $('#filteredCount').textContent=`${list.length}개`;
 $('#routeList').innerHTML=list.map(r=>`<button class="route-item ${state.route===r.id?'selected':''}" data-route="${r.id}" aria-pressed="${state.route===r.id}">
  ${badge(r.id)}<span class="route-item-copy"><b>${majorViaHtml(r)}</b><small><span>종점</span> ${escapeHtml(r.head.split(' → ')[1])}</small></span>
  <span class="route-frequency ${isInfrequent(r)?'infrequent':''}"><small>배차 간격</small><span><b>${intervalValue(r)}</b>분</span></span>
 </button>`).join('')||'<div class="empty"><b>조건에 맞는 노선이 없어요</b><p>검색어나 정류장 조건을 바꿔 보세요.</p><button class="reset-empty" type="button">필터 초기화</button></div>';
 container.scrollLeft=scrollLeft;container.scrollTop=scrollTop;
 container.querySelector('.reset-empty')?.addEventListener('click',()=>{resetFilters();$('#routeQuery').focus();});
 $('#routeList').querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>selectRoute(b.dataset.route));
}

function anchorFor(r) {
 if(r.id==='192') return S.G;
 return ['09','23','30','51'].includes(r.id)?S.E:r.stop;
}

function routeHighlights(r) {
 const base=anchorFor(r);
 return HUBS.flatMap(h=>h.rows.filter(row=>row[0]===r.id&&row[1]===base).map(row=>({name:h.name,mins:row[2]})))
  .sort((a,b)=>a.mins-b.mins);
}

// The saved order is a round trip; show the same single direction as the guide.
function fullTimelineStops(r) {
 const ids=ROUTE_STOP_ORDER[r.id]||[];
 const ordered=ids.map(id=>ALL_STOPS[id]).filter(Boolean);
 const norm=s=>String(s||'').replace(/\s+/g,'');
 const origin=norm(ROUTE_ANNOTATIONS[r.id].origin);
 const terminal=norm(r.stops.at(-1)?.[0]);
 let start=ordered.findIndex(stop=>norm(stop.name)===origin);
 if(start<0)return null;
 while(start+1<ordered.length&&norm(ordered[start+1].name)===origin)start++;
 const end=ordered.findIndex((stop,index)=>index>start&&norm(stop.name).startsWith(terminal));
 if(end<0)return null;
 const section=ordered.slice(start,end+1);
 const matched=new Map();
 const known=[...(ROUTE_ANNOTATIONS[r.id].beforeBase||[]).map(([name])=>[name,null]),...r.stops];
 for(const [sourceName,time] of known){
  const key=norm(sourceName).replace(/\(광주역\)$/,'');
  const candidates=section.map((stop,index)=>norm(stop.name).startsWith(key)?index:-1).filter(index=>index>=0);
  if(candidates.length===1)matched.set(candidates[0],{sourceName,time});
 }
 return section.map((stop,index)=>{
  const match=matched.get(index);
  return [stop.name,index===0?null:(match?.time??null),index===0?'origin':'stop',match?.sourceName||''];
 });
}

function renderDetail() {
 $('#mapRouteLabel').hidden=state.noResults||state.view==='stops';
 $('#fullRouteView').disabled=state.noResults;
 $('#pathLegend').hidden=state.noResults||state.view==='stops';
 $('#routeStopLegend').hidden=state.noResults||state.view==='stops';
 if(state.noResults){
  $('#routeDetail').innerHTML='<div class="detail-empty"><span aria-hidden="true">⌕</span><h2>표시할 노선이 없어요</h2><p>조건을 초기화하면 GIST를 지나는<br>전체 노선을 다시 볼 수 있어요.</p><button class="reset-empty" type="button">전체 노선 보기</button></div>';
  $('#routeDetail .reset-empty').onclick=()=>{resetFilters();$('#routeQuery').focus();};
  return;
 }
 const r=routeById(state.route),base=anchorFor(r),group=colorGroup(r.id);
 const highlights=routeHighlights(r);
 const localStops=campusNamesForRoute(r.id);
 const timelineDirection=['192','193'].includes(r.id)?' · 첨단삼성전자 방면':'';
 const annotations=ROUTE_ANNOTATIONS[r.id];
 const timelineStops=state.fullTimeline?fullTimelineStops(r):[[annotations.origin,null,'origin'],...(annotations.beforeBase||[]).map(([name,time])=>[name,time,'before-base']),...r.stops.map(([name,time])=>[name,time,'stop'])];
 const journey=state.journey;
 const selectedDestination=journey?.destination==='KENTECH'?'한국에너지공과대학교':journey?.destination;
 $('#routeDetail').innerHTML=`${state.returnView?`<div class="detail-return"><button id="returnToResults" type="button">← ${state.returnView==='destinations'?'거점 목록':'완급행 비교'}으로 돌아가기</button></div>`:''}
 ${journey?`<div class="journey-context"><div><span>선택한 이동 · 환승 없음</span><b>${escapeHtml(journey.from)} → ${escapeHtml(journey.destination)}</b></div><strong>${journey.minutes}<small>분 예상</small></strong></div>`:''}
 <div class="detail-layout"><div class="detail-top">
  <div class="detail-route-title">${badge(r.id,true)}<div><h2 id="detailTitle" tabindex="-1">${ROUTE_TYPES[getRouteType(r.id)].label} ${r.id.replace(/^급행\s*/, '')}번</h2><p>${r.head.replace(' → ',' ↔ ')}</p></div></div>
  <div class="interval-box"><span>배차 간격</span><strong class="${isInfrequent(r)?'infrequent':''}">${intervalValue(r)}<small>분</small></strong></div>
  <div class="served-campus"><h3>이 노선의 GIST 주변 정류장</h3><div>${localStops.map(name=>`<button class="campus-route-chip" data-campus="${name}"><i></i>${name}</button>`).join('')}</div></div>
  ${highlights.length?`<div class="highlight-grid">${highlights.map(h=>`<div><small>${h.name}</small><strong>${h.mins}<span>분</span></strong></div>`).join('')}</div>`:''}
  ${r.id==='192'?'<div class="direction-note"><b>비아고속버스정류소는 장성마산 방면</b><span>과기원에서 <strong>6분</strong> · 아래 시간표와 반대 방향</span></div>':''}
 </div>
 <div class="detail-timeline"><div class="timeline-heading"><div class="timeline-title-group"><h3>${state.fullTimeline?'전체 노선도':'주요 경유지'}</h3><button id="toggleTimeline" type="button" aria-pressed="${state.fullTimeline}">${state.fullTimeline?'주요 경유지만 보기':'전체 노선도 보기'}</button></div><span>예상 소요 시간</span></div>
 <p class="timeline-caption">${base} 출발 기준${timelineDirection}${state.fullTimeline?'<span class="full-timeline-note">주요 정류장만 시간 표시</span>':''}${journey&&journey.from!==base?'<span class="basis-note">위에서 선택한 이동과 출발 기준이 달라요.</span>':''}</p>
 <div class="timeline ${group}">${timelineStops?timelineStops.map(([name,time,kind,sourceName])=>{
  const markedName=state.fullTimeline?sourceName:name;
  const important=annotations.major.includes(markedName)||(r.id==='03'&&markedName==='중흥삼거리역 (광주역)');
  const label=state.fullTimeline?(important?`<b>${escapeHtml(name)}${r.id==='03'&&markedName==='중흥삼거리역 (광주역)'?' (광주역)':''}</b>`:escapeHtml(name)):timelineStopName(r.id,name);
  return `<div class="timeline-row ${kind==='origin'?'origin':time===0?'departure':''}${selectedDestination&&(name.includes(selectedDestination)||markedName?.includes(selectedDestination))?' destination':''}"><span class="timeline-line"><i></i></span><span class="timeline-stop">${label}${transferMark(markedName)}${kind==='origin'?'<small>기점</small>':time===0?'<small>출발 기준</small>':''}</span><strong>${time===null?'':time+'<small>분</small>'}</strong></div>`;
 }).join(''):'<p class="timeline-unavailable">이 방향의 전체 정류장 순서를 확인할 수 없습니다. 주요 경유지를 확인해 주세요.</p>'}</div>
 </div></div><div class="detail-foot"><p>${state.fullTimeline?'':'주요 정류장을 중심으로 안내합니다. '}실제 이동 시간과 배차 간격은 교통 상황에 따라 달라질 수 있습니다.</p></div>`;
 $('#routeDetail').querySelectorAll('[data-campus]').forEach(button=>button.onclick=()=>{
  filterByCampus(button.dataset.campus);
  $('.map-pane').scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});
  $('#campusView').focus({preventScroll:true});
 });
 $('#toggleTimeline').onclick=()=>{
  const panel=$('#routeDetail'),scrollTop=panel.scrollTop;
  state.fullTimeline=!state.fullTimeline;
  renderDetail();panel.scrollTop=scrollTop;
  $('#toggleTimeline').focus({preventScroll:true});
  announce(state.fullTimeline?'전체 노선도를 표시합니다.':'주요 경유지만 표시합니다.');
 };
 if(state.returnView) $('#returnToResults').onclick=()=>{
  const target=state.returnView;
  changeView(target);
  requestAnimationFrame(()=>{
   const destination=state.returnFocus?.isConnected?state.returnFocus:document.querySelector(`[data-view="${target}"]`);
   destination?.scrollIntoView({block:'center',behavior:reducedMotion()?'auto':'smooth'});
   destination?.focus({preventScroll:true});
  });
 };
 $('#mapRouteLabel').innerHTML=`${badge(r.id)}<span>정류소 ${routeStopIds(r.id).length}곳 · 왕복</span>`;
 $('#pathLegend i').style.background=ROUTE_TYPES[getRouteType(r.id)].color;
}

function updateMapButtons(mode) {
 state.mapMode=mode;
 $('#campusView').classList.toggle('selected',mode==='campus');
 $('#fullRouteView').classList.toggle('selected',mode==='route');
 $('#campusView').setAttribute('aria-pressed',String(mode==='campus'));
 $('#fullRouteView').setAttribute('aria-pressed',String(mode==='route'));
}
function setMapMode(mode) {updateMapButtons(mode);BusMap.setMode(mode,{animate:true});}

function filterByCampus(name) {
 state.filter=name;state.directionStopId=null;state.stop=null;
 $('#stopFilter').value=name;
 $('#selectedStopCard').hidden=true;
 applyFilters({animate:true});renderStops();
 updateMapButtons('campus');BusMap.focusGroup(name);
}

function selectRoute(id,{fit=true,journey=null,source=null}={}) {
 if(!routeById(id))return;
 const changed=state.route!==id;
 const focusInList=$('#routeList').contains?.(document.activeElement);
 if(!filteredRoutes().some(r=>r.id===id)){
  state.filter='all';state.directionStopId=null;state.type='all';state.query='';
 }
 state.route=id;
 state.returnFocus=source?document.activeElement:null;
 state.noResults=false;state.journey=journey;state.returnView=source;
 state.stop=null;$('#selectedStopCard').hidden=true;BusMap.clearSelection();
 renderRouteList();renderDetail();renderStops();
 $('#routeDetail').scrollTop=0;
 if(state.view!=='routes') changeView('routes');
 if(fit) updateMapButtons('route');
 BusMap.setRoute(id,{fitRoute:fit,animate:true});
 refreshOfficialRoute(id);
 const selected=document.querySelector('.route-item.selected');
 animateSelection(selected);
 if(focusInList)selected?.focus({preventScroll:true});
 if(source){
  requestAnimationFrame(()=>{
   $('#routeDetail').scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});
   $('#detailTitle').focus({preventScroll:true});
  });
 }else selected?.scrollIntoView({block:'nearest',inline:'nearest',behavior:reducedMotion()?'auto':'smooth'});
 if(changed||source)revealContent($('#routeDetail'),{distance:14,duration:360});
 announce(`${displayRouteName(id)} 노선 선택됨. 지도와 주요 경유지를 확인하세요.`);
}

function selectStop(id) {
 const s=lookupStop(id);
 if(!s) return;
 state.stop=id;
 const campus=CAMPUS_STOPS.find(p=>p.id===id);
 if(campus) {
  state.filter=campus.name;state.directionStopId=id;
  // Keep the dropdown at four unique stop names. Direction is shown separately in the stop card.
  $('#stopFilter').value=campus.name;
  applyFilters({preserveStop:true});renderStops();
 }
 const served=servedRoutesAtStop(id);
 const order=routeStopIds(state.route),index=order.indexOf(id);
 const next=directionLabel(campus) || (index>=0?lookupStop(order[index+1])?.name:null);
 $('#selectedStopCard').innerHTML=`<button class="stop-card-close" aria-label="정류장 선택 닫기">×</button><span class="selected-stop-name"><b>${escapeHtml(s.name)}</b><small aria-label="정류장 번호 ${escapeHtml(s.ars)}">${escapeHtml(s.ars)}</small></span>${next?`<p><strong>${escapeHtml(next)}</strong> 방향</p>`:'<p>선택 노선의 마지막 정류장입니다.</p>'}<div class="popup-routes">${served.map(route=>`<button data-route="${route}" aria-label="${displayRouteName(route)} 노선 보기">${badge(route)}</button>`).join('')}</div>`;
 $('#selectedStopCard').hidden=false;
 revealContent($('#selectedStopCard'),{distance:12,duration:320});
 $('#selectedStopCard').querySelector('.stop-card-close').onclick=clearStop;
 $('#selectedStopCard').querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>selectRoute(b.dataset.route));
 updateMapButtons('campus');BusMap.focusStop(id);
 if(state.view==='stops') $('.map-pane').scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});
}

function clearStop() {
 state.stop=null;state.directionStopId=null;state.filter='all';
 $('#stopFilter').value='all';$('#selectedStopCard').hidden=true;
 applyFilters();renderStops();BusMap.clearSelection();
}

function renderStops() {
 $('#stopList').innerHTML=stopNames.map((name,i)=>`<div class="stop-group"><h3><span>${i+1}</span>${escapeHtml(name)}${name===S.B?' <em class="stop-new">신설</em>':''}</h3>${CAMPUS_STOPS.filter(s=>s.name===name).map(s=>`<button class="direction-stop ${state.stop===s.id?'active':''}" data-stop="${s.id}" aria-pressed="${state.stop===s.id}"><span><b>${escapeHtml(directionLabel(s))} 방향</b><small>정류장 번호 ${escapeHtml(s.ars)}</small></span><i aria-hidden="true">⌖</i></button>`).join('')}</div>`).join('');
 $('#stopList').querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>selectStop(+b.dataset.stop));
}

function sortedHubRows(h) {return [...h.rows].sort((a,b)=>a[2]-b[2]);}

function destinationColumnCount() {
 if(typeof matchMedia!=='function')return 1;
 return matchMedia('(min-width:1600px)').matches?4:matchMedia('(min-width:1200px)').matches?3:matchMedia('(min-width:761px)').matches?2:1;
}
let renderedDestinationColumns=0;
function renderDestinations({animate=false}={}) {
 const selected=$('#hubFilter').value;
 function card(h) {
  const rows=sortedHubRows(h);
  return `<article class="hub-card"><div class="hub-title"><span>${icon(h.icon)}</span><div><h3>${h.name}</h3><small>${h.sub}</small></div><div class="hub-fastest">최단 <b>${rows[0][2]}</b>분</div></div><div class="hub-rows">${rows.map(([id,from,mins])=>`<button class="hub-row" data-route="${id}" data-from="${from}" data-destination="${h.name}" data-minutes="${mins}" aria-label="${displayRouteName(id)}, ${from}에서 ${h.name}까지 ${mins}분, 상세 보기">${id==='1002'?'<span class="route-badge pink">1002</span>':badge(id)}<span>${from}</span><strong>${mins}<small>분</small></strong><i>›</i></button>`).join('')}</div>${h.note?`<div class="hub-note">${h.note}</div>`:''}</article>`;
 }
 const isFiltered=selected!=='all';
 $('#destinationGrid').classList.toggle('filtered',isFiltered);
 const count=isFiltered?1:destinationColumnCount();
 renderedDestinationColumns=destinationColumnCount();
 const groups=isFiltered?[[HUBS.findIndex(h=>h.name===selected)]]:({
  1:[[0,1,2,3,4,5,6]],
  2:[[0,1,3],[2,4,5,6]],
  3:[[0,1,4],[2,5,6],[3]],
  4:[[0,1,6],[2,5],[4],[3]]
 })[count];
 $('#destinationGrid').setAttribute('data-columns',String(count));
 $('#destinationGrid').innerHTML=groups.map(group=>`<div class="destination-column">${group.filter(i=>i>=0).map(i=>card(HUBS[i])).join('')}</div>`).join('');
 $('#destinationGrid').querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>openHubRoute(b.dataset));
 if(animate)revealContent($('#destinationGrid'),{duration:320});
}
function openHubRoute({route,from,destination,minutes}) {
 selectRoute(route,{source:'destinations',journey:{from,destination,minutes:Number(minutes)}});
}

const EXPRESS_PAIRS=[
 {title:'급행 03 vs. 간선 03',express:'급행 03',regular:'03',stops:['광주종합버스터미널','조선대장미원','조선대해오름관']},
 {title:'급행 05 vs. 간선 05',express:'급행 05',regular:'05',stops:['광주예술의전당','광주기아챔피언스필드','금남로4가역','국립아시아문화전당','덕남마을입구']}
];

function routeTimeAt(id,name) {return routeById(id).stops.find(stop=>stop[0]===name)?.[1];}

function outboundStopIds(id) {
 const ids=ROUTE_STOP_ORDER[id];
 const normalize=name=>String(name||'').replace(/\s+/g,'');
 const start=ids.findIndex(stopId=>ALL_STOPS[stopId]?.name==='광주과학기술원후문');
 const terminal=normalize(routeById(id).head.split(' → ')[1]);
 const end=ids.findIndex((stopId,index)=>index>start&&normalize(ALL_STOPS[stopId]?.name)===terminal);
 return start>=0&&end>start?ids.slice(start,end+1):[];
}

function renderStopPattern(pair) {
 const expressStops=outboundStopIds(pair.express),regularStops=outboundStopIds(pair.regular);
 if(!expressStops.length||!regularStops.length)return '';
 const expressSet=new Set(expressStops);
 const shared=regularStops.filter(id=>expressSet.has(id)).length;
 return `<details class="stop-comparison" open><summary><span>정차 정류장 비교<small>광주과학기술원후문 → 종점 방면</small></span><strong>완행·급행 모두 정차 ${shared}곳 / 완행만 정차 ${regularStops.length-shared}곳</strong></summary>
  <div class="stop-compare-legend"><span><i class="shared"></i>급행 정차 정류장</span><span><i class="regular-only"></i>완행 정차 정류장</span></div>
  <div class="stop-compare-head"><span>${displayRouteName(pair.express)}</span><span>${displayRouteName(pair.regular)}</span><span>정류장</span></div>
  <ol class="stop-compare-list">${regularStops.map(stopId=>{
   const sharedStop=expressSet.has(stopId);
   return `<li class="stop-compare-row ${sharedStop?'shared':'regular-only'}" aria-label="${escapeHtml(ALL_STOPS[stopId].name)}, ${sharedStop?'두 노선 모두 정차':'일반 노선만 정차'}"><span class="stop-lane express-lane">${sharedStop?'<i></i>':''}</span><span class="stop-lane regular-lane"><i></i></span><span class="stop-compare-name">${escapeHtml(ALL_STOPS[stopId].name)}</span></li>`;
  }).join('')}</ol><p class="stop-compare-source">정류장 순서는 광주시 개편 노선 검색 자료를 2026. 10. 26. 확인한 기준입니다.</p></details>`;
}

function renderComparison() {
 $('#comparisonGrid').innerHTML=EXPRESS_PAIRS.map(pair=>{
  const fast=routeById(pair.express),regular=routeById(pair.regular);
  const rows=pair.stops.map(name=>{
   const fastTime=routeTimeAt(pair.express,name),regularTime=routeTimeAt(pair.regular,name);
   return `<tr><th scope="row">${escapeHtml(name)}</th><td>${fastTime}<small>분</small></td><td>${regularTime}<small>분</small></td><td class="compare-difference">${regularTime-fastTime}<small>분 차이</small></td></tr>`;
  }).join('');
  return `<article class="compare-card"><div class="compare-card-heading"><span>${pair.title}</span><h3>${escapeHtml(fast.head.split(' → ')[1])} 방면</h3><p>광주과학기술원후문 출발 기준</p></div>
   <div class="compare-summary"><div>${badge(pair.express)}<span><small>배차 간격</small><b>${fast.interval}</b></span></div><div>${badge(pair.regular)}<span><small>배차 간격</small><b>${regular.interval}</b></span></div></div>
   <div class="compare-scroll"><table class="compare-table"><thead><tr><th scope="col">주요 경유지</th><th scope="col">${pair.express}</th><th scope="col">${pair.regular}</th><th scope="col">시간 차이</th></tr></thead><tbody>${rows}</tbody></table></div>
   <div class="compare-actions"><button data-route="${pair.express}">${badge(pair.express)} 노선 자세히</button><button data-route="${pair.regular}">${badge(pair.regular)} 노선 자세히</button></div>
   ${renderStopPattern(pair)}</article>`;
 }).join('');
 $('#comparisonGrid').querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>selectRoute(button.dataset.route,{source:'comparison'}));
 $('#comparisonGrid').querySelectorAll('.stop-comparison').forEach(details=>details.addEventListener('toggle',()=>{
  if(details.open)revealContent(details.querySelector('.stop-compare-list'),{distance:8,duration:320});
 }));
}

function changeView(view) {
 if(state.view===view)return;
 state.view=view;
 document.querySelectorAll('[data-view]').forEach(b=>{
  b.classList.toggle('active',b.dataset.view===view);
  b.setAttribute('aria-selected',String(b.dataset.view===view));
  b.setAttribute('tabindex',b.dataset.view===view?'0':'-1');
 });
 animateSelection(document.querySelector(`[data-view="${view}"]`));
 $('#destinationsView').hidden=view!=='destinations';
 $('#comparisonView').hidden=view!=='comparison';
 $('#workspace').hidden=view==='destinations'||view==='comparison';
 $('#routeSidebar').hidden=view==='stops';
 $('#stopSidebar').hidden=view!=='stops';
 $('#routeDetail').hidden=view==='stops';
 $('#workspace').classList.toggle('stops-mode',view==='stops');
 $('#mapRouteLabel').hidden=view==='stops'||state.noResults;
 $('#pathLegend').hidden=view==='stops'||state.noResults;
 $('#routeStopLegend').hidden=view==='stops'||state.noResults;
 $('#fullRouteView').hidden=view==='stops';
 $('.map-view-buttons').hidden=view==='stops';
 $('#workspace').setAttribute('aria-labelledby',view==='stops'?'tab-stops':'tab-routes');
 if(view==='destinations') {if(!$('#destinationGrid').innerHTML) renderDestinations();}
 else if(view==='comparison') {if(!$('#comparisonGrid').innerHTML) renderComparison();}
 else {
  BusMap.setView(view);
  if(view==='stops') updateMapButtons('campus');
  requestAnimationFrame(()=>BusMap.relayout());
 }
 const panel=view==='destinations'?$('#destinationsView'):view==='comparison'?$('#comparisonView'):$('#workspace');
 revealContent(panel,{distance:panel.id==='workspace'?0:28,duration:820});
}

function setup() {
 $('#stopFilter').innerHTML='<option value="all">주변 정류장 전체</option>'+[...new Set(stopNames)].map(name=>`<option value="${name}">${name}</option>`).join('');
 $('#hubFilter').innerHTML='<option value="all">모든 거점지</option>'+HUBS.map(h=>`<option value="${h.name}">${h.name}</option>`).join('');
 $('#stopFilter').onchange=e=>filterByCampus(e.target.value);
 $('#routeQuery').oninput=e=>{state.query=e.target.value;applyFilters();};
 $('#clearSearch').onclick=()=>{state.query='';applyFilters();$('#routeQuery').focus();};
 $('#resetFilters').onclick=()=>{resetFilters();$('#routeQuery').focus();};
 document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{
  state.type=b.dataset.type;
  applyFilters({animate:true});
  animateSelection(b);
 });
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
  if(state.view===b.dataset.view)animateSelection(b);
  changeView(b.dataset.view);
  const panel=b.dataset.view==='destinations'?'#destinationsView':b.dataset.view==='comparison'?'#comparisonView':'#workspace';
  $(panel).scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});
 });
 $('.tabs').addEventListener('keydown',event=>{
  const tabs=Array.from(document.querySelectorAll('[data-view]'));
  const current=tabs.indexOf(document.activeElement);
  if(current<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  changeView(tabs[index].dataset.view);tabs[index].focus();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('#selectedStopCard').hidden){
   const previousStop=state.stop;
   clearStop();
   const target=state.view==='stops'?document.querySelector(`[data-stop="${previousStop}"]`):$('#campusView');
   target?.focus();
  }
 });
 $('#hubFilter').onchange=()=>renderDestinations({animate:true});
 if(typeof window!=='undefined')window.addEventListener('resize',()=>{
  if(destinationColumnCount()!==renderedDestinationColumns)renderDestinations();
 });
 $('#campusView').onclick=()=>setMapMode('campus');
 $('#fullRouteView').onclick=()=>setMapMode('route');
 $('#retryMap').onclick=()=>BusMap.retry().then(ready=>{if(ready) refreshOfficialRoute(state.route);});
 renderRouteList();renderDetail();renderStops();renderDestinations();renderComparison();
 updateMapButtons('campus');
 BusMap.init({onStopClick:selectStop}).then(ready=>{if(ready) refreshOfficialRoute(state.route);});
}

async function refreshOfficialRoute(id) {
 if(!BUS_CONFIG.preferLiveApi||!['localhost','127.0.0.1'].includes(location.hostname)||!BusMap.isReady()) return;
 try {
  const data=await BusOfficialAPI.lineMap(BUS_CONFIG.liveApiBase,ROUTE_MAPS[id].lineId);
  data.stops.forEach(s=>liveStopRecords.set(s.BUSSTOP_ID,{id:s.BUSSTOP_ID,name:s.BUSSTOP_NAME,ars:s.ARS_ID,lat:s.LAT,lon:s.LON}));
  liveStopOrders.set(id,data.stops.map(s=>s.BUSSTOP_ID));
  BusMap.setLiveRoute(id,data);
  if(state.route===id) {renderDetail();renderRouteList();}
 } catch { /* Continue displaying the verified saved coordinates. */ }
}

setup();
