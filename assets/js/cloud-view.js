import {migrationRows,migrationSummary} from './room-model.js';

export const roles={owner:'所有者',editor:'可编辑',viewer:'仅查看'};
export const syncNames={local:'本地模式',synced:'已同步',syncing:'正在同步',offline:'离线，待同步',failed:'同步失败'};

export function sharedView(cloud,view,ui,local) {
  const {escape,heading,section,button,link,flag,detail,field,option,money}=view;
  const title=heading('共享旅行空间','',true);
  const status='<div class="cloud-status" data-cloud-status role="status"></div>';
  const error=cloud.message?'<p class="callout">'+escape(cloud.message)+'</p>':'';
  const backLocal=link('返回本地攻略','#home','secondary');
  if (['idle','connecting'].includes(cloud.phase)) return title+'<p class="panel">正在检查共享服务…</p>'+status+backLocal;
  if (cloud.phase==='setup') return title+'<section class="panel">'+section('云同步未启用')+
    '<p>房间功能会在项目管理员完成数据库安装及权限验收后开放。本机攻略和账本可以照常使用。</p>'+
    '<div class="actions">'+button('重新检查','cloudRetry')+backLocal+'</div></section>';
  if (!cloud.user && cloud.phase==='offline') return title+'<section class="panel">'+section('目前无法连接共享服务')+
    '<p>本机攻略和账本可以离线使用。</p><div class="actions">'+button('重新连接','cloudRetry')+backLocal+'</div></section>';
  if (cloud.recovery) return title+'<form class="panel form-grid" data-form="cloudAuth" data-mode="password">'+section('设置新密码')+
    field('新密码','password','','type="password" minlength="8" maxlength="72" autocomplete="new-password" required')+
    '<button class="button primary">保存新密码</button></form>'+status;
  if (!cloud.user) {
    const mode=ui.cloudAuth;
    const caption={signin:'登录',signup:'注册',reset:'找回密码',resend:'重发验证邮件'};
    const password=['signin','signup'].includes(mode);
    return title+status+
      (cloud.pendingInvitation?'<p class="callout">已识别邀请。邮箱验证并登录后，可确认加入房间。</p>':'')+
      '<form class="panel form-grid" data-form="cloudAuth" data-mode="'+mode+'">'+section(caption[mode])+
      field('邮箱','email','','type="email" autocomplete="email" maxlength="254" required')+
      (password?field('密码','password','','type="password" '+(mode==='signup'?'minlength="8" ':'')+
        'maxlength="72" autocomplete="'+(mode==='signup'?'new-password':'current-password')+'" required'):'')+
      '<button class="button primary">'+(password?caption[mode]:'发送邮件')+'</button></form>'+
      '<div class="actions">'+Object.entries(caption).filter(([id])=>id!==mode).map(([id,text])=>button(text,'cloudAuthMode',id,'text')).join('')+'</div>'+
      '<p class="fine">注册需要邮箱验证。用手机邮件里的链接返回本站后即可登录。</p>';
  }

  const snapshot=cloud.selected;
  const members=snapshot?.members.filter(member=>member.active)??[];
  const isOwner=cloud.role==='owner';
  return title+error+
    '<section class="panel room-card">'+section(snapshot?escape(snapshot.trip.name):cloud.room?'正在打开房间':'本地旅行模式',
      snapshot?flag(roles[cloud.role],'core'):'')+
    (snapshot?'<div class="room-members">'+members.map(member=>'<span class="member-badge" title="'+escape(member.nickname)+'">'+
      escape(Array.from(member.nickname)[0]??'旅')+'</span>').join('')+'<span>'+members.length+' 位成员</span></div>':'')+
    status+'<div class="actions">'+(cloud.room?button('立即同步','cloudSync','','primary')+button('切回本地','cloudLocal'):'')+
      (isOwner?button('邀请成员','jump','room-invite','secondary','plus'):'')+'</div></section>'+
    '<section class="panel">'+section('我的账号',button('退出登录','cloudLogout','','text'))+
    '<form class="field-line" data-form="cloudProfile">'+field('房间显示昵称','nickname',cloud.nickname,'maxlength="40" required')+
    '<button class="button secondary">保存</button></form>'+
    (cloud.accountQueue.length?'<div class="actions">'+button('备份待同步记录','cloudQueueBackup','','secondary','download')+'</div>':'')+'</section>'+
    '<section class="panel">'+section('我的房间',button('刷新列表','cloudList','','text'))+
    (cloud.trips.length?cloud.trips.map(trip=>'<div class="index-row"><div><h3>'+escape(trip.name)+'</h3><p>'+roles[trip.role]+'</p></div>'+
      button(snapshot?.trip.id===trip.id?'当前房间':'打开','cloudOpen',trip.id,'secondary','',snapshot?.trip.id===trip.id?'disabled':'')+'</div>').join(''):'<p class="fine">可以创建房间，或用有效邀请加入。</p>')+
    detail('cloud-join','创建或加入房间',roomForms(view,cloud.pendingInvitation))+'</section>'+
    (snapshot?(
      conflictView(view,cloud)+
      (cloud.editable?migrationView(view,ui,local,cloud):'')+
      membersView(view,cloud,members)+
      (isOwner?ownerView(view,cloud):'')+
      notesView(view,cloud,ui)+
      '<section class="panel">'+section('退出房间')+
      (isOwner?'<p class="fine">所有者可以切回本地模式。要永久退出，请先把所有权移交给另一位成员。</p>':
      '<p class="fine">退出前可下载房间备份。待同步记录会继续留在该账号的本机备份区。</p>'+
      '<div class="actions">'+button('下载房间备份','cloudRoomBackup','','secondary','download')+
      button('退出此房间','cloudLeave','','secondary danger')+'</div>')+'</section>'
    ):'')+
    (cloud.pendingInvitation?'<section class="panel">'+section('收到邀请')+roomForms(view,cloud.pendingInvitation,true)+'</section>':'');
}

