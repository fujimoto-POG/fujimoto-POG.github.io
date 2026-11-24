'use strict';
const $=s=>document.querySelector(s), out=$('#screen'), dlg=$('#edit'), form=$('#edit-form'), baseSeed=window.POG_SEED||[], device=$('#device-tools'), deviceSettings=$('#device-settings');
let sharedRoster=[],seed=[],historyPendingOwners=new Set(),sharedPicks=new Map();
// The legacy seed snapshot remains specific to its original season.
const previousSeason='2026-27';
const archiveSeasonId=value=>typeof value==='string'&&/^\d{4}-\d{2}$/.test(value)&&Number(value.slice(0,4))>=1900&&Number(value.slice(0,4))<9999&&Number(value.slice(5))===(Number(value.slice(0,4))+1)%100;
const seasonId=value=>archiveSeasonId(value)&&value>=previousSeason;
const followingSeason=season=>{if(!seasonId(season))return '';const year=Number(season.slice(0,4))+1;return year+'-'+String((year+1)%100).padStart(2,'0');};
const seasonLabel=season=>archiveSeasonId(season)?season.replace('-','–'):'';
const archiveParam=/(?:^|[?&])season=([^&]*)/.exec(window.location?.search??'');
let requestedSeason='';try{requestedSeason=decodeURIComponent(archiveParam?.[1]??'');}catch{}
let shownSeason='',activeSeason='',seasonParticipants=[],archiveSeasons=[],archiveLabels=new Map(),unrecognizedNextPicks=0,manualArchive=null;
const isArchive=()=>!!archiveParam;
window.POG_ARCHIVE_VIEW=isArchive();
window.POG_SEASON_HELPERS=Object.freeze({id:seasonId,following:followingSeason,label:seasonLabel,legacy:previousSeason});
const isNextSeason=()=>!!shownSeason&&shownSeason!==previousSeason;
const seedPointsThrough='2026-11-15';
const baseStamp=window.POG_UPDATE||{},stamp={}, baseHistories=window.POG_HISTORIES||{}, histories={};
let sharedFetchRevision=0;
let sharedLoadState='loading';
const ownerPalette=['ふじえもん','コージマン','だーはまww','うのやん','武yan','みっつんペーパー','しとだ','カノン3476'];
const ownerClass=owner=>{const i=ownerPalette.indexOf(owner);return ' owner-'+(i>=0?i:Array.from(owner).reduce((sum,c)=>sum+c.codePointAt(0),0)%ownerPalette.length)};
const ownerBadge=owner=>'<span class="owner-chip'+ownerClass(owner)+'">'+esc(owner)+'</span>';
const resultOwners=(name,roster=rows)=>{
 const names=[...new Set(roster.filter(x=>x.name===name).map(x=>x.owner))];
 const labels=names.length?names.map(ownerBadge).join(''):'<span class="owner-chip pending-owner">指名者確認中</span>';
 return '<div class="recent-owners" aria-label="指名した参加者">'+labels+'</div>';
};
const fmt=new Intl.NumberFormat('ja-JP');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const link=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)?esc(u.href):''}catch{return ''}};
const ext=(url,label)=>{const u=link(url);return u?'<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':''};
const jstDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'});
const today=()=>jstDate.format(new Date());
let renderedDay='';
const dateText=s=>validDate(s)?s.slice(5).replace('-','/'):'';
const text=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const seasonStart='2026-06-06',seasonEnd='2027-05-31';
const horseKey=name=>name.normalize('NFKC');
const pickSlot=(type,owner,name)=>type+'|'+encodeURIComponent(owner)+'|'+encodeURIComponent(name);
const baseHorseUpdates=window.POG_HORSE_UPDATES||{};
let publishedHorseUpdates={};
const updateKinds=new Map([['injury','故障'],['retired','引退'],['deregistered','JRA登録抹消']]);
function horseUpdate(name){
 const item=Object.hasOwn(publishedHorseUpdates,name)?publishedHorseUpdates[name]:null;
 return item&&updateKinds.has(item.kind)&&validDate(item.date)&&typeof item.source==='string'&&item.source.startsWith('https://')&&link(item.source)?item:null;
}
function horseStatusBadge(name){
 const item=horseUpdate(name);
 if(!item)return '';
 const label=updateKinds.get(item.kind);
 return '<details class="horse-status-detail"><summary aria-label="'+esc(name+' '+label+'の詳細')+'"><span class="horse-status status-'+item.kind+'">'+esc(label)+'</span></summary><p>'+esc(item.date+(item.dateType==='checked'?' 確認':'')+' '+(item.detail||''))+'</p><p>'+ext(item.source,item.sourceLabel||'情報元を確認')+'</p></details>';
}
const initialNameInfo=new Map(baseSeed.filter(h=>h.formerName).map(h=>[h.owner+'|'+h.name,h]));
const nameInfo=new Map();
const resolvedHorseIds=new Map();
const oldNameInfo=new Map(); // Projected and scoped before any device data is read.
function migrateNames(items){
 const existing=new Set(items.map(h=>h.owner+'|'+h.name));
 return items.filter(h=>!(h.owner==='コージマン'&&h.name==='メアグローリア'&&existing.has('コージマン|カマラデロボス'))).map(h=>{
  if(h.owner==='コージマン'&&h.name==='メアグローリア')return baseSeed.find(r=>r.owner==='コージマン'&&r.name==='カマラデロボス')??h;
  const updated=oldNameInfo.get(h.owner+'|'+h.name);
  return updated&&!existing.has(h.owner+'|'+updated.name)?{...h,name:updated.name,provisionalName:false}:h;
 });
}
function nameEvidence(h){
 const info=nameInfo.get(h.owner+'|'+h.name);
 if(!info)return '';
 const label=info.nameJraUnverified?'JRA登録未確認':'馬名の出典';
 return '<p class="name-evidence muted">'+ext(info.nameSource,label)+'</p>';
}
const isSharedPick=name=>(sharedPicks.get(name)?.size??0)>1;
const sharedPickMark=name=>isSharedPick(name)?'<span class="shared-pick-mark">重複指名</span>':'';
const horseHeading=h=>'<div class="horse-heading"><h3'+(isSharedPick(h.name)?' class="shared-pick-name"':'')+'>'+esc(h.name)+'</h3>'+sharedPickMark(h.name)+horseStatusBadge(h.name)+'</div>';
const entryBadge=h=>'<span class="badge '+(h.status==='確定'?'entry-confirmed':'entry-planned')+'">'+esc(h.status)+'</span>';
const norm=(x,i)=>{if(!x||typeof x!=='object')throw Error();const owner=text(x.owner,40),name=text(x.name,60);if(!owner||!name)throw Error();return {id:'horse-'+i,owner,name,points:Number.isSafeInteger(x.points)&&x.points>=0&&x.points<=99999999999?x.points:null,scoreSource:link(x.scoreSource)?x.scoreSource:'',scoreKind:text(x.scoreKind,55),recordSource:x.recordSource==='JRA'?'JRA':'',resultDate:validDate(x.resultDate)?x.resultDate:'',result:text(x.result,180),resultSource:link(x.resultSource)?x.resultSource:'',sire:text(x.sire,60),dam:text(x.dam,60),record:Array.isArray(x.record)&&x.record.length===4&&x.record.every(n=>Number.isSafeInteger(n)&&n>=0)?x.record:null,provisionalName:x.provisionalName===true,date:validDate(x.date)?x.date:'',race:text(x.race,110),status:x.status==='確定'?'確定':'予定',source:link(x.source)?x.source:'',note:text(x.note,120)}};
const sanitize=xs=>{if(!Array.isArray(xs)||xs.length>1000)throw Error();return xs.map(norm)};
let cachedLocal=null;
let rows=[], tab=isArchive()?'standings':'roster', who='', q='', editing=null, local=false, notice='';
const seedOwners=[...new Set(baseSeed.map(h=>h.owner))];
const attemptedDeviceLoads=new Set();
// Keep any browser-local edits separate from the previous review app's keys.
const deviceEditingEnabled=document.documentElement?.dataset?.pogDeviceEditing!=='off';
const deviceKey=()=>shownSeason?'pog-board-'+shownSeason.slice(0,4)+'-v1':'';
const deviceAllowed=()=>deviceEditingEnabled&&!isArchive()&&(shownSeason===previousSeason||(isNextSeason()&&window.POG_CAN_EDIT_NEXT_DEVICE===true));
const canWriteDevice=()=>deviceAllowed()&&(isNextSeason()?window.POG_CAN_EDIT_NEXT_DEVICE===true:window.POG_CAN_UPDATE===true);
function loadDevice(){
 const deviceScope=deviceKey();
 if(attemptedDeviceLoads.has(deviceScope)||!deviceAllowed())return;
 attemptedDeviceLoads.add(deviceScope);
 try{let prev=localStorage.getItem(deviceScope);if(prev){
 const saved=JSON.parse(prev), older=Array.isArray(saved);
 if(isNextSeason()){
  if(!saved||saved.season!==shownSeason)throw Error('wrong season');
  rows=sanitize(saved.horses);local=true;return;
 }
 const stored=sanitize(older?saved:saved.horses);
 const oldUno=stored.some(h=>h.owner==='うのっち');
 const hasUno=stored.some(h=>h.owner==='うのやん');
 const current=migrateNames(oldUno?[...stored.filter(h=>h.owner!=='うのっち'),...(hasUno?[]:baseSeed.filter(h=>h.owner==='うのやん'))]:stored);
 const known=new Set([...(older?['ふじえもん','コージマン','だーはまww']:(Array.isArray(saved.seedOwners)?saved.seedOwners:seedOwners.filter(n=>n!=='カノン3476'))),...current.map(h=>h.owner)]);
 rows=sanitize([...current,...baseSeed.filter(h=>!known.has(h.owner))]);local=true;
}}catch{notice='このブラウザの保存データを読み込めなかったため、掲載版を表示しています。'}
}
const participants=()=>isNextSeason()&&!local?seasonParticipants:[...new Set(rows.map(x=>x.owner))];
const upcoming=()=>rows.filter(x=>x.date&&x.date>=today()).sort((a,b)=>a.date.localeCompare(b.date,'ja'));
const points=p=>p===null?'未確認':fmt.format(p)+' P';
const search=h=>isNextSeason()&&nameInfo.has(h.owner+'|'+h.name)?nameInfo.get(h.owner+'|'+h.name).nameSource:resolvedHorseIds.has(h.name)?'https://db.netkeiba.com/horse/'+resolvedHorseIds.get(h.name)+'/':'https://db.netkeiba.com/?pid=horse_list&word='+encodeURIComponent(h.provisionalName&&h.dam?h.dam+'の2024':h.name);
function persist(next){
  if(!canWriteDevice())return false;
  const clean=sanitize(next);
  try{localStorage.setItem(deviceKey(),JSON.stringify({horses:clean,...(isNextSeason()?{season:shownSeason}:{seedOwners})}))}catch{alert('この端末に保存できませんでした。ブラウザの設定や空き容量を確認してください。');return false}
  rows=clean;cachedLocal=null;local=true;return true;
}
const isOfficialResult=source=>{try{const u=new URL(source);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['jra.go.jp','www.jra.go.jp','jra.jp','www.jra.jp','app.jra.jp','sp.jra.jp'].includes(u.hostname)}catch{return false}};
function horseHistory(name){
 const raw=Object.hasOwn(histories,name)?histories[name]:[];
 const valid=Array.isArray(raw)?raw.filter(r=>r&&validDate(r.date)&&r.race&&/^[1-9]\d?着$/.test(r.finish)&&isOfficialResult(r.source)):[];
 // A JRA racehorse races at most once per day. Don't count conflicting archived records.
 const dates=new Map();
 for(const r of valid){if(!dates.has(r.date))dates.set(r.date,r);else if(dates.get(r.date)?.finish!==r.finish)dates.set(r.date,null);}
 return [...dates.values()].filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
}
const validPopularity=n=>Number.isInteger(n)&&n>=1&&n<=28;
const popularityBadge=n=>validPopularity(n)?'<span class="popularity">'+n+'番人気</span>':'';
function historyFor(h){
 const list=horseHistory(h.name);
 if(!list.length){
  const message=h.provisionalName?(isNextSeason()?'正式馬名が決まったら修正できます。':'正式馬名未確認'):'JRAで確認できた出走結果はまだありません';
  return '<p class="history-empty">'+(!local&&(pendingCorrection(h)||historyPendingOwners.has(h.owner))?'過去成績を確認中です。':message)+'</p>';
 }
 const counts=[0,0,0,0];for(const r of list)counts[Math.min(4,parseInt(r.finish,10))-1]++;
 const order=['1着','2着','3着','4着以下'];
 const tally='<div class="jra-record"><h4>成績</h4><strong aria-label="'+order.map((label,i)=>label+' '+counts[i]+'回').join('、')+'">'+counts.join('-')+'</strong></div>';
 return tally+'<ul class="history-list" aria-label="出走したレース">'+list.map(r=>{
   const medal=r.finish==='1着'?' finish-win':(/^[23]着$/.test(r.finish)?' finish-place':'');
   const content='<time datetime="'+esc(r.date)+'">'+dateText(r.date)+'</time><span class="history-race">'+esc(r.race)+'</span><span class="race-outcome">'+popularityBadge(r.popularity)+'<strong class="finish'+medal+'">'+esc(r.finish)+'</strong></span>';
   return '<li><a href="'+link(r.source)+'" target="_blank" rel="noopener noreferrer">'+content+'</a></li>';
 }).join('')+'</ul>';
}
const validStamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
function resultFreshness(){
 const published=stamp.resultPublishedAt;
 const precise=validStamp(published);
 const toJst=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const updated=precise?'<time datetime="'+esc(published)+'">'+esc(toJst.format(new Date(published)))+'（日本時間）</time>':validDate(stamp.checkedAt)?'<time datetime="'+esc(stamp.checkedAt)+'">'+esc(stamp.checkedAt.replaceAll('-','/'))+'</time>':'未確認';
 const latest=[...new Set(sharedRoster.map(h=>h.name))].flatMap(horseHistory).reduce((max,r)=>max<r.date?r.date:max,'');
 return '<div><strong>成績の更新日時</strong> '+updated+'</div>'+(validDate(stamp.resultsReviewedAt)?'<div><strong>直近開催の確認</strong> '+dateText(stamp.resultsReviewedAt)+'（'+esc(stamp.reviewedRecent)+'）</div>':'')+(latest?'<div><strong>直近の掲載レース</strong> <time datetime="'+esc(latest)+'">'+esc(latest.replaceAll('-','/'))+' 開催</time></div>':'');
}
function rosterCards(){
 const items=rows.filter(h=>(!who||who===h.owner)&&(!q||[h.name,h.owner,h.sire,h.dam,nameInfo.get(h.owner+'|'+h.name)?.formerName||''].some(x=>x.normalize('NFKC').toLowerCase().includes(q.trim().normalize('NFKC').toLowerCase()))));
 return items.length?items.map(h=>'<article class="card horse-card'+ownerClass(h.owner)+'"><div class="card-top"><div>'+ownerBadge(h.owner)+horseHeading(h)+'</div>'+(h.provisionalName?'<span class="badge">'+(isNextSeason()?'仮馬名':'仮表示')+'</span>':pendingCorrection(h)?'<span class="badge">成績確認中</span>':'<span class="num">'+points(h.points)+'</span>')+'</div>'+
 nameEvidence(h)+historyFor(h)+(h.provisionalName?'<p>ポイント：'+points(h.points)+'</p>':'')+
 (pendingCorrection(h)&&h.points>0?'<p>確認できた分：'+points(h.points)+'</p>':'')+
 (local&&h.result&&!h.resultSource?'<p>この端末のメモ：'+esc(h.result)+'</p>':'')+
 (h.date&&h.date>=today()?'<p><span class="date">'+dateText(h.date)+'</span> '+esc(h.race)+' '+entryBadge(h)+' '+ext(h.source,'予定の出典')+'</p>':'')+
 '<div class="links">'+(isNextSeason()&&h.provisionalName?'':ext(search(h),'馬名で調べる')+netkeibaBoardLink(h))+ext(h.resultSource,'成績の出典')+ext(h.scoreSource,h.scoreKind||'ポイントの根拠')+(canCorrect(h)?'<button type="button" class="plain roster-correction" data-roster-correction="'+esc(h.id)+'" aria-label="'+esc(h.owner+'の'+h.name+(isNextSeason()?(h.provisionalName?'の馬名を手入力・削除':'を修正・削除'):'を訂正'))+'">'+(isNextSeason()?(h.provisionalName?'手入力・削除':'修正・削除'):'指名を訂正')+'</button>':'')+'</div></article>').join(''):'<div class="panel empty">条件に合う指名馬がいません。</div>';
}
const publishedRow=h=>seed[Number(h.id?.slice(6))];
const pendingCorrection=h=>{const slot=publishedRow(h),correction=slot?.correction;return !local&&(slot?.historyPending===true||!!correction&&correction.historyRemaining!==0);};
const canCorrect=h=>!isArchive()&&!local&&(isNextSeason()?window.POG_CAN_EDIT_NEXT_ROSTER===true:window.POG_CAN_UPDATE===true)&&typeof window.POG_OPEN_ROSTER_CORRECTION==='function'&&!!publishedRow(h)?.slotId&&(isNextSeason()||!h.provisionalName);
function standings(){
 let sums=participants().map(n=>{const r=[...new Map(rows.filter(h=>h.owner===n).map(h=>[h.name.normalize('NFKC'),h])).values()], known=r.filter(h=>h.points!==null);return {n,size:r.length,missing:r.length-known.length,pending:r.some(pendingCorrection),total:known.reduce((a,h)=>a+h.points,0)}});
 const hasVerifiedResult=!local&&isNextSeason()&&sharedRoster.some(h=>!h.provisionalName&&horseHistory(h.name).length>0);
 const noPicksYet=isNextSeason()&&(!rows.length||(!local&&!validDate(stamp.coveredThrough)&&!hasVerifiedResult));
 const notStarted=validDate(stamp.seasonStart)&&today()<stamp.seasonStart;
 const canRank=!noPicksYet&&sums.length>1&&sums.every(s=>!s.missing&&!s.pending);
 if(canRank)sums.sort((a,b)=>b.total-a.total);
 let place=0,last;
 return '<div class="heading"><h2>参加者の順位</h2></div>'+
 (validDate(stamp.coveredSince)&&validDate(stamp.coveredThrough)?'<p class="sub muted">更新機能で確認・反映済み：'+dateText(stamp.coveredSince)+'〜'+dateText(stamp.coveredThrough)+(stamp.resultDaysPending>0?'。未確認・未反映の日もあります。':'。')+'</p>':isNextSeason()?'<p class="sub muted">新シーズンのポイントは0から集計します。'+(validDate(stamp.seasonStart)?esc(stamp.seasonStart)+'以降の成績が対象です。':'')+'</p>':'<p class="sub muted">更新機能の確認対象は11/16以降です。</p>')+'<p class="notice">'+(noPicksYet?(rows.length?(notStarted?'対象の開催前なので、順位はまだありません。':validDate(stamp.seasonStart)?'反映済みの成績はまだありません。':'成績が反映されると、順位に表示されます。'):'指名馬が未登録のため、順位はまだありません。'):canRank?(hasVerifiedResult&&!validDate(stamp.coveredThrough)?'確認できた成績で集計した暫定順位です。':'登録済みのポイントで集計した暫定順位です。'):'未確認の点数がある間は、順位をつけずに確認できた分の合計だけを表示します。')+'</p>'+
 (sums.length?sums.map(s=>{if(s.total!==last){place=sums.indexOf(s)+1;last=s.total}return '<article class="panel ranked-panel'+ownerClass(s.n)+'"><div class="rankline"><span class="rank">'+(canRank?place+'位':'—')+'</span><div><h3>'+ownerBadge(s.n)+'</h3><small>'+s.size+'頭'+(s.missing?'・'+s.missing+'頭の点数が未確認':'')+(!local&&(s.pending||historyPendingOwners.has(s.n))?'・過去分確認中':'')+'</small></div><strong>'+fmt.format(s.total)+' P</strong></div></article>'}).join(''):'<div class="panel empty">まだ参加者がいません。</div>')+(isNextSeason()?'':'<p class="sub muted">スクショのポイントを基準に、確認できた分は'+ext(stamp.rules,'JRA-VANの換算ルール')+'で補いました。11/15以前の掲載ポイントは基準日不明のスクショなどを含む暫定値で、全期間を照合済みではありません。</p>');
}
function entries(){
 const seen=new Set();let es=upcoming().filter(h=>{let k=[h.name,h.date,h.race,h.status].join('|');if(seen.has(k))return false;seen.add(k);return true});
 return '<div class="heading"><h2>'+(local?'この端末の出走予定':'次の出走予定')+'</h2></div>'+(validDate(stamp.entriesCheckedAt)?'<p class="sub muted">掲載情報の確認：'+dateText(stamp.entriesCheckedAt)+'</p>':'')+'<p class="notice">「予定」には陣営の目標、検討中のレース、特別登録を含みます。「確定」とは区別して表示します。直前にJRAの出馬表をご確認ください。</p>'+
 (es.length?es.map(h=>'<article class="panel"><div class="heading"><span class="date">'+dateText(h.date)+'</span>'+entryBadge(h)+'</div><div class="recent-card-heading">'+horseHeading(h)+resultOwners(h.name)+'</div><p>'+esc(h.race||'レース未入力')+'</p><div class="links">'+ext(h.source,'掲載元を確認')+ext(search(h),'馬名で調べる')+'</div></article>').join(''):'<div class="panel empty">登録済みの次走予定はありません。</div>')+
 '<div class="panel sources"><h3>公式資料</h3><div class="source-list">'+ext('https://www.jra.go.jp/keiba/rpdf/','JRA 出馬表')+ext('https://www.jra.go.jp/datafile/seiseki/','JRA レース結果')+'</div></div>';
}
function netkeibaHorseId(name){
 const horses=isNextSeason()?{}:(window.POG_NETKEIBA_HORSES||{});
 const id=resolvedHorseIds.get(name)??(Object.hasOwn(horses,name)?horses[name]:'');
 return typeof id==='string'&&/^\d{10}$/.test(id)?id:'';
}
function netkeibaHorseLink(name){
 const id=netkeibaHorseId(name);
 return id?ext('https://db.netkeiba.com/horse/'+id+'/','netkeibaで馬を見る'):'';
}
function netkeibaBoardLink(h){
 if(h.provisionalName)return '';
 const source=nameInfo.get(h.owner+'|'+h.name)?.nameSource;
 const profileId=typeof source==='string'?/^https:\/\/db\.netkeiba\.com\/horse\/(\d{10})\/$/.exec(source)?.[1]:'';
 const id=profileId||netkeibaHorseId(h.name);
 return id?ext('https://db.netkeiba.com/horse/bbs/'+id+'/','掲示板'):'';
}
function raceCommentLink(row){
 if(isNextSeason())return '';
 const race=/^(東京|京都|福島|中山|中京|阪神|新潟|札幌|函館|小倉)\s*(1[0-2]|[1-9])R(?=\s|$)/.exec(String(row.race).normalize('NFKC').trim());
 if(!race||!validDate(row.date))return '';
 const refs=window.POG_RACE_COMMENTS||{}, key=[row.date,race[1],race[2],row.name].join('|');
 const ref=Object.hasOwn(refs,key)?refs[key]:null;
 if(!ref||ref.finish!==row.finish||typeof ref.id!=='string'||!/^\d{4,8}$/.test(ref.id))return '';
 const url=ref.publisher==='netkeiba'?'https://news.netkeiba.com/?pid=news_view&no='+ref.id:ref.publisher==='ラジオNIKKEI'?'https://www.radionikkei.jp/keiba_article/news/post_'+ref.id+'.html':'';
 return url?'<div class="result-comment-link">'+ext(url,'レース後コメント（'+ref.publisher+'）')+'</div>':'';
}
function raceResults(){
 // The public results view always describes the shared roster, not device-only edits.
 const days=new Map();
 const names=new Set(sharedRoster.filter(h=>!h.provisionalName).map(h=>h.name));
 for(const name of names)for(const r of horseHistory(name)){
  if(!days.has(r.date))days.set(r.date,[]);
  days.get(r.date).push({...r,name});
 }
 const ordered=[...days].sort(([a],[b])=>b.localeCompare(a));
 const formatDay=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',weekday:'short'});
 const renderDay=([date,items])=>{
  const day=esc(formatDay.format(new Date(date+'T00:00:00+09:00')));
  const compare=new Intl.Collator('ja',{numeric:true}).compare;
  items.sort((a,b)=>compare(a.race,b.race)||parseInt(a.finish,10)-parseInt(b.finish,10)||compare(a.name,b.name));
  return '<section class="result-day"><h3><time datetime="'+date+'">'+day+'</time></h3><ul class="result-list">'+items.map(r=>{
   const medal=r.finish==='1着'?' finish-win':(/^[23]着$/.test(r.finish)?' finish-place':'');
   return '<li class="panel result-row"><div class="result-main"><p class="result-horse"><strong'+(isSharedPick(r.name)?' class="shared-pick-name"':'')+'>'+esc(r.name)+'</strong>'+sharedPickMark(r.name)+'</p>'+resultOwners(r.name,sharedRoster)+'<p class="result-race">'+esc(r.race)+'</p>'+raceCommentLink(r)+'<div class="result-links">' +ext(r.source,'JRA公式結果')+netkeibaHorseLink(r.name)+'</div></div><div class="race-outcome result-outcome">'+popularityBadge(r.popularity)+'<strong class="finish'+medal+'">'+esc(r.finish)+'</strong></div></li>';
  }).join('')+'</ul></section>';
 };
 const older=ordered.slice(5);
 return '<div class="heading"><h2>指名馬のレース結果</h2></div><p class="sub muted">JRAで確認できた結果を、新しい開催日から表示します。'+(isArchive()?'このシーズンは閲覧専用です。':'共有ページで成績を更新すると、ここにも反映されます。')+'</p>'+
 (ordered.length?ordered.slice(0,5).map(renderDay).join(''):'<div class="panel empty">確認済みのレース結果はまだありません。</div>')+
 (older.length?'<details class="panel older-results"><summary>もっと前の結果（'+older.length+'日分）</summary>'+older.map(renderDay).join('')+'</details>':'');
}
function settings(){
 const options=rows.map(h=>'<option value="'+esc(h.id)+'">'+esc(h.owner+'：'+h.name)+'</option>').join('');
 return '<p class="notice">変更はこの端末だけに保存されます。全員に共有する変更は「成績、情報更新」から行ってください。</p>'+
 '<div class="panel"><h3>指名馬</h3><label for="device-horse">編集する馬</label><select id="device-horse">'+options+'</select><div class="actions">'+
 (options?'<button type="button" class="secondary" id="device-edit">選んだ馬を編集</button>':'')+'<button type="button" class="secondary" data-add>指名馬を追加</button></div></div>'+
 '<div class="panel"><h3>バックアップ</h3><p class="sub muted">取り込むと、この端末のデータを置き換えます。</p><div class="actions"><button class="secondary" id="export">書き出す</button><button class="secondary" id="import">取り込む</button><input id="importFile" type="file" accept=".json,application/json" hidden></div></div>';
}
function renderDevice(){
 if(!canWriteDevice()||!device?.open||!deviceSettings)return;
 if(!local&&sharedLoadState!=='ready'){deviceSettings.textContent='共有の指名馬一覧を確認してから編集できます。';return;}
 const selected=$('#device-horse')?.value;
 deviceSettings.innerHTML=settings();
 const input=$('#device-horse');if(selected&&rows.some(h=>h.id===selected)&&input)input.value=selected;
}
device?.addEventListener('toggle',renderDevice);
const archiveLabel=season=>archiveLabels.get(season)??seasonLabel(season);
function renderSeason(){
 const badge=$('#season-name'),nav=$('#season-nav');
 if(badge){badge.hidden=!shownSeason;badge.textContent=shownSeason?(isArchive()?archiveLabel(shownSeason)+'（過去）':'今シーズン'):'';}
 if(!nav)return;
 nav.hidden=!isArchive()&&sharedLoadState!=='ready';
 const home=isArchive()?'<a class="secondary season-link" href="/">今シーズンに戻る</a><span class="muted">過去の成績（保存済み・更新されません）</span>':'';
 const otherSeasons=archiveSeasons.filter(season=>!isArchive()||season!==shownSeason);
 const links=otherSeasons.map(season=>'<a class="secondary season-link" href="/?season='+season+'">'+esc(archiveLabel(season))+'の成績を見る</a>').join('');
 const empty=sharedLoadState!=='ready'?'成績の一覧を確認できていません。':isArchive()?'ほかの年度の成績はまだありません。':'過去の成績はまだありません。年度更新をすると、今の成績がここに残ります。';
 const expanded=nav.querySelector?.('#archive-choice')?.open?' open':'';
 nav.innerHTML=home+'<details id="archive-choice" class="season-archive-choice"'+expanded+'><summary>過去の成績を見る</summary>'+
  '<div class="season-archive-list">'+(links||'<p class="muted">'+empty+'</p>')+'</div></details>';
}
function render(){
 renderedDay=today();
 renderSeason();
 const tabs=$('#board-tabs');
 if(tabs)tabs.hidden=!!manualArchive||(isArchive()&&sharedLoadState!=='ready');
 if(manualArchive&&sharedLoadState==='ready'){
  $('#results-freshness').innerHTML='';
  $('#stats').innerHTML='';
  out.innerHTML=window.POG_MANUAL_STANDINGS_HTML?.(shownSeason,manualArchive.rows,manualArchive.source)??'<p class="notice">この年度の順位表を読み込めませんでした。</p>';
  return;
 }
 renderDevice();
 $('#results-freshness').innerHTML=sharedLoadState==='ready'?resultFreshness():'';
 $('#stats').innerHTML=sharedLoadState==='ready'||(local&&tab!=='results')?'<span class="stat"><strong>'+participants().length+'</strong>人登録</span><span class="stat"><strong>'+rows.length+'</strong>件の指名</span><span class="stat"><strong>'+new Set(upcoming().map(h=>h.name+'|'+h.date)).size+'</strong>頭の次走情報</span>':'';
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
 if(sharedLoadState!=='ready'){
  out.innerHTML='<p class="notice">'+(sharedLoadState==='failed'?'共有の一覧を読み込めませんでした。<button type="button" class="plain" id="retry-shared">再読み込み</button>':'共有の一覧を確認しています…')+(cachedLocal?'<button type="button" class="plain" id="return-local">端末版へ戻る</button>':'')+'</p>';
  return;
 }
 let me=tab==='roster'?'<div class="heading"><h2>みんなの指名馬</h2></div><p class="sub muted">'+(local?'この端末で保存したデータ':isArchive()?'過去の記録（閲覧専用）':isNextSeason()?'今シーズンの指名馬':'今シーズンの指名馬・提供スクショと確認済みの情報')+'</p><p class="sub muted">戦績はJRAで確認できたレースのみを集計しています。レース名をタップすると出典を開けます。</p><div class="filters"><input id="search" placeholder="馬名で探す" aria-label="馬名で探す" value="'+esc(q)+'"><select id="who" aria-label="参加者で絞り込み"><option value="">全員</option>'+participants().map(n=>'<option value="'+esc(n)+'"'+(who===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></div><div class="grid" id="cards">'+rosterCards()+'</div>':tab==='standings'?standings():tab==='entries'?entries():raceResults();
 out.innerHTML=(unrecognizedNextPicks?'<p class="notice">読み込めなかった指名馬が'+unrecognizedNextPicks+'頭あります。ほかの指名馬はそのまま表示しています。</p>':'')+(local?'<p class="notice">'+(tab==='results'?'レース結果は共有の掲載版です。指名馬・順位・出走予定には、この端末で保存したデータを表示します。':'端末に保存したデータを表示中です。')+'<button class="plain" id="published">掲載版を見る</button></p>':cachedLocal?'<p class="notice">サイトの掲載版です。端末で編集するには、<button class="plain" id="return-local">端末版へ戻る</button></p>':'')+(notice?'<p class="notice">'+esc(notice)+'</p>':'')+me;
}
function openEdit(id){
 if(!canWriteDevice()||!dlg||!form)return;
 if(!local&&sharedLoadState!=='ready')return;
 if(cachedLocal){alert('端末の編集内容を残すため、端末版に戻ってから編集してください。');return}
 const h=rows.find(x=>x.id===id);editing=h?.id??null;
 form.reset();$('#edit-title').textContent=h?'指名馬を編集':'指名馬を追加';$('#remove').hidden=!h;
 $('#owners').innerHTML=participants().map(n=>'<option value="'+esc(n)+'"></option>').join('');
 for(const k of ['owner','name','points','result','date','status','race','source'])form.elements.namedItem(k).value=h?.[k]??(k==='owner'?(who||''):k==='status'?'予定':'');
 dlg.showModal();
}
document.addEventListener('click',ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.id==='retry-shared'){sharedLoadState='loading';render();startSharedLoad();return;}
 if(b.dataset.rosterCorrection){const h=rows.find(x=>x.id===b.dataset.rosterCorrection);if(h&&canCorrect(h))window.POG_OPEN_ROSTER_CORRECTION(h.owner,h.name);return;}
 if(b.id==='published'){cachedLocal=rows;rows=sanitize(seed);local=false;who=q='';render();}
 if(b.id==='return-local'&&cachedLocal){rows=cachedLocal;cachedLocal=null;local=true;who=q='';render();}
 if(b.dataset.tab){tab=b.dataset.tab;render();document.querySelector('[data-tab="'+tab+'"]').focus({preventScroll:true});}
 if(b.hasAttribute('data-add'))openEdit();
 if(b.id==='device-edit'&&$('#device-horse')?.value)openEdit($('#device-horse').value);
 if(b.id==='close')dlg?.close();
 if(b.id==='remove'&&canWriteDevice()&&confirm('この端末の指名馬データから削除しますか？')){if(persist(rows.filter(h=>h.id!==editing))){if(!participants().includes(who))who='';dlg?.close();render()}}
 if(b.id==='import'&&canWriteDevice())$('#importFile').click();
 if(b.id==='export'&&canWriteDevice()){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,season:shownSeason,horses:rows},null,2)],{type:'application/json'}));a.href=url;a.download='pog-'+shownSeason.slice(0,4)+'-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
});
out.addEventListener('input',ev=>{if(ev.target.id==='search'){q=ev.target.value;$('#cards').innerHTML=rosterCards()}});
out.addEventListener('change',ev=>{if(ev.target.id==='who'){who=ev.target.value;$('#cards').innerHTML=rosterCards()}});
deviceSettings?.addEventListener('change',async ev=>{
 if(ev.target.id==='importFile'&&canWriteDevice()){
  const f=ev.target.files[0];if(!f)return;
  try{if(f.size>2000000)throw Error();const p=JSON.parse(await f.text());if(p.version!==1||(isNextSeason()?p.season!==shownSeason:!!p.season&&p.season!==previousSeason))throw Error();const r=isNextSeason()?sanitize(p.horses):migrateNames(sanitize(p.horses));if(confirm('この端末のデータを '+r.length+' 頭のデータで置き換えますか？')&&persist(r)){who=q='';notice='バックアップを取り込みました。';render()}}catch{alert('同じシーズンのPOGバックアップファイルを選んでください。')}finally{ev.target.value=''}
 }
});
form?.addEventListener('submit',ev=>{
 ev.preventDefault();if(!canWriteDevice())return;const v=Object.fromEntries(new FormData(form)),h=rows.find(x=>x.id===editing);
 v.owner=v.owner.trim();v.name=v.name.trim();
 if(!v.owner||!v.name){alert('参加者と馬名を入力してください。');return}
 if(v.source&&!link(v.source)){alert('確認先には https:// から始まるURLを入れてください。');return}
 if(rows.some(x=>x.owner===v.owner&&x.name===v.name&&x.id!==editing)){alert('同じ参加者にこの馬は登録済みです。');return}
 v.points=v.points===''?null:Number(v.points);
 const row={...h,...v,...(isNextSeason()?{provisionalName:window.POG_NEXT_HORSE_NAME?.isProvisional(v.name)===true}:{})};if(h&&h.result!==v.result){row.resultSource='';row.resultDate=''} if(h&&h.points!==v.points){row.scoreSource='';row.scoreKind=''}
 const next=h?rows.map(x=>x.id===editing?row:x):[...rows,row];
 if(persist(next)){if(!participants().includes(who))who='';dlg?.close();render()}
});
render();

