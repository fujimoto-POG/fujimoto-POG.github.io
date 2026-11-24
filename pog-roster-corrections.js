(() => {
'use strict';
const endpoint='/api/pog/roster/corrections';
const clean=value=>String(value??'').normalize('NFKC').trim();
const element=(tag,text,cls)=>{
 const node=document.createElement(tag);
 if(text!=null)node.textContent=text;
 if(cls)node.className=cls;
 return node;
};
const button=text=>{const node=element('button',text);node.type='button';return node;};
const option=(label,value)=>{const node=element('option',label);node.value=value;return node;};
const label=(text,control)=>{const node=element('label',text);node.append(control);return node;};
const visible=(node,shown)=>{node.hidden=!shown;node.style.display=shown?'':'none';};
const timeout=()=>typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(15000)}:{};
async function api(path='',body){
 const write=body!==undefined;
 const response=await fetch(endpoint+path,{
  method:write?'POST':'GET',credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(write?{'Content-Type':'application/json'}:{})},
  ...(write?{body:JSON.stringify(body)}:{}),...timeout()
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  const err=new Error(typeof data?.error==='string'?data.error:'共有データを確認できませんでした。');
  err.status=response.status;
  throw err;
 }
 if(!data||typeof data!=='object')throw Error('共有データの応答を確認できませんでした。');
 return data;
}
let panel=null;
const authorized=()=>window.POG_CAN_UPDATE===true||window.POG_CAN_EDIT_NEXT_ROSTER===true;
window.POG_OPEN_ROSTER_CORRECTION=function(owner,name){
 if(!authorized())return;
 return panel?.open(owner,name);
};
window.POG_INIT_ROSTER_CORRECTIONS=function(container,{nextSeason=false,historyEnabled=!nextSeason}={}){
 if(!authorized()||!container)return;
 if(panel)return panel;
 const box=element('details',null,'pog-admin pog-admin-roster');
 const summary=element('summary',nextSeason?'登録した馬を修正・削除':'登録した馬を修正');
 const instructions=element('p',nextSeason?'参加者と馬を選び、馬名を修正するか、その1頭だけ登録から外せます。仮馬名は、名前が決まったらここで正式馬名に変更できます。':'指名した馬の名前や、誤って登録した馬を直せます。参加者と修正する馬を選んでください。');
 const form=element('form'),owner=element('select'),horse=element('select'),field=element('input');
 field.type='text';field.maxLength=nextSeason?60:18;field.autocomplete='off';field.spellcheck=false;field.placeholder='例：アンベールフォート';
 const preview=button('修正内容を確認'),remove=nextSeason?button('この馬を削除する内容を確認'):null;preview.type='submit';
 const retry=button('登録一覧を読み直す');visible(retry,false);
 const review=element('div',null,'pog-admin-coverage');review.hidden=true;
 const apply=button('この内容で修正する'),cancel=button('入力に戻る');
 const reviewActions=element('div',null,'pog-admin-actions');visible(reviewActions,false);reviewActions.append(apply,cancel);
 const history=button('過去の成績を確認する');visible(history,false);
 const message=element('p',null,'pog-admin-message');message.setAttribute('role','status');
 form.append(label('参加者',owner),label('修正する馬',horse),label(nextSeason?'正式馬名、または母名と生年':'正しい馬名（カタカナ）',field),preview);
 if(remove)form.append(remove);
 box.append(summary,instructions,form,retry,review,reviewActions,message,history);container.append(box);
 let slots=[],loaded=false,loading=null,pendingTarget=null,pendingPreview=false,busy=false,seq=0,candidate=null,historySlotId=null;
 const sendMessage=value=>{message.textContent=value;};
 const current=()=>slots.find(row=>row.key===horse.value&&row.owner===owner.value);
 const sync=()=>{
  const locked=busy||!!loading;
  owner.disabled=locked||!slots.length;
  horse.disabled=locked||!owner.value;
  field.disabled=locked||!current();
  preview.disabled=locked||pendingPreview||!current();
  if(remove)remove.disabled=preview.disabled;
  apply.disabled=locked||!candidate;
  cancel.disabled=locked;
  retry.disabled=locked;
  form.setAttribute('aria-busy',String(busy||!!loading||pendingPreview));
 };
 function invalidate({clearMessage=true}={}){
  ++seq;candidate=null;review.replaceChildren();review.hidden=true;visible(reviewActions,false);
  if(clearMessage)sendMessage('');
  sync();
 }
 function populateHorses(selected=''){
  const choices=slots.filter(row=>row.owner===owner.value);
  horse.replaceChildren(option('馬を選択',''),...choices.map(row=>option(row.name+(row.provisionalName?'（仮馬名）':''),row.key)));
  horse.value=choices.some(row=>row.key===selected)?selected:'';
 }
 function selectTarget(target){
  if(!target||busy)return;
  const row=slots.find(item=>item.owner===target.owner&&item.name===target.name);
  invalidate();
  field.value='';visible(history,false);
  if(!row){
   owner.value='';populateHorses();sync();
   sendMessage('選んだ馬が登録一覧に見つかりません。最新の一覧から選び直してください。');return;
  }
  owner.value=row.owner;populateHorses(row.key);sync();
  field.focus?.({preventScroll:true});
 }
 async function refresh({force=false,quiet=false}={}){
  if(loading)return loading;
  if(busy&&!force)return;
  if(loaded&&!force){
   const target=pendingTarget;pendingTarget=null;selectTarget(target);
   return;
  }
  const before=current();
  let ok=false;
  visible(retry,false);
  if(!quiet)sendMessage('登録した馬を読み込んでいます…');
  // Assign before executing the async body so a synchronous fetch shim cannot race loading state.
  loading=Promise.resolve().then(async ()=>{
   try{
    const data=await api();
    if(!Array.isArray(data.slots)||data.slots.length>1000)throw Error();
    const ids=new Set();
    slots=data.slots.map(row=>{
     if(!row||!(typeof row.id==='string'&&row.id.length>0&&row.id.length<=(nextSeason?800:180)||Number.isSafeInteger(row.id))||
        typeof row.owner!=='string'||!row.owner||typeof row.name!=='string'||!row.name)throw Error();
     const key=String(row.id);if(ids.has(key))throw Error();ids.add(key);
     return {id:row.id,key,owner:row.owner,name:row.name,provisionalName:nextSeason&&window.POG_NEXT_HORSE_NAME?.isProvisional(row.name)===true};
    });
    const owners=[...new Set(slots.map(row=>row.owner))];
    owner.replaceChildren(option('参加者を選択',''),...owners.map(value=>option(value,value)));
    owner.value=owners.includes(before?.owner)?before.owner:'';
    populateHorses(before?.key);
    ok=loaded=true;
    if(!quiet)sendMessage(slots.length?'':'修正できる登録がありません。');
   }catch(e){
    visible(retry,true);
    if(e.status===401||e.status===403){
     slots=[];loaded=false;owner.replaceChildren(option('参加者を選択',''));populateHorses();
     sendMessage('修正するには管理者としてログインしてください。');
    }else if(!quiet)sendMessage('登録一覧を読み込めませんでした。「登録一覧を読み直す」を押してください。');
   }finally{
    loading=null;sync();
    if(ok&&pendingTarget&&!busy){const target=pendingTarget;pendingTarget=null;selectTarget(target);}
   }
  });
  sync();
  return loading;
 }
 owner.addEventListener('change',()=>{populateHorses();field.value='';visible(history,false);invalidate();});
 horse.addEventListener('change',()=>{field.value='';visible(history,false);invalidate();if(current())field.focus?.();});
 field.addEventListener('input',()=>{visible(history,false);invalidate();});
 retry.addEventListener('click',()=>{if(!busy){invalidate();void refresh({force:true});}});
 box.addEventListener('toggle',()=>{if(box.open&&!loaded)void refresh();});
 cancel.addEventListener('click',()=>{invalidate();field.focus?.();});
 history.addEventListener('click',()=>{if(!history.hidden)window.POG_OPEN_ROSTER_HISTORY?.(historySlotId);});
 window.addEventListener('pog-shared-updated',()=>{
  if(!box.open||busy||loading)return;
  invalidate({clearMessage:false});
  void refresh({force:true,quiet:true});
 });
 form.addEventListener('submit',event=>{event.preventDefault();return prepare(false);});
 remove?.addEventListener('click',()=>prepare(true));
 async function prepare(removing){
  if(!authorized()||busy||loading||pendingPreview||removing&&!nextSeason)return;
  invalidate();visible(history,false);
  const row=current(),name=removing?row?.name:nextSeason?window.POG_NEXT_HORSE_NAME?.normalize(field.value):clean(field.value);
  if(!row){sendMessage('参加者と修正する馬を選んでください。');return;}
  if(!removing&&(nextSeason?!name:!/^[ァ-ヺー]{2,18}$/u.test(name))){sendMessage(nextSeason?'正式馬名か、母名と生年（例：'+(window.POG_NEXT_HORSE_NAME?.example?.()??'母名と生年')+'）を入力してください。':'正しい馬名をカタカナで入力してください。');field.focus?.();return;}
  if(!removing&&name===row.name){sendMessage('今の登録と同じ馬名です。修正する名前を入力してください。');field.focus?.();return;}
  if(!removing)field.value=name;
  const revision=seq;pendingPreview=true;sync();sendMessage(removing?'削除する指名馬を確認しています…':'修正内容と、ほかの参加者の指名を確認しています…');
  try{
   const data=await api('/preview',removing?{id:row.id,remove:true}:{id:row.id,name});
   if(revision!==seq)return;
   if(data.id!==row.id||data.owner!==row.owner||data.oldName!==row.name||data.name!==name||
      !Array.isArray(data.sharedWith)||data.sharedWith.some(value=>typeof value!=='string')||
      typeof data.token!=='string'||!data.token||(data.removed===true)!==removing)throw Error('確認内容を取得できませんでした。登録一覧を読み直してください。');
   candidate={token:data.token,id:row.id,owner:row.owner,oldName:row.name,name,removing};
   apply.textContent=removing?'この馬の登録を削除する':'この内容で修正する';
   const changes=element('ul');
   for(const [what,value] of (removing?[['参加者',data.owner],['削除する馬',data.oldName]]:[['参加者',data.owner],['修正前',data.oldName],['修正後',data.name]])){
    const suffix=what!=='参加者'&&nextSeason&&window.POG_NEXT_HORSE_NAME?.isProvisional(value)?'（仮馬名）':'';
    const item=element('li');item.append(element('strong',what+'：'),document.createTextNode(value+suffix));changes.append(item);
   }
   review.replaceChildren(element('h3','公開前の確認'),changes);
   if(removing)review.append(element('p','この参加者の指名から1頭だけ削除します。参加者や、ほかの人の指名、過去のシーズンには影響しません。'));
   if(data.sharedWith.length){
    review.append(element('p','重複指名：'+data.sharedWith.join('、')+' さんも指名しています。修正は可能で、成績はそれぞれの参加者に反映されます。','shared-pick-name'));
   }
   if(historyEnabled&&!removing&&!window.POG_NEXT_HORSE_NAME?.isProvisional(name))review.append(element('p','修正前の馬の成績・ポイントはこの指名枠から外れ、修正後の馬には引き継がれません。修正後に「過去の成績を確認する」から、正しい馬のJRA成績を確認できます。'));
   review.hidden=false;visible(reviewActions,true);sendMessage('');
  }catch(e){if(revision===seq)sendMessage(e.status?e.message:'修正内容を確認できませんでした。もう一度お試しください。');}
  finally{pendingPreview=false;sync();}
 }
 apply.addEventListener('click',async()=>{
  if(busy||!candidate)return;
  const selected=candidate;busy=true;sync();sendMessage(selected.removing?'指名馬を削除しています…':'馬名を修正しています…');
  try{
   const result=await api('/apply',{token:selected.token});
   if(result.id!==selected.id||result.owner!==selected.owner||result.oldName!==selected.oldName||result.name!==selected.name||(result.removed===true)!==selected.removing)throw Error('Saved result was not confirmed');
   invalidate({clearMessage:false});
   field.value='';
   const canHistory=historyEnabled&&!selected.removing&&!window.POG_NEXT_HORSE_NAME?.isProvisional(selected.name);
   sendMessage(selected.removing?selected.owner+'さんの指名から「'+selected.name+'」を削除しました。':selected.owner+'さんの指名馬を「'+selected.name+'」に修正しました。'+(canHistory?'正しい馬の成績は「過去の成績を確認する」から確認できます。':''));
   historySlotId=canHistory?(nextSeason?'season|'+encodeURIComponent(selected.owner)+'|'+encodeURIComponent(selected.name):selected.id):null;
   visible(history,canHistory);
   window.dispatchEvent(new Event('pog-shared-updated'));
   if(canHistory&&!nextSeason)window.POG_OPEN_ROSTER_HISTORY?.(historySlotId);
  }catch(e){
   invalidate({clearMessage:false});
   sendMessage(e.status?e.message:(selected.removing?'削除結果':'修正結果')+'を確認できませんでした。公開一覧を確認してから、必要ならやり直してください。');
  }finally{
   busy=false;sync();
   await refresh({force:true,quiet:true});
  }
 });
 panel={
  open(forOwner,forName){
   if(!authorized())return;
   if(busy){box.scrollIntoView?.({block:'nearest'});return;}
   for(let parent=box.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   box.open=true;box.scrollIntoView?.({block:'nearest'});
   if(typeof forOwner==='string'&&typeof forName==='string'){
    invalidate();
    pendingTarget={owner:forOwner,name:forName};
   }else summary.focus?.({preventScroll:true});
   return refresh({force:!!pendingTarget});
  }
 };
 sync();
 return panel;
};
})();
