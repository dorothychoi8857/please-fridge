(() => {
'use strict';
const CATEGORIES = ['채소', '과일', '육류', '수산물', '유제품', '달걀', '가공식품', '기타'];
const STAPLES = ['소금', '설탕', '간장', '식용유', '참기름', '식초', '후추', '고춧가루', '고추장', '된장'];
const SOURCE = 'https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-food-storage.html';
// Health Canada, Safe food storage (2024-04-11). Use the lower end of published ranges.
// Frozen storage durations describe quality, not a safety deadline.
const FOODS = [
  { name:'당근', emoji:'🥕', category:'채소', unit:'개', fridge:14, frozen:300, condition:'통째로 신선한 상태로 구매해 냉장 4°C 이하 보관', sourceRow:'Carrots: 2 weeks / 10–12 months' },
  { name:'애호박', emoji:'🥒', category:'채소', unit:'개', fridge:7, frozen:300, condition:'신선한 여름 호박류, 냉장 4°C 이하 보관', sourceRow:'Summer squash: 1 week / 10–12 months' },
  { name:'시금치', emoji:'🥬', category:'채소', unit:'g', fridge:14, frozen:300, condition:'신선한 시금치, 냉장 4°C 이하 보관', sourceRow:'Spinach: 2–4 weeks / 10–12 months' },
  { name:'상추', emoji:'🥬', category:'채소', unit:'g', fridge:3, condition:'신선한 잎상추, 냉장 4°C 이하 보관', sourceRow:'Leaf lettuce: 3–7 days' },
  { name:'달걀', emoji:'🥚', category:'달걀', unit:'개', fridge:21, condition:'깨지지 않은 껍데기 있는 생달걀, 냉장 4°C 이하 보관', sourceRow:'Fresh in shell: 3–4 weeks; do not freeze' },
  { name:'닭고기', emoji:'🍗', category:'육류', unit:'g', fridge:2, frozen:180, condition:'조리하지 않은 닭고기 조각, 밀폐해 냉장 4°C 이하 보관', sourceRow:'Chicken pieces: 2–3 days / 6 months' },
  { name:'소고기', emoji:'🥩', category:'육류', unit:'g', fridge:2, frozen:300, condition:'다지지 않은 생소고기, 밀폐해 냉장 4°C 이하 보관', sourceRow:'Beef: 2–4 days / 10–12 months' },
  { name:'돼지고기', emoji:'🥩', category:'육류', unit:'g', fridge:2, frozen:240, condition:'다지지 않은 생돼지고기, 밀폐해 냉장 4°C 이하 보관', sourceRow:'Pork: 2–4 days / 8–12 months' },
  { name:'연어', emoji:'🐟', category:'수산물', unit:'g', fridge:3, frozen:60, condition:'신선한 생연어, 밀폐해 냉장 4°C 이하 보관', sourceRow:'Fatty fish: 3–4 days / 2 months' },
  { name:'새우', emoji:'🦐', category:'수산물', unit:'g', fridge:1, frozen:60, condition:'신선한 새우, 밀폐해 냉장 4°C 이하 보관', sourceRow:'Shrimp: 1–2 days / 2–4 months' },
  { name:'우유', emoji:'🥛', category:'유제품', unit:'ml', openedDays:3, condition:'개봉한 우유, 냉장 4°C 이하 보관. 미개봉은 제품 표시 확인', sourceRow:'Opened milk: 3 days' },
  { name:'요거트', emoji:'🥛', category:'유제품', unit:'g', openedDays:3, condition:'개봉한 요거트, 냉장 4°C 이하 보관. 미개봉은 제품 표시 확인', sourceRow:'Opened yogurt: 3 days' },
  { name:'두부', emoji:'🧊', category:'가공식품', unit:'g' },
  { name:'양파', emoji:'🧅', category:'채소', unit:'개' },
  { name:'대파', emoji:'🌱', category:'채소', unit:'개' },
  { name:'마늘', emoji:'🧄', category:'채소', unit:'개' },
  { name:'밥', emoji:'🍚', category:'가공식품', unit:'g' },
  { name:'밀가루', emoji:'🌾', category:'가공식품', unit:'g' },
  { name:'감자', emoji:'🥔', category:'채소', unit:'개' },
  { name:'브로콜리', emoji:'🥦', category:'채소', unit:'g' },
  { name:'버터', emoji:'🧈', category:'유제품', unit:'g' },
];
const ALIASES = { '계란':'달걀', '닭가슴살':'닭고기', '닭다리살':'닭고기', '쇠고기':'소고기' };
const canonicalName = name => {
  const text=String(name||'').trim();
  return Object.hasOwn(ALIASES,text)?ALIASES[text]:text;
};
const foodFor = name => FOODS.find(x => x.name === canonicalName(name));
const emojiFor = name => foodFor(name)?.emoji || '🥣';
const i = (name, qty, unit) => ({ name, qty, unit });
const RECIPES = [
  { id:'tofu', name:'고소한 두부 달걀 볶음', subtitle:'부드러운 두부와 달걀의 든든한 만남', time:15, level:'아주 쉬움', servings:2, image:'tofu', tone:'peach', tag:'가볍고 든든하게',
    ingredients:[i('두부',300,'g'),i('달걀',2,'개'),i('당근',0.5,'개'),i('대파',0.5,'개'),i('간장',1,'큰술'),i('참기름',1,'작은술'),i('식용유',1,'큰술'),i('소금',0.25,'작은술')],
    steps:['두부는 물기를 빼고 으깨 주세요. 당근과 대파는 잘게 썰어요.','팬에 식용유를 두르고 대파와 당근을 먼저 볶아요.','두부를 넣고 수분을 날리며 볶은 뒤, 푼 달걀을 넣어요.','달걀이 완전히 익을 때까지 볶고 간장, 소금으로 간해요. 참기름으로 마무리해요.'] },
  { id:'chicken', name:'한 그릇 간장 닭고기 덮밥', subtitle:'달짝지근한 간장 소스를 입힌 한 그릇', time:25, level:'쉬움', servings:2, image:'chicken', tone:'green', tag:'든든한 한 끼',
    ingredients:[i('닭고기',300,'g'),i('양파',1,'개'),i('밥',400,'g'),i('간장',2,'큰술'),i('설탕',1,'큰술'),i('식용유',1,'큰술'),i('후추',0.1,'작은술')],
    steps:['냉동 닭고기는 냉장실에서 완전히 해동하세요. 생고기용 도마를 따로 사용해 한 입 크기로 썰어요.','양파를 채 썰고 간장, 설탕, 물 4큰술을 섞어요.','팬에 식용유를 두르고 닭고기를 볶다가 양파와 소스를 넣어요.','닭고기 중심 온도가 74°C 이상이 되도록 충분히 익혀요. 따뜻한 밥 위에 올리고 후추를 뿌려요.'] },
  { id:'pancake', name:'노릇노릇 애호박 달걀전', subtitle:'냉장고 속 채소로 간단하게 부치는 전', time:20, level:'쉬움', servings:2, image:'pancake', tone:'yellow', tag:'바삭한 한 입',
    ingredients:[i('애호박',1,'개'),i('달걀',2,'개'),i('밀가루',50,'g'),i('소금',0.25,'작은술'),i('식용유',2,'큰술')],
    steps:['애호박을 0.5cm 두께로 썰고 소금을 조금 뿌려요.','표면의 물기를 닦고 밀가루를 얇게 묻혀요.','푼 달걀에 애호박을 담근 뒤 기름을 두른 팬에 올려요.','중약불에서 앞뒤로 뒤집으며 달걀과 속까지 완전히 익혀요.'] },
  { id:'rice', name:'냉장고 비우는 채소 볶음밥', subtitle:'자투리 채소도 맛있는 한 끼가 되니까', time:15, level:'아주 쉬움', servings:2, image:'rice', tone:'peach', tag:'자투리 재료 활용',
    ingredients:[i('밥',400,'g'),i('당근',0.5,'개'),i('양파',0.5,'개'),i('달걀',2,'개'),i('간장',1,'큰술'),i('식용유',1,'큰술'),i('참기름',1,'작은술')],
    steps:['당근과 양파를 잘게 썰어요. 냉동 밥은 충분히 데워 준비해요.','기름을 두른 팬에 당근과 양파를 볶아요.','달걀을 넣고 완전히 익힌 뒤 밥을 넣어 골고루 볶아요.','간장으로 간하고 전체가 김이 날 정도로 충분히 가열해요. 참기름으로 마무리해요.'] },
  { id:'spinach', name:'초록 가득 시금치 달걀볶음', subtitle:'시금치를 맛있게 먹는 가장 쉬운 방법', time:10, level:'아주 쉬움', servings:2, image:'spinach', tone:'green', tag:'10분 완성',
    ingredients:[i('시금치',150,'g'),i('달걀',3,'개'),i('마늘',2,'개'),i('식용유',1,'큰술'),i('소금',0.25,'작은술'),i('참기름',1,'작은술')],
    steps:['시금치는 흐르는 물에 깨끗하게 씻고, 마늘은 얇게 썰어요.','기름을 두른 팬에 마늘을 살짝 볶아요.','시금치를 넣어 숨을 죽인 뒤 푼 달걀을 넣어요.','달걀이 완전히 익을 때까지 볶고 소금과 참기름으로 마무리해요.'] },
  { id:'soup', name:'보글보글 두부 된장국', subtitle:'자극적이지 않고 편안한 집밥 한 상', time:20, level:'쉬움', servings:2, image:'soup', tone:'yellow', tag:'따뜻한 집밥',
    ingredients:[i('두부',150,'g'),i('애호박',0.5,'개'),i('양파',0.5,'개'),i('된장',1.5,'큰술'),i('고춧가루',0.5,'작은술')],
    steps:['두부와 애호박, 양파를 한 입 크기로 썰어요.','냄비에 물 500ml를 붓고 된장을 풀어 끓여요.','양파와 애호박을 넣고 5분 정도 끓여요.','두부와 고춧가루를 넣고 채소가 충분히 익을 때까지 끓여요. 된장 염도에 맞춰 물을 조절하세요.'] },
];
const SUBSTITUTIONS = {
  'pancake:애호박': [{ name:'당근', ratio:1, unit:'개', note:'1개 대신 당근 1개. 단맛이 더 나고 식감이 단단해요. 얇게 채 썰고 밀가루·달걀과 섞어 작은 채소전으로 부쳐요.' }],
  'tofu:대파': [{ name:'양파', ratio:0.5, unit:'개', note:'대파 1개 대신 양파 1/2개. 파 향 대신 단맛이 나요. 잘게 썰어 당근과 먼저 볶으세요.' }],
  'rice:양파': [{ name:'애호박', ratio:1, unit:'개', note:'양파와 같은 개수로 대체해요. 단맛은 줄고 수분은 늘어요. 잘게 썰어 수분을 충분히 볶아 날려 주세요.' }],
  'chicken:양파': [{ name:'대파', ratio:1, unit:'개', note:'양파 1개 대신 대파 1개. 단맛이 줄고 파 향이 더해져요. 큼직하게 썰어 닭고기와 함께 익히세요.' }],
};
const ALLERGENS = {
  '달걀':['달걀'], '우유':['우유','요거트','버터'], '대두':['두부','간장','된장','고추장'],
  '밀':['밀가루','간장','고추장','된장'], '새우':['새우'], '생선':['연어'], '참깨':['참기름'],
};
window.FridgeData=Object.freeze({CATEGORIES,STAPLES,SOURCE,FOODS,canonicalName,foodFor,emojiFor,RECIPES,SUBSTITUTIONS,ALLERGENS});
})();
