import { createAiService } from './ai-service.js';

const actions=new Set(['context','invalidate','parse','confirm-draft','recommend','explain','apply','reject']);
const statuses={SUCCESS:200,NEEDS_CLARIFICATION:200,NO_FEASIBLE_CANDIDATE:200,INVALID_INPUT:400,STALE_CONTEXT:409,AI_CANCELLED:409,AI_TIMEOUT:504,AI_UNAVAILABLE:503,INVALID_AI_RESPONSE:502,VALIDATION_REJECTED:422};
export function createAiHandler(service=createAiService()){
  return async function handle(request,response,path){
    const action=path.slice('/api/ai/'.length);
    if(!actions.has(action)){response.writeHead(404).end();return;}
    if(request.method!=='POST'){response.writeHead(405,{Allow:'POST'}).end();return;}
    const json=(code,data)=>{if(!response.destroyed)response.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));};
    const host=request.headers.host??'';
    if(!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)||(request.headers.origin&&request.headers.origin!==`http://${host}`)||request.headers['sec-fetch-site']==='cross-site'){json(403,{status:'VALIDATION_REJECTED'});return;}
    if(request.headers['content-type']?.split(';')[0].trim()!=='application/json'){json(415,{status:'INVALID_INPUT'});return;}
    const controller=new AbortController();
    request.on('aborted',()=>controller.abort());
    response.on('close',()=>{if(!response.writableEnded)controller.abort();});
    try{
      const chunks=[];let size=0;
      for await(const chunk of request){size+=chunk.length;if(size>16384){json(413,{status:'INVALID_INPUT'});return;}chunks.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(400,{status:'INVALID_INPUT'});return;}
      const result=await service.handle(action,input,{signal:controller.signal});
      json(statuses[result.status]??500,result);
    }catch{json(400,{status:'INVALID_INPUT'});}
  };
}
