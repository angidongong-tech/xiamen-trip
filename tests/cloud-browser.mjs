// The browser uses a simulated Auth/Realtime adapter and the real SQL RPCs in a disposable PG container.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname);
const pg=process.env.XM3_PG_CONTAINER;
if (!pg) throw Error('Use a disposable PostgreSQL container with bootstrap-local.sql and setup.sql installed.');
const using=Array.from({length:5},()=>randomUUID());
const quote=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
function sql(query) {
  return new Promise((answer,reject)=>{
    const child=execFile('docker',['exec','-i',pg,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],
      (error,stdout,stderr)=>error?reject(Error(stderr)):answer(stdout.trim()));
    child.stdin.end('\\set VERBOSITY verbose\n'+query);
  });
}
const specs={
  xm_capabilities:[],xm_list:[],xm_profile:[['p_nickname','text']],xm_create:[['p_name','text']],
  xm_snapshot:[['p_trip','uuid']],xm_invite:[['p_trip','uuid'],['p_role','text'],['p_hours','integer']],
  xm_invite_list:[['p_trip','uuid']],xm_join:[['p_token','text']],
  xm_member:[['p_trip','uuid'],['p_user','uuid'],['p_role','text']],
  xm_apply:[['p_trip','uuid'],['p_op','uuid'],['p_kind','text'],['p_record','text'],['p_expected','integer'],['p_body','jsonb']],
  xm_import:[['p_trip','uuid'],['p_op','uuid'],['p_rows','jsonb']]
};
function query(method,args,user) {
  const fields=specs[method].map(([key,type])=>quote(type==='jsonb'&&args[key]!==null?JSON.stringify(args[key]):args[key])+'::'+type);
  return sql('begin; set local role '+(user?'authenticated':'anon')+'; set local request.jwt.claim.sub='+quote(user??'')+
    '; select coalesce(to_jsonb(result),\'null\'::jsonb) from public.'+method+'('+fields.join(',')+') result; commit;').then(value=>JSON.parse(value));
}
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
let blockedImport=false;
let legacyRoot=process.env.XM3_LEGACY_ROOT;
const http=createServer(async(req,res)=>{
  if(req.url==='/canary'){res.end('<!doctype html><title>Canary</title>');return;}
  if(req.method==='POST'&&req.url==='/test-rpc'){
    const chunks=[];
    for await (const chunk of req)chunks.push(chunk);
    const {method,args,user}=JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('content-type','application/json');
    if(blockedImport&&method==='xm_import'){res.statusCode=503;res.end(JSON.stringify({error:{code:'TEST',status:503}}));return;}
    try{
      assert.ok(Object.hasOwn(specs,method));
      assert.ok(user===null||using.includes(user));
      res.end(JSON.stringify({data:await query(method,args,user),error:null}));
    }catch(error){
      res.end(JSON.stringify({data:null,error:{code:/ERROR:\s+([0-9A-Z]{5}):/.exec(error.message)?.[1]||'fixture',status:0}}));
    }
    return;
  }
  const route=new URL(req.url,'http://127.0.0.1').pathname;
  if(!route.startsWith('/xiamen-trip/')){res.writeHead(404).end();return;}
  const base=legacyRoot||root;
  const path=resolve(base,route.slice('/xiamen-trip/'.length)||'index.html');
  if(!path.startsWith(base+sep)){res.writeHead(404).end();return;}
  try{res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(path));}
  catch {res.writeHead(404).end();}
});
await new Promise(done=>http.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+http.address().port, app=origin+'/xiamen-trip/';
const userId=(x)=>using['abcde'.indexOf(x)];
const adapter=ids=>{
  window.supabase={createClient(_url,_key,{auth}) {
    const key=auth.storageKey;
    let callback;
    const current=()=>JSON.parse(localStorage.getItem(key));
    const notify=session=>setTimeout(()=>callback?.(session?'SIGNED_IN':'SIGNED_OUT',session),0);
    return {
      auth:{
        onAuthStateChange(fn){callback=fn;setTimeout(()=>fn('INITIAL_SESSION',current()),0);},
        async getSession(){return {data:{session:current()}};},
        async signInWithPassword({email}){
          const session={user:{id:ids['abcde'.indexOf(email[0])]}};
          localStorage.setItem(key,JSON.stringify(session));notify(session);
          return {data:{session}};
        },
        async signOut(){localStorage.removeItem(key);notify(null);}
      },
      async rpc(method,args){
        try {
          const response=await fetch('/test-rpc',{method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({method,args,user:current()?.user.id??null})});
          return response.json();
        }catch{return {error:{status:0}};}
      },
      channel(){const channel={on(){return channel;},subscribe(fn){setTimeout(()=>fn('CHANNEL_ERROR'),0);return channel;}};return channel;},
      async removeChannel(){}
    };
  }};
};
const legacy={
  version:1,order:['jimei','coast','gulangyu'],places:{bashi:{status:'done',favorite:true}},food:{},
  photos:{'ten-mile-dike':{favorite:true,taken:false,notes:'示例私人摄影备注'}},total:3200.25,
  expenses:[
    {id:'fixture-legacy1',date:'2026-11-28',amount:12.34,title:'示例旧账一',category:'小吃',notes:'',payer:'',shared:true},
    {id:'fixture-legacy2',date:'2026-11-28',amount:9.01,title:'示例旧账二',category:'地铁',notes:'',payer:'',shared:true}
  ],
  info:{hotel:'示例本机酒店',address:'示例本机地址',arrivalTime:'16:00',arrivalService:'示例车次',departureTime:'',departureService:'',ferryArrival:'',notes:'示例私人行程备注'},
  gifts:{},customPlaces:[],customFood:[]
};
const key='xiamen-anniversary-2026-v1';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const errors=[];
async function session(width){
  const ctx=await browser.newContext({viewport:{width,height:880},isMobile:true,hasTouch:true,acceptDownloads:true});
  await ctx.addInitScript(adapter,using);
  const page=await ctx.newPage();
  page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error',error.message);});
  page.on('dialog',dialog=>dialog.accept());
  await page.clock.install({time:new Date('2026-11-29T02:00:00Z')});
  return {ctx,page};
}
const click=(page,name)=>page.getByRole('button',{name,exact:true}).click();
const view=(page,hash)=>page.goto(app+'#'+hash);
async function login(page,user){
  try {await page.getByLabel('邮箱',{exact:true}).fill(user+'@example.test',{timeout:6000});}
  catch(error) {console.error('Fixture login screen:',page.url().split('#')[1],(await page.locator('main').innerText()).slice(0,500));throw error;}
  await page.getByLabel('密码',{exact:true}).fill('test-password');
  await click(page,'登录');
  await page.getByRole('heading',{name:'我的房间'}).waitFor();
}
const flow=(page,name)=>page.locator('form[data-form="'+name+'"]');
const receipt=async(page,category,amount,title)=>{
  const form=page.locator('#quick-expense');
  await form.getByLabel('分类').selectOption(category);
  await form.getByLabel('金额（元）').fill(amount);
  if(title){
    if (!(await form.locator('details[open]').count())) await form.locator('summary').click();
    await form.getByLabel('店铺或事项（选填）').fill(title);
  }
  await form.getByRole('button',{name:'保存支出'}).click();
};
const waitSynced=page=>page.getByText(/^已同步 · 上次/).first().waitFor();
const status=page=>page.locator('[data-cloud-status]').first().innerText();
try {
  await sql('update xm_private.launch set enabled=true; insert into auth.users(id) values '+using.map(id=>'('+quote(id)+')').join(',')+' on conflict do nothing;');
  let a=await session(390),b=await session(430);
  if(legacyRoot){
    await view(a.page,'home');
    await a.page.getByRole('heading',{name:'与海相约 · 厦门纪行'}).waitFor();
    await a.page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await a.page.evaluate(([k,value])=>localStorage.setItem(k,value),[key,JSON.stringify(legacy)]);
    legacyRoot=null;
    await a.page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
    await a.page.waitForFunction(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      if (registration?.waiting?.state!=='installed') return false;
      const cache=await caches.open('xiamen-journal-v4');
      const response=await cache.match(location.origin+'/xiamen-trip/assets/js/app.js');
      return Boolean(response&&(await response.text()).includes('shared:cloudPage'));
    });
    await a.page.close();
    const sentinel=await a.ctx.newPage();
    await sentinel.goto(origin+'/canary');
    await sentinel.waitForFunction(async()=>{
      const registration=await navigator.serviceWorker.getRegistration('/xiamen-trip/');
      return registration?.active?.state==='activated'&&!registration.waiting&&!registration.installing&&
        (await caches.keys()).includes('xiamen-journal-v4')&&!(await caches.keys()).includes('xiamen-journal-v3');
    });
    const cachedV3=await sentinel.evaluate(async()=>{
      const cache=await caches.open('xiamen-journal-v4');
      const response=await cache.match(location.origin+'/xiamen-trip/assets/js/app.js');
      return response?(await response.text()).includes('shared:cloudPage'):(await cache.keys()).map(request=>request.url);

    });
    assert.equal(cachedV3,true);
    a.page=await a.ctx.newPage();
    await a.page.clock.install({time:new Date('2026-11-29T02:00:00Z')});
    a.page.on('dialog',dialog=>dialog.accept());
    a.page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error',e.message);});
  } else {
    await view(a.page,'home');
    await a.page.evaluate(([k,value])=>localStorage.setItem(k,value),[key,JSON.stringify(legacy)]);
    await a.page.reload();
  }
  await view(a.page,'shared');await login(a.page,'a');
  assert.equal(await a.page.evaluate(k=>localStorage.getItem(k),key),JSON.stringify(legacy));
  await a.page.getByText('创建或加入房间',{exact:true}).click();
  await flow(a.page,'cloudCreate').getByLabel('房间名称').fill('测试房间甲');
  await flow(a.page,'cloudCreate').getByRole('button',{name:'创建房间'}).click();
  await a.page.getByRole('heading',{name:'测试房间甲',exact:true}).first().waitFor();
  await waitSynced(a.page);
  const before=(await query('xm_list',{},userId('a'))).trips.find(room=>room.name==='测试房间甲');
  await click(a.page,'生成单次邀请');
  const invite=a.page.getByLabel('邀请链接',{exact:true});
  await invite.waitFor();
  const token=(await invite.inputValue()).split('#join/')[1];

  await b.page.goto(app+'#join/'+token);
  await b.page.getByText('已识别邀请。', {exact:false}).waitFor();
  await login(b.page,'b');
  await b.page.getByRole('button',{name:'确认加入',exact:true}).last().click();
  await b.page.getByRole('heading',{name:'测试房间甲',exact:true}).first().waitFor();
  await waitSynced(b.page);
  await assert.rejects(query('xm_snapshot',{p_trip:before.id},userId('c')),/42501/);
  assert.equal((await query('xm_snapshot',{p_trip:before.id},userId('b'))).records.length,0);
  assert.match(await status(b.page),/定期检查/);

  blockedImport=true;
  await click(a.page,'确认导入此房间');
  await a.page.getByText('导入待确认。', {exact:false}).waitFor();
  assert.equal(await a.page.evaluate(k=>localStorage.getItem(k),key),JSON.stringify(legacy));
  blockedImport=false;
  await click(a.page,'立即同步');
  await a.page.getByText('导入已核对',{exact:true}).waitFor();
  assert.match(await a.page.locator('main').innerText(),/新增 2 笔 ¥21.35/);
  await click(a.page,'确认导入此房间');
  await a.page.getByText(/新增 0 笔 ¥0，已有 2 笔/).waitFor();
  let snapshot=await query('xm_snapshot',{p_trip:before.id},userId('a'));
  assert.equal(snapshot.records.filter(r=>r.kind==='expense').length,2);
  assert.equal(snapshot.records.find(r=>r.record_id==='budget').body.cents,320025);
  assert.ok(!JSON.stringify(snapshot).includes('示例私人')&&!JSON.stringify(snapshot).includes('示例本机'));
  assert.equal(await a.page.evaluate(k=>localStorage.getItem(k),key),JSON.stringify(legacy));

  await Promise.all([view(a.page,'budget'),view(b.page,'budget')]);
  await Promise.all([receipt(a.page,'打车','3.25','模拟并发车费'),receipt(b.page,'奶茶与咖啡','7.75','模拟并发饮品')]);
  await Promise.all([waitSynced(a.page),waitSynced(b.page)]);
  snapshot=await query('xm_snapshot',{p_trip:before.id},userId('a'));
  assert.deepEqual(snapshot.records.filter(r=>r.kind==='expense').map(r=>r.body.cents).sort((a,b)=>a-b),[325,775,901,1234]);
  assert.ok(snapshot.records.some(r=>r.body?.payer_id===userId('b')));
  await b.ctx.setOffline(true);
  await receipt(b.page,'小吃','4.10','断网队列测试');
  await b.page.getByText(/离线，待同步 · 待确认 1 项/).waitFor();
  assert.ok(!(await query('xm_snapshot',{p_trip:before.id},userId('a'))).records.some(r=>r.body?.title==='断网队列测试'));
  await b.page.reload();
  await b.page.getByRole('heading',{name:'断网队列测试'}).waitFor();
  await b.ctx.setOffline(false);
  await waitSynced(b.page);
  assert.ok((await query('xm_snapshot',{p_trip:before.id},userId('a'))).records.some(r=>r.body?.title==='断网队列测试'));

  const stale=a.page.locator('.expense').filter({has:a.page.getByRole('heading',{name:'示例旧账一',exact:true})});
  await stale.getByRole('button',{name:'修改'}).click();
  await a.page.locator('#expense-form').getByLabel('金额（元）').fill('99.99');
  const original=(await query('xm_snapshot',{p_trip:before.id},userId('b'))).records.find(row=>row.record_id==='fixture-legacy1');
  await query('xm_apply',{p_trip:before.id,p_op:randomUUID(),p_kind:'expense',p_record:original.record_id,
    p_expected:original.version,p_body:{...original.body,cents:1400}},userId('b'));
  await a.page.locator('#expense-form').getByRole('button',{name:'保存修改'}).click();
  await view(a.page,'shared');
  await a.page.getByText('同一条记录已被其他成员修改').waitFor();
  await click(a.page,'保留云端');
  await waitSynced(a.page);
  assert.equal((await query('xm_snapshot',{p_trip:before.id},userId('a'))).records.find(row=>row.record_id===original.record_id).body.cents,1400);

  await view(a.page,'trip/1');
  await click(a.page,'打卡 龙舟池');
  await waitSynced(a.page);
  await view(b.page,'shared');
  await click(b.page,'立即同步');
  await waitSynced(b.page);
  await view(b.page,'trip/1');
  await b.page.getByRole('button',{name:'已完成 龙舟池'}).waitFor();
  await view(a.page,'adjust');
  await click(a.page,'交换日期');
  await waitSynced(a.page);
  await view(b.page,'shared');
  await b.page.clock.fastForward(26000);
  await view(b.page,'trip/1');
  await b.page.getByRole('heading',{name:'南普陀与环岛路',level:1}).waitFor();
  await view(b.page,'map/1');
  await b.page.getByRole('heading',{name:'当天路线地图',level:1}).waitFor();
  for (const page of [a.page,b.page]) {
    await view(page,'shared');
    const width=await page.evaluate(()=>({client:innerWidth,content:document.documentElement.scrollWidth}));
    assert.equal(width.client,width.content);
  }

  await query('xm_member',{p_trip:before.id,p_user:userId('b'),p_role:'viewer'},userId('a'));
  await click(b.page,'立即同步');
  await waitSynced(b.page);
  await view(b.page,'budget');
  assert.ok(await b.page.getByRole('button',{name:'保存支出'}).isDisabled());
  await view(b.page,'shared');
  await query('xm_member',{p_trip:before.id,p_user:userId('b'),p_role:null},userId('a'));
  await click(b.page,'立即同步');
  await b.page.getByText(/权限被撤销/).waitFor();
  await click(b.page,'退出登录');
  await login(b.page,'c');
  assert.ok(!(await b.page.locator('main').innerText()).includes('测试房间甲'));
  assert.deepEqual(errors,[]);
  console.log('Passed mobile 390/430, V2 preservation, join, migration failure/retry/dedup, real SQL concurrent expenses, offline restart, polling, check-ins, swap, map route and account isolation.');
} finally {
  await browser.close();
  http.close();
}
