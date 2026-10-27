/* Confirmed official endpoints. Use a same-origin proxy for CORS / HTTPS compatibility. */
const BusOfficialAPI = (() => {
 async function request(base, endpoint, query = {}) {
  const params = new URLSearchParams(query);
  const response = await fetch(`${base}/${endpoint}?${params}`, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
  if(!response.ok) throw new Error(`공식 API 응답 오류: ${response.status}`);
  return response.json();
 }
 return {
  lineList: base => request(base,'lineList'),
  lineMap: async (base,id) => {
   const data=await request(base,'lineMap',{LINE_ID:id});
   if(!Array.isArray(data.vertex)||data.vertex.length<2||!Array.isArray(data.stops)||!data.stops.every(s=>Number.isInteger(s.BUSSTOP_ID)&&typeof s.BUSSTOP_NAME==='string'&&Number.isFinite(s.LAT)&&Number.isFinite(s.LON))||!data.vertex.every(p=>Number.isFinite(p.LATITUDE)&&Number.isFinite(p.LONGITUDE)))throw new Error('공식 경로 응답 형식 오류');
   return data;
  },
  stopLines: (base,id) => request(base,'stopLines',{BUSSTOP_ID:id}),
  stopsInBounds: (base,bounds) => request(base,'stopsInBounds',bounds)
 };
})();
