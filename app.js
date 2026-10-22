(() => {
'use strict';
const { CATEGORIES, STAPLES, FOODS, RECIPES, SOURCE, ALLERGENS, foodFor, emojiFor, canonicalName } = window.FridgeData;
const { today, uid, defaults, fmt, recommendation, status, priority, evaluateRecipe, planUsage, deduct, mergeShopping, fillShopping, sampleItems, validateBackup } = window.FridgeEngine;
const YouTube=window.FridgeYouTube;
const { populateVideos } = YouTube;

const KEY='please-fridge-v1';
let storageError=false;
function load() {
  try {
    const s=JSON.parse(localStorage.getItem(KEY));
    if(s?.version===1 && Array.isArray(s.items) && Array.isArray(s.shopping)) return {...s,settings:{...defaults(),...s.settings,staples:{...defaults().staples,...s.settings?.staples}}};
  } catch { storageError=true; }
  return {version:1, demo:true,items:sampleItems(),shopping:[],settings:defaults(),cooked:0};
}
let state=load();
let page='home', locationFilter='all', search='', category='all', statusFilter='all', sort='priority', recipeFilter='all', ingredientFilter='', recipeSearch='';
let inventoryFiltersOpen=false;
let undoState=null, toastTimer, purchaseID=null, modalReturn=null, pendingImport=null;
const app=document.querySelector('#app'), modal=document.querySelector('#modal');
const e = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  fridge:'M5 3h14v18H5zM5 10h14M8 6v1M8 13v4M7 21v1m10-1v1',
  book:'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15',
  bag:'M5 7h14l2 14H3L5 7Zm3 0V5a4 4 0 0 1 8 0v2',
  settings:'m9 3 1-2h4l1 2 2 1 2-.2 2 3-1 2v3l1 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1-2V9L3 7l2-3 2 .2 2-1ZM15 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  plus:'M12 5v14M5 12h14',arrow:'M5 12h14m-5-5 5 5-5 5',chevron:'m9 5 7 7-7 7',
  clock:'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  leaf:'M20 3C5 2 2 9 6 16c7 5 15-1 14-13ZM4 21 16 9',
  snow:'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m13 9-4 1 1 4M4 14l4 1-1 4m13-9-4-1 1-4',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  check:'m5 12 4 4L19 6', close:'m6 6 12 12M6 18 18 6',
  spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7',
  alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v.5',
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  edit:'m15 4 5 5M3 21l2-7L17 2l5 5L10 19l-7 2Z',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  info:'M12 11v6m0-10v.5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  heart:'M20.8 4.6c-2.3-2.2-6-1.8-8.8 1-2.8-2.8-6.5-3.2-8.8-1C-2 10 6 16 12 21c6-5 14-11 8.8-16.4Z',
  chef:'M6 13a5 5 0 0 1-1-10c2-3 7-3 9 0a5 5 0 0 1 4 10v8H6v-8Zm0 4h12',
  undo:'M3 10h10a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5',
  sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  camera:'M8 5l2-3h4l2 3h5v16H3V5h5Zm9 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  filter:'M3 4h18l-7 8v7l-4 2v-9L3 4Z',
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.leaf}"/></svg>`;
const btn=(label,action,cls='btn secondary',extra='')=>`<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const badge=(text,type='green')=>`<span class="badge ${type}">${text}</span>`;
const dateLabel=d=>d?`${Number(d.slice(5,7))}.${Number(d.slice(8,10))}`:'—';
function save() {
  try { localStorage.setItem(KEY,JSON.stringify(state)); return true; }
  catch { toast('저장 공간을 사용할 수 없어요. 현재 변경은 새로고침하면 사라질 수 있어요.'); return false; }
}
function commit(message,undo=false) {
  save(); render(); if(message) toast(message,undo);
}
function snapshot() { undoState=JSON.stringify(state); }
function toast(message,undo=false) {
  clearTimeout(toastTimer);
  const el=document.querySelector('#toast');
  el.innerHTML=`${icon('check')}<span>${e(message)}</span>${undo?btn('되돌리기','undo','toast-undo'):''}`;
  el.classList.add('visible');
  toastTimer=setTimeout(()=>el.classList.remove('visible'),undo?12000:4500);
}
function openModal(html,wide=false) {
  if(!modal.open) modalReturn=document.activeElement;
  modal.innerHTML=`${html}<button class="modal-close icon-btn" data-action="close" aria-label="닫기">${icon('close')}</button>`;
  modal.className=wide?'wide':'';
  if(!modal.open) modal.showModal();
  document.body.classList.add('modal-open');
  const heading=modal.querySelector('#modal-title');
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  modal.scrollTop=0;
}
function closeModal() { modal.close(); }
modal.addEventListener('close',()=>{document.body.classList.remove('modal-open'); purchaseID=null; modalReturn?.focus?.();});
modal.addEventListener('click',ev=>{if(ev.target===modal){const r=modal.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)closeModal();}});

function recommendations() {
  return RECIPES.map(recipe=>({recipe,ev:evaluateRecipe(recipe,state.items,state.settings)})).filter(x=>!x.ev.blocked).sort((a,b)=>b.ev.score-a.ev.score);
}
const navs=[['home','home','오늘의 추천'],['inventory','fridge','내 냉장고'],['recipes','book','레시피'],['shopping','bag','장보기 목록'],['settings','settings','설정']];
function render() {
  const previousPage=document.body.dataset.page;
  const previousScroll=app.querySelector('main')?.scrollTop||0;
  const soon=state.items.filter(x=>status(x).type==='soon'), check=state.items.filter(x=>status(x).type==='check');
  const shop=state.shopping.filter(x=>!x.done).length;
  const title=navs.find(x=>x[0]===page)?.[2];
  app.innerHTML=`
    <aside class="sidebar">
      <a href="#home" class="brand" aria-label="냉장고를 부탁해 홈"><img src="./assets/favicon.svg" alt=""><span>냉장고를<span>부탁해<span class="brand-dot">.</span></span></span></a>
      <div class="nav-label">MY LITTLE KITCHEN</div>
      <nav aria-label="주 메뉴">${navs.map(([id,ic,label])=>`<button class="nav-item ${page===id?'active':''}" data-action="nav" data-page="${id}" ${page===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span>${id==='shopping'&&shop?`<b class="nav-count">${shop}</b>`:''}${id==='inventory'&&soon.length?'<i class="nav-dot"></i>':''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="little-plant">${icon('leaf')}</div><strong>잘 먹고, 덜 버리는 일.</strong><p>우리 집 냉장고에서 시작해요.</p><span>오늘도 맛있는 하루 보내세요</span></div>
      <div class="local-note">${icon('check')} 로그인 없이, 내 기기에 저장</div>
    </aside>
    <div class="workspace">
      <header class="topbar"><a href="#home" class="mobile-brand" aria-label="냉장고를 부탁해 홈"><img src="./assets/favicon.svg" alt=""><span>냉장고를 부탁해<span class="brand-dot">.</span></span></a><div class="breadcrumb">우리 집 키친 <span>/</span> <strong>${title}</strong></div><div class="topbar-right"><span class="today-date">${new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</span>${btn(icon('plus')+' 재료 추가','add','btn primary top-add')}</div></header>
      <main id="main" tabindex="-1">
        ${state.demo?`<div class="demo-banner"><span>${icon('spark')} <strong>샘플 냉장고</strong><span class="demo-copy"><span class="desktop-label">로 미리 둘러보세요. 실제 보유 재료가 아니에요.</span><span class="mobile-label">예시 재료예요. 내 재료로 시작해 보세요.</span></span></span>${btn('<span class="desktop-label">내 냉장고 시작하기</span><span class="mobile-label">내 냉장고 시작</span>'+icon('arrow'),'start-real','text-btn')}</div>`:''}
        ${storageError?'<div class="notice warning">저장 데이터를 읽을 수 없었어요. 브라우저 저장 설정을 확인하세요. 현재는 샘플 화면입니다.</div>':''}
        ${page==='home'?home(soon,check):page==='inventory'?inventory():page==='recipes'?recipesView():page==='shopping'?shopping():settingsView()}
        <footer class="footer"><span>냉장고를 부탁해<span class="brand-dot">.</span></span><span>작은 재료 하나까지, 맛있게.</span><a href="./credits.html" target="_blank" rel="noopener noreferrer">이미지·자료 출처 ↗</a><span>보관 상태를 확인하고 안전하게 드세요.</span></footer>
      </main>
    </div>
    ${['home','inventory'].includes(page)?`<div class="mobile-action-bar">${btn(icon('plus')+' 재료 추가','add','mobile-add','aria-label="새 재료 추가"')}</div>`:''}
    <nav class="mobile-nav" aria-label="모바일 메뉴">${navs.map(([id,ic,label])=>`<button class="${page===id?'active':''}" data-action="nav" data-page="${id}" ${page===id?'aria-current="page"':''}>${icon(ic)}<span>${id==='home'?'홈':id==='shopping'?'장보기':label}</span>${id==='shopping'&&shop?`<b class="mobile-nav-count" aria-label="구매할 재료 ${shop}개">${shop>99?'99+':shop}</b>`:''}</button>`).join('')}</nav>`;
  document.body.dataset.page=page;
  if(previousPage===page&&matchMedia('(max-width:760px)').matches)app.querySelector('main').scrollTop=previousScroll;
  if(page==='settings')loadIntegrationStatus();
}

function home(soon,check) {
  const recs=recommendations(), featured=state.items.length?recs[0]:null;
  const urgent=state.items.filter(x=>status(x).type!=='check').sort(priority).slice(0,4);
  return `<section class="page-heading"><div><div class="eyebrow">A FRESH START, EVERY DAY</div><h1>오늘은 뭘 먹을까요<span class="brand-dot">?</span></h1><p>냉장고 속 재료를 기억하고, 맛있는 한 끼로 이어드릴게요.</p></div><div class="heading-stamp">${icon('leaf')} 재료는 알뜰하게, 식탁은 풍성하게</div></section>
    <div class="dashboard-top"><section class="hero">
      <div class="hero-content"><div class="hero-eyebrow">${icon('spark')} 우리 집 재료로 만드는 오늘의 한 끼</div><h2><span class="desktop-hero-title">${featured?'냉장고를 열면,<br>오늘의 메뉴가 보여요.':'나의 첫 재료를<br>기록해 볼까요?'}</span><span class="mobile-hero-title">${featured?'있는 재료로,<br>맛있는 한 끼.':'우리 집 냉장고,<br>가볍게 시작해요.'}</span></h2><p>${featured?`<strong>${e(featured.recipe.name)}</strong><br><span class="hero-description">${featured.ev.urgentNames.length?e(featured.ev.urgentNames.join(', '))+'부터 맛있게 사용해요.':'가지고 있는 재료로 가볍게 시작해요.'}</span>`:'무엇이 있는지 알려주시면<br>재료에 맞는 메뉴를 찾아드릴게요.'}</p>${featured?btn('오늘의 레시피 보기 '+icon('arrow'),'recipe','btn primary',`data-id="${featured.recipe.id}"`):btn('첫 재료 추가하기 '+icon('plus'),'add','btn primary')}<div class="hero-foot">${icon('check')} 기본 양념은 이미 있다고 생각할게요</div></div>
      <div class="hero-visual"><div class="hero-orbit"></div><img class="hero-food" src="./assets/bowl.jpg" alt="신선한 채소와 곡물을 담은 한 그릇" onerror="this.style.display='none'"><span class="float-label float-top">${icon('leaf')} 냉장고 속 재료 활용</span><span class="float-label float-bottom">${icon('clock')} ${featured?.recipe.time||15}분이면 충분해요</span><span class="hero-spark">✳</span></div>
    </section>
    <section class="fridge-summary"><div class="section-mini"><h2>우리 집 냉장고</h2>${icon('fridge')}</div><div class="summary-total"><strong>${state.items.length}</strong><span>개의 재료가 있어요</span></div><div class="storage-stats"><button data-action="storage" data-location="fridge"><span class="storage-icon">${icon('fridge')}</span><span>냉장<strong>${state.items.filter(x=>x.location==='fridge').length}<small>개</small></strong></span></button><button data-action="storage" data-location="frozen"><span class="storage-icon blue">${icon('snow')}</span><span>냉동<strong>${state.items.filter(x=>x.location==='frozen').length}<small>개</small></strong></span></button></div><button class="summary-alert" data-action="show-soon">${icon('clock')} 먼저 먹으면 좋은 재료 <b>${soon.length}개</b>${icon('chevron')}</button>${check.length?`<button class="summary-check" data-action="show-check">${icon('alert')} 상태 확인이 필요한 재료 ${check.length}개</button>`:''}</section></div>
    <section class="section"><div class="section-head"><div><h2>${icon(soon.length?'clock':'fridge',soon.length?'orange-icon':'green-icon')} ${soon.length?'먼저 먹으면 좋아요':'지금 냉장고에는'} <span class="count">${soon.length||state.items.length}</span></h2><p>${soon.length?'신선할 때 더 맛있게. 이 재료부터 꺼내보세요.':state.items.length?'보유 중인 재료를 한 번 둘러보세요.':'장 봐 온 재료를 한눈에 관리해 보세요.'}</p></div>${btn('냉장고 전체 보기 '+icon('chevron'),'nav','text-btn', 'data-page="inventory"')}</div>
      ${urgent.length?`<div class="priority-grid">${urgent.map(priorityCard).join('')}</div>`:empty('fridge',state.items.length?'추천 가능한 재료가 없어요':'아직 등록된 재료가 없어요',state.items.length?'보관 상태와 표시 날짜를 먼저 확인해 주세요.':'장 봐 온 재료를 추가하고 오늘의 메뉴를 찾아보세요.',state.items.length?btn('확인할 재료 보기','show-check','btn secondary'):btn('재료 추가하기','add','btn primary'))}
      ${check.length?`<div class="inline-notice">${icon('info')} 상태 확인이 필요한 재료 ${check.length}개는 레시피 추천에서 제외했어요. ${btn('확인하기','show-check','text-btn')}</div>`:''}
    </section>
    <section class="section"><div class="section-head"><div><div class="eyebrow small">FROM YOUR FRIDGE TO YOUR TABLE</div><h2>우리 집 재료 맞춤 레시피 ${icon('spark','green-icon')}</h2><p>먼저 쓸 재료를 담고, 추가 장보기는 줄였어요.</p></div>${btn('레시피 더 보기 '+icon('chevron'),'nav','text-btn','data-page="recipes"')}</div>${recs.length?`<div class="recipe-grid">${recs.slice(0,3).map(recipeCard).join('')}</div>`:empty('book','설정에 맞는 레시피가 없어요','알레르기와 제외 재료 설정을 확인해 주세요.')}</section>
    <div class="tip-banner"><div class="tip-icon">${icon('leaf')}</div><div><strong>양념까지 매번 입력할 필요 없어요.</strong><p>소금, 설탕, 간장 등 기본 양념 10종은 보유한 것으로 생각할게요.</p></div>${btn('양념 설정 '+icon('arrow'),'nav','text-btn','data-page="settings"')}</div>`;
}
function priorityCard(item) {
  const s=status(item);
  return `<button class="priority-card" data-action="item" data-id="${item.id}"><span class="food-emoji ${item.category==='달걀'?'yellow':item.category==='가공식품'?'peach':'mint'}">${emojiFor(item.name)}</span><div class="priority-info"><strong>${e(item.name)}</strong><span>${fmt(item.qty)}${e(item.unit)} <i>·</i> ${item.location==='frozen'?'냉동':'냉장'}</span><small>${s.info?.source==='앱 추정'?'앱 추정':'제품 표시'} ${dateLabel(s.info?.date)}</small></div>${badge(e(s.label),s.type==='soon'?'orange':'green')}${icon('chevron','card-arrow')}</button>`;
}
function recipeCard({recipe:r,ev}) {
  const match=ev.missing.length===0;
  return `<article class="recipe-card"><button class="recipe-image ${r.tone}" data-action="recipe" data-id="${r.id}" aria-label="${r.name} 레시피 보기"><img src="./assets/${r.image}.jpg" alt="${r.name} 참고 이미지" loading="lazy" onerror="this.style.display='none'"><span class="recipe-fallback">${r.id==='tofu'?'🍳':r.id==='chicken'?'🍲':r.id==='pancake'?'🥞':r.id==='rice'?'🍚':r.id==='spinach'?'🥬':'🥘'}</span><span class="image-tag">${match?icon('check')+' 추가 구매 없이':icon('bag')+` ${ev.missing.length}가지 더 있으면`}</span><span class="image-sample">참고 이미지</span></button><div class="recipe-body"><div class="recipe-meta"><span>${r.tag}</span><span>${icon('clock')} ${r.time}분</span></div><button class="recipe-title" data-action="recipe" data-id="${r.id}">${r.name}</button><p>${r.subtitle}</p><div class="recipe-card-bottom"><div class="ingredient-chips">${ev.urgentNames.length?ev.urgentNames.slice(0,2).map(n=>`<span>${emojiFor(n)} ${e(n)} 먼저 쓰기</span>`).join(''):`<span>${icon('fridge')} 보유 재료 ${ev.matched}/${ev.rows.length}</span>`}</div><button class="round-arrow" data-action="recipe" data-id="${r.id}" aria-label="${r.name} 상세">${icon('arrow')}</button></div></div></article>`;
}
function empty(ic,title,description,action='') { return `<div class="empty-state">${icon(ic)}<h3>${title}</h3><p>${description}</p>${action}</div>`; }

function inventory() {
  const activeFilters=Number(category!=='all')+Number(statusFilter!=='all')+Number(sort!=='priority');
  let items=state.items.filter(x=>(locationFilter==='all'||x.location===locationFilter)&&(category==='all'||x.category===category)&&(statusFilter==='all'||status(x).type===statusFilter)&&x.name.includes(search));
  items.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name,'ko'):sort==='recent'?(a,b)=>b.purchased.localeCompare(a.purchased):priority);
  return `<section class="page-heading"><div><div class="eyebrow">A LITTLE CARE GOES A LONG WAY</div><h1>내 냉장고<span class="brand-dot">.</span></h1><p>무엇이 있는지 한눈에, 마지막 한 조각까지 알뜰하게.</p></div>${btn(icon('plus')+' 재료 추가','add','btn primary')}</section>
    <div class="inventory-toolbar"><div class="segmented">${[['all','전체'],['fridge','냉장'],['frozen','냉동']].map(([key,label])=>`<button class="${locationFilter===key?'selected':''}" data-action="filter-location" data-value="${key}" aria-pressed="${locationFilter===key}">${key==='frozen'?icon('snow'):key==='fridge'?icon('fridge'):icon('grid')}${label} <span>${state.items.filter(x=>key==='all'||x.location===key).length}</span></button>`).join('')}</div><label class="search-box">${icon('search')}<input id="inventory-search" placeholder="재료 이름 검색" value="${e(search)}" aria-label="재료 이름 검색"></label>${btn(icon('filter')+'<span>필터</span>'+(activeFilters?`<b>${activeFilters}</b>`:''),'toggle-inventory-filters','mobile-filter-toggle',`aria-expanded="${inventoryFiltersOpen}" aria-controls="inventory-filters" aria-label="필터·정렬 ${inventoryFiltersOpen?'닫기':'열기'}"`)}</div>
    <div id="inventory-filters" class="filter-row ${inventoryFiltersOpen?'filters-open':''}"><div class="category-filters">${['all',...CATEGORIES].map(c=>`<button class="chip ${category===c?'active':''}" data-action="category" data-value="${c}">${c==='all'?'전체':c}</button>`).join('')}</div><div class="select-filters"><select id="status-filter" aria-label="재료 상태 필터">${[['all','모든 상태'],['soon','먼저 먹을 재료'],['check','확인 필요']].map(([v,l])=>`<option value="${v}" ${statusFilter===v?'selected':''}>${l}</option>`).join('')}</select><select id="sort-filter" aria-label="재료 정렬">${[['priority','소비 우선순'],['recent','최근 구매순'],['name','이름순']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
    ${activeFilters?`<div class="inventory-active-filters"><span>필터 ${activeFilters}개 적용 중</span>${btn('초기화 '+icon('close'),'clear-inventory-filters','text-btn')}</div>`:''}
    <div id="inventory-results"><div class="results-count">총 <strong>${items.length}</strong>개 <span>같은 재료도 구매 묶음별로 관리해요</span></div>${items.length?`<div class="inventory-grid">${items.map(inventoryCard).join('')}</div>`:empty('fridge',state.items.length?'조건에 맞는 재료가 없어요':'냉장고의 첫 재료를 알려주세요',state.items.length?'다른 검색어나 필터를 사용해 보세요.':'자주 쓰는 양념은 등록하지 않아도 괜찮아요.',btn(icon('plus')+' 재료 추가','add','btn primary'))}</div>
    <div class="safety-note">${icon('info')} 권장 소비 시점은 안전을 보장하지 않아요. 보관 온도·개봉 상태와 제품 표시를 함께 확인해 주세요.</div>`;
}
function inventoryCard(item) {
  const s=status(item);
  return `<article class="inventory-card ${s.type==='check'?'needs-check':''}"><button class="inventory-main" data-action="item" data-id="${item.id}"><div class="item-card-top"><span class="food-emoji ${s.type==='check'?'peach':'mint'}">${emojiFor(item.name)}</span>${badge(e(s.label),s.type==='check'?'red':s.type==='soon'?'orange':'green')}</div><h3>${e(item.name)} <span>${fmt(item.qty)}${e(item.unit)}</span></h3><p>${item.location==='frozen'?icon('snow')+' 냉동':icon('fridge')+' 냉장'} <i>·</i> ${e(item.category)}${item.opened?' · 개봉':''}</p><div class="item-date"><span>${s.info?`${e(s.info.source)} · ${e(s.info.kind)}`:'권장 시점 추정 불가'}</span><strong>${s.info?dateLabel(s.info.date):'확인 필요'}</strong></div><small class="item-reason">${e(s.reason)}</small></button><div class="item-actions">${btn(icon('chef')+' 사용하기','use','text-btn',`data-id="${item.id}"`)}${btn(icon('edit')+' 수정','edit','text-btn',`data-id="${item.id}"`)}</div></article>`;
}
function recipesView() {
  const recs=recommendations().filter(({recipe:r,ev})=>(recipeFilter!=='ready'||ev.missing.length===0)&&(recipeFilter!=='quick'||r.time<=20)&&(!ingredientFilter||ev.rows.some(x=>x.name===ingredientFilter||x.substitute?.name===ingredientFilter))&&r.name.includes(recipeSearch));
  return `<section class="page-heading"><div><div class="eyebrow">LESS SHOPPING, MORE COOKING</div><h1>오늘의 맛있는 발견<span class="brand-dot">.</span></h1><p>내 냉장고에 맞춰 골랐어요. 부족한 재료와 대체 방법까지 함께 확인하세요.</p></div><span class="soft-label">${icon('book')} 규칙 기반 샘플 레시피 ${RECIPES.length}개</span></section><div class="inventory-toolbar"><div class="segmented">${[['all','맞춤 추천'],['ready','추가 구매 없이'],['quick','20분 이내']].map(([v,l])=>`<button class="${recipeFilter===v?'selected':''}" data-action="recipe-filter" data-value="${v}">${l}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="recipe-search" value="${e(recipeSearch)}" placeholder="요리 이름 검색" aria-label="요리 이름 검색"></label></div>
    ${ingredientFilter?`<div class="active-filter">${emojiFor(ingredientFilter)} ${e(ingredientFilter)} 활용 레시피 ${btn(icon('close'),'clear-ingredient','icon-btn','aria-label="재료 필터 해제"')}</div>`:''}
    <div class="inline-notice">${icon('spark')} 먼저 소비할 재료 → 보유 재료로 완성 가능 → 추가 구매가 적은 순으로 추천해요.</div>
    ${recs.length?`<div class="recipe-grid recipes-full">${recs.map(recipeCard).join('')}</div>`:empty('book','조건에 맞는 레시피가 없어요','필터 또는 설정의 식단·제외 재료를 확인해 주세요.')}
    <div class="safety-note">${icon('info')} 외부 AI가 아닌, 등록된 샘플 레시피와 보유 재료를 비교한 결과예요. 사진은 완성 예시와 다를 수 있어요.</div>`;
}

function shopping() {
  const pending=state.shopping.filter(x=>!x.done), done=state.shopping.filter(x=>x.done);
  return `<section class="page-heading"><div><div class="eyebrow">JUST WHAT YOU NEED</div><h1>장보기 목록<span class="brand-dot">.</span></h1><p>꼭 필요한 만큼만. 구매한 재료는 바로 냉장고에 넣어주세요.</p></div><span class="soft-label">${icon('bag')} 구매할 재료 ${pending.length}개</span></section>
    <div class="shopping-layout"><section class="shopping-panel"><form id="shopping-form" class="shopping-add"><label class="sr-only" for="shop-name">추가할 재료</label><input id="shop-name" name="name" placeholder="장볼 재료를 적어주세요" required maxlength="40" list="foods"><input name="qty" type="number" min="0.01" step="any" value="1" aria-label="구매 수량" required><select name="unit" aria-label="단위">${['개','g','kg','ml','l','팩','봉','큰술','작은술'].map(u=>`<option>${u}</option>`).join('')}</select><button class="btn primary" type="submit" aria-label="장보기 목록에 추가">${icon('plus')}</button></form><datalist id="foods">${FOODS.map(f=>`<option value="${f.name}">`).join('')}</datalist>
    ${pending.length?`<div class="shopping-list">${pending.map(x=>`<div class="shopping-row"><span class="shop-emoji">${emojiFor(x.name)}</span><div><strong>${e(x.name)}</strong><span>${fmt(x.qty)}${e(x.unit)}</span></div>${btn('구매 완료 '+icon('plus'),'purchase','btn secondary small-btn',`data-id="${x.id}"`)}${btn(icon('trash'),'remove-shop','icon-btn',`data-id="${x.id}" aria-label="${e(x.name)} 목록에서 삭제"`)}</div>`).join('')}</div>`:empty('bag','필요한 재료만 쏙 담아요','레시피에서 부족한 재료를 추가하거나 직접 적어보세요.',btn('레시피 살펴보기 '+icon('arrow'),'nav','btn secondary','data-page="recipes"'))}
    ${done.length?`<details class="done-list"><summary>구매 완료 ${done.length}개</summary>${done.map(x=>`<div class="shopping-row completed">${icon('check')}<span>${e(x.name)} · ${fmt(x.qty)}${e(x.unit)}</span>${btn(icon('trash'),'remove-shop','icon-btn',`data-id="${x.id}" aria-label="완료 항목 삭제"`)}</div>`).join('')}</details>`:''}</section><aside class="shopping-tip"><span class="big-emoji">🧺</span><h2>장보기 전, 냉장고 먼저.</h2><p>이미 있는 재료를 확인하면<br>중복 구매를 줄일 수 있어요.</p><ul><li>${icon('check')} 같은 재료·호환 단위는 하나로 합쳐요</li><li>${icon('check')} 기본 양념은 자동으로 넣지 않아요</li><li>${icon('check')} 구매 완료 시 보관 정보까지 입력해요</li></ul>${btn('내 냉장고 보기 '+icon('arrow'),'nav','text-btn','data-page="inventory"')}</aside></div>`;
}
function settingsView() {
  const s=state.settings;
  return `<section class="page-heading"><div><div class="eyebrow">YOUR KITCHEN, YOUR WAY</div><h1>우리 집 취향대로<span class="brand-dot">.</span></h1><p>한 번 설정해 두면, 매번 설명하지 않아도 괜찮아요.</p></div><span class="soft-label">${icon('check')} 변경 즉시 자동 저장</span></section>
    <div class="settings-grid"><section class="settings-card"><div class="settings-icon">${icon('chef')}</div><h2>기본 양념</h2><p>아래 양념은 이미 있다고 생각할게요.<br>없는 것만 꺼주세요. 수량은 관리하지 않아요.</p><div class="staple-list">${Object.entries(s.staples).map(([name,on])=>`<label class="toggle-row"><span>${e(name)}${!STAPLES.includes(name)?' <small>추가 양념</small>':''}</span><input type="checkbox" data-setting="staple" data-name="${e(name)}" ${on?'checked':''}><span class="switch"></span></label>`).join('')}</div><form id="staple-form" class="inline-form"><input name="name" placeholder="우리 집 기본 양념 추가" maxlength="30" required aria-label="추가할 기본 양념"><button class="icon-btn" aria-label="양념 추가">${icon('plus')}</button></form></section>
    <div><section class="settings-card"><div class="settings-icon peach">${icon('heart')}</div><h2>알레르기 & 식단</h2><p>선택한 항목이 들어간 레시피와 대체 재료는 추천에서 제외해요.</p><div class="allergy-chips">${Object.keys(ALLERGENS).map(a=>`<label class="allergy-chip"><input type="checkbox" data-setting="allergy" value="${a}" ${s.allergies.includes(a)?'checked':''}><span>${a}</span></label>`).join('')}</div><label class="field-label" for="diet">식단 유형</label><select id="diet" data-setting="diet"><option value="none" ${s.diet==='none'?'selected':''}>제한 없어요</option><option value="vegetarian" ${s.diet==='vegetarian'?'selected':''}>채식 (달걀·유제품 허용)</option><option value="vegan" ${s.diet==='vegan'?'selected':''}>비건</option></select><form id="exclusion-form"><label class="field-label" for="excluded">따로 제외할 재료</label><div class="inline-form"><input id="excluded" name="excluded" value="${e(s.excluded)}" placeholder="예: 당근, 대파" maxlength="200"><button class="btn secondary small-btn">저장</button></div></form><div class="notice">가공식품의 성분과 교차 오염은 판단할 수 없어요. 알레르기가 있다면 제품 원재료 표시를 반드시 확인하세요.</div></section>
    <section class="settings-card data-card"><h2>${icon('info')} 데이터 & 보관 안내</h2><p>재고와 설정은 현재 브라우저에만 저장돼요. 다른 기기와 동기화되지 않으며 브라우저 데이터를 삭제하면 함께 지워져요.</p><div class="settings-actions">${btn('데이터 백업 받기','export','btn secondary small-btn')}${btn('샘플 냉장고 보기','load-demo','text-btn')}</div><a href="${SOURCE}" target="_blank" rel="noopener noreferrer" class="source-link">권장 보관 기간 근거 · Health Canada ↗</a><p class="fine-print">냉장 4°C 이하, 냉동 −18°C 이하 등 조건을 충족할 때만 적용해요. 냉동 권장 기간은 품질 기준이며 안전을 보장하지 않아요. 근거가 없는 품목은 추정하지 않아요.</p></section></div></div>`;
}

function itemModal(id) {
  const item=state.items.find(x=>x.id===id); if(!item)return;
  const s=status(item), rec=recommendation(item);
  openModal(`<div class="detail-top"><span class="food-emoji large mint">${emojiFor(item.name)}</span>${badge(e(s.label),s.type==='check'?'red':s.type==='soon'?'orange':'green')}<h2 id="modal-title">${e(item.name)}</h2><p>${fmt(item.qty)}${e(item.unit)} · ${item.location==='frozen'?'냉동':'냉장'} 보관</p></div><div class="detail-facts"><div><span>구매일</span><strong>${e(item.purchased)}</strong></div><div><span>개봉 여부</span><strong>${item.opened?e(item.openedAt)+' 개봉':'미개봉'}</strong></div><div><span>제품 표시</span><strong>${item.hasDate?e(item.labelType)+' '+e(item.labelDate):'날짜 표시 없음'}</strong></div><div><span>${e(s.info?.kind||'권장 소비 시점')}</span><strong>${e(s.info?.date||'추정 불가')} ${s.info?`<small>(${e(s.info.source)})</small>`:''}</strong></div>${item.movedAt?`<div><span>보관 이동일</span><strong>${e(item.movedAt)} · 조건 재확인 필요</strong></div>`:''}</div>${rec?`<div class="notice"><strong>앱 추정 근거</strong><p>${e(rec.condition)} · ${e(rec.sourceRow)}</p><p>${e(rec.note)}</p><a href="${SOURCE}" target="_blank" rel="noopener noreferrer">Health Canada 보관 지침 ↗</a></div>`:''}${item.notes?`<p class="item-notes">${e(item.notes)}</p>`:''}<div class="notice ${s.type==='check'?'warning':''}">${icon('info')} ${s.type==='check'?'상태·제품 표시·보관 조건 확인이 필요해 레시피 추천에서 제외했어요. 변질이 의심되면 섭취하지 마세요.':'날짜가 남았더라도 안전을 보장하지 않아요. 제품 표시와 보관 상태를 함께 확인하세요.'}</div><div class="modal-actions">${btn(icon('trash'),'delete-item','icon-btn danger',`data-id="${id}" aria-label="재료 삭제"`)}${btn('수정하기','edit','btn secondary',`data-id="${id}"`)}${btn('사용량 기록','use','btn primary',`data-id="${id}"`)}</div>${s.type!=='check'?btn('이 재료로 요리 찾기 '+icon('arrow'),'ingredient-recipes','text-btn full-width',`data-name="${e(item.name)}"`):''}`);
  for(const fact of modal.querySelectorAll('.detail-facts>div')) {
    const label=fact.firstElementChild.textContent;
    if(label==='개봉 여부'&&item.openingUncertain)fact.lastElementChild.textContent='확인 필요';
    if(label==='제품 표시'&&item.dateUncertain)fact.lastElementChild.textContent='사진에서 날짜 확인 못함';
  }
}

function addModal(id=null,prefill={}) {
  const item=id?state.items.find(x=>x.id===id):null;
  const x=item||{name:'',qty:1,unit:'개',category:'채소',location:'fridge',purchased:today(),hasDate:true,labelType:'소비기한',labelDate:'',opened:false,conditions:false,...prefill};
  openModal(`<div class="modal-heading"><span class="eyebrow">MY FRIDGE</span><h2 id="modal-title">${item?'재료 정보 수정':'새로운 재료를 넣어요'}</h2><p>${state.demo?'샘플 냉장고에 저장됩니다. 실제 기록은 ‘내 냉장고 시작하기’를 눌러주세요.':'장 봐 온 재료를 잊기 전에, 간단히 기록해요.'}</p></div><form id="ingredient-form" data-id="${id||''}" data-original-location="${item?.location||''}">
    <label class="field-label" for="food-name">어떤 재료인가요? <span>*</span></label><input id="food-name" name="name" value="${e(x.name)}" placeholder="예: 두부, 달걀, 당근" list="food-suggestions" required maxlength="40" autocomplete="off"><datalist id="food-suggestions">${FOODS.map(f=>`<option value="${f.name}">`).join('')}</datalist>
    <div class="quick-foods">${['두부','달걀','당근','닭고기','애호박'].map(n=>btn(`${emojiFor(n)} ${n}`,'quick-food','chip',`data-name="${n}"`)).join('')}</div>
    <div class="form-row"><label>수량 <span class="required">*</span><input name="qty" type="number" min="0.01" max="1000000" step="any" required value="${x.qty}"></label><label>단위<select name="unit">${['개','g','kg','ml','l','팩','봉','큰술','작은술'].map(u=>`<option ${x.unit===u?'selected':''}>${u}</option>`).join('')}</select></label><label>분류<select name="category">${CATEGORIES.map(c=>`<option ${x.category===c?'selected':''}>${c}</option>`).join('')}</select></label></div>
    <label class="field-label">어디에 보관하나요?</label><div class="radio-cards">${[['fridge','냉장','fridge'],['frozen','냉동','snow']].map(([v,l,ic])=>`<label><input type="radio" name="location" value="${v}" ${x.location===v?'checked':''}><span>${icon(ic)} ${l}</span></label>`).join('')}</div>
    <label class="field-label" for="purchased">구매일 <span>*</span></label><input id="purchased" name="purchased" type="date" value="${e(x.purchased)}" max="${today()}" required>
    <label class="field-label">제품에 날짜가 적혀 있나요?</label><div class="radio-cards compact"><label><input type="radio" name="dateMode" value="label" ${x.hasDate?'checked':''}><span>네, 직접 입력할게요</span></label><label><input type="radio" name="dateMode" value="estimate" ${!x.hasDate?'checked':''}><span>아니요, 추천해주세요</span></label></div>
    <div id="label-fields" class="form-row ${x.hasDate?'':'hidden'}"><label>표시 종류<select name="labelType"><option ${x.labelType==='소비기한'?'selected':''}>소비기한</option><option ${x.labelType==='유통기한'?'selected':''}>유통기한</option><option ${x.labelType==='품질유지기한'?'selected':''}>품질유지기한</option></select></label><label>제품 표시 날짜<input name="labelDate" type="date" value="${e(x.labelDate||'')}" ${x.hasDate?'required':''}></label></div>
    <div id="estimate-fields" class="${x.hasDate?'hidden':''}"><label class="check-label"><input name="conditions" type="checkbox" ${x.conditions?'checked':''}> 신선하게 구매했고, 안내된 보관 조건을 지켰어요</label><div id="estimate-preview" class="notice"></div><label class="field-label" for="custom-date">내가 정한 소비 목표일 <small>(선택 · 안전 기한이 아님)</small></label><input id="custom-date" name="customDate" type="date" value="${e(x.customDate||'')}"></div>
    <div id="storage-confirmation" class="notice warning ${x.movedAt?'':'hidden'}"><strong>보관 위치를 옮기면 날짜의 적용 조건이 달라져요.</strong><p>이동 날짜를 기록하고 기존 기한은 유지해요. 제조사 안내를 확인하기 전에는 추천에서 제외합니다.</p><label class="check-label"><input name="storageConfirmed" type="checkbox" ${x.storageConfirmed?'checked':''}> 제품 안내를 확인했고, 표시 날짜가 현재 보관 위치에도 적용돼요</label></div>
    <details class="extra-fields" ${x.opened||x.notes||x.suspect?'open':''}><summary>개봉 상태 · 메모 · 안전 확인 <span>선택 입력</span></summary><label class="check-label"><input name="opened" type="checkbox" ${x.opened?'checked':''}> 이미 개봉한 재료예요</label><div id="opened-fields" class="${x.opened?'':'hidden'}"><label class="field-label">개봉일<input name="openedAt" type="date" max="${today()}" value="${e(x.openedAt||today())}" ${x.opened?'required':''}></label><label class="check-label"><input name="openedLabelConfirmed" type="checkbox" ${x.openedLabelConfirmed?'checked':''}> 입력한 제품 날짜가 개봉 후에도 적용됨을 확인했어요</label><p class="fine-print">그렇지 않으면 근거가 있는 개봉 후 기간만 적용하며, 알 수 없으면 추천에서 제외해요.</p><label class="check-label"><input name="openedConditions" type="checkbox" ${x.conditions?'checked':''}> 개봉 후에도 냉장 4°C 이하로 보관했어요</label></div><label class="field-label">메모<textarea name="notes" rows="2" maxlength="500" placeholder="예: 찌개용, 소분해 둔 재료">${e(x.notes||'')}</textarea></label><label class="check-label danger-text"><input name="suspect" type="checkbox" ${x.suspect?'checked':''}> 변질이 의심돼요 (레시피 추천 제외)</label></details>
    <div id="form-error" class="form-error" role="alert"></div><div class="modal-actions">${btn('취소','close','btn secondary')}<button class="btn primary" type="submit">${icon(item?'check':'plus')} ${item?'변경사항 저장':'냉장고에 넣기'}</button></div></form>`);
  if(x.dateUncertain||x.openingUncertain)modal.querySelector('#ingredient-form .modal-actions').insertAdjacentHTML('beforebegin',`<div class="notice warning"><strong>사진 등록 때 확인하지 못한 정보가 있어요.</strong><p>수량만 수정해도 미확인 상태는 유지됩니다. 실물과 대조해 위 입력을 고친 뒤 확인란을 선택해 주세요.</p>${x.dateUncertain?'<label class="check-label"><input name="confirmPhotoDate" type="checkbox"> 제품에 날짜가 있는지 확인했고, 위 날짜 선택·입력이 맞아요</label>':''}${x.openingUncertain?'<label class="check-label"><input name="confirmPhotoOpening" type="checkbox"> 개봉·손질 상태를 확인했고, 위 개봉 여부 입력이 맞아요</label>':''}</div>`);
  updateEstimate();
}
function readIngredient(form) {
  const f=new FormData(form), id=form.dataset.id, original=state.items.find(x=>x.id===id);
  return {...original,id:id||uid(),name:String(f.get('name')).trim(),qty:Number(f.get('qty')),unit:f.get('unit'),category:f.get('category'),location:f.get('location'),purchased:f.get('purchased'),hasDate:f.get('dateMode')==='label',labelType:f.get('labelType'),labelDate:f.get('dateMode')==='label'?f.get('labelDate'):'',conditions:f.has('conditions')||f.has('openedConditions'),customDate:f.get('dateMode')==='estimate'?f.get('customDate'):'',opened:f.has('opened'),openedAt:f.has('opened')?f.get('openedAt'):'',openedLabelConfirmed:f.has('openedLabelConfirmed'),storageConfirmed:f.has('storageConfirmed'),dateUncertain:Boolean(original?.dateUncertain)&&!f.has('confirmPhotoDate'),openingUncertain:Boolean(original?.openingUncertain)&&!f.has('confirmPhotoOpening'),notes:f.get('notes'),suspect:f.has('suspect'),movedAt:original&&original.location!==f.get('location')?today():original?.movedAt||''};
}
function updateEstimate() {
  const form=modal.querySelector('#ingredient-form'); if(!form)return;
  const x=readIngredient(form), rec=recommendation(x), preview=modal.querySelector('#estimate-preview');
  if(form.dataset.lastLocation && form.dataset.lastLocation!==x.location)form.elements.storageConfirmed.checked=false;
  form.dataset.lastLocation=x.location;
  modal.querySelector('#storage-confirmation').classList.toggle('hidden',!x.movedAt);
  modal.querySelector('#label-fields').classList.toggle('hidden',!x.hasDate);
  modal.querySelector('[name="labelDate"]').required=x.hasDate;
  modal.querySelector('#estimate-fields').classList.toggle('hidden',x.hasDate);
  modal.querySelector('#opened-fields').classList.toggle('hidden',!x.opened);
  modal.querySelector('[name="openedAt"]').required=x.opened;
  preview.innerHTML=rec?`<strong>${icon('spark')} 앱 추정 · ${rec.date}</strong><p>${e(rec.condition)}<br>${e(rec.sourceRow)}</p><a href="${SOURCE}" target="_blank" rel="noopener noreferrer">Health Canada 근거 보기 ↗</a><p>${e(rec.note)} 보관 상태에 따라 달라지며 안전을 보장하지 않아요.</p>`:`<strong>${!x.conditions?'보관 조건을 먼저 확인해 주세요':'권장 시점 추정 불가'}</strong><p>${!x.conditions?'냉장 4°C 이하, 냉동 −18°C 이하 보관을 전제로 해요.':x.movedAt?'보관 위치를 옮긴 식품은 기존 날짜를 초기화하지 않아요. 별도 적용 조건을 확인하세요.':`${e(x.name||'이 재료')}의 현재 보관·개봉 상태에 적용할 확인된 기간이 없어요. 제품 또는 판매처 정보를 확인해 주세요.`}</p>`;
}

function recipeModal(id) {
  const r=RECIPES.find(x=>x.id===id); if(!r)return;
  const ev=evaluateRecipe(r,state.items,state.settings);
  if(ev.blocked){toast('알레르기 또는 식단 설정에 맞지 않는 레시피예요.');return;}
  openModal(`<div class="recipe-detail-hero ${r.tone}"><img src="./assets/${r.image}.jpg" alt="${r.name} 참고 이미지" onerror="this.style.display='none'"><div><span class="eyebrow">TODAY'S RECIPE</span><h2 id="modal-title">${r.name}</h2><p>${r.subtitle}</p><div class="detail-recipe-meta"><span>${icon('clock')} ${r.time}분</span><span>${icon('chef')} ${r.level}</span><span>${r.servings}인분</span></div></div></div><div class="recipe-detail-content">${ev.urgentNames.length?`<div class="notice mint-notice">${icon('leaf')} ${ev.urgentNames.map(e).join(', ')}부터 맛있게 사용해요.</div>`:''}<div class="detail-section-head"><h3>필요한 재료</h3>${badge(ev.missing.length?`${ev.missing.length}가지 추가 필요`:'추가 구매 없이 가능',ev.missing.length?'orange':'green')}</div><div class="recipe-ingredients">${ev.rows.map(row=>`<div class="recipe-ingredient"><span class="ingredient-symbol ${row.missing&&!row.substitute?'missing':''}">${icon(row.missing&&!row.substitute?'plus':'check')}</span><strong>${e(row.name)}</strong><span>${fmt(row.qty)}${e(row.unit)}</span><small>${row.staple?'기본 양념':row.substitute?'대체 가능':row.missing?row.have?`${fmt(row.have)}${e(row.unit)} 보유 · ${fmt(row.missing)}${e(row.unit)} 부족`:'없어요':'보유 중'}</small></div>${row.substitute?`<div class="substitution"><span>${icon('spark')} <strong>${e(row.name)} → ${e(row.substitute.name)} ${fmt(row.substitute.qty)}${e(row.substitute.unit)}</strong></span><p>${e(row.substitute.note)}</p><small>요리 완료 시 위 대체 재료 사용을 기본으로 제안해요.</small></div>`:row.missing?`<div class="missing-note">적절한 보유 대체재가 없어요. ${fmt(row.missing)}${e(row.unit)} 추가 구매가 필요해요.</div>`:''}`).join('')}</div>${ev.missing.length?btn(icon('bag')+' 부족한 재료 장보기 목록에 추가','recipe-shop','btn secondary full-width',`data-id="${r.id}"`):''}<h3 class="steps-heading">이렇게 만들어요</h3><ol class="recipe-steps">${r.steps.map((s,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><p>${s}</p></li>`).join('')}</ol><div class="notice">레시피는 등록된 샘플이며 사진은 참고용이에요. 물은 보유 여부를 확인하지 않아요. 기본 양념도 필요한 분량만 사용하세요. 식품의 보관 상태와 제품 조리 지침을 확인하세요.</div><div class="modal-actions sticky-actions">${btn('닫기','close','btn secondary')}${btn(icon('check')+' 요리 완료 · 사용량 확인','cook','btn primary',`data-id="${r.id}"`)}</div></div>`,true);
  const videos=document.createElement('section');videos.className='youtube-section';videos.id='recipe-videos';
  modal.querySelector('.recipe-detail-content').prepend(videos);
  populateVideos(videos,id,{e,icon,btn});
}
function cookModal(id) {
  const r=RECIPES.find(x=>x.id===id), ev=evaluateRecipe(r,state.items,state.settings), amounts=planUsage(ev,state.items);
  if(ev.blocked){toast('현재 식단 설정에 맞지 않아요.');return;}
  const names=new Set(amounts.map(a=>state.items.find(x=>x.id===a.id)?.name));
  for(const item of state.items.filter(x=>names.has(x.name)&&status(x).type!=='check').sort(priority)) {
    if(!amounts.some(a=>a.id===item.id))amounts.push({id:item.id,qty:0});
  }
  openModal(`<div class="modal-heading"><span class="eyebrow">WELL COOKED!</span><h2 id="modal-title">실제로 쓴 만큼만 기록해요</h2><p>${r.name} · 먼저 소비할 구매 묶음부터 선택했어요.</p></div>${ev.missing.length?`<div class="notice warning">${ev.missing.map(x=>e(x.name)).join(', ')}이 부족해요. 완성했다고 가정하지 않고, 아래 보유 재료 사용량만 차감합니다.</div>`:''}<form id="cook-form">${amounts.length?amounts.map(a=>{const item=state.items.find(x=>x.id===a.id);return `<label class="usage-row"><span><strong>${emojiFor(item.name)} ${e(item.name)}</strong><small>구매 ${dateLabel(item.purchased)} · 현재 ${fmt(item.qty)}${e(item.unit)} · ${item.location==='frozen'?'냉동':'냉장'}</small></span><input type="number" name="${item.id}" value="${a.qty}" min="0" max="${item.qty}" step="any" required aria-label="${e(item.name)} 사용량"><span>${e(item.unit)}</span></label>`;}).join(''):empty('fridge','차감할 보유 재료가 없어요','재료를 먼저 등록해 주세요.')}<p class="fine-print">기본 양념은 차감하지 않아요. 사용하지 않은 재료는 0으로 바꿔주세요. 차감 후 12초 동안 되돌릴 수 있어요.</p><div class="form-error" role="alert"></div><div class="modal-actions">${btn('돌아가기','recipe','btn secondary',`data-id="${id}"`)}<button class="btn primary" ${!amounts.length?'disabled':''}>${icon('check')} 확인하고 재고 반영</button></div></form>`);
}
function useModal(id) {
  const item=state.items.find(x=>x.id===id); if(!item)return;
  openModal(`<div class="modal-heading"><h2 id="modal-title">${emojiFor(item.name)} ${e(item.name)} 사용 기록</h2><p>현재 ${fmt(item.qty)}${e(item.unit)} 있어요. 실제 사용하거나 버린 만큼 기록하세요.</p></div>${status(item).type==='check'?'<div class="notice warning">상태 확인이 필요한 재료예요. 이 기능은 사용·폐기 수량 기록이며 섭취를 권장하지 않아요.</div>':''}<form id="use-form" data-id="${id}"><label class="field-label">사용·폐기 수량 (${e(item.unit)})<input name="qty" type="number" min="0.01" max="${item.qty}" step="any" value="${Math.min(1,item.qty)}" required></label>${btn('전부 사용·폐기','use-all','text-btn',`data-qty="${item.qty}"`)}<div class="form-error" role="alert"></div><div class="modal-actions">${btn('취소','close','btn secondary')}<button class="btn primary">재고에 반영하기</button></div></form>`);
}
function confirmModal(title,description,action,id='',label='확인') {
  openModal(`<div class="modal-heading"><h2 id="modal-title">${title}</h2><p>${description}</p></div><div class="modal-actions">${btn('취소','close','btn secondary')}${btn(label,action,'btn primary',`data-id="${id}"`)}</div>`);
}
function navigate(next) { page=next;location.hash=next;render();window.scrollTo({top:0,behavior:'smooth'}); }

