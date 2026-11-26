import {storageKey, statuses, originalOrder, emptyInfo, emptyState, validateState, localDate, calculate, csv} from './state.js';

const main = document.querySelector('main');
const navigation = document.querySelector('#navigation');
const notice = document.querySelector('#notice');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shortDate = date => date.slice(5).replace(/^0/,'').replace('-','/').replace(/\/0/,'/');
const money = value => '¥' + value.toLocaleString('zh-CN',{maximumFractionDigits:2});
const week = ['周六','周日','周一','周二','周三'];
const weekName = ['星期六','星期日','星期一','星期二','星期三'];
const two = value => String(value).padStart(2,'0');
const ferrySite = 'https://www.xmferry.com/';
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-4v-7H8v7H4a1 1 0 0 1-1-1z"/>',
  itinerary:'<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4m9-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
  food:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18m12 0V3c-4 2-5 5-5 10h5"/>',
  user:'<circle cx="12" cy="7.5" r="3.5"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
  heart:'<path d="M20.8 5.8a5 5 0 0 0-7 0L12 7.6l-1.8-1.8a5 5 0 0 0-7 7L12 22l8.8-9.2a5 5 0 0 0 0-7Z"/>',
  pin:'<path d="M19.5 10c0 5-7.5 11-7.5 11s-7.5-6-7.5-11a7.5 7.5 0 1 1 15 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  check:'<path d="m5 12 4.5 4.5L19 7"/>',
  camera:'<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M4 6 17 3v3m4 5h-5a2 2 0 0 0 0 4h5"/>',
  bag:'<path d="M5 8h14l2 13H3zM9 9V6a3 3 0 0 1 6 0v3"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  train:'<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 11h14M8 18l-2 3m10-3 2 3m-9-6h.01m6 0h.01"/>',
  ferry:'<path d="M3 13h18l-3 5H6zm4 0V7h10v6M9 7V4h6v3M2 21c3 0 3-1 5-1s3 1 5 1 3-1 5-1 3 1 5 1"/>',
  swap:'<path d="M4 7h16m-4-4 4 4-4 4m4 6H4m4-4-4 4 4 4"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  wifi:'<path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 3h.01"/>',
  spark:'<path d="M12 2c1 7 3 9 10 10-7 1-9 3-10 10-1-7-3-9-10-10 7-1 9-3 10-10Z"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  list:'<path d="M10 6h10m-10 6h10m-10 6h10M4 6h1m-1 6h1m-1 6h1"/>'
};
const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
const statusLabels = {places:'景点',food:'美食'};
let data;
let state;
let current;
let loadedOffline = false;
let storageFailure = false;
let noticeTimer;
let ui = {foodGroup:'全部',foodDay:'all',foodMode:'all',foodQuery:'',mapFilter:'all',mapId:'',budgetDay:'all',editExpense:'',timeline:'core'};

const button = (text, action, value = '', css = 'secondary', symbol = '', extra = '') =>
  '<button type="button" class="button '+css+'" data-action="'+action+'" data-value="'+escape(value)+'" '+extra+'>' + (symbol ? icon(symbol) : '') + text + '</button>';
const link = (text, href, css = 'secondary', symbol = '') =>
  '<a class="button '+css+'" href="'+escape(href)+'">'+(symbol ? icon(symbol) : '')+text+'</a>';
const external = (text, url, css = 'secondary', symbol = '') =>
  '<a class="button '+css+'" href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">'+(symbol ? icon(symbol) : '')+text+'</a>';
const heading = (title, intro = '', back = false) =>
  '<header class="page-heading">'+(back ? link('我的','#me','text') : '')+'<h1>'+title+'</h1>'+(intro ? '<p>'+intro+'</p>':'')+'</header>';
const section = (title, extra = '') => '<div class="section-heading"><h2>'+title+'</h2>'+extra+'</div>';
const empty = text => '<p class="empty">'+text+'</p>';
const option = (value, label, selected = '') => '<option value="'+escape(value)+'"'+(value===selected?' selected':'')+'>'+escape(label)+'</option>';
const chip = (text, value, active, action) => button(text,action,value,active?'chip active':'chip','', 'aria-pressed="'+active+'"');
const flag = (text, kind = '') => '<span class="badge '+kind+'">'+escape(text)+'</span>';
const progress = (count,max,label) => '<progress max="'+Math.max(max,1)+'" value="'+count+'" aria-label="'+escape(label)+'"></progress>';
const detail = (key,title,body,css='') => '<details class="'+css+'" data-detail="'+escape(key)+'"><summary>'+title+'</summary><div class="detail-body">'+body+'</div></details>';

function showNotice(text) {
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; },3600);
}

function persist(next) {
  try {
    localStorage.setItem(storageKey,JSON.stringify(next));
    state = next;
    storageFailure = false;
    return true;
  } catch {
    showNotice('保存失败。请检查 Safari 存储空间或站点设置。');
    return false;
  }
}

function mutate(update) {
  const next = JSON.parse(JSON.stringify(state));
  update(next);
  if (!validateState(next,data)) {
    showNotice('这条记录未保存，请检查内容或金额。');
    return false;
  }
  return persist(next);
}

function startRoute() {
  const idx = data.itinerary.dates.indexOf(localDate());
  return {page:idx < 0 ? 'home' : 'trip',day:idx < 0 ? 0 : idx};
}

function route() {
  const [page, index] = location.hash.slice(1).split('/');
  const day = /^[0-4]$/.test(index ?? '') ? Number(index) : null;
  if (page === 'trip') return {page,day:day ?? startRoute().day};
  if (page === 'map') return {page,day};
  if (['home','food','me','budget','stats','photos','gifts','backup','info','adjust','records','offline','custom'].includes(page)) return {page,day:null};
  return startRoute();
}

function moduleAt(day) {
  const module = data.modules.get(['arrival',...state.order,'departure'][day]);
  if (module.id !== 'gulangyu' || state.info.ferryArrival !== 'sanqiutian') return module;
  return {...module,...module.eastArrival,reminders:[...module.eastArrival.reminders,...module.reminders]};
}

function dayTitle(day) {
  const module = moduleAt(day);
  return day === 2 ? module.title : module.swapTitle ?? module.title;
}

function places() {
  return [...data.places,...state.customPlaces.map(item => ({...item,kind:'自定义',region:item.region || '厦门'}))];
}

function place(id) {
  const item = data.placeById.get(id) ?? places().find(item => item.id === id);
  if (id === 'stay') return {...item,name:state.info.hotel || item.name,address:state.info.address};
  return item;
}

function foods() {
  return [...data.food,...state.customFood.map(item => ({
    ...item, kind:'自定义',group:'我的收藏',priority:'顺路',moduleIds:item.moduleId?[item.moduleId]:[],
    placeIds:[],verification:{status:'待确认',note:'来自你的本地记录。'}
  }))];
}

function checkState(type,id) {
  return state[type][id] ?? {status:'pending',favorite:false};
}
function photoState(id) {
  return state.photos[id] ?? {favorite:false,taken:false,notes:''};
}

const unique = values => [...new Set(values)];
const normalFood = item => item.priority !== '低优先级';
function dayFood(day) {
  const module = moduleAt(day);
  return foods().filter(item => normalFood(item) && (
    item.group === '纪念日晚餐' ? day === 2 : item.moduleIds.includes(module.id)
  ));
}

function dayProgress(day) {
  const module = moduleAt(day);
  const rows = unique([
    ...module.itinerary.filter(item => item.priority !== '交通').map(item => item.id),
    ...state.customPlaces.filter(item => item.moduleId===module.id).map(item => item.id)
  ]);
  return [rows.filter(id => checkState('places',id).status==='done').length,rows.length];
}

