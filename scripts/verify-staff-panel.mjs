import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';

// The staff interface talks to an in-memory service here. These tests create
// no real accounts, roles, cards, boosters or rewards.
const source=await fs.readFile(new URL('../dist/kizuna-staff.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await pause();}throw new Error('Staff UI did not settle');}
const ids={admin:'11111111-1111-4111-8111-111111111111',moderator:'22222222-2222-4222-8222-222222222222',player:'33333333-3333-4333-8333-333333333333',otherAdmin:'55555555-5555-4555-8555-555555555555'};
const catalogue=[
  {id:'rare',name:'Naruto',series:'Naruto',rarity:'Rare'},
  {id:'epic',name:'Kakashi',series:'Naruto',rarity:'Épique'},
  {id:'legend',name:'Itachi',series:'Naruto',rarity:'Légendaire'},
  {id:'mythic',name:'Kurama',series:'Naruto',rarity:'Mythique'},
  {id:'common',name:'Iruka',series:'Naruto',rarity:'Commun'}
];
const players=[
  {id:ids.player,username:'Joueur <img src=x onerror=alert(1)>',created_at:'2026-11-03T12:00:00Z',last_sign_in_at:'2026-11-03T13:00:00Z',provider:'discord',review_status:'pending',review_note:'',staff_role:null},
  {id:ids.moderator,username:'Modo',created_at:'2026-11-02T12:00:00Z',provider:'discord',review_status:'reviewed',staff_role:'moderator'},
  {id:ids.admin,username:'Admin',created_at:'2026-11-01T12:00:00Z',provider:'discord',review_status:'reviewed',staff_role:'admin'},
  {id:ids.otherAdmin,username:'AutreAdmin',created_at:'2026-11-01T13:00:00Z',provider:'discord',review_status:'reviewed',staff_role:'admin'}
];
function harness(role=null,options={}){
  const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><html><body data-tab="profile"><nav class="nav"><a href="#profile">Profil</a></nav><main><section id="profilePage"></section><section id="encyclopedia"><div class="wrap"><section id="kizunaAniListCatalogue"><form><input id="reusedAniListInput"><button id="reusedAniListDisabled" type="button" disabled>Précédente</button></form></section></div></section></main></body></html>',{url:'https://kizuna.example.test/#profile',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window,calls=[],subscribers=new Set(),boosters=[],staffPlayers=structuredClone(players);
  let uuidCount=0,failGrant=false,deferred=null,activeRole=role,current={user:options.userId?{id:options.userId}:role?{id:role==='admin'?ids.admin:ids.moderator}:null,staffRole:role,isAdmin:role==='admin',isModerator:role==='moderator',loading:options.loading===true};
  w.document.body.dataset.tab=options.initialTab||'profile';
  Object.defineProperty(w.crypto,'randomUUID',{value:()=>`00000000-0000-4000-8000-${String(++uuidCount).padStart(12,'0')}`});
  w.KizunaGame={getSnapshot:()=>({cards:structuredClone(catalogue)}),showTab(tab){w.document.body.dataset.tab=tab;w.dispatchEvent(new w.CustomEvent('kizuna:tab-change',{detail:{tab}}));}};
  let refreshes=0;
  w.KizunaBackend={async refreshBoosters(){refreshes++;}};
  w.KizunaAccount={getSnapshot:()=>structuredClone(current),subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},async staffRequest(payload){
    calls.push(structuredClone(payload));
    if(deferred)return deferred(payload);
    if(payload.action==='list_players')return {players:structuredClone(staffPlayers),page:payload.page,hasNext:payload.page===1};
    if(payload.action==='list_boosters')return {boosters:structuredClone(boosters)};
    if(payload.action==='save_booster'){
      const booster={...structuredClone(payload.booster),id:payload.booster.id||'44444444-4444-4444-8444-444444444444'};
      boosters.splice(0,boosters.length,booster);return {booster};
    }
    if(payload.action==='grant_rewards'&&failGrant){const error=new Error('Réseau interrompu, réessaie.');error.status=503;throw error;}
    if(payload.action==='set_staff_role'){staffPlayers.find(player=>player.id===payload.userId).staff_role=payload.role;return {ok:true,role:payload.role};}
    return {ok:true};
  }};
  w.eval(source);
  const api={dom,w,calls,errors,boosters,get refreshes(){return refreshes;},setRole(nextRole,userId){activeRole=nextRole;current={user:nextRole?{id:userId||(nextRole==='admin'?ids.admin:ids.moderator)}:null,staffRole:nextRole,isAdmin:nextRole==='admin',isModerator:nextRole==='moderator',loading:false};subscribers.forEach(fn=>fn());w.document.dispatchEvent(new w.CustomEvent('kizuna:account-change'));},setFailGrant(value){failGrant=value;},setDeferred(fn){deferred=fn;},close(){dom.window.close();}};
  api.ready=async()=>{await pause();await pause();return api;};
  api.settled=()=>until(()=>!w.document.querySelector('#staffPage')||w.document.querySelector('#staffPage').getAttribute('aria-busy')!=='true');
  return api;
}
function click(h,selector){const node=h.w.document.querySelector(selector);assert.ok(node,'Missing control '+selector);node.click();}
function submit(h,selector){const node=h.w.document.querySelector(selector);assert.ok(node,'Missing form '+selector);node.dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));}
function chooseGrade(h,userId,value){const select=h.w.document.querySelector(`[data-ks-grade][data-user-id="${userId}"]`);assert.ok(select,'Grade selector is available');select.value=value;select.dispatchEvent(new h.w.Event('change',{bubbles:true}));}
function saveGrade(h,userId){click(h,`[data-ks="staff-role"][data-user-id="${userId}"]`);}

