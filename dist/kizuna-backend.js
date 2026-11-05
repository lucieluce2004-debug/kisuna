(() => {
  'use strict';
  let loaded=false,inFlight,boosterFlight;
  async function ensureCatalogue(force=false){
    const config=window.KIZUNA_CONFIG;
    if(!config?.supabaseUrl||!config?.supabaseKey)return;
    if(loaded&&!force)return;
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const cards=[];
      for(let offset=0;;offset+=1000){
        const endpoint=new URL('/rest/v1/kizuna_cards?select=card&order=id&limit=1000&offset='+offset,config.supabaseUrl);
        if(endpoint.protocol!=='https:')throw new Error('Configuration du catalogue invalide');
        const response=await fetch(endpoint,{headers:{apikey:config.supabaseKey,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('Catalogue distant indisponible');
        const rows=await response.json();
        if(!Array.isArray(rows))throw new Error('Réponse du catalogue invalide');
        cards.push(...rows.map(row=>row.card));
        if(rows.length<1000)break;
      }
      window.KizunaGame?.addCatalogueCards(cards);loaded=true;
    })();
    try{await inFlight;}finally{inFlight=null;}
  }
  async function ensureBoosters(force=false){
    const config=window.KIZUNA_CONFIG;
    if(!config?.supabaseUrl||!config?.supabaseKey)return;
    if(boosterFlight)return boosterFlight;
    boosterFlight=(async()=>{
      await ensureCatalogue();
      const endpoint=new URL('/rest/v1/kizuna_boosters?select=id,name,description,card_ids,published,card_count&published=eq.true&order=created_at.desc&limit=200',config.supabaseUrl);
      if(endpoint.protocol!=='https:')throw new Error('Configuration des boosters invalide');
      const response=await fetch(endpoint,{headers:{apikey:config.supabaseKey,Accept:'application/json'},cache:force?'reload':'default',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Les boosters publiés sont indisponibles');
      const rows=await response.json();
      if(!Array.isArray(rows))throw new Error('Réponse des boosters invalide');
      window.KizunaGame?.setBoosterDefinitions(rows);
    })();
    try{await boosterFlight;}finally{boosterFlight=null;}
  }
  window.KizunaBackend={ensureCatalogue,ensureBoosters,refreshBoosters:()=>ensureBoosters(true)};
  ensureCatalogue().catch(()=>{/* Guest play retains its catalogue; account loads retry before applying saved copies. */});
  ensureBoosters().catch(()=>{/* Existing boosters remain available during an outage. */});
})();