function tripProgress() {
  const ids = unique([...data.itinerary.modules.flatMap(item => item.itinerary.filter(row => row.priority !== '交通').map(row => row.id)),
    ...state.customPlaces.filter(item => item.moduleId).map(item => item.id)]);
  return [ids.filter(id => checkState('places',id).status==='done').length,ids.length];
}

function verification(item) {
  const record = item.verification;
  if (!record) return '<p class="fine">位置按地点关键词搜索，开放情况出发前核实。</p>';
  return '<p class="fine"><strong>'+escape(record.status)+'</strong> · '+escape(record.note)+
    (record.checkedOn?' <time>'+escape(record.checkedOn)+'</time>':'')+'</p>'+
    (record.source ? external('查看核实来源',record.source,'text') : '');
}

function mapLinks(item) {
  if (item.id === 'stay' && !state.info.hotel && !state.info.address) return link('填写住宿信息','#info','secondary','pin');
  if (item.kind === '随缘' && !item.address) return '';
  const keyword = item.keyword || [item.id==='stay'&&!state.info.hotel?'':item.name,item.address||item.region].filter(Boolean).join(' ');
  const amap = new URL('https://uri.amap.com/search');
  amap.search = new URLSearchParams({keyword,city:'厦门',view:'list'});
  const apple = new URL('https://maps.apple.com/');
  apple.search = new URLSearchParams({q:keyword+' 厦门'});
  return '<div class="actions map-links">'+external('高德地图',amap,'primary','pin')+
    external('Apple 地图',apple)+button(item.address?'复制地址':'复制搜索词','copy',item.address||keyword)+'</div>';
}

function travelInfo(id) {
  const {arrivalTime,arrivalService,departureTime,departureService,address} = state.info;
  if (id === 'xiamen-station' && (arrivalTime||arrivalService))
    return '<p class="local-info">我的抵达 '+escape([arrivalTime,arrivalService].filter(Boolean).join(' · '))+'</p>';
  if (id === 'xiamen-north' && (departureTime||departureService)) {
    const [h,m] = departureTime.split(':').map(Number);
    const cutoff = (h*60+m+1380)%1440;
    return '<p class="local-info">我的返程 '+escape([departureTime,departureService].filter(Boolean).join(' · '))+
      (departureTime?' · 建议'+(h===0?'前一晚 ':' ')+two(Math.floor(cutoff/60))+':'+two(cutoff%60)+' 前到站':'')+'</p>';
  }
  if (id === 'stay' && address) return '<p class="local-info">'+escape(address)+'</p>';
  return '';
}

function tabs(active,withAll=false) {
  return '<nav class="date-tabs" aria-label="行程日期">'+(withAll?'<a href="#map"'+(active===null?' aria-current="page"':'')+'><strong>全部</strong><span>总览</span></a>':'')+
    data.itinerary.dates.map((date,i) => '<a href="#'+(withAll?'map':'trip')+'/'+i+'"'+(i===active?' aria-current="page"':'')+
      '><strong>'+shortDate(date)+'</strong><span>'+ (i===2?'纪念日':week[i])+'</span></a>').join('')+'</nav>';
}

function home() {
  const [done,total] = tripProgress();
  const today = startRoute();
  const spent = calculate(state.expenses);
  const budgetLabel = state.total===null ? '实际支出' : '预算使用';
  const budgetAmount = state.total===null ? money(spent) : money(spent)+' / '+money(state.total);
  const attrs = i => ' class="day-tile '+(i===2?'anniversary':'')+'" href="#trip/'+i+'"';
  return '<section class="hero"><img class="hero-photo" src="./assets/images/cover.webp" alt="厦门海滨实景" fetchpriority="high"><div class="hero-content">'+
    '<p class="eyebrow">OUR FIRST ANNIVERSARY · XIAMEN</p><h1 aria-label="与海相约 · 厦门纪行">与海相约<span>厦门纪行</span></h1>'+
    '<p class="hero-dates">2026.11.28 — 12.02 <span>5 天 4 晚 · 2 人</span></p>'+
    link(today.page==='trip'?'查看今天':'打开行程','#trip/'+today.day,'hero-button','itinerary')+'</div></section>'+
    '<div class="anniversary-strip">'+icon('heart')+'<span><strong>11月30日 · 一周年纪念日</strong><small>这个日子留给我们</small></span>'+link('查看当天','#trip/2','text')+'</div>'+
    '<div class="quick-summary"><a href="#stats" class="summary-card">'+icon('check')+'<div><span>景点打卡</span><strong>'+done+' / '+total+'</strong></div></a>'+
    '<a href="#budget" class="summary-card">'+icon('wallet')+'<div><span>'+budgetLabel+'</span><strong>'+budgetAmount+'</strong></div></a></div>'+
    '<section class="home-days">'+section('五天行程',link('总地图','#map','text','map'))+
    '<div class="day-grid">'+data.itinerary.dates.map((date,i) => {
      const module = moduleAt(i);
      return '<a'+attrs(i)+'><img loading="lazy" alt="" src="./assets/images/'+module.accent+'.webp"><div><span class="tile-date">DAY '+two(i+1)+' <i></i> '+shortDate(date)+' '+week[i]+'</span><h3>'+dayTitle(i)+'</h3><p>'+escape(module.area)+'</p></div>'+icon('chevron')+'</a>';
    }).join('')+'</div></section>'+
    '<div class="actions home-actions">'+link('住宿与交通','#info','secondary','train')+link('离线准备','#offline','secondary','wifi')+'</div>'+
    '<footer class="credits">'+external('实景照片与授权','./credits.html','text')+'</footer>';
}

function timelineRows(day) {
  const module = moduleAt(day);
  return [...module.itinerary, ...state.customPlaces.filter(item => item.moduleId===module.id).map(item => ({
    id:item.id,time:'自由安排',duration:'按现场情况',priority:'可选'
  }))];
}

function dayView(day) {
  const module = moduleAt(day);
  const full = timelineRows(day);
  const [done,total] = dayProgress(day);
  const shown = full.filter(row => ui.timeline==='all' || row.priority==='核心' || row.priority==='交通');
  const mainRoute = module.route.filter(id => id !== 'stay' && place(id).kind==='景点');
  const keyRoute = mainRoute.length ? mainRoute.filter(id => full.some(row => row.id===id && row.priority==='核心')) : module.route;
  const anniversary = day === 2;
  return tabs(day)+'<header class="day-hero '+(anniversary?'anniversary':'')+'"><img src="./assets/images/'+module.accent+'.webp" alt=""><div>'+
    '<p class="eyebrow">DAY '+two(day+1)+' · '+shortDate(data.itinerary.dates[day])+' '+weekName[day]+'</p><h1>'+dayTitle(day)+'</h1>'+
    '<p>'+escape(module.area)+'</p>'+(anniversary?flag('一周年纪念日','pink'):'')+'</div></header>'+
    '<section class="overview panel"><div class="overview-meta"><span>'+icon('clock')+' 建议出门 <strong>'+escape(module.departure)+'</strong></span><span>'+done+'/'+total+' 景点已打卡</span></div>'+
    progress(done,total,'当天景点打卡')+section('核心路线',link('当天地图','#map/'+day,'text','map'))+
    '<p class="route-line">'+keyRoute.map(id=>escape(place(id).name)).join('<span> / </span>')+'</p>'+
    '<div class="actions">'+button('顺路吃喝','jump','day-food','secondary','food')+button('注意事项','jump','day-notes','secondary','list')+'</div></section>'+
    (anniversary?'<div class="callout anniversary-note">'+icon('heart')+'<p><strong>18:30 后 · 纪念日晚间自由活动</strong><br>留时间拍一张合照，再就近挑晚餐。没有指定预订。</p></div>':'')+
    '<section class="day-timeline">'+section('时间轴')+'<div class="chips" aria-label="行程密度">'+chip('核心与交通','core',ui.timeline==='core','timeline')+
    chip('全部安排 · '+full.length,'all',ui.timeline==='all','timeline')+'</div>'+
    '<div class="timeline">'+shown.map(row => placeCard(place(row.id),row,day)).join('')+'</div></section>'+
    '<section id="day-notes" class="panel notes">'+section('当天注意事项')+'<ul>'+module.reminders.map(line=>'<li>'+escape(line)+'</li>').join('')+'</ul>'+
    (module.id==='gulangyu'?external('厦门轮渡官网',ferrySite,'secondary','ferry'):'')+
    (module.id==='departure'?'<div class="actions">'+data.itinerary.departureBackup.map(id=>link(escape(place(id).name),'#backup','text')).join('')+'</div>':'')+'</section>'+
    '<section id="day-food">'+section('顺路吃喝',link('美食库','#food','text'))+'<p class="subtle">到附近再挑，按当天营业和体力决定。</p>'+
    (dayFood(day).map(item=>foodCard(item,'day-'+day)).join('')||empty('当天暂无顺路美食。'))+'</section>';
}

