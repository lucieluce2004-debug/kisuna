/* Shared album definitions; completion is always computed from the current player. */
(() => {
  'use strict';
  let albums=[],flight=null,toolbar;
  async function read(path){
    const config=window.KIZUNA_CONFIG||{},url=new URL('/rest/v1/'+path,config.supabaseUrl);
    if(url.protocol!=='https:'||url.username||url.password)throw new Error('Le service des albums est indisponible.');
    const response=await fetch(url,{headers:{apikey:config.supabaseKey,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Les albums ne peuvent pas être chargés pour le moment.');
    const rows=await response.json();if(!Array.isArray(rows))throw new Error('La réponse des albums est invalide.');return rows;
  }
  async function refresh(force=true){
    const config=window.KIZUNA_CONFIG||{};
    if(!config.supabaseUrl||!config.supabaseKey)return getAlbums();
    if(flight)return flight;
    flight=(async()=>{
      await window.KizunaBackend?.ensureCatalogue?.(force);
      const rows=[];
      for(let offset=0;;offset+=1000){const page=await read('kizuna_albums?select=id,name,anime_id,cover_image&order=id&limit=1000&offset='+offset);rows.push(...page);if(page.length<1000)break;}
      const byId=new Map(rows.map(row=>[row.id,{...row,card_ids:[]}]));
      if(rows.length){
        for(let offset=0;;offset+=1000){const page=await read('kizuna_album_cards?select=album_id,card_id&order=album_id,card_id&limit=1000&offset='+offset);for(const row of page)byId.get(row.album_id)?.card_ids.push(row.card_id);if(page.length<1000)break;}
      }
      albums=[...byId.values()];window.KizunaGame?.setAlbumDefinitions?.(albums);
      window.dispatchEvent(new CustomEvent('kizuna:albums-change'));
      return getAlbums();
    })();
    try{return await flight;}finally{flight=null;}
  }
  function getAlbums(){return albums.map(album=>({...album,card_ids:album.card_ids.slice()}));}
  function syncToolbar(){
    const parent=document.getElementById('colAlbums');if(!parent)return;
    const account=window.KizunaAccount?.getSnapshot?.()||{},admin=account.isAdmin===true&&!account.loading;
    if(!toolbar){
      toolbar=document.createElement('div');toolbar.id='kizunaAlbumToolbar';toolbar.className='kzal-toolbar';
      toolbar.innerHTML='<span>Regroupe les cartes par anime et laisse chaque joueur compléter ses albums.</span><button type="button" class="soft-btn">Créer un album par anime</button>';
      toolbar.querySelector('button').addEventListener('click',()=>{
        window.KizunaStaff?.open?.('cards');
        window.KizunaCatalogue?.openAnimeSearch?.();
      });
      parent.before(toolbar);
      new MutationObserver(syncToolbar).observe(parent,{attributes:true,attributeFilter:['hidden']});
    }
    toolbar.hidden=!admin||parent.hidden;
  }
  window.KizunaAlbums={refresh,getAlbums};
  document.addEventListener('kizuna:account-change',syncToolbar);
  window.addEventListener('kizuna:tab-change',syncToolbar);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncToolbar,{once:true});else syncToolbar();
  refresh(false).catch(()=>{/* Automatic albums remain available during a temporary outage. */});
})();
