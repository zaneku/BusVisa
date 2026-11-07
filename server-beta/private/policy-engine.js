/* BusVisa V2 — independent policy parsing / matching, also loadable in Node tests.
 * Records declared by users have NO validity dates: never infer that a visa is valid.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BusVisaPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SCHENGEN=new Set('AT BE BG HR CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH'.split(' '));
  const ST = {
    'visa free':'free', 'visa-free':'free', 'visa_free':'free', 'free':'free',
    'visa on arrival':'arrival', 'visa-on-arrival':'arrival','visa_on_arrival':'arrival',
    'evisa':'evisa','e-visa':'evisa','e_visa':'evisa','electronic visa':'evisa',
    'eta':'eta', 'e-ta':'eta', 'electronic travel authorization':'eta',
    'visa required':'required','visa-required':'required','visa_required':'required', 'embassy-visa':'required','embassy visa':'required','embassy_visa':'required',
    'no admission':'denied','no-admission':'denied','no_admission':'denied',
    '-1':'held','freedom-of-movement':'held','freedom of movement':'held'
  };
  function statusOf(value){
    if(value===null||value===undefined)return 'unknown';
    const s=String(value).trim().toLowerCase();
    return ST[s]||(/^\d+$/.test(s)?'free':'unknown');
  }
  function csvRecords(csv){
    if(typeof csv!=='string')throw Error('CSV 应是文本');
    const out=[];let row=[],field='',quoted=false;
    for(let i=0;i<csv.length;i++){
      const c=csv[i];
      if(quoted){
        if(c==='"'&&csv[i+1]==='"'){field+='"';i++}
        else if(c==='"')quoted=false;
        else field+=c;
      }else if(c==='"')quoted=true;
      else if(c===','){row.push(field);field=''}
      else if(c==='\n'){row.push(field.replace(/\r$/,''));if(row.length>1||row[0].trim())out.push(row);row=[];field=''}
      else field+=c;
    }
    if(field||row.length){row.push(field.replace(/\r$/,''));out.push(row)}
    return out;
  }
  const norm=s=>String(s||'').replace(/^\ufeff/,'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  function headerIndex(header,possible){return possible.map(p=>header.indexOf(p)).find(i=>i>=0)??-1}
  function importMatrix(csv, passport, expectedMin=150){
    const records=csvRecords(csv);if(!records.length)throw Error('CSV 内容为空');
    const header=records[0].map(norm);
    // The publisher's current CSV uses passport_code and destination_iso2.
    // Older exports used passport/destination: support both without changing saved data.
    const iPass=headerIndex(header,['passport_code','passport_iso2','passport','from_iso2','origin_iso2','from','origin','nationality','citizenship']);
    const iDest=headerIndex(header,['destination_iso2','destination_code','destination','to_iso2','to','country_iso2','country','dest']);
    const iStatus=headerIndex(header,['requirement','visa_requirement','entry_requirement','visa_status','status','visa']);
    const iDays=headerIndex(header,['max_stay_days','max_stay','stay_days','days','maxstaydays','maximum_stay_days']);
    const iSource=headerIndex(header,['source_url','source','visa_source','url','sourceurl']);
    const iVerified=headerIndex(header,['last_verified','source_last_verified','verified','source_verified','lastverified','verified_date']);
    const iLevel=headerIndex(header,['source_level','sourcelevel','source_scope','evidence_level']);
    if(iPass<0||iDest<0||iStatus<0){
      const missing=[iPass<0?'护照代码':null,iDest<0?'目的地代码':null,iStatus<0?'签证规则':null].filter(Boolean).join('、');
      throw Error('在线数据格式变化（缺少'+missing+'字段），已保留本机旧数据');
    }
    const p=String(passport).toUpperCase(),result={};
    for(let j=1;j<records.length;j++){
      const r=records[j];if(String(r[iPass]||'').trim().toUpperCase()!==p)continue;
      const code=String(r[iDest]||'').trim().toUpperCase();if(!/^[A-Z]{2}$/.test(code))continue;
      const status=statusOf(r[iStatus]);
      const n=Number(iDays>=0?r[iDays]:NaN),days=Number.isInteger(n)&&n>0&&n<10000?n:null;
      const source=String(iSource>=0?r[iSource]:'').trim();
      const verified=String(iVerified>=0?r[iVerified]:'').trim();
      const level=String(iLevel>=0?r[iLevel]:'').trim();
      result[code]={status,days,source:/^https:\/\//.test(source)?source:'',verified:/^\d{4}-\d\d-\d\d$/.test(verified)?verified:'',level};
    }
    if(Object.keys(result).length<expectedMin)throw Error('护照 '+p+' 在线数据不足（'+Object.keys(result).length+' 条）');
    return result;
  }
  function importNested(data,passport,expectedMin=150){
    const p=String(passport).toUpperCase(),raw=data?.[p]||data?.[p.toLowerCase()];
    if(!raw||typeof raw!=='object')throw Error('没有当前护照的数据');
    const result={};
    for(const [key,value] of Object.entries(raw)){
      const code=key.toUpperCase();if(!/^[A-Z]{2}$/.test(code))continue;
      const r=typeof value==='object'&&value!==null?value:{status:value};
      const status=statusOf(r.requirement||r.status);
      const n=Number(r.max_stay_days??r.days),days=Number.isInteger(n)&&n>0&&n<10000?n:null;
      result[code]={status,days,source:/^https:\/\//.test(r.source||'')?r.source:'',verified:r.verified||'',level:r.source?'row':''};
    }
    if(Object.keys(result).length<expectedMin)throw Error('数据集覆盖不足');
    return result;
  }
  function diffRows(previous,next){
    if(!previous||Object.keys(previous).length<150)return [];
    const changes=[];
    for(const [code,b] of Object.entries(next)){
      const a=previous[code];if(!a||a.status==='unknown'||b.status==='unknown')continue;
      if(a.status===b.status&&(a.days??null)===(b.days??null))continue;
      changes.push({code,before:a.status,after:b.status,oldDays:a.days??null,newDays:b.days??null,source:b.source||''});
    }
    return changes.sort((a,b)=>a.code.localeCompare(b.code));
  }
  function knownType(v,taxonomy){
    if(!v||!v.issuer||!v.type)return null;
    const list=taxonomy?.issuers?.[v.issuer]?.types||[];
    const rec=list.find(x=>x[0]===v.type);
    return rec?{code:rec[0],name:rec[1],category:rec[2]}:null;
  }
  function visaLabel(v,taxonomy){
    if(!v)return '未指定';
    const kt=knownType(v,taxonomy);
    if(kt)return kt.name;
    return v.type==='CUSTOM'?(v.customType||'未指定类别'):v.type;
  }
  function visaCategory(v,taxonomy){return knownType(v,taxonomy)?.category||'unclassified'}
  // By design this function never checks dates. ALL matches are conditional,
  // including the holder's own destination visa: validity and admission are unknown.
  function matchExemption(exemption,visas,taxonomy){
    if(!exemption||!Array.isArray(exemption.issuers))return null;
    for(const visa of visas){
      if(!visa||!visa.type)continue;
      const matched=exemption.issuers.includes(visa.issuer)||(SCHENGEN.has(visa.issuer)&&exemption.issuers.includes('SCHENGEN'));
      if(!matched)continue;
      if((SCHENGEN.has(visa.issuer)||visa.issuer==='SCHENGEN')&&(['A','C-LTV'].includes(visa.type)||!(visa.type.startsWith('C-')||visa.type==='D')))continue;
      const category=visaCategory(visa,taxonomy);
      if(exemption.allowedCategories?.length && !exemption.allowedCategories.includes(category))continue;
      if(exemption.excludedCategories?.includes(category))continue;
      const checks=['签证仍有效且可用于入境'];
      if(exemption.multiple===true)checks.push('满足多次入境签证要求');
      if(exemption.minRemainingDays)checks.push(`入境时签证至少剩余 ${exemption.minRemainingDays} 天`);
      if(exemption.mustBeUsed)checks.push('签证已按要求使用过');
      if(category==='unclassified'||!exemption.allowedCategories?.length)checks.push('本签证类别是否在豁免范围内');
      return {visa,checks,category};
    }
    return null;
  }
  function staleDays(date,at){if(!date)return null;const a=Date.parse(at+'T12:00:00Z'),b=Date.parse(date+'T12:00:00Z');return Number.isFinite(b)?Math.floor((a-b)/86400000):null}
  return {statusOf,csvRecords,importMatrix,importNested,diffRows,knownType,visaLabel,visaCategory,matchExemption,staleDays};
});
