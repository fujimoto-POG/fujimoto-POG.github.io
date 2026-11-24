(() => {
'use strict';
const endpoint='/api/pog/roster/participants';
const el=(tag,text,cls)=>{
 const node=document.createElement(tag);
 if(text!=null)node.textContent=text;
 if(cls)node.className=cls;
 return node;
};
const button=(text,type='button')=>{const node=el('button',text);node.type=type;return node;};
const option=(text,value)=>{const node=el('option',text);node.value=value;return node;};
const show=(node,visible)=>{node.hidden=!visible;node.style.display=visible?'':'none';};
async function api(path='',body){
 const write=body!==undefined;
 const response=await fetch(endpoint+path,{
  method:write?'POST':'GET',credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(write?{'Content-Type':'application/json'}:{})},
  ...(write?{body:JSON.stringify(body)}:{}),
  ...(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(15000)}:{})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  const error=new Error(typeof data?.error==='string'?data.error:'参加者の情報を確認できませんでした。');
  error.status=response.status;throw error;
 }
 if(!data||typeof data!=='object')throw Error('参加者一覧の応答を確認できませんでした。');
 return data;
}
let initialized=false;
window.POG_INIT_PARTICIPANTS_ADMIN=function(container,{nextSeason=false,deleteOnly=false}={}){
 const authorized=()=>window.POG_ARCHIVE_VIEW!==true&&(deleteOnly?
  window.POG_CAN_MANAGE_PARTICIPANTS===true&&(nextSeason?window.POG_CAN_EDIT_NEXT_ROSTER===true:window.POG_CAN_UPDATE===true):
  nextSeason?window.POG_CAN_MANAGE_NEXT_PARTICIPANTS===true:window.POG_CAN_UPDATE===true);
 if(!authorized()||!container||initialized)return;
 initialized=true;
 const box=el('details',null,'pog-admin pog-admin-roster'+(deleteOnly?' pog-participant-delete':''));
 const status=el('p',null,'pog-admin-message');status.setAttribute('role','status');
 const retry=button('参加者一覧を読み直す');show(retry,false);
 const review=el('div',null,'pog-admin-coverage');show(review,false);
 const actions=el('div',null,'pog-admin-actions'),apply=button(''),cancel=button('キャンセル');
 actions.append(apply,cancel);show(actions,false);
 const controls={};
 function setup(action,title,discover,buttonText){
  const form=el('form'),field=el('select'),label=el('label',title),submit=button(buttonText,'submit'),empty=el('p');
  label.append(field);form.append(label,discover,empty,submit);
  field.replaceChildren(option('参加者を選択',''));
  field.disabled=submit.disabled=true;
  controls[action]={field,submit,empty,form};
  form.addEventListener('submit',event=>{event.preventDefault();void requestPreview(action);});
  field.addEventListener('change',()=>invalidate());
  return form;
 }
 box.append(el('summary',deleteOnly?'参加者を削除':'参加者を外す・戻す'),
  el('p',deleteOnly?'指名馬を1頭だけ変更する操作ではありません。参加者と、その人の全ての指名馬を今シーズンから外します。':'参加者とその指名馬を共有の一覧や順位から外せます。登録や成績は消えず、あとで戻せます。'),
  setup('archive',deleteOnly?'削除する参加者':'参加中の参加者',el('p',deleteOnly?null:'外したい参加者を選んでください。'),deleteOnly?'削除内容を確認':'外す内容を確認'));
 if(!deleteOnly)box.append(setup('restore','外した参加者',el('p','戻したい参加者を選んでください。'),'戻す内容を確認'));
 if(deleteOnly)apply.className='pog-participant-confirm';
 box.append(retry,review,actions,status);
 container.append(box);
 let rows=[],loaded=false,loading=null,previewPending=false,applying=false,revision=0,candidate=null;
 const words={archive:{title:deleteOnly?'今シーズンから削除する':'共有ページから外す',current:'一覧と順位から外れています',success:deleteOnly?'今シーズンから削除しました':'共有ページから外しました'},restore:{title:'共有ページに戻す',current:'一覧と順位に戻っています',success:'共有ページに戻しました'}};
 const message=text=>{status.textContent=text;};
 const rowFor=action=>rows.find(row=>row.key===controls[action].field.value&&row.archived===(action==='restore'));
 function sync(){
  const locked=applying||!!loading||!authorized();
  for(const [action,{field,submit,form}] of Object.entries(controls)){
   field.disabled=locked||!loaded||!rows.some(row=>row.archived===(action==='restore'));
   submit.disabled=locked||previewPending||!rowFor(action);
   form.setAttribute('aria-busy',String(applying||!!loading||previewPending));
  }
  apply.disabled=locked||!candidate;cancel.disabled=locked;retry.disabled=locked;
 }
 function invalidate(clear=true){
  ++revision;candidate=null;review.replaceChildren();show(review,false);show(actions,false);
  if(clear)message('');
  sync();
 }
 function render(){
  for(const [action,{field,empty}] of Object.entries(controls)){
   const selected=field.value,choices=rows.filter(row=>row.archived===(action==='restore'));
   field.replaceChildren(option('参加者を選択',''),...choices.map(row=>option(row.owner+'（指名馬 '+row.horseCount+'頭）',row.key)));
   field.value=choices.some(row=>row.key===selected)?selected:'';
   empty.textContent=choices.length?'':action==='archive'?'参加中の参加者はいません。':'外した参加者はいません。';
  }
 }
 function refresh(quiet=false){
  if(!authorized())return Promise.resolve(null);
  if(loading)return loading;
  show(retry,false);if(!quiet)message('参加者一覧を読み込んでいます…');
  loading=Promise.resolve().then(async()=>{
   try{
    const data=await api(),keys=new Set();
    if(!Array.isArray(data.participants)||data.participants.length>1000)throw Error();
    const collected=data.participants.map(row=>{
     if(!row||!(typeof row.id==='string'&&row.id.length>0&&row.id.length<=(nextSeason?800:180)||Number.isSafeInteger(row.id))||
       typeof row.owner!=='string'||!row.owner||!Number.isSafeInteger(row.horseCount)||row.horseCount<0||typeof row.archived!=='boolean')throw Error();
     const key=String(row.id);if(keys.has(key))throw Error();keys.add(key);
     return {id:row.id,key,owner:row.owner,horseCount:row.horseCount,archived:row.archived};
    });
    rows=collected;loaded=true;render();if(!quiet)message('');return rows;
   }catch(error){
    rows=[];loaded=false;render();show(retry,true);
    if(error.status===401||error.status===403)message('参加者の変更は、管理者としてログインしてください。');
    else if(!quiet)message('参加者一覧を読み込めませんでした。「参加者一覧を読み直す」を押してください。');
    return null;
   }finally{loading=null;sync();}
  });
  sync();return loading;
 }
 async function requestPreview(action){
  if(!authorized()||applying||loading||previewPending||!box.open)return;
  const expected=rowFor(action);if(!expected){message('参加者を選んでください。');return;}
  invalidate();const stamp=revision;
  previewPending=true;sync();message('変更内容を確認しています…');
  try{
   const data=await api('/preview',{id:expected.id,action});
   if(stamp!==revision||!box.open||!authorized())return;
   if(data.id!==expected.id||data.owner!==expected.owner||data.horseCount!==expected.horseCount||
      data.action!==action||typeof data.token!=='string'||!data.token)throw Error('Preview mismatch');
   candidate={...expected,action,token:data.token};
   const title=el('h3','「'+data.owner+'」さんを'+words[action].title);title.tabIndex=-1;
   review.replaceChildren(title,el('p','対象：指名馬 '+data.horseCount+'頭'));
   if(deleteOnly)review.append(el('p','この参加者と、その人の全ての指名馬が今シーズンの一覧・順位から外れます。同じ馬を指名したほかの参加者や、保存済みの過去の成績には影響しません。'));
   else if(action==='archive')review.append(el('p','この参加者とその指名馬の表示が共有一覧・順位から外れます。指名馬や成績は削除せず、あとで戻せます。同じ馬を指名したほかの参加者には影響しません。'));
   else review.append(el('p','この参加者とその指名馬を共有一覧・順位に戻します。保存されている成績も再び表示されます。'));
   apply.textContent=deleteOnly?'この参加者を削除する':action==='archive'?'この参加者を外す':'この参加者を戻す';
   show(review,true);show(actions,true);message('');title.focus?.();
  }catch(error){
   if(stamp!==revision)return;
   message(error.status?error.message:'確認内容を取得できませんでした。参加者一覧を読み直してください。');
   if(!error.status||error.status===409)show(retry,true);
  }finally{previewPending=false;sync();}
 }
 apply.addEventListener('click',async()=>{
  if(!authorized()||applying||!candidate||!box.open)return;
  const expected=candidate,archived=expected.action==='archive';
  applying=true;sync();message(deleteOnly?'参加者を削除しています…':'参加者の表示を変更しています…');
  try{
   const data=await api('/apply',{token:expected.token});
   if(data.id!==expected.id||data.owner!==expected.owner||data.horseCount!==expected.horseCount||
      data.action!==expected.action||data.archived!==archived)throw Error('Save result mismatch');
   invalidate(false);
   window.dispatchEvent(new Event('pog-shared-updated'));
   const refreshed=await refresh(true);
   if(refreshed)message('「'+expected.owner+'」さんを'+words[expected.action].success+'。');
   else message('「'+expected.owner+'」さんを'+words[expected.action].success+'。一覧の再読み込みが必要です。');
  }catch(error){
   invalidate(false);
   message(error.status&&error.status<500?error.message:'変更結果を確認できませんでした。参加者一覧を確認しています…');
   const refreshed=await refresh(true);
   if(!error.status||error.status>=500){
    const row=refreshed?.find(row=>row.id===expected.id&&row.owner===expected.owner);
    if(row?.archived===archived){
     message('処理結果は確認できませんでしたが、現在の共有一覧では「'+expected.owner+'」さんは'+words[expected.action].current+'。');
     window.dispatchEvent(new Event('pog-shared-updated'));
    }else message('変更結果を確認できませんでした。現在の参加者一覧を確かめてから、必要な場合だけやり直してください。');
   }
  }finally{applying=false;sync();status.scrollIntoView?.({block:'nearest'});}
 });
 cancel.addEventListener('click',()=>{if(!applying){const action=candidate?.action;invalidate();if(action)controls[action].field.focus?.();}});
 retry.addEventListener('click',()=>{if(!applying){invalidate();void refresh();}});
 box.addEventListener('toggle',()=>{
  if(!authorized()||applying)return;
  if(box.open){invalidate();void refresh();}
  else invalidate();
 });
 window.addEventListener('pog-shared-updated',()=>{
  if(!box.open||applying||loading||!authorized())return;
  invalidate(false);void refresh(true);
 });
 return {open(){if(authorized()){box.open=true;return refresh();}}};
};
})();