function checkControls(type,item) {
  const stored = checkState(type,item.id);
  const label = statusLabels[type];
  return '<div class="check-controls">'+button(stored.status==='done'?'已完成':'完成打卡','done',type+':'+item.id,stored.status==='done'?'success':'secondary','check',
    'aria-pressed="'+(stored.status==='done')+'"')+
    '<label class="check-select"><span class="sr-only">'+escape(item.name)+'打卡状态</span><select data-update="status" data-id="'+item.id+'" data-type="'+type+'" aria-label="'+escape(item.name)+'打卡状态">'+
    Object.entries(statuses).map(([id,text])=>option(id,text,stored.status)).join('')+'</select></label>'+
    button(stored.favorite?'已收藏':'收藏','favorite',type+':'+item.id,stored.favorite?'rose':'secondary','heart',
      'aria-pressed="'+stored.favorite+'" aria-label="'+(stored.favorite?'取消':'')+'收藏'+label+' '+escape(item.name)+'"')+'</div>';
}

function placeCard(item,row,day) {
  const timeline = Boolean(row);
  const countable = !['住宿','交通'].includes(item.kind);
  const key = (timeline?day+'-'+row.time:'place')+'-'+item.id;
  const near = timeline ? dayFood(day).filter(entry => entry.placeIds.includes(item.id) && entry.group!=='纪念日晚餐') : [];
  return '<article class="place-card '+(timeline?'timeline-card':'panel')+'">'+(timeline?
    '<div class="place-time"><time>'+escape(row.time)+'</time>'+flag(row.priority,row.priority==='核心'?'core':'')+'</div>':'')+
    '<div class="place-main"><h3>'+escape(item.name)+'</h3><p>'+escape(item.summary)+'</p>'+
    (timeline?'<span class="fine">'+icon('clock')+' '+escape(row.duration)+'</span>':flag(item.region))+
    travelInfo(item.id)+
    (item.photo?'<p class="photo-preview">'+icon('camera')+' '+escape(item.photo.area)+'</p>':'')+
    '<div class="actions place-shortcuts">'+
    (countable?button(checkState('places',item.id).status==='done'?'已完成':'打卡','done','places:'+item.id,checkState('places',item.id).status==='done'?'success':'secondary','check','aria-pressed="'+(checkState('places',item.id).status==='done')+'"'):'')+
    button('地图导航','jump','nav-'+key,'secondary','pin')+
    (near.length?button('附近吃喝','jump','food-'+key,'secondary','food'):'')+'</div>'+
    detail(key,'详情与'+(item.photo?'拍照':'导航'),
      (row?.note?'<p class="callout">'+escape(row.note)+'</p>':'')+
      '<div id="nav-'+escape(key)+'">'+mapLinks(item)+'</div>'+verification(item)+
      (countable?checkControls('places',item):'')+
      (item.photo?photoPanel(item):'')+
      (near.length?'<div id="food-'+escape(key)+'"><h4>附近吃喝</h4>'+near.map(entry=>foodCard(entry,key)).join('')+'</div>':''),
      'place-detail')+'</div></article>';
}

function composition(item) {
  const coastal = /海|堤|水|湾|岸/u.test(item.photo.background);
  return '<figure class="composition"><svg viewBox="0 0 320 116" role="img" aria-label="人像三分线构图示意"><rect width="320" height="116" rx="8" fill="#dce7e5"/>'+
    (coastal?'<path d="M0 65Q88 64 171 68T320 61V116H0Z" fill="#a3bdba"/><path d="M0 93q85 4 162-6t158 3v26H0" fill="#e5d7bd"/><circle cx="245" cy="39" r="15" fill="#f3d8a9"/>':
      '<path d="M0 28h48v88H0zm61-11h29v99H61zm226 13h33v86h-33z" fill="#b8ccc4"/><path d="M0 116 173 61l147 55" fill="#e5d7bd"/>')+
    '<path d="M106 0v116M214 0v116M0 39h320M0 78h320" stroke="#fff" stroke-opacity=".78" stroke-dasharray="4 4"/>'+
    '<circle cx="108" cy="43" r="9" fill="#4b6972"/><path d="M108 54q-11 0-14 20h7l-1 24h6l2-13 3 13h6l-1-24h6q-3-20-14-20z" fill="#4b6972"/></svg>'+
    '<figcaption>构图示意 · 人物靠三分线，保留背景空间</figcaption></figure>';
}

function photoPanel(item) {
  const p = item.photo;
  const saved = photoState(item.id);
  return '<section class="photo-panel"><h4>'+icon('camera')+' 推荐机位</h4><p><strong>'+escape(p.area)+'</strong> · '+escape(p.style)+'</p>'+
    '<p>背景 '+escape(p.background)+'<br>光线 '+escape(p.light)+'</p><p>'+escape(p.tip)+'</p>'+
    '<p class="fine">1倍拍环境与全身，2–3倍拍半身和细节。广角时人物靠中央。可以补一张互动抓拍。</p>'+
    composition(item)+'<div class="actions">'+button(saved.favorite?'已收藏机位':'收藏机位','photoFavorite',item.id,saved.favorite?'rose':'secondary','heart','aria-pressed="'+saved.favorite+'"')+
    button(saved.taken?'已拍过':'标记拍过','photoTaken',item.id,saved.taken?'success':'secondary','check','aria-pressed="'+saved.taken+'"')+
    external('查实景参考','https://www.bing.com/images/search?q='+encodeURIComponent('厦门 '+item.name),'text')+'</div>'+
    '<form data-form="photo" data-id="'+item.id+'" class="memo"><label>私人摄影备注<textarea name="notes" rows="2" maxlength="1000" placeholder="想拍的角度或下次的想法">'+escape(saved.notes)+'</textarea></label><button class="button secondary">保存备注</button></form></section>';
}

function foodCard(item,context='food') {
  const current = checkState('food',item.id);
  const tag = current.favorite ? '已收藏' : item.kind;
  return '<article class="food-card"><div class="food-top"><div><span class="fine">'+escape(item.region)+' · '+escape(tag)+'</span><h3>'+escape(item.name)+'</h3>'+
    '<p>'+escape(item.recommended||'按现场选择')+'</p></div>'+button(icon('heart'),'favorite','food:'+item.id,'icon-button '+(current.favorite?'rose':''),'',
      'aria-pressed="'+current.favorite+'" aria-label="'+(current.favorite?'取消':'')+'收藏美食 '+escape(item.name)+'"')+'</div>'+
    detail(context+'-'+item.id,'地址与打卡'+(current.status==='pending'?'':' · '+statuses[current.status]),
      '<p>'+escape(item.address||'门牌或经营点待确认，按关键词搜索。')+'</p>'+verification(item)+mapLinks(item)+checkControls('food',item),'food-detail')+'</article>';
}