function roomForms(view,token,onlyJoin=false) {
  const {field,escape}=view;
  return '<div class="form-grid">'+(onlyJoin?'':'<form class="field-line" data-form="cloudCreate">'+
    field('房间名称','name','','placeholder="例如：我们的厦门旅行" maxlength="60" required')+'<button class="button primary">创建房间</button></form>')+
    '<form class="field-line" data-form="cloudJoin"><label>邀请链接或令牌<input name="token" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="500" value="'+
    escape(token)+'" required></label><button class="button primary">确认加入</button></form></div>';
}

function ownerView(view,cloud) {
  const {escape,section,field,option,detail,button}=view;
  const inviteStatus=row=>row.used_at?'已使用':row.revoked_at?'已撤销':Date.parse(row.expires_at)<=Date.now()?'已过期':'有效';
  return '<section class="panel" id="room-invite">'+section('邀请成员',button('查看邀请记录','cloudInvites','','text'))+
    '<form class="form-grid" data-form="cloudInvite"><div class="form-columns"><label>权限<select name="role">'+option('editor',roles.editor,'editor')+
    option('viewer',roles.viewer,'editor')+'</select></label><label>有效期<select name="hours">'+option('1','1 小时','24')+option('24','24 小时','24')+
    option('168','7 天','24')+'</select></label></div><button class="button primary">生成单次邀请</button></form>'+
    (cloud.inviteLink?'<div class="callout invite-copy"><label>邀请链接<input readonly value="'+escape(cloud.inviteLink)+'"></label>'+
    button('复制邀请','copy',cloud.inviteLink,'secondary')+'</div>':'')+
    (cloud.invites.length?detail('invite-list','邀请记录',cloud.invites.map(row=>'<div class="index-row"><div><h3>'+roles[row.role]+' · '+inviteStatus(row)+'</h3><p>'+
      escape(new Date(row.expires_at).toLocaleString())+'</p></div>'+(inviteStatus(row)==='有效'?button('撤销','cloudRevokeInvite',row.id,'text danger'):'')+'</div>').join('')):'')+'</section>'+
    '<section class="panel">'+section('房间名称')+'<form class="field-line" data-form="cloudRename">'+
    field('名称','name',cloud.selected.trip.name,'maxlength="60" required')+'<button class="button secondary">保存</button></form></section>';
}

function membersView(view,cloud,members) {
  const {escape,section,button,field,option}=view;
  const size=cloud.rows.get('setting/size')?.body?.count;
  return '<section class="panel">'+section('旅行成员')+
    members.map(member=>'<div class="index-row member-row"><div><h3>'+escape(member.nickname)+(member.id===cloud.actor?'（我）':'')+'</h3><p>'+roles[member.role]+'</p></div>'+
    (cloud.role==='owner'&&member.id!==cloud.actor?
      '<form class="actions" data-form="cloudMember" data-id="'+escape(member.id)+'"><label class="sr-only" for="role-'+escape(member.id)+'">成员角色</label><select id="role-'+
      escape(member.id)+'" name="role">'+option('editor',roles.editor,member.role)+option('viewer',roles.viewer,member.role)+option('owner','移交所有权',member.role)+
      '</select><button class="button secondary">保存</button>'+button('移除','cloudRemove',member.id,'text danger')+'</form>':'')+'</div>').join('')+
    '<p class="fine">人均分摊按'+(size?'设置的 '+size+' 人':'当前 '+members.length+' 位活跃成员')+'计算。账本另列实付金额。</p>'+
    (cloud.editable?'<form class="field-line" data-form="cloudSize" data-version="'+cloud.version('setting','size')+'">'+
    field('分摊人数（留空按成员数）','count',size??'','type="number" min="1" max="1000" inputmode="numeric"')+
    '<button class="button secondary">保存人数</button></form>':'')+'</section>';
}