async function loadIntegrationStatus() {
  const destination=app.querySelector('.settings-grid>div');if(!destination)return;
  await YouTube.checkServer();if(!destination.isConnected)return;
  const panel=document.createElement('section');panel.className='settings-card integration-settings';
  const config=YouTube.getStatus();
  panel.innerHTML=`<div class="settings-icon">${icon('book')}</div><h2>YouTube 영상 연결</h2><p>HTML · CSS · JavaScript만으로 동작해요. 영상 3개 자동 검색은 개인 API 키가 필요하고, 유튜브 검색 페이지는 키 없이 열 수 있어요.</p><div class="integration-status"><div><span>유튜브 자동 검색</span>${badge(config.configured?config.verified?'연결 확인':'키 설정됨':'키 없이 사용 중',config.configured?'green':'orange')}</div><div><span>사진 분석</span>${badge('보류','orange')}</div></div><form id="youtube-key-form"><label class="field-label" for="youtube-api-key">개인 YouTube API 키<input id="youtube-api-key" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${config.configured?'새 키를 입력하면 교체해요':'Google에서 발급한 API 키'}" ${config.configured?'':'required'}></label><label class="check-label"><input name="consent" type="checkbox" required> 브라우저 전용 연결의 키 노출 가능성을 이해했고 개인용 환경에서 사용할게요.</label><div class="notice warning">브라우저에서는 키를 숨길 수 없어요. 개발자 도구·확장 프로그램 등에서 확인될 수 있습니다. 공개·공용 PC에서는 입력하지 마세요. 키는 이 탭의 세션 저장소에만 두며 재고 백업에 포함하지 않아요. 브라우저 세션 복원 시 남을 수 있으니 사용 후 연결을 해제하세요.</div><div class="settings-actions"><button class="btn primary small-btn" type="submit">${config.configured?'연결 확인':'키 저장 · 연결 확인'}</button>${config.configured?btn('연결 해제','clear-youtube','btn secondary small-btn'):''}${btn('설정 도움말','api-help','text-btn')}</div><div class="form-error" id="youtube-key-message" role="status"></div></form>`;
  if(config.serverConnected)panel.innerHTML=`<div class="settings-icon">${icon('book')}</div><h2>YouTube 자동 연결</h2><p>이 사이트에서는 개인 API 키를 입력할 필요가 없어요. 메뉴를 열면 관련 영상을 자동으로 찾아드려요.</p><div class="integration-status"><div><span>유튜브 영상 검색</span>${badge(config.verified?'연결 확인':'서버 연결 준비됨','green')}</div><div><span>사진 분석</span>${badge('보류','orange')}</div></div><div class="notice">API 키는 Vercel 서버 환경변수에만 보관하며 HTML·브라우저 응답·재고 백업에 포함하지 않습니다. 반복 검색은 캐시하고 무료 할당량을 초과하면 요청을 제한해요.</div><div class="settings-actions">${btn('영상 연결 확인','verify-server-youtube','btn secondary small-btn')}${btn('연결 안내','api-help','text-btn')}</div>`;
  destination.prepend(panel);
  panel.querySelector('#youtube-key-form .settings-actions')?.insertAdjacentHTML('beforebegin',`<div class="local-key-import"><label class="btn secondary small-btn file-button">기존 설정 파일에서 키 읽기<input id="youtube-key-file" class="sr-only" type="file" accept=".env,.txt,text/plain"></label><p class="fine-print">이전 버전의 .env를 직접 선택하면 YouTube 키만 비밀번호 입력란에 채워요. 파일은 업로드하지 않고, 아래 연결 버튼을 누르기 전에는 저장하지 않습니다.</p></div>`);
  const dataCard=app.querySelector('.data-card');
  dataCard.insertAdjacentHTML('beforeend',`<div class="backup-controls"><label class="btn secondary small-btn file-button">백업 파일 불러오기<input id="backup-file" type="file" accept="application/json,.json" class="sr-only"></label><p class="fine-print">이전 서버 버전의 JSON 백업도 불러올 수 있어요. 복원 전 내용과 교체 여부를 확인합니다. API 키는 가져오지 않아요.</p></div>`);
}
function apiHelpModal() {
  if(YouTube.getStatus().serverConnected){
    openModal(`<div class="modal-heading"><span class="eyebrow">CONNECTED, SAFELY</span><h2 id="modal-title">유튜브가 자동으로 연결돼 있어요</h2><p>개인 API 키를 입력하지 않아도 메뉴별 영상을 볼 수 있어요.</p></div><div class="notice"><strong>키는 서버에만 보관해요.</strong><p>Vercel 환경변수에서 Google YouTube API로 연결하며 브라우저에는 영상 정보만 전달합니다. 공개 소스·브라우저 저장소·JSON 백업에는 실제 키가 없습니다.</p></div><div class="notice">관련 검색 후보 중 제목이 메뉴와 맞는 영상을 조회수순으로 최대 3개 표시합니다. 전체 YouTube 순위나 영상 속 재료·조리법의 일치를 보장하지 않아요. 무료 할당량 초과 시에는 직접 검색 버튼을 이용해 주세요. 사진 분석은 보류 상태입니다.</div><div class="modal-actions">${btn('확인했어요','close','btn primary')}</div>`);return;
  }
  openModal(`<div class="modal-heading"><span class="eyebrow">NO SERVER, JUST YOUR BROWSER</span><h2 id="modal-title">브라우저 전용 유튜브 연결</h2><p>이 버전은 서버 없이 파일을 직접 열어 사용합니다.<br>재고·추천·장보기는 API 키 없이도 동작해요.</p></div>
    <ol class="api-help-steps">
      <li><strong>키 없이 사용하기</strong><p>메뉴 상세의 ‘YouTube에서 직접 검색’을 누르면 해당 요리 검색 페이지가 열려요. 앱 안에 인기 영상 3개를 자동 표시하는 기능과는 다릅니다.</p></li>
      <li><strong>인기 영상 3개 자동 검색</strong><p><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console ↗</a>에서 발급한 개인 YouTube Data API v3 키를 설정에 입력하세요. ‘기존 설정 파일에서 키 읽기’로 이전 버전의 .env를 직접 선택할 수도 있어요. 업로드하지 않고 YouTube 키만 입력란에 채웁니다.</p></li>
      <li><strong>브라우저에서는 키를 숨길 수 없어요</strong><p>개발자 도구나 확장 프로그램에서 확인될 수 있으므로 개인용 환경에서만 사용하세요. 공용·공개 배포에서는 키 없는 검색 링크 또는 안전한 서버 방식을 권장합니다.</p></li>
      <li><strong>키 사용 제한</strong><p>YouTube Data API v3만 허용하세요. 웹에 배포하면 해당 도메인의 HTTP 리퍼러 제한을 추가하세요. 파일을 직접 열면 리퍼러가 없어 웹사이트 제한 키가 거부될 수 있습니다. 키 제한을 무작정 해제해 공개하지 마세요.</p></li>
      <li><strong>저장과 비용</strong><p>키는 현재 탭의 세션 저장소에만 두고 코드 파일·재고 백업에는 넣지 않아요. 세션 복원 시 남을 수 있으므로 사용 후 ‘연결 해제’를 누르세요. 무료 할당량을 초과하면 요청이 제한되며 앱에서 결제나 유료 서비스를 신청하지 않습니다.</p></li>
    </ol><div class="notice warning">기존 서버 버전의 .env와 키는 그대로 보존했고, 이 버전은 파일을 자동으로 읽거나 서버 API를 호출하지 않습니다. 사진 분석은 보류 상태이며 OpenAI에 사진을 보내지 않아요.</div>
    <div class="modal-actions">${btn('닫기','close','btn secondary')}${btn('설정에서 입력하기','youtube-settings','btn primary')}</div>`);
}