const guest=await harness().ready();
assert.equal(guest.w.document.querySelector('#staffNav'),null);assert.equal(guest.w.document.querySelector('#staffPage'),null);assert.equal(guest.calls.length,0);
guest.w.KizunaStaff.open();assert.equal(guest.calls.length,0,'A guest cannot start a staff request');guest.close();
for(const userId of [undefined,ids.player]){
  const deniedRoute=await harness(null,{initialTab:'staff',userId}).ready();
  assert.equal(deniedRoute.w.document.body.dataset.tab,'profile','A direct staff URL cannot leave an unauthorized player on an empty page');
  assert.equal(deniedRoute.w.document.querySelector('#staffPage'),null);assert.match(deniedRoute.w.document.querySelector('#ksGlobalNotice').textContent,/réservé aux administrateurs/);assert.equal(deniedRoute.calls.length,0);deniedRoute.close();
}
const loadingRoute=await harness(null,{initialTab:'staff',loading:true}).ready();assert.equal(loadingRoute.w.document.body.dataset.tab,'staff','Wait for account verification before redirecting');loadingRoute.setRole(null);assert.equal(loadingRoute.w.document.body.dataset.tab,'profile');loadingRoute.close();

const mod=await harness('moderator').ready();
assert.ok(mod.w.document.querySelector('#staffNav'));assert.equal(mod.calls.length,0,'Opening a player page must not fetch staff records');
assert.deepEqual([...mod.w.document.querySelectorAll('[data-ks-tab]')].map(node=>node.dataset.ksTab),['registrations']);
assert.equal(mod.w.document.querySelector('#ksBoosterForm'),null);assert.equal(mod.w.document.querySelector('#ksRewardForm'),null);assert.equal(mod.w.document.querySelector('#ksModerators'),null);
assert.equal(mod.w.document.querySelector('[data-ks-grade]'),null);assert.equal(mod.w.document.querySelector('[data-ks="reward-player"]'),null);
click(mod,'#staffNav');await mod.settled();assert.equal(mod.calls.length,1);assert.equal(mod.calls[0].action,'list_players');
mod.w.KizunaStaff.open('moderators');assert.equal(mod.w.document.querySelector('#ks-registrations').hidden,false);assert.equal(mod.calls.length,1,'A moderator cannot activate team management or send a role update');
assert.equal(mod.w.document.querySelector('#ksPlayers img'),null,'Server text must be escaped');assert.match(mod.w.document.querySelector('#ksPlayers').textContent,/Joueur <img/);
click(mod,'[data-ks="review"]');const review=mod.w.document.querySelector('.ks-review-form');review.elements.status.value='reviewed';review.elements.note.value='Profil vérifié après inscription.';submit(mod,'.ks-review-form');await mod.settled();
assert.deepEqual(mod.calls.at(-1),{action:'review_player',userId:ids.player,status:'reviewed',note:'Profil vérifié après inscription.'});assert.match(mod.w.document.querySelector('#ksPlayers').textContent,/Vérifié/);
click(mod,'[data-ks="next"]');await mod.settled();assert.equal(mod.calls.at(-1).page,2);assert.equal(mod.w.document.querySelector('[data-ks="next"]').disabled,true);
mod.setRole(null);assert.equal(mod.w.document.querySelector('#staffNav'),null);assert.equal(mod.w.document.querySelector('#staffPage'),null);assert.equal(mod.w.document.body.dataset.tab,'profile');mod.close();