function foodView() {
  const source = ui.foodDay==='all' ? foods() : dayFood(Number(ui.foodDay));
  const groups = unique(source.map(item => item.group));
  const result = source.filter(item => (ui.foodGroup==='全部'||item.group===ui.foodGroup) &&
    (ui.foodMode!=='saved'||checkState('food',item.id).favorite) &&
    (ui.foodMode!=='done'||checkState('food',item.id).status==='done') &&
    (item.name+item.region+item.recommended+item.address).toLowerCase().includes(ui.foodQuery.trim().toLowerCase()));
  return heading('顺路吃喝','按附近区域挑选，到了再决定吃什么。')+
    '<div class="chips">'+chip('全部','all',ui.foodMode==='all','foodMode')+chip('已收藏','saved',ui.foodMode==='saved','foodMode')+chip('已打卡','done',ui.foodMode==='done','foodMode')+'</div>'+
    '<form data-form="foodSearch" class="search-form"><label class="search-label">'+icon('search')+'<span class="sr-only">搜索美食</span><input type="search" name="query" placeholder="搜店名、菜品或区域" maxlength="100" value="'+escape(ui.foodQuery)+'"></label><button class="button primary">搜索</button>'+
    (ui.foodQuery?button('清除','clearSearch'):'')+'</form>'+
    '<div class="filter-fields"><label>按日期<select data-update="foodDay">'+option('all','所有日期',ui.foodDay)+
    data.itinerary.dates.map((d,i)=>option(String(i),shortDate(d)+' '+dayTitle(i),ui.foodDay)).join('')+'</select></label>'+
    '<label>按区域<select data-update="foodGroup">'+['全部',...groups].map(group=>option(group,group,ui.foodGroup)).join('')+'</select></label></div>'+
    '<div class="section-heading"><h2>'+result.length+' 条美食</h2>'+link('添加美食','#custom','text','plus')+'</div>'+
    (result.length?groups.filter(group=>result.some(item=>item.group===group)).map(group=>'<section class="food-group"><h3>'+escape(group)+'</h3>'+
      result.filter(item=>item.group===group).map(item=>foodCard(item)).join('')+'</section>').join(''):empty('没有符合筛选的美食。'));
}

const mapFilters = {all:'全部',sights:'今日景点',photos:'摄影机位',food:'美食',transit:'交通',backup:'备选景点'};
const backupIds = () => [...data.backup['old-town'],...data.backup.outer];
const onMap = food => Boolean(food.address) || (food.kind !== '随缘' && food.kind !== '自定义' && food.region !== '按当天所在区域');
const mapType = item => item.recommended !== undefined ? 'food' : 'place';

function mapItems(day) {
  const module = day===null ? null : moduleAt(day);
  const tripIds = day === null ? unique(data.itinerary.modules.flatMap(m => m.itinerary.map(row=>row.id))) :
    unique(module.itinerary.map(row=>row.id));
  if (module?.id==='jimei' && !tripIds.includes('metro-line-one')) tripIds.push('metro-line-one');
  const optional = day===null ? backupIds() :
    unique([...backupIds().filter(id=>tripIds.includes(id)), ...(module.id==='departure'?data.itinerary.departureBackup:[])]);
  const customPoints = state.customPlaces.filter(item=>day===null||item.moduleId===module.id).map(item=>place(item.id));
  const mapFood = (day===null?foods():dayFood(day)).filter(onMap);
  const fixed = [
    ...tripIds.map(place),...customPoints,
    ...optional.filter(id=>!tripIds.includes(id)).map(place)
  ];
  const isTransit = item => ['交通','住宿'].includes(item.kind);
  if (ui.mapFilter==='sights') return fixed.filter(item=>!isTransit(item)&&!['备选'].includes(item.kind));
  if (ui.mapFilter==='photos') return fixed.filter(item=>item.photo);
  if (ui.mapFilter==='transit') return fixed.filter(isTransit);
  if (ui.mapFilter==='backup') return optional.map(place);
  if (ui.mapFilter==='food') return mapFood;
  return [...fixed,...mapFood];
}

function routeScheme(day) {
  const module = moduleAt(day);
  return '<div class="schematic"><ol>'+module.route.map((id,i) => {
    const isFerry = module.ferryEdges?.some(edge=>edge[0]===module.route[i-1]&&edge[1]===id);
    return '<li class="'+(isFerry?'ferry-leg':'')+'">'+(isFerry?'<span>'+icon('ferry')+' 跨海轮渡</span>':'')+
      button('<i aria-hidden="true"></i>'+escape(place(id).name),'mapPick','place:'+id,'map-node','',
        'aria-pressed="'+(ui.mapId==='place:'+id)+'"')+'</li>';
  }).join('')+'</ol></div>';
}

function regionScheme() {
  const districts = [
    ['集美学村','jimei-dragon-boat-pool','jimei'],
    ['殿前','dianqian-exit-five','plane'],
    ['八市与中山路','zhongshan-road','town'],
    ['鼓浪屿','neicuoao-ferry','island'],
    ['南普陀与厦大','nanputuo','temple'],
    ['环岛路与黄厝','huangcuo-beach','coast']
  ];
  return '<div class="region-map"><svg viewBox="0 0 420 256" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="waves" width="26" height="18" patternUnits="userSpaceOnUse"><path d="M1 10q5-4 10 0t10 0" fill="none" stroke="#b8cecc" stroke-opacity=".6"/></pattern></defs><rect width="420" height="256" fill="url(#waves)"/><path d="M0 0h210l-25 40-51 12-11 36-62 14L0 81zM184 63l41-20 55 11 36 37 54 24 20 38-30 42-47 11-41 38-62-8-15-38-48-20-20-53 24-32zM70 139l41 13 12 31-28 27-40-6-11-23z" fill="#e8e4ce" stroke="#a9bcb6" stroke-width="1.6"/><path d="m135 68 49 8m-49 98-29 5" stroke="#729a99" stroke-width="2" stroke-dasharray="6 6"/><path d="M375 35h18m-9-9v18m0-18-3 5m3-5 3 5" stroke="#517270" fill="none" stroke-linecap="round"/></svg>'+
    districts.map(([label,id,pos])=>button('<i aria-hidden="true"></i>'+label,'mapPick','place:'+id,'map-tag '+pos,'','aria-pressed="'+(ui.mapId==='place:'+id)+'"')).join('')+'</div>';
}

