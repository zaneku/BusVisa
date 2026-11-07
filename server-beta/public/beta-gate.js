/* BusVisa invitation-only beta UI: local-only convenience gate, not server-side security. */
(() => {
'use strict';
try{localStorage.removeItem('busvisa.beta.access.v1')}catch{}
if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(items=>Promise.all(items.map(x=>x.unregister()))).catch(()=>{})}
if('caches' in window){caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('busvisa-')).map(x=>caches.delete(x)))).catch(()=>{})}

const I18N = {"zh-CN":{"label":"PRIVATE BETA","chip":"邀请制内测","title":"输入邀请码，开启旅行地图","desc":"BusVisa 目前仅向受邀用户开放。请输入邀请码以进入地图和签证功能。","field":"邀请码","placeholder":"请输入邀请码","show":"显示","hide":"隐藏","enter":"验证并进入","pending":"正在验证…","invalid":"邀请码不正确，请重新输入。","error":"验证服务暂不可用，请稍后重试。","hint":"验证后此浏览器最多保持登录 7 天，邀请码到期或停用时资格结束。","footer":"仅供受邀用户测试 · Ku","langLabel":"选择语言"},"zh-HK":{"label":"PRIVATE BETA","chip":"邀請制內測","title":"輸入邀請碼，開啟旅行地圖","desc":"BusVisa 目前只向受邀用戶開放。請輸入邀請碼，以使用地圖及簽證功能。","field":"邀請碼","placeholder":"請輸入邀請碼","show":"顯示","hide":"隱藏","enter":"驗證並進入","pending":"正在驗證…","invalid":"邀請碼不正確，請再試一次。","error":"暫時無法驗證，請透過 HTTPS 網站重新開啟。","hint":"驗證後此瀏覽器最多維持登入 7 天，邀請碼到期或停用時資格結束。","footer":"只供受邀用戶測試 · Ku","langLabel":"選擇語言"},"zh-TW":{"label":"PRIVATE BETA","chip":"邀請制封閉測試","title":"輸入邀請碼，開啟旅行地圖","desc":"BusVisa 目前僅開放受邀使用者。請輸入邀請碼，即可使用地圖及簽證功能。","field":"邀請碼","placeholder":"請輸入邀請碼","show":"顯示","hide":"隱藏","enter":"驗證並進入","pending":"驗證中…","invalid":"邀請碼錯誤，請重新輸入。","error":"目前無法驗證，請透過 HTTPS 網站重新開啟。","hint":"驗證後此瀏覽器最多維持登入 7 天，邀請碼到期或停用時資格結束。","footer":"僅供受邀使用者測試 · Ku","langLabel":"選擇語言"},"en":{"label":"PRIVATE BETA","chip":"INVITATION ONLY","title":"Your travel map starts here.","desc":"BusVisa is currently in private beta. Enter your invitation code to explore the map and manage visas.","field":"Invitation code","placeholder":"Enter invitation code","show":"Show","hide":"Hide","enter":"Verify & continue","pending":"Checking…","invalid":"That invitation code is incorrect. Please try again.","error":"Verification is temporarily unavailable. Please try again later.","hint":"This browser stays signed in for up to 7 days, until your invitation expires or is disabled.","footer":"Invitation-only beta · Ku","langLabel":"Choose language"}};
const $ = (id) => document.getElementById(id);
const els = { gate:$('beta-gate'), form:$('beta-form'), input:$('beta-code'), msg:$('beta-error'), submit:$('beta-submit'), show:$('beta-show'), lang:$('beta-language') };
const getSavedLang=()=>{try{const x=JSON.parse(localStorage.getItem('va.language'));if(I18N[x])return x}catch{};return null};
const browserLang=()=>{for(const x of navigator.languages||[navigator.language]){const y=String(x||'').toLowerCase();if(y.startsWith('zh-hk')||y.startsWith('zh-mo'))return 'zh-HK';if(y.startsWith('zh-tw'))return 'zh-TW';if(y.startsWith('en'))return 'en';if(y.startsWith('zh'))return 'zh-CN'}return 'zh-CN'};
let lang=getSavedLang()||browserLang();
let attemptId=null;
try{const saved=sessionStorage.getItem('busvisa.beta.attempt');if(/^[a-f0-9]{64}$/.test(saved||''))attemptId=saved}catch{}
function translated(){return I18N[lang]||I18N['zh-CN']}
function apply(){const t=translated();const fields={'beta-label':'label','beta-chip':'chip','beta-title':'title','beta-desc':'desc','beta-input-label':'field','beta-hint':'hint','beta-footer-text':'footer','beta-lang-label':'langLabel'};
  for(const [id,k] of Object.entries(fields))$(id).textContent=t[k];
  els.input.placeholder=t.placeholder;els.show.textContent=els.input.type==='password'?t.show:t.hide;
  els.show.setAttribute('aria-label',els.input.type==='password'?t.show:t.hide);
  els.submit.firstChild.textContent=t.enter+' ';
  els.lang.value=lang;els.msg.textContent='';
}
if(!els.form || !els.input)return;
apply();
els.lang.addEventListener('change',()=>{lang=els.lang.value;try{localStorage.setItem('va.language',JSON.stringify(lang))}catch{};window.BusVisaI18n?.setLang?.(lang);apply()});
els.input.addEventListener('input',()=>{els.msg.textContent='';els.input.removeAttribute('aria-invalid')});
els.show.addEventListener('click',()=>{els.input.type=els.input.type==='password'?'text':'password';const t=translated();els.show.textContent=els.input.type==='password'?t.show:t.hide;els.show.setAttribute('aria-label',els.input.type==='password'?t.show:t.hide)});
els.form.addEventListener('submit',async (event)=>{
 event.preventDefault();if(els.submit.disabled)return;
 els.submit.disabled=true;els.submit.firstChild.textContent=translated().pending+' ';
 try{
   if(!attemptId)attemptId=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
   try{sessionStorage.setItem('busvisa.beta.attempt',attemptId)}catch{}
   const response=await fetch('/api/invite/redeem',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:els.input.value.trim(),attemptId})});
   if(response.ok){els.input.value='';location.replace('/')}
   else if(response.status===401){els.msg.textContent=translated().invalid;els.input.setAttribute('aria-invalid','true');els.input.select()}
   else if(response.status===429){els.msg.textContent=lang==='en'?'Too many attempts. Try again in 15 minutes.':'尝试次数过多，请在 15 分钟后重试。'}
   else {els.msg.textContent=translated().error}

 }catch(err){els.msg.textContent=translated().error}
 finally{els.submit.disabled=false;els.submit.firstChild.textContent=translated().enter+' '}
});
})();
