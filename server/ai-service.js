import { randomUUID } from 'node:crypto';
import { createAiClient, AiError } from './ai-client.js';
import { fields, inputText, aiText, aiList, validateDraft, draftSettings, PARSE_RULES, RECOMMEND_RULES, EXPLAIN_RULES } from './ai-protocol.js';
import { analyzePeriod, normalizePeriod, ANALYSIS_ALGORITHM_VERSION, SAMPLING_VERSION } from '../src/domain/period.js';
import { enumerateCandidates, normalizeConstraints } from '../src/domain/candidates.js';
import { SCENE_CONFIG, validateSelection } from '../src/domain/scene-config.js';
import { inspectLayout } from '../src/domain/layout.js';
import { pointEvidence } from '../src/domain/point-evidence.js';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const settingsKey=s=>JSON.stringify([s.selection,s.period,s.height,s.constraints]);
const businessKey=s=>JSON.stringify([settingsKey(s),s.sceneVersion,s.analysisVersion,s.analysisId]);
const metrics=(result,height)=>{const layer=height===0?result.ground:result.elevated;return {minimum:layer.minimum,average:layer.average,minimumTimes:layer.minimumTimes};};
function snapshot(input){
  fields(input,['selection','period','height','constraints','sceneVersion','analysisVersion','analysisId','contextVersion','sceneGeometryVersion','algorithmVersion','samplingVersion']);
  const selection=validateSelection(input.selection),period=normalizePeriod(input.period),constraints=normalizeConstraints(input.constraints);
  if(!inspectLayout(selection).validation.valid||![0,1.5].includes(input.height)||!['sceneVersion','analysisVersion','contextVersion'].every(key=>Number.isSafeInteger(input[key])&&input[key]>0)||input.analysisId!==`analysis-${input.sceneVersion}-${input.analysisVersion}`||input.sceneGeometryVersion!==SCENE_CONFIG.version||input.algorithmVersion!==ANALYSIS_ALGORITHM_VERSION||input.samplingVersion!==SAMPLING_VERSION)throw new AiError('INVALID_INPUT');
  return {...input,selection,period,constraints};
}