function mapView(day) {
  const rows = mapItems(day);
  const [type,id] = ui.mapId.split(':');
  const selected = type === 'food' ? foods().find(item=>item.id===id) : place(id);
  return heading(day===null?'旅行总地图':'当天路线地图',day===null?'从集美到环岛路，再渡海去鼓浪屿。':escape(moduleAt(day).area))+
    tabs(day,true)+'<section class="panel map-panel">'+section('路线示意图',flag('无比例尺'))+
    '<p class="subtle">按区域或当天顺序排列。点击地点可打开地图查询。</p>'+
    (day===null?regionScheme():routeScheme(day))+
    '<p class="fine">'+icon('ferry')+' 鼓浪屿跨海段乘游客轮渡。外部导航需联网。</p>'+
    (selected?'<article id="map-selection" tabindex="-1" class="map-selection"><h3>'+escape(selected.name)+'</h3>'+
      '<p>'+escape(selected.address||selected.region)+' · '+escape(ui.mapFilter==='photos'&&selected.photo?selected.photo.area:selected.summary||selected.recommended||'')+'</p>'+
      travelInfo(selected.id)+mapLinks(selected)+(selected.verification?verification(selected):'')+
      (selected.photo?detail('map-photo-'+id,'查看摄影机位',photoPanel(selected)):'')+'</article>':'')+'</section>'+
    '<section>'+section('地点索引',link('添加地点','#custom','text','plus'))+'<div class="chips map-chips">'+
    Object.entries(mapFilters).map(([value,label])=>chip(day===null&&value==='sights'?'正式景点':label,value,ui.mapFilter===value,'mapFilter')).join('')+'</div>'+
    '<p class="fine">'+rows.length+' 个匹配地点</p><div class="index-list">'+(rows.map(item => {
      const byType = mapType(item);
      const label = byType==='food'?'美食':(ui.mapFilter==='photos'?'机位':item.kind);
      return '<div class="index-row"><div><h3>'+escape(item.name)+'</h3><p>'+escape(item.region)+' · '+escape(label)+'</p></div>'+
        button('定位','mapPick',byType+':'+item.id,'secondary','pin','aria-label="查看 '+escape(item.name)+' 地图"')+'</div>';
    }).join('')||empty('这个日期和类别暂时没有地点。'))+'</div></section>';
}

const myPages = [
  ['budget','预算管理','wallet','记账、每日账单和预算'],
  ['stats','打卡统计','check','景点和美食记录'],
  ['photos','摄影收藏','camera','已标记机位、已拍和备注'],
  ['gifts','伴手礼清单','bag','勾选与记录购买金额'],
  ['backup','备选景点','pin','下雨或时间余裕时查看'],
  ['info','我的旅行信息','train','住宿、抵达和返程'],
  ['adjust','调整行程','swap','交换三天游玩模块'],
  ['custom','自定义地点与美食','plus','添加手机里的私人收藏'],
  ['records','导出与导入','download','备份、恢复与清除'],
  ['offline','离线使用说明','wifi','添加到 iPhone 主屏幕']
];

function me() {
  return heading('我的旅行手账','记录存在这台设备。两部手机可通过导出、导入手动共享。')+
    '<div class="menu-list">'+myPages.map(([id,name,glyph,descr])=>'<a class="menu-link" href="#'+id+'"><span class="menu-icon">'+icon(glyph)+'</span><div><strong>'+
      name+'</strong><small>'+descr+'</small></div>'+icon('chevron')+'</a>').join('')+'</div>';
}

function stats() {
  const [done,total]=tripProgress();
  const statsFor = (type,items) => {
    const recorded = items.filter(item=>{ const s=checkState(type,item.id); return s.favorite||s.status!=='pending'; });
    const num = key => items.filter(item=>checkState(type,item.id).status===key).length;
    return '<section class="panel">'+section(statusLabels[type])+'<p>已完成 '+num('done')+' · 已跳过 '+num('skipped')+' · 未完成 '+num('pending')+'</p>'+
      '<div class="index-list">'+(recorded.map(item=>'<div class="index-row"><div><h3>'+escape(item.name)+'</h3><p>'+
        statuses[checkState(type,item.id).status]+(checkState(type,item.id).favorite?' · 已收藏':'')+'</p></div>'+
        (type==='food'? link('去美食库','#food','text'):button('查看','openMap','place:'+item.id,'text','pin'))+'</div>').join('')||empty('还没有记录。'))+'</div></section>';
  };
  return heading('打卡统计','相同地点在不同日期共享同一条记录。',true)+
    '<section class="panel">'+section('旅行进度')+'<strong>'+done+' / '+total+' 个行程景点</strong>'+progress(done,total,'旅行景点打卡')+
    '<div class="index-list">'+data.itinerary.dates.map((d,i)=>{const [a,b]=dayProgress(i);return '<div class="index-row"><span>'+shortDate(d)+' · '+dayTitle(i)+'</span>'+link(a+'/'+b,'#trip/'+i,'text')+'</div>';}).join('')+
    '</div></section>'+statsFor('places',places().filter(item=>!['住宿','交通'].includes(item.kind)))+statsFor('food',foods());
}

function photos() {
  const candidates = data.places.filter(item=>item.photo&&Object.hasOwn(state.photos,item.id))
    .filter(item=>{const photo=photoState(item.id);return photo.favorite||photo.taken||photo.notes;});
  return heading('摄影收藏','查看已收藏、已拍过或带备注的机位。',true)+
    (candidates.map(item=>'<article class="panel"><h2>'+escape(item.name)+'</h2>'+photoPanel(item)+mapLinks(item)+'</article>').join('')||
      empty('还没有机位记录。打开行程中的「详情与拍照」即可添加。'))+
    link('查看行程','#trip','secondary','itinerary');
}

function gifts() {
  return heading('伴手礼清单','金额记录在清单里。需要计入预算时，可在预算页另记一笔。',true)+
    '<div class="gift-list">'+data.budget.gifts.map(gift=>{
      const saved=state.gifts[gift.id]||{bought:false,amount:null};
      return '<form class="panel gift-form" data-form="gift" data-id="'+gift.id+'"><label class="tick"><input data-update="giftCheck" data-id="'+gift.id+'" name="bought" type="checkbox"'+(saved.bought?' checked':'')+'> <strong>'+
        escape(gift.name)+'</strong></label><div class="field-line"><label>实际金额（元）<input name="amount" type="number" min="0" max="10000000" step=".01" inputmode="decimal" value="'+escape(saved.amount??'')+'"></label>'+
        '<button class="button secondary">保存</button></div></form>';
    }).join('')+'</div>'+link('打开预算','#budget','secondary','wallet');
}

function backup() {
  const extraPlaces=state.customPlaces.filter(item=>!item.moduleId);
  return heading('备选景点','按天气、体力和交通选择。雨天可优先看科技馆或商场。',true)+
    section('老城及厦门岛')+data.backup['old-town'].map(id=>placeCard(place(id))).join('')+
    section('集美及岛外')+data.backup.outer.map(id=>placeCard(place(id))).join('')+
    (extraPlaces.length?section('我的地点')+extraPlaces.map(item=>placeCard(place(item.id))).join(''):'');
}

const field = (label,name,value='',attrs='') => '<label>'+label+'<input name="'+name+'" value="'+escape(value)+'" '+attrs+'></label>';
function info() {
  const details=state.info;
  return heading('我的旅行信息','仅保存在这台设备。填写后会出现在对应的行程卡片和地图里。',true)+
    '<form data-form="info" class="stack"><section class="panel form-grid">'+section('本岛住宿')+
    field('住宿名称','hotel',details.hotel,'maxlength="100" autocomplete="off" placeholder="本岛住宿点"')+
    field('地址','address',details.address,'maxlength="200" autocomplete="off" placeholder="填写地址以便导航"')+
    '<p class="fine">11月28日入住 · 12月2日退房 · 同一住宿点</p></section>'+
    '<section class="panel form-grid">'+section('抵达和返程')+
    field('11月28日 · 抵达厦门站','arrivalTime',details.arrivalTime,'type="time"')+
    field('抵达班次（选填）','arrivalService',details.arrivalService,'maxlength="100" autocomplete="off"')+
    field('12月2日 · 厦门北站发车','departureTime',details.departureTime,'type="time"')+
    field('返程班次（选填）','departureService',details.departureService,'maxlength="100" autocomplete="off"')+
    '<label>鼓浪屿上岛码头<select name="ferryArrival">'+option('','默认：内厝澳',details.ferryArrival)+option('sanqiutian','已买三丘田上岛船票',details.ferryArrival)+'</select></label>'+
    '<label>私人备注<textarea name="notes" maxlength="1000" rows="3">'+escape(details.notes)+'</textarea></label></section>'+
    '<button class="button primary">保存旅行信息</button></form>';
}

