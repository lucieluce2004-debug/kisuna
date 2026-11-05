/* Local development instrumentation; never included in dist. */
(() => {
  const hud=document.createElement('aside');hud.id='qaHud';hud.setAttribute('aria-label','Contrôle qualité local');
  hud.style.cssText='position:fixed;bottom:78px;right:12px;z-index:2147483647;max-width:270px;padding:9px 14px;background:#fff3d8;color:#10212b;border:2px solid #65ead7;border-radius:6px;font:12px/1.5 system-ui;pointer-events:none';
  hud.textContent='QA LOCALE · services distants désactivés';document.body.append(hud);
  const output=document.createElement('pre');output.id='qaResults';output.hidden=true;document.body.append(output);
  const metrics={lcp:null,cls:0,maxEventDuration:null};
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())metrics.lcp=Math.round(e.startTime);}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)metrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.interactionId)metrics.maxEventDuration=Math.max(metrics.maxEventDuration||0,e.duration);}).observe({type:'event',buffered:true,durationThreshold:16});}catch{}
  let timer,running=false,rerun=false;
  async function audit(){
    if(running){rerun=true;return;}running=true;hud.textContent='QA LOCALE · audit en cours…';
    try{
      const result=await axe.run({exclude:[['#qaHud'],['#qaResults']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
      const view=document.querySelector('.ks-tabs [aria-pressed=true]')?.id||document.querySelector('.ks-tabs [aria-pressed=true]')?.dataset.ksTab||'';
      const modal=document.querySelector('dialog[open]')?.className||'';
      output.textContent=JSON.stringify({route:location.hash,view,modal,viewport:{width:innerWidth,height:innerHeight},metrics,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>({id:v.id,count:v.nodes.length,nodes:v.nodes.slice(0,2).map(n=>({target:n.target,summary:n.failureSummary,checks:[...n.any,...n.all,...n.none].map(c=>c.message)}))}))});
      hud.textContent='QA LOCALE · '+result.violations.length+' règle(s) en échec · services distants désactivés';
    }catch(error){output.textContent=JSON.stringify({error:error.message});hud.textContent='QA LOCALE · audit indisponible';}
    finally{running=false;if(rerun){rerun=false;schedule();}}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(audit,350);}
  for(const type of ['kizuna:tab-change','kizuna:adventure-view-change'])window.addEventListener(type,schedule);
  document.addEventListener('click',schedule);document.addEventListener('change',schedule);
  window.addEventListener('resize',schedule);window.addEventListener('load',schedule);schedule();
})();
