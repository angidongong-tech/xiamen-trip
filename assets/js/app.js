import {CloudTrip, shouldConnect, invitationToken} from './cloud.js';
import {cloudConfig} from './cloud-config.js';
import {sharedView, syncNames} from './cloud-view.js';
import {changeRows, projectRoom, photoNotes, migrationRows, migrationSummary} from './room-model.js';
import {mountGeoMap} from './geo-map.js';
import {storageKey, statuses, originalOrder, emptyInfo, emptyState, validateState, localDate, calculate, expenseCents, toCents, csv} from './state.js';

const main = document.querySelector('main');
const navigation = document.querySelector('#navigation');
const notice = document.querySelector('#notice');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shortDate = date => date.slice(5).replace(/^0/,'').replace('-','/').replace(/\/0/,'/');
const money = value => '¥' + value.toLocaleString('zh-CN',{maximumFractionDigits:2});
const centMoney = cents => money(cents/100);
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
let localState;
let current;
let loadedOffline = false;
let storageFailure = false;
let noticeTimer;
let ui = {foodGroup:'全部',foodDay:'all',foodMode:'all',foodQuery:'',mapFilter:'all',mapId:'',budgetDay:'all',editExpense:'',timeline:'compact',cloudAuth:'signin',migrateTravel:false,migrateNotes:false};

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
    localState = next;
    if (!displayedRoom()) state = next;
    storageFailure = false;
    return true;
  } catch {
    showNotice('保存失败。请检查 Safari 存储空间或站点设置。');
    return false;
  }
}

function mutate(update,options={}) {
  if (cloud.room&&!cloud.selected) {
    showNotice('房间仍在打开。可切回本地模式再编辑本机数据。');
    return false;
  }
  if (storageFailure&&!displayedRoom()) {
    showNotice('原有记录暂时无法读取。请先从「导出与导入」备份，再恢复有效记录。');
    return false;
  }
  const next = JSON.parse(JSON.stringify(state));
  update(next);
  if (!validateState(next,data,{room:displayedRoom()})) {
    showNotice('这条记录未保存，请检查内容或金额。');
    return false;
  }
  if(!displayedRoom()) return persist(next);
  try {
    const patches=changeRows(state,next,options.payment);
    if(!cloud.enqueue(patches,{bases:options.bases,notes:photoNotes(next)})) {
      showNotice(cloud.editable?'未能保存到本机待同步队列。':'当前角色仅可查看此房间的共享记录。');
      return false;
    }
    state=viewState();
    return true;
  } catch(error) {cloudError(error);return false;}
}

function startRoute() {
  const idx = data.itinerary.dates.indexOf(localDate());
  return {page:idx < 0 ? 'home' : 'trip',day:idx < 0 ? 0 : idx};
}