function adjustment() {
  return heading('调整行程','抵达和返程锁定在原日期。11月30日始终保留纪念日标识。',true)+
    '<section class="panel adjust-list">'+section('当前顺序')+
    state.order.map((id,i)=>'<div class="index-row"><span>'+shortDate(data.itinerary.dates[i+1])+'</span><strong>'+escape(data.modules.get(id).swapTitle||data.modules.get(id).title)+'</strong>'+
      (i===1?flag('纪念日','pink'):'')+'</div>').join('')+'</section>'+
    '<form class="panel form-grid" data-form="swap">'+section('交换两天')+
    [0,1].map((index)=>'<label>日期 '+(index+1)+'<select name="date'+index+'">'+state.order.map((m,i)=>option(String(i),shortDate(data.itinerary.dates[i+1])+' · '+(data.modules.get(m).swapTitle||data.modules.get(m).title),String(index))).join('')+'</select></label>').join('')+
    '<p class="callout">换日后请重新核对预约、船票、开放时间与天气。打卡、机位收藏和备注会保留。</p>'+
    '<div class="actions"><button class="button primary">交换日期</button>'+button('恢复原始行程','restoreOrder')+'</div></form>';
}

function budget() {
  const refs = data.budget.references;
  const subtotal = refs.reduce((sum,ref)=>sum+(ref.amount??0),0);
  const spent = calculate(state.expenses);
  const budgetTotal = state.total;
  const balance = budgetTotal === null ? null : (Math.round(budgetTotal*100)-Math.round(spent*100))/100;
  const days = unique([...data.itinerary.dates,...state.expenses.map(item=>item.date)]).sort();
  const edit = state.expenses.find(item=>item.id===ui.editExpense);
  const dated = (ui.budgetDay==='all'?state.expenses:state.expenses.filter(item=>item.date===ui.budgetDay)).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const categoryTotals=data.budget.categories.map(name=>[name,calculate(state.expenses.filter(item=>item.category===name))]).filter(([,sum])=>sum>0).sort((a,b)=>b[1]-a[1]);
  const dateDefault = ui.budgetDay==='all'?(data.itinerary.dates.includes(localDate())?localDate():data.itinerary.dates[0]):ui.budgetDay;
  return heading('旅行预算','两人账本。旧版预估供参考，实际支出从零开始记录。',true)+
    '<section class="panel budget-hero"><div class="budget-summary"><div><span>实际累计支出</span><strong>'+money(spent)+'</strong></div><div><span>人均实际支出</span><strong>'+money(spent/2)+'</strong></div>'+
    '<div><span>总预算</span><strong>'+(budgetTotal===null?'待设置':money(budgetTotal))+'</strong></div><div><span>'+((balance??0)<0?'已超预算':'剩余预算')+
    '</span><strong>'+(balance===null?'待设置':money(Math.abs(balance)))+'</strong></div></div>'+
    (budgetTotal===null?'':progress(Math.min(spent,budgetTotal),budgetTotal,'总预算已使用')+'<p class="fine">已使用 '+(budgetTotal===0?(spent===0?'0%':'超出零元预算'):Math.round(spent/budgetTotal*100)+'%')+'</p>')+
    '<form class="field-line" data-form="budgetTotal">'+field('设置总预算（元）','amount',budgetTotal??'','type="number" min="0" max="10000000" step=".01" inputmode="decimal" placeholder="留空表示待设置"')+
    '<button class="button secondary">保存</button></form></section>'+
    '<section class="panel">'+section('已知预算参考小计',flag(money(subtotal),'core'))+'<p class="fine">未确定的交通、轮渡、门票和纪念日额外支出未计入。</p>'+
    detail('budget-reference','看预估明细',refs.map(ref=>'<div class="index-row"><span>'+escape(ref.name)+(ref.detail?' <small>'+escape(ref.detail)+'</small>':'')+'</span><strong>'+ (ref.amount===null?'待填写':money(ref.amount))+'</strong></div>').join(''))+'</section>'+
    '<form id="expense-form" class="panel form-grid" data-form="expense" data-id="'+(edit?.id??'')+'">'+section(edit?'修改支出':'记一笔支出')+
    '<div class="form-columns">'+field('日期','date',edit?.date??dateDefault,'type="date" required')+
    field('金额（元）','amount',edit?.amount??'','type="number" min=".01" max="10000000" step=".01" inputmode="decimal" required')+'</div>'+
    '<label>类别<select name="category">'+data.budget.categories.map(value=>option(value,value,edit?.category??'正餐')).join('')+'</select></label>'+
    field('店铺或事项','title',edit?.title??'','maxlength="120" required')+
    field('付款人昵称（选填）','payer',edit?.payer??'','maxlength="60" autocomplete="off"')+
    '<label>备注<textarea name="notes" maxlength="500" rows="2">'+escape(edit?.notes??'')+'</textarea></label>'+
    '<label class="tick"><input name="shared" type="checkbox"'+(!edit||edit.shared?' checked':'')+'> 两人共同支出</label>'+
    '<div class="actions"><button class="button primary">'+(edit?'保存修改':'添加支出')+'</button>'+(edit?button('取消修改','cancelExpense'):'')+'</div></form>'+
    '<section class="panel">'+section('每日账单')+
    '<label>查看日期<select data-update="budgetDay">'+option('all','全部日期',ui.budgetDay)+days.map(day=>option(day,day,ui.budgetDay)).join('')+'</select></label>'+
    '<p class="subtle">所选日期累计 '+money(calculate(dated))+'</p>'+
    (dated.map(item=>'<article class="expense"><div><h3>'+escape(item.title)+'</h3><p>'+escape(item.date)+' · '+escape(item.category)+' · '+(item.shared?'共同支出':'个人支出')+
      (item.payer?' · '+escape(item.payer):'')+'</p>'+(item.notes?'<p>'+escape(item.notes)+'</p>':'')+'</div><strong>'+money(item.amount)+'</strong>'+
      '<div class="actions">'+button('修改','editExpense',item.id,'text')+button('删除','deleteExpense',item.id,'text danger')+'</div></article>').join('')||empty('所选日期还没有账单。'))+
    detail('daily-expenses','查看每天合计',days.map(day=>'<div class="index-row"><span>'+escape(day)+'</span><strong>'+money(calculate(state.expenses.filter(item=>item.date===day)))+'</strong></div>').join(''))+
    '<div class="actions">'+button('导出 CSV','exportCsv','','secondary','download')+button('导出 JSON 账单','exportExpenses','','secondary','download')+'</div></section>'+
    '<section class="panel">'+section('各类支出占比')+(categoryTotals.map(([name,value])=>'<div class="budget-category"><div><span>'+escape(name)+'</span><strong>'+money(value)+
      ' · '+Math.round(value/spent*100)+'%</strong></div>'+progress(value,spent,name+'支出占比')+'</div>').join('')||empty('记录支出后显示。'))+'</section>';
}

