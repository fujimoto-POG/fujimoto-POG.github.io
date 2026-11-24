(() => {
'use strict';
const official=/^[ァ-ヺー]{2,18}$/u;
const pedigree=/^(?:母\s*:?\s*)?([ァ-ヺー]+(?:・[ァ-ヺー]+)*)\s*(?:[の_・-]\s*)?(\d{4}|\d{2})$/u;
// New writes use the verified board's age metadata, never the browser year.
const years=()=>Array.isArray(window.POG_BOARD_SEASON?.provisionalYears)?window.POG_BOARD_SEASON.provisionalYears:[];
function normalize(raw){
 if(typeof raw!=='string'||/[<>|\p{Cc}\p{Cf}]/u.test(raw))return '';
 const clean=raw.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(clean.length>48||/[<>|\p{Cc}\p{Cf}]/u.test(clean))return '';
 if(official.test(clean))return clean;
 const match=clean.replace(/\s*\(馬名未定\)$/u,'').match(pedigree);
 const dam=match?.[1];
 const year=match?.[2];
 const allowed=year&&years().some(y=>String(y)===year||String(y).slice(-2)===year);
 return allowed&&dam&&dam.replaceAll('・','').length>=2&&dam.length<=24?dam+'の'+year.slice(-2):'';
}
const isProvisional=name=>typeof name==='string'&&/の\d{2}$/u.test(name)&&normalize(name)===name;
const examples=()=>years().filter(y=>Number.isInteger(y)).map(year=>String(year).slice(-2));
const example=()=>{const year=examples()[0];return year?'ミュージアムヒルの'+year:'母名と生年';};
window.POG_NEXT_HORSE_NAME=Object.freeze({normalize,isProvisional,examples,example});
})();
