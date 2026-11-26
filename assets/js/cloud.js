import {cloudConfig} from './cloud-config.js';
import {keyOf, queuedView, migrationSummary} from './room-model.js';

export const authKey='xiamen-v3-auth';
const authLockKey='xiamen-v3-signed-out';
const personalPrefix='xiamen-v3-account:';
const invitationKey='xiamen-v3-invitation';
const idPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const tokenPattern=/^[a-f0-9]{64}$/;
const canWrite=role=>role==='owner'||role==='editor';

function read(key,fallback=null) {
  try { return JSON.parse(localStorage.getItem(key))??fallback; }
  catch { return fallback; }
}
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const remove=key=>localStorage.removeItem(key);
function storageKeys() {
  try {return Object.keys(localStorage);} catch {return [];}
}

function saveInvite(token) {
  try {
    if (token) sessionStorage.setItem(invitationKey,token);
    else sessionStorage.removeItem(invitationKey);
  } catch { /* The visible form can still accept a pasted invitation. */ }
}

export function invitationToken(value) {
  const text=String(value??'').trim();
  const token=text.includes('#join/')?text.split('#join/').pop():text;
  return tokenPattern.test(token)?token:'';
}

let sdk;
function loadSdk() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  if (!sdk) sdk=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('../vendor/supabase/supabase.js',import.meta.url);
    script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('SDK'));
    script.onerror=()=>{script.remove();reject(new Error('SDK'));};
    document.head.append(script);
  }).catch(error=>{sdk=null;throw error;});
  return sdk;
}

function timedFetch(input,options={}) {
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  options.signal?.addEventListener('abort',cancel,{once:true});
  if (options.signal?.aborted) cancel();
  const timer=setTimeout(cancel,12000);
  return fetch(input,{...options,signal:controller.signal,cache:'no-store'}).finally(()=>{
    clearTimeout(timer);
    options.signal?.removeEventListener('abort',cancel);
  });
}

async function connect() {
  const api=await loadSdk();
  return api.createClient(cloudConfig.url,cloudConfig.publishableKey,{
    auth:{storageKey:authKey,flowType:'implicit',detectSessionInUrl:true,autoRefreshToken:true,persistSession:true},
    global:{fetch:timedFetch}
  });
}

function isDenied(error) {
  return ['42501','PGRST301','PGRST303','bad_jwt'].includes(error?.code)||[401,403].includes(error?.status);
}
function unavailable(error) {
  return !error?.code||[0,429,502,503,504].includes(error?.status);
}

class RoomStorage {
  constructor(user,trip) {
    this.user=user;
    this.trip=trip;
    this.key=personalPrefix+user+':room:'+trip+':';
  }
  get snapshot() {
    let raw=null;
    try {raw=localStorage.getItem(this.key+'snapshot');} catch { /* Storage is unavailable. */ }
    if(this.rawSnapshot!==raw) {
      this.rawSnapshot=raw;
      try {this.parsedSnapshot=JSON.parse(raw);} catch {this.parsedSnapshot=null;}
    }
    return this.parsedSnapshot;
  }
  set snapshot(value) {write(this.key+'snapshot',value);}
  get notes() {return read(this.key+'notes',{});}
  set notes(value) {write(this.key+'notes',value);}
  get imported() {return read(this.key+'imported');}
  set imported(value) {write(this.key+'imported',value);}
  get queue() {
    const keys=storageKeys().filter(key=>key.startsWith(this.key+'op:'));
    return keys.map(key=>read(key)).filter(Boolean)
      .sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id));
  }
  put(op) {write(this.key+'op:'+op.id,op);}
  get(id) {return read(this.key+'op:'+id);}
  drop(id) {remove(this.key+'op:'+id);}
  forgetSnapshot() {remove(this.key+'snapshot');}
}

