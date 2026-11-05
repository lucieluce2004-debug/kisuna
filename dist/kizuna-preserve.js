/* Raw, device-only pre-redesign backup. Never copies Auth tokens or rewrites game keys. */
(() => {
  'use strict';
  const version='economy-v21', allowed=new Set([
    'hoshi_owned_cards_v2','hoshi_gross_tirages_v2','hoshi_display_name_v1',
    'hoshi_chakra_v2','hoshi_stock_v2','hoshi_anilist_v2',
    'kyara_market_listings_v1','kyara_market_pending_credits_v1',
    'kyara_market_pending_cards_v1','kyara_market_history_v1','kyara_market_wishlist_v1',
    'kizuna_guest_snapshot_v1','kizuna_workspace_owner_v1','kizuna_extra_catalogue_v1',
    'kizuna_reveal_preferences_v1','kizuna_adventure_guest_v1'
  ]);
  let status='pending';
  const raw=Object.create(null);
  // Capture synchronously before the legacy engine normalizes browser data.
  try {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(allowed.has(key)||/^kizuna_(unsynced_v1_|guest_imported_v1_)[a-f0-9-]{36}$/i.test(key))raw[key]=localStorage.getItem(key);
    }
  }catch {status='unavailable';}
  const id=version+':'+(raw.kizuna_workspace_owner_v1||'guest');
  const completed = new Promise(resolve=>{
    if(status==='unavailable'||!window.indexedDB){status='unavailable';resolve(status);return;}
    if(!Object.keys(raw).length){status='empty';resolve(status);return;}
    try {
      const request=indexedDB.open('kizuna_preservation',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('backups'))request.result.createObjectStore('backups',{keyPath:'id'});};
      request.onerror=()=>{status='unavailable';resolve(status);};
      request.onblocked=()=>{status='unavailable';resolve(status);};
      request.onsuccess=()=>{
        const db=request.result;
        try {
          const tx=db.transaction('backups','readwrite'),store=tx.objectStore('backups');
          const existing=store.get(id);
          existing.onsuccess=()=>{if(!existing.result)store.add({id,version,createdAt:new Date().toISOString(),values:raw});};
          tx.oncomplete=()=>{status='saved';db.close();resolve(status);};
          tx.onabort=tx.onerror=()=>{status='unavailable';db.close();resolve(status);};
        }catch{status='unavailable';db.close();resolve(status);}
      };
    }catch{status='unavailable';resolve(status);}
  });
  window.KizunaPreservation=Object.freeze({version,getStatus:()=>status,ready:completed});
})();
