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
  const probe='Object.assign(window,{state,dom,appStore,getActiveConv,normalizeConversation,renderMessagesOnly,renderConversationListOnly,requestFullRender,switchView,applyUiTheme,loadMoreHistory,toggleMessageFavorite,persistState});window.__copied=[];copyMessageText=function(text){window.__copied.push(text);};\n';
  return route.fulfill({response,body:bundle.slice(0,end)+probe+bundle.slice(end)});
 }
 return route.continue();
});
const evidence={environment:{browser:browser.version(),platform:process.platform,viewport:{width:1280,height:900}}};
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
 assert.deepEqual(errors,[]);Object.assign(evidence,await captureBrowserEvidence(page,output));
 await writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:true,output,...evidence}));
} catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
finally {await browser.close();}
