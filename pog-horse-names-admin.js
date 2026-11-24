(() => {
'use strict';
const endpoint='/api/pog/roster/names';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const button=text=>{const n=el('button',text);n.type='button';return n;};
const clean=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/gu,' '):'';
const exactDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function trustedProfile(raw){
 if(typeof raw!=='string'||!/^https:\/\/db(?:\.sp)?\.netkeiba\.com\/horse\/20\d{8}\/?(?:\?utm_source=chatgpt\.com)?$/i.test(raw))return '';
 try{
  const u=new URL(raw),id=u.pathname.match(/^\/horse\/(20\d{8})\/?$/u)?.[1];
  return id?'https://db.netkeiba.com/horse/'+id+'/':'';
 }catch{return '';}
}
function extractProfiles(raw){
 const urls=raw.match(/https?:\/\/[^\s<>{}\[\]()`"'、。…]+/giu)??[];
 return [...new Set(urls.map(x=>trustedProfile(x.replace(/[,，;；.!！]+$/u,''))).filter(Boolean))];
}
function evidenceLink(url){
 const node=el('a','照合した馬情報（netkeiba）');node.href=url;node.target='_blank';node.rel='noopener noreferrer';return node;
}
async function request(path,body){
 const res=await fetch(endpoint+path,{cache:'no-store',credentials:'same-origin',method:body===undefined?'GET':'POST',
  headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),
  ...(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(25000)}:{})});
 const data=await res.json().catch(()=>null);
 if(!res.ok||!data||typeof data!=='object')throw Error(typeof data?.error==='string'?data.error:'馬名を確認できませんでした。');
 return data;
}
let mounted=false;
window.POG_INIT_HORSE_NAME_LIST=(container,{legacy=false}={})=>{
 if(!container||mounted||window.POG_CAN_LOOKUP_HORSE_NAMES!==true||window.POG_ARCHIVE_VIEW===true)return;
 mounted=true;
 const scope=window.POG_BOARD_SEASON?.active;
 const active=()=>window.POG_CAN_LOOKUP_HORSE_NAMES===true&&window.POG_ARCHIVE_VIEW!==true&&(!scope||window.POG_BOARD_SEASON?.active===scope);
 const box=el('details',null,'pog-admin-roster'),list=el('div'),message=el('p','過去のシーズンは変更しません。','pog-admin-message'),refresh=button('一覧を読み直す');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 box.append(el('summary','未命名馬一覧'),el('p','馬ごとに調査文をコピーし、ChatGPT（無料版でも可）で調べます。回答をその馬の欄に貼り付けると、出典を照合できます。'),list,message,refresh);
 container.append(box);
 let loaded=false,loading=false;
 const cards=new Map();
 const rosterContains=row=>{
  if(!Array.isArray(window.POG_SHARED_ROSTER))return true;
  return window.POG_SHARED_ROSTER.some(h=>h?.provisionalName===true&&h.owner===row.owner&&h.name===row.formerName);
 };
 const render=()=>list.replaceChildren(...[...cards.values()].map(item=>item.node));
 async function load(){
  if(!active()||loading)return;
  loading=true;refresh.disabled=true;message.textContent='未命名馬を読み込んでいます…';
  try{
   const data=await request('');
   if(!active())return;
   if(!Array.isArray(data.horses))throw Error('未命名馬の一覧を読み込めませんでした。');
   const next=new Map();
   for(const row of data.horses){
    if(!row||typeof row.id!=='string'||!row.id||typeof row.owner!=='string'||!row.owner||typeof row.formerName!=='string'||!row.formerName||row.name||next.has(row.id)||!rosterContains(row))continue;
    const current=cards.get(row.id);
    next.set(row.id,current?.row.owner===row.owner&&current.row.formerName===row.formerName?current:{row,node:rowCard(row)});
   }
   cards.clear();for(const [id,card] of next)cards.set(id,card);
   render();loaded=true;message.textContent=cards.size?'':'未命名馬はありません。';
  }catch(error){if(active())message.textContent=error.message;}
  finally{loading=false;refresh.disabled=false;}
 }
 box.addEventListener('toggle',()=>{if(box.open&&!loaded)void load();});
 refresh.addEventListener('click',load);
 window.addEventListener?.('pog-next-roster-ready',()=>{
  if(!active())return;
  let changed=false;
  for(const [id,item] of cards)if(!rosterContains(item.row)){cards.delete(id);changed=true;}
  if(loaded&&changed){render();if(!cards.size&&!message.textContent)message.textContent='未命名馬はありません。';}
 });
 function rowCard(row){
  const card=el('section',null,'pog-admin-coverage'),status=el('p','','pog-admin-message'),review=el('div');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.tabIndex=-1;review.hidden=true;
  const year=String(row.year??(exactDate(row.born)?row.born.slice(0,4):'')),dam=clean(row.dam);
  card.append(el('h3',row.formerName),el('p','指名者：'+row.owner));
  if(!dam||!/^20\d{2}$/u.test(year)){
   card.append(el('p','母名と生年がそろっていません。母名だけでは特定できないため、生年を確認してください。'));return card;
  }
  const promptText=[
   '母「'+dam+'」の'+year+'年生まれの産駒の馬名を調べてください。',
   '出典で母名と生年が一致し、馬名が掲載されている場合だけ、netkeibaの個別馬ページ（https://db.netkeiba.com/horse/ で始まるURL）を開いて確認してください。',
   '回答は確認できた個別馬ページのURLを1件だけ。検索結果や血統一覧ではなく、個別馬のページです。不明、未命名、候補を1頭に絞れない場合は「該当なし」とだけ答え、推測しないでください。'
  ].join('\n');
  const copy=button('調査文をコピー'),chat=el('a','ChatGPTを開く','pog-admin-link'),actions=el('div',null,'pog-admin-actions');
  chat.href='https://chatgpt.com/';chat.target='_blank';chat.rel='noopener noreferrer';actions.append(copy,chat);
  const prompt=el('textarea');prompt.value=promptText;prompt.readOnly=true;prompt.rows=4;prompt.hidden=true;prompt.setAttribute('aria-label','手動でコピーする調査文');
  const input=el('textarea');input.rows=3;input.maxLength=12000;input.spellcheck=false;input.setAttribute('autocapitalize','off');
  input.placeholder='回答をそのまま貼り付け。URLだけでも可（例：https://db.netkeiba.com/horse/…/）';
  const inputLabel=el('label','ChatGPTの回答を貼り付け');inputLabel.append(input);
  const check=button('回答の出典を確認する'),save=button('この名前で登録');save.hidden=true;
  card.append(el('p','母：'+dam+' ／ '+year+'年生まれ'),actions,prompt,inputLabel,check,status,review,save);
  let pending=false,saving=false,seq=0,candidate=null;
  const current=()=>active()&&card.isConnected!==false&&cards.get(row.id)?.node===card;
  function clear(){seq++;candidate=null;review.hidden=true;review.replaceChildren();save.hidden=true;}
  function sync(){check.disabled=pending||saving;input.disabled=saving;save.disabled=pending||saving||!candidate;}
  input.addEventListener('input',()=>{if(!saving){clear();status.textContent='';sync();}});
  copy.addEventListener('click',async()=>{
   if(!current())return;
   try{await navigator.clipboard.writeText(promptText);status.textContent='調査文をコピーしました。ChatGPTに貼り付けてください。';}
   catch{prompt.hidden=false;prompt.focus?.();prompt.select?.();status.textContent='表示した調査文を選んでコピーしてください。';}
  });
  check.addEventListener('click',async()=>{
   if(!current()||pending||saving)return;
   clear();sync();const raw=input.value,text=raw.trim();
   if(/^該当なし[。.]?$/u.test(text)){status.textContent='該当なしの場合は登録しません。仮馬名のまま残します。';return;}
   const links=extractProfiles(text);
   if(!links.length){status.textContent='netkeibaの個別馬ページURLが見つかりません。ChatGPTにURLを1件だけ出してもらい、ここに貼ってください。';return;}
   if(links.length>1){status.textContent='個別馬ページが複数あります。どの馬か特定できるまで登録しません。母名と生年が合うURLを1件だけ貼ってください。';return;}
   const source=links[0];
   if(!source.includes('/horse/'+year)){status.textContent='貼り付けた馬ページの生年が、この指名馬と一致しません。';return;}
   if(legacy&&trustedProfile(row.source)!==source){status.textContent='この指名馬に記録されている個別馬ページとは一致しません。';return;}
   const stamp=seq;pending=true;sync();status.textContent='出典で母名と生年を確認しています…';
   try{
    const result=await request('/preview',{id:row.id,source});
    if(stamp!==seq||input.value!==raw||!current())return;
    if(result.status==='unlisted'){status.textContent='出典で同じ馬を確認しましたが、馬名はまだ掲載されていません。';return;}
    if(result.status!=='candidate'||typeof result.name!=='string'||!/^[ァ-ヺー]{2,18}$/u.test(result.name)||typeof result.token!=='string'||!result.token||
     (result.owner!=null&&result.owner!==row.owner)||(result.formerName!=null&&result.formerName!==row.formerName)||
     trustedProfile(result.source)!==source||clean(result.dam)!==dam||!exactDate(result.born)||result.born.slice(0,4)!==year||
     (exactDate(row.born)&&result.born!==row.born)||!clean(result.sire)||(clean(row.sire)&&clean(result.sire)!==clean(row.sire)))throw Error('指名馬の根拠を確認できませんでした。');
    candidate={raw,name:result.name,token:result.token};
    review.replaceChildren(el('strong','照合した馬名：「'+result.name+'」'),el('p','母 '+dam+'・父 '+result.sire+'・生年月日 '+result.born),evidenceLink(source),el('p','掲載名です。JRAへの登録状況とは別です。'));
    review.hidden=false;save.hidden=false;status.textContent='この名前で登録しますか？';status.focus?.();
   }catch(e){if(stamp===seq&&current())status.textContent=e.message+' 仮馬名は変更していません。';}
   finally{pending=false;sync();}
  });
  save.addEventListener('click',async()=>{
   if(!candidate||!current()||pending||saving)return;
   if(input.value!==candidate.raw){clear();sync();status.textContent='回答が変わりました。もう一度出典を確認してください。';return;}
   const selected=candidate;candidate=null;saving=true;sync();status.textContent='確認した馬名を登録しています…';
   try{
    const saved=await request('/apply',{token:selected.token});
    if(saved.name!==selected.name||saved.owner!==row.owner||saved.formerName!==row.formerName)throw Error();
    if(current()){
     cards.delete(row.id);render();
     message.textContent='「'+selected.name+'」を登録しました。'+(cards.size?'':'未命名馬はありません。');
    }
    window.dispatchEvent?.(new Event('pog-shared-updated'));
   }catch{
    if(current())status.textContent='登録結果を確認できませんでした。一覧を読み直し、仮馬名のままならもう一度出典を確認してください。';
    window.dispatchEvent?.(new Event('pog-shared-updated'));
   }finally{saving=false;save.hidden=true;sync();}
  });
  sync();return card;
 }
};
})();