function route() {
  const [page, index, stop] = location.hash.slice(1).split('/');
  const day = /^[0-4]$/.test(index ?? '') ? Number(index) : null;
  if (page === 'trip') return {page,day:day ?? startRoute().day,stop:/^[a-z0-9-]+$/.test(stop??'')?stop:''};
  if (page === 'map') return {page,day};
  if (['home','food','me','shared','budget','stats','photos','gifts','backup','info','adjust','records','offline','custom'].includes(page)) return {page,day:null};
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

function mapUrls(item) {
  const keyword = item.keyword || [item.id==='stay'&&!state.info.hotel?'':item.name,item.address||item.region].filter(Boolean).join(' ');
  const amap = new URL('https://uri.amap.com/search');
  amap.search = new URLSearchParams({keyword,city:'厦门',view:'list'});
  const apple = new URL('https://maps.apple.com/');
  apple.search = new URLSearchParams({q:keyword+' 厦门'});
  return {keyword,amap,apple};
}

function quickNav(item) {
  if (item.id==='stay'&&!state.info.hotel&&!state.info.address) return link('住宿','#info','compact-icon','pin');
  return external('<span class="sr-only">导航 '+escape(item.name)+'</span>',mapUrls(item).amap,'compact-icon','pin');
}

function mapLinks(item) {
  if (item.id==='stay'&&!state.info.hotel&&!state.info.address) return link('填写住宿信息','#info','secondary','pin');
  const {keyword,amap,apple}=mapUrls(item);
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

function dayImage(module) {
  return module.id === 'departure' ? 'departure' : module.accent;
}

function budgetBalance() {
  return state.total === null ? null : toCents(state.total) - expenseCents(state.expenses);
}

function home() {
  const [done,total] = tripProgress();
  const today = startRoute();
  const isTripDay = today.page === 'trip';
  const afterTrip = localDate() > data.itinerary.dates.at(-1);
  const next = afterTrip ? null : nextStop(today.day);
  const balance = budgetBalance();
  return '<section class="hero"><img class="hero-photo" src="./assets/images/cover.webp" alt="厦门海滨实景" fetchpriority="high"><div class="hero-content">'+
    '<p class="eyebrow">OUR FIRST ANNIVERSARY · XIAMEN</p><h1 aria-label="与海相约 · 厦门纪行">与海相约<span>厦门纪行</span></h1>'+
    '<p class="hero-dates">2026.11.28 — 12.02 <span>5 天 4 晚 · 2 人</span></p></div></section>'+
    '<div class="anniversary-strip">'+icon('heart')+'<strong>11月30日 · 一周年纪念日</strong>'+link('查看当天','#trip/2','text')+'</div>'+
    '<div class="home-today"><a class="today-link" href="#trip/'+today.day+'">'+icon('itinerary')+'<div><small>'+
    (isTripDay?'今天 · '+shortDate(data.itinerary.dates[today.day]):'旅行行程')+'</small><strong>'+dayTitle(today.day)+'</strong></div>'+icon('chevron')+'</a>'+
    (next?'<a class="today-link" href="#trip/'+today.day+'/'+next.id+'">'+icon('pin')+'<div><small>下一站 · '+escape(next.time.split('–')[0])+'</small><strong>'+escape(place(next.id).name)+'</strong></div>'+icon('chevron')+'</a>':'')+'</div>'+
    '<div class="quick-summary"><a href="#budget" class="summary-card">'+icon('wallet')+'<div><span>'+
    (balance===null?'剩余预算':balance<0?'已超预算':'剩余预算')+'</span><strong>'+(balance===null?'待设置':centMoney(Math.abs(balance)))+'</strong><small>已支出 '+centMoney(expenseCents(state.expenses))+(state.total===null?'':' / '+money(state.total))+'</small></div></a>'+
    '<a href="#stats" class="summary-card">'+icon('check')+'<div><span>景点打卡</span><strong>'+done+' / '+total+'</strong></div></a></div>'+
    '<section class="home-days">'+section('五天行程',link('总地图','#map','text','map'))+tabs(isTripDay?today.day:null)+
    '<div class="day-grid">'+data.itinerary.dates.map((date,i) => {
      const module = moduleAt(i);
      return '<a class="day-tile '+(i===2?'anniversary':'')+'" href="#trip/'+i+'"><img loading="lazy" alt="" src="./assets/images/'+dayImage(module)+'.webp"><div><span class="tile-date">DAY '+two(i+1)+' <i></i> '+shortDate(date)+' '+week[i]+'</span><h3>'+dayTitle(i)+'</h3><p>'+escape(module.area)+'</p></div>'+icon('chevron')+'</a>';
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

function nextStop(day) {
  const outstanding = timelineRows(day).filter(row => row.priority!=='交通' && checkState('places',row.id).status==='pending');
  const core = outstanding.filter(row => row.priority==='核心');
  const candidates = core.length ? core : outstanding;
  if (data.itinerary.dates[day] !== localDate()) return candidates[0];
  const now = new Date();
  const cutoff = now.getHours()*60 + now.getMinutes() - 20;
  return candidates.find(row => {
    const hours = [...row.time.matchAll(/(\d{1,2}):(\d{2})/g)];
    const end = hours.at(-1);
    return end && Number(end[1])*60+Number(end[2])>=cutoff;
  });
}

const tourGroups = [
  ['八市老街','bashi','kaihe-road','yingping-road'],
  ['中山路街区','zhongshan-road','china-city'],
  ['殿前 · 二选一','dianqian-exit-five','qingshui-palace'],
  ['龙舟池一带','jimei-village','jimei-dragon-boat-pool','nanxun-lou','south-dike-park'],
  ['嘉庚公园一带','jiageng-park','aoyuan'],
  ['集美大社与石鼓路','jimei-dashe','shigu-road'],
  ['沙坡尾','shapowei-art','shapowei-harbor'],
  ['厦大与演武沿岸','xmu-exterior','cat-street','yanwu-platform'],
  ['白城与炮台','baicheng-beach','hulishan-fort'],
  ['珍珠湾与曾厝垵','pearl-bay','zengcuoan'],
  ['天泉步道与盼归塔','tianquan-square','pangui-tower'],
  ['沿海步道','music-square','xitouxia','haiyuntai'],
  ['黄厝海边','buzai-bookstore','wanyue-slope','huangcuo-beach','yefengzhai'],
  ['鼓浪屿西岸','gulang-stone','meihua-beach'],
  ['港仔后与菽庄','gangzaihou-beach','shuzhuang-garden'],
  ['鼓浪屿历史建筑','joint-court','bagua-organ-museum'],
  ['老城散步','xian-flower-market','park-west-road','huaxin-road','caopuwei-road','xingfu-road','gugong-road','sibei','zhongshan-park']
];
const groupLabels = new Map(tourGroups.flatMap(([label,...ids])=>ids.map(id=>[id,label])));
function groupedStops(rows) {
  const groups = [];
  for (const row of rows) {
    const name = groupLabels.get(row.id);
    if (name && groups.at(-1)?.name === name) groups.at(-1).rows.push(row);
    else groups.push({name,rows:[row]});
  }
  return groups;
}

function urgentNotes(module) {
  if (module.id==='gulangyu') {
    return '<div class="urgent">'+icon('ferry')+'<p><strong>鼓浪屿当天往返。</strong> 三丘田夜航至厦门轮渡码头，提前核对末班、停检与停航。'+
      external('轮渡官网',ferrySite,'inline-link')+'</p></div>';
  }
  if (module.id==='coast') {
    return '<div class="urgent">'+icon('clock')+'<p><strong>南普陀寺预约。</strong> 出发前在官方小程序核对实名预约时段及证件要求。</p></div>';
  }
  if (module.id==='departure') {
    return '<div class="urgent">'+icon('train')+'<div><p><strong>返程前往厦门北站。</strong> 取行李后出发，建议发车前至少一小时到站。</p>'+travelInfo('xiamen-north')+'</div></div>';
  }
  return '';
}

function dayView(day) {
  const module = moduleAt(day);
  const full = timelineRows(day);
  const [done,total] = dayProgress(day);
  const next = nextStop(day);
  const keyStops = groupedStops(full).flatMap(group=>{
    const stops=group.rows.filter(row=>row.priority==='核心');
    return stops.length?[{time:stops[0].time.split('–')[0],names:stops.map(row=>place(row.id).name),id:stops[0].id}]:[];
  });
  const anniversary = day === 2;
  const nearby = dayFood(day);
  return '<div class="sticky-dates">'+tabs(day)+'</div><header class="day-hero '+(anniversary?'anniversary':'')+'"><img src="./assets/images/'+dayImage(module)+'.webp" alt=""><div>'+
    '<p class="eyebrow">DAY '+two(day+1)+' · '+shortDate(data.itinerary.dates[day])+' '+weekName[day]+'</p><h1>'+dayTitle(day)+'</h1>'+
    '<p>'+escape(module.area)+(anniversary?' · 一周年纪念日':'')+'</p></div></header>'+
    '<section class="overview panel"><div class="overview-meta"><span>'+icon('clock')+' 建议出门 <strong>'+escape(module.departure)+'</strong></span><span>'+done+'/'+total+' 已打卡</span></div>'+
    '<div class="core-schedule" aria-label="核心行程">'+keyStops.map(row=>
      '<a href="#trip/'+day+'/'+row.id+'"><time>'+escape(row.time)+'</time><span>'+escape(row.names.join('、'))+'</span></a>').join('')+'</div>'+
    '<div class="actions">'+(next?button('下一站 · '+escape(place(next.id).name),'jump','stop-'+next.id,'primary','pin'):'')+
    link('当天地图','#map/'+day,'secondary','map')+button('提醒','jump','day-notes','text')+'</div></section>'+
    urgentNotes(module)+
    (anniversary?'<div class="anniversary-line">'+icon('heart')+' 18:30 后 · 纪念日晚间自由活动</div>':'')+
    '<section class="day-timeline"><div class="section-heading"><h2>时间轴</h2><div class="mode-toggle" aria-label="行程展示">'+
    chip('紧凑','compact',ui.timeline==='compact','timeline')+chip('详细','detail',ui.timeline==='detail','timeline')+'</div></div>'+
    '<div class="timeline '+(ui.timeline==='detail'?'is-detailed':'')+'">'+groupedStops(full).map(group=>stopGroup(group,day,nearby)).join('')+'</div></section>'+
    '<section id="day-notes" class="panel notes">'+section('当天注意事项')+'<ul>'+module.reminders.map(line=>'<li>'+escape(line)+'</li>').join('')+'</ul>'+
    (module.id==='gulangyu'?external('厦门轮渡官网',ferrySite,'secondary','ferry'):'')+
    (module.id==='departure'?'<div class="actions">'+data.itinerary.departureBackup.map(id=>link(escape(place(id).name),'#backup','text')).join('')+'</div>':'')+'</section>'+
    dayFoodFooter(nearby,day) ;
}

function dayFoodFooter(nearby,day) {
  const visited=new Set(timelineRows(day).map(row=>row.id));
  const overflow = nearby.filter(item => item.group==='纪念日晚餐' || !item.placeIds.some(id=>visited.has(id)));
  return '<section id="day-food">'+section(overflow.length?'其他就近吃喝':'顺路吃喝',link('美食库','#food','text'))+
    (overflow.map(item=>foodCard(item,'day-'+day)).join('')||'<p class="fine">按上方游览区域查看就近店铺。</p>')+'</section>';
}

function stopGroup(group,day,nearby) {
  const associated = nearby.filter(item=>item.group!=='纪念日晚餐' && group.rows.some(row=>item.placeIds.includes(row.id)));
  const first = group.rows[0];
  return '<section class="stop-group"><header class="stop-group-top"><time>'+escape(first.time)+'</time>'+
    (group.rows.length>1?'<strong>'+escape(group.name)+'</strong>':'')+'</header>'+
    group.rows.map((row,i)=>timelineStop(row,day,i===0)).join('')+
    (associated.length?detail('near-'+day+'-'+first.id,'<span class="near-label">'+icon('food')+'附近吃喝</span><span class="near-names">'+
      escape(associated.map(item=>item.name).join('、'))+'</span>',associated.map(item=>foodCard(item,'near-'+day+'-'+first.id)).join(''),'nearby-food'):'')+'</section>';
}

function timelineStop(row,day,first) {
  const item = place(row.id);
  const key = day+'-'+row.time+'-'+item.id;
  const currentStatus = checkState('places',item.id).status;
  return '<article '+(row.priority==='交通'?'':'id="stop-'+item.id+'" ')+'class="timeline-stop'+(item.photo?'':' no-photo')+'"><div class="stop-line">'+
    '<div class="stop-name"><h3>'+escape(item.name)+'</h3><div class="stop-meta">'+flag(row.priority,row.priority==='核心'?'core':'')+
    (first?'':'<time>'+escape(row.time)+'</time>')+(currentStatus==='skipped'?'<span>已跳过</span>':'')+checkinBy('places',item.id)+'</div></div>'+
    '<div class="stop-tools">'+quickNav(item)+
    (row.priority==='交通'?'':button('', 'done','places:'+item.id,'compact-icon '+(currentStatus==='done'?'success':''),'check',
      'aria-label="'+(currentStatus==='done'?'已完成 ':'打卡 ')+escape(item.name)+'" aria-pressed="'+(currentStatus==='done')+'"'))+'</div></div>'+
    travelInfo(item.id)+(item.photo?'<p class="photo-preview">'+icon('camera')+' '+escape(item.photo.area)+'</p>':'')+
    detail(key,'<span>'+ (item.photo?'详情与拍照':'详情与导航')+'</span>',
      '<p>'+escape(item.summary)+' · '+escape(row.duration)+'</p>'+
      (row.note?'<p class="callout">'+escape(row.note)+'</p>':'')+
      mapLinks(item)+verification(item)+(row.priority==='交通'?'':checkControls('places',item,true))+
      (item.photo?photoPanel(item):'')+placeNote(item),'stop-detail')+'</article>';
}

function checkControls(type,item,alreadyHasButton=false) {
  const stored = checkState(type,item.id);
  const label = statusLabels[type];
  return '<div class="check-controls">'+(alreadyHasButton?'':button(stored.status==='done'?'已完成':'完成打卡','done',type+':'+item.id,stored.status==='done'?'success':'secondary','check',
    'aria-pressed="'+(stored.status==='done')+'"'))+
    '<label class="check-select"><span class="sr-only">'+escape(item.name)+'打卡状态</span><select data-update="status" data-id="'+item.id+'" data-type="'+type+'" aria-label="'+escape(item.name)+'打卡状态">'+
    Object.entries(statuses).map(([id,text])=>option(id,text,stored.status)).join('')+'</select></label>'+
    button(stored.favorite?'已收藏':'收藏','favorite',type+':'+item.id,stored.favorite?'rose':'secondary','heart',
      'aria-pressed="'+stored.favorite+'" aria-label="'+(stored.favorite?'取消':'')+'收藏'+label+' '+escape(item.name)+'"')+'</div>';
}

function placeCard(item) {
  return '<article class="place-card panel"><div class="place-main"><h3>'+escape(item.name)+'</h3><p>'+escape(item.summary)+'</p>'+
    flag(item.region)+(item.photo?'<p class="photo-preview">'+icon('camera')+' '+escape(item.photo.area)+'</p>':'')+
    '<div class="actions">'+quickNav(item)+'</div>'+
    detail('place-'+item.id,'详情与'+(item.photo?'拍照':'导航'),
      mapLinks(item)+verification(item)+checkControls('places',item)+(item.photo?photoPanel(item):''),'place-detail')+'</div></article>';
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

const foodRegions = ['八市与中山路','集美学村与石鼓路','南普陀与厦大周边','鼓浪屿','幸福路与思北','其他备选'];
const foodFilters = {all:'全部',snacks:'小吃',meal:'正餐',drinks:'奶茶咖啡',gifts:'伴手礼',saved:'已收藏',done:'已打卡'};
function foodRegion(item, day = null) {
  if (item.group==='集美或中山路') return day!==null && moduleAt(day).id==='arrival' ? foodRegions[0] : foodRegions[1];
  const groups = ['八市|中山路','集美','南普陀与厦大','鼓浪屿','思北与老城'];
  const i = groups.findIndex(group=>group.split('|').includes(item.group));
  return foodRegions[i===-1?5:i];
}
function matchesFood(item,filter) {
  const saved = checkState('food',item.id);
  if (filter==='saved') return saved.favorite;
  if (filter==='done') return saved.status==='done';
  if (filter==='gifts') return item.kind==='伴手礼';
  if (filter==='drinks') return item.kind==='饮品' || /咖啡/u.test(item.name);
  if (filter==='meal') return item.kind==='正餐' || item.priority==='正餐备选';
  if (filter==='snacks') return ['小吃','甜点','烘焙'].includes(item.kind);
  return true;
}

function foodCard(item,context='food') {
  const saved = checkState('food',item.id);
  return '<article class="food-card"><div class="food-top"><div><h3>'+escape(item.name)+'</h3>'+
    '<p>'+escape(item.recommended||'按现场选择')+'</p><small>'+escape(item.address||item.region)+'</small>'+checkinBy('food',item.id)+'</div>'+
    '<div class="food-tools">'+quickNav(item)+button('', 'favorite','food:'+item.id,'compact-icon '+(saved.favorite?'rose':''),'heart',
      'aria-pressed="'+saved.favorite+'" aria-label="'+(saved.favorite?'取消':'')+'收藏美食 '+escape(item.name)+'"')+
    button('', 'done','food:'+item.id,'compact-icon '+(saved.status==='done'?'success':''),'check',
      'aria-pressed="'+(saved.status==='done')+'" aria-label="'+(saved.status==='done'?'已打卡 ':'打卡 ')+escape(item.name)+'"')+'</div></div>'+
    detail(context+'-'+item.id,'店铺详情'+(saved.status==='skipped'?' · 已跳过':''),
      '<p class="fine">'+escape(item.kind)+' · '+escape(item.priority)+'</p>'+verification(item)+mapLinks(item)+checkControls('food',item,true),'food-detail')+'</article>';
}

function foodView() {
  const day = ui.foodDay==='all' ? null : Number(ui.foodDay);
  const source = day===null ? foods() : dayFood(day);
  const groups = foodRegions.filter(group=>source.some(item=>foodRegion(item,day)===group));
  const result = source.filter(item => (ui.foodGroup==='全部'||foodRegion(item,day)===ui.foodGroup) &&
    matchesFood(item,ui.foodMode) &&
    (item.name+item.region+item.recommended+item.address).toLowerCase().includes(ui.foodQuery.trim().toLowerCase()));
  return heading('顺路吃喝')+
    '<div class="chips food-filters">'+Object.entries(foodFilters).map(([id,label])=>chip(label,id,ui.foodMode===id,'foodMode')).join('')+'</div>'+
    '<form data-form="foodSearch" class="search-form"><label class="search-label">'+icon('search')+'<span class="sr-only">搜索美食</span><input type="search" name="query" placeholder="搜店名、菜品或区域" maxlength="100" value="'+escape(ui.foodQuery)+'"></label><button class="button primary">搜索</button>'+
    (ui.foodQuery?button('清除','clearSearch'):'')+'</form>'+
    '<div class="filter-fields"><label>按日期<select data-update="foodDay">'+option('all','所有日期',ui.foodDay)+
    data.itinerary.dates.map((d,i)=>option(String(i),shortDate(d)+' '+dayTitle(i),ui.foodDay)).join('')+'</select></label>'+
    '<label>按区域<select data-update="foodGroup">'+['全部',...groups].map(group=>option(group,group,ui.foodGroup)).join('')+'</select></label></div>'+
    '<div class="section-heading"><h2>'+result.length+' 条美食</h2>'+link('添加美食','#custom','text','plus')+'</div>'+
    (result.length?groups.filter(group=>result.some(item=>foodRegion(item,day)===group)).map(group=>'<section class="food-group"><h3>'+escape(group)+'</h3>'+
      result.filter(item=>foodRegion(item,day)===group).map(item=>foodCard(item)).join('')+'</section>').join(''):empty('没有符合筛选的美食。'));
}

const mapFilters = {all:'全部',sights:'今日景点',photos:'摄影机位',food:'美食',transit:'交通',backup:'备选景点'};
const backupIds = () => [...data.backup['old-town'],...data.backup.outer];
const mapType = item => item.recommended !== undefined ? 'food' : 'place';

function mapItems(day) {
  const module = day===null ? null : moduleAt(day);
  const tripIds = day === null ? unique(data.itinerary.modules.flatMap(m => m.itinerary.map(row=>row.id))) :
    unique(module.itinerary.map(row=>row.id));
  if (module?.id==='jimei' && !tripIds.includes('metro-line-one')) tripIds.push('metro-line-one');
  const optional = day===null ? backupIds() :
    unique([...backupIds().filter(id=>tripIds.includes(id)), ...(module.id==='departure'?data.itinerary.departureBackup:[])]);
  const customPoints = state.customPlaces.filter(item=>day===null||item.moduleId===module.id).map(item=>place(item.id));
  const mapFood = day===null?foods():dayFood(day);
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

const ferryStops = new Set(['dongdu-ferry','neicuoao-ferry','sanqiutian-ferry','xiamen-ferry']);
const mapKinds = {
  sight:['景点','pin'],photo:['机位','camera'],food:['美食','food'],
  transit:['交通','train'],backup:['备选','spark'],ferry:['轮渡','ferry']
};
let liveMap;
let mapPositions;
const mapViews = new Map();
const mapKey = item => mapType(item)+':'+item.id;
const coordinate = item => data.geo?.points[item.id];

function markerKind(item) {
  if (ferryStops.has(item.id)) return 'ferry';
  if (['交通','住宿'].includes(item.kind)) return 'transit';
  if (mapType(item)==='food') return 'food';
  if (ui.mapFilter==='backup'||item.kind==='备选') return 'backup';
  return ui.mapFilter==='photos' ? 'photo' : 'sight';
}

function mapSelection(item, popup = false) {
  const point = coordinate(item);
  const region = item.address || point?.address || item.region;
  const intro = ui.mapFilter==='photos'&&item.photo ? item.photo.area : item.summary||item.recommended||'';
  return '<h3>'+escape(item.name)+'</h3><p>'+escape(region)+(intro?' · '+escape(intro):'')+'</p>'+
    travelInfo(item.id)+
    (point?'<p class="fine">'+escape(point.note||'')+' '+external('点位来源',point.source,'inline-link')+'</p>':'<p class="fine">点位待定位，可按关键词查找。</p>')+
    mapLinks(item)+
    (popup ? '' : ((item.verification?verification(item):'')+
      (item.photo?detail('map-photo-'+item.id,'查看摄影机位',photoPanel(item)):'')));
}

function mapView(day) {
  const rows = mapItems(day);
  return heading(day===null?'旅行总地图':'当天路线地图',day===null?'':escape(moduleAt(day).area))+
    tabs(day,true)+'<div class="chips map-chips" aria-label="地图类别">'+
    Object.entries(mapFilters).map(([value,label])=>chip(day===null&&value==='sights'?'正式景点':label,value,ui.mapFilter===value,'mapFilter')).join('')+'</div>'+
    '<section class="panel map-panel">'+section('地理地图',button('恢复视野','mapReset','','text','','disabled'))+
    '<div id="geo-frame" class="geo-frame" aria-label="厦门交互地图"><div id="geo-map" class="geo-map"></div>'+
    '<p id="geo-status" class="geo-status" role="status">正在加载底图…</p></div>'+
    '<div id="geo-fallback" class="geo-fallback" hidden><p id="geo-fallback-reason" class="fine" role="status"></p>'+
    '<div class="actions">'+button('重试在线地图','mapRetry','','text')+'</div></div>'+
    '<div class="geo-legend" aria-label="地图标记说明">'+Object.entries(mapKinds).map(([key,[label,glyph]])=>
      '<span><i class="'+key+'">'+icon(glyph)+'</i>'+label+'</span>').join('')+'</div>'+
    '<p class="fine">'+icon('ferry')+' 跨海轮渡按实际船票乘坐。地图数字为当天的行程顺序。 '+
    external('报告底图问题','https://www.openstreetmap.org/fixthemap','inline-link')+'</p>'+
    detail('map-schematic','离线备用 · 路线示意图（无比例尺）',day===null?regionScheme():routeScheme(day),'map-schematic')+
    '<article id="map-selection" tabindex="-1" class="map-selection" hidden></article></section>'+
    '<section id="map-index">'+section('地点索引',link('添加地点','#custom','text','plus'))+
    '<p id="map-count" class="fine">'+rows.length+' 个匹配地点</p><div id="map-rows" class="index-list"></div></section>';
}

function mapIndex(day) {
  const rows = mapItems(day);
  const mapped = rows.filter(coordinate);
  const pending = rows.filter(item=>!coordinate(item));
  const list = items => items.map(item=>{
    const point = coordinate(item);
    const kind = markerKind(item);
    return '<div class="index-row"><div><h3>'+escape(item.name)+'</h3><p>'+escape(item.address||point?.address||item.region)+' · '+mapKinds[kind][0]+'</p></div>'+
      button(point?'定位':'查找','mapPick',mapKey(item),'compact-icon','pin','aria-label="查看 '+escape(item.name)+' 地图"')+'</div>';
  }).join('');
  document.querySelector('#map-count').textContent=rows.length+' 个地点 · '+mapped.length+' 个有点位';
  document.querySelector('#map-rows').innerHTML=(pending.length?
    detail('map-pending','待定位 '+pending.length+' 项 · 按关键词查找',list(pending),'pending-places'):'')+
    (mapped.length?detail('map-mapped','有点位 '+mapped.length+' 项',list(mapped),'mapped-places'):'')+
    (rows.length?'':empty('这个日期和类别暂时没有地点。'));
}

function showMapSelection(key, scroll = true) {
  const [type,id] = key.split(':');
  const item = type==='food' ? foods().find(item=>item.id===id) : data.placeById.has(id)||state.customPlaces.some(row=>row.id===id) ? place(id) : undefined;
  const target = document.querySelector('#map-selection');
  if (!target||!item) return;
  target.hidden=false;
  target.innerHTML=mapSelection(item);
  const located = liveMap?.locate(key);
  if (scroll) jump(located?'geo-frame':'map-selection');
}

function loadMapPositions() {
  if (!mapPositions) {
    mapPositions=fetch('./data/map-positions.json').then(response=>{
      if (!response.ok) throw new Error('Map coordinates unavailable');
      return response.json();
    }).then(geo=>{
      if (geo.crs!=='WGS84') throw new Error('Unexpected map coordinate system');
      data.geo=geo;
    }).catch(()=>{mapPositions=null;});
  }
  return mapPositions;
}

async function showMap() {
  const target = document.querySelector('#geo-map');
  const frame = document.querySelector('#geo-frame');
  const fallbackBlock = document.querySelector('#geo-fallback');
  const day = current.day;
  const filter = ui.mapFilter;
  const viewKey = day+'-'+filter;
  mapIndex(day);
  const fallback = reason=>{
    frame.hidden=true;
    fallbackBlock.hidden=false;
    main.querySelector('[data-action=mapReset]').disabled=true;
    fallbackBlock.querySelector('p').textContent=reason;
    const schematic=main.querySelector('.map-schematic');
    if (schematic) schematic.open=true;
  };
  if (!navigator.onLine) fallback('当前离线，已切换为路线示意图。');
  await loadMapPositions();
  if (!target.isConnected) return;
  const openLists=[...main.querySelectorAll('#map-rows details[open]')].map(node=>node.dataset.detail);
  mapIndex(day);
  for (const name of openLists) main.querySelector('#map-rows details[data-detail="'+name+'"]').open=true;
  if (ui.mapId) showMapSelection(ui.mapId,false);
  if (!navigator.onLine) return;
  if (!data.geo) {fallback('地点地图暂时不可用，已切换为路线示意图。');return;}

  const rows = mapItems(day);
  const order = day===null ? [] : unique(moduleAt(day).itinerary.map(row=>row.id));
  const points=rows.filter(coordinate).map(item=>{
    const kind=markerKind(item);
    const number=order.indexOf(item.id)+1;
    const badge = kind==='ferry' ? icon('ferry')+(number?'<small>'+number+'</small>':'') :
      number ? String(number) : icon(mapKinds[kind][1]);
    return {key:mapKey(item),title:item.name,kind,badge,position:coordinate(item).position,popup:mapSelection(item,true)};
  });
  const ferryModule = day===null ? moduleAt(state.order.indexOf('gulangyu')+1) : moduleAt(day);
  const ferryEdges=['all','transit'].includes(filter) ? ferryModule.ferryEdges??[] : [];
  const ferries=ferryEdges.map(edge=>data.geo.ferries[edge.join(':')]).filter(Boolean);
  liveMap=mountGeoMap({
    target,points,ferries,savedView:mapViews.get(viewKey),
    extent:order.map(id=>data.geo.points[id]?.position).filter(Boolean),
    onView:position=>mapViews.set(viewKey,position),
    onReady:()=>{
      main.querySelector('[data-action=mapReset]').disabled=false;
      if (ui.mapId) liveMap?.locate(ui.mapId);
    },
    onFallback:()=>{
      if (target.isConnected) fallback(navigator.onLine?'在线底图暂时不可用，已切换为路线示意图。':'当前离线，已切换为路线示意图。');
    }
  });
}

const myPages = [
  ['shared','共享旅行空间','user','登录、旅行房间和云同步'],
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
  return heading('我的旅行手账','可在本地模式或共享旅行房间中查看记录。')+
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
        statuses[checkState(type,item.id).status]+(checkState(type,item.id).favorite?' · 已收藏':'')+checkinBy(type,item.id)+'</p></div>'+
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
  return heading('我的旅行信息',displayedRoom()?'保存后会向当前房间成员共享住宿、车次和此表备注。':'仅保存在这台设备。填写后会出现在对应的行程卡片和地图里。',true)+
    '<form data-form="info" data-version="'+cloud.version('setting','travel')+'" class="stack"><section class="panel form-grid">'+section('本岛住宿')+
    field('住宿名称','hotel',details.hotel,'maxlength="100" autocomplete="off" placeholder="本岛住宿点"')+
    field('地址','address',details.address,'maxlength="200" autocomplete="off" placeholder="填写地址以便导航"')+
    '<p class="fine">11月28日入住 · 12月2日退房 · 同一住宿点</p></section>'+
    '<section class="panel form-grid">'+section('抵达和返程')+
    field('11月28日 · 抵达厦门站','arrivalTime',details.arrivalTime,'type="time"')+
    field('抵达班次（选填）','arrivalService',details.arrivalService,'maxlength="100" autocomplete="off"')+
    field('12月2日 · 厦门北站发车','departureTime',details.departureTime,'type="time"')+
    field('返程班次（选填）','departureService',details.departureService,'maxlength="100" autocomplete="off"')+
    '<label>鼓浪屿上岛码头<select name="ferryArrival">'+option('','默认：内厝澳',details.ferryArrival)+option('sanqiutian','已买三丘田上岛船票',details.ferryArrival)+'</select></label>'+
    '<label>'+(displayedRoom()?'共享旅行备注':'私人备注')+'<textarea name="notes" maxlength="1000" rows="3">'+escape(details.notes)+'</textarea></label></section>'+
    '<button class="button primary">保存旅行信息</button></form>';
}

function adjustment() {
  return heading('调整行程','抵达和返程锁定在原日期。11月30日始终保留纪念日标识。',true)+
    '<section class="panel adjust-list">'+section('当前顺序')+
    state.order.map((id,i)=>'<div class="index-row"><span>'+shortDate(data.itinerary.dates[i+1])+'</span><strong>'+escape(data.modules.get(id).swapTitle||data.modules.get(id).title)+'</strong>'+
      (i===1?flag('纪念日','pink'):'')+'</div>').join('')+'</section>'+
    '<form class="panel form-grid" data-form="swap" data-version="'+cloud.version('itinerary','order')+'">'+section('交换两天')+
    [0,1].map((index)=>'<label>日期 '+(index+1)+'<select name="date'+index+'">'+state.order.map((m,i)=>option(String(i),shortDate(data.itinerary.dates[i+1])+' · '+(data.modules.get(m).swapTitle||data.modules.get(m).title),String(index))).join('')+'</select></label>').join('')+
    '<p class="callout">换日后请重新核对预约、船票、开放时间与天气。打卡、机位收藏和备注会保留。</p>'+
    '<div class="actions"><button class="button primary">交换日期</button>'+button('恢复原始行程','restoreOrder')+'</div></form>';
}

const fixedCosts = [
  {category:'高铁',reference:'往返高铁'},
  {category:'酒店',reference:'酒店四晚'},
  {category:'轮渡',reference:'鼓浪屿船票'},
  {category:'门票',reference:'景区门票'}
];
const expenseGroups = {
  '餐饮':['正餐','小吃','奶茶与咖啡'],
  '市内交通':['打车','地铁','轮渡'],
  '高铁与住宿':['高铁','酒店'],
  '门票与其他':['门票','特产','购物','纪念日','其他']
};
const expenseAmount = (value = '') => field('金额（元）','amount',value,'type="number" min=".01" max="10000000" step=".01" inputmode="decimal" required');

function expenseCategories(current = '') {
  return '<label>分类<select name="category" required>'+option('','选择分类',current)+
    data.budget.categories.map(value=>option(value,value,current)).join('')+'</select></label>';
}

function quickExpenseForm(today) {
  return '<form id="quick-expense" class="panel form-grid quick-expense" data-form="expense" data-quick="true">'+section('快捷记账')+
    '<div class="form-columns">'+expenseCategories()+expenseAmount()+'</div>'+
    '<div class="field-line">'+field('日期','date',today,'type="date" required')+
    '<button class="button primary">保存支出</button></div>'+
    detail('quick-fields','更多选填项',
      '<div class="form-grid">'+field('店铺或事项（选填）','title','','maxlength="120"')+
      payerField()+
      '<label>备注<textarea name="notes" maxlength="500" rows="2"></textarea></label>'+
      '<label class="tick"><input name="shared" type="checkbox" checked> ' +(displayedRoom()?'纳入房间共同分摊':'两人共同支出')+'</label></div>')+'</form>';
}

function budget() {
  const refs = data.budget.references;
  const subtotal = refs.reduce((sum,ref)=>sum+toCents(ref.amount??0),0);
  const today = localDate();
  const spent = expenseCents(state.expenses);
  const budgetTotal = state.total;
  const balance = budgetBalance();
  const remainingDays = data.itinerary.dates.filter(day=>day>=today).length;
  const average = balance===null||!remainingDays ? null : Math.floor(Math.max(0,balance)/remainingDays);
  const format = cents => cents===null?'—':centMoney(cents);
  const categoryTotal = categories => expenseCents(state.expenses.filter(item=>categories.includes(item.category)));
  const fixed = fixedCosts.map(({category,reference})=>{
    const quoted = refs.find(ref=>ref.name===reference)?.amount;
    const paid = categoryTotal([category]);
    return {category,paid,estimate:quoted==null?null:Math.max(0,toCents(quoted)-paid)};
  });
  const fixedPaid = fixed.reduce((sum,row)=>sum+row.paid,0);
  const fixedRemaining = fixed.reduce((sum,row)=>sum+(row.estimate??0),0);
  const days = unique([...data.itinerary.dates,...state.expenses.map(item=>item.date)]).sort();
  const edit = state.expenses.find(item=>item.id===ui.editExpense);
  const dated = (ui.budgetDay==='all'?state.expenses:state.expenses.filter(item=>item.date===ui.budgetDay)).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const categoryTotals = data.budget.categories.map(name=>[name,categoryTotal([name])]).filter(([,sum])=>sum>0).sort((a,b)=>b[1]-a[1]);
  const members=cloud.selected?.members.filter(member=>member.active).length??0;
  const people=displayedRoom()?sharedRows.get('setting/size')?.body?.count??Math.max(1,members):2;
  const sharedTotal=expenseCents(state.expenses.filter(item=>item.shared));
  return heading(displayedRoom()?'共同旅行账本':'旅行预算',displayedRoom()?'此页的所有账目均对当前房间成员可见。':'',true)+
    '<section class="panel budget-hero"><div class="budget-summary">'+
    '<div><span>'+((balance??0)<0?'已超预算':'剩余预算')+'</span><strong>'+(balance===null?'待设置':centMoney(Math.abs(balance)))+'</strong></div>'+
    '<div><span>今日消费</span><strong>'+centMoney(expenseCents(state.expenses.filter(item=>item.date===today)))+'</strong></div>'+
    '<div><span>日均剩余可用</span><strong>'+format(average)+'</strong></div>'+
    '<div><span>总预算</span><strong>'+(budgetTotal===null?'待设置':money(budgetTotal))+'</strong></div>'+
    '<div><span>实际累计支出</span><strong>'+centMoney(spent)+'</strong></div>'+
    '<div><span>人均实际支出</span><strong>'+centMoney(Math.round((displayedRoom()?sharedTotal:spent)/people))+'</strong></div></div>'+
    (displayedRoom()?'<p class="fine">共同支出 '+centMoney(sharedTotal)+' · 按 '+people+' 人分摊。累计支出含本房间全部账目。</p>':'')+
    '<p class="fine">'+(remainingDays?'余 '+remainingDays+' 个旅行日 · 日均仅供参考':'旅行日期已结束')+'</p>'+
    (budgetTotal===null?'':progress(Math.min(spent,toCents(budgetTotal)),toCents(budgetTotal),'总预算已使用')+
      '<p class="fine">已使用 '+(budgetTotal===0?(spent===0?'0%':'超出零元预算'):Math.round(spent/toCents(budgetTotal)*100)+'%')+'</p>')+
    '<div class="actions">'+button('快捷记账','jump','quick-expense','primary','plus')+
    button('完整记账','jump','expense-form','secondary','list')+'</div>'+
    detail('budget-total','编辑总预算','<form class="field-line" data-form="budgetTotal" data-version="'+cloud.version('setting','budget')+'">'+
      field('设置总预算（元）','amount',budgetTotal??'','type="number" min="0" max="10000000" step=".01" inputmode="decimal" placeholder="留空表示待设置"')+
      '<button class="button secondary">保存</button></form>')+'</section>'+
    quickExpenseForm(today)+accountExpenses()+
    '<section class="panel cost-panel">'+section('旅行固定成本')+
    '<div class="budget-summary"><div><span>已支付（按记账）</span><strong>'+centMoney(fixedPaid)+'</strong></div>'+
    '<div><span>尚未支付的已知预估</span><strong>'+centMoney(fixedRemaining)+'</strong></div></div>'+
    '<p class="fine">按类别从原预估扣除已记支出。轮渡、门票等未设预估的项目单独标明。</p>'+
    detail('fixed-costs','查看固定成本明细',fixed.map(row=>'<div class="index-row"><span>'+row.category+'</span><span>已记 '+centMoney(row.paid)+
      ' · 余估 '+(row.estimate===null?'待确认':centMoney(row.estimate))+'</span></div>').join(''))+'</section>'+
    '<section class="panel">'+section('已知预算参考小计',flag(centMoney(subtotal),'core'))+
    detail('budget-reference','看预估明细',refs.map(ref=>'<div class="index-row"><span>'+escape(ref.name)+(ref.detail?' <small>'+escape(ref.detail)+'</small>':'')+'</span><strong>'+ (ref.amount===null?'待填写':money(ref.amount))+'</strong></div>').join(''))+'</section>'+
    '<form id="expense-form" class="panel form-grid" data-form="expense" data-id="'+(edit?.id??'')+'">'+section(edit?'修改支出':'完整记账')+
    '<div class="form-columns">'+field('日期','date',edit?.date??(ui.budgetDay==='all'?today:ui.budgetDay),'type="date" required')+
    expenseAmount(edit?.amount??'')+'</div>'+expenseCategories(edit?.category??'正餐')+
    field('店铺或事项', 'title',edit?.title??'','maxlength="120" required')+
    payerField(edit)+
    '<label>备注<textarea name="notes" maxlength="500" rows="2">'+escape(edit?.notes??'')+'</textarea></label>'+
    '<label class="tick"><input name="shared" type="checkbox"'+(!edit||edit.shared?' checked':'')+'> ' +(displayedRoom()?'纳入房间共同分摊':'两人共同支出')+'</label>'+
    '<div class="actions"><button class="button primary">'+(edit?'保存修改':'添加支出')+'</button>'+(edit?button('取消修改','cancelExpense'):'')+'</div></form>'+
    '<section class="panel">'+section('每日账单')+
    '<label>查看日期<select data-update="budgetDay">'+option('all','全部日期',ui.budgetDay)+days.map(day=>option(day,day,ui.budgetDay)).join('')+'</select></label>'+
    '<p class="subtle">所选日期累计 '+money(calculate(dated))+'</p>'+
    (dated.map(item=>'<article class="expense"><div><h3>'+escape(item.title)+'</h3><p>'+escape(item.date)+' · '+escape(item.category)+' · '+(item.shared?'共同支出':'个人支出')+
      (payerName(item)?' · '+escape(payerName(item)):'')+'</p>'+(item.notes?'<p>'+escape(item.notes)+'</p>':'')+'</div><strong>'+money(item.amount)+'</strong>'+
      '<div class="actions">'+button('修改','editExpense',item.id,'text')+button('删除','deleteExpense',item.id,'text danger')+'</div></article>').join('')||empty('所选日期还没有账单。'))+
    detail('daily-expenses','查看每天合计',days.map(day=>'<div class="index-row"><span>'+escape(day)+'</span><strong>'+money(calculate(state.expenses.filter(item=>item.date===day)))+'</strong></div>').join(''))+
    '<div class="actions">'+button('导出 CSV','exportCsv','','secondary','download')+button('导出 JSON 账单','exportExpenses','','secondary','download')+'</div></section>'+
    '<section class="panel">'+section('分类统计')+
    Object.entries(expenseGroups).map(([name,categories])=>'<div class="index-row"><span>'+name+'</span><strong>'+centMoney(categoryTotal(categories))+'</strong></div>').join('')+
    detail('budget-categories','查看各类支出占比',categoryTotals.map(([name,value])=>'<div class="budget-category"><div><span>'+escape(name)+'</span><strong>'+money(value)+
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
    '<section class="panel">'+section('离线状态',flag('V3.0','core'))+'<p id="offline-status">'+(loadedOffline?'核心行程已缓存，可离线查看。':'正在检查缓存。如长期未就绪，请联网后重新打开。')+'</p>'+
    '<p class="subtle">本地行程、图片、打卡和预算可离线使用。在线底图、地图导航及外链需要联网。断网时会显示路线示意图。</p></section>'+
    '<section class="panel">'+section('安全更新')+'<p>联网打开一次后，关闭所有打开本站的标签页或主屏幕窗口，再重新打开。看到更新提示时，请先保存表单内容。</p>'+
    '<p class="fine">更新会沿用现有记录。可先导出备份，更新时无需清除 Safari 网站数据。</p>'+link('导出备份','#records','text','download')+'</section>'+
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

const cloud=new CloudTrip(cloudChanged);
const scopeName=()=>cloud.selected?.trip.name;
let shownScope;
let sharedRows=new Map();
function displayedRoom() {return Boolean(cloud.selected);}
function viewState() {
  sharedRows=displayedRoom()?cloud.rows:new Map();
  return displayedRoom()?projectRoom(sharedRows,cloud.room.notes,data):localState;
}
function cloudStatus() {
  const status=syncNames[cloud.state];
  const pending=cloud.queue.length;
  const last=cloud.selected?.lastSync;
  const text=status+(pending?' · 待确认 '+pending+' 项':'')+
    (last?' · 上次 '+new Date(last).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):'')+
    (displayedRoom()&&!cloud.isRealtime?' · 定期检查':'');
  for (const node of document.querySelectorAll('[data-cloud-status]')) {
    if (node.textContent!==text) node.textContent=text;
  }
}
function cloudChanged(refresh=false) {
  if(!data||!current) return;
  if (cloud.recovery&&current.page!=='shared') {location.hash='shared';return;}
  if ((cloud.phase==='ready'||cloud.phase==='setup')&&new URLSearchParams(location.search).get('auth')==='return'&&
      !location.hash.includes('access_token=')) {
    const url=new URL(location.href);
    url.searchParams.delete('auth');
    url.hash='shared';
    history.replaceState(null,'',url);
    current=route();
    refresh=true;
  }
  const context=cloud.actor&&cloud.room?cloud.actor+'/'+cloud.room.trip:'';
  const changedScope=context!==shownScope;
  if(changedScope) {
    shownScope=context;
    resetScopeUi();
  }
  state=viewState();
  if ((changedScope||refresh)&&(!main.querySelector('form[data-dirty]')||changedScope)) render(true);
  else cloudStatus();
}
function resetScopeUi() {
  ui.editExpense='';
  ui.editExpenseVersion=0;
  ui.noteEdit='';
  ui.noteVersion=0;
  ui.migrateTravel=false;
  ui.migrateNotes=false;
  ui.mapId='';
}
function prepareCloudRoute() {
  if(location.hash.startsWith('#join/')) {
    cloud.captureInvite(location.hash);
    history.replaceState(null,'',location.pathname+location.search+'#shared');
  }
  if(shouldConnect()) cloud.boot();
}
const cloudViewTools={escape,heading,section,button,link,flag,detail,field,option,money};
function cloudPage() {return sharedView(cloud,cloudViewTools,ui,storageFailure?null:localState);}
function roomContext() {
  return displayedRoom()?'<a class="room-context" href="#shared"><strong>'+escape(scopeName())+'</strong><span data-cloud-status></span></a>':
    cloud.room?'<p class="room-context">正在读取共享房间。未打开时仍使用本机数据。</p>':'';
}
function checkinBy(type,id) {
  if (!displayedRoom()) return '';
  const row=sharedRows.get('checkin/'+type+':'+id);
  if(row?.body?.status!=='done') return '';
  const member=cloud.selected.members.find(member=>member.id===row.actor);
  return '<span class="checkin-by">'+escape(member?.nickname??'旅行成员')+' · '+
    escape(new Date(row.updated_at).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+'</span>';
}
function placeNote(item) {
  if (!displayedRoom()) return '';
  const id='spot:'+item.id;
  const note=sharedRows.get('note/'+id)?.body?.text??'';
  return '<div class="shared-place-note"><p class="fine"><strong>共享景点备注</strong> · 房间成员可见</p>'+
    (cloud.editable?'<form class="memo" data-form="cloudNote" data-id="'+escape(id)+'" data-place="'+escape(item.id)+
      '" data-version="'+cloud.version('note',id)+'"><label>共享景点备注<textarea name="text" rows="2" maxlength="1000">'+escape(note)+
      '</textarea></label><button class="button secondary">保存共享备注</button></form>':
      note?'<p>'+escape(note)+'</p>':'<p class="fine">暂无共享备注。</p>')+'</div>';
}
function payerField(expense) {
  if (!displayedRoom()) return field('付款人昵称（选填）','payer',expense?.payer??'','maxlength="60" autocomplete="off"');
  const chosen=expense?sharedRows.get('expense/'+expense.id)?.body?.payer_id??'':cloud.actor;
  return '<label>付款成员<select name="payerMember">'+option('','未分配／房间外付款人',chosen)+
    cloud.selected.members.filter(member=>member.active||member.id===chosen).map(member=>option(member.id,member.nickname+(member.id===cloud.actor?'（我）':member.active?'':'（已退出）'),chosen)).join('')+
    '</select></label>'+field('补充付款人昵称（选填）','payer',expense?.payer??'','maxlength="60" autocomplete="off"');
}
function payerName(expense) {
  const payer=displayedRoom()?sharedRows.get('expense/'+expense.id)?.body?.payer_id:null;
  return cloud.selected?.members.find(member=>member.id===payer)?.nickname??expense.payer;
}
function accountExpenses() {
  if(!displayedRoom()) return '';
  const rows=[...sharedRows.values()].filter(row=>row.kind==='expense'&&row.body);
  const members=cloud.selected.members.filter(member=>member.active||rows.some(row=>row.body.payer_id===member.id));
  const latest=rows.slice().sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,3);
  return '<section class="panel">'+section('成员实付和最近账目')+
    members.map(member=>'<div class="index-row"><span>'+escape(member.nickname)+'</span><strong>'+
      centMoney(rows.filter(row=>row.body.payer_id===member.id).reduce((sum,row)=>sum+row.body.cents,0))+'</strong></div>').join('')+
    '<p class="fine">未分配付款成员 '+centMoney(rows.filter(row=>!row.body.payer_id).reduce((sum,row)=>sum+row.body.cents,0))+'</p>'+
    (latest.length?detail('shared-latest','最近 '+latest.length+' 笔共享消费',latest.map(row=>
      '<div class="index-row"><span>'+escape(row.body.title)+' · '+escape(payerName({id:row.record_id,payer:row.body.payer})||'未分配')+
      '</span><strong>'+centMoney(row.body.cents)+'</strong></div>').join('')):'')+'</section>';
}
function formBase(form,kind,id) {
  return {bases:{[kind+'/'+id]:Number(form.dataset.version||0)}};
}
function cloudError(error) {
  const message=error.code==='42501'?'当前账号没有执行此操作的权限。':
    ['AuthApiError','AuthRetryableFetchError','AuthWeakPasswordError'].includes(error.name)?(
      error.code==='email_not_confirmed'?'请先在邮箱中验证账号。':
      error.code==='invalid_credentials'?'邮箱或密码不正确。':
      error.status===429?'请求太频繁，请稍后再试。':'认证未完成，请检查邮箱、密码或稍后再试。'):
    error.code==='22023'?'操作未被接受，请检查邀请有效期、权限或输入内容。':
    error instanceof Error&&error.message.length<100?error.message:'云端暂时不可用，请稍后重试。';
  showNotice(message);
}
function runCloud(task) {
  return Promise.resolve().then(task).catch(cloudError);
}
function backupRoom() {
  if(!displayedRoom()) return;
  download('厦门纪行-共享房间备份.json',JSON.stringify({
    exportedAt:new Date().toISOString(),trip:cloud.selected.trip,
    records:[...cloud.rows.values()],pending:cloud.queue
  },null,2),'application/json');
}

const views = {shared:cloudPage,home,trip:dayView,map:mapView,food:foodView,me,budget,stats,photos,gifts,backup,info,adjust:adjustment,records,offline,custom};
function render(keepDetails=false) {
  const open = new Set(keepDetails?[...main.querySelectorAll('details[open]')].map(node=>node.dataset.detail):[]);
  const held = keepDetails ? document.activeElement : null;
  const focusable = held?.matches('button[data-action], select[data-update]') ? held : null;
  const focusKey = focusable ? Object.entries(focusable.dataset) : [];
  const focusContext = focusable?.closest('details')?.dataset.detail;
  liveMap?.destroy();
  liveMap=undefined;
  main.innerHTML=roomContext()+(storageFailure&&!displayedRoom()?'<p class="callout">无法读取原有的本地数据。检查 Safari 的站点存储，或从备份恢复。</p>':'')+views[current.page](current.day);
  if (displayedRoom()&&!cloud.editable) {
    const names=['info','budgetTotal','expense','custom','swap','gift'];
    const edits=['done','favorite','photoFavorite','photoTaken','restoreOrder','editExpense','deleteExpense','deleteCustom'];
    for(const node of main.querySelectorAll('input,button,select,textarea')) {
      if(names.includes(node.form?.dataset.form)||edits.includes(node.dataset.action)||node.dataset.update==='status')
        node.disabled=true;
    }
  }
  for (const node of main.querySelectorAll('details')) {
    node.open=open.has(node.dataset.detail) || (ui.timeline==='detail' && node.classList.contains('stop-detail'));
  }
  if (focusable) {
    const replacement = [...main.querySelectorAll(focusable.matches('button')?'button[data-action]':'select[data-update]')]
      .find(node=>node.closest('details')?.dataset.detail===focusContext&&focusKey.every(([key,value])=>node.dataset[key]===value));
    replacement?.focus({preventScroll:true});
  }
  if (current.page==='map') showMap();
  cloudStatus();
  const active = ['home','trip','map','food'].includes(current.page)?current.page:'me';
  navigation.innerHTML=[
    ['home','首页','home'],['trip','行程','itinerary'],['map','地图','map'],['food','美食','food'],['me','我的','user']
  ].map(([page,name,glyph])=>'<a href="#'+page+'"'+(page===active?' aria-current="page"':'')+'>'+icon(glyph)+'<span>'+name+'</span></a>').join('');
  const title = main.querySelector('h1')?.textContent;
  document.title = current.page==='home' ? '与海相约 · 厦门纪行' : title+' · 厦门纪行';
}

function changeRoute() {
  prepareCloudRoute();
  const next=route();
  if (current?.page!==next.page||current?.day!==next.day) {
    if (next.page==='trip') ui.timeline='compact';
    if (next.page==='map'&&current?.page==='map') { ui.mapId=''; ui.mapFilter='all'; }
  }
  current=next;
  render();
  window.scrollTo(0,0);
  main.focus({preventScroll:true});
  if (current.stop) jump('stop-'+current.stop);
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
  cloudAuthMode(value) {ui.cloudAuth=value;render(true);},
  cloudRetry() {return cloud.boot(true);},
  cloudSync() {return cloud.sync();},
  cloudList() {return runCloud(async()=>{await cloud.refreshList();render(true);});},
  cloudOpen(id) {return runCloud(()=>cloud.open(id));},
  cloudLocal() {cloud.closeRoom();cloudChanged(true);showNotice('已切回本机记录');},
  cloudLogout() {
    if(cloud.accountQueue.length&&!window.confirm('还有待同步记录。退出后它们会保存在当前账号的本机备份区。现在退出？'))return;
    return cloud.signOut();
  },
  cloudLeave() {
    const room=cloud.room;
    if(!room||!cloud.selected||!window.confirm('退出后将失去房间的云端访问。是否继续？'))return;
    if(window.confirm('先把房间和待同步记录下载为本机备份？')) backupRoom();
    return runCloud(async()=>{
      await cloud.rpc('xm_leave',{p_trip:room.trip});
      if(cloud.room===room) {cloud.revoke(room);cloud.message='已退出房间。待同步记录仍保留在账号备份区。';}
      await cloud.refreshList();
      cloudChanged(true);
    });
  },
  cloudRoomBackup:backupRoom,
  cloudQueueBackup() {
    download('厦门纪行-待同步记录备份.json',JSON.stringify(cloud.accountQueue,null,2),'application/json');
  },
  cloudInvites() {return runCloud(async()=>{
    await cloud.refreshInvites();
    render(true);
    const list=main.querySelector('[data-detail="invite-list"]');
    if(list)list.open=true;
  });},
  cloudRevokeInvite(id) {
    if(!window.confirm('撤销此单次邀请？'))return;
    return runCloud(async()=>{
      await cloud.rpc('xm_revoke_invite',{p_trip:cloud.room.trip,p_invite:id});
      cloud.inviteLink='';
      await cloud.refreshInvites();render(true);showNotice('邀请已撤销');
    });
  },
  cloudRemove(id) {
    if(!window.confirm('移除此成员并撤销其访问权限？'))return;
    return runCloud(async()=>{await cloud.rpc('xm_member',{p_trip:cloud.room.trip,p_user:id,p_role:null});await cloud.sync();});
  },
  cloudConflictKeep(id) {
    if(window.confirm('保留云端版本，并从待同步队列移除这条本机修改？')&&cloud.resolve(id,false)) {
      cloudChanged(true);
    }
  },
  cloudConflictRetry(id) {
    if(window.confirm('确认以你的修改替换冲突时看到的云端版本？如果其他人已再次修改，会继续提示冲突。'))
      runCloud(()=>{cloud.resolve(id,true);cloudChanged(true);});
  },
  cloudEditNote(id) {ui.noteEdit=id;ui.noteVersion=cloud.version('note',id);render(true);},
  cloudDeleteNote(id) {
    if(window.confirm('删除这条共享备注？')) runCloud(()=>{
      if(cloud.enqueue([{kind:'note',record_id:id,body:null}])) cloudChanged(true);
    });
  },
  jump, copy:copyText,
  timeline(value) {
    ui.timeline=value;
    if (value==='compact') main.querySelectorAll('.stop-detail').forEach(node=>{node.open=false;});
    render(true);
  },
  foodMode(value) { ui.foodMode=value; render(true); },
  clearSearch() { ui.foodQuery=''; render(true); main.querySelector('input[type=search]').focus(); },
  mapFilter(value) { ui.mapFilter=value; ui.mapId=''; render(true); },
  mapPick(value) { ui.mapId=value; showMapSelection(value); },
  mapReset() { liveMap?.reset(); },
  mapRetry() { render(true); },
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
  editExpense(id) { ui.editExpense=id; ui.editExpenseVersion=cloud.version('expense',id); render(true); jump('expense-form'); },
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
    try {
      const contents=storageFailure?localStorage.getItem(storageKey):JSON.stringify(localState,null,2);
      if (!contents) throw new Error('No record available');
      download('厦门纪行-旅行备份.json',contents,'application/json');
      showNotice('旅行备份已导出');
    } catch {
      showNotice('当前无法读取旅行数据，请检查 Safari 存储设置');
    }
  },
  exportCsv() { download('厦门纪行-账单.csv',csv(state.expenses),'text/csv;charset=utf-8'); },
  exportExpenses() { download('厦门纪行-账单.json',JSON.stringify(state.expenses,null,2),'application/json'); },
  clear() {
    if (!window.confirm('清除本设备的旅行记录？建议先导出备份。')) return;
    if (!window.confirm('再次确认：删除本地旅行记录？')) return;
    try {
      localStorage.removeItem(storageKey);
      localState=emptyState();
      if(!displayedRoom())state=localState;
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
  if (update==='migrateChoice') {
    ui[target.name==='travel'?'migrateTravel':'migrateNotes']=target.checked;
    render(true);return;
  }
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
  cloudAuth(form,h,values) {return runCloud(async()=>{
    const mode=form.dataset.mode;
    await cloud.authenticate(mode,{email:h('email'),password:String(values.get('password')??'')});
    if (mode==='signup'||mode==='resend') showNotice('请检查邮箱并打开验证邮件');
    if (mode==='reset') showNotice('若账号已登记，邮箱将收到重设链接');
    if (mode==='password') showNotice('新密码已保存');
  });},
  cloudCreate(form,h) {return runCloud(async()=>{
    const actor=cloud.actor;
    const id=await cloud.rpc('xm_create',{p_name:h('name')});
    if(cloud.actor!==actor)return;
    await cloud.refreshList(actor);await cloud.open(id);
  });},
  cloudJoin(form,h) {return runCloud(async()=>{
    const token=invitationToken(h('token'));
    if(!token)throw new Error('请粘贴有效邀请链接或令牌');
    const actor=cloud.actor;
    const id=await cloud.rpc('xm_join',{p_token:token});
    if(cloud.actor!==actor)return;
    cloud.captureInvite('');await cloud.refreshList(actor);await cloud.open(id);
  });},
  cloudProfile(form,h) {return runCloud(async()=>{
    await cloud.rpc('xm_profile',{p_nickname:h('nickname')});
    await cloud.refreshList();await cloud.sync();render(true);showNotice('昵称已保存');
  });},
  cloudInvite(form,h) {return runCloud(async()=>{
    const room=cloud.room;
    const invitation=await cloud.rpc('xm_invite',{p_trip:room.trip,p_role:h('role'),p_hours:Number(h('hours'))});
    if(cloud.room!==room||cloud.role!=='owner')return;
    cloud.inviteLink=cloudConfig.redirectUrl.split('?')[0]+'#join/'+invitation.token;
    await cloud.refreshInvites();render(true);
  });},
  cloudMember(form,h) {
    if(h('role')==='owner'&&!window.confirm('确认移交所有权？你将成为可编辑成员。'))return;
    return runCloud(async()=>{
      await cloud.rpc('xm_member',{p_trip:cloud.room.trip,p_user:form.dataset.id,p_role:h('role')});
      await cloud.sync();await cloud.refreshList();render(true);
    });
  },
  cloudRename(form,h) {return runCloud(async()=>{
    await cloud.rpc('xm_rename',{p_trip:cloud.room.trip,p_name:h('name')});
    await cloud.sync();await cloud.refreshList();render(true);
  });},
  cloudSize(form,h) {return runCloud(()=>{
    const body=h('count')?{count:Number(h('count'))}:null;
    if(cloud.enqueue([{kind:'setting',record_id:'size',body}],formBase(form,'setting','size'))) cloudChanged(true);
  });},
  cloudNote(form,h) {return runCloud(()=>{
    const id=form.dataset.id||crypto.randomUUID();
    const text=h('text');
    const body=text?{text,place:form.dataset.place??''}:null;
    if(!body&&!form.dataset.id)return;
    if(cloud.enqueue([{kind:'note',record_id:id,body}],formBase(form,'note',id))) {
      ui.noteEdit='';cloudChanged(true);showNotice('共享备注已保存到待同步队列');
    }
  });},
  cloudImport() {return runCloud(()=>{
    if(storageFailure||!cloud.editable||cloud.queue.some(op=>op.type==='import'))return;
    const rows=migrationRows(localState,{travel:ui.migrateTravel,notes:ui.migrateNotes});
    const summary=migrationSummary(rows);
    if(!rows.length||!window.confirm('已备份原本机 JSON？确认将 '+summary.records+' 条记录（'+summary.count+' 笔，'+
      centMoney(summary.cents)+'）分享给「'+scopeName()+'」的所有当前和未来成员？'))return;
    if(cloud.beginImport(rows)) {render(true);showNotice('导入已排队，等待服务器校验');}
  });},
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
    if (mutate(next=>{next.info=Object.fromEntries(Object.keys(emptyInfo).map(key=>[key,h(key)]));},formBase(form,'setting','travel'))) {
      showNotice(displayedRoom()?'旅行信息已保存，等待云同步':'住宿与交通信息已保存在本机');
    }
  },
  swap(form,h) {
    const a=Number(h('date0')),b=Number(h('date1'));
    if (a===b) {showNotice('请选择两个不同的日期');return;}
    if (mutate(next=>{[next.order[a],next.order[b]]=[next.order[b],next.order[a]];},formBase(form,'itinerary','order'))) {
      ui.mapId='';
      render(true);
      showNotice('日期已交换。请重新核对预约、轮渡和天气。');
    }
  },
  budgetTotal(form,h) {
    if (mutate(next=>{next.total=h('amount')?Number(h('amount')):null;},formBase(form,'setting','budget'))) {
      render(true);
      showNotice('总预算已保存');
    }
  },
  expense(form,h,formData) {
    const title=h('title') || (form.dataset.quick ? h('category') : '');
    if (cloud.room&&!cloud.selected) {showNotice('房间仍在打开，请先切回本地模式再记本机账。');return;}
    if (!title) {showNotice('请填写店铺或事项');return;}
    const prior=form.dataset.id;
    const item={id:prior||crypto.randomUUID(),date:h('date'),amount:Number(h('amount')),category:h('category'),title,
      notes:h('notes'),shared:formData.has('shared'),payer:h('payer')};
    if (mutate(next=>{
      if (prior&&next.expenses.some(entry=>entry.id===prior)) {
        next.expenses=next.expenses.map(entry=>entry.id===prior?item:entry);
      } else if(!prior||displayedRoom()) next.expenses.push(item);
    },{payment:{record:item.id,member:h('payerMember')||null},
      bases:prior?{['expense/'+prior]:ui.editExpenseVersion}:undefined})) {
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

async function readyOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    const banner=document.querySelector('#update-banner');
    const showUpdate=()=>{
      if (registration.waiting?.state==='installed'&&navigator.serviceWorker.controller) banner.hidden=false;
    };
    let requested=false;
    document.querySelector('#activate-update').addEventListener('click',()=>{
      if (!registration.waiting) return;
      requested=true;
      registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
    });
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requested) location.reload();});
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed') showUpdate();});
    });
    showUpdate();
    await navigator.serviceWorker.ready;
    loadedOffline=true;
    const status=document.querySelector('#offline-status');
    if (status) status.textContent='核心行程已缓存，可离线查看。';
  } catch {
    const status=document.querySelector('#offline-status');
    if (status) status.textContent='离线缓存未就绪，联网后可重试。';
  }
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
  localState=state;
  prepareCloudRoute();
  current=route();
  render();
  if (current.stop) jump('stop-'+current.stop);
  window.addEventListener('hashchange',changeRoute);
  window.addEventListener('storage',event=>{
    if (event.key!==storageKey&&event.key!==null) return;
    try {
      const next=event.newValue?JSON.parse(event.newValue):emptyState();
      if (validateState(next,data)) {
        localState=next;
        if(!displayedRoom()) state=next;
        storageFailure=false;
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
  main.addEventListener('input',event=>{
    const form=event.target.closest('form');
    if(form)form.dataset.dirty='';
  });
  main.addEventListener('submit',event=>{
    const form=event.target;
    delete form.dataset.dirty;
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
