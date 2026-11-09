import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {captureBrowserEvidence} from './check-release.mjs';

const modulePath=process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const {chromium}=await import(path.isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const url=process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output=process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(),'opentavern-local-render-'));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
await context.addInitScript(()=>{localStorage.setItem('opentavern_onboarding_completed_v1','1');localStorage.setItem('opentavern_announce_dismissed_v1','1');});
await context.route('**/*',async route=>{
 const target=new URL(route.request().url());
 if(target.origin!==new URL(url).origin)return route.abort();
 if(target.pathname.endsWith('/assets/js/app.js')) {
  const response=await route.fetch(),bundle=await response.text(),end=bundle.lastIndexOf('})();');assert.ok(end>0);
  const probe='Object.assign(window,{state,dom,appStore,getActiveConv,normalizeConversation,renderMessagesOnly,renderConversationListOnly,requestFullRender,switchView,loadConversation,applyUiTheme,loadMoreHistory,toggleMessageFavorite,persistState});window.__copied=[];copyMessageText=function(text){window.__copied.push(text);};\n';
  return route.fulfill({response,body:bundle.slice(0,end)+probe+bundle.slice(end)});
 }
 return route.continue();
});
const evidence={environment:{browser:browser.version(),platform:process.platform,viewport:{width:1280,height:900}}};
async function measureChatEntry(){
 return page.evaluate(()=>{
  const container=dom.messagesContainer,rows=Array.from(container.querySelectorAll('[data-message-id]')),last=rows.at(-1);
  const containerRect=container.getBoundingClientRect(),lastRect=last&&last.getBoundingClientRect();
  return {rows:rows.length,lastId:last&&last.dataset.messageId,gap:container.scrollHeight-container.scrollTop-container.clientHeight,
   scrollTop:container.scrollTop,chatVisible:!document.getElementById('chatView').classList.contains('hidden'),
   lastVisible:!!(lastRect&&lastRect.bottom>containerRect.top+1&&lastRect.top<containerRect.bottom-1)};
 });
}
try {
 await page.goto(url);await page.waitForFunction(()=>typeof getActiveConv==='function'&&getActiveConv());
 await page.addStyleTag({content:'.msg-enter { animation: none !important; transition: none !important; }'});
 await page.evaluate(()=>{
  const conv=getActiveConv();conv.character={name:'局部渲染验收',extensions:{}};conv.title='局部渲染';
  conv.messages=Array.from({length:8},(_,i)=>({id:'row-'+i,role:i%2?'assistant':'user',content:'row '+i+' '.repeat(4)+'验收正文'.repeat(15)}));
  normalizeConversation(conv);Object.assign(state.settings,{globalRegexEnabled:false,apiKey:'synthetic',model:'synthetic',apiEndpoint:new URL('/__never_model',location.href).href});conv._showAllMessages=true;switchView('chat');requestFullRender();
  window.__rows=Array.from(dom.messagesContainer.querySelectorAll('[data-message-id]'));window.__side=dom.convList.querySelector('[data-conv-id]');
 });
 evidence.same=await page.evaluate(()=>{
  let mutations=0;const observer=new MutationObserver(list=>mutations+=list.filter(x=>x.type==='childList').length);observer.observe(dom.messagesContainer,{childList:true,subtree:true});
  const focused=dom.messageInput;focused.value='保留草稿';focused.focus();focused.setSelectionRange(1,3);
  renderMessagesOnly();renderConversationListOnly();const identity=window.__rows.every(n=>n===dom.messagesContainer.querySelector('[data-message-id="'+n.dataset.messageId+'"]'));
  const side=window.__side===dom.convList.querySelector('[data-conv-id]');mutations+=observer.takeRecords().length;observer.disconnect();
  return {identity,side,mutations,focus:document.activeElement===focused,selection:[focused.selectionStart,focused.selectionEnd]};
 });
 assert.equal(evidence.same.identity,true);assert.equal(evidence.same.side,true);assert.equal(evidence.same.mutations,0);assert.equal(evidence.same.focus,true);assert.deepEqual(evidence.same.selection,[1,3]);
 evidence.edit=await page.evaluate(()=>{
  const conv=getActiveConv(),before=Array.from(dom.messagesContainer.querySelectorAll('[data-message-id]'));
  conv.messages[4].content='只更新这一条';conv._lastRenderedVisibleCount=0;renderMessagesOnly();
  return before.map((node,i)=>({i,same:node===dom.messagesContainer.querySelector('[data-message-id="'+node.dataset.messageId+'"]')}));
 });
 assert.equal(evidence.edit[4].same,false);assert.ok(evidence.edit.filter(x=>x.i!==4).every(x=>x.same),'普通正文编辑不应刷新无关行');
 await page.evaluate(()=>{
  const row=dom.messagesContainer.querySelector('[data-message-id="row-6"]');const frame=document.createElement('iframe');frame.srcdoc='<p>stable frame</p>';row.querySelector('.msg-bubble').append(frame);window.__frame=frame;
  getActiveConv().favoriteMessageIds=['row-1'];renderMessagesOnly();
 });
 assert.equal(await page.evaluate(()=>window.__frame.isConnected&&window.__frame===dom.messagesContainer.querySelector('[data-message-id="row-6"] iframe')),true);
 await page.evaluate(()=>{getActiveConv().messages.splice(0,1);renderMessagesOnly();});
 await page.locator('[data-message-id="row-6"] [data-action="copy"]').click();
 assert.equal(await page.evaluate(()=>window.__copied.at(-1)),await page.evaluate(()=>getActiveConv().messages.find(m=>m.id==='row-6').content));
 evidence.windows=[];
 for(const count of [150,151,500]) {
  const result=await page.evaluate(count=>{
   const conv=getActiveConv();delete conv._showAllMessages;conv._historyWindow=150;
   conv.messages=Array.from({length:count},(_,i)=>({id:'window-'+i,role:i%2?'assistant':'user',content:'窗口消息 '+i+'正文'.repeat(24)}));normalizeConversation(conv);renderMessagesOnly();
   const rows=Array.from(dom.messagesContainer.querySelectorAll('[data-message-id]'));dom.messagesContainer.scrollTop=Math.max(120,dom.messagesContainer.scrollHeight/2);
   const beforeTop=dom.messagesContainer.scrollTop;const started=performance.now();renderMessagesOnly();const renderMs=performance.now()-started;
   const same=rows.every(n=>n===dom.messagesContainer.querySelector('[data-message-id="'+n.dataset.messageId+'"]'));
   const scrollStable=Math.abs(dom.messagesContainer.scrollTop-beforeTop)<2;
   const keep=rows.at(-1);conv.messages.push({id:'window-new-'+count,role:'user',content:'new'});normalizeConversation(conv);renderMessagesOnly();
   return {count,renderMs,rows:rows.length,same,scrollStable,slidingRows:dom.messagesContainer.querySelectorAll('[data-message-id]').length,survivor:keep===dom.messagesContainer.querySelector('[data-message-id="'+keep.dataset.messageId+'"]')};
  },count);
  assert.equal(result.rows,150);assert.equal(result.same,true);assert.equal(result.scrollStable,true);assert.equal(result.slidingRows,150);assert.equal(result.survivor,true);evidence.windows.push(result);
 }
 evidence.earlier=await page.evaluate(()=>{
  const c=dom.messagesContainer,conv=getActiveConv();c.scrollTop=c.scrollHeight/2;const row=Array.from(c.querySelectorAll('[data-message-id]')).find(n=>n.getBoundingClientRect().bottom>c.getBoundingClientRect().top);
  const top=row.getBoundingClientRect().top;loadMoreHistory(conv,c,true);
  return {same:row===c.querySelector('[data-message-id="'+row.dataset.messageId+'"]'),offset:Math.abs(row.getBoundingClientRect().top-top),count:c.querySelectorAll('[data-message-id]').length};
 });
 assert.equal(evidence.earlier.same,true);assert.ok(evidence.earlier.offset<3);assert.equal(evidence.earlier.count,250);
 evidence.entry=[];
 const longConversation=await page.evaluate(()=>{
  const conv=getActiveConv();
  conv.character={name:'滚动进入验收',extensions:{}};conv.title='滚动进入';
  conv.messages=Array.from({length:200},(_,i)=>({id:'scroll-'+i,role:i%2?'assistant':'user',content:'消息 '+i+' '+'正文内容'.repeat(18)}));
  normalizeConversation(conv);delete conv._showAllMessages;conv._historyWindow=150;conv._lastRenderedVisibleCount=0;
 Object.assign(state.settings,{globalRegexEnabled:false,summaryEnabled:false,restoreLastChat:false,apiKey:'synthetic',model:'synthetic',apiEndpoint:new URL('/__never_model',location.href).href});
  switchView('chat');requestFullRender();
  return {id:conv.id,lastId:conv.messages.at(-1).id};
 });
 const scrollMainId=longConversation.id;
 assert.equal(longConversation.lastId,'scroll-199');
 const hidden=await page.evaluate(()=>{
  const container=dom.messagesContainer;switchView('library');container.scrollTop=0;renderMessagesOnly();
  const metrics={scrollHeight:container.scrollHeight,clientHeight:container.clientHeight};
  switchView('chat');return metrics;
 });
 assert.equal(hidden.scrollHeight,0,'hidden chat must render without measurable height');
 assert.equal(hidden.clientHeight,0,'hidden chat must have no client viewport');
 let entryMetrics=await measureChatEntry();
 assert.equal(entryMetrics.lastId,'scroll-199');
 assert.equal(entryMetrics.chatVisible,true);
 assert.equal(entryMetrics.lastVisible,true);
 assert.ok(Math.abs(entryMetrics.gap)<=3,`entry bottom gap must be <=3px, got ${entryMetrics.gap}`);
 evidence.entry.push({scenario:'hidden-prerender-then-visible',hidden,...entryMetrics});

 const priorScroll=await page.evaluate(()=>{
  const container=dom.messagesContainer;container.scrollTop=Math.floor(container.scrollHeight/2);const before=container.scrollTop;
  switchView('library');renderMessagesOnly();switchView('chat');return {before};
 });
 entryMetrics=await measureChatEntry();
 assert.equal(entryMetrics.lastId,'scroll-199');
 assert.equal(entryMetrics.lastVisible,true);
 assert.ok(Math.abs(entryMetrics.gap)<=3,`re-entry bottom gap must be <=3px, got ${entryMetrics.gap}`);
 evidence.entry.push({scenario:'same-chat-after-history-scroll',...priorScroll,...entryMetrics});

 const steady=await page.evaluate(()=>{
  const container=dom.messagesContainer;container.scrollTop=Math.floor(container.scrollHeight/3);const before=container.scrollTop;
  renderMessagesOnly();return {before,after:container.scrollTop};
 });
 assert.ok(Math.abs(steady.after-steady.before)<2,'ordinary rerender must keep the older reading position');
 evidence.entry.push({scenario:'ordinary-rerender-keeps-position',...steady});

 const switched=await page.evaluate(async()=>{
  const second={id:'scroll-second',title:'滚动进入二',character:{name:'滚动进入验收二',extensions:{}},favoriteMessageIds:[],
   messages:Array.from({length:180},(_,i)=>({id:'scroll-second-'+i,role:i%2?'assistant':'user',content:'第二会话 '+i+' '+'正文内容'.repeat(18)}))};
  normalizeConversation(second);state.conversations[second.id]=second;state.conversationOrder.push(second.id);
  await loadConversation(second.id);await new Promise(resolve=>requestAnimationFrame(resolve));
  return {activeId:getActiveConv().id,lastId:getActiveConv().messages.at(-1).id};
 });
 assert.deepEqual(switched,{activeId:'scroll-second',lastId:'scroll-second-179'});
 entryMetrics=await measureChatEntry();
 assert.equal(entryMetrics.lastId,'scroll-second-179');
 assert.equal(entryMetrics.lastVisible,true);
 assert.ok(Math.abs(entryMetrics.gap)<=3,`conversation switch bottom gap must be <=3px, got ${entryMetrics.gap}`);
 await page.evaluate(async id=>{await loadConversation(id);await new Promise(resolve=>requestAnimationFrame(resolve));},scrollMainId);
 const backToMain=await page.evaluate(()=>({activeId:getActiveConv().id}));
 assert.equal(backToMain.activeId,scrollMainId);
 const backMetrics=await measureChatEntry();
 assert.equal(backMetrics.lastId,'scroll-199');
 assert.equal(backMetrics.lastVisible,true);
 assert.ok(Math.abs(backMetrics.gap)<=3,`switch back bottom gap must be <=3px, got ${backMetrics.gap}`);
 evidence.entry.push({scenario:'switch-between-long-conversations',switched,second:entryMetrics,backToMain,back:backMetrics});

 const rapid=await page.evaluate(async()=>{
  const container=dom.messagesContainer;switchView('library');renderMessagesOnly();switchView('chat');
  container.scrollTop=137;await new Promise(resolve=>requestAnimationFrame(resolve));
  return {top:container.scrollTop};
 });
 assert.ok(Math.abs(rapid.top-137)<2,'rapid entry must preserve a user scroll made before the next frame');
 evidence.entry.push({scenario:'rapid-switch-user-scroll',...rapid});

 evidence.entryViewports=[];
 for(const width of [390,1280]) {
  await page.setViewportSize({width,height:844});
  for(const scheme of [{theme:'new-light',media:'light',body:'theme-new-light'},{theme:'new-dark',media:'dark',body:'theme-new-dark'},{theme:'system',media:'dark',body:'theme-new-dark'}]) {
   await page.emulateMedia({colorScheme:scheme.media});
   await page.evaluate(theme=>applyUiTheme(theme,{cache:false}),scheme.theme);
   if(scheme.theme==='system') await page.waitForFunction(body=>document.body.classList.contains(body),scheme.body);
   await page.evaluate(()=>{const container=dom.messagesContainer;switchView('library');container.scrollTop=0;renderMessagesOnly();switchView('chat');});
   const viewportMetrics=await measureChatEntry();
   assert.equal(viewportMetrics.chatVisible,true);
   assert.equal(viewportMetrics.lastId,'scroll-199');
   assert.equal(viewportMetrics.lastVisible,true);
   assert.ok(Math.abs(viewportMetrics.gap)<=3,`${width}px ${scheme.theme} bottom gap must be <=3px, got ${viewportMetrics.gap}`);
   await page.screenshot({path:path.join(output,`entry-${width}-${scheme.theme}.png`),animations:'disabled'});
   evidence.entryViewports.push({width,theme:scheme.theme,...viewportMetrics});
  }
 }
 await page.emulateMedia({colorScheme:null});
 await page.evaluate(()=>applyUiTheme('system',{cache:false}));
 await page.setViewportSize({width:1280,height:900});

 const persisted=await page.evaluate(async id=>{
  await loadConversation(id);
  Object.assign(state.settings,{restoreLastChat:true});
  await persistState(true,{throwOnError:true});
  return {activeId:state.activeConvId,lastId:getActiveConv().messages.at(-1).id};
 },scrollMainId);
 assert.deepEqual(persisted,{activeId:scrollMainId,lastId:'scroll-199'});
 await page.reload({waitUntil:'load'});
 await page.addStyleTag({content:'.msg-enter { animation: none !important; transition: none !important; }'});
 await page.waitForFunction(()=>{
  const chatView=document.getElementById('chatView');
  return !!(chatView&&!chatView.classList.contains('hidden')&&dom.messagesContainer&&dom.messagesContainer.querySelectorAll('[data-message-id]').length);
 });
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 const restored=await measureChatEntry();
 assert.equal(await page.evaluate(()=>state.activeConvId),scrollMainId);
 assert.equal(await page.evaluate(()=>state.settings.restoreLastChat),true);
 assert.equal(restored.lastId,'scroll-199');
 assert.equal(restored.lastVisible,true);
 assert.ok(Math.abs(restored.gap)<=3,`reload entry bottom gap must be <=3px, got ${restored.gap}`);
 evidence.reloadEntry={persisted,...restored};

 assert.deepEqual(errors,[]);Object.assign(evidence,await captureBrowserEvidence(page,output));
 await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:true,output,...evidence}));
} catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
finally {await browser.close();}