function records() {
  return heading('本地数据','备份包含这台手机保存的私人信息。请把文件保存在自己的设备上。',true)+
    '<section class="panel">'+section('备份与恢复')+'<p>导出完整 JSON 后，可在另一台手机手动导入。成功导入会整体替换本地记录。</p>'+
    '<div class="actions">'+button('导出旅行 JSON','export','','primary','download')+
    '<label class="button secondary import-label">选择备份文件<input type="file" accept=".json,application/json" data-update="import" aria-label="导入旅行 JSON"></label></div></section>'+
    '<section class="panel">'+section('清除本地数据')+'<p>清除打卡、预算、住宿、备注和日期调整。建议保存一份备份。</p>'+
    button('清除本地数据','clear','','secondary danger')+'</section>';
}

function offline() {
  return heading('离线与主屏幕','出发前用 Safari 成功打开一次，等待离线素材准备完成。',true)+
    '<section class="panel">'+section('离线状态')+'<p id="offline-status">'+(loadedOffline?'核心行程已缓存，可离线查看。':'正在检查缓存。如长期未就绪，请联网后重新打开。')+'</p>'+
    '<p class="subtle">本地行程、图片、打卡和预算可离线使用。地图导航、外链和实时营业信息需要联网。清除网站数据后需重新缓存。</p></section>'+
    '<section class="panel">'+section('添加到 iPhone 主屏幕')+'<ol><li>在 Safari 打开本页。</li><li>点分享，选择「添加到主屏幕」。</li><li>确认名称并点「添加」，再从主屏幕打开一次检查离线状态。</li></ol>'+
    '<p class="subtle">不同浏览器和独立主屏幕应用可能分别保存记录。切换使用方式前可先导出备份。</p></section>';
}

function custom() {
  const customRows = [...state.customPlaces.map(item=>[item,'place']),...state.customFood.map(item=>[item,'food'])];
  return heading('自定义地点与美食','仅保存在本设备，可在地图、美食库或关联行程中查看。',true)+
    '<form class="panel form-grid" data-form="custom">'+section('添加一条记录')+
    '<label>类型<select name="type">'+option('place','地点')+option('food','美食')+'</select></label>'+
    field('名称','name','','maxlength="100" required')+field('所在区域','region','','maxlength="100" placeholder="例如：集美学村"')+
    field('地址（选填）','address','','maxlength="200"')+
    '<label>关联游玩模块<select name="moduleId">'+option('','仅加入收藏库')+
    data.itinerary.modules.map(m=>option(m.id,m.swapTitle??m.title)).join('')+'</select></label>'+
    '<label>简介或推荐菜<textarea name="description" maxlength="500" rows="2"></textarea></label><button class="button primary">添加记录</button></form>'+
    '<section class="panel">'+section('我的自定义记录')+(customRows.map(([item,type])=>'<div class="index-row"><div><h3>'+escape(item.name)+'</h3><p>'+
      (type==='food'?'美食':'地点')+' · '+escape(item.moduleId?(data.modules.get(item.moduleId)?.area??''):'仅收藏')+'</p></div>'+
      button('删除','deleteCustom',type+':'+item.id,'text danger')+'</div>').join('')||empty('还没有自定义记录。'))+'</section>';
}

const views = {home,trip:dayView,map:mapView,food:foodView,me,budget,stats,photos,gifts,backup,info,adjust:adjustment,records,offline,custom};
function render(keepDetails=false) {
  const open = new Set(keepDetails?[...main.querySelectorAll('details[open]')].map(node=>node.dataset.detail):[]);
  const held = keepDetails ? document.activeElement : null;
  const focusable = held?.matches('button[data-action], select[data-update]') ? held : null;
  const focusKey = focusable ? Object.entries(focusable.dataset) : [];
  const focusContext = focusable?.closest('details')?.dataset.detail;
  main.innerHTML=(storageFailure?'<p class="callout">无法读取原有的本地数据。检查 Safari 的站点存储，或从备份恢复。</p>':'')+views[current.page](current.day);
  for (const node of main.querySelectorAll('details')) node.open=open.has(node.dataset.detail);
  if (focusable) {
    const replacement = [...main.querySelectorAll(focusable.matches('button')?'button[data-action]':'select[data-update]')]
      .find(node=>node.closest('details')?.dataset.detail===focusContext&&focusKey.every(([key,value])=>node.dataset[key]===value));
    replacement?.focus({preventScroll:true});
  }
  const active = ['home','trip','map','food'].includes(current.page)?current.page:'me';
  navigation.innerHTML=[
    ['home','首页','home'],['trip','行程','itinerary'],['map','地图','map'],['food','美食','food'],['me','我的','user']
  ].map(([page,name,glyph])=>'<a href="#'+page+'"'+(page===active?' aria-current="page"':'')+'>'+icon(glyph)+'<span>'+name+'</span></a>').join('');
  const title = main.querySelector('h1')?.textContent;
  document.title = current.page==='home' ? '与海相约 · 厦门纪行' : title+' · 厦门纪行';
}

function changeRoute() {
  const next=route();
  if (current?.page!==next.page||current?.day!==next.day) {
    if (next.page==='trip') ui.timeline='core';
    if (next.page==='map'&&current?.page==='map') { ui.mapId=''; ui.mapFilter='all'; }
  }
  current=next;
  render();
  window.scrollTo(0,0);
  main.focus({preventScroll:true});
  if (current.page==='map'&&ui.mapId) jump('map-selection');
}

function jump(id) {
  const target=document.getElementById(id);
  if (!target) return;
  for (let parent=target.parentElement;parent;parent=parent.parentElement) {
    if (parent.tagName==='DETAILS') parent.open=true;
  }
  if (!target.hasAttribute('tabindex')) target.tabIndex=-1;
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'start'});
}

function download(name,contents,type) {
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotice('已复制');
  } catch {
    window.prompt('长按并复制下面的内容',text);
  }
}

function updateCheck(type,id,update) {
  return mutate(next=>{
    const row={...checkState(type,id)};
    update(row);
    next[type][id]=row;
  });
}

function updatePhoto(id,update) {
  return mutate(next=>{
    const row={...photoState(id)};
    update(row);
    next.photos[id]=row;
  });
}

const actions = {
  jump, copy:copyText,
  timeline(value) { ui.timeline=value; render(true); },
  foodMode(value) { ui.foodMode=value; render(true); },
  clearSearch() { ui.foodQuery=''; render(true); main.querySelector('input[type=search]').focus(); },
  mapFilter(value) { ui.mapFilter=value; ui.mapId=''; render(true); },
  mapPick(value) { ui.mapId=value; render(true); jump('map-selection'); },
  openMap(value) { ui.mapId=value; ui.mapFilter='all'; location.hash='map'; },
  done(value) {
    const [type,id]=value.split(':');
    if (updateCheck(type,id,row=>{row.status=row.status==='done'?'pending':'done';})) render(true);
  },
  favorite(value) {
    const [type,id]=value.split(':');
    if (updateCheck(type,id,row=>{row.favorite=!row.favorite;})) render(true);
  },
  photoFavorite(id) { if(updatePhoto(id,row=>{row.favorite=!row.favorite;})) render(true); },
  photoTaken(id) { if(updatePhoto(id,row=>{row.taken=!row.taken;})) render(true); },
  restoreOrder() {
    if (mutate(next=>{next.order=[...originalOrder];})) {
      render(true);
      showNotice('已恢复原始日期，请核对预约和船票');
    }
  },
  editExpense(id) { ui.editExpense=id; render(true); jump('expense-form'); },
  cancelExpense() { ui.editExpense=''; render(true); },
  deleteExpense(id) {
    if (!window.confirm('删除这笔支出？')) return;
    if (mutate(next=>{next.expenses=next.expenses.filter(item=>item.id!==id);})) {
      if (ui.editExpense===id) ui.editExpense='';
      render(true);
      showNotice('已删除支出');
    }
  },
  deleteCustom(value) {
    const [type,id]=value.split(':');
    if (!window.confirm('删除这条自定义记录及其打卡状态？')) return;
    if (mutate(next=>{
      if (type==='food') { next.customFood=next.customFood.filter(item=>item.id!==id); delete next.food[id]; }
      else { next.customPlaces=next.customPlaces.filter(item=>item.id!==id); delete next.places[id]; }
    })) render(true);
  },
  export() {
    download('厦门纪行-旅行备份.json',JSON.stringify(state,null,2),'application/json');
    showNotice('旅行备份已导出');
  },
  exportCsv() { download('厦门纪行-账单.csv',csv(state.expenses),'text/csv;charset=utf-8'); },
  exportExpenses() { download('厦门纪行-账单.json',JSON.stringify(state.expenses,null,2),'application/json'); },
  clear() {
    if (!window.confirm('清除本设备的旅行记录？建议先导出备份。')) return;
    if (!window.confirm('再次确认：删除本地旅行记录？')) return;
    try {
      localStorage.removeItem(storageKey);
      state=emptyState();
      storageFailure=false;
      ui.editExpense='';
      render();
      showNotice('本地旅行记录已清除');
    } catch {
      showNotice('未能清除，请检查 Safari 的站点存储设置');
    }
  }
};

