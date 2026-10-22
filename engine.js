(() => {
'use strict';
const { STAPLES, CATEGORIES, foodFor, canonicalName, SOURCE, SUBSTITUTIONS, ALLERGENS } = window.FridgeData;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const addDays = (date, days) => new Date(Date.parse(date+'T00:00:00Z') + days*86400000).toISOString().slice(0,10);
const daysUntil = (date, now=today()) => date ? Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(now+'T00:00:00Z'))/86400000) : null;
const uid = () => {
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
};
const defaults = () => ({ staples:Object.fromEntries(STAPLES.map(x=>[x,true])), allergies:[], diet:'none', excluded:'' });
const normalize = s => canonicalName(s).replace(/\s+/g,'');
const fmt = n => Number(Number(n).toFixed(2)).toLocaleString('ko-KR');
function recommendation(item) {
  const food=foodFor(item.name);
  if (!food || !item.purchased || !item.conditions || item.movedAt) return null;
  let days, base=item.purchased;
  if(item.location==='frozen') {
    if(item.opened) return null;
    days=food.frozen;
  } else if(item.opened) {
    days=food.openedDays; base=item.openedAt;
  } else days=food.fridge;
  if(!days || !base) return null;
  return { date:addDays(base,days), days, source:SOURCE, condition:food.condition, sourceRow:food.sourceRow,
    quality:item.location==='frozen', note:item.location==='frozen'?'냉동 기간은 품질 기준이며 안전 기한이 아닙니다. 1개월을 30일로 환산했습니다.':'공공기관 범위의 짧은 기간을 적용한 추정입니다.' };
}
function dateInfo(item) {
  const rec=recommendation(item);
  const dates=[];
  if(item.hasDate && item.labelDate) dates.push({date:item.labelDate, kind:item.labelType||'소비기한', source:'제품 표시'});
  if(rec) dates.push({...rec, kind:rec.quality?'권장 품질 시점':'권장 소비 시점', source:'앱 추정'});
  if(item.customDate) dates.push({date:item.customDate, kind:'직접 정한 소비 목표', source:'사용자 설정'});
  return dates.sort((a,b)=>a.date.localeCompare(b.date))[0] || null;
}
function status(item, now=today()) {
  const info=dateInfo(item), left=daysUntil(info?.date,now);
  const uncertain=item.suspect || item.dateUncertain || item.openingUncertain || (item.movedAt && !item.storageConfirmed) || (item.hasDate && ['유통기한','품질유지기한'].includes(item.labelType)) || (item.opened && !recommendation(item) && !item.openedLabelConfirmed) || !info || (info.source==='사용자 설정' && !recommendation(item) && !item.hasDate);
  if(item.suspect) return { type:'check', left, label:'변질 의심', reason:'레시피 추천에서 제외했어요', info };
  if(left!==null && left<0) return {type:'check',left,label:info?.kind==='소비기한'?'소비기한 경과':'상태 확인 필요',reason:`${info?.kind} ${Math.abs(left)}일 경과 · 추천 제외`,info};
  if(uncertain) return {type:'check',left,label:'확인 필요',reason:item.dateUncertain?'제품 표시 날짜 확인 필요':item.openingUncertain?'개봉 상태 확인 필요':item.movedAt?'보관 이동 후 적용 조건 확인':!info?'권장 기간을 확인할 수 없어요':'개봉·표시 날짜의 적용 조건 확인',info};
  return {type:left<=3?'soon':'good',left,label:left===0?'오늘까지':left<=3?`D-${left}`:`${left}일 남음`,reason:item.opened?'개봉한 재료 · 먼저 사용해요':`${info.kind}까지 ${left===0?'오늘':left+'일'}`,info};
}
function priority(a,b) {
  const sa=status(a),sb=status(b);
  return (sa.left??999)-(sb.left??999) || Number(b.opened)-Number(a.opened) || ({수산물:0,육류:1,유제품:2,채소:3}[a.category]??5)-({수산물:0,육류:1,유제품:2,채소:3}[b.category]??5) || a.purchased.localeCompare(b.purchased);
}
const usable = items => items.filter(x=>x.qty>0 && status(x).type!=='check');
function convert(qty, from, to) {
  if(from===to) return qty;
  const units={g:['mass',1],kg:['mass',1000],ml:['volume',1],l:['volume',1000],'큰술':['spoon',3],'작은술':['spoon',1]};
  return units[from] && units[to] && units[from][0]===units[to][0] ? qty*units[from][1]/units[to][1] : null;
}
const available = (items,name,unit) => usable(items).filter(x=>normalize(x.name)===normalize(name)).reduce((sum,x)=>sum+(convert(x.qty,x.unit,unit)??0),0);
function blocked(name, settings) {
  if(settings.allergies.some(a=>(ALLERGENS[a]||[]).includes(name))) return true;
  if(settings.excluded.split(/[,，\n]/).map(normalize).filter(Boolean).includes(normalize(name))) return true;
  const category=foodFor(name)?.category;
  return settings.diet==='vegetarian' && ['육류','수산물'].includes(category) || settings.diet==='vegan' && ['육류','수산물','유제품','달걀'].includes(category) || settings.diet==='vegan' && name==='꿀';
}
function evaluateRecipe(recipe, items, settings) {
  const reserved=[];
  const free=(name,unit)=>Math.max(0,available(items,name,unit)-reserved.filter(x=>x.name===name).reduce((s,x)=>s+(convert(x.qty,x.unit,unit)??0),0));
  // Reserve original ingredients first so a substitute cannot consume another required ingredient.
  const rows=recipe.ingredients.map(ing=>{
    const staple=settings.staples[ing.name]===true;
    const have=staple?ing.qty:Math.min(ing.qty,free(ing.name,ing.unit));
    if(!staple && have) reserved.push({...ing,qty:have});
    return {...ing,staple,have,missing:Math.max(0,ing.qty-have),blocked:blocked(ing.name,settings)};
  });
  for(const row of rows) {
    if(!row.missing || row.blocked) continue;
    const substitute=(SUBSTITUTIONS[`${recipe.id}:${row.name}`]||[]).find(s=>!blocked(s.name,settings) && free(s.name,s.unit)>=row.missing*s.ratio);
    if(substitute) {
      row.substitute={...substitute,qty:row.missing*substitute.ratio};
      reserved.push({name:substitute.name,qty:row.substitute.qty,unit:substitute.unit});
    }
  }
  const urgent=new Set(usable(items).filter(x=>status(x).type==='soon').map(x=>x.name));
  const urgentNames=[...new Set(rows.flatMap(r=>[r.have>0?r.name:null,r.substitute?.name]).filter(n=>urgent.has(n)))];
  const missing=rows.filter(r=>r.missing>0&&!r.substitute);
  const blockedRecipe=rows.some(r=>r.blocked);
  return {rows,urgentNames,missing,blocked:blockedRecipe,score:urgentNames.length*100+(missing.length===0?40:0)-missing.length*8,matched:rows.filter(r=>r.have>=r.qty||r.substitute).length};
}
function planUsage(evaluation, items) {
  const demands=[];
  for(const row of evaluation.rows) {
    if(!row.staple && row.have>0) demands.push({name:row.name,qty:row.have,unit:row.unit});
    if(row.substitute) demands.push(row.substitute);
  }
  const remaining=Object.fromEntries(items.map(x=>[x.id,x.qty]));
  const amounts={};
  for(const d of demands) {
    let needed=d.qty;
    for(const item of usable(items).filter(x=>x.name===d.name).sort(priority)) {
      const capacity=convert(remaining[item.id],item.unit,d.unit);
      if(capacity===null) continue;
      const taken=Math.min(needed,capacity), own=convert(taken,d.unit,item.unit);
      amounts[item.id]=(amounts[item.id]||0)+own;
      remaining[item.id]-=own; needed-=taken;
      if(needed<=0.00001) break;
    }
  }
  return Object.entries(amounts).filter(([,qty])=>qty>0).map(([id,qty])=>({id,qty:Number(qty.toFixed(4))}));
}
function deduct(items, amounts) {
  const totals={};
  for(const x of amounts) {
    if(!Number.isFinite(x.qty)||x.qty<0) throw new Error('사용량은 0 이상의 숫자여야 해요.');
    totals[x.id]=(totals[x.id]||0)+x.qty;
  }
  for(const [id,qty] of Object.entries(totals)) {
    const item=items.find(x=>x.id===id);
    if(!item || qty>item.qty+0.00001) throw new Error('사용량이 현재 재고보다 많아요.');
  }
  return items.map(x=>({...x,qty:Number(Math.max(0,x.qty-(totals[x.id]||0)).toFixed(4))})).filter(x=>x.qty>0);
}
function mergeShopping(list, name, qty, unit) {
  const found=list.find(x=>normalize(x.name)===normalize(name)&&!x.done&&convert(qty,unit,x.unit)!==null);
  return found?list.map(x=>x===found?{...x,qty:Number((x.qty+convert(qty,unit,x.unit)).toFixed(4))}:x):[...list,{id:uid(),name,qty,unit,done:false}];
}
function fillShopping(list, demands) {
  let result=list;
  for(const demand of demands) {
    const planned=result.filter(x=>normalize(x.name)===normalize(demand.name)&&!x.done).reduce((sum,x)=>sum+(convert(x.qty,x.unit,demand.unit)??0),0);
    if(demand.qty>planned+0.00001)result=mergeShopping(result,demand.name,demand.qty-planned,demand.unit);
  }
  return result;
}
function sampleItems() {
  const d=today();
  const make=(name,qty,unit,offset,location='fridge')=>({id:uid(),name,qty,unit,category:foodFor(name)?.category||'기타',location,purchased:addDays(d,-3),hasDate:true,labelDate:addDays(d,offset),labelType:'소비기한',opened:false,conditions:true,notes:'샘플 데이터 · 실제 보유 재료가 아닙니다.'});
  return [make('두부',300,'g',1),make('달걀',6,'개',2),make('애호박',1,'개',3),make('시금치',200,'g',2),make('당근',2,'개',8),make('양파',2,'개',9),make('대파',1,'개',5),make('닭고기',500,'g',25,'frozen'),make('밥',600,'g',20,'frozen'),make('마늘',10,'개',12)];
}