function safeSharedSource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port;}catch{return false;}}
function isJraRaceCard(value){try{const u=new URL(value);return isOfficialResult(value)&&(/\/JRADB\/accessD\.html$/i.test(u.pathname)||/\/keiba\/rpdf\/pdf\/[^/]+\.pdf$/i.test(u.pathname));}catch{return false;}}
function applyRosterCorrections(roster,corrections){
 if(!Array.isArray(corrections))return roster;
 const originals=new Map(roster.map(row=>[row.slotId,row])),selected=new Map(),ambiguous=new Set();
 for(const item of corrections.slice(0,roster.length*2)){
  const old=originals.get(item?.id);
  if(!old||old.originalName!==item.oldName||old.owner!==item.owner||
   typeof item.name!=='string'||!/^[ァ-ヺー]{2,18}$/u.test(item.name)||
   typeof item.revision!=='string'||!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(item.revision)||
   !validDate(item.correctedOn)||(item.historyRemaining!=null&&(!Number.isSafeInteger(item.historyRemaining)||item.historyRemaining<0)))continue;
  if(selected.has(item.id))ambiguous.add(item.id);
  selected.set(item.id,item);
 }
 const apply=row=>{
  const correction=selected.get(row.slotId);
  if(!correction||ambiguous.has(row.slotId))return row;
  const {owner,slotId,originalName,eligibleFrom}=row;
  return {owner,slotId,originalName,eligibleFrom,name:correction.name,points:0,correction};
 };
 // Cross-owner duplicates are valid. Fail closed on malformed same-owner collisions.
 // Re-projection matters because restoring one original can create another collision.
 let projected;
 do{
  projected=roster.map(apply);
  const occupied=new Map();
  for(const h of projected){const key=JSON.stringify([h.owner.normalize('NFKC').toLowerCase(),horseKey(h.name)]);if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(h);}
  let changed=false;
  for(const group of occupied.values())if(group.length>1)for(const h of group)if(h.correction&&!ambiguous.has(h.slotId)){ambiguous.add(h.slotId);changed=true;}
  if(!changed)break;
 }while(true);
 return projected;
}
async function loadSharedResults(){
 const revision=++sharedFetchRevision;
 try{
  if(isArchive()&&!archiveSeasonId(requestedSeason))throw Error('invalid requested season');
  const r=await fetch('/api/pog/data'+(isArchive()?'?season='+encodeURIComponent(requestedSeason):''),{cache:'no-store',credentials:'same-origin'});
  if(!r.ok)throw Error('shared data unavailable');
  const body=await r.json();
  if(revision!==sharedFetchRevision)return;
  if(!body||typeof body!=='object')throw Error('invalid shared data');
  const scope=body.season??previousSeason,active=body.activeSeason??previousSeason;
  if(!seasonId(active)||!archiveSeasonId(scope))throw Error('invalid season');
  const following=followingSeason(active);
  const next=body.nextSeason??following;
  if(!seasonId(next)||next!==following)throw Error('invalid next season');
  const verifiedArchives=[...new Set((Array.isArray(body.archiveSeasons)?body.archiveSeasons:
   (body.archiveAvailable===true&&active===followingSeason(previousSeason)?[previousSeason]:[])).filter(x=>archiveSeasonId(x)&&x<active))].sort().reverse();
  if(isArchive()?(scope!==requestedSeason||!verifiedArchives.includes(scope)):scope!==active)throw Error('invalid season');
  const verifiedLabels=new Map();
  if(body.archiveLabels&&typeof body.archiveLabels==='object')for(const id of verifiedArchives){
   const label=Object.hasOwn(body.archiveLabels,id)?body.archiveLabels[id]:'';
   if(typeof label!=='string'||!/^\d{4}\/\d{2}\/\d{2}〜\d{4}\/\d{2}\/\d{2}$/u.test(label))continue;
   const [from,to]=label.split('〜').map(d=>d.replaceAll('/','-'));
   if(validDate(from)&&validDate(to)&&from<=to)verifiedLabels.set(id,label);
  }
  const manual=Object.hasOwn(body,'manualStandings');
  if(manual){
   if(!isArchive()||scope>=previousSeason||!Array.isArray(body.manualStandings))throw Error('invalid manual archive');
   manualArchive={rows:body.manualStandings,source:body.manualStandingsSource};
   shownSeason=scope;activeSeason=active;archiveSeasons=verifiedArchives;archiveLabels=verifiedLabels;sharedLoadState='ready';
   window.POG_BOARD_SEASON={shown:scope,active,next,archive:true,archiveSeasons:archiveSeasons.slice()};
   window.POG_SHARED_ROSTER=[];
   render();return true;
  }
  if(!seasonId(scope)||!Array.isArray(body.results)||(scope!==previousSeason&&!Array.isArray(body.participants)))throw Error('invalid shared data');
  manualArchive=null;
  const newScope=scope!==previousSeason;
  const provisionalYearsValid=(Array.isArray(body.provisionalYears)?body.provisionalYears:scope===followingSeason(previousSeason)?[2024,2025]:[body.foalYear])
   .filter(y=>Number.isInteger(y)&&y>=1900&&y<=9999);
  const provisionalYears=[...new Set(provisionalYearsValid)].sort((a,b)=>a-b);
  // A live board's start comes from the API. An archived board requires both fixed bounds.
  const currentBoard=!isArchive()&&scope===active&&body.currentBoard===true;
  const seasonDateAllowed=date=>!newScope||(
   validDate(body.seasonStart)&&date>=body.seasonStart&&(
    validDate(body.seasonEnd)?date<=body.seasonEnd:currentBoard&&(body.seasonEnd==null)
   )
  );
  const wasShown=shownSeason;
  const ownerKeys=new Set(),participantsForScope=[];
  if(newScope)for(const x of body.participants){
   const owner=text(x,40),id=owner.normalize('NFKC').toLowerCase().replace(/\s+/gu,'');
   if(owner&&x===owner&&!ownerKeys.has(id)){ownerKeys.add(id);participantsForScope.push(owner);}
  }
  const scopeSeed=newScope?[]:baseSeed;
  const seedOwners=new Set(scopeSeed.map(h=>h.owner)),archivedOwners=new Set((Array.isArray(body.archivedSeedOwners)?body.archivedSeedOwners:[]).filter(owner=>seedOwners.has(owner)));
  const activeBase=scopeSeed.filter(h=>!archivedOwners.has(h.owner));
  const additions=[],pending=new Set(),globalNames=new Set(activeBase.map(h=>h.name.normalize('NFKC'))),ownerNames=new Set([...seedOwners].map(owner=>owner.normalize('NFKC').toLowerCase()));
  const inputRoster=newScope?body.seasonRoster:body.rosterAdditions;
  const official=name=>typeof name==='string'&&/^[ァ-ヺー]{2,18}$/u.test(name);
  // Reading an already saved roster must not depend on the optional input normalizer.
  // Recognize only canonical dam labels, not draft markers or arbitrary text.
  const pendingName=name=>typeof name==='string'&&name.length<=27&&/^[ァ-ヺー]+(?:・[ァ-ヺー]+)*の\d{2}$/u.test(name)&&name.slice(0,-3).replaceAll('・','').length>=2;
  let unknown=0;const nextNameProofs=[];
  if(newScope&&Array.isArray(body.historyPendingOwners))for(const owner of body.historyPendingOwners)if(participantsForScope.includes(owner))pending.add(owner);
  for(const item of Array.isArray(inputRoster)?inputRoster.slice(0,newScope?200:90):[]){
   const owner=text(item?.owner,40),ownerKey=owner.normalize('NFKC').toLowerCase(),hs=item?.horses;
   if(!owner||(newScope&&!participantsForScope.includes(owner))||ownerNames.has(ownerKey)||(!newScope&&!validDate(item.eligibleFrom))||!Array.isArray(hs)||!hs.length)continue;
   if(!newScope&&(hs.length>10||hs.some(name=>!official(name))||new Set(hs).size!==hs.length))continue;
   ownerNames.add(ownerKey);if(!newScope&&item.historyRemaining!==0)pending.add(owner);
   const listed=new Set();
   for(const [index,name] of hs.entries()){
    const provisionalName=newScope&&pendingName(name)&&(
     provisionalYears.some(year=>String(year).slice(-2)===name.slice(-2))||
     (Array.isArray(item.provisionalHorses)&&item.provisionalHorses.includes(name))
    );
    const historyPending=newScope&&!provisionalName&&Array.isArray(item.historyPendingHorses)&&item.historyPendingHorses.includes(name);
    if(newScope&&(index>=10||(!official(name)&&!provisionalName)||listed.has(name))){unknown++;continue;}
    listed.add(name);
    const nameSource=newScope&&!provisionalName&&item.nameSources&&Object.hasOwn(item.nameSources,name)?item.nameSources[name]:null;
    if(typeof nameSource==='string'&&/^https:\/\/db\.netkeiba\.com\/horse\/\d{10}\/$/.test(nameSource))nextNameProofs.push({owner,name,nameSource,nameJraUnverified:true});
    additions.push({owner,name,points:0,...(newScope?{provisionalName,historyPending}:{eligibleFrom:item.eligibleFrom}),slotId:pickSlot(newScope?'season':'add',owner,name),originalName:name});
   }
  }
  unrecognizedNextPicks=unknown;
  const rename=new Map();resolvedHorseIds.clear();nameInfo.clear();oldNameInfo.clear();
  if(!newScope)for(const [k,info] of initialNameInfo){nameInfo.set(k,info);oldNameInfo.set(info.owner+'|'+info.formerName,info);}
  for(const info of nextNameProofs)nameInfo.set(info.owner+'|'+info.name,info);
  for(const x of Array.isArray(body.nameResolutions)?body.nameResolutions.slice(0,scopeSeed.length):[]){
   if(!x||typeof x.id!=='string'||!/^2024\d{6}$/.test(x.id)||typeof x.name!=='string'||!/^[ァ-ヺー]{2,18}$/u.test(x.name)||x.nameSource!=='https://db.netkeiba.com/horse/'+x.id+'/'||globalNames.has(x.name))continue;
   const row=activeBase.find(h=>h.provisionalName&&h.owner===x.owner&&h.name===x.formerName);
   if(!row||rename.has(row))continue;
   const info={...x,nameJraUnverified:true};
   rename.set(row,info);globalNames.add(x.name);resolvedHorseIds.set(x.name,x.id);
   nameInfo.set(x.owner+'|'+x.name,info);oldNameInfo.set(x.owner+'|'+x.formerName,info);
  }
  sharedRoster=applyRosterCorrections([...activeBase.map(row=>{const x=rename.get(row);return {...row,...(x?{name:x.name,provisionalName:false}:{}),slotId:pickSlot('seed',row.owner,row.name),originalName:row.name};}),...additions],newScope?[]:body.rosterCorrections);historyPendingOwners=pending;sharedPicks=new Map();
  for(const horse of sharedRoster)if(newScope||!horse.provisionalName){if(!sharedPicks.has(horse.name))sharedPicks.set(horse.name,new Set());sharedPicks.get(horse.name).add(horse.owner);}
  const names=new Set(sharedRoster.filter(h=>!h.provisionalName).map(h=>h.name)),registeredNames=new Set(sharedRoster.filter(h=>h.correction||h.eligibleFrom).map(h=>h.name));
  const added=new Map(),seen=new Set(),starts=new Set();
  for(const k of Object.keys(histories))delete histories[k];
  if(!newScope)Object.assign(histories,baseHistories);
  for(const x of body.results){
   if(!x||!validDate(x.date)||!names.has(x.name)||(currentBoard&&x.date>today())||(!seasonDateAllowed(x.date)||(!newScope&&registeredNames.has(x.name)&&(x.date<seasonStart||x.date>seasonEnd)))||typeof x.race!=='string'||!Number.isInteger(x.place)||x.place<1||x.place>20||!Number.isSafeInteger(x.pointChange)||x.pointChange<0||!isOfficialResult(x.resultSource))continue;
   const start=x.name+'|'+x.date;
   if(seen.has(x.key)||starts.has(start))continue;
   seen.add(x.key);starts.add(start);
   if(!added.has(x.name))added.set(x.name,[]);
   added.get(x.name).push(x);
  }
  for(const [name,entries] of added){
   const past=horseHistory(name), knownDate=new Set(past.map(h=>h.date));
   for(const x of entries)if(!knownDate.has(x.date)){
    past.push({date:x.date,race:x.race,finish:x.place+'着',source:x.resultSource,popularity:validPopularity(x.popularity)?x.popularity:null});
    knownDate.add(x.date);
   }
   histories[name]=past.sort((a,b)=>b.date.localeCompare(a.date,'ja'));
  }
  const plans=new Map();
  for(const x of Array.isArray(body.upcoming)?body.upcoming:[]){
   if(!x||!names.has(x.name)||!validDate(x.date)||!seasonDateAllowed(x.date)||typeof x.race!=='string'||!x.race.trim()||!['予定','確定','取消'].includes(x.status)||!safeSharedSource(x.source))continue;
   if(x.status==='確定'&&!isJraRaceCard(x.source))continue;
   if(!plans.has(x.name))plans.set(x.name,{date:x.date,race:text(x.race,110),status:x.status,source:x.source});
  }
  publishedHorseUpdates=newScope?{}:{...baseHorseUpdates};
  // API items are applied DESC. Replay event dates oldest-first and older
  // applications first on a same-date tie. Keep returned as a hidden tombstone.
  const orderedUpdates=(Array.isArray(body.updates)?body.updates:[]).map((item,index)=>({item,index})).filter(({item})=>item&&validDate(item.date)).sort((a,b)=>a.item.date.localeCompare(b.item.date)||b.index-a.index);
  for(const {item:x} of orderedUpdates){
   if(!x||!names.has(x.name)||!validDate(x.date)||!seasonDateAllowed(x.date)||!['injury','retired','deregistered','returned'].includes(x.kind)||!safeSharedSource(x.source))continue;
   const previous=publishedHorseUpdates[x.name];
   if(previous&&validDate(previous.date)&&x.date<previous.date)continue;
   if(x.kind==='returned'&&(['retired','deregistered'].includes(previous?.kind)||
      (!isArchive()&&previous?.kind==='injury'&&x.date<=previous.date)))continue;
   publishedHorseUpdates[x.name]={date:x.date,kind:x.kind,detail:text(x.detail,600),source:x.source,sourceLabel:text(x.sourceLabel,80)};
  }
  // A scheduled race belongs to the horse. A surviving duplicate pick can
  // keep its static plan if the archived owner was the plan's only seed row.
  const archivedPlans=new Map();
  for(const row of scopeSeed)if(archivedOwners.has(row.owner)&&names.has(row.name)&&!row.provisionalName&&validDate(row.date)&&row.race&&safeSharedSource(row.source)&&!archivedPlans.has(row.name))archivedPlans.set(row.name,{date:row.date,race:row.race,status:row.status,source:row.source});
  seed=sharedRoster.map(row=>{
   let entry={};
   const plan=plans.get(row.name);
   if(plan?.status==='取消'){
    // A server-validated tombstone cancels the current dynamic plan, not
    // necessarily the older static seed. Never resurrect that seeded plan.
    entry={date:'',race:'',source:''};
   }else if(plan)entry=plan;
   else if(!row.date&&archivedPlans.has(row.name))entry=archivedPlans.get(row.name);
   // Static seed aggregates already contain pre-baseline races. New owners earn only verified D1 facts.
   const matches=(added.get(row.name)??[]).filter(x=>newScope||row.correction||row.eligibleFrom||x.date>seedPointsThrough);
   const newest=matches.length?matches.reduce((a,b)=>a.date>=b.date?a:b):null;
   if((entry.date??row.date)&&(entry.date??row.date)<=(newest?.date??row.resultDate??''))entry={date:'',race:'',source:''};
   if(!newest)return {...row,...entry};
   return {...row,...entry,points:row.points===null?null:row.points+matches.reduce((sum,x)=>sum+x.pointChange,0),
    result:dateText(newest.date)+' '+newest.race+' '+newest.place+'着',resultSource:newest.resultSource,resultDate:newest.date,
    scoreKind:'JRA本賞金から換算',scoreSource:newest.resultSource};
  });
  if(shownSeason!==scope){
   for(const k of Object.keys(stamp))delete stamp[k];
   if(!newScope)Object.assign(stamp,baseStamp);
   // Clear the in-memory draft in either direction, even before the next reload.
   local=false;cachedLocal=null;who=q='';if(dlg?.open)dlg.close();
  }
  shownSeason=scope;activeSeason=active;archiveSeasons=verifiedArchives;archiveLabels=verifiedLabels;seasonParticipants=participantsForScope;
  if(validStamp(body.resultAppliedAt)&&(!validStamp(stamp.resultPublishedAt)||Date.parse(body.resultAppliedAt)>Date.parse(stamp.resultPublishedAt))){stamp.resultPublishedAt=body.resultAppliedAt;if(validDate(body.checkedAt))stamp.checkedAt=body.checkedAt;}
  if(newScope){
   stamp.seasonStart=validDate(body.seasonStart)?body.seasonStart:null;
   stamp.entriesCheckedAt=validDate(body.entriesCheckedAt)?body.entriesCheckedAt:null;
  }
  stamp.coveredSince=validDate(body.coveredSince)?body.coveredSince:null;
  stamp.coveredThrough=validDate(body.coveredThrough)?body.coveredThrough:null;
  stamp.resultDaysPending=Number.isInteger(body.resultDaysPending)&&body.resultDaysPending>=0?body.resultDaysPending:null;
  sharedLoadState='ready';
  loadDevice();
  window.POG_BOARD_SEASON={shown:shownSeason,active:activeSeason,archive:isArchive(),currentBoard,next,archiveSeasons:archiveSeasons.slice(),foalYear:body.foalYear,provisionalYears};
  if(wasShown&&wasShown!==shownSeason&&!isArchive()){
   // Another tab may have started the new season. Never keep old admin controls.
   window.POG_CAN_UPDATE=false;
   for(const id of ['#admin-tools','#organizer-update','#organizer-quick']){const node=$(id);if(node)node.hidden=true;}
   window.location?.reload?.();
  }
  if(typeof Event==='function')window.dispatchEvent?.(new Event('pog-season-ready'));
  window.POG_SHARED_ROSTER=isArchive()?[]:sharedRoster;
  window.POG_NEXT_PARTICIPANTS=isNextSeason()?seasonParticipants.slice():[];
  if(typeof Event==='function'&&isNextSeason())window.dispatchEvent?.(new Event('pog-next-roster-ready'));
  window.POG_REFRESH_RESEARCH_PROMPT?.();
  if(!local){rows=sanitize(seed);if(who&&!participants().includes(who))who='';render();}
  else if(rename.size){rows=sanitize(migrateNames(rows));render();}
  else render();
  return true;
 }catch{
  if(revision===sharedFetchRevision&&sharedLoadState!=='ready'){sharedLoadState='failed';render();}
  // After a verified load, keep the last confirmed view on a transient failure.
  return false;
 }
}
function startSharedLoad(){return window.POG_BOARD_READY=loadSharedResults();}
window.addEventListener('pog-shared-updated',startSharedLoad);
window.addEventListener('pog-editor-ready',()=>{loadDevice();render();});
startSharedLoad();
if(!isArchive()){
 const redrawOnNewDay=()=>{if(document.visibilityState!=='hidden'&&renderedDay!==today())render();};
 window.addEventListener('pageshow',redrawOnNewDay);
 document.addEventListener('visibilitychange',redrawOnNewDay);
 // A live page can stay open over midnight. Repaint only, without fetching or saving.
 const dayMs=86400000,jstOffsetMs=9*3600000;
 const schedule=()=>{
  const msUntilMidnight=dayMs-((Date.now()+jstOffsetMs)%dayMs);
  window.setTimeout(()=>{redrawOnNewDay();schedule();},msUntilMidnight+25);
 };
 if(typeof window.setTimeout==='function')schedule();
}