const admin=await harness('admin').ready();
assert.equal(admin.w.document.querySelector('#kizunaAniListCatalogue').parentElement.id,'ksAniListHost','Existing AniList implementation is reused');
assert.equal(admin.w.document.querySelectorAll('[data-ks-tab]').length,5);
click(admin,'#staffNav');await admin.settled();
assert.equal(admin.w.document.querySelector('#reusedAniListDisabled').disabled,true,'Staff loading must preserve the adopted AniList tool’s disabled controls');
click(admin,'[data-ks-tab="boosters"]');await admin.settled();
assert.equal(admin.calls.at(-1).action,'list_boosters');assert.equal(admin.w.document.querySelector('[data-ks="publish-booster"]').disabled,true);
const builder=admin.w.document.querySelector('#ksBoosterForm');builder.elements.name.value='Les liens de Konoha';builder.elements.description.value='Une sélection Naruto.';
for(const id of ['rare','epic','legend','mythic']){
  const box=admin.w.document.querySelector(`[data-ks-card="${id}"]`);box.checked=true;box.dispatchEvent(new admin.w.Event('change',{bubbles:true}));
}
assert.equal(admin.w.document.querySelector('[data-ks="publish-booster"]').disabled,false);
click(admin,'[data-ks="publish-booster"]');await admin.settled();
const published=admin.calls.find(value=>value.action==='save_booster');assert.equal(published.booster.published,true);assert.deepEqual(published.booster.card_ids,['rare','epic','legend','mythic']);assert.equal(admin.refreshes,1);
assert.match(admin.w.document.querySelector('#ksStatus').textContent,/publié/);assert.equal(admin.w.document.querySelector('#ksBoosterList [data-ks="edit-booster"]').dataset.boosterId,'44444444-4444-4444-8444-444444444444');
click(admin,'[data-ks="clear-pool"]');submit(admin,'#ksBoosterForm');await admin.settled();assert.equal(admin.calls.at(-1).booster.published,false);assert.equal(admin.calls.at(-1).booster.id,'44444444-4444-4444-8444-444444444444');assert.deepEqual(admin.calls.at(-1).booster.card_ids,[]);

