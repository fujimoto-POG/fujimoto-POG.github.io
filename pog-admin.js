(() => {
'use strict';
const root=document.getElementById('organizer-update'),toolsPanel=document.getElementById('admin-tools'),quick=document.getElementById('organizer-quick'),device=document.getElementById('device-tools');if(!root||!toolsPanel||!quick)return;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const button=text=>{const n=el('button',text);n.type='button';return n;};
const source=url=>{try{const u=new URL(url);if(u.protocol!=='https:')return null;const a=el('a','情報元を開いて確認');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}};
async function api(path,body,validation=false){const r=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});let d;try{d=await r.json();}catch{throw Error('応答を読み取れませんでした。');}if(!r.ok&&!(validation&&Array.isArray(d.errors)))throw Error(d.error||'サービスに接続できませんでした。');return d;}
const announce=()=>window.dispatchEvent(new Event('pog-shared-updated'));
const message=()=>{const p=el('p','','pog-admin-message');p.setAttribute('role','status');p.setAttribute('aria-live','polite');return p;};
function rows(target,title,items){const list=el('ul',null,'pog-admin-changes');target.append(el('h4',`${title}（${items.length}件）`),list);for(const row of items){const li=el('li');li.append(el('strong',row.name||'馬名未確認'));const labels={type:'区分',date:'日付',race:'レース',status:'出走状態',kind:'近況区分',detail:'近況',popularity:'単勝人気',place:'着順',pointChange:'加算ポイント',previousPlace:'掲載中の着順',previousPrize:'掲載中の加算ポイント',reason:'理由',description:'詳細',before:'反映前',after:'反映後',sourceLabel:'情報元'};const kinds={upcoming:'出走予定',update:'近況',injury:'故障で休養中',rest:'休養中',retired:'引退',deregistered:'JRA登録抹消',returned:'復帰',development:'デビューまでの調整',trainer:'厩舎コメント',training:'トレセン在厩',pasture:'放牧中',gate:'ゲート試験合格','next-tbd':'次走未定'};for(const [k,label]of Object.entries(labels))if(row[k]!=null)li.append(el('span',`${label}：${typeof row[k]==='object'?JSON.stringify(row[k]):kinds[row[k]]||row[k]}`));const a=source(row.resultSource||row.source);if(a)li.append(a);list.append(li);}}
function raceReview(target,data){
 const c=data.coverage||{};
 if(c.noMeeting!==true&&data.detail)target.append(el('p',data.detail));
 if(c.status==='complete'&&data.corrections?.length)target.append(el('p','すでに掲載された成績と違う結果が見つかりました。自動では反映しません。'));
 if(Array.isArray(data.proposals)&&data.proposals.length)rows(target,'追加',data.proposals);
 if(Array.isArray(data.corrections)&&data.corrections.length)rows(target,'訂正',data.corrections);
}
function resultStatus(data){
 if(data.coverage?.noMeeting===true)return '開催なし';
 if(data.allowApply===true&&data.token)return '新しい成績あり';
 if(data.corrections?.length)return '掲載済みの成績に違いがあります';
 if(data.processed===true)return '確認済み・新しい成績なし';
 return '成績を確認できませんでした';
}
function rosterControls({canManageParticipants=false,nextSeason=false,historyEnabled=true,canCheckNextHorseNames=false}={}){
 const group=el('details',null,'pog-admin-roster pog-roster-data');
 const target=el('details',null,'pog-admin-roster pog-roster-manage');
 group.append(el('summary','データ修正、追加、削除'),target);
 target.append(el('summary',canManageParticipants?'参加者・指名馬を追加・削除':'参加者・指名馬を管理'));
 toolsPanel.append(group);
 window.POG_INIT_ROSTER_ADMIN?.(target,{nextSeason,historyEnabled});
 window.POG_INIT_ROSTER_CORRECTIONS?.(target,{nextSeason,historyEnabled});
 if(canManageParticipants)window.POG_INIT_PARTICIPANTS_ADMIN?.(target,{nextSeason,deleteOnly:true});
 window.POG_CAN_LOOKUP_HORSE_NAMES=!nextSeason||canCheckNextHorseNames;
 if(window.POG_CAN_LOOKUP_HORSE_NAMES)window.POG_INIT_HORSE_NAME_LIST?.(group,{legacy:!nextSeason});
 if(historyEnabled){
  const historyPanel=window.POG_INIT_ROSTER_HISTORY?.(group);
  if(historyPanel)window.POG_OPEN_ROSTER_HISTORY=id=>historyPanel.open(id);
 }
}
function init({nextSeason=false,canCheckNextHorseNames=false,beforeSeason=false,currentBoard=false,canManageParticipants=false}={}){
 root.classList.add('pog-admin');
 const panel=el('details');
 panel.append(el('summary','成績、情報更新'),el('h2','主催者・幹事用 · 情報更新'));
 if(currentBoard)panel.open=true;
 root.replaceChildren(panel);root.hidden=false;toolsPanel.hidden=false;if(device)device.hidden=false;
 if(nextSeason){window.POG_CAN_EDIT_NEXT_ROSTER=true;window.POG_CAN_EDIT_NEXT_DEVICE=document.documentElement?.dataset?.pogDeviceEditing!=='off';}
 else window.POG_CAN_UPDATE=true;
 rosterControls({canManageParticipants,nextSeason,canCheckNextHorseNames});
 let busy=false;const syncs=[];const lock=v=>{busy=v;panel.setAttribute('aria-busy',String(v));syncs.forEach(f=>f());};
 initBacklog(panel,quick,()=>busy,lock,syncs,{auto:!beforeSeason,currentBoard});
 initEntries(panel,()=>busy,lock,syncs);
 initPaste(panel,()=>busy,lock,syncs);
 const reload=button('最新の表示に読み直す');reload.addEventListener('click',()=>window.location.reload());panel.append(reload);
 window.dispatchEvent?.(new Event('pog-editor-ready'));
}
function initBacklog(panel,quick,isBusy,lock,syncs,{auto=true,currentBoard=false}={}){
 const section=el('section',null,'pog-update-results'),title=el('h3','競走成績を更新');title.tabIndex=-1;section.append(title,el('p','レース後に、JRAで確定した着順やポイントを更新します。新しい成績は自動で探し、確認してから反映します。'));
 const checkLabel='JRAの競走成績を確認';
 const check=button(checkLabel),retry=button('確認できなかった日を再確認'),apply=button('OK・競走成績を更新'),show=button('成績の内容を見る'),msg=message(),summary=message(),out=el('div'),actions=el('div',null,'pog-admin-actions');
 actions.append(check,retry);section.append(actions,msg,out);panel.append(section);quick.classList.add('pog-update-results');quick.append(summary,apply,show);
 const records=new Map();let running=false,publishing=false,started=false,notice='';
 const ready=()=>[...records.values()].filter(x=>x.state==='ready'&&x.token),errors=()=>[...records.values()].filter(x=>x.state==='error');
 const sync=()=>{
  const batch=ready(),locked=running||isBusy(),count=batch.reduce((n,x)=>n+(x.data.proposals?.length||0),0);
  check.disabled=locked||!!batch.length;check.textContent=started?'続きの未反映日を確認':checkLabel;
  retry.hidden=!errors().length;retry.disabled=locked||!!batch.length;apply.hidden=!batch.length;apply.disabled=locked||!batch.length;
  const showNotice=!!(publishing||(!running&&batch.length)||notice);
  quick.hidden=!showNotice;show.disabled=publishing;
  summary.textContent=publishing?'JRA成績を公開しています…':batch.length?`新しいJRA成績が${count}件あります。更新しますか？`:notice;
 };
 syncs.push(sync);
 show.addEventListener('click',()=>{toolsPanel.open=true;panel.open=true;section.scrollIntoView?.({block:'nearest'});title.focus();});
 const render=()=>{
  out.replaceChildren();for(const r of records.values()){
   const box=el('div',null,'pog-admin-coverage'),label=r.state==='done'?'反映済み':r.state==='error'?'未完了・再確認が必要':r.data?resultStatus(r.data):'確認中';
   box.append(el('strong',`${r.date}：${label}`));
   if(r.detail&&!r.data?.coverage?.noMeeting&&r.detail!==r.data?.detail)box.append(el('p',r.detail));
   if(r.data)raceReview(box,r.data);out.append(box);
  }sync();
 };
 async function run(retryOnly=false){
  if(running||isBusy()||ready().length)return;
  running=true;notice='';sync();msg.textContent='未確認の日付を確認しています…';
  try{
   const b=await api('/api/pog/backlog'),days=[...new Set((Array.isArray(b.days)?b.days:[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
   for(const r of errors())if(!days.includes(r.date)){r.state='unchanged';r.detail='ほかの更新で確認済みになりました。';}
   const selected=(retryOnly?errors().map(r=>r.date).filter(d=>days.includes(d)):days.filter(d=>!records.has(d))).slice(0,4);
   started=!!days.length;render();
   for(const date of selected){
    const r={date,state:'checking'};records.set(date,r);render();
    msg.textContent=`${date}のJRA成績を確認中です。まだ公開していません。`;
    try{
     const d=await api('/api/pog/preview',{from:date,to:date});r.data=d;r.detail=d.detail||'';
     if(d.coverage?.status==='complete'&&d.allowApply===true&&d.token&&d.proposals?.length){r.state='ready';r.token=d.token;}
     else if(d.processed===true)r.state='unchanged';
     else {r.state='error';r.detail=d.detail||'確認範囲が不足しているため、この日は未完了です。';}
    }catch(e){r.state='error';r.detail=e.message;}
    render();
   }
   const remaining=days.filter(d=>!records.has(d)).length;
   msg.textContent=ready().length?'上の「OK・競走成績を更新」で反映します。':errors().length?'確認できなかった日は反映していません。必要なら再確認してください。':remaining?'まだ未確認の日があります。続きの確認へ進めます。':'公開する新しい成績はありません。';
  }catch(e){msg.textContent=`成績の一覧を確認できませんでした：${e.message} 公開内容は変えていません。`;}
  finally{running=false;sync();}
 }
 check.addEventListener('click',()=>run());retry.addEventListener('click',()=>run(true));
 apply.addEventListener('click',async()=>{
  if(running||isBusy())return;const batch=ready();if(!batch.length)return;
  publishing=true;lock(true);let count=0,needsRetry=false;
  try{
   for(const r of batch){
    try{const d=await api('/api/pog/apply',{token:r.token});r.state='done';r.detail='確認した成績を反映しました。';count+=d.applied||0;}
    catch(e){r.state='error';needsRetry=true;r.detail=`反映を確認できませんでした：${e.message}`;}
    delete r.token;render();
   }
   announce();
   notice=needsRetry?(count?`JRA成績を${count}件公開しました。一部は再確認が必要です。`:'成績の反映を確認できませんでした。内容を見て再確認してください。'):count?`JRA成績を${count}件公開しました。`:'すでに最新の成績が反映されています。';
   msg.textContent=notice;
  }finally{publishing=false;lock(false);}
 });
 sync();if(auto)void run();else msg.textContent=currentBoard?'今の対象期間には、確認できる開催結果がまだありません。':'対象の開催前です。開催後にJRA成績を確認できます。';
}
function initNewsBatch(panel,isBusy,lock,syncs,{manual}){
 const section=el(manual?'details':'section',null,manual?'pog-update-news':'pog-update-entries'),heading=el(manual?'summary':'h3',manual?'近況・出走予定を更新':'出走馬の確定情報を更新');
 section.append(heading,el('p',manual?'まだJRAの出馬表に載っていない次走の予定や、けが・引退・復帰などを更新します。':'JRAの公式出馬表を取り込むと、対象馬は「予定」から「確定」に切り替わります。日本時間でレース日を過ぎると、どちらも表示されません。'));
 let incoming=null,preview=null;
 if(manual){
  section.append(el('p','調査文をChatGPTに貼り付けます。回答のJSON枠にある「コピー」を押し、下の「調査結果」に貼り付けてください。','pog-research-instructions'),
   el('p','故障の表示は日付が過ぎても消えません。復帰を出典で確認して反映すると消えます。'));
  const prompt=el('textarea'),label=el('label','ChatGPTに貼る調査文'),copy=button('調査文をコピー');
  prompt.readOnly=true;prompt.rows=4;prompt.setAttribute('aria-label','ChatGPTに貼る調査文');
  const fillPrompt=()=>{
   const roster=window.POG_SHARED_ROSTER;
   if(!Array.isArray(roster)){copy.disabled=true;prompt.value='共有の指名馬一覧を確認しています。';return;}
   const horses=[...new Set(roster.filter(h=>h.name&&!h.provisionalName).map(h=>h.name))];
   copy.disabled=!horses.length;
   prompt.value=[
    'みんなのPOGの指名馬について、新しい次走予定・故障・引退・JRA登録抹消・復帰を調べてください。既出の情報や推測は除き、JRA・クラブ等の根拠ページを開いて確認してください。判明済みの取消や不明な日付は出力しないでください。',
    '確定した次走はPOGの公式出馬表ボタンで取り込むため、ここでは日本時間で今日以降の未確定の「予定」だけを返してください。馬名は以下の表記どおりにしてください：'+horses.join('、')+'。',
    '復帰は、故障発表日より後の日付で実際の復帰が出典から確認できたものだけにしてください。復帰予定は除きます。',
    '回答は、有効なJSONオブジェクト1個を小文字の json 指定のコードブロック1つに入れて返してください。コードブロックの外には説明、見出し、出典一覧、引用記号を書かないでください。ブロックの中にも引用記号やコメントを入れないでください。',
    '最上位のキーは upcoming と updates の2つだけです。どちらも配列とし、該当する情報がない配列は [] にしてください。どちらも該当なしなら {"upcoming":[],"updates":[]} を返してください。',
    'upcoming の各項目：name、date（YYYY-MM-DD）、race、status（必ず「予定」）、source（根拠ページのURL）。',
    'updates の各項目：name、date（YYYY-MM-DD）、kind（injury / retired / deregistered / returned のいずれか）、detail（日本語）、source（根拠ページのURL）、sourceLabel（出典名）。',
    'source には https:// で始まるURLそのものを文字列で入れてください。リンクの表示名、Markdownのリンク記法、引用番号は付けないでください。JSONのキーや文字列は半角の二重引用符で囲み、括弧・角括弧・波括弧・コロン・カンマも半角を使います。構造の角括弧をMarkdown用にバックスラッシュでエスケープせず、末尾カンマも付けないでください。'
   ].join('\n');
  };
  window.POG_REFRESH_RESEARCH_PROMPT=fillPrompt;fillPrompt();
  const researchActions=el('div',null,'pog-research-actions'),chat=el('a','ChatGPTを開く','pog-admin-link');
  chat.href='https://chatgpt.com/';chat.target='_blank';chat.rel='noopener noreferrer';
  researchActions.append(copy,chat);
  label.append(prompt);section.append(label,researchActions);
  incoming=el('textarea');incoming.rows=5;incoming.placeholder='調査結果をここに貼り付け';const pasteLabel=el('label','調査結果');pasteLabel.append(incoming);section.append(pasteLabel);
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(prompt.value);copy.textContent='調査文をコピーしました';}catch{prompt.focus();prompt.select();copy.textContent='選択した調査文をコピーしてください';}});
 }
 const check=button(manual?'貼り付けた内容を確認':'JRAの確定出馬表を確認'),apply=button(manual?'確認した変更をまとめて公開':'確定した出走馬を反映'),msg=message(),out=el('div');
 apply.hidden=true;section.append(check,msg,out,apply);panel.append(section);
 const sync=()=>{check.disabled=isBusy();if(incoming)incoming.disabled=isBusy();apply.disabled=isBusy()||!preview?.token||preview.allowApply!==true;};syncs.push(sync);
 const invalidate=()=>{preview=null;apply.hidden=true;out.replaceChildren();msg.textContent='';sync();};incoming?.addEventListener('input',invalidate);
 check.addEventListener('click',async()=>{if(isBusy())return;invalidate();const raw=incoming?.value.trim();if(manual&&!raw){msg.textContent='先に調査結果を貼り付けてください。';return;}if(raw?.length>60000){msg.textContent='貼り付けた内容が長すぎます。分けて確認してください。';return;}
  lock(true);msg.textContent=manual?'貼り付けた内容を確認しています…':'JRAの出馬表を確認しています…';
  try{const d=await api(manual?'/api/pog/news/preview':'/api/pog/entries/preview',manual?{text:raw}:{},true);preview=d;
   const items=Array.isArray(d.items)?d.items:[],errors=Array.isArray(d.errors)?d.errors:[];
   if(items.length)rows(out,'公開する変更',items);
   if(errors.length){const list=el('ul');for(const e of errors)list.append(el('li',typeof e==='string'?e:'内容を確認してください。'));out.append(list);}
   apply.hidden=!(d.allowApply===true&&d.token);
   msg.textContent=errors.length?'このままでは公開できません。':!apply.hidden?'出典と内容を確認してから公開してください。':d.detail||d.message||'公開する新しい変更はありません。';
  }catch(e){msg.textContent='確認できませんでした。公開内容は変えていません。'+e.message;}finally{lock(false);}
 });
 apply.addEventListener('click',async()=>{if(isBusy()||!preview?.token||preview.allowApply!==true)return;
  const token=preview.token;lock(true);
  try{const d=await api('/api/pog/news/apply',{token});announce();out.replaceChildren();if(incoming)incoming.value='';msg.textContent=`みんなのページに${d.applied??0}件公開しました。`;}
  catch(e){msg.textContent='公開を確認できませんでした。ページを確認してから、もう一度お試しください。'+e.message;}
  finally{preview=null;apply.hidden=true;lock(false);}
 });sync();
}
const initEntries=(...args)=>initNewsBatch(...args,{manual:false});
const initPaste=(...args)=>initNewsBatch(...args,{manual:true});

function initNextRoster({canCheckNextHorseNames=false,canManageParticipants=false}={}){
 window.POG_CAN_EDIT_NEXT_ROSTER=true;
 root.classList.add('pog-admin');
 root.replaceChildren(el('p','今シーズンの参加者・指名馬を登録、修正できます。'));
 root.hidden=false;toolsPanel.hidden=false;
 rosterControls({canManageParticipants,nextSeason:true,historyEnabled:false,canCheckNextHorseNames});
 quick.hidden=true;
 window.dispatchEvent?.(new Event('pog-editor-ready'));
}
if(window.POG_ARCHIVE_VIEW!==true){
 let started=false;
 const start=async()=>{
  if(started)return;
  // A confirmed board scope must precede old season tools and their automatic JRA checks.
  if(window.POG_BOARD_READY&&!window.POG_BOARD_SEASON)return;
  started=true;
  try{
   const s=await api('/api/pog/status');
   const scope=window.POG_BOARD_SEASON;
   if(scope?.archive)return;
   if(scope?.active&&s.activeSeason&&scope.active!==s.activeSeason){window.location?.reload?.();return;}
   const modern=!!scope?.active&&scope.active!==(window.POG_SEASON_HELPERS?.legacy??'2026-27');
   const nextRoster=modern&&s.canEditNextRoster===true;
   const canManageParticipants=s.canManageParticipants===true;
   window.POG_CAN_MANAGE_PARTICIPANTS=canManageParticipants;
   if(nextRoster&&s.canUpdate===true)init({nextSeason:true,canManageParticipants,canCheckNextHorseNames:s.canCheckNextHorseNames===true,beforeSeason:typeof s.min==='string'&&typeof s.max==='string'&&s.min>s.max,currentBoard:scope.currentBoard===true||s.currentBoard===true});
   else if(nextRoster)initNextRoster({canManageParticipants,canCheckNextHorseNames:s.canCheckNextHorseNames===true});
   else if(s.canUpdate===true&&!modern)init({canManageParticipants,currentBoard:scope?.currentBoard===true||s.currentBoard===true});
   if(s.canManageSeason===true){
    toolsPanel.hidden=false;
    window.POG_INIT_SEASON_ADMIN?.(toolsPanel);
   }
   if(s.canUpdate!==true&&!nextRoster){
    root.hidden=true;
    const login=document.getElementById('organizer-signin');
    if(login&&s.signedIn===false){login.hidden=false;toolsPanel.hidden=false;}
   }
  }catch{root.hidden=true;}
 };
 window.addEventListener?.('pog-season-ready',start);
 if(window.POG_BOARD_READY)window.POG_BOARD_READY.then(start);
 else void start();
}
})();
