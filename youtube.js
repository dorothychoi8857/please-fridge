(() => {
'use strict';
const KEY='fridge-youtube-session-v1';
const QUERIES={tofu:'두부 계란 볶음 레시피',chicken:'간장 닭고기 덮밥 레시피',pancake:'애호박전 레시피',rice:'야채 계란 볶음밥 레시피',spinach:'시금치 계란 볶음 레시피',soup:'두부 된장국 레시피'};
let sessionKey='',generation=0,verified=false,sessionAvailable=true,serverAvailable=null,serverPending=null;
try { sessionKey=sessionStorage.getItem(KEY)||''; } catch { sessionAvailable=false; }
const cache=new Map(),pending=new Map();
const getStatus=()=>({configured:serverAvailable===true||Boolean(sessionKey),serverConnected:serverAvailable===true,sessionConfigured:Boolean(sessionKey),verified,sessionAvailable});
async function checkServer(force=false) {
  // Local files and GitHub Pages stay fully static: no backend calls or secret-file reads.
  if(!['http:','https:'].includes(location.protocol)||location.hostname.endsWith('.github.io'))return false;
  if(!force&&serverAvailable!==null)return serverAvailable;
  if(serverPending)return serverPending;
  serverPending=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try {
      const response=await fetch(new URL('./api/status',document.baseURI),{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
      if(!response.ok){serverAvailable=false;return false;}
      const data=await response.json();
      serverAvailable=data.runtime==='vercel-javascript'&&data.youtubeConfigured===true;
      return serverAvailable;
    } catch {serverAvailable=false;return false;}
    finally {clearTimeout(timer);}
  })();
  try{return await serverPending;}finally{serverPending=null;}
}
function setKey(value) {
  const key=String(value||'').trim();
  if(!/^AIza[A-Za-z0-9_-]{35}$/.test(key))throw new Error('Google에서 발급한 YouTube API 키 형식을 확인해 주세요.');
  generation++;verified=false;sessionKey=key;cache.clear();pending.clear();
  try {sessionStorage.setItem(KEY,key);sessionAvailable=true;}catch{sessionAvailable=false;}
}
function clearKey() {
  generation++;sessionKey='';verified=false;cache.clear();pending.clear();
  try {sessionStorage.removeItem(KEY);}catch{/* Memory-only mode. */}
}
const searchURL=recipeID=>'https://www.youtube.com/results?search_query='+encodeURIComponent(QUERIES[recipeID]||'요리 레시피');
const decode=value=>{const area=document.createElement('textarea');area.innerHTML=String(value||'');return area.value;};
function matchesMenu(recipeID,title) {
  const text=decode(title).replace(/\s+/g,'').toLowerCase();
  const groups={
    tofu:[['두부','tofu'],['계란','달걀','egg'],['볶음','스크램블','scrambl']],
    chicken:[['닭','치킨','chicken'],['덮밥','ricebowl','donburi'],['간장','데리야끼','데리야키','teriyaki']],
    pancake:[['애호박','호박전','zucchini'],['전','pancake']],
    rice:[['볶음밥','friedrice'],['야채','채소','계란','달걀','egg','vegetable']],
    spinach:[['시금치','spinach'],['계란','달걀','egg'],['볶음','스크램블','scrambl']],
    soup:[['된장국','doenjangguk','doenjangsoup'],['두부','tofu']],
  };
  if(!groups[recipeID])return false;
  if(recipeID==='pancake'&&!text.includes('애호박')&&['단호박','늙은호박'].some(x=>text.includes(x)))return false;
  if(recipeID==='rice'&&['김치','kimchi'].some(x=>text.includes(x)))return false;
  return groups[recipeID].every(group=>group.some(word=>text.includes(word)));
}
async function googleJSON(resource,params,key,signal) {
  const url=new URL('https://www.googleapis.com/youtube/v3/'+resource);
  for(const [name,value] of Object.entries(params))url.searchParams.set(name,String(value));
  let response;
  try {
    // The key stays out of source files and URLs, but browser request headers are still inspectable.
    response=await fetch(url,{headers:{'X-Goog-Api-Key':key,'Accept':'application/json'},credentials:'omit',signal});
  } catch(error) {
    if(error.name==='AbortError')throw new Error('영상 검색 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.');
    throw new Error('YouTube에 연결하지 못했어요. 인터넷·브라우저의 CORS 정책·키의 웹사이트 제한을 확인하세요. 키 없이 검색 페이지를 열 수도 있어요.');
  }
  let data;try{data=await response.json();}catch{throw new Error('YouTube 응답을 읽지 못했어요. 다시 시도해 주세요.');}
  if(!response.ok){
    // Do not expose raw errors or request headers, which may contain credentials.
    const reasons=data?.error?.errors?.map(x=>x.reason)||[];
    if(reasons.some(x=>['quotaExceeded','dailyLimitExceeded'].includes(x)))throw new Error('YouTube의 오늘 무료 할당량을 다 사용했어요. 한도가 초기화된 뒤 다시 시도하세요. 자동 추가 결제는 하지 않아요.');
    if(response.status===429)throw new Error('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
    if([400,401,403].includes(response.status))throw new Error('YouTube API 키·API 활성화·사용 제한을 확인해 주세요. 파일로 열 때는 웹사이트 리퍼러 제한 키가 동작하지 않을 수 있어요.');
    throw new Error('YouTube 영상 검색에 실패했어요. 잠시 후 다시 시도해 주세요.');
  }
  return data;
}
async function youtubeVideos(recipeID) {
  if(!Object.hasOwn(QUERIES,recipeID))throw new Error('알 수 없는 메뉴예요.');
  const useServer=await checkServer(!sessionKey&&serverAvailable===false);
  if(!useServer&&!sessionKey)throw new Error('영상 3개를 자동으로 가져오려면 설정에서 YouTube API 키를 입력해 주세요. 키 없이도 검색 페이지는 열 수 있어요.');
  const stored=cache.get(recipeID);
  if(stored&&stored.until>Date.now())return {...stored.data,cached:true};
  if(pending.has(recipeID))return pending.get(recipeID);
  const version=generation,key=sessionKey,controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55000);
  const task=(async()=>{
    if(useServer){
      let response,data;
      try {
        const url=new URL('./api/youtube',document.baseURI);url.searchParams.set('recipe',recipeID);
        response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
        data=await response.json();
      }catch{throw new Error('유튜브 자동 연결이 잠시 지연되고 있어요. 다시 시도하거나 직접 검색 버튼을 이용해 주세요.');}
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'영상 검색에 실패했어요. 잠시 후 다시 시도하세요.');
      if(!Array.isArray(data.videos))throw new Error('영상 응답을 확인하지 못했어요. 다시 시도해 주세요.');
      const result={videos:data.videos.filter(v=>v&&/^[A-Za-z0-9_-]{11}$/.test(v.id)).slice(0,3).map(v=>({...v,url:'https://www.youtube.com/watch?v='+v.id})),query:QUERIES[recipeID],fetchedAt:data.fetchedAt||new Date().toISOString(),cached:Boolean(data.cached)};
      verified=true;cache.set(recipeID,{until:Date.now()+6*3600000,data:result});return result;
    }
    const found=new Map();
    for(const order of ['viewCount','relevance']){
      const search=await googleJSON('search',{part:'snippet',type:'video',q:QUERIES[recipeID],order,maxResults:50,regionCode:'KR',relevanceLanguage:'ko',safeSearch:'strict'},key,controller.signal);
      const ids=[...new Set((search.items||[]).map(x=>x.id?.videoId).filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{11}$/.test(x)))];
      if(ids.length){
        const details=await googleJSON('videos',{part:'snippet,statistics,status',id:ids.join(','),fields:'items(id,snippet(title,channelTitle,publishedAt,liveBroadcastContent),statistics(viewCount),status(privacyStatus))'},key,controller.signal);
        for(const item of details.items||[]){
          const snippet=item.snippet||{};
          if(!ids.includes(item.id)||(snippet.liveBroadcastContent||'none')!=='none'||(item.status?.privacyStatus||'public')!=='public'||!matchesMenu(recipeID,snippet.title||''))continue;
          const raw=item.statistics?.viewCount;
          const views=raw==null||raw===''?null:Number(raw);
          found.set(item.id,{id:item.id,title:decode(snippet.title).slice(0,300),channel:decode(snippet.channelTitle).slice(0,150),views:Number.isFinite(views)?Math.max(0,views):null,publishedAt:snippet.publishedAt||'',url:'https://www.youtube.com/watch?v='+item.id});
        }
      }
      if(found.size>=3)break;
    }
    if(version!==generation)throw new Error('연결 설정이 바뀌었어요. 메뉴를 다시 열어주세요.');
    const videos=[...found.values()].sort((a,b)=>(b.views??-1)-(a.views??-1)).slice(0,3);
    const result={videos,query:QUERIES[recipeID],fetchedAt:new Date().toISOString(),cached:false};
    verified=true;cache.set(recipeID,{until:Date.now()+6*3600000,data:result});
    return result;
  })();
  pending.set(recipeID,task);
  try{return await task;}finally{clearTimeout(timer);if(pending.get(recipeID)===task)pending.delete(recipeID);}
}
async function populateVideos(container,recipeID,{e,icon,btn}) {
  const fallback=`<a class="btn secondary youtube-search-link" href="${searchURL(recipeID)}" target="_blank" rel="noopener noreferrer">YouTube에서 직접 검색 ↗</a>`;
  container.innerHTML=`<div class="video-heading"><div><span class="eyebrow">WATCH & COOK</span><h3><span class="youtube-mark">▶</span> 영상으로 따라 만들어요</h3></div><span class="soft-label">조회수 높은 영상 최대 3개</span></div><div class="video-results" role="status">${icon('clock')} ${sessionKey?'YouTube에서 메뉴에 맞는 영상을 찾고 있어요…':'키 없이도 유튜브 검색 페이지를 열 수 있어요.'}</div>`;
  const results=container.querySelector('.video-results');
  const autoConnected=await checkServer();if(!container.isConnected)return;
  if(!autoConnected&&!sessionKey){
    results.innerHTML=`<div class="notice"><strong>브라우저 전용 버전이에요.</strong><p>인기 영상 3개를 자동으로 표시하려면 설정에서 개인 YouTube API 키를 연결하세요. 검색 버튼은 API 키 없이 사용할 수 있어요.</p><div class="video-error-actions">${btn('YouTube 연결 설정','api-help','text-btn')}</div></div>${fallback}`;
    return;
  }
  try {
    const data=await youtubeVideos(recipeID);if(!container.isConnected)return;
    results.innerHTML=data.videos.length?`<div class="video-list">${data.videos.map((v,index)=>`<a class="video-card" href="${e(v.url)}" target="_blank" rel="noopener noreferrer"><div class="video-thumb"><img src="https://i.ytimg.com/vi/${e(v.id)}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="video-rank">${index+1}</span><span class="video-play">▶</span></div><div><strong>${e(v.title)}</strong><span>${e(v.channel)}</span><small>${Number.isFinite(v.views)?'조회수 '+v.views.toLocaleString('ko-KR')+'회':'조회수 확인 불가'} · YouTube에서 보기 ↗</small></div></a>`).join('')}</div>`:'<p class="fine-print">이 메뉴와 맞는 공개 영상을 찾지 못했어요. 없는 결과를 임의로 채우지 않습니다.</p>';
    const note=document.createElement('p');note.className='video-disclaimer';
    note.textContent=`검색어: ${data.query} · ${new Date(data.fetchedAt).toLocaleString('ko-KR')} 조회. 조회수순·관련도순 검색 후보에서 제목이 메뉴와 맞는 영상을 조회수순으로 골랐어요. 전체 YouTube 순위나 영상 속 재료·조리법의 일치를 보장하지 않아요.`;
    container.append(note);
  } catch(error){
    if(!container.isConnected)return;
    results.innerHTML=`<div class="notice warning"><strong>${e(error.message)}</strong><div class="video-error-actions">${btn('다시 불러오기','retry-videos','text-btn',`data-id="${e(recipeID)}"`)}${btn('연결 설정','api-help','text-btn')}</div></div>${fallback}`;
  }
}
window.FridgeYouTube=Object.freeze({getStatus,checkServer,setKey,clearKey,searchURL,matchesMenu,youtubeVideos,populateVideos});
})();
