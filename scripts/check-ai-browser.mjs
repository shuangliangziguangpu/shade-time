// Optional acceptance tooling: pass the installed playwright-core module path.
// It is not an application dependency and this script never loads .env.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv[2];
if(!modulePath)throw new Error('Pass an existing playwright-core index.mjs path; no browser downloads are required.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const output=process.argv[3]??'docs/evidence/batch1c/browser-initial.json';
const screenshotPrefix=output.replace(/\.json$/,'');
const report={kind:'LIVE_API_BROWSER',capturedAt:new Date().toISOString(),browser:'installed Edge, headless=true',viewport:{width:1440,height:1000},dpr:1,checks:[],records:[],requests:[],console:[],pageErrors:[]};
const pending=[];const starts=new Map();
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',error=>report.pageErrors.push(error.message));
page.on('console',msg=>{if(['warning','error'].includes(msg.type()))report.console.push({type:msg.type(),text:msg.text()});});
page.on('request',request=>{if(request.url().includes('/api/ai/'))starts.set(request,performance.now());});
page.on('response',response=>{if(response.url().includes('/api/ai/'))pending.push((async()=>{try{report.requests.push({url:new URL(response.url()).pathname,input:response.request().postDataJSON(),httpStatus:response.status(),response:await response.json(),elapsedMs:performance.now()-(starts.get(response.request())??performance.now())});}catch{report.requests.push({url:new URL(response.url()).pathname,interrupted:true});}})());});
const ready=()=>page.waitForFunction(()=>document.querySelector('#ai-diagnostics')?.textContent);
const ai=()=>page.locator('#ai-diagnostics').textContent().then(JSON.parse);
const diagnostics=()=>page.locator('#render-diagnostics').textContent().then(JSON.parse);
const capture=async label=>{const record={label,ai:await ai(),diagnostics:await diagnostics()};report.records.push(record);return record;};
const settle=()=>page.waitForFunction(()=>{const text=document.querySelector('#ai-diagnostics')?.textContent;return text&&!JSON.parse(text).busy;},{},{timeout:35000});
async function button(name){await page.getByRole('button',{name,exact:true}).click();}
async function scenario(name,run){try{await run();report.checks.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){report.checks.push({name,status:'FAIL',error:error.message});try{await capture(name+'-failed');await page.screenshot({path:screenshotPrefix+'-'+name+'-failed.png',fullPage:true});}catch{}console.log(name+': FAIL '+error.message);}}
async function reload(){await page.goto('http://127.0.0.1:3000/courtyard');await ready();}
async function screenshot(name){const path=screenshotPrefix+'-'+name+'.png';await page.screenshot({path,fullPage:true});report.records.at(-1).screenshot=path;}
async function measure(label){await button('采样当前视角5秒');await page.waitForFunction(()=>{const d=JSON.parse(document.querySelector('#render-diagnostics').textContent);return Boolean(d.performance);},{},{timeout:25000});await capture(label);}
try{
  report.browserVersion=browser.version();
  await reload();await measure('idle-before-ai');
  await scenario('A-C-real-parse-confirm-recommend-preview-apply',async()=>{
    const before=(await diagnostics()).selection;
    await button('解析需求');await settle();assert.equal((await ai()).status,'WAITING_DRAFT_CONFIRMATION');assert.deepEqual((await diagnostics()).selection,before);await capture('parsed-awaiting-confirmation');await screenshot('draft');
    await button('确认约束草案');await settle();assert.equal((await ai()).status,'CONSTRAINTS_CONFIRMED');
    await button('生成布置建议');await settle();assert.equal((await ai()).status,'RECOMMENDATION_VALIDATED');assert.deepEqual((await diagnostics()).selection,before);await capture('recommendation-validated');
    await button('预览AI建议B');assert.equal((await diagnostics()).shown,'B');assert.deepEqual((await diagnostics()).selection,before);await capture('AI-B-preview');await screenshot('preview');
    await button('A 当前布局');assert.equal((await diagnostics()).shown,'A');await button('B 建议预览');assert.equal((await diagnostics()).shown,'B');
    await button('拒绝AI建议');await settle();assert.equal((await ai()).status,'REJECTED');assert.deepEqual((await diagnostics()).selection,before);assert.equal((await diagnostics()).shown,'A');await capture('AI-preview-rejected');
    await button('生成布置建议');await settle();assert.equal((await ai()).status,'RECOMMENDATION_VALIDATED');await button('预览AI建议B');await button('确认应用AI方案');await settle();assert.equal((await ai()).status,'APPLIED');
    const result=await capture('server-and-client-application');assert.equal(result.diagnostics.selection.canopyId,'R3');assert.notEqual(result.diagnostics.selection.regionId,'R3');assert.ok(result.diagnostics.period.elevated.minimum>=.8);await screenshot('applied');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal((await ai()).status,'APPLIED');await capture('application-after-late-observation');
  });
  await scenario('B-real-evidence-explanation-focus-and-expiry',async()=>{
    await reload();await page.getByLabel('活动区域',{exact:true}).selectOption('R1');await page.getByLabel('开始时间',{exact:true}).fill('14:00');await page.getByLabel('结束时间',{exact:true}).fill('14:15');await page.getByLabel('结束时间',{exact:true}).press('Tab');
    await page.getByLabel('选择有效网格中心（1–100）',{exact:true}).selectOption('55');
    await page.locator('#ai-input').fill('为什么同一水平采样点，地面被遮挡，较高参考面却可能直射？');await button('解释当前证据');await settle();assert.equal((await ai()).status,'EXPLANATION_VALIDATED');
    let state=await ai();assert.equal(state.explanation.facts.ground.blockerId,'B1');assert.equal(state.explanation.facts.elevated.status,'direct');await capture('paired-evidence-explanation');await screenshot('evidence');
    await button('定位P56双高度射线');await capture('evidence-focused');await button('俯视');assert.equal((await ai()).explanation,null);assert.equal((await diagnostics()).selectedEvidence,null);await capture('evidence-expired');
  });
  await scenario('unsupported-condition-real-clarification',async()=>{
    await reload();await page.locator('#ai-input').fill('活动希望靠近入口，并尽量舒服，其他条件沿用当前设置。');await button('解析需求');await settle();assert.equal((await ai()).status,'NEEDS_CLARIFICATION');assert.deepEqual((await diagnostics()).selection,{regionId:'R3',canopyId:'R3'});await capture('clarification');await screenshot('clarification');
  });
  await scenario('invalid-height-real-rejection',async()=>{
    await reload();await page.locator('#ai-input').fill('其他条件沿用当前设置，活动参考高度请设为2米，请保留这个高度原值，不要替换成其他值，交给程序检查。');await button('解析需求');await settle();assert.ok(['VALIDATION_REJECTED','NEEDS_CLARIFICATION'].includes((await ai()).status));assert.equal((await diagnostics()).state.height,1.5);await capture('invalid-height-rejected');await screenshot('invalid');
  });
  await scenario('no-feasible-candidate-keeps-target',async()=>{
    await reload();await page.locator('#ai-input').fill('沿用当前日期时段及参考高度，活动区域和遮阳棚都不能移动，最低采样遮阴率要求至少80%，不降低这个目标。');await button('解析需求');await settle();assert.equal((await ai()).status,'WAITING_DRAFT_CONFIRMATION');await button('确认约束草案');await settle();assert.equal((await diagnostics()).state.constraints.regionMovable,false);assert.equal((await diagnostics()).state.constraints.canopyMovable,false);
    await button('生成布置建议');await settle();assert.equal((await ai()).status,'NO_FEASIBLE_CANDIDATE');assert.equal((await diagnostics()).state.constraints.minimumShade,.8);await capture('no-feasible');await screenshot('no-feasible');
  });
  await scenario('offline-AI-failure-manual-analysis-still-works',async()=>{
    await reload();await context.setOffline(true);await button('解析需求');await settle();assert.equal((await ai()).status,'AI_UNAVAILABLE');await button('计算合法候选');const d=await diagnostics();assert.equal(d.comparison.candidates.length,4);assert.equal(d.period.elevated.minimum,.6);await capture('offline-failure-manual-working');await screenshot('offline');await context.setOffline(false);
  });
  await scenario('cancelled-live-request-does-not-modify-scene',async()=>{
    await context.setOffline(false);await reload();await button('解析需求');await button('取消请求');assert.equal((await ai()).status,'AI_CANCELLED');assert.deepEqual((await diagnostics()).selection,{regionId:'R3',canopyId:'R3'});await capture('cancelled');
  });
  await context.setOffline(false);await reload();await measure('idle-after-ai-roundtrips');
  await page.screenshot({path:screenshotPrefix+'-final-page.png',fullPage:true});
}finally{
  await Promise.allSettled(pending);report.finishedAt=new Date().toISOString();report.status=report.checks.every(x=>x.status==='PASS')&&report.pageErrors.length===0?'PASS':'FAIL';
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({output,status:report.status,checks:report.checks}));process.exitCode=report.status==='PASS'?0:1;
}
