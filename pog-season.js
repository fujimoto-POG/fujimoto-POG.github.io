(() => {
'use strict';
const endpoint='/api/pog/season';
const seasonId=window.POG_SEASON_HELPERS?.id??(value=>typeof value==='string'&&/^\d{4}-\d{2}$/.test(value)&&Number(value.slice(5))===(Number(value.slice(0,4))+1)%100);
const following=window.POG_SEASON_HELPERS?.following??(value=>seasonId(value)?(Number(value.slice(0,4))+1)+'-'+String((Number(value.slice(0,4))+2)%100).padStart(2,'0'):'');
const el=(tag,content,cls)=>{const node=document.createElement(tag);if(content!=null)node.textContent=content;if(cls)node.className=cls;return node;};
const button=label=>{const node=el('button',label);node.type='button';return node;};
let initialized=false;
async function request(payload){
 const write=payload!==undefined;
 const res=await fetch(endpoint,{method:write?'POST':'GET',cache:'no-store',credentials:'same-origin',
  headers:{Accept:'application/json',...(write?{'Content-Type':'application/json'}:{})},
  ...(write?{body:JSON.stringify(payload)}:{})});
 const data=await res.json().catch(()=>null);
 if(!res.ok||!data){
  const error=new Error(typeof data?.error==='string'?data.error:'シーズンの設定を確認できませんでした。');error.status=res.status;throw error;
 }
 if(!seasonId(data.active)||typeof data.revision!=='string'||!data.revision||!Array.isArray(data.participants)||
  data.participants.some(n=>typeof n!=='string'||!n.trim()||n.length>40))throw Error('シーズンの設定を読み取れませんでした。');
 const nextSeason=data.nextSeason??following(data.active);
 if(!seasonId(nextSeason)||nextSeason!==following(data.active))throw Error('年度更新の準備状況を確認できませんでした。');
 return {...data,nextSeason};
}
window.POG_INIT_SEASON_ADMIN=function(container){
 if(!container||initialized||window.POG_ARCHIVE_VIEW===true)return;
 initialized=true;
 const panel=el('details',null,'pog-admin pog-admin-roster'),summary=el('summary','年度更新');
 const description=el('p','今の順位とレース結果を「過去の成績」に保存します。保存後の成績は更新されません。');
 const overview=el('section'),reviewButton=button('年度更新の内容を確認する');
 overview.append(reviewButton);
 const review=el('section',null,'pog-admin-coverage'),reviewItems=el('ul'),reviewTitle=el('h3','年度更新前の確認'),reviewText=el('p');
 const confirm=button('年度更新を実行する'),cancel=button('キャンセル'),actions=el('div',null,'pog-admin-actions');
 actions.append(confirm,cancel);review.append(reviewTitle,reviewText,reviewItems,actions);
 const status=el('p',null,'pog-admin-message');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const retry=button('年度更新の内容を読み直す');
 panel.append(summary);container.append(panel);
 panel.append(description,overview,review,retry,status);
 let state=null,busy=false,conflict=false,readyToWrite=null;
 function sync(){
  const available=!!state&&!conflict;
  panel.setAttribute('aria-busy',String(busy));overview.hidden=!available;
  reviewButton.disabled=busy||!available||!!readyToWrite;
  confirm.disabled=busy||!readyToWrite;cancel.disabled=busy;review.hidden=!readyToWrite;retry.hidden=busy||(available&&!conflict);
 }
 async function load(){
  if(busy)return;
  state=null;readyToWrite=null;busy=true;sync();status.textContent='引き継ぐ参加者を確認しています…';
  try{
   state=await request();conflict=false;
   const viewed=window.POG_BOARD_SEASON?.active;
   if(viewed&&viewed!==state.active){
    conflict=true;status.textContent='別の画面で年度が更新されました。ページを再読み込みしてください。';
    window.location?.reload?.();
   }else{
    description.textContent='今の順位とレース結果は「過去の成績」に移り、以後は更新されません。参加者全員の名前だけを引き継ぎ、指名馬は空、ポイントは全員0から始まります。';
    status.textContent='';
   }
  }catch(e){status.textContent=e.message;}
  finally{busy=false;sync();}
 }
 panel.addEventListener('toggle',()=>{if(panel.open&&!state)void load();});
 retry.addEventListener('click',load);
 reviewButton.addEventListener('click',()=>{
  if(busy||!state||readyToWrite||conflict)return;
  const participants=state.participants;
  readyToWrite={expectedRevision:state.revision};
  reviewItems.replaceChildren(...participants.map(name=>el('li',name)));
  reviewText.textContent=(participants.length?'参加者全員（'+participants.length+'人）の名前を引き継ぎます。':'引き継ぐ参加者はいません。')+
   '指名馬は空、ポイントは0で始まります。今の成績は過去の成績に保存し、以後は更新されません。';
  status.textContent='内容を確認し、よければ下のボタンを押してください。';
  sync();confirm.focus();
 });
 cancel.addEventListener('click',()=>{if(!busy){readyToWrite=null;status.textContent='';sync();reviewButton.focus();}});
 confirm.addEventListener('click',async()=>{
  if(busy||!readyToWrite)return;
  busy=true;const payload=readyToWrite,target=state.nextSeason;sync();status.textContent='今の成績を保存しています…';
  try{
   const saved=await request(payload);
   if(saved.active!==target||JSON.stringify([...saved.participants].sort())!==JSON.stringify([...state.participants].sort()))throw Error('切り替えを確認できませんでした。');
   readyToWrite=null;
   status.textContent='年度更新が完了しました。今までの成績は「過去の成績」から見られます。';
   window.location?.reload?.();
  }catch(e){
   readyToWrite=null;conflict=true;
   status.textContent=e.status===409?'別の画面で設定が変わりました。年度更新の内容を読み直してください。':'保存結果を確認できませんでした。二重に操作せず、年度更新の内容を読み直してください。';
  }finally{busy=false;sync();}
 });
 sync();
};
})();