export function createAiService({client=createAiClient(),now=Date.now}={}){
  const sessions=new Map();
  function lookup(id){const s=sessions.get(id);if(!s||now()-s.touched>20*60_000)throw new AiError('STALE_CONTEXT');s.touched=now();return s;}
  function cancel(s){for(const controller of s.active.values())controller.abort();s.active.clear();s.context=null;s.drafts.clear();}
  function sync(input){
    fields(input,['sessionId','revision','snapshot','sampleIndex','pointIndex'],['revision','snapshot','sampleIndex','pointIndex']);
    const state=snapshot(input.snapshot);
    if(!Number.isSafeInteger(input.revision)||input.revision<1||!Number.isInteger(input.sampleIndex)||input.sampleIndex<0||!(input.pointIndex===null||Number.isInteger(input.pointIndex)&&input.pointIndex>=0&&input.pointIndex<100))throw new AiError('INVALID_INPUT');
    let s;
    if(input.sessionId){
      s=lookup(input.sessionId);
      if(input.revision<=s.revision||s.lastState&&['sceneVersion','analysisVersion','contextVersion'].some(key=>state[key]<s.lastState[key]))throw new AiError('STALE_CONTEXT');
      if(s.lastState&&settingsKey(state)!==settingsKey(s.lastState)&&(state.sceneVersion<=s.lastState.sceneVersion||state.analysisVersion<=s.lastState.analysisVersion))throw new AiError('STALE_CONTEXT');
    }
    else {
      for(const [id,row] of sessions)if(now()-row.touched>20*60_000){cancel(row);sessions.delete(id);}
      if(sessions.size>=64)throw new AiError('AI_UNAVAILABLE');
      s={sessionId:randomUUID(),revision:0,lastRequest:0,active:new Map(),drafts:new Map(),proposals:new Map(),touched:now(),approved:null,lastState:null};sessions.set(s.sessionId,s);
    }
    cancel(s);s.revision=input.revision;
    const result=analyzePeriod(state.selection,state.period);
    if(input.sampleIndex>=result.samples.length)throw new AiError('INVALID_INPUT');
    if(s.lastState&&businessKey(s.lastState)!==businessKey(state))s.proposals.clear();
    if(s.approved!==settingsKey(state))s.approved=null;
    s.lastState=state;s.context={id:randomUUID(),state,result,sampleIndex:input.sampleIndex,pointIndex:input.pointIndex};
    return {sessionId:s.sessionId,contextId:s.context.id,revision:s.revision,approved:Boolean(s.approved)};
  }
  async function handle(action,input,{signal}={}){
    let responseId=input?.requestId??null;
    try{
      if(action==='context')return {status:'SUCCESS',data:sync(input)};
      if(action==='invalidate'){
        fields(input,['sessionId','revision']);const s=lookup(input.sessionId);
        if(!Number.isSafeInteger(input.revision)||input.revision<=s.revision)throw new AiError('STALE_CONTEXT');
        s.revision=input.revision;cancel(s);return {status:'SUCCESS'};
      }
      const extras={parse:['text'],'confirm-draft':['draftId','confirmed'],recommend:['text'],explain:['text','evidenceRefs'],apply:['proposalId','confirmed'],reject:['proposalId']}[action];
      if(!extras)throw new AiError('INVALID_INPUT');
      fields(input,['sessionId','contextId','requestId',...extras]);
      const s=lookup(input.sessionId),ctx=s.context;
      if(!ctx||input.contextId!==ctx.id)throw new AiError('STALE_CONTEXT');
      const number=/^ai-([1-9]\d{0,12})$/.exec(input.requestId)?.[1];
      if(!number||Number(number)<=s.lastRequest)throw new AiError('STALE_CONTEXT');
      s.lastRequest=Number(number);
      const current=()=>{if(s.context!==ctx)throw new AiError('STALE_CONTEXT');};
      const success=data=>({status:'SUCCESS',requestId:responseId,contextId:ctx.id,data});
      const invoke=async(system,data)=>{
        s.active.get(action)?.abort();const controller=new AbortController();s.active.set(action,controller);
        const combined=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
        try {const result=await client.complete(system,JSON.stringify(data),{signal:combined});current();if(s.active.get(action)!==controller)throw new AiError('STALE_CONTEXT');return result.value;}
        catch(error){current();throw error;}
        finally{if(s.active.get(action)===controller)s.active.delete(action);}
      };
      if(action==='parse'){
        const value=validateDraft(await invoke(PARSE_RULES,{text:inputText(input.text),current:{...ctx.state,allowedRegionIds:SCENE_CONFIG.positions.map(p=>p.id),allowedCanopyIds:SCENE_CONFIG.canopyPositionIds}}));
        if(value.needsClarification)return {status:'NEEDS_CLARIFICATION',requestId:responseId,contextId:ctx.id,data:{draftId:null,draft:value}};
        const draftId=randomUUID();s.drafts.set(draftId,value);return success({draftId,draft:value});
      }
      if(action==='confirm-draft'){
        if(input.confirmed!==true||!s.drafts.has(input.draftId))throw new AiError('VALIDATION_REJECTED');
        const draft=s.drafts.get(input.draftId);s.approved=settingsKey(draftSettings(draft));s.drafts.clear();return success({draft,confirmed:true});
      }
      if(action==='recommend'){
        inputText(input.text);if(s.approved!==settingsKey(ctx.state))throw new AiError('VALIDATION_REJECTED');
        const compared=enumerateCandidates(ctx.state.selection,ctx.state.period,ctx.state.height,ctx.state.constraints);
        if(compared.status==='unavailable')throw new AiError('VALIDATION_REJECTED');
        const qualified=compared.candidates.filter(row=>row.qualified);
        if(!qualified.length)return {status:'NO_FEASIBLE_CANDIDATE',requestId:responseId,contextId:ctx.id,data:{minimumShade:ctx.state.constraints.minimumShade,examined:compared.examined,legal:compared.candidates.length,source:'deterministic',message:'当前有限合法候选没有达到已确认目标，目标未降低。'}};
        const allowed=new Map(qualified.map(row=>[`${input.requestId}:${row.id}`,row]));
        const offered=[...allowed].map(([candidateId,row])=>({candidateId,selection:row.selection,...metrics(row.result,ctx.state.height),movedCount:row.movedCount,changes:row.changes}));
        const value=await invoke(RECOMMEND_RULES,{text:input.text,conditions:ctx.result.conditions,height:ctx.state.height,minimumShade:ctx.state.constraints.minimumShade,baseline:metrics(ctx.result,ctx.state.height),candidates:offered});
        try{fields(value,['candidateId','summary','reasonCodes','explanation','limitations']);}catch{throw new AiError('INVALID_AI_RESPONSE');}
        aiText(value.summary);aiText(value.explanation);aiList(value.limitations);
        const chosen=allowed.get(value.candidateId);if(!chosen)throw new AiError('INVALID_AI_RESPONSE');
        const chosenMetrics=metrics(chosen.result,ctx.state.height),baseline=metrics(ctx.result,ctx.state.height);
        const validReasons={meets_target:chosenMetrics.minimum>=ctx.state.constraints.minimumShade,highest_minimum:chosenMetrics.minimum===qualified[0].metrics.minimum,higher_average:chosenMetrics.average>baseline.average,less_movement:chosen.movedCount===Math.min(...qualified.map(row=>row.movedCount))};
        if(!Array.isArray(value.reasonCodes)||!value.reasonCodes.length||value.reasonCodes.some(code=>!Object.hasOwn(validReasons,code)||!validReasons[code]))throw new AiError('INVALID_AI_RESPONSE');
        const proposalId=randomUUID();s.proposals.clear();s.proposals.set(proposalId,{selection:chosen.selection,key:businessKey(ctx.state)});
        return success({proposalId,selection:chosen.selection,metrics:chosenMetrics,baseline,changes:chosen.changes,movedCount:chosen.movedCount,examined:compared.examined,legal:compared.candidates.length,ai:value,source:'deepseek',conditions:ctx.result.conditions,height:ctx.state.height});
      }
      if(action==='reject'){if(!s.proposals.delete(input.proposalId))throw new AiError('VALIDATION_REJECTED');return success({rejected:true});}
      if(action==='apply'){
        const proposal=s.proposals.get(input.proposalId);
        if(input.confirmed!==true)throw new AiError('VALIDATION_REJECTED');
        if(!proposal||proposal.key!==businessKey(ctx.state)||s.approved!==settingsKey(ctx.state))throw new AiError('STALE_CONTEXT');
        if(!ctx.state.constraints.regionMovable&&proposal.selection.regionId!==ctx.state.selection.regionId||!ctx.state.constraints.canopyMovable&&proposal.selection.canopyId!==ctx.state.selection.canopyId)throw new AiError('VALIDATION_REJECTED');
        const result=analyzePeriod(proposal.selection,ctx.state.period),computed=metrics(result,ctx.state.height);
        if(result.status!=='valid'||computed.minimum<ctx.state.constraints.minimumShade)throw new AiError('VALIDATION_REJECTED');
        s.proposals.clear();cancel(s);return success({selection:proposal.selection,metrics:computed,recomputed:true});
      }
      if(action==='explain'){
        inputText(input.text);if(ctx.pointIndex===null)throw new AiError('INVALID_INPUT');
        const evidence=pointEvidence(ctx.result,ctx.sampleIndex,ctx.pointIndex,ctx.state),refs=[evidence.ground.evidenceId,evidence.elevated.evidenceId];
        if(!Array.isArray(input.evidenceRefs)||input.evidenceRefs.length!==2)throw new AiError('VALIDATION_REJECTED');
        if(!same(refs,input.evidenceRefs))throw new AiError(input.evidenceRefs.every(ref=>typeof ref==='string'&&ref.startsWith('analysis-'))?'STALE_CONTEXT':'VALIDATION_REJECTED');
        const pattern=`ground-${evidence.ground.status}-elevated-${evidence.elevated.status}`;
        const facts={...evidence,pattern};
        const value=await invoke(EXPLAIN_RULES,{text:input.text,facts,evidenceRefs:refs});
        try{fields(value,['summary','explanation','pattern','evidenceRefs','limitations']);}catch{throw new AiError('INVALID_AI_RESPONSE');}
        aiText(value.summary);aiText(value.explanation);aiList(value.limitations);
        if(value.pattern!==pattern||!same(value.evidenceRefs,refs))throw new AiError('INVALID_AI_RESPONSE');
        return success({facts,ai:value,source:'deepseek'});
      }
    }catch(error){return {status:error instanceof AiError?error.code:'INVALID_INPUT',requestId:responseId,message:'请求未通过或AI暂不可用；当前场景未被此请求修改。'};}
  }
  return Object.freeze({handle});
}
