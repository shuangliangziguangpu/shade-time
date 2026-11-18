import { createAiWorkflow } from './ai-workflow.js';

const labels={IDLE:'尚未请求AI；手动分析始终可用。',UNDERSTANDING:'正在理解需求，尚未修改场景…',COMPUTING_CANDIDATES:'服务端正在重算合法候选并请求DeepSeek…',VERIFYING_EVIDENCE:'服务端正在验证当前双高度证据并请求解释…',CONFIRMING_CONSTRAINTS:'正在确认约束草案…',REVALIDATING:'正在服务端重新计算，尚未应用…',WAITING_DRAFT_CONFIRMATION:'草案已通过程序校验，等待你确认约束。',CONSTRAINTS_CONFIRMED:'约束已确认，可以生成布置建议。',RECOMMENDATION_VALIDATED:'AI建议已通过程序校验，尚未预览或应用。',WAITING_APPLICATION_CONFIRMATION:'正在预览B，正式布局仍为A；等待你确认应用。',EXPLANATION_VALIDATED:'AI解释的结构、布局引用与模式校验通过；请结合事实卡核对生成文字。',PREVIEW_EXPLANATION_UNAVAILABLE:'B预览的AI解释不可用，请切回A或确认应用后重新选点；本地双射线仍可查看。',APPLIED:'服务端和本地重新验证通过，已正式应用。',REJECTED:'已拒绝建议并恢复A。',NEEDS_CLARIFICATION:'存在未支持或不明确的条件，请回答澄清问题后重新解析。',NO_FEASIBLE_CANDIDATE:'当前有限合法候选没有达到已确认目标；目标未降低。',INVALID_INPUT:'输入或当前分析不完整；解释前请先选择有效采样点。',STALE_CONTEXT:'上下文已变化，旧AI结果失效；请重新请求。',AI_TIMEOUT:'AI请求超时；场景保持原状，可重试或继续手动分析。',AI_CANCELLED:'已取消AI请求，场景保持原状。',AI_UNAVAILABLE:'AI暂不可用；手动分析与A/B比较仍可使用。',INVALID_AI_RESPONSE:'AI回复不符合严格协议，已拒绝，场景保持原状。',VALIDATION_REJECTED:'程序拒绝此输入、建议或确认；请核对当前条件。'};
export function createAiPanel(bridge){
  const $=id=>document.getElementById(id),container=$('ai-result');
  const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
  const percent=value=>`${(value*100).toFixed(2).replace(/\.00$/,'')}%`;
  function render(state){
    $('ai-status').textContent=`${state.status} · ${labels[state.status]??'正在处理'}`;
    $('ai-status').dataset.state=state.status;
    $('ai-parse').disabled=state.busy;
    $('ai-confirm-draft').disabled=state.busy||!state.draft?.draftId;
    $('ai-recommend').disabled=state.busy||!state.approved;
    const explanationContext=bridge.getContext(),previewing=explanationContext?.shown==='B';
    $('ai-explain').disabled=state.busy||previewing||!explanationContext?.evidenceRefs?.length;
    $('ai-explain-scope').textContent=previewing
      ?'B预览保留本地双高度射线；AI解释暂不可用。请切回A或确认应用后重新选点解释。'
      :'AI解释仅校验结构、当前布局的证据引用与模式；生成文字的语义仍需结合事实卡核对。';
    $('ai-cancel').disabled=!state.busy;
    $('ai-preview').disabled=state.busy||!state.proposal;
    $('ai-apply').disabled=state.busy||!workflow.hasAiPreview();
    $('ai-reject').disabled=state.busy||!state.proposal;
    container.replaceChildren();
    if(state.draft){
      const d=state.draft.draft;container.append(text('h3','AI理解的需求 · 草案'),text('p',d.summary));
      if(d.needsClarification)for(const question of d.clarificationQuestions)container.append(text('p',question,'ai-question'));
      else container.append(text('p',`${d.date} ${d.startTime}–${d.endTime} · ${d.timeZone} · ${d.intervalMinutes}分钟采样 · ${d.height}米 · 区域${d.selection.regionId}/棚${d.selection.canopyId} · 移动权限${{region:'只移区域',canopy:'只移棚',both:'两者可移',none:'两者固定'}[d.movementMode]} · 最低目标${percent(d.minimumShade)}`,'ai-facts'));
    }
    if(state.proposal){
      const p=state.proposal;container.append(text('h3','AI布置建议 · 未应用'),text('p',p.ai.summary),text('p',p.ai.explanation));
      container.append(text('p',`程序计算：区域${p.selection.regionId} / 棚${p.selection.canopyId}；采样最低${percent(p.metrics.minimum)}，时段平均${percent(p.metrics.average)}；移动${p.movedCount}个对象。检查${p.examined}组，合法${p.legal}组。`,'ai-facts'));
      for(const limit of p.ai.limitations)container.append(text('p',limit,'hint'));
    }
    if(state.application){const p=state.application;container.append(text('h3','正式应用成功 · 程序二次验证'),text('p',`当前区域${p.selection.regionId} / 棚${p.selection.canopyId}；重算采样最低${percent(p.metrics.minimum)}，时段平均${percent(p.metrics.average)}。`,'ai-facts'));}
    if(state.explanation){
      const e=state.explanation;container.append(text('h3','AI空间解读 · 单点证据'),text('p',e.ai.summary),text('p',e.ai.explanation));
      for(const [name,key] of [['地面0米','ground'],['离地1.5米','elevated']]){const fact=e.facts[key];container.append(text('p',`${name}：${fact.status==='blocked'?`命中${fact.blockerId}，交点(${fact.hit.map(n=>n.toFixed(3)).join(', ')})m`:'七实体内未命中，模型内直射'}。引用 ${fact.evidenceId}`,'ai-facts'));}
      const button=text('button',`定位P${e.facts.pointNumber}双高度射线`);button.type='button';button.addEventListener('click',()=>workflow.focusEvidence());container.append(button);
      for(const limit of e.ai.limitations)container.append(text('p',limit,'hint'));
    }
    $('ai-diagnostics').textContent=JSON.stringify(state);
  }
  const workflow=createAiWorkflow({...bridge,onState:render});
  $('ai-parse').addEventListener('click',()=>workflow.parse($('ai-input').value));
  $('ai-confirm-draft').addEventListener('click',()=>workflow.confirmDraft());
  $('ai-recommend').addEventListener('click',()=>workflow.recommend($('ai-input').value));
  $('ai-explain').addEventListener('click',()=>workflow.explain($('ai-input').value.trim()||'请解释当前同一采样点的双高度证据。'));
  $('ai-preview').addEventListener('click',()=>workflow.preview());
  $('ai-apply').addEventListener('click',()=>workflow.apply());
  $('ai-reject').addEventListener('click',()=>workflow.reject());
  $('ai-cancel').addEventListener('click',()=>workflow.cancel());
  $('ai-input').addEventListener('input',()=>workflow.intentChanged());
  render(workflow.state());return workflow;
}
