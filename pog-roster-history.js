(() => {
'use strict';
const create=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
const button=(text)=>{const n=create('button',text);n.type='button';return n;};
const history='/api/pog/roster/history';
async function request(path,payload){
 const res=await fetch(history+path,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(payload===undefined?{}:{'Content-Type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 const data=await res.json();if(!res.ok){const e=new Error(data.error||'通信に失敗しました。');e.status=res.status;throw e;}return data;
}
window.POG_INIT_ROSTER_HISTORY=function(container){
 const box=create('details');box.className='pog-admin-roster';
 const list=create('div'),msg=create('p');msg.className='pog-admin-message';msg.setAttribute('role','status');
 const start=button('過去の成績をまとめて更新'),stop=button('いったん止める'),all=button('すべての対象を見る');start.disabled=true;stop.hidden=true;all.hidden=true;
 const summary=create('summary','追加・訂正した指名馬の過去成績');
 box.append(summary,
  create('p','JRA公式の過去成績を日付ごとに確認して反映します。確認中はページを開いたままにしてください。途中で止めても続きから再開できます。'),
  start,stop,all,msg,list);
 container.append(box);
 let active=false,stopping=false,view=0,selectedId=null;
 const rows=async()=>{
  const data=await request('');
  if(!Array.isArray(data?.participants))throw Error('確認状況が取得できませんでした。');
  return data.participants.filter(x=>x&&typeof x.owner==='string'&&Array.isArray(x.days)&&Number.isInteger(x.remaining)&&(!selectedId||x.id===selectedId));
 };
 function show(participants){
  const ul=create('ul');
  for(const p of participants)ul.append(create('li',p.owner+(typeof p.name==='string'?'・'+p.name:'')+'：'+(p.remaining?'過去分を確認中（残り '+p.remaining+' 日）':'過去分を確認済み')));
  list.replaceChildren(participants.length?ul:create('p',selectedId?'この指名の確認状況が見つかりません。':'過去成績を確認する対象はありません。'));
  if(!active)start.disabled=!participants.some(p=>p.days.length);
 }
 const refresh=async()=>{
  const rev=++view;
  try{const p=await rows();if(rev!==view)return;show(p);}
  catch(e){if(rev===view){start.disabled=false;msg.textContent=e.message;}}
 };
 box.addEventListener('toggle',()=>{if(box.open&&!active)void refresh();});
 window.POG_REFRESH_ROSTER_HISTORY=()=>{if(box.open&&!active)void refresh();};
 all.addEventListener('click',()=>{if(!active){selectedId=null;all.hidden=true;msg.textContent='';return refresh();}});
 stop.addEventListener('click',()=>{stopping=true;stop.disabled=true;msg.textContent='いま確認中の日を終えたら止めます。';});
 const key=(p,date)=>JSON.stringify([p.id??null,p.owner,date]);
 start.addEventListener('click',async()=>{
  if(active)return;
  active=true;++view;start.disabled=true;stop.hidden=false;stop.disabled=false;all.disabled=true;stopping=false;
  let count=0,ended=false,pending=-1;
  const attempted=new Set();
  try{
   let participants=await rows();show(participants);
   while(!stopping){
    let job;
    for(const p of participants){const date=p.days.find(d=>typeof d==='string'&&!attempted.has(key(p,d)));if(date){job={owner:p.owner,date,...(typeof p.id==='string'?{id:p.id}:{})};break;}}
    if(!job)break;
    attempted.add(key(job,job.date));
    msg.textContent=job.owner+'：'+job.date.replaceAll('-','/')+' のJRA成績を確認しています…';
    try{
     const p=await request('/preview',job);
     if(p.allowApply===true&&p.token){
      const done=await request('/apply',{token:p.token});
      count+=Number.isInteger(done.applied)?done.applied:0;
      window.dispatchEvent(new Event('pog-shared-updated'));
     }
    }catch(e){if(e.status===401||e.status===403||e.status===429)throw e;msg.textContent=e.message;}
    participants=await rows();show(participants);
    // Let the browser process user input before selecting the next day.
    if(!stopping&&participants.some(p=>p.days.some(d=>!attempted.has(key(p,d)))))await new Promise(r=>setTimeout(r,200));
   }
   pending=participants.reduce((n,x)=>n+x.remaining,0);ended=pending===0;
   msg.textContent=ended?'過去成績の確認が終わりました。'+(count?'今回 '+count+' 件を反映しました。':''):stopping?'途中で止めました。次回は未確認の日から再開できます。':count+'件を反映しました。確認できなかった日が'+pending+'日残っています。時間をおいて、もう一度更新してください。';
  }catch(e){msg.textContent='確認を中断しました。反映済みの成績は残っています。'+e.message;}
  finally{
   active=false;start.disabled=ended;stop.hidden=true;all.disabled=false;
   if(count||attempted.size)window.dispatchEvent(new Event('pog-shared-updated'));
  }
 });
 return {open(id){
  for(let parent=container;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  box.open=true;
  box.scrollIntoView?.({block:'nearest'});summary.focus?.({preventScroll:true});
  if(active)return;
  selectedId=typeof id==='string'&&id? id:null;all.hidden=!selectedId;msg.textContent='';start.disabled=true;
  return refresh();
 }};
};
})();