function migrationView(view,ui,local,cloud) {
  const {escape,section,button,money}=view;
  const choices={travel:ui.migrateTravel,notes:ui.migrateNotes};
  const sum=local?migrationSummary(migrationRows(local,choices)):{records:0,count:0,cents:0};
  const result=cloud.room.imported;
  const pending=cloud.queue.some(op=>op.type==='import');
  const verification=result&&result.expenses_requested===result.expected.count&&result.cents_requested===result.expected.cents;
  const full=verification&&result.expenses_added+result.expenses_matched===result.expected.count&&
    result.cents_added+result.cents_matched===result.expected.cents&&result.conflicts.length===0;
  return '<section class="panel">'+section('从本机导入')+
    '<p>先下载原版 JSON 备份。确认后，本机预算、账单及其付款人和备注、打卡、收藏、行程与自定义数据将对当前房间成员可见。</p>'+
    '<div class="actions">'+button('导出原本机 JSON','export','','secondary','download')+'</div>'+
    '<form class="form-grid" data-form="cloudImport"><label class="tick"><input type="checkbox" name="travel" data-update="migrateChoice"'+
    (ui.migrateTravel?' checked':'')+'> 同时共享住宿地址、车次和交通信息</label>'+
    '<label class="tick"><input type="checkbox" name="notes" data-update="migrateChoice"'+
    (ui.migrateNotes?' checked':'')+'> 同时共享私人旅行与摄影备注</label>'+
    '<p class="fine">预览 '+sum.records+' 条 · '+sum.count+' 笔账单 · '+money(sum.cents/100)+
    '。同 ID 的相同记录会跳过，相异或疑似重复的账单留给你核对。</p>'+
    '<button class="button primary"'+(!sum.records||pending?' disabled':'')+'>确认导入此房间</button></form>'+
    (pending?'<p class="fine">导入待确认。原本机数据仍可离线查看。</p>':'')+
    (result?'<div class="callout"><strong>'+(full?'导入已核对':verification?'导入完成，有记录需核对':'导入校验失败，请保留本机备份')+
      '</strong><p>原 '+result.expected.count+' 笔 '+money(result.expected.cents/100)+'，新增 '+result.expenses_added+
      ' 笔 '+money(result.cents_added/100)+'，已有 '+result.expenses_matched+' 笔 '+money(result.cents_matched/100)+'。</p>'+
      (result.conflicts.length?'<details><summary>需核对 '+result.conflicts.length+' 项</summary><ul>'+
        result.conflicts.map(row=>'<li>'+escape(local?.expenses.find(item=>item.id===row.record_id)?.title??row.record_id)+
        (row.reason==='same_details'?' · 内容相同，请核对是否为另一笔':' · 共享空间已有不同记录')+'</li>').join('')+'</ul></details>':'')+'</div>':'')+'</section>';
}

function conflictView(view,cloud) {
  const {escape,section,button,money}=view;
  const issues=cloud.queue.filter(op=>op.issue);
  if(!issues.length)return '';
  return '<section class="panel">'+section('处理同步问题')+
    issues.map(op=>{
      const local=op.params.p_body;
      const existing=op.issue.record?.body;
      const describe=body=>!body?'已删除或无记录':op.params.p_kind==='expense'?body.title+' · '+money(body.cents/100):JSON.stringify(body);
      return '<article class="callout sync-conflict"><strong>'+(op.type==='import'?'导入未被服务器接受':op.issue.kind==='invalid'?'记录格式或付款成员待确认':'同一条记录已被其他成员修改')+
        '</strong>'+(op.type==='write'?'<p>本机 '+escape(describe(local))+'</p><p>云端 '+escape(describe(existing))+'</p>':'')+
        '<div class="actions">'+button('保留云端','cloudConflictKeep',op.id,'secondary')+
        (op.issue.kind==='conflict'&&cloud.editable?button('提交我的版本','cloudConflictRetry',op.id,'primary'):'')+'</div></article>';
    }).join('')+'</section>';
}

function notesView(view,cloud,ui) {
  const {escape,section,button}=view;
  const rows=[...cloud.rows.values()].filter(row=>row.kind==='note'&&row.body);
  const selected=rows.find(row=>row.record_id===ui.noteEdit);
  return '<section class="panel">'+section('共享备注')+
    (rows.length?rows.map(row=>'<div class="index-row"><div><p>'+escape(row.body.text)+'</p>'+
      (row.body.place?'<small>'+escape(row.body.place)+'</small>':'')+'</div>'+
      (cloud.editable?'<div class="actions">'+button('编辑','cloudEditNote',row.record_id,'text')+
        button('删除','cloudDeleteNote',row.record_id,'text danger')+'</div>':'')+'</div>').join(''):'<p class="fine">暂无共享备注。摄影详情中的私人备注单独留在当前设备。</p>')+
    (cloud.editable?'<form class="form-grid" data-form="cloudNote" data-id="'+escape(selected?.record_id??'')+'" data-place="'+escape(selected?.body.place??'')+'" data-version="'+
      (ui.noteVersion??0)+'"><label>'+(selected?'编辑共享备注':'新增共享备注')+'<textarea name="text" maxlength="1000" rows="2" required>'+
      escape(selected?.body.text??'')+'</textarea></label><button class="button primary">保存备注</button></form>':'')+'</section>';
}
