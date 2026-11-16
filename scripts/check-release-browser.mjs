import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// Optional external test tool; this file does not read .env or become an app dependency.
if(!process.argv[2])throw new Error('Pass an existing playwright-core/index.mjs path.');
const {chromium}=await import(pathToFileURL(process.argv[2]).href);
const output=process.argv[3]??'docs/evidence/final/batch1d-browser.json';
const prefix=output.replace(/\.json$/,'');
const report={kind:'AUTOMATED_BROWSER',headless:!process.argv.includes('--headed'),humanAcceptance:false,capturedAt:new Date().toISOString(),checks:[],records:[],aiRequests:[],console:[],pageErrors:[]};
const browser=await chromium.launch({channel:'msedge',headless:report.headless});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(30000);
const pending=[];
page.on('pageerror',error=>report.pageErrors.push(error.message));
page.on('console',message=>{if(['error','warning'].includes(message.type()))report.console.push({type:message.type(),message:message.text()});});
page.on('response',response=>{if(response.url().includes('/api/ai/'))pending.push((async()=>{try{report.aiRequests.push({path:new URL(response.url()).pathname,input:response.request().postDataJSON(),response:await response.json()});}catch{report.aiRequests.push({path:new URL(response.url()).pathname,interrupted:true});}})());});
const ai=()=>page.locator('#ai-diagnostics').textContent().then(JSON.parse);
const diagnostics=()=>page.locator('#render-diagnostics').textContent().then(JSON.parse);
const capture=async label=>{const record={label,ai:await ai(),diagnostics:await diagnostics(),fileStatus:await page.locator('#scene-file-status').textContent()};report.records.push(record);return record;};
const measure=async label=>{await page.getByRole('button',{name:'采样当前视角5秒',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#render-diagnostics').textContent).performance,{},{timeout:25000});return capture(label);};
const upload=async(name,content)=>{await page.locator('#import-scene').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(content)});await page.waitForFunction(()=>!document.querySelector('#import-scene').disabled);};
const settle=()=>page.waitForFunction(()=>!JSON.parse(document.querySelector('#ai-diagnostics').textContent).busy,{},{timeout:35000});
const evidenceFree=state=>{assert.equal(state.ai.draft,null);assert.equal(state.ai.proposal,null);assert.equal(state.ai.explanation,null);assert.equal(state.ai.approved,false);assert.equal(state.diagnostics.selectedEvidence,null);assert.equal(state.diagnostics.comparison,null);};
async function check(name,run){try{await run();report.checks.push({name,status:'PASS'});console.log(name+': PASS');}catch(error){report.checks.push({name,status:'FAIL',error:error.message});try{await capture(name+'-failure');await page.screenshot({path:prefix+'-'+name+'-failure.png',fullPage:true});}catch{}console.log(name+': FAIL '+error.message);}}
let saved,baseline;
try{
  report.browserVersion=browser.version();await page.goto('http://127.0.0.1:3000/courtyard');await page.waitForFunction(()=>document.querySelector('#render-diagnostics')?.textContent);
  baseline=await diagnostics();await measure('before-save-restore');
  await check('download-confirmed-A-while-B-is-previewed',async()=>{
    await page.getByRole('button',{name:'计算合法候选',exact:true}).click();await page.getByRole('button',{name:'预览 R1 / R3',exact:true}).click();assert.equal((await diagnostics()).shown,'B');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'保存已确认场景 JSON',exact:true}).click();const download=await downloadPromise;
    await download.saveAs(prefix+'-exported-scene.json');saved=await fs.readFile(prefix+'-exported-scene.json','utf8');const data=JSON.parse(saved);assert.deepEqual(data.task.selection,{regionId:'R3',canopyId:'R3'});assert.equal(data.schemaVersion,1);assert.ok(!saved.includes('analysisId'));assert.ok(!saved.includes('rate'));await capture('saved-A-from-B-preview');
  });
  await check('refresh-and-import-recomputes-identical-dual-height-results',async()=>{
    assert.ok(saved);await page.reload();await page.waitForFunction(()=>document.querySelector('#render-diagnostics')?.textContent);
    const before=await diagnostics();await upload('saved-scene.json',saved);const restored=await capture('restored-after-refresh');
    assert.deepEqual(restored.diagnostics.selection,baseline.selection);assert.deepEqual(restored.diagnostics.period.ground,baseline.period.ground);assert.deepEqual(restored.diagnostics.period.elevated,baseline.period.elevated);assert.deepEqual(restored.diagnostics.period.samples,baseline.period.samples);assert.ok(restored.diagnostics.analysisRuns>before.analysisRuns);evidenceFree(restored);
    await page.screenshot({path:prefix+'-restored.png',fullPage:true});
  });
  await check('restore-file-after-layout-and-height-changes',async()=>{
    await page.getByLabel('活动区域',{exact:true}).selectOption('R6');await page.getByLabel('遮阳棚',{exact:true}).selectOption('R1');await page.getByRole('button',{name:'地面 · 0米',exact:true}).click();
    const before=await diagnostics();assert.equal(before.selection.regionId,'R6');await upload('saved-scene.json',saved);const restored=await capture('restored-over-modified-layout');
    assert.deepEqual(restored.diagnostics.selection,{regionId:'R3',canopyId:'R3'});assert.equal(restored.diagnostics.state.height,1.5);assert.ok(restored.diagnostics.state.analysisVersion>before.state.analysisVersion);assert.equal(restored.diagnostics.period.elevated.minimum,.6);evidenceFree(restored);
  });
  await check('bad-files-are-refused-without-changing-current-state',async()=>{
    const original=JSON.parse(saved),cases=[];
    for(const [name,patch] of [['old-version',{schemaVersion:0}],['forged-rate',{rate:1}],['forged-token',{sessionId:'do-not-restore'}]])cases.push([name,JSON.stringify({...original,...patch})]);
    const illegal=structuredClone(original);illegal.task.selection.regionId='R2';cases.push(['corridor-region',JSON.stringify(illegal)]);
    const time=structuredClone(original);time.task.period.startTime='15:01';cases.push(['invalid-time',JSON.stringify(time)]);
    cases.push(['broken','{broken'],['oversized',' '.repeat(17000)]);
    for(const [name,text]of cases){const before=await diagnostics();await upload(name+'.json',text);const after=await diagnostics();assert.match(await page.locator('#scene-file-status').textContent(),/导入失败/);assert.deepEqual(after.state,before.state);assert.equal(after.analysisRuns,before.analysisRuns);if(name==='old-version')assert.match(await page.locator('#scene-file-status').textContent(),/不支持/);report.records.push({label:'rejected-'+name,fileStatus:await page.locator('#scene-file-status').textContent(),selection:after.selection,analysisId:after.state.analysisId});}
    await page.screenshot({path:prefix+'-rejected.png',fullPage:true});
  });
  await check('import-drops-current-AI-draft-and-server-capability-even-for-same-task',async()=>{
    await page.getByRole('button',{name:'解析需求',exact:true}).click();await settle();assert.equal((await ai()).status,'WAITING_DRAFT_CONFIRMATION');const draft=await ai();
    await Promise.allSettled(pending);const oldContext=report.aiRequests.filter(r=>r.path==='/api/ai/context'&&r.response?.status==='SUCCESS').at(-1).response.data;
    const invalidated=page.waitForResponse(response=>response.url().endsWith('/api/ai/invalidate')&&response.status()===200);await upload('same-scene.json',saved);await invalidated;const restored=await capture('import-cleared-live-AI-draft');evidenceFree(restored);assert.equal(restored.ai.requestId,null);assert.equal(await page.getByRole('button',{name:'确认约束草案',exact:true}).isDisabled(),true);
    const response=await page.request.post('http://127.0.0.1:3000/api/ai/confirm-draft',{data:{sessionId:oldContext.sessionId,contextId:oldContext.contextId,requestId:'ai-99',draftId:draft.draft.draftId,confirmed:true}});const rejected=await response.json();assert.equal(rejected.status,'STALE_CONTEXT');report.records.push({label:'old-AI-capability-server-rejected',status:rejected.status});
    await page.getByRole('button',{name:'解析需求',exact:true}).click();await settle();assert.equal((await ai()).status,'WAITING_DRAFT_CONFIRMATION');await Promise.allSettled(pending);const newContext=report.aiRequests.filter(r=>r.path==='/api/ai/context'&&r.response?.status==='SUCCESS').at(-1);assert.equal(newContext.input.sessionId,null);assert.notEqual(newContext.response.data.sessionId,oldContext.sessionId);await capture('fresh-AI-session-after-import');
    await upload('same-scene.json',saved);await page.screenshot({path:prefix+'-AI-cleared.png',fullPage:true});
  });
  await check('manual-analysis-remains-usable-after-import',async()=>{
    await page.getByRole('button',{name:'计算合法候选',exact:true}).click();let d=await diagnostics();assert.equal(d.comparison.candidates.length,4);assert.equal(d.period.elevated.average,.7625);await page.getByLabel('当前采样时刻',{exact:true}).selectOption('16:00');d=await diagnostics();assert.equal(d.metrics.elevated,.6);await capture('manual-after-import');
  });
  await upload('final-scene.json',saved);await measure('after-save-restore');await page.screenshot({path:prefix+'-final.png',fullPage:true});
}finally{
  await Promise.allSettled(pending);report.finishedAt=new Date().toISOString();report.status=report.checks.every(row=>row.status==='PASS')&&report.pageErrors.length===0?'PASS':'FAIL';await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({output,status:report.status,checks:report.checks}));process.exitCode=report.status==='PASS'?0:1;
}
