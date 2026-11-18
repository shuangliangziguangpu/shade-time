const accepted=new Set(['SUCCESS','NEEDS_CLARIFICATION','NO_FEASIBLE_CANDIDATE','INVALID_INPUT','STALE_CONTEXT','AI_TIMEOUT','AI_CANCELLED','AI_UNAVAILABLE','INVALID_AI_RESPONSE','VALIDATION_REJECTED']);
const fingerprint=ctx=>JSON.stringify(ctx);
const settingsKey=ctx=>ctx&&JSON.stringify([ctx.snapshot.selection,ctx.snapshot.period,ctx.snapshot.height,ctx.snapshot.constraints]);
const businessKey=ctx=>ctx&&JSON.stringify([settingsKey(ctx),ctx.snapshot.sceneVersion,ctx.snapshot.analysisVersion,ctx.snapshot.analysisId]);
export async function sendAiRequest(action,body,{signal}={}){
  try{
    const response=await fetch(`/api/ai/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    const result=await response.json();
    if(!result||!accepted.has(result.status))return {status:'INVALID_AI_RESPONSE'};
    return result;
  }catch{return {status:signal?.aborted?'AI_CANCELLED':'AI_UNAVAILABLE'};}
}
export function createAiWorkflow({getContext,send=sendAiRequest,onState=()=>{},applyDraft,preview,apply,restore,focus=()=>{}}){
  let value={status:'IDLE',busy:false,approved:false,draft:null,proposal:null,explanation:null,application:null,requestId:null};
  let sessionId=null,serverContext=null,serverFingerprint=null,lastFingerprint=fingerprint(getContext());
  let revision=0,serial=0,epoch=0,controller=null,suppress=false,used=false,approvedKey=null,localCandidateId=null,proposalBusiness=null,appliedBusiness=null;
  const emit=()=>onState({...value});
  const state=()=>({...value});
  function preserve(operation){suppress=true;try{return operation();}finally{suppress=false;lastFingerprint=fingerprint(getContext());}}
  function dropPreview(){if(localCandidateId){const previous=localCandidateId;localCandidateId=null;preserve(()=>restore(previous));}}
  function invalidate(force=false){
    const ctx=getContext(),next=fingerprint(ctx);if(suppress||!force&&next===lastFingerprint)return;
    lastFingerprint=next;epoch++;controller?.abort();serverContext=null;serverFingerprint=null;
    if(sessionId)void send('invalidate',{sessionId,revision:++revision}).catch(()=>{});
    const keep=!force&&localCandidateId&&ctx?.previewId===localCandidateId&&businessKey(ctx)===proposalBusiness;
    if(!keep){dropPreview();value.proposal=null;}
    value.draft=null;value.explanation=null;value.busy=false;
    if(force||approvedKey!==settingsKey(ctx))approvedKey=null;
    value.approved=Boolean(approvedKey);
    const keepAcknowledgement=!force&&value.status==='APPLIED'&&businessKey(ctx)===appliedBusiness;
    if(!keepAcknowledgement)value.application=null;
    if(used&&!keepAcknowledgement)value.status=keep?'WAITING_APPLICATION_CONFIRMATION':'STALE_CONTEXT';
    emit();
  }
  async function request(action,extra){
    used=true;const ctx=getContext();if(!ctx){value.status='INVALID_INPUT';emit();return null;}
    const key=fingerprint(ctx),operation=++epoch;controller?.abort();controller=new AbortController();
    const current=controller;value.busy=true;value.status={parse:'UNDERSTANDING',recommend:'COMPUTING_CANDIDATES',explain:'VERIFYING_EVIDENCE','confirm-draft':'CONFIRMING_CONSTRAINTS',apply:'REVALIDATING'}[action]??'WORKING';emit();
    try{
      if(!serverContext||serverFingerprint!==key){
        const synced=await send('context',{sessionId,revision:++revision,snapshot:ctx.snapshot,sampleIndex:ctx.sampleIndex,pointIndex:ctx.pointIndex},{signal:current.signal});
        if(epoch!==operation||fingerprint(getContext())!==key)return null;
        if(synced.status!=='SUCCESS'){
          if(synced.status==='STALE_CONTEXT'){sessionId=null;approvedKey=null;value.approved=false;value.draft=value.proposal=value.explanation=null;dropPreview();}
          throw synced;
        }
        sessionId=synced.data.sessionId;serverContext=synced.data.contextId;serverFingerprint=key;
      }
      const requestId=`ai-${++serial}`;value.requestId=requestId;
      const response=await send(action,{sessionId,contextId:serverContext,requestId,...extra},{signal:current.signal});
      if(epoch!==operation||fingerprint(getContext())!==key)return null;
      if(response.status!=='SUCCESS'&&response.status!=='NEEDS_CLARIFICATION'&&response.status!=='NO_FEASIBLE_CANDIDATE')throw response;
      value.status=response.status;return response;
    }catch(error){if(epoch===operation)value.status=accepted.has(error?.status)?error.status:'AI_UNAVAILABLE';return null;}
    finally{if(epoch===operation){value.busy=false;controller=null;emit();}}
  }
  async function parse(text){
    dropPreview();value.proposal=value.explanation=value.draft=value.application=null;approvedKey=null;value.approved=false;
    const response=await request('parse',{text});if(response){value.draft=response.data;value.status=response.status==='SUCCESS'?'WAITING_DRAFT_CONFIRMATION':response.status;emit();}return response;
  }
  async function confirmDraft(){
    if(!value.draft?.draftId){value.status='VALIDATION_REJECTED';emit();return null;}
    const response=await request('confirm-draft',{draftId:value.draft.draftId,confirmed:true});
    if(response){try{preserve(()=>applyDraft(response.data.draft));approvedKey=settingsKey(getContext());value.approved=true;value.draft=null;value.status='CONSTRAINTS_CONFIRMED';emit();}catch{value.status='VALIDATION_REJECTED';emit();}}return response;
  }
  async function recommend(text){
    if(!value.approved){value.status='VALIDATION_REJECTED';emit();return null;}
    dropPreview();value.proposal=value.explanation=null;
    const response=await request('recommend',{text});if(response){value.proposal=response.status==='SUCCESS'?response.data:null;value.status=response.status==='SUCCESS'?'RECOMMENDATION_VALIDATED':response.status;emit();}return response;
  }
  function showPreview(){
    if(!value.proposal||value.busy)return;
    try{localCandidateId=preserve(()=>preview(value.proposal));proposalBusiness=businessKey(getContext());value.status='WAITING_APPLICATION_CONFIRMATION';emit();}
    catch{value.status='VALIDATION_REJECTED';emit();}
  }
  async function confirmApplication(){
    if(!value.proposal||!localCandidateId){value.status='VALIDATION_REJECTED';emit();return null;}
    const response=await request('apply',{proposalId:value.proposal.proposalId,confirmed:true});
    if(response){try{preserve(()=>apply(localCandidateId,response.data));localCandidateId=null;value.proposal=null;approvedKey=null;value.approved=false;value.application=response.data;appliedBusiness=businessKey(getContext());value.status='APPLIED';emit();}catch{value.status='VALIDATION_REJECTED';emit();}}return response;
  }
  async function reject(){
    if(value.proposal)await request('reject',{proposalId:value.proposal.proposalId});
    dropPreview();value.proposal=null;value.status='REJECTED';emit();
  }
  async function explain(text){
    const ctx=getContext();
    if(ctx?.shown==='B'){value.explanation=null;value.status='PREVIEW_EXPLANATION_UNAVAILABLE';emit();return null;}
    if(!ctx?.evidenceRefs?.length){value.status='INVALID_INPUT';emit();return null;}
    const response=await request('explain',{text,evidenceRefs:ctx.evidenceRefs});if(response){value.explanation=response.data;value.status='EXPLANATION_VALIDATED';emit();}return response;
  }
  function focusEvidence(){if(value.explanation)focus(value.explanation.facts);}
  return Object.freeze({state,parse,confirmDraft,recommend,preview:showPreview,apply:confirmApplication,reject,explain,focusEvidence,
    contextChanged:()=>invalidate(),intentChanged:()=>invalidate(true),hasAiPreview:()=>Boolean(localCandidateId),
    reset(){invalidate(true);sessionId=serverContext=serverFingerprint=approvedKey=appliedBusiness=null;value={status:'IDLE',busy:false,approved:false,draft:null,proposal:null,explanation:null,application:null,requestId:null};used=false;lastFingerprint=fingerprint(getContext());emit();},
    cancel(){used=true;invalidate(true);value.status='AI_CANCELLED';emit();}});
}
