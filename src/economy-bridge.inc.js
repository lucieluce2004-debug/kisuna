/* Connected players send intentions only. Guests keep their separate local game. */
const keAccount=()=>window.KizunaAccount?.getSnapshot?.();
const keServer=()=>keAccount()?.economy===true;
const keProtected=()=>window.KIZUNA_CONFIG?.serverEconomy===true&&(keAccount()?.user||keAccount()?.loading);
const keBlocked=()=>window.KIZUNA_CONFIG?.serverEconomy===true&&(keAccount()?.loading||keAccount()?.user&&!keServer());
const keNow=()=>{const c=keAccount()?.serverClock;return c?c.at+Math.max(0,performance.now()-c.received):Date.now();};
const keLocalTick=tickFree;
tickFree=function(){if(keBlocked())return;if(!keServer())return keLocalTick();const now=keNow(),cap=kzFreeCapacity();if(stock.free>=cap)return;while(stock.free<cap&&now-stock.t>=FREE_EVERY){stock.free++;stock.t+=FREE_EVERY;}};
const keLocalOpen=openBoosterNow;
openBoosterNow=async function(n){
 if(keBlocked()){toast('Attends la connexion de ton compte.');return;}
 if(!keServer()){if(state.selectedBooster==='nexus:weekly'){toast('Connecte-toi pour ouvrir ce coffret.');return;}return keLocalOpen(n);}
 if(state.opening)return;const user=keAccount().user.id,token=state.packToken,counts=ownCounts();state.opening=true;
 try{
  const data=await window.KizunaAccount.economyRequest('open',{count:Number(n),booster:state.selectedBooster});
  if(keAccount()?.user?.id!==user||state.packToken!==token)return;
  const cards=data.result.cards.map((copy,index)=>{const c=LOCAL_CARDS.find(c=>String(c.id)===copy.id);return c?{...c,kzResonance:(data.result.resonance||[]).find(r=>Number(r.index)===index),kzNexusResonance:data.result.nexus?.bonuses?.resonanceAnimation===true}:null;});
  if(cards.some(c=>!c)){toast('Les cartes ont été ajoutées. Recharge le catalogue pour les afficher.');return;}
  const seen=new Set();state.revealNew=cards.map(c=>{const fresh=!counts[c.id]&&!seen.has(c.id);seen.add(c.id);return fresh;});
  renderReveal(cards);
 }catch(error){toast(error.publicMessage||error.message||'Ouverture non confirmée.');}
 finally{state.opening=false;renderPanel();renderPacks();}
};
const keLocalExtra=renderExtra;
renderExtra=function(){keLocalExtra();if(keServer()&&KT.tab==='daily'){const today=new Date(keNow()).toISOString().slice(0,10),old=new Date(keNow()).toUTCString().slice(0,16);const claimed=stock.day===today||stock.day===new Date(keNow()).toDateString();const button=$('kExtra')?.querySelector('[data-act="daily"]');if(button){button.disabled=claimed;button.textContent=claimed?'Déjà récupéré aujourd’hui':'Récupérer 3 boosters';}const p=$('kExtra')?.querySelector('p');if(p)p.textContent='3 boosters offerts par jour · remise à zéro à minuit UTC.';}};
async function keRun(action,payload,message){try{await window.KizunaAccount.economyRequest(action,payload);if(message)toast(message);renderPanel();renderExtra();renderCollection();}catch(error){toast(error.publicMessage||error.message);}}
let keRecycling=false;
async function keRecycle(cardId){
 if(keRecycling)return;keRecycling=true;
 const user=keAccount()?.user?.id;
 try{
  // Fetch the actual entitlement and fractional carry before displaying a quote.
  const nexus=await window.KizunaAccount.nexusRequest('get');
  if(user!==keAccount()?.user?.id||keBlocked())return;
  const revision=keAccount().revision,seen=new Set();let count=0,base=0,eligible=0,name='';
  if(cardId){
   const card=LOCAL_CARDS.find(c=>c.id===cardId),copies=state.owned.filter(c=>c.id===cardId).length;
   if(!card||!copies){toast('Cet exemplaire n’est plus disponible.');return;}
   count=1;name=card.name;base=VAL[card.rarity]||0;eligible=copies>1?base:0;
  }else{
   for(const copy of state.owned){if(seen.has(copy.id)){count++;base+=VAL[LOCAL_CARDS.find(c=>c.id===copy.id)?.rarity]||0;}else seen.add(copy.id);}
   eligible=base;if(!count){toast('Aucun doublon disponible.');return;}
  }
  const bps=Number(nexus.bonuses?.recycleBps)||0,remainder=Number(nexus.recycleRemainder)||0;
  const bonus=eligible>0?Math.floor((eligible*bps+remainder)/10000):0,total=base+bonus;
  const detail=bps&&eligible?'\nBase : '+base+' · bonus Nexus : +'+bonus+' ('+(bps/100)+' %). Les fractions de Chakra sont conservées pour les prochains doublons.':'';
  const question=cardId?'Recycler un exemplaire de '+name+' pour '+total+' Chakra ?':'Recycler '+count+' doublon(s) pour '+total+' Chakra ? Un exemplaire disponible de chaque carte sera conservé.';
  if(confirm(question+detail))await keRun(cardId?'recycle':'recycle_all',cardId?{cardId,revision}:{revision},cardId?'Exemplaire recyclé.':'Doublons recyclés.');
 }catch(error){toast(error.publicMessage||error.message||'Impossible de calculer le recyclage. Réessaie.');}
 finally{keRecycling=false;}
}
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b||(!keServer()&&!keBlocked()))return;
 const economic=b.matches('#kExtra [data-act],#colRecycle,#collection [data-sell],[data-col-market-open],[data-cp-toggle-wishlist]');
 if(!economic)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(keBlocked()){toast('Attends le chargement de ton compte.');return;}
 if(b.dataset.colMarketOpen){window.KizunaExchange?.openSell(b.dataset.colMarketOpen);return;}
 if(b.dataset.cpToggleWishlist){const id=b.dataset.cpToggleWishlist,ids=kyaraMarketWishlistIds.includes(id)?kyaraMarketWishlistIds.filter(x=>x!==id):[...kyaraMarketWishlistIds,id];keRun('preferences',{wishlist:ids},'Liste d’envies enregistrée.');return;}
 if(b.dataset.act==='daily'){keRun('daily',{},'+3 boosters offerts !');return;}
 if(b.dataset.act==='buy'){keRun('shop',{count:Number(b.dataset.n)},'Boosters ajoutés à ton stock.');return;}
 if(b.id==='colRecycle')keRecycle();else if(b.dataset.sell)keRecycle(b.dataset.sell);
},true);
// Legacy local settlement must never mutate the connected server projection.
const keOldAuction=kyaraMarketSettleExpiredAuctions,keOldSales=kaSettleExpiredSales,keOldCredits=kyaraMarketClaimPending;
kyaraMarketSettleExpiredAuctions=function(){if(!keProtected())return keOldAuction();};
kaSettleExpiredSales=function(){if(!keProtected())return keOldSales();};
kyaraMarketClaimPending=function(){if(!keProtected())return keOldCredits();};
const keOldMarketRender=renderKyaraMarket;
renderKyaraMarket=function(){if(keServer()){window.KizunaExchange?.show?.();return;}return keOldMarketRender();};
