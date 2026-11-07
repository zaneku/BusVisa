/* BusVisa name search: supports English, Simplified & Traditional Chinese with known aliases. */
(function(root,factory){const a=factory();if(typeof module!=='undefined'&&module.exports)module.exports=a;if(root)root.BusVisaSearch=a})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s\-_.·—']/g,'');
 function terms(code, meta, aliases){const n=aliases?.[code]||{},m=meta?.[code]||{};return [...new Set([code,n.zhHans,n.zhHant,n.en,m.zh,m.en,...(n.aliases||[])].filter(Boolean).map(norm))]}
 function ranked(query,items,meta,aliases,limit=items.length){const q=norm(query);if(!q)return items.slice(0,limit);return items.map(code=>{
 const ts=terms(code,meta,aliases);let score=100;
 for(const t of ts){if(t===q)score=Math.min(score,0);else if(t.startsWith(q))score=Math.min(score,1);else if(t.includes(q))score=Math.min(score,2)}
 return {code,score}
 }).filter(x=>x.score<100).sort((a,b)=>a.score-b.score||a.code.localeCompare(b.code)).slice(0,limit).map(x=>x.code)}
 return{norm,terms,ranked};
});