function validateBackup(input) {
  const fail=()=>{throw new Error('올바른 냉장고 백업 파일이 아니에요. 기존 데이터는 변경하지 않았어요.');};
  if(!input||input.version!==1||!Array.isArray(input.items)||!Array.isArray(input.shopping)||input.items.length>5000||input.shopping.length>5000)fail();
  const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail();return value.trim();};
  const date=value=>{
    if(!value)return '';
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail();
    const parsed=new Date(value+'T00:00:00Z');
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail();
    return value;
  };
  const quantity=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1000000)fail();return value;};
  const units=['개','g','kg','ml','l','팩','봉','큰술','작은술'];
  const items=input.items.map(raw=>{
    if(!raw||typeof raw!=='object'||!['fridge','frozen'].includes(raw.location)||!units.includes(raw.unit))fail();
    const purchased=date(raw.purchased);if(!purchased)fail();
    const item={id:uid(),name:canonicalName(text(raw.name,40,true)),qty:quantity(raw.qty),unit:raw.unit,category:CATEGORIES.includes(raw.category)?raw.category:'기타',location:raw.location,purchased,notes:text(raw.notes??'',500)};
    for(const key of ['labelDate','openedAt','customDate','movedAt'])item[key]=date(raw[key]);
    for(const key of ['hasDate','opened','conditions','suspect','storageConfirmed','openedLabelConfirmed','dateUncertain','openingUncertain'])item[key]=raw[key]===true;
    item.labelType=['소비기한','유통기한','품질유지기한'].includes(raw.labelType)?raw.labelType:'소비기한';
    if(item.hasDate&&!['소비기한','유통기한','품질유지기한'].includes(raw.labelType))fail();
    if(item.hasDate&&!item.labelDate)fail();
    if(item.opened&&(!item.openedAt||item.openedAt<item.purchased))fail();
    item.source=raw.source==='photo'?'photo':'manual';
    return item;
  });
  const shopping=input.shopping.map(raw=>{
    if(!raw||!units.includes(raw.unit))fail();
    return {id:uid(),name:canonicalName(text(raw.name,40,true)),qty:quantity(raw.qty),unit:raw.unit,done:raw.done===true};
  });
  const settings=defaults(),s=input.settings;
  if(s&&typeof s==='object'){
    if(s.staples&&typeof s.staples==='object'){
      const entries=Object.entries(s.staples);if(entries.length>100)fail();
      for(const [name,on] of entries){if(['__proto__','constructor','prototype'].includes(name)||typeof on!=='boolean')fail();settings.staples[text(name,30,true)]=on;}
    }
    if(s.allergies!==undefined){if(!Array.isArray(s.allergies))fail();settings.allergies=[...new Set(s.allergies.filter(x=>Object.hasOwn(ALLERGENS,x)))];}
    settings.diet=['none','vegetarian','vegan'].includes(s.diet)?s.diet:'none';
    settings.excluded=text(s.excluded??'',200);
  }
  return {version:1,demo:input.demo===true,items,shopping,settings,cooked:Number.isInteger(input.cooked)&&input.cooked>=0?input.cooked:0};
}
window.FridgeEngine=Object.freeze({today,addDays,daysUntil,uid,defaults,normalize,fmt,recommendation,dateInfo,status,priority,usable,convert,available,blocked,evaluateRecipe,planUsage,deduct,mergeShopping,fillShopping,sampleItems,validateBackup});
})();