async function importFile(input) {
  const file=input.files[0];
  if (!file) return;
  try {
    if (file.size>10_000_000) throw new Error('文件过大');
    const incoming=JSON.parse(await file.text());
    if (!validateState(incoming,data)) throw new Error('备份格式不匹配');
    if (window.confirm('这份备份通过验证。替换本设备的全部旅行记录？')&&persist(incoming)) {
      ui.editExpense='';
      render();
      showNotice('已恢复旅行记录');
    }
  } catch {
    showNotice('导入失败。请选择有效的厦门纪行旅行备份 JSON。');
  } finally {
    input.value='';
  }
}

function onChange(event) {
  const target=event.target;
  const {update,id,type}=target.dataset;
  if (!update) return;
  const {value}=target;
  if (update==='import') { importFile(target); return; }
  if (update==='giftCheck') {
    if (!mutate(next=>{next.gifts[id]={bought:target.checked,amount:next.gifts[id]?.amount??null};}))
      target.checked=!target.checked;
    return;
  }
  if (update==='status') {
    if (!updateCheck(type,id,row=>{row.status=value;})) target.value=checkState(type,id).status;
  } else if (['foodDay','foodGroup','budgetDay'].includes(update)) {
    ui[update]=value;
    if (update==='foodDay') ui.foodGroup='全部';
  }
  render(true);
}

const submit = {
  foodSearch(form,h) {
    ui.foodQuery=h('query');
    render(true);
    main.querySelector('input[type=search]').focus();
  },
  photo(form,h) {
    if (updatePhoto(form.dataset.id,row=>{row.notes=h('notes');})) {
      showNotice('摄影备注已保存');
    }
  },
  gift(form,h,formData) {
    const id=form.dataset.id;
    if (mutate(next=>{next.gifts[id]={bought:formData.has('bought'),amount:h('amount')?Number(h('amount')):null};}))
      showNotice('伴手礼记录已保存');
  },
  info(form,h) {
    if (mutate(next=>{next.info=Object.fromEntries(Object.keys(emptyInfo).map(key=>[key,h(key)]));})) {
      showNotice('住宿与交通信息已保存在本机');
    }
  },
  swap(form,h) {
    const a=Number(h('date0')),b=Number(h('date1'));
    if (a===b) {showNotice('请选择两个不同的日期');return;}
    if (mutate(next=>{[next.order[a],next.order[b]]=[next.order[b],next.order[a]];})) {
      ui.mapId='';
      render(true);
      showNotice('日期已交换。请重新核对预约、轮渡和天气。');
    }
  },
  budgetTotal(form,h) {
    if (mutate(next=>{next.total=h('amount')?Number(h('amount')):null;})) {
      render(true);
      showNotice('总预算已保存');
    }
  },
  expense(form,h,formData) {
    if (!h('title')) {showNotice('请填写店铺或事项');return;}
    const prior=form.dataset.id;
    const item={id:prior||crypto.randomUUID(),date:h('date'),amount:Number(h('amount')),category:h('category'),title:h('title'),
      notes:h('notes'),shared:formData.has('shared'),payer:h('payer')};
    if (mutate(next=>{
      if (prior) next.expenses=next.expenses.map(entry=>entry.id===prior?item:entry);
      else next.expenses.push(item);
    })) {
      if (ui.budgetDay!=='all'&&ui.budgetDay!==item.date) ui.budgetDay=item.date;
      ui.editExpense='';
      render(true);
      showNotice(prior?'支出已更新':'已记下一笔支出');
    }
  },
  custom(form,h) {
    const type=h('type');
    if (!h('name')) {showNotice('请填写名称');return;}
    const item={id:'custom-'+type+'-'+crypto.randomUUID(),name:h('name'),region:h('region'),address:h('address'),moduleId:h('moduleId'),
      [type==='food'?'recommended':'summary']:h('description')};
    if (mutate(next=>{next[type==='food'?'customFood':'customPlaces'].push(item);})) {
      render(true);
      showNotice('已加入本地收藏');
    }
  }
};

async function loadData() {
  const fetchJson=async name=>{
    const response=await fetch('./data/'+name+'.json');
    if (!response.ok) throw new Error('Could not load '+name);
    return response.json();
  };
  const [itinerary,places,food,budget,backup]=await Promise.all(['itinerary','attractions','food','budget','backup-spots'].map(fetchJson));
  return {itinerary,places,food,budget,backup,modules:new Map(itinerary.modules.map(m=>[m.id,m])),placeById:new Map(places.map(p=>[p.id,p]))};
}

function readyOffline() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
    loadedOffline=true;
    const status=document.querySelector('#offline-status');
    if (status) status.textContent='核心行程已缓存，可离线查看。';
  }).catch(()=>{
    const status=document.querySelector('#offline-status');
    if (status) status.textContent='离线缓存未就绪，联网后可重试。';
  });
}

async function initialize() {
  data=await loadData();
  state=emptyState();
  try {
    const raw=localStorage.getItem(storageKey);
    if (raw) {
      const saved=JSON.parse(raw);
      if (validateState(saved,data)) state=saved;
      else storageFailure=true;
    }
  } catch { storageFailure=true; }
  current=route();
  render();
  window.addEventListener('hashchange',changeRoute);
  window.addEventListener('storage',event=>{
    if (event.key!==storageKey&&event.key!==null) return;
    try {
      const next=event.newValue?JSON.parse(event.newValue):emptyState();
      if (validateState(next,data)) {
        state=next;
        render(true);
      }
    } catch {
      showNotice('无法读取另一标签页的本地记录');
    }
  });
  document.querySelector('.skip-link').addEventListener('click',event=>{
    event.preventDefault();
    main.focus();
  });
  main.addEventListener('click',event=>{
    const node=event.target.closest('button[data-action]');
    if (node) actions[node.dataset.action]?.(node.dataset.value);
  });
  main.addEventListener('change',onChange);
  main.addEventListener('submit',event=>{
    const form=event.target;
    event.preventDefault();
    const values=new FormData(form);
    submit[form.dataset.form]?.(form,key=>String(values.get(key)??'').trim(),values);
  });
  readyOffline();
}

initialize().catch(error=>{
  console.error(error);
  main.innerHTML='<section class="panel"><h1>旅行手账还没打开</h1><p>请联网后重新加载，首次加载完成后可使用离线缓存。</p><button type="button" class="button primary" id="retry">重新加载</button></section>';
  document.querySelector('#retry').addEventListener('click',()=>location.reload());
});
