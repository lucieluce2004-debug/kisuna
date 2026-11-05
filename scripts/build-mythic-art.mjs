import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {JSDOM} from 'jsdom';

// Art assets are intentionally generated from reviewed, explicit per-card briefs.
// Original portraits remain intact; stage-specific artwork is a separate asset.
const source=JSON.parse(await fs.readFile('seed/catalogue.json','utf8'));
const mythics=source.filter(row=>row.card.rarity==='Mythique').sort((a,b)=>a.card.series.localeCompare(b.card.series,'fr')||a.card.name.localeCompare(b.card.name,'fr')||a.id.localeCompare(b.id));
const direction=JSON.parse(await fs.readFile('seed/mythic-art-direction.json','utf8'));
const entries=new Map(direction.cards.map(row=>[row[0],row]));
const illustrations=JSON.parse(await fs.readFile('seed/awakening-illustrations.json','utf8'));
const illustrationIndex=new Map(illustrations.map(row=>[row.id+':'+row.level,row]));
assert.equal(illustrationIndex.size,illustrations.length,'Duplicate stage illustration');
assert.deepEqual([...illustrationIndex.keys()].sort(),mythics.flatMap(row=>[1,2,3].map(level=>row.id+':'+level)).sort(),'Every Mythic awakening needs its reviewed illustration');
for(const item of illustrations){assert.match(item.image,/^assets\/awakening-illustrations\/[a-z0-9-]+-[123]\.webp$/);await fs.access('dist/'+item.image);}
assert.equal(entries.size,direction.cards.length,'Duplicate art direction ID');
assert.deepEqual([...entries.keys()].sort(),mythics.map(row=>row.id).sort(),'Every currently Mythic ID needs an explicit art direction');
const out='dist/assets/awakenings';await fs.mkdir(out,{recursive:true});
const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const rotate=(degrees,shape)=>'<g transform="rotate('+degrees+')">'+shape+'</g>';
const repeat=(n,fn)=>Array.from({length:n},(_,i)=>fn(i)).join('');
const motifNames={banners:'étendards',beast:'empreintes et silhouette bestiale',blades:'lames stylisées',book:'pages ouvertes',burst:'rayons d’impact',chains:'mailles de chaînes',chess:'échiquier',circuits:'circuits lumineux',cloud:'nuages',coins:'médaillons',cross:'croix de soin',crown:'couronne',eyes:'iris concentriques',feathers:'plumes',flame:'langues de feu',flight:'trajectoires',flowers:'fleurs',fox:'neuf queues de lumière',frost:'cristaux de givre',gears:'engrenages',glass:'prismes',guardian:'armure spectrale',heart:'cœurs',ink:'traits d’encre',leaves:'feuilles',lightning:'éclairs',moon:'croissant lunaire',notes:'notes et portées',orbit:'orbites',paper:'lettres et plis',petals:'pétales',ribbons:'rubans',rose:'rosace',shadow:'volutes sombres',shards:'éclats cristallins',shield:'bouclier',sigil:'sceau géométrique',skull:'masque d’os',smoke:'arabesques de fumée',stars:'étoiles',sun:'disque solaire',thread:'fils et aiguille',water:'ondes d’eau',wind:'spirales de vent',wings:'ailes géométriques'};
function motif(name){
 const circle='<circle r="38"/>';
 switch(name){
 case 'flame':return '<path d="M0 59C-53 42-49 8-29-11c-7 22 7 24 9 11C-17-21 7-30 3-58c41 31 14 51 34 58C51-16 59 34 25 53Q4 42 9 14C-20 27-14 42 0 59Z" fill="currentColor" fill-opacity=".16"/>';
 case 'water':return repeat(4,i=>'<path d="M-67 '+(-36+i*24)+'Q-34 '+(-70+i*24)+' 0 '+(-36+i*24)+'T67 '+(-36+i*24)+'"/>');
 case 'lightning':return '<path d="M8-66-41 1-9-5-25 62 47-18 12-10 34-66Z" fill="currentColor" fill-opacity=".2"/><path d="m-46-28-15 30 16-7-13 35M48 17l14 20-17-2 10 24"/>';
 case 'feathers':return '<path d="M-44 59Q-24 3 40-61Q66-11 13 28L-44 59Z"/><path d="M-44 59 39-60M-24 16l36 10M-8-6 27 9M9-30 39-11M-29 29l6-43M-13 6l6-42"/>';
 case 'shadow':return '<path d="M-57 54C52 20-47 8 8-56C-9 5 65-10 49 38M-40 42C29 20-22 5-7-39M-62 60C26 52 62 26 29-39" stroke-width="6" opacity=".8"/>';
 case 'chains':return repeat(5,i=>'<ellipse cx="0" cy="'+(-47+i*24)+'" rx="17" ry="23" transform="rotate('+(-25+i*12)+' 0 '+(-47+i*24)+')"/>');
 case 'moon':return '<path d="M28-55A60 60 0 1 0 46 41A49 49 0 0 1 28-55Z" fill="currentColor" fill-opacity=".12"/>'+rotate(35,'<path d="M0-75V-67M0 67V75M-75 0H-67M67 0H75"/>');
 case 'orbit':return '<ellipse rx="66" ry="24" transform="rotate(-35)"/><ellipse rx="66" ry="24" transform="rotate(35)"/><circle r="40"/><circle cx="-35" cy="-39" r="6" fill="currentColor"/>';
 case 'petals':return repeat(5,i=>rotate(i*72,'<path d="M0 0C-38-23-24-70 0-44C24-70 38-23 0 0Z" fill="currentColor" fill-opacity=".12"/>'));
 case 'blades':return repeat(3,i=>rotate(-28+i*28,'<path d="M-5 40V-40L0-69 5-40V40M-18 40H18M-4 42V59H4V42"/>'));
 case 'circuits':return '<path d="M-60-50H-21V-19H20V-50H60M-60 50H-21V19H20V50H60M-62 0H-34L-16 0H16L34 0H62M0-65V-33M0 33V65"/>'+repeat(4,i=>rotate(i*90,'<circle cy="-63" r="5" fill="currentColor"/>'))+'<rect x="-17" y="-17" width="34" height="34" rx="3"/>';
 case 'stars':return '<path d="m0-62 15 42 43 1-34 26 12 43L0 24-36 26l12-43L-58-43l43-1Z" transform="translate(0 14) scale(.9)"/><path d="M-56-55v23M-68-43h24M54 31v25M42 44h25"/>';
 case 'ink':return '<path d="M-41-51Q2-25 47-42M-39-13Q1-32 38-2M-44 31Q13 8 49 45" stroke-width="9" stroke-linecap="round"/><circle cx="-56" cy="52" r="5" fill="currentColor"/><circle cx="57" cy="-19" r="3" fill="currentColor"/>';
 case 'notes':return repeat(5,i=>'<path d="M-65 '+(-30+i*15)+'H65" opacity=".45"/>')+'<path d="M-13 28V-53L36-61V16M-13-41l49-8" stroke-width="5"/><ellipse cx="-24" cy="31" rx="14" ry="9" transform="rotate(-24 -24 31)" fill="currentColor"/><ellipse cx="25" cy="20" rx="14" ry="9" transform="rotate(-24 25 20)" fill="currentColor"/>';
 case 'gears':return repeat(12,i=>rotate(i*30,'<path d="M-7-47V-62H7V-47"/>'))+'<circle r="47"/><circle r="29"/><circle r="11"/>'+repeat(6,i=>rotate(i*60,'<path d="M0-11V-29"/>'));
 case 'wind':return '<path d="M-65 15C-24-48 61-63 55-9C48 44-25 48-33 13C-42-23 7-38 22-10C39 24 8 41-48 57M-65-7C-23-72 77-68 74-8"/>';
 case 'crown':return '<path d="M-57-39-27-8 0-58 27-8 57-39 45 39H-45Z" fill="currentColor" fill-opacity=".13"/><path d="M-47 27H47M-44 46H44M0-27 12-6 0 16-12-6Z"/>';
 case 'sigil':return '<circle r="61"/><circle r="52"/><path d="M0-48 42 25H-42ZM0 48 42-25H-42Z"/><circle r="16"/>'+repeat(6,i=>rotate(i*60,'<path d="M0-66V-73"/>'));
 case 'wings':return '<path d="M0 47C-28 19-65 2-72-57C-49-36-19-37 0-12C19-37 49-36 72-57C65 2 28 19 0 47ZM0-12V47M-52-20-11 21M52-20 11 21M-39-3-10 32M39-3 10 32" fill="currentColor" fill-opacity=".08"/>';
 case 'shards':return repeat(5,i=>rotate(i*72,'<path d="M0-11-14-35 0-70 14-35Z" fill="currentColor" fill-opacity=".13"/><path d="M0-15V-65"/>'));
 case 'beast':return '<path d="M-48-52-35-3-55 21-30 48 0 62 30 48 55 21 35-3 48-52 16-27H-16ZM-34 4-11 14M34 4 11 14M-8 33H8L0 42Z" fill="currentColor" fill-opacity=".1"/>';
 case 'burst':return repeat(12,i=>rotate(i*30,'<path d="M0-29 7-68 0-59-7-68Z" fill="currentColor" fill-opacity=".18"/>'))+'<circle r="23"/>';
 case 'leaves':return repeat(5,i=>rotate(i*72,'<path d="M0 0C-33-16-25-51 0-63C26-46 29-15 0 0ZM0 0V-57M0-24-14-36M0-35 13-47" fill="currentColor" fill-opacity=".09"/>'));
 case 'heart':return '<path d="M0 56C-13 31-62 2-58-29C-52-67-9-61 0-35C10-62 53-67 58-29C62 2 13 31 0 56Z" fill="currentColor" fill-opacity=".13"/><path d="M-40-20C-38-34-24-38-17-28"/>';
 case 'glass':return '<path d="M0-65 51-24 42 43 0 65-42 43-51-24ZM0-65V65M-51-24H51M-42 43 0-24 42 43M0-65-42 43M0-65 42 43" fill="currentColor" fill-opacity=".07"/>';
 case 'ribbons':return '<path d="M-68 51C-6 47-26-60 32-57C96-53-15 8-8 44C-5 61 43 50 63 24M-64 59C-2 55-18-51 37-48C83-46-3 14 2 42"/>';
 case 'sun':return '<circle r="31"/><circle r="21"/>'+repeat(12,i=>rotate(i*30,'<path d="M0-40V-68M-3-53 0-62 3-53"/>'));
 case 'frost':return repeat(6,i=>rotate(i*60,'<path d="M0 0V-66M-18-39 0-22 18-39M-12-57 0-45 12-57"/>'))+'<circle r="11"/>';
 case 'eyes':return '<path d="M-70 0Q0-63 70 0Q0 63-70 0Z"/><circle r="29"/><circle r="12" fill="currentColor" fill-opacity=".3"/>'+repeat(6,i=>rotate(i*60,'<path d="M0-34V-40"/>'));
 case 'chess':return '<path d="M-60-60H60V60H-60Z"/>'+repeat(4,x=>repeat(4,y=>(x+y)%2===0?'<rect x="'+(-60+x*30)+'" y="'+(-60+y*30)+'" width="30" height="30" fill="currentColor" fill-opacity=".13"/>':''))+'<path d="M-24 34H24L11 9 21-18-4-43-20-21-8-8-12 10Z" fill="currentColor" fill-opacity=".12"/>';
 case 'paper':return '<path d="M-52-36H52V40H-52ZM-52-36 0 6 52-36M-52 40-13-4M52 40 13-4"/><path d="M-37-53H37M-25-63H25"/>';
 case 'flight':return '<path d="M-65 42Q-7-19 66-47M-53 56Q-7 14 48-7M-61 14Q-13-30 30-39M44-57 66-47 57-23"/><circle cx="-30" cy="29" r="13"/>';
 case 'shield':return '<path d="M0-63 54-40 44 25 0 66-44 25-54-40ZM0-45 37-28 30 17 0 45-30 17-37-28Z" fill="currentColor" fill-opacity=".07"/><path d="M0-37V35M-24-1H24"/>';
 case 'rose':return repeat(6,i=>rotate(i*60,'<path d="M0-6C-31-8-42-48-7-56C27-63 30-21 0-6Z" fill="currentColor" fill-opacity=".1"/>'))+'<circle r="16"/>';
 case 'thread':return '<path d="M-56 50C52 58-28-50 35-45C70-42 64 7 32 8C-8 7-12-45-55-51M-42 49 35-56"/><ellipse cx="30" cy="-49" rx="4" ry="14" transform="rotate(36 30-49)"/>';
 case 'cross':return '<path d="M-16-56H16V-16H56V16H16V56H-16V16H-56V-16H-16Z" fill="currentColor" fill-opacity=".12"/><circle r="72" stroke-dasharray="3 10"/>';
 case 'skull':return '<path d="M-39 27C-73-20-34-66 0-61C34-66 73-20 39 27L25 28V54H-25V28ZM-27 5-10 13-30 20ZM27 5 10 13 30 20ZM-6 29 0 17 6 29M-14 36V53M0 36V53M14 36V53" fill="currentColor" fill-opacity=".08"/>';
 case 'book':return '<path d="M0 49V-47Q-28-61-60-49V35Q-27 28 0 49Q27 28 60 35V-49Q28-61 0-47ZM-46-32Q-27-34-12-25M-46-12Q-27-14-12-5M46-32Q27-34 12-25M46-12Q27-14 12-5"/>';
 case 'fox':return repeat(9,i=>rotate(-80+i*20,'<path d="M0 40C-29 14-22-30 0-76C20-30 28 14 0 40Z" fill="currentColor" fill-opacity=".07"/>'))+'<path d="M-26 21-25-8-6 10H6L25-8 26 21 0 48Z" fill="currentColor" fill-opacity=".17"/>';
 case 'guardian':return '<path d="M-48-13-65-49-25-29 0-57 25-29 65-49 48-13 56 15 30 47 0 63-30 47-56 15ZM-34 1-12 11M34 1 12 11M-18 37H18M0-34V-5M-70 31-39 56M70 31 39 56" fill="currentColor" fill-opacity=".1"/>';
 case 'cloud':return '<path d="M-55 33C-84 0-54-25-30-15C-32-58 31-65 38-23C76-32 84 32 50 33ZM-40 46H40M-21 58H21"/>';
 case 'flowers':return repeat(6,i=>rotate(i*60,'<ellipse cy="-28" rx="15" ry="30" fill="currentColor" fill-opacity=".1"/>'))+'<circle r="15" fill="currentColor" fill-opacity=".15"/>';
 case 'coins':return '<circle r="54"/><circle r="43"/><path d="M0-30V30M17-21C-29-39-29 8 1 0C33-8 30 39-16 22"/><path d="M-67-13V13M67-13V13"/>';
 case 'smoke':return '<path d="M-43 62C-5 29-69 4-25-30C6-54 50-10 11 15C-17 34-26-3-4-20C13-33 42-18 35-49M4 67C56 32 18 7 61-24" stroke-width="5" opacity=".7"/>';
 case 'banners':return '<path d="M-42 66V-65M42 66V-65M-39-55H-4L-14-18-4 8H-39M39-55H4L14-18 4 8H39M0-60V60M-13 60H13" fill="currentColor" fill-opacity=".12"/>';
 default:throw Error('Unknown motif: '+name);
 }
}
const motionFor=motif=>['water','wind','smoke','ribbons','cloud'].includes(motif)?'flow':['flame','sun','burst','fox'].includes(motif)?'ember':['lightning','circuits','eyes'].includes(motif)?'pulse':['notes','paper','petals','flowers','leaves','feathers'].includes(motif)?'float':['blades','shards','frost','glass'].includes(motif)?'prism':['wings','flight','beast','guardian'].includes(motif)?'flight':'orbit';
const descriptions=['Cadre ouvert, halo asymétrique et trois sceaux dessinés.','Composition diagonale, double halo et quatre sceaux dessinés.','Portique prestige, rayons, ailes de cadre et six sceaux dessinés.'];
function svg(card,level,brief){
 const primary=brief[1],secondary=brief[2],motifs=brief[3].split(','),names=brief[4].split('|'),name=motifs[level-1];
 const stamp=crypto.createHash('sha256').update(card.id).digest()[0],tilt=(stamp%9)-4,variant=stamp%3;
 const gradient='paint-'+card.id+'-'+level,glow='light-'+card.id+'-'+level;
 const symbol=(m,x,y,scale,angle=0,opacity=1)=>'<g transform="translate('+x+' '+y+') rotate('+angle+') scale('+scale+')" opacity="'+opacity+'" color="'+primary+'" stroke="url(#'+gradient+')" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">'+motif(m)+'</g>';
 const ticks=repeat(12,i=>'<path d="M'+(42+i*30)+' 568v'+(i%3===0?-10:-4)+'"/>');
 const start='<svg xmlns="http://www.w3.org/2000/svg" width="420" height="600" viewBox="0 0 420 600" role="img" aria-labelledby="title desc"><title id="title">'+xml(card.name)+' — '+xml(names[level-1])+'</title><desc id="desc">Composition vectorielle originale. '+xml(descriptions[level-1]+' Motif : '+motifNames[name]+'. Portrait conservé séparément.')+'</desc><defs><linearGradient id="'+gradient+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+primary+'"/><stop offset=".48" stop-color="'+secondary+'"/><stop offset="1" stop-color="'+primary+'"/></linearGradient><radialGradient id="'+glow+'"><stop stop-color="'+primary+'" stop-opacity=".27"/><stop offset="1" stop-color="'+primary+'" stop-opacity="0"/></radialGradient></defs>';
 let body='<ellipse cx="'+(variant===0?80:340)+'" cy="'+(190+variant*90)+'" rx="185" ry="235" fill="url(#'+glow+')"/>';
 if(level===1){
  body+='<g fill="none" stroke="url(#'+gradient+')"><path d="M23 171V43L55 17H365L397 43V171M397 429V557L365 583H55L23 557V429" stroke-width="3"/><path d="M32 166V49L61 26H359L388 49V166M388 434V551L359 574H61L32 551V434" opacity=".6"/><path d="M15 214V386M405 214V386M14 300H31M389 300H406" stroke-width="2"/><ellipse cx="210" cy="108" rx="139" ry="73" opacity=".4" transform="rotate('+tilt+' 210 108)"/>'+ticks+'</g>';
  body+=symbol(name,68,91,.72,-20+tilt)+symbol(name,352,491,.72,160+tilt,.8)+symbol(motifs[2],210,552,.29,0,.8);
 }else if(level===2){
  body+='<g fill="none" stroke="url(#'+gradient+')"><path d="M9 204 36 173V53L89 14H331L384 53V173L411 204V396L384 427V547L331 586H89L36 547V427L9 396Z" stroke-width="3"/><path d="M23 216 50 183V62L94 28H326L370 62V183L397 216M23 384 50 417V538L94 572H326L370 538V417L397 384" stroke-width="1" opacity=".65"/><path d="M50 170 370 426M50 426 370 170" opacity=".18" stroke-width="12"/><path d="M19 241V359M401 241V359" stroke-width="5"/><ellipse cx="210" cy="286" rx="184" ry="246" opacity=".4" transform="rotate('+(-9+tilt)+' 210 286)"/><ellipse cx="210" cy="286" rx="175" ry="239" opacity=".4" transform="rotate('+(9+tilt)+' 210 286)"/>'+ticks+'</g>';
  body+=symbol(name,58,302,.86,-18+tilt,.86)+symbol(name,362,302,.86,18-tilt,.86)+symbol(name,210,61,.62,0)+symbol(motifs[0],210,547,.42,0,.9);
 }else{
  body+='<g fill="none" stroke="url(#'+gradient+')"><path d="M8 152 35 106 35 55 88 35 140 21 210 5 280 21 332 35 385 55 385 106 412 152V448L385 494V545L332 565 280 579 210 595 140 579 88 565 35 545V494L8 448Z" stroke-width="3"/><path d="M22 160 49 112V66L95 49 143 35 210 19 277 35 325 49 371 66V112L398 160V440L371 488V534L325 551 277 565 210 581 143 565 95 551 49 534V488L22 440Z" opacity=".6"/><path d="M23 473V207Q23 52 210 25Q397 52 397 207V473M43 476V216Q43 71 210 45Q377 71 377 216V476" opacity=".45"/><path d="M37 110 78 167 25 226M383 110 342 167 395 226M36 491 83 440 25 383M384 491 337 440 395 383" stroke-width="6" opacity=".4"/>'+repeat(13,i=>'<path d="M'+(48+i*27)+' 39L'+(210+(i-6)*12)+' 85" opacity=".28"/>')+ticks+'</g>';
  body+=symbol(name,210,56,.85,0,.92)+symbol(name,48,305,.88,-35+tilt,.92)+symbol(name,372,305,.88,35-tilt,.92)+symbol(name,210,548,.68,180,.9)+symbol(motifs[0],78,465,.47,18,.6)+symbol(motifs[1],342,465,.47,-18,.6);
 }
 body+='<g fill="'+secondary+'">'+repeat(level*6+4,i=>{const y=98+((i*79+stamp)%410),x=i%2?391-((i*7)%36):29+((i*7)%36),r=(i%3===0?2.8:1.4);return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" opacity="'+(.3+(i%4)*.13)+'"/>';})+'</g>';
 const monogram=card.name.split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('');
 body+='<g fill="'+secondary+'" font-family="Georgia,serif" text-anchor="middle"><text x="210" y="30" font-size="11" letter-spacing="5">'+xml(monogram)+'</text><text x="365" y="566" font-size="12">'+['','I','II','III'][level]+'</text></g>';
 return start+body+'</svg>\n';
}

const manifest=[];let localPortraits=0,remotePortraits=0,assetBytes=0;const hashes=new Set();
const parserDOM=new JSDOM(''),parser=new parserDOM.window.DOMParser();
for(const row of mythics){
 const c=row.card,b=entries.get(row.id);assert.match(b[1],/^#[0-9a-fA-F]{6}$/);assert.match(b[2],/^#[0-9a-fA-F]{6}$/);const motifs=b[3].split(','),names=b[4].split('|');assert.equal(motifs.length,3);assert.equal(names.length,3);assert.equal(new Set(names).size,3);for(const m of motifs)assert.ok(motifNames[m],m);
 const image=String(c.image);if(/^https:\/\//.test(image)){const url=new URL(image);assert.ok(['s4.anilist.co','s3.anilist.co'].includes(url.hostname));remotePortraits++;}else{assert.ok(image.startsWith('assets/portraits/'));await fs.access(path.join('dist',image));localPortraits++;}
 const entry={id:row.id,name:c.name,series:c.series,image,portraitLocal:!/^https:/.test(image),source:'https://anilist.co/character/'+row.source_id,colors:[b[1],b[2]],maxLevel:3,levels:[]};
 for(let level=1;level<=3;level++){
  const drawing=svg(c,level,b),asset='assets/awakenings/'+row.id+'-'+level+'.svg',parsed=parser.parseFromString(drawing,'image/svg+xml');assert.equal(parsed.querySelector('parsererror'),null,'Malformed SVG '+asset);assert.equal(parsed.querySelector('script,foreignObject,image,animate,animateTransform'),null,'SVG asset has no external resources or unmanaged animation');
  const digest=crypto.createHash('sha256').update(drawing).digest('hex');assert.ok(!hashes.has(digest),'Every form needs a distinct composition');hashes.add(digest);await fs.writeFile('dist/'+asset,drawing);assetBytes+=Buffer.byteLength(drawing);
  entry.levels.push({level,title:['','Révélation','Ascension','Transcendance'][level],name:names[level-1],description:descriptions[level-1]+' '+motifNames[motifs[level-1]]+'.',motif:motifs[level-1],motion:motionFor(motifs[level-1]),asset,composition:['','halo','diagonal','prestige'][level],sha256:digest,illustration:illustrationIndex.get(row.id+':'+level)||null});
 }
 manifest.push(entry);
}
parserDOM.window.close();

function install(manifest){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const index=new Map(manifest.map(row=>[row.id,row]));
 const validImage=value=>/^assets\/(?:portraits|awakening-illustrations)\/[A-Za-z0-9_.-]+$/.test(value)||/^https:\/\/(?:s4|s3)\.anilist\.co\/[^\s<>"'\\]+$/.test(value);
 function render(card,level=0,options={}){
  const input=typeof card==='string'?index.get(card):card;
  if(!input)return '';
  const entry=input.rarity&&input.rarity!=='Mythique'?null:index.get(String(input.id));
  const stage=Math.max(0,Math.min(entry?.maxLevel||0,Math.floor(Number(level)||0))),form=entry?.levels[stage-1],image=form?.illustration?.image||entry?.image||String(input.image||''),name=entry?.name||String(input.name||'Carte');
  const compact=options.compact===true,animated=!!stage&&options.animate===true&&!compact;
  const colors=entry?.colors||['#a5a5b9','#f5f2fa'],title=form?form.title+' · '+form.name:'Présentation originale';
  const imageMarkup=validImage(image)?'<img class="kma-portrait" data-kma-portrait '+(form?.illustration?'data-kma-fallback="'+esc(entry.image)+'" ':'')+'src="'+esc(image)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'';
  const particles=animated?'<span class="kma-particles" aria-hidden="true">'+Array.from({length:stage===3?10:6},(_,i)=>'<i style="--kma-n:'+i+';--kma-x:'+(8+(i*37)%85)+'%;--kma-y:'+(15+(i*53)%75)+'%"></i>').join('')+'</span>':'';
  return '<div class="kma-card'+(compact?' kma-compact':'')+(animated?' kma-animated':'')+(form?.illustration?' kma-illustrated':'')+'" data-kma-fit="'+(form?.illustration?.fit==='contain'?'contain':'cover')+'" data-kma-card="'+esc(input.id)+'" data-kma-level="'+stage+'" data-kma-motion="'+esc(form?.motion||'none')+'" role="img" aria-label="'+esc(name+' — '+title)+'" style="--kma-primary:'+colors[0]+';--kma-secondary:'+colors[1]+'"><span class="kma-backdrop" aria-hidden="true"></span><span class="kma-aura" aria-hidden="true"></span><span class="kma-monogram" aria-hidden="true">'+esc(name.split(/\s+/).map(s=>s[0]).slice(0,2).join(''))+'</span>'+imageMarkup+(form?'<img class="kma-frame" src="'+form.asset+'" alt="" loading="lazy" decoding="async">':'')+particles+'<span class="kma-unavailable">Portrait indisponible</span><span class="kma-art-warning">Illustration indisponible · portrait original</span><span class="kma-caption" aria-hidden="true"><small>'+esc(form?form.title:'ORIGINALE')+'</small><strong>'+esc(form?form.name:name)+'</strong></span></div>';
 }
 for(const row of manifest){row.colors=Object.freeze(row.colors);row.levels=Object.freeze(row.levels.map(Object.freeze));Object.freeze(row);}Object.freeze(manifest);
 window.KizunaMythicArt=Object.freeze({manifest,render,get:id=>index.get(String(id))||null});
 document.addEventListener('error',event=>{const target=event.target;if(target?.matches?.('img[data-kma-portrait]')){const card=target.closest('.kma-card');if(!card)return;const fallback=target.dataset.kmaFallback;if(fallback&&validImage(fallback)){delete target.dataset.kmaFallback;card.classList.remove('kma-illustrated');card.classList.add('kma-art-fallback');target.src=fallback;return;}if(!card.classList.contains('kma-portrait-unavailable')){card.classList.add('kma-portrait-unavailable');card.setAttribute('aria-label',card.getAttribute('aria-label')+' — portrait indisponible');}}},true);
}
const runtime='/* Generated by scripts/build-mythic-art.mjs. Canonical portraits, sourced/generated illustrations and original SVG frames. */\n('+install.toString()+')('+JSON.stringify(manifest)+');\n';
new vm.Script(runtime);await fs.writeFile('dist/kizuna-mythic-art.js',runtime);

const runtimeDOM=new JSDOM('<body></body>',{runScripts:'outside-only'});runtimeDOM.window.eval(runtime);
for(const entry of manifest){for(let level=0;level<=3;level++){const markup=runtimeDOM.window.KizunaMythicArt.render(entry,level,{compact:true,animate:true});runtimeDOM.window.document.body.innerHTML=markup;const card=runtimeDOM.window.document.querySelector('.kma-card');assert.ok(card);assert.equal(card.dataset.kmaLevel,String(level));assert.equal(card.classList.contains('kma-animated'),false,'Compact cards must never animate');assert.equal(runtimeDOM.window.document.querySelectorAll('.kma-frame').length,level?1:0);assert.equal(runtimeDOM.window.document.querySelector('.kma-portrait').getAttribute('src'),level?entry.levels[level-1].illustration?.image||entry.image:entry.image);}}
runtimeDOM.window.document.body.innerHTML=runtimeDOM.window.KizunaMythicArt.render({...manifest[0],rarity:'Rare'},3);assert.equal(runtimeDOM.window.document.querySelector('.kma-frame'),null,'A non-Mythic cannot borrow a Mythic transformation');
runtimeDOM.window.document.body.innerHTML=runtimeDOM.window.KizunaMythicArt.render({id:'bad',name:'<img src=x onerror=alert(1)>',image:'javascript:alert(1)'},3);assert.equal(runtimeDOM.window.document.querySelector('img'),null);runtimeDOM.window.close();

let report='# Catalogue artistique des Éveils mythiques\n\n'+manifest.length+' cartes Mythiques identifiées par leurs identifiants exacts ; **3 Éveils par carte, soit '+manifest.length*3+' compositions SVG originales**.\n\nLes portraits existants sont conservés : '+localPortraits+' images locales et '+remotePortraits+' URL AniList déjà utilisées par le catalogue. Aucune nouvelle illustration de personnage n’a été téléchargée ni générée. Les noms des niveaux sont propres à Kizuna. Les illustrations peuvent représenter une forme canonique ou une scène originale, et les crédits précisent leur provenance.\n\nLes noms et motifs sont des choix de direction artistique. Chaque fiche source est reliée par l’identifiant AniList déjà enregistré. Les exemples Naruto/Sasuke/Itachi suivent le brief du projet. [Fiches officielles Bleach](https://bleach-anime.com/en/character/) consultées pour Ichigo et Rukia.\n\n## Rendu réel\n\nLes illustrations remplissent la carte sans découpe ni inclinaison. Les visuels officiels détourés restent entiers sur le fond. La surcouche et la légende donnent une identité à chaque niveau sans remplacer le dessin.\n\n- Révélation : cadre ouvert, halo asymétrique, motifs de personnage aux coins.\n- Ascension : cadre à décrochements, double halo et motifs latéraux.\n- Transcendance : portique rayonnant, cadres latéraux et cinq motifs de prestige.\n- 45 familles vectorielles dessinées ; palettes, succession de motifs et noms choisis pour chacun des 197 identifiants. Les effets évoquent aussi la musique, la couture, les lettres, le sport ou la stratégie des personnages sans leur inventer des pouvoirs.\n- Grandes présentations : particules selon sept mouvements (flux, braises, pulsation lente, flottement, prisme, envol ou orbite). Les grilles restent statiques.\n- Le mode réduit supprime les animations et transitions ; aucune animation embarquée dans les SVG. Aucun Canvas/WebGL ni vidéo permanent.\n\n## Intégration\n\n`window.KizunaMythicArt.manifest` contient les fiches avec `id`, `name`, `series`, `image`, `source`, `maxLevel`, `colors`, `portraitLocal`, `levels`. Chaque niveau indique `level`, `title`, `name`, `description`, `motif`, `motion`, `asset`, `composition`, `sha256`, `illustration`. `render(card, level, {compact, animate})` renvoie le HTML échappé ; le niveau 0 affiche le portrait original. Une carte non Mythique ou inconnue ne reçoit jamais d’Éveil. Le choix du niveau réellement débloqué reste contrôlé par le serveur et le module d’interface appelant.\n\nGénération : `node scripts/build-mythic-art.mjs`. Option `--check-remote` : vérification HTTP HEAD des 44 URL retenues, sans enregistrer d’image. Le générateur refuse un catalogue mythique sans direction explicite ou une image locale absente.\n\n## Vérifications et limites\n\nLe générateur vérifie la couverture exacte des IDs, les 3 niveaux par carte, les 591 empreintes distinctes, le XML de chaque SVG, l’absence de scripts/ressources distantes dans les surcouches, la présence des portraits locaux, le rendu HTML des 788 états (originale + 3 Éveils), l’absence d’animation compacte et l’échappement. Les portraits distants restent dépendants d’AniList ; un état « Portrait indisponible » est prévu si une image ne se charge pas.\n\nAucune prise de contrôle du PC ni inspection de navigateur n’est réalisée par ce générateur. Les contrôles fonctionnels DOM ne remplacent pas une inspection visuelle mobile/ordinateur. Voir le compte rendu de livraison pour les vérifications réellement effectuées.\n';
for(const [series,rows] of Object.entries(Object.groupBy(manifest,row=>row.series))){report+='\n## '+series+'\n\n| Carte / identifiant exact | Révélation | Ascension | Transcendance |\n|---|---|---|---|\n';for(const row of rows)report+='| ['+row.name+']('+row.source+') · `'+row.id+'` | '+row.levels.map(l=>l.name+' — '+motifNames[l.motif]).join(' | ')+' |\n';}
report=report.replace('Aucune nouvelle illustration de personnage n’a été téléchargée ni générée.',illustrations.length+' illustrations alternatives sont intégrées aux Éveils : '+illustrations.filter(x=>x.kind==='official').length+' visuels officiels sourcés et '+illustrations.filter(x=>x.kind==='generated').length+' créations originales générées pour Kizuna. La sélection Originale conserve le portrait initial.');
await fs.writeFile('docs/MYTHIC-ART-CATALOGUE.md',report.replace('cinq motifs de prestige','six motifs de prestige'));
console.log(JSON.stringify({mythics:manifest.length,levelsPerCard:3,localSVGs:hashes.size,localPortraits,retainedRemotePortraits:remotePortraits,assetBytes,motifFamilies:Object.keys(motifNames).length,validation:'exact coverage, 591 distinct valid SVGs, 788 rendered states, compact/reduced-motion contract and HTML escaping'}));

if(process.argv.includes('--check-remote')){
 const remaining=manifest.filter(c=>!c.portraitLocal),results=[];
 await Promise.all(Array.from({length:3},async()=>{while(remaining.length){const c=remaining.shift();try{const r=await fetch(c.image,{method:'HEAD',signal:AbortSignal.timeout(15000)});results.push({id:c.id,status:r.status,type:r.headers.get('content-type'),bytes:r.headers.get('content-length')});}catch(error){results.push({id:c.id,error:error.cause?.code||error.message});}}}));
 console.log(JSON.stringify({remotePortraitChecks:results.length,ok:results.filter(r=>r.status===200&&r.type?.startsWith('image/')).length,failures:results.filter(r=>r.status!==200||!r.type?.startsWith('image/'))}));
}
