/* BusVisa V2: passport policy sync + country-specific visa types + documented visa-on-arrival fees + FX reference. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const P=window.BusVisaPolicy,Fees=window.BusVisaFees,NS=window.BusVisaSearch,I=window.BusVisaI18n;
const T=(key,params)=>I.t(key,params);
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const read=(key,otherwise)=>{try{return JSON.parse(localStorage.getItem(key))??otherwise}catch{return otherwise}};
const save=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch(e){console.warn('缓存写入失败:',e)}};
const today=()=>new Date().toISOString().slice(0,10);
const displayName=(code,locale)=>{try{return new Intl.DisplayNames([locale],{type:'region'}).of(code)}catch{return null}};
const names={SCHENGEN:'申根区',US:'美国',CA:'加拿大',JP:'日本',KR:'韩国',ZA:'南非',GB:'英国'};
const schengen=new Set('AT BE BG HR CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH'.split(' '));
const visaSchengenAllowed=v=>Boolean(v && (schengen.has(v.issuer)||v.issuer==='SCHENGEN'));
const schengenTerritorial=v=>v?.type==='C-LTV';
const schengenEntry=v=>['A','C-LTV'].includes(v?.type)?false:/^(C-)|^D$/.test(v?.type||'');
const labels={free:'免签',arrival:'落地签',eta:'电子旅行授权',held:'本国护照',conditional:'凭所持签证·条件性便利',limited:'局部地区限定',evisa:'需提前电子签',required:'需提前签证',denied:'不可入境',unknown:'数据待核验'};
const lab=status=>T(labels[status]||'数据待核验');
const available=new Set(['free','arrival','eta','conditional','limited']);
// Prefer same-origin Netlify proxy: avoids cross-site browser/CORS failures.
const MANIFEST='/policy-api/index.json';
const MATRIX='/policy-api/visa-matrix.csv';
const DIRECT_MANIFEST='https://travelrequirements.info/data/index.json';
const DIRECT_MATRIX='https://travelrequirements.info/data/visa-matrix.csv';
const RAW='https://raw.githubusercontent.com/travel-requirements/entry-requirements/main/destinations/';
const FXBASE='/fx-api/';
const DIRECT_FXBASE='https://api.frankfurter.dev/v2/rate/';
const old=read('va.visas',[]);
// Migration from V1: intentionally remove all historical validity dates and entries/used fields.
const visas=Array.isArray(read('va.v2.visas',null))?read('va.v2.visas',[]):(Array.isArray(old)?old.map(v=>({id:String(v.id||Date.now()),issuer:v.issuer,type:v.type==='tourism'?'CUSTOM':v.type==='business'?'CUSTOM':v.type==='other'?'CUSTOM':v.type,customType:v.type==='tourism'?'旅游签证':v.type==='business'?'商务签证':v.type==='other'?'其他类别':''})).filter(v=>v.issuer&&v.type):[]);
save('va.v2.visas',visas);
const S={passport:read('va.passport','CN'),visas,china:{},options:[],meta:{},names:{},world:null,visaTypes:null,exemptions:[],visaIssuer:'US',pickerTarget:null,typeToken:0,online:read('va.v2.passport.'+read('va.passport','CN'),null),manifest:read('va.v2.manifest',null),fx:read('va.v2.fx',{}),details:{},loading:null,currentTab:'map',selected:null,editId:null,modal:null,view:[0,0,1000,510],panning:new Map(),lastDrag:0,countryToken:0,refreshing:false};
const nameOf=code=>{
 if(code==='SCHENGEN')return T('申根区');if(code==='CN')return T('中国大陆');
 const n=S.names[code]||{};
 if(I.lang==='en')return n.en||S.meta[code]?.en||displayName(code,'en')||code;
 if(I.lang==='zh-HK')return displayName(code,'zh-HK')||n.zhHant||n.zhHans||code;
 if(I.lang==='zh-TW')return displayName(code,'zh-TW')||n.zhHant||n.zhHans||code;
 return n.zhHans||S.meta[code]?.zh||displayName(code,'zh-CN')||code;
};
const tradOf=code=>S.names[code]?.zhHant||nameOf(code);
const enOf=code=>S.names[code]?.en||S.meta[code]?.en||code;
const flag=code=>code==='SCHENGEN'?'🇪🇺':code==='XK'?'🇽🇰':/^[A-Z]{2}$/.test(code)?[...code].map(x=>String.fromCodePoint(127397+x.charCodeAt(0))).join(''):'🌍';
const isoTime=stamp=>I.date(stamp);
const officialUrl=s=>typeof s==='string'&&/^https:\/\//.test(s)?s:'';
const safeLink=(url,title)=>officialUrl(url)?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`:'';
const getPassportName=code=>nameOf(code);
function snapshot(code){return read('va.v2.passport.'+code,null)}
function baseline(code){
 if(S.passport===code)return {status:'held',stay:T('本国公民'),mode:T('本国护照'),conditions:T('无需签证返回本国。')};
 const online=S.online?.rows?.[code];
 if(online){
   const b=S.passport==='CN'?S.china[code]:null;
   if(online.status==='unknown' && b && b.status!=='unknown')return {...b,verified:'2026-10-14',online:false,note:[b.note,'在线数据尚未匹配此规则；此处暂用离线基线，出行前请核验最新官方要求。'].filter(Boolean).join(' ')};
   const stay=online.days?T('最长 {n} 天',{n:online.days}):(b?.status===online.status?b.stay:T('按官方规定'));
   return {status:online.status,stay,mode:lab(online.status),conditions:b?.status===online.status?b.conditions:T('短期访问规则由第三方整理；出行前请核对来源政府发布的最新文件。'),note:T('护照基础规则来自在线公开数据集；来源强度可能是“政策级”，而非逐条独立核验。'),source:online.source||'',verified:online.verified||'',level:online.level||'',online:true};
 }
 if(S.passport==='CN'){
   const b=S.china[code];
   if(!b)return {status:'unknown',stay:'—',mode:T('尚未覆盖'),conditions:T('请查阅目的地官方政策。')};
   const x={...b,verified:'2026-10-14',online:false,note:[b.note,'离线基础表核对时间为2026-10-14，可能不是最新政策。'].filter(Boolean).join(' ')};
   if(code==='KH'){x.status='arrival';x.mode='落地签（先前临时免签已经结束）';x.stay='通常30天';}
   if(code==='BR'&&today()>'2026-12-31'){x.status='unknown';x.mode='临时免签到期后政策待核对';}
   return x;
 }
 return {status:'unknown',stay:'—',mode:T('首次使用请联网同步'),conditions:T('未取得该护照的政策数据；不要将未知视为免签。')};
}
function ruleOf(code){
 const base=baseline(code);
 if(code===S.passport)return base;
 if(S.visas.some(v=>(v.issuer===code&&v.type!=='A'&&!(schengen.has(code)&&v.type==='C-LTV'&&v.issuer!==code)) || (schengen.has(code)&&visaSchengenAllowed(v)&&schengenEntry(v)&&!schengenTerritorial(v)))){
   return {...base,status:'conditional',mode:T('已登记目的地签证（类别待核验）'),stay:T('实际停留以签证和口岸许可为准'),conditions:T('App 不记录签证有效期和入境次数，因此无法确定签证当前是否有效、是否已使用或可以入境。'),note:T('此颜色只代表已登记相关签证，不代表有效或必然获准入境。')};
 }
 if(S.passport==='CN' && !['free','arrival','eta','limited'].includes(base.status)){
   const entries=S.exemptions.filter(x=>x.destination===code&&x.passport===S.passport);
   for(const entry of entries){
     const match=P.matchExemption(entry,S.visas,S.visaTypes);
     if(!match)continue;
     return {...base,status:'conditional',stay:entry.stay||base.stay,mode:T('凭 {issuer} {visa} 签证可能获豁免',{issuer:nameOf(match.visa.issuer),visa:I.visaLabel(match.visa,S.visaTypes)}),conditions:[entry.conditions,...match.checks].filter(Boolean).join('；'),note:T('第三国签证替代待遇属于有条件规则，App 未检验签证有效期、入境次数或历史使用记录。'),source:entry.source||base.source,verified:entry.verified||base.verified};
   }
 }
 return base;
}
function updateHeader(){
 $('quick-flag').textContent=flag(S.passport);$('quick-passport-name').textContent=getPassportName(S.passport);
 $('passport-flag').textContent=flag(S.passport);$('passport-select').innerHTML=`${flag(S.passport)} ${esc(nameOf(S.passport))}<span aria-hidden="true">⌄</span>`;
 $('count-visa').textContent=S.visas.length;
 const rules=Object.keys(S.meta).filter(c=>c!==S.passport).map(c=>ruleOf(c));
 $('count-accessible').textContent=rules.filter(x=>available.has(x.status)).length;
 $('count-destinations').textContent=rules.filter(x=>x.status!=='unknown').length;
 $('visa-subtitle').textContent=T('已登记 {n} 张签证 · 无需填写有效期',{n:S.visas.length});
 const stamp=S.online?.updatedAt;
 $('data-asof').textContent=stamp?T('已同步：{date}',{date:stamp.slice(0,10)}):(S.passport==='CN'?T('本地基线：2026-10-14'):T('未同步'));
 const last=read('va.v2.lastsync.'+S.passport,null);
 $('last-sync-label').textContent=last?isoTime(last):T('未同步');
 $('rules-notice').textContent=S.online?T('线上数据更新时间：{date}；最近同步：{sync}。来源可能晚于官方公告，持签便利仍待核验。',{date:S.online.datasetDate||'—',sync:stamp?.slice(0,10)||'—'}):T('离线基线或数据缺失。请在签证页同步政策；灰色不是必然要签证，紫色也不代表保证入境。');
 $('data-source-note').textContent=T('TravelRequirements.info — Entry Requirements Dataset（CC BY 4.0，AXG Sp. z o.o.）+ 官方链接；参考汇率：Frankfurter（日更参考中间价，非实时银行成交价）。');
}
function paintMap(){
 if(!S.world)return;
 $('map-layer').innerHTML=S.world.features.map(f=>{const r=ruleOf(f.id);return `<path class="land status-${r.status}${S.selected===f.id?' selected':''}" data-code="${esc(f.id)}" d="${f.path}" fill-rule="evenodd" tabindex="0" role="button" aria-label="${esc(nameOf(f.id))}：${esc(lab(r.status))}"><title>${esc(nameOf(f.id))} · ${esc(lab(r.status))}</title></path>`}).join('');
 $('map-dots').innerHTML=S.world.dots.map(d=>`<circle class="map-dot status-${ruleOf(d.id).status}" data-code="${esc(d.id)}" cx="${d.x}" cy="${d.y}" r="3" role="button" tabindex="0" aria-label="${esc(nameOf(d.id))}"/>`).join('');
}
function renderVisaList(){
 if(!S.visas.length){$('visa-list').innerHTML=`<div class="empty-state"><div class="empty-state__icon">🛂</div><h3>${esc(T('还没有添加签证'))}</h3><p>${esc(T('点击「添加签证」，按签发国家选择具体的签证类型。无需提供有效期。'))}</p></div>`;return}
 $('visa-list').innerHTML=S.visas.map(v=>`<article class="visa-card"><div class="visa-badge">${flag(v.issuer)}</div><div class="visa-card__text"><h3>${esc(T('{issuer}签证',{issuer:nameOf(v.issuer)}))}</h3><p>${esc(I.visaLabel(v,S.visaTypes))}</p><div class="visa-card__chips"><span class="tiny-chip other">${esc(T('类别已登记'))}</span><span class="tiny-chip expired">${esc(T('有效性未核验'))}</span></div></div><div class="card-actions"><button class="subtle-icon" data-edit="${esc(v.id)}" aria-label="${esc(T('编辑'))}">✎</button><button class="subtle-icon" data-delete="${esc(v.id)}" aria-label="${esc(T('删除'))}">✕</button></div></article>`).join('');
}
function renderChanges(){
 const changes=read('va.v2.changes.'+S.passport,[]);
 $('changes-list').innerHTML=changes.length?changes.slice(0,40).map(c=>`<div class="change-row"><span class="change-flag">${flag(c.code)}</span><span><strong>${esc(nameOf(c.code))}</strong><small>${esc(lab(c.before))} → ${esc(lab(c.after))}${c.oldDays!==c.newDays?' · '+esc(T('停留天数变化')):''}</small></span>${safeLink(c.source,T('来源 ↗'))}</div>`).join(''):`<p class="changes-empty">${esc(T('目前没有检测到与上一次同步不同的护照基础入境规则，或还没有第二次成功同步。'))}</p>`;
}
function render(){updateHeader();paintMap();renderVisaList();renderChanges();if(S.selected)showCountry(S.selected)}
function closeCountry(){S.countryToken++;S.selected=null;$('country-sheet').classList.remove('visible');$('country-sheet').setAttribute('aria-hidden','true');paintMap()}
function displayStay(raw){
 const s=String(raw||'');if(I.lang==='zh-CN')return s;
 if(['—',''].includes(s))return s||T('按官方规定');
 const tokens=s.match(/\d+\s*天/g)||[];
 if(!tokens.length)return T(s)||T('按官方规定');
 let v=s;
 if(I.lang==='en')v=v.replace(/(\d+)\s*天/g,'$1 days').replace(/通常最长/g,'Usually up to').replace(/最长/g,'Up to').replace(/通常/g,'Usually').replace(/每次/g,'per entry').replace(/入境/g,'entry').replace(/累计/g,'total').replace(/个月/g,'months').replace(/年/g,'years').replace(/\s*；\s*/g,'; ');
 else if(I.lang==='zh-HK')v=v.replace(/天/g,'日').replace(/最长/g,'最長').replace(/通常/g,'一般').replace(/每次/g,'每次').replace(/累计/g,'累計').replace(/个月/g,'個月').replace(/年/g,'年').replace(/；/g,'；');
 else v=v.replace(/最长/g,'最長').replace(/累计/g,'累計').replace(/个月/g,'個月');
 return v;
}
function localPolicySummary(r){
 if(I.lang==='zh-CN')return r.conditions||T('请查阅目的地官方政策。');
 if(r.status==='held')return T('无需签证返回本国。');
 if(r.status==='conditional')return T('App 不记录签证有效期和入境次数，因此无法确定签证当前是否有效、是否已使用或可以入境。');
 if(r.status==='free')return T('免签政策可能要求返程机票、住宿及资金证明；请核对官方原始条件。');
 if(r.status==='arrival')return T('落地签可能限制入境口岸、材料及费用；请核对官方原始条件。');
 if(r.status==='eta')return T('须在旅行前获得电子旅行授权，并核对批准条件。');
 if(r.status==='limited')return T('该规则仅适用于目的地特定区域或入境路线，请核对官方原始条件。');
 return T('短期访问规则由第三方整理；出行前请核对来源政府发布的最新文件。');
}
function showCountry(code){
 S.selected=code;const token=++S.countryToken,r=ruleOf(code),m=S.meta[code]||{};
 $('country-continent').textContent=T(m.continent)||T('目的地');$('country-name').textContent=flag(code)+'  '+nameOf(code);$('country-en').textContent=m.en||code;
 $('country-status').className='status-pill status-'+r.status;$('country-status').textContent=lab(r.status);
 $('country-days').textContent=displayStay(r.stay);$('country-mode').textContent=I.lang==='zh-CN'?(r.mode||T('短期访问')):(r.status==='conditional'?T('凭所持签证·条件性便利'):lab(r.status));
 $('country-conditions').textContent=localPolicySummary(r);
 $('country-note').textContent=[I.lang==='zh-CN'?r.note:T('请核对官方原始条件。'),r.verified?T('参考来源核验：{date}',{date:r.verified}):''].filter(Boolean).join(' ');
 const raw=[r.mode,r.conditions,r.note].filter(Boolean).join('；');$('country-original').hidden=I.lang==='zh-CN'||!raw;$('country-original-text').textContent=raw;
 const a=$('country-source');a.style.display=officialUrl(r.source)?'inline-block':'none';if(officialUrl(r.source))a.href=r.source;else a.removeAttribute('href');
 $('country-sheet').classList.add('visible');$('country-sheet').setAttribute('aria-hidden','false');
 const container=$('arrival-fee');container.hidden=r.status!=='arrival';
 if(r.status==='arrival'){$('arrival-fee-list').innerHTML='<p>'+esc(T('正在获取与该护照匹配的官方落地签收费记录…'))+'</p>';$('fee-update-note').textContent=T('金额按官方收费币种展示，人民币为参考换算。');loadArrivalFee(code,token,false)}
 paintMap();
}
async function getJson(url,timeout=12000){const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:ctl.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}}
function slugOf(code){
 const item=S.manifest?.destinations?.find(x=>x.iso2===code);if(item?.url){const u=String(item.url);if(u.startsWith('https://travelrequirements.info/data/destinations/'))return '/policy-api/destinations/'+u.split('/').pop();return u;}
 const en=(S.meta[code]?.en||'').toLowerCase();const manual={CI:'cote-divoire',CD:'democratic-republic-of-the-congo',CG:'republic-of-the-congo',TL:'timor-leste',KR:'south-korea',KP:'north-korea',TZ:'tanzania',RU:'russia',US:'united-states',GB:'united-kingdom',CZ:'czechia',VA:'vatican-city',SZ:'eswatini'};
 return RAW+(manual[code]||en.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))+'.json';
}
async function fetchDestination(code,force=false){
 const cache=S.details[code]||read('va.v2.destination.'+code,null);
 if(cache&&!force){S.details[code]=cache;return cache}
 const url=slugOf(code);
 const fallback=cache||null;
 try{
   let obj;
   try{obj=await getJson(url)}catch(err){
     // Prefer mirrored open dataset when direct host is unavailable.
     if(url.startsWith('/policy-api/destinations/')||url.startsWith('https://travelrequirements.info/')){
       const slug=url.split('/').pop();obj=await getJson(RAW+slug);
     }else throw err;
   }
   if(obj.iso2!==code||!Array.isArray(obj.visaTypes))throw Error('国家费用数据结构有误');
   const snapshot={data:obj,at:new Date().toISOString()};S.details[code]=snapshot;
   // Cache only this inspected destination; browsers normally have a ~5 MB localStorage quota.
   try{save('va.v2.destination.'+code,snapshot)}catch{}
   return snapshot;
 }catch(err){if(fallback)return {...fallback,offline:true};throw err}
}
async function getFx(base,quote,force=false){
 base=Fees.currency(base);quote=Fees.currency(quote);
 if(base===quote)return{rate:1,date:today(),receivedAt:new Date().toISOString(),identity:true};
 const key=base+'_'+quote,old=S.fx[key];
 if(!force&&old&&Date.now()-Date.parse(old.receivedAt)<15*60*1000)return {...old,cached:true};
 try{
   let obj,lastError;
   for(const prefix of [FXBASE,DIRECT_FXBASE]){
     try{obj=await getJson(prefix+base.toLowerCase()+'/'+quote.toLowerCase(),11000);break}
     catch(error){lastError=error}
   }
   if(!obj)throw lastError||Error('汇率数据源不可达');
   const rate=Fees.normalizeRate(obj,base,quote);S.fx[key]=rate;save('va.v2.fx',S.fx);return rate;
 }catch(e){if(old)return{...old,cached:true,offline:true};throw e}
}
function fmt(rate){return rate.identity?T('原币金额'):T('汇率日期 {date}',{date:rate.date})+(rate.offline?T('（离线缓存）'):rate.cached?T('（近期缓存）'):T('（联网读取）'))}
async function loadArrivalFee(code,token,force){
 if(token!==S.countryToken||S.selected!==code)return;
 if(force){$('arrival-fee-list').innerHTML='<p>'+esc(T('正在刷新费用与最新可用汇率…'))+'</p>'}
 try{
   const snapshot=await fetchDestination(code,force),entries=Fees.extractArrivalFees(snapshot.data,S.passport);
   if(token!==S.countryToken||S.selected!==code)return;
   if(!entries.length){$('arrival-fee-list').innerHTML='<p>'+esc(T('当前未找到与所选护照明确对应的官方落地签收费金额。请以目的地移民局公告为准。'))+'</p>';$('fee-update-note').textContent=T('没有可靠的收费记录时不自动估价。');return}
   const cards=await Promise.all(entries.map(async entry=>{
     const target=[entry.currency!==entry.localCurrency&&entry.localCurrency?entry.localCurrency:null,'CNY'];
     const quotes=await Promise.all(target.map(async quote=>quote?getFx(entry.currency,quote,force).catch(()=>null):null));
     return{...entry,local:quotes[0],cny:quotes[1]};
   }));
   if(token!==S.countryToken||S.selected!==code)return;
   $('arrival-fee-list').innerHTML=cards.map(c=>{
     const local=c.local?`<div class="fee-entry__currency">${esc(T('当地货币参考：'))}${esc(Fees.formatConverted(c.amount,c.local.rate,c.localCurrency))}</div>`:'';
     const unknown=c.localCurrency&&c.localCurrency!==c.currency&&!c.local?`<div class="fee-entry__small">${esc(T('当地货币暂时无法换算'))}</div>`:'';
     const cny=c.currency==='CNY'?`<div class="fee-entry__cny">${esc(T('人民币：'))}${esc(Fees.renminbi(c.amount))}</div>`:c.cny?`<div class="fee-entry__cny">${esc(T('人民币参考：'))}≈ ${esc(Fees.renminbi(c.amount*c.cny.rate))}</div>`:`<div class="fee-entry__cny">${esc(T('人民币参考价暂不可用'))}</div>`;
     const rates=[c.local,c.cny].filter(Boolean).map(fmt).filter(x=>x!=='原币金额');
     return `<article class="fee-entry"><h4>${esc(c.name)}${c.days?' · '+c.days+' '+T('天'):''}</h4><div class="fee-entry__official">${esc(T('官方收费：'))}${c.gratis?esc(T('免费（该护照专属）')):esc(Fees.amountText(c.amount,c.currency))}</div>${local}${unknown}${cny}<div class="fee-entry__small">${esc(rates.join('; ')||T('未取得汇率'))} · ${esc(T('收费记录核验'))} ${esc(c.verified||T('日期未标明'))}${snapshot.offline?' · '+esc(T('费用为离线缓存')):''}</div>${c.notes?`<div class="fee-entry__small">${esc(c.notes)}</div>`:''}${safeLink(c.source,T('核对收费的官方来源 ↗'))}</article>`;
   }).join('');
   $('fee-update-note').textContent=T('官方收费币种不一定等于当地货币。当地货币与人民币均为参考换算；参考汇率一般每日更新，可能与现金兑换、银行卡或口岸实际收费不同。不含手续费。');
 }catch(err){
   if(token!==S.countryToken||S.selected!==code)return;
   $('arrival-fee-list').innerHTML='<p>'+esc(T('暂时无法在线取得该国官方收费数据；没有可用缓存。请联网重试，或查看移民局官方收费页。'))+'</p>';
   $('fee-update-note').textContent=T('未查询到金额时不会猜测或显示虚假的人民币价格。');
   console.warn('Arrival visa fee unavailable:',err);
 }
}
function navigate(tab){S.currentTab=tab;closeCountry();closeModal();$('map-screen').classList.toggle('screen--active',tab==='map');$('visa-screen').classList.toggle('screen--active',tab==='visas');$('tab-map').classList.toggle('active',tab==='map');$('tab-visas').classList.toggle('active',tab==='visas');$('tab-map').setAttribute('aria-current',tab==='map'?'page':'false');$('tab-visas').setAttribute('aria-current',tab==='visas'?'page':'false');window.scrollTo({top:0,behavior:'instant'})}
function closeModal(){closePicker();S.modal=null;['search-modal','visa-modal','about-modal','overlay'].forEach(id=>{$(id).classList.remove('visible');$(id).setAttribute('aria-hidden','true')})}
function openModal(type){closeCountry();closeModal();S.modal=type;const id=type==='search'?'search-modal':type==='about'?'about-modal':'visa-modal';$(id).classList.add('visible');$(id).setAttribute('aria-hidden','false');$('overlay').classList.add('visible');$('overlay').setAttribute('aria-hidden','false');if(type==='search'){$('country-search').value='';updateSearchResults();$('country-search').focus()}if(type==='about')renderAbout();}
function updateSearchResults(){
 const q=$('country-search').value.trim();
 const candidates=Object.keys(S.meta);
 // Show all destinations when browsing without a query, not just the first 100.
 const matches=NS.ranked(q,candidates,S.meta,S.names,candidates.length);
 $('search-results').innerHTML=matches.map(code=>`<button class="search-row" type="button" data-country="${esc(code)}"><span>${flag(code)}</span><span><strong>${esc(nameOf(code))}</strong><small>${esc(enOf(code))}${tradOf(code)!==nameOf(code)?' · '+esc(tradOf(code)):''}</small></span><span class="search-pill">${esc(lab(ruleOf(code).status))}</span></button>`).join('')||`<p class="hint-card">${esc(T('没有匹配的目的地，请尝试英语、简体或繁体中文。'))}</p>`;
}
function pickerOption(code){
 const local=nameOf(code),trad=tradOf(code),eng=enOf(code);
 return `<button type="button" class="picker-row" role="option" data-pick="${esc(code)}" aria-selected="${code===(S.pickerTarget==='passport'?S.passport:S.visaIssuer)}"><span class="picker-row__flag">${flag(code)}</span><span class="picker-row__names"><strong>${esc(local)}</strong><small>${esc(eng)}${trad!==local?' · '+esc(trad):''}</small></span>${code===(S.pickerTarget==='passport'?S.passport:S.visaIssuer)?'<span class="picker-row__mark">✓</span>':''}</button>`;
}
function pickerCandidates(){return S.pickerTarget==='issuer'?['SCHENGEN',...S.options.map(x=>x.code)]:S.options.map(x=>x.code)}
function renderPicker(){
 const q=$('picker-search').value.trim(),codes=pickerCandidates(),alias={...S.names,SCHENGEN:{zhHans:'申根区',zhHant:'申根區',en:'Schengen Area',aliases:['申根签证','申根簽證','Schengen Visa']}};
 // Display the complete list (250 countries/territories); the old 90-item cap ended at Guam.
 const matches=NS.ranked(q,codes,S.meta,alias,codes.length);
 $('picker-results-count').textContent=q?T('匹配 {n} 项',{n:matches.length}):T('共 {n} 个可选国家/地区 · 可输入搜索',{n:codes.length});
 $('picker-results').innerHTML=matches.map(pickerOption).join('')||`<p class="hint-card">${esc(T('没有匹配项，请检查名称或试用 ISO 两位代码。'))}</p>`;
 $('picker-results').scrollTop=0;
}
function openPicker(target){
 S.pickerTarget=target;$('picker-title').textContent=T(target==='passport'?'选择护照国家 / 地区':'选择签证签发国家 / 地区');
 $('picker-search').value='';renderPicker();$('picker-backdrop').classList.add('visible');$('country-picker-modal').classList.add('visible');$('country-picker-modal').setAttribute('aria-hidden','false');
 requestAnimationFrame(()=>$('picker-search').focus());
}
function closePicker(){S.pickerTarget=null;$('picker-backdrop').classList.remove('visible');$('country-picker-modal').classList.remove('visible');$('country-picker-modal').setAttribute('aria-hidden','true')}
function choosePicker(code){
 const target=S.pickerTarget;if(!target)return;
 closePicker();
 if(target==='passport'){
   if(code!==S.passport){S.passport=code;save('va.passport',code);S.online=snapshot(code);render();syncPolicy(false)}
 }else{
   S.visaIssuer=code;
   $('visa-issuer').innerHTML=`${flag(code)} ${esc(nameOf(code))} · ${esc(enOf(code))}<span aria-hidden="true">⌄</span>`;
   populateVisaType(code,null);
   maybeLoadOfficialTypes(code);
 }
}
function visaTypeKey(input){return String(input||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function knownVisaCode(t){
  const id=String(t.id||'').toUpperCase();
  const name=String(t.name||'').toUpperCase();
  const prefixes=[name, id.replace(/-/g,'/')];
  for(const v of prefixes){
    const m=v.match(/\b([A-Z]{1,3}[- ]?\d{1,3}(?:\s*[/\-]\s*(?:[A-Z]{1,3}[- ]?)?\d{1,3})?)\b/);
    if(m)return visaTypeKey(m[1]);
  }
  return visaTypeKey(id);
}
function categoryForOnlineVisa(t){const c=String(t.category||'').toLowerCase();return ({tourist:'visitor',visitor:'visitor',business:'business',student:'student',work:'work',employment:'work',transit:'transit',medical:'medical',family:'dependent',resident:'resident',residence:'resident',religious:'exchange',diplomatic:'official',exchange:'exchange'})[c]||'unclassified'}
async function maybeLoadOfficialTypes(issuer){
 const token=++S.typeToken, note=$('type-fetch-note');
 if(issuer==='SCHENGEN') {note.textContent=T('申根 A / C / D 类由申根区成员国共同适用的类型框架；D 为国家长期签证。');return;}
 if(!S.meta[issuer]) {note.textContent=T('此签发地暂不在政策数据集目的地列表中，可选常见用途或按签证原文填写。');return;}
 const base=S.visaTypes?.issuers?.[issuer];
 note.className='type-fetch-note';note.textContent=T(base?.verified?'可联网核对该国其他已记录签证类别…':'正在尝试补充该国家已公布的签证种类…');
 try{
  const snap=await fetchDestination(issuer,false);
  if(token!==S.typeToken||S.visaIssuer!==issuer)return;
  const rows=(snap.data.visaTypes||[]).filter(t=>t?.id&&t?.name&&t?.source?.url);
  if(rows.length){
    const cfg=base||{types:[]};
    const types=cfg.types.filter(t=>t[0]!=='CUSTOM'&&!String(t[0]).startsWith('DATA:'));
    const known=new Set(types.map(t=>visaTypeKey(t[0])));
    const knownLabels=new Set(types.map(t=>visaTypeKey(t[1])));
    for(const t of rows){
      const code=knownVisaCode(t), id=visaTypeKey(t.id), name=visaTypeKey(t.name);
      // Prefer our locale-aware official class if remote source describes the same visa.
      if(known.has(code)||known.has(id)||knownLabels.has(name))continue;
      const row=['DATA:'+String(t.id),String(t.name),categoryForOnlineVisa(t)];
      types.push(row);known.add(code);known.add(id);knownLabels.add(name);
    }
    types.push(['CUSTOM','输入签证原文中的类别 / 代码','unclassified']);
    const current=$('visa-type').value;
    S.visaTypes.issuers[issuer]={...cfg,types,onlineTypes:rows.length,onlineSource:snap.data.meta?.primarySources?.[0]?.url||'',onlineUpdated:snap.data.meta?.lastUpdated||''};
    populateVisaType(issuer,current);
    // Do not show internal 'updated N items' diagnostics to end users.
    note.textContent='';note.className='type-fetch-note';
  }else {note.textContent=T('在线数据源暂未收录该国的具体签证类别；仍可按用途选或输入原始签证代码。')}
 }catch(e){if(token===S.typeToken)note.textContent=T('无法联网获取该国签证分类，已显示本机选项；可手动输入签证原文。')}
}
function populateVisaType(issuer,selected){
 const cfg=S.visaTypes?.issuers?.[issuer];const opts=cfg?.types||[];
 const type=$('visa-type'),custom=type.value;
 type.innerHTML=opts.map(x=>`<option value="${esc(x[0])}">${esc(I.visaTypeLabel(x))}</option>`).join('');
 const chosen=selected===null?(opts[0]?.[0]||'CUSTOM'):selected;
 type.value=opts.some(x=>x[0]===chosen)?chosen:'CUSTOM';
 $('type-source-note').innerHTML=cfg?`${esc(nameOf(issuer))} · ${esc(T(cfg.verified?'已配置的签证类别（可能非完整目录）':'以下为常见签证用途，并非该国官方类别代码'))}。${safeLink(cfg.source,T('分类参考 ↗'))}`:T('请填写签证上的原始类别名称。');
 toggleCustomType();
}
function toggleCustomType(){const custom=$('visa-type').value==='CUSTOM';$('custom-type-field').hidden=!custom;$('visa-custom-type').required=custom}
function openVisaForm(id=null){S.editId=id;const v=S.visas.find(x=>x.id===id)||{issuer:'US',type:'B1/B2',customType:''};S.visaIssuer=v.issuer;$('visa-modal-title').textContent=T(id?'编辑签证':'添加签证');$('visa-issuer').innerHTML=`${flag(v.issuer)} ${esc(nameOf(v.issuer))} · ${esc(enOf(v.issuer))}<span aria-hidden="true">⌄</span>`;$('visa-custom-type').value=v.customType||'';populateVisaType(v.issuer,v.type);$('type-fetch-note').textContent='';openModal('visa');maybeLoadOfficialTypes(v.issuer)}
function visaChange(ev){ev.preventDefault();const issuer=S.visaIssuer,type=$('visa-type').value,customType=$('visa-custom-type').value.trim();if(type==='CUSTOM'&&!customType){window.alert(T('请填写签证原始类别'));return}const v={id:S.editId||'v'+Date.now()+'-'+Math.random().toString(36).slice(2,7),issuer,type,customType:type==='CUSTOM'?customType:''};if(S.editId)S.visas=S.visas.map(x=>x.id===S.editId?v:x);else S.visas.push(v);save('va.v2.visas',S.visas);closeModal();render()}
function setView(x,y,w,h){w=Math.max(150,Math.min(1000,w));h=w*.51;x=Math.max(0,Math.min(1000-w,x));y=Math.max(0,Math.min(510-h,y));S.view=[x,y,w,h];$('world-svg').setAttribute('viewBox',S.view.join(' '))}
function zoom(factor){const [x,y,w,h]=S.view,nw=w*factor;setView(x+(w-nw)/2,y+(h-nw*.51)/2,nw,nw*.51)}
function attachMapInteractions(){
 const svg=$('world-svg');let prev=0;
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?.8:1.25)},{passive:false});
 svg.addEventListener('pointerdown',e=>{S.panning.set(e.pointerId,{x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY});if(S.panning.size===2){const a=[...S.panning.values()];prev=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}});
 svg.addEventListener('pointermove',e=>{if(!S.panning.has(e.pointerId))return;const p=S.panning.get(e.pointerId),dx=e.clientX-p.lastX,dy=e.clientY-p.lastY;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>5){S.lastDrag=Date.now();try{svg.setPointerCapture(e.pointerId)}catch{}}p.lastX=e.clientX;p.lastY=e.clientY;if(S.panning.size>=2){const a=[...S.panning.values()],d=Math.hypot(a[0].lastX-a[1].lastX,a[0].lastY-a[1].lastY);if(prev>0&&d>2){zoom(prev/d);S.lastDrag=Date.now()}prev=d}else{const [,,w,h]=S.view,r=svg.getBoundingClientRect(),ratio=Math.min(r.width/w,r.height/h);if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>5)setView(S.view[0]-dx/ratio,S.view[1]-dy/ratio,w,h)}});
 const stop=e=>{S.panning.delete(e.pointerId);if(S.panning.size<2)prev=0};svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);
 svg.addEventListener('click',e=>{if(Date.now()-S.lastDrag<280)return;const n=e.target.closest('[data-code]');if(n)showCountry(n.dataset.code)});
 svg.addEventListener('keydown',e=>{const n=e.target.closest('[data-code]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();showCountry(n.dataset.code)}});
 $('zoom-in').addEventListener('click',()=>zoom(.7));$('zoom-out').addEventListener('click',()=>zoom(1.45));$('zoom-reset').addEventListener('click',()=>setView(0,0,1000,510));
}
async function syncManifest(){
 for(const url of [MANIFEST,DIRECT_MANIFEST]){
   try{
     const m=await getJson(url,14000);
     if(!m||!Array.isArray(m.destinations)||m.destinations.length<150)throw Error('Policy manifest incomplete');
     S.manifest=m;save('va.v2.manifest',m);return m;
   }catch(e){console.warn('Manifest source failed:',url,e)}
 }
 return S.manifest;
}
async function loadMatrix(){
 const errors=[];
 for(const url of [MATRIX,DIRECT_MATRIX]){
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),30000);
   try{
     $('sync-progress').textContent=T(url===MATRIX?'同步中（本站中转）…':'同步中（直连备用源）…');
     const resp=await fetch(url,{cache:'no-store',signal:ctl.signal});
     if(!resp.ok)throw Error('HTTP '+resp.status);
     const contentType=resp.headers.get('content-type')||'';
     if(contentType.includes('text/html'))throw Error('返回 HTML：请确认 Netlify 已部署 _redirects');
     const csv=await resp.text();
     if(csv.length<500000||csv.length>15000000)throw Error('下载的数据文件大小异常（'+csv.length+'字符）');
     return {csv,source:url};
   }catch(e){
     const message=e?.name==='AbortError'?'30秒超时':String(e?.message||e);
     errors.push((url===MATRIX?'本站中转':'备用直连')+'：'+message);
   }finally{clearTimeout(timer)}
 }
 throw Error(errors.join('；'));
}
async function syncPolicy(force=false){
 if(S.loading)return S.loading;
 const p=S.passport,last=read('va.v2.lastsync.'+p,null);
 if(!force&&last&&Date.now()-Date.parse(last)<24*3600000&&snapshot(p)){S.online=snapshot(p);render();return}
 $('sync-progress').textContent=T('同步中…');$('refresh-dataset').disabled=true;
 if($('sync-diagnostic'))$('sync-diagnostic').textContent=T('正在连接数据源；请保持页面打开。');
 const job=(async()=>{
 try{
   const [m,download]=await Promise.all([syncManifest(),loadMatrix()]);
   const rows=P.importMatrix(download.csv,p,150);
   const changes=P.diffRows(snapshot(p)?.rows||null,rows);
   const updatedAt=new Date().toISOString();
   const snap={rows,updatedAt,datasetDate:m?.dateModified||'未知',source:download.source};
   // Keep the latest successful result if the network goes down next time.
   if(S.passport===p)S.online=snap;
   save('va.v2.passport.'+p,snap);save('va.v2.changes.'+p,changes);save('va.v2.lastsync.'+p,updatedAt);
   $('sync-progress').textContent=T('✓ 已同步 {n} 条',{n:Object.keys(rows).length});
   if($('sync-diagnostic'))$('sync-diagnostic').textContent=T('成功：{source}；{date}。',{source:T(download.source===MATRIX?'Netlify 同站中转':'直接备用源'),date:I.date(updatedAt)});
 }catch(e){
   $('sync-progress').textContent=T('同步失败 · 使用缓存');
   if($('sync-diagnostic'))$('sync-diagnostic').textContent=T('同步失败原因：{why}。请检查网络，或稍后重试。',{why:String(e?.message||e).slice(0,350)});
   S.online=snapshot(S.passport);console.warn('Policy sync failed:',e);
 }finally{
   S.loading=null;$('refresh-dataset').disabled=false;
   if(S.passport!==p)S.online=snapshot(S.passport);
   render();
 }
 })();S.loading=job;return job;
}
function renderAbout(){
 const code=I.lang,langName={'zh-CN':'简体中文','zh-HK':'繁体中文（香港）','zh-TW':'繁体中文（台湾）','en':'English'};
 const look=window.BusVisaTheme?.mode||'system';const label={system:'跟随系统',light:'浅色模式',dark:'深色模式'}[look]||'跟随系统';
 $('about-language-summary').textContent=`${T(label)} · ${T(langName[code])} · v0.3.2`;
 window.BusVisaTheme?.refresh?.();
 $('about-language-options').querySelectorAll('[data-lang]').forEach(el=>{const on=el.dataset.lang===code;el.setAttribute('aria-checked',on?'true':'false');});
}
function setLanguage(lang){
 if(!I.setLang(lang))return;
 // Translate the static UI, then re-render all data-driven labels and form choices.
 I.apply(document);render();renderAbout();
 if(S.pickerTarget)renderPicker();
 if(S.modal==='search')updateSearchResults();
 if(S.modal==='visa'){
   const selected=$('visa-type').value;
   $('visa-modal-title').textContent=T(S.editId?'编辑签证':'添加签证');
   $('visa-issuer').innerHTML=`${flag(S.visaIssuer)} ${esc(nameOf(S.visaIssuer))} · ${esc(enOf(S.visaIssuer))}<span aria-hidden="true">⌄</span>`;
   populateVisaType(S.visaIssuer,selected);
 }
 $('language-saved').textContent=T('已保存到本机');
}
function attachUI(){
 $('tab-map').addEventListener('click',()=>navigate('map'));$('tab-visas').addEventListener('click',()=>navigate('visas'));
 $('quick-passport').addEventListener('click',()=>openPicker('passport'));$('quick-passport').addEventListener('keydown',e=>{if(e.key==='Enter')openPicker('passport')});
 $('passport-select').addEventListener('click',()=>openPicker('passport'));
 $('visa-issuer').addEventListener('click',()=>openPicker('issuer'));
 $('picker-search').addEventListener('input',renderPicker);
 $('picker-search').addEventListener('keydown',e=>{if(e.key==='Enter'){const first=$('picker-results').querySelector('[data-pick]');if(first){e.preventDefault();choosePicker(first.dataset.pick)}}});
 $('picker-results').addEventListener('click',e=>{const item=e.target.closest('[data-pick]');if(item)choosePicker(item.dataset.pick)});
 $('picker-backdrop').addEventListener('click',closePicker);$('picker-close').addEventListener('click',closePicker);
 $('search-toggle').addEventListener('click',()=>openModal('search'));$('search-close').addEventListener('click',closeModal);$('visa-close').addEventListener('click',closeModal);$('overlay').addEventListener('click',closeModal);$('country-close').addEventListener('click',closeCountry);
 $('country-search').addEventListener('input',updateSearchResults);$('search-results').addEventListener('click',e=>{const n=e.target.closest('[data-country]');if(n){const code=n.dataset.country;closeModal();navigate('map');showCountry(code)}});
 $('add-visa-button').addEventListener('click',()=>openVisaForm());$('visa-form').addEventListener('submit',visaChange);
 $('visa-type').addEventListener('change',toggleCustomType);
 $('visa-list').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit)openVisaForm(edit.dataset.edit);if(del&&confirm(T('确定删除这张签证吗？'))){S.visas=S.visas.filter(x=>x.id!==del.dataset.delete);save('va.v2.visas',S.visas);render()}});
 $('refresh-dataset').addEventListener('click',()=>syncPolicy(true));
 $('refresh-fee').addEventListener('click',()=>{if(S.selected)loadArrivalFee(S.selected,S.countryToken,true)});
 $('about-open').addEventListener('click',()=>openModal('about'));$('about-close').addEventListener('click',closeModal);$('about-return').addEventListener('click',closeModal);
 $('about-language-options').addEventListener('click',e=>{const b=e.target.closest('[data-lang]');if(b)setLanguage(b.dataset.lang)});
 window.addEventListener('busvisa:themechange',()=>{if($('about-language-summary')){const m=window.BusVisaTheme?.mode||'system';const name={system:'跟随系统',light:'浅色模式',dark:'深色模式'}[m];const ln={'zh-CN':'简体中文','zh-HK':'繁体中文（香港）','zh-TW':'繁体中文（台湾）','en':'English'}[I.lang];$('about-language-summary').textContent=`${T(name)} · ${T(ln)} · v0.3.2`;}});
 window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(S.pickerTarget)closePicker();else {closeCountry();closeModal()}}});
}
async function init(){
 try{
   const p=async path=>{const r=await fetch(path);if(!r.ok)throw Error(path+': '+r.status);return r.json()};
   const [china,world,meta,options,types,exemptions,localNames]=await Promise.all([
     p('./data/china-rules.json'),p('./data/world-paths.json'),p('./data/country-meta.json'),p('./data/passport-options.json'),p('./data/visa-types.json'),p('./data/third-country-exemptions.json'),p('./data/country-names.json')
   ]);
   S.china=china.countries;S.world=world;S.meta={...meta,CN:{zh:'中国大陆',en:'China',continent:'亚洲'}};S.options=options;S.visaTypes=types;S.exemptions=exemptions.rules;S.names=localNames.countries||{};
   attachUI();attachMapInteractions();I.apply(document);render();renderAbout();
   // The UI works without network. Sync is best effort and never removes cached rules after a failed request.
   syncPolicy(false);
 }catch(err){console.error(err);$('rules-notice').textContent=T('地图资源加载失败。请通过本地 HTTP 服务或 HTTPS 网站打开，而不是直接双击 HTML。')}
}
// Do not initialize the map or synchronize policy data before the invitation gate has been unlocked.
if (window.BusVisaInvite?.isUnlocked()) init();
else window.addEventListener('busvisa:unlocked', () => init(), {once: true});
})();
