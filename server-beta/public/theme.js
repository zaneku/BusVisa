/* BusVisa settings: system / light / dark appearance, device-local preference. */
(()=>{
 'use strict';
 const KEY='busvisa.theme.v1';
 const MODES=['system','light','dark'];
 const root=document.documentElement;
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 let mode='system';
 try{const saved=localStorage.getItem(KEY);if(MODES.includes(saved))mode=saved;}catch{}
 const result=()=>mode==='system'?(media.matches?'dark':'light'):mode;
 function refresh(){
  const effective=result();root.dataset.theme=effective;root.style.colorScheme=effective;
  const themeMeta=document.querySelector('meta[name="theme-color"]');
  if(themeMeta)themeMeta.setAttribute('content',effective==='dark'?'#0e1828':'#f5f8fc');
  document.querySelectorAll('[data-theme-choice]').forEach(b=>{
   b.setAttribute('aria-checked',String(b.dataset.themeChoice===mode));
  });
  window.dispatchEvent(new CustomEvent('busvisa:themechange',{detail:{mode,effective}}));
 }
 function setMode(choice){if(!MODES.includes(choice))return false;mode=choice;
  try{localStorage.setItem(KEY,mode);}catch{}
  refresh();return true;
 }
 document.getElementById('theme-mode-options')?.addEventListener('click',event=>{
   const button=event.target.closest('[data-theme-choice]');if(button)setMode(button.dataset.themeChoice);
 });
 if(media.addEventListener)media.addEventListener('change',refresh);
 else if(media.addListener)media.addListener(refresh);
 refresh();
 window.BusVisaTheme={setMode,refresh,get mode(){return mode;},get effective(){return result();}};
})();