click(admin,'[data-ks-tab="rewards"]');const reward=admin.w.document.querySelector('#ksRewardForm');reward.elements.userId.value=ids.player;reward.elements.rolls.value='3';reward.elements.chakra.value='150';reward.elements.reason.value='Récompense de bienvenue';
assert.equal(admin.w.document.querySelector('#ksRewardsTitle').textContent,'Offrir des rerolls et du Chakra');assert.match(reward.textContent,/Rerolls gratuits à offrir/);assert.match(reward.textContent,/1 reroll gratuit = 1 ouverture de booster offerte/);
admin.setFailGrant(true);submit(admin,'#ksRewardForm');await admin.settled();const firstGrant=admin.calls.at(-1);assert.equal(firstGrant.action,'grant_rewards');assert.match(firstGrant.requestId,/^[0-9a-f-]{36}$/);assert.match(admin.w.document.querySelector('#ksStatus').textContent,/Réseau/);
admin.setFailGrant(false);submit(admin,'#ksRewardForm');await admin.settled();const retry=admin.calls.at(-1);assert.equal(retry.requestId,firstGrant.requestId,'A failed delivery retries the same reward intent');assert.equal(retry.rolls,3);assert.equal(retry.chakra,150);assert.equal(reward.elements.rolls.value,'0');
reward.elements.rolls.value='1001';reward.elements.reason.value='Trop de rolls';const beforeInvalid=admin.calls.length;submit(admin,'#ksRewardForm');await pause();assert.equal(admin.calls.length,beforeInvalid,'Out-of-range rewards are never submitted');
reward.elements.rolls.value='1';reward.elements.chakra.value='0';reward.elements.reason.value='Nouvelle récompense';submit(admin,'#ksRewardForm');await admin.settled();assert.notEqual(admin.calls.at(-1).requestId,firstGrant.requestId,'A new reward receives a new idempotency key');
click(admin,'[data-ks-tab="moderators"]');assert.match(admin.w.document.querySelector('[data-ks-tab="moderators"]').textContent,/Équipe/);assert.equal(admin.w.document.querySelector('#ksModeratorsTitle').textContent,'Gérer l’équipe');
assert.equal(admin.w.document.querySelector(`[data-ks-grade][data-user-id="${ids.admin}"]`),null,'The current administrator’s grade is read-only');assert.equal(admin.w.document.querySelector(`[data-ks="staff-role"][data-user-id="${ids.admin}"]`),null);assert.match(admin.w.document.querySelector(`[data-ks-team-user="${ids.admin}"]`).textContent,/Ton compte/);
const beforeGrade=admin.calls.length;chooseGrade(admin,ids.player,'admin');assert.equal(admin.calls.length,beforeGrade,'Selecting a grade must not update the server');saveGrade(admin,ids.player);await admin.settled();assert.deepEqual(admin.calls.at(-1),{action:'set_staff_role',userId:ids.player,role:'admin'});assert.equal(admin.w.document.querySelector(`[data-ks-grade][data-user-id="${ids.player}"]`).value,'admin');
for(const [value,role]of [['moderator','moderator'],['player',null]]){chooseGrade(admin,ids.player,value);saveGrade(admin,ids.player);await admin.settled();assert.deepEqual(admin.calls.at(-1),{action:'set_staff_role',userId:ids.player,role});}
chooseGrade(admin,ids.otherAdmin,'moderator');saveGrade(admin,ids.otherAdmin);await admin.settled();assert.deepEqual(admin.calls.at(-1),{action:'set_staff_role',userId:ids.otherAdmin,role:'moderator'},'Other administrators can be managed');chooseGrade(admin,ids.otherAdmin,'admin');saveGrade(admin,ids.otherAdmin);await admin.settled();
admin.setDeferred(async()=>{const error=new Error('Le dernier administrateur doit être conservé.');error.status=409;error.code='LAST_ADMIN_PROTECTED';throw error;});chooseGrade(admin,ids.otherAdmin,'player');saveGrade(admin,ids.otherAdmin);await admin.settled();assert.ok(admin.w.document.querySelector('#staffPage'));assert.match(admin.w.document.querySelector('#ksStatus').textContent,/dernier administrateur/);assert.equal(admin.w.document.querySelector(`[data-ks-grade][data-user-id="${ids.otherAdmin}"]`).dataset.currentRole,'admin','A failed change does not alter the recorded grade');
admin.setDeferred(async()=>{const error=new Error('Ton propre grade est protégé.');error.status=403;error.code='SELF_ROLE_PROTECTED';throw error;});saveGrade(admin,ids.otherAdmin);await admin.settled();assert.ok(admin.w.document.querySelector('#staffPage'));assert.match(admin.w.document.querySelector('#ksStatus').textContent,/propre grade est protégé/);admin.setDeferred(null);
reward.elements.userId.value=ids.player;reward.elements.rolls.value='8';reward.elements.chakra.value='250';reward.elements.reason.value='Ancien brouillon';const beforeShortcut=admin.calls.length;click(admin,`[data-ks="reward-player"][data-user-id="${ids.otherAdmin}"]`);assert.equal(admin.w.document.querySelector('#ks-rewards').hidden,false);assert.equal(reward.elements.userId.value,ids.otherAdmin);assert.equal(reward.elements.rolls.value,'0');assert.equal(reward.elements.chakra.value,'0');assert.equal(reward.elements.reason.value,'');assert.equal(admin.calls.length,beforeShortcut,'The reward shortcut selects a player without granting anything or fetching another page');submit(admin,'#ksRewardForm');await pause();assert.equal(admin.calls.length,beforeShortcut,'A blank shortcut form cannot grant a reward');
reward.elements.rolls.value='2';reward.elements.reason.value='Deux rerolls gratuits';submit(admin,'#ksRewardForm');await admin.settled();assert.equal(admin.calls.at(-1).action,'grant_rewards');assert.equal(admin.calls.at(-1).userId,ids.otherAdmin);assert.equal(admin.calls.at(-1).rolls,2);assert.equal(admin.calls.at(-1).chakra,0);assert.match(admin.w.document.querySelector('#ksStatus').textContent,/2 rerolls gratuits/);

