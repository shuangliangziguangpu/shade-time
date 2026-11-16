import { writeFile } from 'node:fs/promises';
import { createAiClient } from '../server/ai-client.js';
import { createAiService } from '../server/ai-service.js';
import { createDecisionSession } from '../src/domain/decision-session.js';
import { analyzePeriod } from '../src/domain/period.js';
import { pointEvidence } from '../src/domain/point-evidence.js';

const capturedAt=new Date().toISOString(),records=[],providerResponses=[];
if(!process.env.SHADETIME_AI_API_KEY?.trim()){
  console.log(JSON.stringify({status:'BLOCKED',reason:'MISSING_SHADETIME_AI_API_KEY',kind:'LIVE_API'}));process.exitCode=2;
}else{
  const client=createAiClient();
  const service=createAiService({client:{complete:async(system,user,options)=>{
    const start=performance.now();const result=await client.complete(system,user,options);
    providerResponses.push({task:/TASK:(\w+)/.exec(system)?.[1],receivedAt:new Date().toISOString(),elapsedMs:performance.now()-start,provider:result.provider,model:result.model,response:result.value});return result;
  }}});
  const make=async(selection,period)=>{
    const session=createDecisionSession({selection,period,height:1.5,constraints:{regionMovable:true,canopyMovable:false,minimumShade:.8}});
    const result=analyzePeriod(selection,period);session.acceptAnalysis(result);
    const context=await service.handle('context',{revision:1,snapshot:session.snapshot(),sampleIndex:0,pointIndex:selection.regionId==='R1'?55:null});
    let serial=0;
    return {session,result,call:async(action,extra)=>{const request={...context.data,requestId:`ai-${++serial}`,...extra};delete request.revision;delete request.approved;const started=performance.now();const response=await service.handle(action,request);records.push({action,input:extra,requestId:request.requestId,response,elapsedMs:performance.now()-started,kind:'LIVE_API_BUSINESS'});return response;}};
  };
  const f=await make({regionId:'R3',canopyId:'R3'},{date:'2026-06-21',startTime:'15:00',endTime:'16:00',intervalMinutes:15});
  const normal=await f.call('parse',{text:'在2026年6月21日下午15:00到16:00举办活动，每15分钟采样，遮阳棚保持R3不动，只移动活动区域，使用离地1.5米参考面，希望最低采样遮阴率至少80%。请生成待确认草案。'});
  let recommendation=null,applied=null;
  if(normal.status==='SUCCESS'){
    await f.call('confirm-draft',{draftId:normal.data.draftId,confirmed:true});
    recommendation=await f.call('recommend',{text:'根据已经确认的条件，从本次有限合法候选选择适合的活动区域。'});
    if(recommendation.status==='SUCCESS')applied=await f.call('apply',{proposalId:recommendation.data.proposalId,confirmed:true});
  }
  const illegal=await make({regionId:'R3',canopyId:'R3'},{date:'2026-06-21',startTime:'15:00',endTime:'16:00'});
  const rejected=await illegal.call('parse',{text:'其他条件沿用当前设置，活动参考高度请设为2米，请保留这个高度原值，不要替换成其他值，交给程序检查。'});
  const clarification=await illegal.call('parse',{text:'活动希望靠近入口，并尽量舒服，其他条件沿用当前设置。'});
  const g=await make({regionId:'R1',canopyId:'R3'},{date:'2026-06-21',startTime:'14:00',endTime:'14:15'});
  const evidence=pointEvidence(g.result,0,55,g.session.context());
  const explained=await g.call('explain',{text:'为什么同一采样点地面被遮挡，较高参考面却可能直射？',evidenceRefs:[evidence.ground.evidenceId,evidence.elevated.evidenceId]});
  const status=normal.status==='SUCCESS'&&recommendation?.status==='SUCCESS'&&applied?.status==='SUCCESS'&&['VALIDATION_REJECTED','NEEDS_CLARIFICATION'].includes(rejected.status)&&clarification.status==='NEEDS_CLARIFICATION'&&explained.status==='SUCCESS'?'PASS':'FAIL';
  const result={capturedAt,finishedAt:new Date().toISOString(),kind:'LIVE_API',status,records,providerResponses,note:'Only parsed JSON responses and approved business inputs; no authorization headers, API key or raw network errors. Test confirmation is performed by this explicitly invoked acceptance script.'};
  const output=process.argv[2]??'docs/evidence/batch1c/ai-live.json';await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status,kind:'LIVE_API',output,results:records.map(row=>({action:row.action,status:row.response.status,elapsedMs:row.elapsedMs}))}));process.exitCode=status==='PASS'?0:1;
}
