(() => {
'use strict';
const escaped=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const format=new Intl.NumberFormat('ja-JP');
function seasonKey(value){
 if(typeof value!=='string')return '';
 const raw=value.normalize('NFKC').trim();
 const match=/^(\d{4})(?:\s*[-‐‑–—−]\s*(\d{2}|\d{4}))?$/.exec(raw);
 if(!match)return '';
 const year=Number(match[1]),end=(year+1)%100;
 if(year<1900||year>=9999||(match[2]&&Number(match[2])!==(match[2].length===2?end:year+1)))return '';
 return year+'-'+String(end).padStart(2,'0');
}
const label=season=>seasonKey(season).replace('-','–');
const safeSource=value=>{
 if(typeof value!=='string'||!value||value.length>500||/[<>\p{Cc}\p{Cf}]/u.test(value))return '';
 try{const u=new URL(value.trim());return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')?u.href:'';}catch{return '';}
};
function validRows(rows){
 return Array.isArray(rows)&&rows.length>0&&rows.length<=200
  &&rows.every(row=>Number.isSafeInteger(row?.rank)&&row.rank>0&&row.rank<=200
   &&typeof row.owner==='string'&&row.owner===row.owner.trim()&&!!row.owner&&row.owner.length<=40
   &&Number.isSafeInteger(row.points)&&row.points>=0&&row.points<=99999999999);
}
window.POG_MANUAL_STANDINGS_HTML=(season,rows,source)=>{
 if(!seasonKey(season)||!validRows(rows))return '<p class="notice">この年度の順位表を読み込めませんでした。</p>';
 const evidence=safeSource(source);
 return '<div class="heading"><h2>'+escaped(label(season))+'の順位表</h2></div>'
  +'<p class="notice">手入力の記録です。入力された順位とポイントを表示しています。馬ごとの成績や出走予定は含みません。</p>'
  +(evidence?'<p><a href="'+escaped(evidence)+'" target="_blank" rel="noopener noreferrer">出典を見る</a></p>':'')
  +rows.map(row=>'<article class="panel ranked-panel"><div class="rankline"><span class="rank">'+row.rank+'位</span><div><h3>'+escaped(row.owner)+'</h3></div><strong>'+format.format(row.points)+' P</strong></div></article>').join('');
};
})();