let finish;admin.setDeferred(()=>new Promise(resolve=>{finish=resolve;}));click(admin,'[data-ks-tab="moderators"]');chooseGrade(admin,ids.player,'admin');saveGrade(admin,ids.player);await until(()=>typeof finish==='function');admin.setRole(null);finish({ok:true,role:'admin'});await pause();await pause();assert.equal(admin.w.document.querySelector('#staffPage'),null);assert.equal(admin.w.document.body.textContent.includes(players[0].username),false,'A grade response arriving after logout must not restore staff data');assert.deepEqual(admin.errors,[]);admin.close();

const revoked=await harness('moderator').ready();revoked.setDeferred(async()=>{const error=new Error('Forbidden');error.status=403;throw error;});click(revoked,'#staffNav');await revoked.settled();assert.equal(revoked.w.document.querySelector('#staffPage'),null);assert.equal(revoked.w.document.querySelector('#staffNav'),null);assert.match(revoked.w.document.querySelector('#ksGlobalNotice').textContent,/accès staff a changé/);assert.equal(revoked.w.document.body.dataset.tab,'profile');revoked.close();

console.log(JSON.stringify({guestIsolation:'passed',unauthorizedDirectRoute:'passed',accountVerificationBeforeRedirect:'passed',moderatorLimitedToRegistrations:'passed',reviewsAndPagination:'passed',adminAniListReused:'passed',boosterPoolAndGuaranteedTiers:'passed',draftAndPublish:'passed',rewardsBounded:'passed',rerollsAndChakra:'passed',rewardShortcutDoesNotGrant:'passed',retryIdempotency:'passed',adminPromotion:'passed',allThreeGrades:'passed',otherAdministratorManagement:'passed',selfGradeProtected:'passed',gradeSelectionDoesNotSubmit:'passed',protectedRoleErrors:'passed',escapedServerText:'passed',logoutStaleGradeResponse:'passed',revokedRoleClearsData:'passed',network:'none'}));