export class CloudTrip {
  constructor(changed,{connectClient=connect}={}) {
    this.changed=changed;
    this.connectClient=connectClient;
    this.phase='idle';
    this.state='local';
    this.trips=[];
    this.user=null;
    this.nickname='';
    this.invites=[];
    this.isRealtime=false;
    this.recovery=false;
    this.lockedUser=read(authLockKey);
    this.message='';
    this.pendingInvitation='';
    try {this.pendingInvitation=invitationToken(sessionStorage.getItem(invitationKey));} catch { /* Safari may restrict storage. */ }
    window.addEventListener('online',()=>{if(this.room)this.sync();else if (this.phase==='offline')this.boot(true);});
    window.addEventListener('offline',()=>{
      if(this.room) {this.state='offline';this.changed();}
    });
    window.addEventListener('storage',event=>{
      if (event.key===authLockKey) {
        this.lockedUser=read(authLockKey);
        if(this.actor&&this.actor===this.lockedUser) this.adopt(null);
      }
      if (event.key===authKey && !event.newValue && this.actor) this.adopt(null);
      if (this.room&&event.key?.startsWith(this.room.key)) {
        if (!this.room.snapshot) {this.closeRoom(false);this.message='共享房间的本机缓存已锁定。';}
        this.changed(true);
      }
    });
  }
  get actor() {return this.user?.id;}
  get selected() {return this.room?.snapshot;}
  get role() {return this.selected?.trip.role;}
  get editable() {return canWrite(this.role);}
  get queue() {return this.room?.queue??[];}
  get rows() {
    return queuedView(this.selected?.records??[],this.queue,this.actor);
  }
  get accountQueue() {
    if (!this.actor) return [];
    const prefix=personalPrefix+this.actor+':room:';
    return storageKeys().filter(key=>key.startsWith(prefix)&&key.includes(':op:'))
      .map(key=>({trip:key.slice(prefix.length).split(':')[0],operation:read(key)})).filter(entry=>entry.operation);
  }

  captureInvite(value) {
    this.pendingInvitation=invitationToken(value);
    saveInvite(this.pendingInvitation);
  }

  async rpc(method,args={}) {
    const {data,error}=await this.client.rpc(method,args);
    if (error) throw error;
    return data;
  }

  boot(force=false) {
    if (this.starting) return this.starting;
    if (!force&&this.phase!=='idle') return Promise.resolve();
    this.phase='connecting';
    this.changed();
    this.starting=this.start().finally(()=>{this.starting=null;});
    return this.starting;
  }

  async start() {
    try {
      if(!this.client){
        this.client=await this.connectClient();
        this.client.auth.onAuthStateChange((event,session)=>{
          setTimeout(()=>{
            if (event==='PASSWORD_RECOVERY') this.recovery=true;
            if (!session&&event==='INITIAL_SESSION'&&this.actor) return;
            const next=session?.user??null;
            if (next?.id===this.lockedUser) return;
            if (next?.id!==this.actor||event==='PASSWORD_RECOVERY') this.adopt(next);
          },0);
        });
      }
      try {
        const gate=await this.rpc('xm_capabilities');
        this.phase=gate?.schema===3&&gate.enabled===true?'ready':'setup';
      } catch(error) {
        this.phase=error.code==='PGRST202'?'setup':'offline';
      }
      if(this.phase==='setup') {this.closeRoom(false);this.changed(true);return;}
      const {data}=await this.client.auth.getSession();
      const fallback=this.phase==='offline'?read(authKey)?.user:null;
      const candidate=data?.session?.user??fallback;
      await this.adopt(candidate?.id===this.lockedUser?null:candidate);
    } catch {
      this.phase='offline';
    }
    this.changed(true);
  }