document.addEventListener('click',async ev=>{
  const target=ev.target.closest('[data-action]'); if(!target)return;
  const {action,id,value,name}=target.dataset;
  if(action==='close') return closeModal();
  if(action==='nav')return navigate(target.dataset.page);
  if(action==='add')return addModal();
  if(action==='api-help')return apiHelpModal();
  if(action==='verify-server-youtube'){
    target.disabled=true;
    try{await YouTube.youtubeVideos('tofu');toast('유튜브 자동 연결을 확인했어요. 개인 키는 필요하지 않아요.');if(page==='settings')render();}catch(error){toast(error.message);}finally{if(target.isConnected)target.disabled=false;}
    return;
  }
  if(action==='youtube-settings'){closeModal();return navigate('settings');}
  if(action==='clear-youtube'){YouTube.clearKey();render();toast('이 탭의 YouTube 키와 영상 캐시를 지웠어요.');return;}
  if(action==='confirm-import'){
    if(!pendingImport)return;
    snapshot();state=pendingImport;pendingImport=null;closeModal();commit('백업 데이터를 불러왔어요. API 키는 포함하지 않았어요.',true);return;
  }
  if(action==='retry-videos'){const container=modal.querySelector('#recipe-videos');if(container)populateVideos(container,id,{e,icon,btn});return;}
  if(action==='edit')return addModal(id);
  if(action==='item')return itemModal(id);
  if(action==='recipe')return recipeModal(id);
  if(action==='cook')return cookModal(id);
  if(action==='use')return useModal(id);
  if(action==='use-all'){modal.querySelector('[name="qty"]').value=target.dataset.qty;return;}
  if(action==='undo') {if(undoState){state=JSON.parse(undoState);undoState=null;commit('변경을 되돌렸어요.');}return;}
  if(action==='filter-location'){locationFilter=value;render();return;}
  if(action==='toggle-inventory-filters'){inventoryFiltersOpen=!inventoryFiltersOpen;render();app.querySelector('.mobile-filter-toggle')?.focus({preventScroll:true});return;}
  if(action==='clear-inventory-filters'){category='all';statusFilter='all';sort='priority';render();return;}
  if(action==='storage'){locationFilter=target.dataset.location;statusFilter='all';category='all';search='';return navigate('inventory');}
  if(action==='show-soon'||action==='show-check'){statusFilter=action==='show-soon'?'soon':'check';locationFilter='all';category='all';search='';return navigate('inventory');}
  if(action==='category'){category=value;render();return;}
  if(action==='recipe-filter'){recipeFilter=value;render();return;}
  if(action==='ingredient-recipes'){ingredientFilter=name;closeModal();return navigate('recipes');}
  if(action==='clear-ingredient'){ingredientFilter='';render();return;}
  if(action==='quick-food'){modal.querySelector('[name="name"]').value=name;autofillFood(name);return;}
  if(action==='delete-item')return confirmModal('이 재료를 삭제할까요?','선택한 구매 묶음만 삭제해요. 삭제 후 되돌릴 수 있어요.','confirm-delete',id,'삭제하기');
  if(action==='confirm-delete'){snapshot();state.items=state.items.filter(x=>x.id!==id);closeModal();return commit('재료를 삭제했어요.',true);}
  if(action==='start-real')return confirmModal('나만의 냉장고를 시작할까요?','샘플 재고와 장보기 목록을 비우고 시작해요. 설정은 유지되며 실제 재료를 직접 추가할 수 있어요.','confirm-real','','빈 냉장고로 시작');
  if(action==='confirm-real'){snapshot();state.demo=false;state.items=[];state.shopping=[];state.cooked=0;closeModal();page='inventory';location.hash=page;return commit('나만의 냉장고가 준비됐어요.',true);}
  if(action==='load-demo')return confirmModal('샘플 냉장고로 바꿀까요?','현재 재고와 장보기 목록을 샘플로 교체합니다. 먼저 데이터 백업을 권장해요. 변경 직후 되돌릴 수 있어요.','confirm-demo','','샘플로 교체');
  if(action==='confirm-demo'){snapshot();state.items=sampleItems();state.shopping=[];state.demo=true;closeModal();page='home';location.hash=page;return commit('샘플 냉장고를 불러왔어요.',true);}
  if(action==='recipe-shop') {
    const r=RECIPES.find(x=>x.id===id), evaluation=evaluateRecipe(r,state.items,state.settings);
    state.shopping=fillShopping(state.shopping,evaluation.missing.map(row=>({...row,qty:row.missing})));
    save();render();toast('부족한 재료를 장보기 목록에 담았어요.');return;
  }
  if(action==='remove-shop'){snapshot();state.shopping=state.shopping.filter(x=>x.id!==id);return commit('장보기 목록에서 삭제했어요.',true);}
  if(action==='purchase') {
    const item=state.shopping.find(x=>x.id===id);if(!item)return;
    const food=foodFor(item.name);addModal(null,{name:item.name,qty:item.qty,unit:item.unit,category:food?.category||'기타'});purchaseID=id;
    modal.querySelector('[data-action="photo-add"]')?.remove();return;
  }
  if(action==='export') {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`냉장고-백업-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
});
function autofillFood(name) {
  const food=foodFor(name), form=modal.querySelector('#ingredient-form');
  if(food&&form){form.elements.category.value=food.category;form.elements.unit.value=food.unit;if(food.unit==='g'&&form.elements.qty.value==='1')form.elements.qty.value=100;}
  updateEstimate();
}
document.addEventListener('input',ev=>{
  const el=ev.target;
  if(el.id==='inventory-search'||el.id==='recipe-search'){
    const start=el.selectionStart,end=el.selectionEnd,id=el.id;
    if(id==='inventory-search')search=el.value;else recipeSearch=el.value;
    render();const next=document.getElementById(id);next.focus();next.setSelectionRange(start,end);return;
  }
  if(el.closest('#ingredient-form'))updateEstimate();
});
document.addEventListener('change',async ev=>{
  const el=ev.target;
  if(el.id==='youtube-key-file'){
    const form=el.closest('form'),message=form.querySelector('#youtube-key-message'),file=el.files[0];if(!file)return;
    try {
      if(file.size>16384)throw new Error('설정 파일이 너무 커요. .env 또는 작은 텍스트 파일을 선택해 주세요.');
      const text=await file.text();
      const match=text.match(/^\s*YOUTUBE_API_KEY\s*=\s*["']?(AIza[A-Za-z0-9_-]{35})["']?\s*$/m);
      if(!match)throw new Error('파일에서 올바른 YouTube 키를 찾지 못했어요. 다른 키나 파일 내용은 가져오지 않았어요.');
      if(!form.isConnected)return;
      form.elements.key.value=match[1];message.textContent='YouTube 키만 입력란에 채웠어요. 보안 안내에 동의한 뒤 연결 버튼을 눌러주세요. 아직 저장하거나 전송하지 않았어요.';
    }catch(error){if(message.isConnected)message.textContent=error.message;}
    el.value='';return;
  }
  if(el.id==='backup-file'){
    const file=el.files[0];if(!file)return;
    try {
      if(file.size>2*1024*1024)throw new Error('백업 파일은 2MB 이하만 불러올 수 있어요.');
      pendingImport=validateBackup(JSON.parse(await file.text()));
      confirmModal('이 백업으로 교체할까요?',`현재 재고 ${state.items.length}개와 장보기 ${state.shopping.length}개를 백업의 재고 ${pendingImport.items.length}개·장보기 ${pendingImport.shopping.length}개 및 설정으로 교체해요. 변경 직후 되돌릴 수 있어요.`,'confirm-import','','확인하고 불러오기');
    }catch(error){pendingImport=null;toast(error instanceof SyntaxError?'JSON 백업 파일 형식이 올바르지 않아요. 기존 데이터는 유지했어요.':error.message);}
    el.value='';return;
  }
  if(el.id==='status-filter'){statusFilter=el.value;render();return;}
  if(el.id==='sort-filter'){sort=el.value;render();return;}
  if(el.id==='food-name'){autofillFood(el.value);return;}
  if(el.closest('#ingredient-form'))updateEstimate();
  if(el.dataset.setting) {
    if(el.dataset.setting==='staple')state.settings.staples[el.dataset.name]=el.checked;
    if(el.dataset.setting==='allergy')state.settings.allergies=[...document.querySelectorAll('[data-setting="allergy"]:checked')].map(x=>x.value);
    if(el.dataset.setting==='diet')state.settings.diet=el.value;
    save();toast('설정을 저장했어요.');
  }
});
document.addEventListener('submit',async ev=>{
  ev.preventDefault();const form=ev.target,f=new FormData(form);
  if(form.id==='youtube-key-form'){
    const message=form.querySelector('#youtube-key-message'),button=form.querySelector('button[type=submit]');
    if(!f.has('consent')){message.textContent='브라우저 전용 연결 안내를 확인하고 동의해 주세요.';return;}
    try {
      const key=String(f.get('key')||'').trim();if(key)YouTube.setKey(key);
      form.elements.key.value='';button.disabled=true;message.textContent='Google YouTube API에 직접 연결해 확인하고 있어요…';
      await YouTube.youtubeVideos('tofu');
      if(form.isConnected){render();toast('유튜브 연결을 확인했어요. 키는 현재 탭 세션에만 보관해요.');}
    }catch(error){if(message.isConnected)message.textContent=error.message;}
    finally{if(button.isConnected)button.disabled=false;}
    return;
  }
  if(form.id==='ingredient-form') {
    const x=readIngredient(form), error=form.querySelector('#form-error');
    x.name=canonicalName(x.name);
    if(!x.name){error.textContent='재료 이름을 입력해 주세요.';return;}
    if(!Number.isFinite(x.qty)||x.qty<=0){error.textContent='수량은 0보다 커야 해요.';return;}
    if(x.purchased>today()){error.textContent='구매일은 오늘 이후일 수 없어요.';return;}
    if(x.opened&&(x.openedAt<x.purchased||x.openedAt>today())){error.textContent='개봉일은 구매일부터 오늘 사이여야 해요.';return;}
    snapshot();const existing=state.items.findIndex(i=>i.id===x.id);
    if(existing>=0)state.items[existing]=x;else state.items.push(x);
    if(purchaseID)state.shopping=state.shopping.map(i=>i.id===purchaseID?{...i,done:true}:i);
    closeModal();commit(existing>=0?'재료 정보를 수정했어요.':'냉장고에 새 재료를 넣었어요.',true);return;
  }
  if(form.id==='use-form'||form.id==='cook-form') {
    const amounts=form.id==='use-form'?[{id:form.dataset.id,qty:Number(f.get('qty'))}]:[...f.entries()].map(([id,qty])=>({id,qty:Number(qty)}));
    try { const next=deduct(state.items,amounts);snapshot();state.items=next;if(form.id==='cook-form')state.cooked++;closeModal();commit('사용한 만큼 재고에 반영했어요.',true); }
    catch(err){form.querySelector('.form-error').textContent=err.message;}
    return;
  }
  if(form.id==='shopping-form') {
    const name=canonicalName(f.get('name')),qty=Number(f.get('qty'));
    if(!name||!Number.isFinite(qty)||qty<=0)return;
    state.shopping=mergeShopping(state.shopping,name,qty,f.get('unit'));commit('장보기 목록에 추가했어요.');return;
  }
  if(form.id==='staple-form') {
    const name=String(f.get('name')).trim();if(!name)return;
    state.settings.staples[name]=true;commit('기본 양념을 추가했어요.');return;
  }
  if(form.id==='exclusion-form'){state.settings.excluded=String(f.get('excluded')).trim();commit('제외할 재료를 저장했어요.');}
});
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(p!==page&&navs.some(x=>x[0]===p)){page=p;render();}});
window.addEventListener('storage',ev=>{if(ev.key===KEY&&!modal.open){state=load();render();toast('다른 탭의 변경 사항을 불러왔어요.');}});
const initial=location.hash.slice(1);if(navs.some(x=>x[0]===initial))page=initial;
render();
save();
})();
