/* Pure cosmetic rules. Never debits cards, Chakra, stock or reservations. */
((root)=>{
  const empty=()=>({claims:{},awakened:{},visits:{},sanctuary:{public:false,theme:'night',frame:'simple',decoration:'stars',title:'',featured:'',cards:[],favorites:[]}});
  const period=(definition,now=Date.now())=>{const date=new Date(now);date.setUTCHours(0,0,0,0);if(definition.period==='week')date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return definition.period==='once'?{key:definition.id,start:0}:{key:definition.id+':'+date.toISOString().slice(0,10),start:+date};};
  const copies=snapshot=>{const rows=[...(snapshot.owned||[])];for(const listing of snapshot.market?.listings||[])if(listing.status==='active'&&listing.seller===snapshot.username&&listing.reservedCopy)rows.push(listing.reservedCopy);return rows;};
  function measure(definition,snapshot,state,definitions,now=Date.now()){
    const requirement=definition.requirements||{},rows=copies(snapshot),owned=new Set(rows.map(row=>String(row.id))),cards=snapshot.cards||[],start=period(definition,now).start;
    let value=0,goal=Number(requirement.goal)||1;
    if(requirement.metric==='cards'){const ids=[...new Set(requirement.card_ids||[])];goal=ids.length;value=ids.filter(id=>owned.has(id)).length;}
    else if(requirement.metric==='total')value=owned.size;
    else if(requirement.metric==='universe')value=cards.filter(card=>card.series===requirement.universe&&owned.has(card.id)).length;
    else if(requirement.metric==='visits')value=Object.values(state.visits||{}).filter(at=>Number(at)>=start&&Number(at)<=now).length;
    else if(requirement.metric==='awakenings')value=Object.values(state.awakened||{}).filter(level=>Number(level)>0).length;
    else if(requirement.metric==='constellations')value=Object.values(state.claims||{}).filter(claim=>claim.kind==='constellation').length;
    else if(requirement.metric==='discoveries'){const first=new Map();for(const row of rows){const at=Number(row.at);if(Number.isFinite(at))first.set(row.id,Math.min(first.get(row.id)??Infinity,at));}value=[...first.values()].filter(at=>at>=start&&at<=now).length;}
    const key=period(definition,now).key,claimed=!!state.claims?.[key],active=definition.enabled!==false&&(!definition.starts_at||Date.parse(definition.starts_at)<=now)&&(!definition.ends_at||Date.parse(definition.ends_at)>now);
    return {value,goal,ratio:goal?Math.min(1,value/goal):0,complete:goal>0&&value>=goal,claimed,key,active};
  }
  const available=(snapshot,id)=>(snapshot.owned||[]).filter(row=>String(row.id)===String(id)).length;
  const awakening=(snapshot,state,id)=>{const level=Math.max(0,Math.min(2,Number(state.awakened?.[id])||0)),count=available(snapshot,id);return {level,count,next:Math.min(2,level+1),required:level===0?2:5,can:level<2&&count>=(level===0?2:5)&&(root.KizunaStudio?.eligible(id)??true)};};
  root.KizunaAdventureRules=Object.freeze({empty,period,copies,measure,available,awakening});
})(typeof window==='undefined'?globalThis:window);