  async adopt(user) {
    const changedAccount=this.user?.id!==user?.id;
    if (changedAccount) {
      this.closeRoom(false);
      this.nickname='';
      this.trips=[];
      this.user=user;
    }
    if (!user||this.phase==='setup') {this.changed(true);return;}
    let verified=false;
    if (this.phase==='ready') {
      try {await this.refreshList(user.id);verified=true;} catch { /* Cached selection can still open. */ }
    }
    if(this.actor!==user.id) return;
    const remembered=read(personalPrefix+user.id+':selected');
    if (idPattern.test(remembered??'')&&!this.room) {
      const known=this.trips.some(trip=>trip.id===remembered);
      const rememberedRoom=new RoomStorage(user.id,remembered);
      if (verified&&!known) {
        try {rememberedRoom.forgetSnapshot();} catch { /* Treat it as inaccessible in this session. */ }
        this.closeRoom();
        this.message='无法再访问上次使用的房间。待同步记录仍可备份。';
      } else if (rememberedRoom.snapshot||known) await this.open(remembered,false);
    }
    this.changed(true);
  }

  async refreshList(actor=this.actor) {
    const response=await this.rpc('xm_list');
    if (this.actor!==actor) return;
    this.trips=response.trips;
    this.nickname=response.nickname??'';
  }

  async authenticate(mode,{email,password}) {
    await this.boot(this.phase!=='ready');
    if(this.phase!=='ready') throw new Error('云端尚未启用或暂时不可达');
    let result;
    if (mode==='signup') result=await this.client.auth.signUp({email,password,options:{emailRedirectTo:cloudConfig.redirectUrl}});
    if (mode==='signin') {
      result=await this.client.auth.signInWithPassword({email,password});
      if (!result.error) {
        this.lockedUser=null;
        try {remove(authLockKey);} catch { /* Session can continue in this tab. */ }
      }
    }
    if (mode==='reset') result=await this.client.auth.resetPasswordForEmail(email,{redirectTo:cloudConfig.redirectUrl});
    if (mode==='resend') result=await this.client.auth.resend({type:'signup',email,options:{emailRedirectTo:cloudConfig.redirectUrl}});
    if (mode==='password') {
      if(!this.recovery) throw new Error('请从邮件打开有效的密码重设链接');
      result=await this.client.auth.updateUser({password});
      if (!result.error) this.recovery=false;
    }
    if (result?.error) throw result.error;
    if(result?.data?.session?.user) await this.adopt(result.data.session.user);
    this.changed(true);
  }

  async signOut() {
    const actor=this.actor;
    this.lockedUser=actor;
    try {if(actor)write(authLockKey,actor);} catch { /* In-memory lock still applies. */ }
    this.closeRoom(false);
    this.user=null;this.nickname='';this.trips=[];this.invites=[];this.recovery=false;this.captureInvite('');
    this.changed(true);
    try {await this.client.auth.signOut({scope:'local'});} catch { /* The local session is already detached. */ }
    finally {
      // A network failure must not restore the signed-out account on reload.
      try {if(read(authKey)?.user?.id===actor)remove(authKey);} catch { /* The local lock still applies. */ }
    }
  }

  closeRoom(remember=true) {
    if (remember&&this.actor) {
      try {remove(personalPrefix+this.actor+':selected');} catch { /* Current room still closes. */ }
    }
    if(this.channel) this.client?.removeChannel(this.channel).catch(()=>{});
    this.channel=null;
    clearInterval(this.poll);this.poll=null;
    this.room=null;
    this.isRealtime=false;
    this.invites=[];this.inviteLink='';
    this.state='local';
  }

  async open(id,interactive=true) {
    const actor=this.actor;
    if(!idPattern.test(id??'')||!actor||this.phase==='setup') return;
    this.closeRoom(false);
    const room=new RoomStorage(actor,id);
    this.room=room;
    this.message='';
    write(personalPrefix+actor+':selected',id);
    this.state=room.snapshot?'offline':'syncing';
    this.changed(true);
    this.poll=setInterval(()=>{
      if (document.visibilityState!=='hidden') this.sync();
    },25000);
    await this.sync();
    if(this.room===room&&this.selected&&navigator.onLine) this.subscribe(room);
    if(interactive&&this.room!==room&&this.message) throw new Error(this.message);
  }

