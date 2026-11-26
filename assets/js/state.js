export const storageKey = 'xiamen-anniversary-2026-v1';
export const statuses = {pending:'未完成', done:'已完成', skipped:'已跳过'};
export const originalOrder = ['jimei', 'coast', 'gulangyu'];
export const emptyInfo = {hotel:'', address:'', arrivalTime:'', arrivalService:'', departureTime:'', departureService:'', ferryArrival:'', notes:''};
export const emptyState = () => ({
  version:1, order:[...originalOrder], places:{}, food:{}, photos:{}, total:null, expenses:[],
  info:{...emptyInfo}, gifts:{}, customPlaces:[], customFood:[]
});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, max = 1000) => typeof value === 'string' && value.length <= max;
const amount = (value, nullable = false) => (nullable && value === null) ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001);
const keys = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key)) &&
  fields.every(key => Object.hasOwn(value, key));
const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
const moduleIds = ['arrival', ...originalOrder, 'departure'];
const inMap = (value, check, allowed) => record(value) && Object.entries(value).every(([key, item]) => allowed.has(key) && check(item));
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const time = value => value === '' || (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
const custom = (value, type) => {
  const textField = type === 'place' ? 'summary' : 'recommended';
  return keys(value, ['id','name','region','address','moduleId',textField]) &&
    id(value.id) && value.id.startsWith('custom-' + type + '-') &&
    bounded(value.name,100) && Boolean(value.name.trim()) && bounded(value.region,100) &&
    bounded(value.address,200) && bounded(value[textField],500) &&
    ['', ...moduleIds].includes(value.moduleId);
};
const list = (value, check, limit = 1000) => Array.isArray(value) && value.length <= limit &&
  value.every(check) && new Set(value.map(item => item.id)).size === value.length;

export function validateState(value, data, {room=false}={}) {
  if (!keys(value, Object.keys(emptyState())) || value.version !== 1 ||
      !Array.isArray(value.order) || value.order.length !== originalOrder.length ||
      new Set(value.order).size !== originalOrder.length || !value.order.every(item => originalOrder.includes(item)) ||
      !amount(value.total, true) || !list(value.customPlaces, item => custom(item, 'place'),room?5000:1000) ||
      !list(value.customFood, item => custom(item, 'food'),room?5000:1000)) return false;
  const placeIds = new Set([...data.places.map(item => item.id), ...value.customPlaces.map(item => item.id)]);
  const foodIds = new Set([...data.food.map(item => item.id), ...value.customFood.map(item => item.id)]);
  const photoIds = new Set(data.places.filter(item => item.photo).map(item => item.id));
  const giftIds = new Set(data.budget.gifts.map(item => item.id));
  const checkIn = item => keys(item, ['status','favorite']) && Object.hasOwn(statuses,item.status) && typeof item.favorite === 'boolean';
  return inMap(value.places,checkIn,placeIds) && inMap(value.food,checkIn,foodIds) &&
    inMap(value.photos,item => keys(item,['favorite','taken','notes']) && typeof item.favorite === 'boolean' &&
      typeof item.taken === 'boolean' && bounded(item.notes),photoIds) &&
    keys(value.info,Object.keys(emptyInfo)) && Object.entries(value.info).every(([key,item]) => key.endsWith('Time') ? time(item) : key==='ferryArrival' ? ['', 'sanqiutian'].includes(item) : bounded(item)) &&
    inMap(value.gifts,item => keys(item,['bought','amount']) && typeof item.bought === 'boolean' && amount(item.amount,true),giftIds) &&
    list(value.expenses,item => keys(item,['id','date','amount','category','title','notes','shared','payer']) &&
      id(item.id) && isDate(item.date) && amount(item.amount) && item.amount > 0 &&
      data.budget.categories.includes(item.category) && bounded(item.title,120) && Boolean(item.title.trim()) &&
      bounded(item.notes,500) && typeof item.shared === 'boolean' && bounded(item.payer,60), room?50000:5000);
}

export function localDate(date = new Date()) {
  const two = value => String(value).padStart(2,'0');
  return date.getFullYear() + '-' + two(date.getMonth()+1) + '-' + two(date.getDate());
}

export const toCents = amount => Math.round(amount * 100);
export const expenseCents = expenses => expenses.reduce((total,item)=>total+toCents(item.amount),0);
export const calculate = expenses => expenseCents(expenses)/100;

export function csv(expenses) {
  const quote = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  const header = ['日期','金额','类别','店铺或事项','备注','两人共同支出','付款人'];
  const rows = expenses.map(item => [item.date,item.amount.toFixed(2),item.category,item.title,item.notes,item.shared?'是':'否',item.payer]);
  return '\ufeff' + [header,...rows].map(row => row.map(quote).join(',')).join('\r\n');
}
