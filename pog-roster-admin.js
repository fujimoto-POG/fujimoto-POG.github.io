(() => {
'use strict';
const clean=value=>String(value??'').normalize('NFKC').trim();
const unlist=value=>clean(value).replace(/^(?:\d{1,2}[.、:)]\s*|[・●•]\s*|[-*+]\s+)/u,'');
const parse=value=>String(value??'').normalize('NFKC').split(/\r?\n|\r/u).flatMap(line=>{
 const row=clean(line);
 if(/^\x60{3,}(?:text|txt|plaintext|markdown|md)?$/iu.test(row))return [];
 return unlist(row).split(/[、,\t]/u).map((part,i)=>i?unlist(part):clean(part)).filter(Boolean);
});
const invalidOwnerChars=/[<>|\p{Cc}\p{Cf}]/u;
const ownerValue=value=>clean(value).replace(/\s+/gu,' ');
const ownerKey=value=>ownerValue(value).toLowerCase().replace(/\s+/gu,'');
const validHorse=name=>/^[ァ-ヺー]{2,18}$/u.test(name);
const duplicatesOf=(names,isValid=validHorse)=>[...names.reduce((counts,name)=>counts.set(name,(counts.get(name)||0)+1),new Map())].filter(([name,count])=>isValid(name)&&count>1);
const element=(tag,label)=>{const n=document.createElement(tag);if(label!=null)n.textContent=label;return n;};
const button=(label)=>{const n=element('button',label);n.type='button';return n;};
const horsePhotoPrompt=[
 '添付したJRA-VANのスクリーンショット（2枚以上でも可）から、各カードの青い見出しに書かれた馬名だけを読み取ってください。',
 '画像は添付順に、各画像では上から下に並べます。同じ馬が画像の重なりで出てきたら、最初の1回だけ残してください。',
 '馬名は見えた表記のまま、番号・箇条書き・空行なしで1行に1頭、1つのコードブロックにまとめてください。父母名・血統・成績・レース名・日付・数字は含めません。',
 '読めない文字は推測しないでください。読めない行があれば、馬名の一覧には入れず、コードブロックの外に画像番号とおおよその位置を書いてください。'
].join('\n');
const sample=()=>window.POG_NEXT_HORSE_NAME?.example?.()??'母名と生年';
const yearExamples=()=>{const years=window.POG_NEXT_HORSE_NAME?.examples?.()??[];return years.length?years.map(year=>'「母名の'+year+'」').join('や'):'母名と、画像どおりの生年';};
const nextHorsePhotoPrompt=()=>[
 '添付したJRA-VANのスクリーンショットから指名馬のカードを確認してください。名前が決まっていない馬も、写っている指名馬は省かず、1頭ずつ一覧に残してください。',
 '画像は添付順、各画像は上から下。画像が重なって明らかに同じ馬だと確認できたときだけ、2回目以降を省いてください。',
 '正式馬名は画像にある表記のまま。正式名がまだない馬は、青い見出しやカード内で母の名前と生年が確認できれば、'+yearExamples()+'のように必ず一覧に含めてください。例：'+sample()+'。生年は画像のままにし、別の年に変えないでください。',
 '番号・箇条書き・空行なしで、1行に1頭、1つのコードブロックにまとめてください。仮馬名に必要な母名と生年以外の血統・成績・レース・日付は含めません。',
 '判別できない馬名・母名・生年は推測せず、カードが写っている場合は同じコードブロック内のその位置に「要確認: 画像1・上から5件目」のように1行残してください。画像にない馬や空欄は追加しないでください。'
].join('\n');
function chatgptGuide(nextSeason=false){
 const photoPrompt=nextSeason?nextHorsePhotoPrompt():horsePhotoPrompt;
 const guide=element('details'),steps=element('ol'),open=element('a','ChatGPT無料版を開く'),copy=button('指示文をコピー'),status=element('p');
 const saveStep=element('li'),copyStep=element('li'),openStep=element('li'),example=element('details'),photo=element('img');
 guide.className='pog-chatgpt-guide';steps.className='pog-photo-steps';open.className='pog-admin-link';open.href='https://chatgpt.com/';open.target='_blank';open.rel='noopener noreferrer';
 example.className='pog-screenshot-example';example.open=false;
 photo.src='/pog-jravan-screenshot-example.png';photo.alt='JRA-VANの指名馬一覧。上から5頭分の馬名が写っているスクショ例。';photo.loading='lazy';photo.width=942;photo.height=2048;
 example.append(element('summary','※スクショ例を見る'),photo);
 saveStep.append(element('strong','JRA-VANの指名馬をスクショで写真に保存する'),element('p','1画面に5頭を目安に、全頭の馬名が写るように保存します。入りきらなければ複数枚でOKです。'),example);
 status.className='pog-admin-message';status.setAttribute('role','status');
 copyStep.append(element('strong','「指示文をコピー」を押す'),copy,status);
 openStep.append(open,element('p','新しいチャットに指示文を貼り付け、保存したスクショを順番に添付して送ります。'));
 steps.append(saveStep,copyStep,openStep);
 guide.append(element('summary','2. JRA-VANのスクショから馬名を読み取る（任意）'),steps,element('p','回答の馬名一覧を下の「3. 指名馬を入力または貼り付け」に貼り、元の一覧と頭数を見比べてください。'));
 copy.addEventListener('click',async()=>{
  if(copy.disabled)return;copy.disabled=true;
  try{await navigator.clipboard.writeText(photoPrompt);status.textContent='指示文をコピーしました。';}
  catch{status.textContent='コピーできませんでした。もう一度「指示文をコピー」を押してください。';}
  finally{copy.disabled=false;}
 });
 return guide;
}
window.POG_INIT_ROSTER_ADMIN=function(container,{nextSeason=false,historyEnabled=!nextSeason}={}){
 const box=element('details');box.className='pog-admin-roster pog-register';
 const entry=element('div'),review=element('div'),msg=element('p');
 entry.className='pog-register-entry';review.className='pog-register-review';review.hidden=true;
 msg.className='pog-admin-message';msg.setAttribute('role','status');msg.tabIndex=-1;
 const ownerLabel=element('label',nextSeason?'1. 参加者名（登録済みの人か、新しい名前）':'1. 参加者名（公開するニックネーム）'),owner=element('input');
 owner.type='text';owner.maxLength=40;owner.autocomplete='off';owner.placeholder='例：ふじえもん';ownerLabel.append(owner);
 const known=()=>nextSeason&&Array.isArray(window.POG_NEXT_PARTICIPANTS)?window.POG_NEXT_PARTICIPANTS:[];
 const normalizeName=value=>nextSeason?(window.POG_NEXT_HORSE_NAME?.normalize(value)??''):(validHorse(value)?value:'');
 const provisional=name=>nextSeason&&window.POG_NEXT_HORSE_NAME?.isProvisional(name)===true;
 const parsed=value=>parse(value).map(name=>normalizeName(name)||name);
 const isValid=value=>normalizeName(value)===value;
 const needsCheck=value=>nextSeason&&/^要確認\s*:/u.test(value);
 const repeatsOf=names=>duplicatesOf(names,isValid);
 const canonical=value=>known().find(n=>ownerKey(n)===ownerKey(value))??ownerValue(value);
 let resetSuggestion=()=>{};
 if(nextSeason){
  const suggested=element('select'),label=element('label','登録済みの参加者から選ぶ（任意）');
  const refresh=()=>{
   const selected=suggested.value;
   const options=known().map(name=>{const opt=element('option',name);opt.value=name;return opt;});
   const blank=element('option','選んで入力する');blank.value='';
   suggested.replaceChildren(blank,...options);
   suggested.value=known().includes(selected)?selected:'';
   suggested.disabled=!options.length;
  };
  resetSuggestion=()=>{suggested.value='';};
  label.append(suggested);suggested.addEventListener('change',()=>{if(suggested.value){owner.value=suggested.value;invalidate();}});
  window.addEventListener?.('pog-next-roster-ready',refresh);refresh();
  entry.append(label);
 }
 const horsesLabel=element('label','3. 指名馬を入力または貼り付け'),horses=element('textarea');
 horses.rows=6;horses.maxLength=4500;horses.placeholder=nextSeason?'1行に1頭。例：'+sample():'1行に1頭。手入力もできます。';horses.spellcheck=false;horses.setAttribute('autocapitalize','off');
 horsesLabel.append(horses);
 const count=element('p'),repairs=element('div');count.className='pog-register-count';count.setAttribute('aria-live','polite');
 repairs.className='pog-register-repairs';repairs.hidden=true;
 const preview=button('名前と馬名を確認'),edit=button('入力に戻る'),submit=button('この内容で登録する'),history=button('追加・訂正した指名馬の過去成績を開く');
 const reviewTitle=element('h3','4. 登録内容を確認'),reviewContents=element('div'),reviewActions=element('div');
 reviewTitle.tabIndex=-1;reviewActions.className='pog-admin-actions';edit.className='pog-register-secondary';
 history.hidden=true;history.className='pog-register-secondary';
 reviewActions.append(submit,edit);review.append(reviewTitle,reviewContents,reviewActions);
 entry.append(ownerLabel,chatgptGuide(nextSeason),horsesLabel);
 if(nextSeason)entry.append(element('p','まだ名前がない馬は、母名と生年で登録できます。例：'+sample()+'。母の名前だけでは特定できないので、生年まで入れてください。正式馬名は、あとで管理者の「未命名馬一覧」から確認できます。'));
 entry.append(count,repairs,preview);
 box.append(element('summary','参加者・指名馬を登録'),element('p',nextSeason?'登録済みの参加者には指名馬を追加できます。新しい参加者は、名前と指名馬を一緒に登録できます。1人合計10頭までです。':'名前と馬名を入れて、重複を確認するだけ。今いる参加者の指名は変わりません。'),entry,review,msg,history);
 container.append(box);
 if(nextSeason)window.POG_OPEN_ROSTER_ADMIN=()=>{
  for(let parent=container;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  box.open=true;box.scrollIntoView?.({block:'nearest'});owner.focus?.({preventScroll:true});
 };
 let candidate=null,checking=false,busy=false,revision=0;

 function showDraft(){
  const names=parsed(horses.value),repeats=repeatsOf(names);
  const unresolved=names.flatMap((name,i)=>needsCheck(name)?[{name,i}]:[]);
  count.textContent=names.length+' / 10頭'+(names.length>10?'（10頭まで登録できます）':'')+(unresolved.length?'・要確認'+unresolved.length+'頭':'');
  repairs.replaceChildren();repairs.hidden=!(repeats.length||unresolved.length);
  if(unresolved.length){
   repairs.append(element('p','読み取れなかった馬も下の行に残しています。元の画像を見て、該当行だけ修正してください。'));
   const rows=element('ul');
   for(const {name,i} of unresolved)rows.append(element('li',(i+1)+'件目：'+name.slice(0,80)));
   repairs.append(rows);
  }
  if(repeats.length){
   repairs.append(element('p','同じ一覧に重複があります。1頭ずつに直してから確認してください。'));
   for(const [name,n] of repeats){
    const remove=button(name+'（'+n+'件）を1件にする');remove.className='pog-register-secondary';
    remove.addEventListener('click',()=>{
     if(busy||entry.hidden)return;
     const current=parsed(horses.value);
     if(!repeatsOf(current).some(([horse])=>horse===name))return;
     const first=current.indexOf(name);
     horses.value=current.filter((horse,i)=>horse!==name||i===first).join('\n');
     invalidate();msg.textContent=name+'の重複を1件にまとめました。';horses.focus();
    });
    repairs.append(remove);
   }
  }
  return {names,repeats};
 }
 function showEntry(){
  entry.hidden=false;review.hidden=true;candidate=null;reviewContents.replaceChildren();showDraft();
 }
 function invalidate(){
  if(busy)return;
  revision++;showEntry();msg.textContent='';history.hidden=true;
 }
 owner.addEventListener('input',invalidate);horses.addEventListener('input',invalidate);
 edit.addEventListener('click',()=>{if(!busy){invalidate();horses.focus();}});
 history.addEventListener('click',()=>{window.POG_OPEN_ROSTER_HISTORY?.();});
 showDraft();

 preview.addEventListener('click',async()=>{
  if(busy||checking||entry.hidden)return;
  invalidate();
  const label=canonical(owner.value),{names,repeats}=showDraft();
  if(!label||label.length>40||invalidOwnerChars.test(owner.value)||invalidOwnerChars.test(label)){msg.textContent='参加者名を40文字以内で入力してください。山括弧（< >）や縦線（|）は使えません。';owner.focus();return;}
  if(!names.length||names.length>10){msg.textContent='馬名を1〜10頭、1行に1頭ずつ入力してください。';horses.focus();return;}
  if(repeats.length){msg.textContent='同じ馬が重複しています。上のボタンで1件にまとめるか、馬名欄を修正してください。';[...repairs.children].find(item=>item.tagName?.toLowerCase()==='button')?.focus();return;}
  const bad=names.findIndex(n=>!isValid(n));
  if(bad!==-1){msg.textContent='一覧の'+(bad+1)+'件目'+(needsCheck(names[bad])?'は要確認のままです。':'が馬名として読めません。')+(nextSeason?'その行だけ、正式馬名か母名と生年（例：'+sample()+'）に直してください。ほかの行はそのままです。':'カタカナの馬名だけを残してください。');horses.focus();return;}
  const version=revision,rawOwner=owner.value,rawHorses=horses.value;
  checking=true;preview.disabled=true;msg.textContent='ほかの参加者の指名を確認しています…';
  try{
   const r=await fetch('/api/pog/roster/preview',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({owner:label,horses:names}),...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(10000)}:{})});
   const data=await r.json();
   if(version!==revision||rawOwner!==owner.value||rawHorses!==horses.value)return;
   if(!r.ok){msg.textContent=typeof data?.error==='string'?data.error:'指名状況を確認できませんでした。もう一度お試しください。';if(r.status===409)owner.focus();return;}
   if(!Number.isSafeInteger(data?.revision)||data.revision<0||typeof data.owner!=='string'||!data.owner||(nextSeason?ownerKey(data.owner)!==ownerKey(label):data.owner!==label)||JSON.stringify(data.horses)!==JSON.stringify(names)||!Array.isArray(data.duplicates))throw Error();
   if(data.duplicates.some(x=>!x||!names.includes(x.name)||!Array.isArray(x.owners)||!x.owners.length||x.owners.some(n=>typeof n!=='string'||!n)))throw Error();
   const byName=new Map(data.duplicates.map(x=>[x.name,x.owners]));
   candidate={owner:data.owner,horses:names,revision:data.revision};
   const list=element('ol');
   for(const name of names){
    const line=element('li'),duplicate=byName.get(name);
    const display=name+(provisional(name)?'（仮馬名）':'');
    if(duplicate){
     const title=element('strong',display);title.className='shared-pick-name';
     const detail=element('span','（重複指名：'+duplicate.join('、')+'）');detail.className='shared-pick-name';
     line.append(title,detail);
    }else line.textContent=display;
    list.append(line);
   }
   reviewContents.replaceChildren(element('p',candidate.owner+'（'+names.length+'頭）'),list);
   if(byName.size){const warning=element('p','赤字の馬は、ほかの参加者も指名しています。そのまま登録できます。成績は指名した参加者それぞれに加算されます。');warning.className='shared-pick-name';reviewContents.append(warning);}
   else reviewContents.append(element('p','ほかの参加者との重複はありません。'));
   reviewContents.append(element('p','名前と馬名が合っていれば登録してください。直す場合は「入力に戻る」を押してください。'));
   msg.textContent='';entry.hidden=true;review.hidden=false;reviewTitle.focus();
  }catch{if(version===revision)msg.textContent='指名状況を確認できませんでした。通信を確認して、もう一度お試しください。';}
  finally{checking=false;preview.disabled=false;}
 });
 submit.addEventListener('click',async()=>{
  if(busy||!candidate||review.hidden)return;
  if(invalidOwnerChars.test(owner.value)||(nextSeason?ownerKey(owner.value)!==ownerKey(candidate.owner):canonical(owner.value)!==candidate.owner)||JSON.stringify(parsed(horses.value))!==JSON.stringify(candidate.horses)){
   invalidate();msg.textContent='入力が変わりました。名前と馬名をもう一度確認してください。';preview.focus();return;
  }
  busy=true;edit.disabled=submit.disabled=true;msg.textContent='登録しています…';
  try{
   const submitted=candidate;
   const r=await fetch('/api/pog/roster/add',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(submitted),...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(12000)}:{})});
   const data=await r.json();
   if(r.status>=500)throw Error();
   if(!r.ok){
    showEntry();
    msg.textContent=typeof data?.error==='string'?data.error:'登録できませんでした。時間をおいてお試しください。';
    if(data?.recheck)msg.textContent+=' 入力はそのままです。';
    preview.focus();return;
   }
   if(data?.addition?.owner!==submitted.owner||JSON.stringify(data.addition.horses)!==JSON.stringify(submitted.horses))throw Error();
   owner.value=horses.value='';resetSuggestion();showEntry();
   const pending=submitted.horses.filter(provisional).length;
   const receipt=(nextSeason?submitted.owner+'さんの指名馬を'+submitted.horses.length+'頭登録しました。'+(pending?'仮馬名'+pending+'頭も登録済みです。':''):submitted.owner+'さんと指名馬'+submitted.horses.length+'頭を登録しました。')+
    (historyEnabled&&(!nextSeason||pending<submitted.horses.length)?'過去の成績は下のボタンから反映できます。':'');
   msg.textContent=receipt;history.hidden=!historyEnabled||(nextSeason&&pending===submitted.horses.length);msg.focus();
   window.dispatchEvent(new Event('pog-shared-updated'));
   if(nextSeason&&window.POG_BOARD_READY){
    const verified=await window.POG_BOARD_READY;
    const published=window.POG_SHARED_ROSTER;
    if(verified!==true||!Array.isArray(published)||!submitted.horses.every(name=>published.some(p=>p.owner===submitted.owner&&p.name===name))){
     msg.textContent=receipt+' 一覧への反映は確認できませんでした。二重登録せず、ページを再読み込みして確認してください。';
    }
   }
  }catch{
   showEntry();msg.textContent='登録結果を確認できませんでした。入力は残しています。共有の指名一覧を確認し、登録されていない場合だけ、もう一度確認してください。';
   window.dispatchEvent(new Event('pog-shared-updated'));msg.focus();
  }
  finally{busy=false;edit.disabled=submit.disabled=false;}
 });
};
})();