  subscribe(room) {
    if(this.room!==room||this.channel||!this.client) return;
    const channel=this.client.channel('xm-room:'+room.trip+':'+crypto.randomUUID())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'xm_signals',filter:'trip_id=eq.'+room.trip},()=>this.sync())
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'xm_members',filter:'user_id=eq.'+room.user},payload=>{
        if (this.room!==room||payload.new?.trip_id!==room.trip) return;
        if (payload.new.active===false) this.revoke(room);
        else this.sync();
      });
    this.channel=channel;
    channel.subscribe(status=>{
      if(this.room!==room) return;
      this.isRealtime=status==='SUBSCRIBED';
      this.changed();
    });
  }

  revoke(room) {
    if(this.room!==room)return;
    try {room.forgetSnapshot();} catch { /* Revoke in memory even if storage is unavailable. */ }
    this.closeRoom();
    this.trips=this.trips.filter(trip=>trip.id!==room.trip);
    this.message='房间已停用或权限被撤销。未同步记录仍可由当前账号导出。';
    this.changed(true);
  }

  sync() {
    const room=this.room;
    if(!room) return Promise.resolve();
    if (room.running) {
      room.again=true;
      return room.running;
    }
    room.running=this.syncRoom(room).finally(()=>{
      room.running=null;
      if (this.room===room&&room.again) {room.again=false;this.sync();}
    });
    return room.running;
  }

  async syncRoom(room) {
    if (!navigator.onLine) {this.state='offline';this.changed();return;}
    this.state='syncing';
    this.changed();
    let queueChanged=false;
    try {
      const pull=async()=>{
        const next=await this.rpc('xm_snapshot',{p_trip:room.trip});
        if (this.room!==room) return false;
        this.phase='ready';
        const last=room.snapshot;
        if (Number(next.revision??0)>=Number(last?.revision??0)) {
          const changed=!last||JSON.stringify({...last,lastSync:0})!==JSON.stringify({...next,lastSync:0});
          room.snapshot={...next,lastSync:Date.now()};
          if(changed) this.changed(true);
        }
        return true;
      };
      if (!await pull()) return;
      const queue=room.queue;
      const blocked=new Set(queue.filter(op=>op.issue&&op.type==='write').map(op=>keyOf(op.params.p_kind,op.params.p_record)));
      for (const op of queue) {
        if (this.room!==room) return;
        if (!this.editable||op.issue||op.ack||!room.get(op.id)) continue;
        const target=keyOf(op.params.p_kind,op.params.p_record);
        if(op.type==='write'&&blocked.has(target)) continue;
        let result;
        try {result=await this.rpc(op.type==='import'?'xm_import':'xm_apply',op.params);}
        catch (error) {
          if (error.code!=='22023') throw error;
          if(this.room!==room) return;
          if (room.get(op.id)) {room.put({...op,issue:{kind:'invalid'}});queueChanged=true;}
          blocked.add(target);
          continue;
        }
        if (this.room!==room) return;
        if (!room.get(op.id)) continue;
        if (result.status==='conflict') {
          room.put({...op,issue:{kind:'conflict',record:result.record}});
          queueChanged=true;
          blocked.add(target);
        } else if (result.status==='applied'||result.status==='imported') {
          room.put({...op,ack:result});
        } else {
          throw new Error('服务器未确认该操作');
        }
      }
      const acks=room.queue.filter(op=>op.ack);
      if (acks.length&&!await pull()) return;
      for (const op of acks) {
        if (op.type==='import') room.imported={...op.ack,expected:migrationSummary(op.params.p_rows),when:Date.now()};
        room.drop(op.id);
        queueChanged=true;
      }
      this.state=room.queue.some(op=>op.issue)||(!this.editable&&room.queue.length)?'failed':room.queue.length?'syncing':'synced';
      if (!this.channel) this.subscribe(room);
    } catch(error) {
      if (this.room!==room) return;
      if(isDenied(error)) {
        // Confirm membership separately when a write is rejected due to a role change.
        try {
          const snapshot=await this.rpc('xm_snapshot',{p_trip:room.trip});
          if(this.room!==room) return;
          room.snapshot={...snapshot,lastSync:Date.now()};
          this.state='failed';
          this.changed(true);
        } catch (denied) {
          if(this.room!==room) return;
          if(isDenied(denied)) this.revoke(room);
          else {this.state='offline';this.changed();}
        }
        return;
      }
      this.state=(!navigator.onLine||unavailable(error))?'offline':'failed';
    }
    if(this.room===room) this.changed(queueChanged);
  }

  version(kind,id) {return this.rows.get(keyOf(kind,id))?.version??0;}
  enqueue(patches,options={}) {
    if (!this.room||!this.selected||(!this.editable&&patches.length)) return false;
    const room=this.room;
    const previous=room.notes;
    const rows=this.rows;
    const queue=room.queue;
    if(patches.some(row=>queue.some(op=>op.issue&&keyOf(op.params.p_kind,op.params.p_record)===keyOf(row.kind,row.record_id)))) {
      throw new Error('请先在共享旅行空间处理这条记录的同步冲突');
    }
    const saved=[];
    let sequence=Math.max(Date.now()*1000,...queue.map(op=>op.sequence+1));
    try {
      for(const row of patches) {
        const key=keyOf(row.kind,row.record_id);
        const p_expected=options.bases?.[key]??rows.get(key)?.version??0;
        const id=crypto.randomUUID();
        room.put({id,type:'write',sequence:sequence++,createdAt:new Date().toISOString(),params:{
          p_trip:room.trip,p_op:id,p_kind:row.kind,p_record:row.record_id,p_expected,p_body:row.body
        }});
        saved.push(id);
      }
      if(options.notes) room.notes=options.notes;
    } catch {
      for(const id of saved) room.drop(id);
      // The original photo notes remain untouched if writing the new copy failed.
      if(options.notes&&JSON.stringify(previous)!==JSON.stringify(room.notes)) room.notes=previous;
      return false;
    }
    if(patches.length) queueMicrotask(()=>this.sync());
    return true;
  }

  beginImport(rows) {
    if(!this.editable||!rows.length) return false;
    const room=this.room,id=crypto.randomUUID();
    room.put({id,type:'import',sequence:Date.now()*1000,createdAt:new Date().toISOString(),params:{p_trip:room.trip,p_op:id,p_rows:rows}});
    queueMicrotask(()=>this.sync());
    return true;
  }

  resolve(id,useLocal) {
    const room=this.room;
    const op=room?.get(id);
    if(!op?.issue)return false;
    if(op.type==='import') {if(!useLocal){room.drop(id);this.sync();}return !useLocal;}
    const {p_kind,p_record}=op.params;
    const related=room.queue.filter(item=>item.type==='write'&&item.params.p_kind===p_kind&&item.params.p_record===p_record);
    if(useLocal) {
      if(!this.editable||op.issue.kind!=='conflict')return false;
      const latest=related.at(-1);
      const id=crypto.randomUUID();
      room.put({...latest,id,issue:null,ack:null,sequence:Date.now()*1000,
        params:{...latest.params,p_op:id,p_expected:op.issue.record?.version??0}});
    }
    for (const item of related) room.drop(item.id);
    this.sync();
    return true;
  }

  async refreshInvites() {
    const room=this.room;
    const list=await this.rpc('xm_invite_list',{p_trip:room.trip});
    if(this.room===room&&this.role==='owner') this.invites=list;
  }
}

export function shouldConnect() {
  return location.hash.startsWith('#shared')||location.hash.startsWith('#join/')||
    new URLSearchParams(location.search).has('auth')||location.hash.includes('access_token=')||Boolean(read(authKey));
}
