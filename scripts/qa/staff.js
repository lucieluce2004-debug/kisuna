/* Served ONLY by preview-local.mjs?qa=staff. Every write is rejected. */
document.addEventListener('DOMContentLoaded',()=>queueMicrotask(()=>{
  const cards=window.KizunaGame.getSnapshot().cards,copy=x=>JSON.parse(JSON.stringify(x));
  const identity={user:{id:'qa-local-admin'},profile:{username:'ADMIN QA LOCAL'},isAdmin:true,staffRole:'admin',economy:true,loading:false,status:'synced'};
  window.KizunaAccount.getSnapshot=()=>copy(identity);
  const deny=()=>{throw Error('QA locale : écritures désactivées.');};
  window.KizunaAccount.economyRequest=async action=>{
    if(!['browse','history','get'].includes(action))return deny();
    return {snapshot:window.KizunaGame.getSnapshot(),result:{sales:[],listings:[{id:'qa-local-sale',cardId:cards[0].id,sellerId:'qa-local-other',seller:'DÉMONSTRATION QA',mode:'sale',price:10000,topBid:0,endsAt:Date.now()+86400000,wantCardIds:[]}]}};
  };
  window.KizunaAccount.staffRequest=async payload=>{
    if(payload.action==='list_players')return {players:[{id:'qa-local-player',username:'Joueur de démonstration QA',created_at:'2026-11-05T10:00:00Z',provider:'discord',review_status:'pending',staff_role:null}],page:1,hasNext:false};
    if(payload.action==='list_boosters')return {boosters:[]};
    return deny();
  };
  const empty=window.KizunaAdventureRules.empty();
  window.KizunaAccount.adventureRequest=async action=>{
    if(action==='get')return {state:copy(empty),revision:0,definitions:copy(window.KizunaAdventureSeed),server_now:Date.now()};
    return deny();
  };
  window.KizunaAccount.anomalyRequest=async action=>{
    if(action==='get')return {events:[],rewards:[],selection:{},server_now:Date.now()};
    if(action==='admin_list')return {drafts:[]};
    return deny();
  };
  window.KizunaAccount.mythicRequest=async action=>action==='get'?{progress:{},rules:{thresholds:[1,3,6],revision:1}}:deny();
  window.KizunaAccount.marketInboxRequest=async action=>{
    if(action==='health')return {scheduled:false,scheduler:{status:'ok',last_success_at:new Date().toISOString(),processed:0},due:0,blocked:0,issues:{}};
    if(action==='count')return {unread:0,latestId:'0'};
    if(action==='list')return {unread:0,latestId:'0',items:[]};
    return deny();
  };
  window.KizunaAccount.studioRequest=async action=>{
    if(action!=='get')return deny();
    return {draft:window.KizunaStudio.defaults(),live:window.KizunaStudio.defaults(),revision:1,publishedRevision:1,history:[]};
  };
  const branches=['invocation','destin','resonance','collection','prestige'];
  const config={nodes:branches.flatMap(branch=>Array.from({length:5},(_,i)=>({id:branch+'_'+(i+1),name:branch+' '+(i+1),cost:[1000,2500,5000,10000,20000][i],requiredLevel:[1,3,6,10,15][i],prerequisites:i?[branch+'_'+i]:[],enabled:true}))),economy:{dailyBoosters:[1,1,2],storageBonuses:[1,2],priorityBonuses:[5,10,5],recycleBonuses:[500,500,500],recycleCapBps:1500,fragmentsBasic:1,fragmentsAdvanced:2,fragmentsDailyCap:10,prestigeDailyChakra:25,weeklyBasic:1,weeklyAdvanced:2,prestigeOnceChakra:1000,prestigeOncePacks:5},weeklyBooster:{name:'Coffret QA local',description:'Aperçu uniquement.',cardIds:cards.slice(0,6).map(c=>c.id),enabled:true},cosmetics:[{id:'echo',name:'Écho de cristal',cost:20,enabled:true}],albums:window.KizunaGame.getAlbums().map(a=>({id:a.key,name:a.name,chakra:100,packs:1,enabled:true}))};
  window.KizunaAccount.nexusAdminRequest=async action=>{
    if(action!=='get')return deny();
    return {revision:1,publishedVersion:1,publishedRevision:1,draft:copy(config),live:copy(config),stats:{players:0,activePlayers30d:0,unlocks:0,chakraSpent:0,branches:[],granted:{}},history:[],serverNow:Date.now()};
  };
  // Do not expose real private services in this fixture, including account writes.
  for(const method of ['updateProfile','grantRewards','nexusRequest','marketRequest','exchangeRequest'])window.KizunaAccount[method]=async()=>deny();
  document.dispatchEvent(new CustomEvent('kizuna:account-change'));
  window.KizunaStaff.open();
  document.getElementById('ksGlobalNotice')?.remove();
}));
