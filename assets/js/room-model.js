import {emptyState, emptyInfo, originalOrder, toCents} from './state.js';

const same = (a,b) => stable(a) === stable(b);
function stable(value) {
  if (!value || typeof value!=='object') return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
}

export const keyOf = (kind,id) => kind+'/'+id;
export const expenseBody = ({id,amount,...rest},payerId=null) => ({...rest,cents:toCents(amount),payer_id:payerId});
const cents = value => value === null ? null : toCents(value);
const yuan = value => value === null ? null : value/100;

export function recordMap(rows) {
  return new Map(rows.map(row=>[keyOf(row.kind,row.record_id),row]));
}

function stateRows(state,{travel=true,notes=false,withDefaults=true}={}) {
  const rows=[];
  const put=(kind,record_id,body)=>rows.push({kind,record_id,body});
  if (withDefaults||state.total!==null) put('setting','budget',{cents:cents(state.total)});
  if ((withDefaults||Object.values(state.info).some(Boolean))&&travel)
    put('setting','travel',{...state.info,notes:notes?state.info.notes:''});
  else if (notes&&state.info.notes)
    put('note','legacy-travel',{place:'',text:state.info.notes});
  if (withDefaults||!same(state.order,originalOrder)) put('itinerary','order',{order:state.order});
  for (const item of state.expenses) put('expense',item.id,expenseBody(item));
  for (const [type,entries] of [['places',state.places],['food',state.food]]) {
    for (const [id,{status,favorite}] of Object.entries(entries)) {
      if (withDefaults||status!=='pending') put('checkin',type+':'+id,{status});
      if (withDefaults||favorite) put('favorite',type+':'+id,{favorite});
    }
  }
  for (const [id,photo] of Object.entries(state.photos)) {
    if (withDefaults||photo.favorite) put('favorite','photo:'+id,{favorite:photo.favorite});
    if (withDefaults||photo.taken) put('photo',id,{taken:photo.taken});
    if (notes&&photo.notes) put('note','photo:'+id,{place:id,text:photo.notes});
  }
  for (const [id,gift] of Object.entries(state.gifts)) put('gift',id,{bought:gift.bought,cents:cents(gift.amount)});
  for (const [kind,items] of [['place',state.customPlaces],['food',state.customFood]]) {
    for (const {id,...body} of items) put(kind,id,body);
  }
  return rows;
}

export function migrationRows(state,choices={}) {
  return stateRows(state,{travel:Boolean(choices.travel),notes:Boolean(choices.notes),withDefaults:false});
}

export function migrationSummary(rows) {
  const expenses=rows.filter(row=>row.kind==='expense');
  return {records:rows.length,count:expenses.length,cents:expenses.reduce((sum,row)=>sum+row.body.cents,0)};
}

export function changeRows(previous,next,payment) {
  const before=recordMap(stateRows(previous,{notes:true}).filter(row=>row.kind!=='note'));
  const after=recordMap(stateRows(next,{notes:true}).filter(row=>row.kind!=='note'));
  const patches=[];
  const targets=new Set([...before.keys(),...after.keys()]);
  for (const key of targets) {
    const a=before.get(key),b=after.get(key);
    if (b?.kind==='expense'&&b.record_id===payment?.record) {
      patches.push({...b,body:{...b.body,payer_id:payment.member??null}});
    } else if (!a && ((b.kind==='favorite'&&!b.body.favorite) ||
        (b.kind==='checkin'&&b.body.status==='pending') || (b.kind==='photo'&&!b.body.taken))) {
      continue;
    } else if (!same(a?.body,b?.body)) {
      patches.push(b??{...a,body:null});
    }
  }
  return patches;
}

export function queuedView(snapshot,queue,actor) {
  const rows=recordMap(snapshot);
  const blocked=new Set();
  for (const op of queue) {
    if (op.type!=='write') continue;
    const p=op.params;
    const key=keyOf(p.p_kind,p.p_record);
    if (op.issue) blocked.add(key);
    if (blocked.has(key)) continue;
    rows.set(key,{
      kind:p.p_kind,record_id:p.p_record,body:p.p_body,version:p.p_expected+1,
      updated_at:op.createdAt,actor
    });
  }
  return rows;
}

export function projectRoom(rows,personalNotes,data) {
  const result=emptyState();
  const active=[...rows.values()].filter(row=>row.body!==null);
  for (const {kind,record_id:id,body} of active) {
    if (kind==='place') result.customPlaces.push({id,...body});
    if (kind==='food') result.customFood.push({id,...body});
  }
  const valid={
    places:new Set([...data.places.map(item=>item.id),...result.customPlaces.map(item=>item.id)]),
    food:new Set([...data.food.map(item=>item.id),...result.customFood.map(item=>item.id)]),
    photo:new Set(data.places.filter(item=>item.photo).map(item=>item.id))
  };
  const photo=id=>result.photos[id]??={favorite:false,taken:false,notes:''};
  for (const {kind,record_id:id,body} of active) {
    if (kind==='expense') {
      const {cents,payer_id,...expense}=body;
      result.expenses.push({id,amount:yuan(cents),...expense});
    }
    if (kind==='setting'&&id==='travel') result.info={...emptyInfo,...body};
    if (kind==='setting'&&id==='budget') result.total=yuan(body.cents);
    if (kind==='itinerary') result.order=body.order;
    if (kind==='gift') result.gifts[id]={bought:body.bought,amount:yuan(body.cents)};
    if (kind==='photo'&&valid.photo.has(id)) photo(id).taken=body.taken;
    if (kind==='checkin'||kind==='favorite') {
      const [type,item]=id.split(':');
      if (!valid[type]?.has(item)) continue;
      if (type==='photo') photo(item).favorite=body.favorite;
      else {
        const value=result[type][item]??={status:'pending',favorite:false};
        Object.assign(value,body);
      }
    }
  }
  for (const [id,value] of Object.entries(personalNotes)) if (valid.photo.has(id)) photo(id).notes=value;
  return result;
}

export function photoNotes(state) {
  return Object.fromEntries(Object.entries(state.photos).filter(([,row])=>row.notes).map(([id,row])=>[id,row.notes]));
}
