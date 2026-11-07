/* BusVisa V2 fee engine: only use documented landing-visa fees; FX is an estimate. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.BusVisaFees=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const VALID=/^[A-Z]{3}$/;
function currency(code){return String(code||'').trim().toUpperCase()}
function amountText(amount,code){
  const c=currency(code),n=Number(amount);
  if(!VALID.test(c)||!Number.isFinite(n))return '费用待核实';
  try{return new Intl.NumberFormat('zh-CN',{style:'currency',currency:c,currencyDisplay:'code',minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:Number.isInteger(n)?0:2}).format(n)}catch{return `${n.toLocaleString('zh-CN')} ${c}`}
}
function extractArrivalFees(record,passport){
  if(!record||!Array.isArray(record.visaTypes))return [];
  const p=String(passport||'').toUpperCase();
  const policy=record.visaPolicy?.byPassport?.[p];
  if(!policy||!['visa-on-arrival','visa on arrival'].includes(String(policy.requirement||'').toLowerCase()))return [];
  const selected=Array.isArray(policy.visaTypes)?new Set(policy.visaTypes.map(String)):null;
  const localCurrency=currency(record.countryFacts?.currency?.code);
  // Some passport-specific concessions waive an otherwise published standard
  // arrival fee (e.g. Nepal for Chinese citizens). Never show the generic
  // charge as applicable when the passport policy explicitly says gratis.
  const gratis=/\bgratis\b|\bfree of charge\b|visa fees? (?:are )?waived|fee exemption/i.test(String(policy.notes||''));
  return record.visaTypes.filter(t=>{
    const isArrival=['visa-on-arrival','visa on arrival'].includes(String(t.method||'').toLowerCase());
    return isArrival && (!selected||selected.size===0||selected.has(String(t.id)));
  }).filter(t=>t.fee&&Number.isFinite(Number(t.fee.amount))&&VALID.test(currency(t.fee.currency)))
  .map(t=>({id:String(t.id||''),name:String(t.name||'落地签'),days:Number.isFinite(Number(t.stayDays))&&Number(t.stayDays)>0?Number(t.stayDays):null,amount:gratis?0:Number(t.fee.amount),currency:currency(t.fee.currency),localCurrency:VALID.test(localCurrency)?localCurrency:null,gratis,notes:gratis?'当前护照有免费落地签待遇；需核实年度累计停留额度及资格。':String(t.fee.notes||''),source:gratis?(policy.source?.url||t.evidence?.fee?.url||t.source?.url||''):(t.evidence?.fee?.url||t.source?.url||''),verified:String(gratis?(policy.source?.lastVerified||t.source?.lastVerified||''):(t.source?.lastVerified||'')),basis:'该签证类别列于该护照的目的地政策记录'})).slice(0,6);
}
function formatConverted(amount,rate,code){return amountText(Math.round(Number(amount)*Number(rate)*100)/100,code)}
function renminbi(amount){const n=Number(amount);return Number.isFinite(n)?new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',currencyDisplay:'symbol'}).format(n):'人民币参考价待核实'}
function normalizeRate(data,base,quote){
 if(!data||String(data.base).toUpperCase()!==currency(base)||String(data.quote).toUpperCase()!==currency(quote)||!Number.isFinite(Number(data.rate))||Number(data.rate)<=0||!/^\d{4}-\d\d-\d\d$/.test(data.date||''))throw Error('汇率响应内容不符合预期');
 return {base:currency(base),quote:currency(quote),rate:Number(data.rate),date:data.date,receivedAt:new Date().toISOString(),provider:'Frankfurter (多央行参考中间价)'};
}
return{currency,amountText,extractArrivalFees,formatConverted,renminbi,normalizeRate};
});
