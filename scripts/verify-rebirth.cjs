/* Browser regression check. Requires Playwright and a local guest preview on 4173.
   CHROMIUM_PATH may select a system Chromium without downloading a browser. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.waitForSelector('.rb-journal',{state:'attached'});
 const snapshot=()=>page.evaluate(()=>{const s=KizunaGame.getSnapshot();return {owned:s.owned,chakra:s.chakra,free:s.stock.free,inv:s.stock.inv}});
 const before=await snapshot();
 for(const tab of ['home','boosts','col','nexus','market']){await page.locator('.kz-shell-nav [data-tab="'+tab+'"]').click();assert.equal(await page.locator('body').getAttribute('data-tab'),tab)}
 await page.locator('#kzaMenuButton').click();await page.locator('[data-kza-destination="wiki"]').click();assert.equal(await page.locator('body').getAttribute('data-tab'),'wiki');
 await page.locator('#kzaMenuButton').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#kzaNavigation').evaluate(d=>d.open),false);
 await page.locator('.kz-shell-nav [data-tab="boosts"]').click();
 await page.locator('.rb-odds summary').click();assert.equal(await page.locator('#kBars').isVisible(),true);await page.locator('.rb-odds summary').click();
 await page.locator('#kOpen1').click();await page.waitForSelector('#kyaraRevealRoot[data-phase="pack"]');assert.deepEqual(await snapshot(),before,'Preparing a pack never spends');
 await page.locator('[data-kr-action="close"]').click();assert.deepEqual(await snapshot(),before,'Cancellation never spends');
 await page.locator('#kOpen1').click();await page.locator('[data-kr-action="open-pack"]').click();await page.waitForSelector('#kyaraRevealRoot[data-phase="opening"]',{timeout:15000});
 fs.mkdirSync('outputs/rebirth',{recursive:true});await page.waitForTimeout(900);await page.screenshot({path:'outputs/rebirth/after-reveal.png'});
 await page.locator('[data-kr-action="all"]').click();await page.waitForSelector('#kyaraRevealRoot[data-phase="finale"]');
 assert.equal(await page.locator('.kr-finale-card').count(),5);
 const after=await snapshot();assert.equal(after.owned.length,before.owned.length+5);assert.equal(after.chakra,before.chakra);assert.equal(after.free+after.inv,before.free+before.inv-1);
 await page.locator('[data-kr-action="close"]').click();await page.reload();await page.waitForSelector('.rb-journal',{state:'attached'});assert.deepEqual(await snapshot(),after,'Acquisitions persist across reload');
 for(const [size,width,height] of [['desktop',1600,1000],['laptop',1280,800],['mobile',390,844]]){
  await page.setViewportSize({width,height});
  for(const tab of ['home','boosts']){await page.evaluate(t=>KizunaGame.showTab(t),tab);await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),size+' '+tab+' overflows');await page.screenshot({path:`outputs/rebirth/checked-${size}-${tab}.png`});}
 }
 await page.evaluate(()=>KizunaExperience.setPreference('reduce',true));assert.equal(await page.locator('html').getAttribute('data-kz-motion'),'reduced');
 assert.deepEqual(errors,[]);console.log('PASS: navigation, keyboard dialog, odds, cancellation, five-card draw, wallet, stock, persistence, 3 viewport widths, reduced motion; no browser errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
