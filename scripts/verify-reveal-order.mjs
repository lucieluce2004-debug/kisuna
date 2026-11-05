import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function renderReveal(cards)'),html.indexOf('function kyaraBooster()'));
const names=['Commun','Peu commune','Rare','Épique','Légendaire','Mythique'];
const node={classList:{add(){},remove(){}},style:{},dataset:{},querySelector(){return this}};
const state={pendingReveal:null,revealNew:[],revealToken:0};
const context={state,$:()=>node,document:{querySelector:()=>node,body:{style:{}}},rarityFor:c=>({level:names.indexOf(c.rarity)+1}),renderKyaraCurrentCard(){}};
vm.createContext(context);vm.runInContext(source,context);
for(const count of [5,25,50]){
  const cards=Array.from({length:count},(_,i)=>({id:'card-'+i,rarity:names[(count-i)%6]}));
  const flags=cards.map((_,i)=>i%3===0),inputOrder=cards.map(c=>c.id);
  state.revealNew=flags.slice();context.renderReveal(cards);
  const rendered=Array.from(state.pendingReveal);
  assert.equal(rendered.length,count);
  assert.ok(rendered.every((c,i)=>!i||names.indexOf(c.rarity)>=names.indexOf(rendered[i-1].rarity)));
  assert.deepEqual(new Set(rendered.map(c=>c.id)),new Set(inputOrder));
  assert.deepEqual(Array.from(state.revealNew),rendered.map(c=>flags[Number(c.id.slice(5))]));
  assert.deepEqual(cards.map(c=>c.id),inputOrder);
  assert.equal(state.revealIndex,0);assert.equal(node.dataset.revealOrder,'ascending-v2');
}
console.log(JSON.stringify({unsortedInput:[5,25,50],ascending:'passed',cardIdentity:'preserved',newBadges:'aligned',sourceInput:'unchanged'}));
