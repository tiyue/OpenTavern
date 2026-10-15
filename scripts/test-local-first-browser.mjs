import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {captureBrowserEvidence} from './check-release.mjs';

const modulePath=process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const {chromium}=await import(path.isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const url=process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output=process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(),'opentavern-local-first-'));
await mkdir(output,{recursive:true});
const origin=new URL(url).origin,base=new URL('.',url);
const manifestUrl=new URL('offline-manifest.json',base).href;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const evidence={};let context;
const profile=await mkdtemp(path.join(os.tmpdir(),'opentavern-offline-profile-'));
const options={channel:'chrome',headless:true,viewport:{width:1280,height:900}};
const probe='Object.assign(window,{state,dom,getActiveConv,normalizeConversation,persistState,StorageService,requestFullRender,switchView,applyUiTheme,LocalResourceManager,PrivateMediaLocal,importPublicCard,importCharacterCard,characterHasRegexScripts,PUBLIC_CARDS,CONTRIBUTOR_CARDS,openSettings,discardSettingsDraft,buildAppDataSnapshot});\n';
async function seed(target) {
 await target.addInitScript(()=>{localStorage.setItem('opentavern_onboarding_completed_v1','1');localStorage.setItem('opentavern_announce_dismissed_v1','1');});
}
async function waitReady(page){await page.waitForFunction(()=>typeof LocalResourceManager==='object'&&typeof getActiveConv==='function'&&getActiveConv(),null,{timeout:30000});}
try {
 context=await chromium.launchPersistentContext(profile,options);await seed(context);
 let candidate=null,fault='',downloads=[];const candidates=new Map(),external=[];
 await context.route('**/*',async route=>{
  const request=route.request(),target=new URL(request.url());
  if(target.origin==='https://private-media-test.invalid')return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'),contentType:'image/png',headers:{'access-control-allow-origin':'*'}});
  if(target.origin!==origin){external.push(target.href);return route.abort();}
  if(candidate&&target.href===manifestUrl)return route.fulfill({json:candidate});
  const entry=candidates.get(target.href);
  if(entry){downloads.push(target.href);return route.fulfill({status:200,body:fault==='hash'?Buffer.from('wrong'):entry.bytes,contentType:fault==='mime'?'text/html':entry.mime});}
  // The page-only probe does not alter bytes downloaded/hashed by the resource manager.
  if(target.pathname.endsWith('/assets/js/app.js')&&request.resourceType()==='script'){
   const response=await route.fetch(),bundle=await response.text(),end=bundle.lastIndexOf('})();');assert.ok(end>0);
   return route.fulfill({response,body:bundle.slice(0,end)+probe+bundle.slice(end)});
  }
  return route.continue();
 });
 let page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.goto(url);await waitReady(page);
 const original=await (await fetch(manifestUrl)).json();assert.equal(original.public.length,296);
 await page.evaluate(async()=>{
  const c=getActiveConv();c.title='offline-history-proof';c.character={name:'离线验收',extensions:{}};
  c.messages=[{id:'offline-history-proof',role:'user',content:'offline-history-proof'},{id:'offline-reply',role:'assistant',content:'本地保存后重开',attachments:[{type:'image',url:'https://private-media-test.invalid/image.png'}]}];normalizeConversation(c);
  Object.assign(state.settings,{globalRegexEnabled:false,restoreLastChat:true,apiKey:'synthetic',saveApiKey:true,model:'synthetic',apiEndpoint:new URL('/__never_model',location.href).href});switchView('chat');requestFullRender();await persistState(true,{throwOnError:true});
  await PrivateMediaLocal.prepareMessage(c.id,'offline-reply');
  const bytes=getActiveConv().messages.find(m=>m.id==='offline-reply').attachments[0].dataUrl;
  if(!bytes||!bytes.startsWith('data:image/png;base64,'))throw new Error('私有图片实际解码/可靠保存失败');
  const exported=JSON.parse(JSON.stringify(buildAppDataSnapshot({skipSettingsFormSync:true})));
  if(exported.conversations[c.id].messages.find(m=>m.id==='offline-reply').attachments[0].dataUrl!==bytes)throw new Error('完整备份必须保留私有图片字节');
  await LocalResourceManager.start();await LocalResourceManager.checkForUpdates();await LocalResourceManager.preparePublic();await LocalResourceManager.refreshStatus();
 });
 await page.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:30000});
 evidence.prepared=await page.evaluate(()=>LocalResourceManager.getStatus());
 assert.equal(evidence.prepared.core.state,'ready');assert.equal(evidence.prepared.public.ready,296);assert.equal(evidence.prepared.public.bytes,original.public.reduce((n,e)=>n+e.bytes,0));
 assert.equal(evidence.prepared.public.bytes,evidence.prepared.public.bytesTotal);assert.equal(external.length,0);
 await context.setOffline(true);
 evidence.allPublicOffline=await page.evaluate(async manifest=>{
  let cursor=0,count=0,bytes=0;
  async function read(){while(cursor<manifest.public.length){const entry=manifest.public[cursor++];const response=await fetch(new URL(entry.path,new URL('.',location.href)));if(!response.ok)throw new Error('离线公开文件不可用：'+entry.path);const buffer=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');if(buffer.byteLength!==entry.bytes||digest!==entry.sha256)throw new Error('离线文件字节不符：'+entry.path);count++;bytes+=buffer.byteLength;}}
  await Promise.all([read(),read()]);return {count,bytes};
 },original);
 assert.equal(evidence.allPublicOffline.count,296);
 evidence.offlineImport=await page.evaluate(async()=>{
  window.__suppressPublicCardImportToast=true;
  for(const card of PUBLIC_CARDS.concat(CONTRIBUTOR_CARDS)){
   const json=await(await LocalResourceManager.readPublic(card.jsonUrl)).json();const parsed=importCharacterCard(json);
   if(!parsed||!parsed.name||characterHasRegexScripts(parsed))continue;
   const imported=await importPublicCard(card);if(!imported)throw new Error('未访问角色卡离线导入失败');await PrivateMediaLocal.prepareAll();await persistState(true,{throwOnError:true});
   const backup=JSON.parse(JSON.stringify(buildAppDataSnapshot({skipSettingsFormSync:true})));const saved=backup.characters[imported.name.trim().toLowerCase()];if(!saved)throw new Error('离线导入未进入备份');if(card.previewImage&&!saved.previewImage.startsWith('data:image/'))throw new Error('已缓存公共预览也应能离线保存为私人副本');return imported.name;
  }
  throw new Error('缺少无正则的真实导入测试卡');
 });
 await context.setOffline(false);
 const loaded=await page.evaluate(()=>JSON.stringify(window.__OT_RUNTIME__));

 // Construct a full changed snapshot while retaining unchanged public content digests.
 const nextId=(original.releaseId[0]==='f'?'e':'f')+original.releaseId.slice(1);
 const next=structuredClone(original);next.releaseId=nextId;
 for(const entry of next.core){
  const address=new URL('assets/offline/'+original.releaseId+'/'+entry.path,base).href;
  const response=await fetch(address);assert.ok(response.ok,address);let bytes=Buffer.from(await response.arrayBuffer());
  const isHtml=entry.mime.split(';')[0]==='text/html';
  if(isHtml)bytes=Buffer.from(bytes.toString('utf8').replaceAll(original.releaseId,nextId));
  entry.bytes=bytes.length;entry.sha256=sha(bytes);
  // HTML 核心走 .txt 纯文本传输副本，其余核心保持原路径。
  candidates.set(new URL('assets/offline/'+nextId+'/'+(isHtml?entry.path+'.txt':entry.path),base).href,{bytes,mime:isHtml?'text/plain':entry.mime});
 }
 // Keep declared byte totals exact when HTML replacement changes nothing but release bytes.
 if(next.totals?.core)next.totals.core.bytes=next.core.reduce((n,e)=>n+e.bytes,0);
 // 等前台恢复触发的已有检查结束，再切换服务器故障，避免复用故障注入前的正常响应。
 await page.evaluate(()=>LocalResourceManager.checkForUpdates());
 fault='mime';candidate=next;
 for(const problem of ['mime','hash','quota']) {
  fault=problem==='quota'?'':problem;
  if(problem==='quota')await page.evaluate(id=>{window.__cachePut=Cache.prototype.put;Cache.prototype.put=function(request,response){if(String(request.url||request).includes(id))return Promise.reject(new DOMException('test quota','QuotaExceededError'));return window.__cachePut.call(this,request,response);};},nextId);
  const result=await page.evaluate(async()=>{try{await LocalResourceManager.checkForUpdates();return {error:'',status:LocalResourceManager.getStatus()};}catch(e){return {error:e.message,status:LocalResourceManager.getStatus()};}});
  if(problem==='quota')await page.evaluate(()=>{Cache.prototype.put=window.__cachePut;});
  assert.ok(result.error,'bad '+problem+' snapshot must be rejected');assert.equal(result.status.activeReleaseId,original.releaseId);
  assert.equal(result.status.core.state,'ready','新版失败不能把完整旧版显示为不可用');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__OT_RUNTIME__)),loaded,'discovered update must not retarget the running app');
  evidence['rejected_'+problem]=result.error;
 }
 fault='';downloads=[];await page.evaluate(()=>LocalResourceManager.checkForUpdates());
 evidence.update=await page.evaluate(()=>LocalResourceManager.getStatus());assert.equal(evidence.update.update.available,true);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__OT_RUNTIME__)),loaded);
 // No duplicate full download when all staged entries are already verified.
 downloads=[];await page.evaluate(()=>LocalResourceManager.checkForUpdates());assert.equal(downloads.length,0);
 const other=await context.newPage();await other.goto(url);await other.waitForSelector('#messageInput',{state:'attached'});
 const multi=await page.evaluate(async()=>{try{await LocalResourceManager.applyUpdate();return '';}catch(e){return e.message;}});assert.ok(multi);evidence.multiTab=multi;await other.close();
 await page.locator('#messageInput').fill('未保存草稿');
 const draft=await page.evaluate(async()=>{try{await LocalResourceManager.applyUpdate();return '';}catch(e){return e.message;}});assert.ok(draft);evidence.draft=draft;await page.locator('#messageInput').fill('');
 await page.evaluate(()=>openSettings());await page.locator('#settingsTabModel').click();await page.locator('#apiEndpoint').fill(new URL('/unsaved-endpoint',url).href);
 const formDraft=await page.evaluate(async()=>{try{await LocalResourceManager.applyUpdate();return '';}catch(e){return e.message;}});assert.ok(formDraft,'尚未读取进 settingsFormDraft 的表单输入也必须阻止更新');evidence.formDraft=formDraft;
 await page.evaluate(()=>discardSettingsDraft());
 // Unlisted APIs and authorized requests must never become shared cached responses.
 await page.evaluate(async()=>{try{await fetch(new URL('api/not-a-real-endpoint',location.href),{headers:{Authorization:'Bearer synthetic-local-first-test'}});}catch(_){}});
 const keys=await page.evaluate(async()=>{const all=[];for(const name of await caches.keys())for(const req of await (await caches.open(name)).keys())all.push(req.url);return all;});
 assert.ok(keys.every(k=>!k.includes('/api/')&&!k.includes('synthetic-local-first-test')));
 assert.ok(keys.every(k=>!k.includes('private-media-test.invalid')),'私有图片不能进入公共缓存');evidence.privateImageBackupBytes=true;
 await page.evaluate(()=>openSettings());await page.locator('#settingsTabWorkspace').click();await page.locator('#localResourceSection').scrollIntoViewIfNeeded();
 Object.assign(evidence,await captureBrowserEvidence(page,output));await page.evaluate(()=>discardSettingsDraft());
 // Switch only by explicit idle user action, then prove actual offline navigation/new-page/restart.
 await page.evaluate(()=>LocalResourceManager.applyUpdate());
 await context.setOffline(true);await page.reload();await page.waitForSelector('[data-message-id="offline-history-proof"]',{state:'attached'});
 assert.equal(await page.evaluate(()=>window.__OT_RUNTIME__.releaseId),nextId);evidence.offlineReload=true;
 await page.locator('#topSettingsBtn').click();await page.locator('#settingsTabWorkspace').click();
 await page.waitForFunction(()=>document.getElementById('localResourceCore').textContent.includes('17')&&document.getElementById('localResourcePublic').textContent.includes('296/296'));
 await page.locator('#settingsDiscardBtn').click();
 await page.waitForSelector('[data-message-id="offline-reply"] img[src^="data:image/png;base64,"]',{state:'attached'});evidence.privateImageOffline=true;
 const newPage=await context.newPage();await newPage.goto(url);await newPage.waitForSelector('[data-message-id="offline-history-proof"]',{state:'attached'});evidence.offlineNewPage=true;await newPage.close();
 const publicRead=await page.evaluate(async entry=>{const r=await fetch(new URL(entry.path,new URL('.',location.href)));return {ok:r.ok,bytes:(await r.arrayBuffer()).byteLength};},original.public.find(e=>e.path.endsWith('.json')));
 assert.ok(publicRead.ok);evidence.unvisitedPublicJson=publicRead;
 await context.close();context=await chromium.launchPersistentContext(profile,options);await context.setOffline(true);
 page=await context.newPage();await page.goto(url);await page.waitForSelector('[data-message-id="offline-history-proof"]',{state:'attached'});evidence.offlineBrowserRestart=true;
 await context.close();context=null;
 const browser=await chromium.launch(options);try{const virgin=await browser.newContext();await virgin.setOffline(true);const p=await virgin.newPage();await assert.rejects(()=>p.goto(url,{timeout:10000}));evidence.firstVisitOfflineRejected=true;}finally{await browser.close();}
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:true,output,...evidence}));
}catch(error){if(context){const p=context.pages().at(-1);if(p)await p.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw error;}
finally{if(context)await context.close();}
