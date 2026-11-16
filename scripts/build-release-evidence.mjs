// Local evidence indexing only: reads recorded outputs, never invokes a model.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const base='5c40f63e30bc6c592bd51c619d14790955c3b18c';
const directory='docs/evidence/final';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
fs.mkdirSync(directory,{recursive:true});
const source='docs/evidence/batch1c/browser-final.json',recorded=read(source);
assert.equal(recorded.status,'PASS');
const requests=recorded.requests;
function select(path,status){const index=requests.findIndex(row=>row.url===path&&row.response?.status===status);assert.ok(index>=0,`${path} ${status}`);return index;}
function entry(index){
  const row=requests[index],data=row.response.data??{};
  return {source,sourceSha256:hash(source),jsonPointer:`/requests/${index}`,kind:'RECORDED_LIVE_API_AND_PROGRAM_VERIFICATION',initiator:'AUTOMATED_BROWSER_NOT_HUMAN',action:row.url,requestId:row.response.requestId,status:row.response.status,input:row.input.text??{confirmed:row.input.confirmed??null},modelText:data.ai??data.draft??null,programFacts:Object.fromEntries(Object.entries(data).filter(([key])=>!['ai','draft','draftId','proposalId'].includes(key))),elapsedMs:row.elapsedMs};
}
const summary={createdAt:new Date().toISOString(),kind:'DERIVED_EVIDENCE_INDEX_NOT_A_NEW_API_RUN',sources:[{path:source,sha256:hash(source)}],chains:{
  A:[entry(select('/api/ai/parse','SUCCESS')),entry(select('/api/ai/confirm-draft','SUCCESS'))],
  B:[entry(select('/api/ai/explain','SUCCESS'))],
  C:requests.flatMap((row,index)=>['/api/ai/recommend','/api/ai/reject','/api/ai/apply'].includes(row.url)&&row.response?.status==='SUCCESS'?[entry(index)]:[]),
},failuresAndLimits:[entry(select('/api/ai/parse','NEEDS_CLARIFICATION')),entry(select('/api/ai/parse','VALIDATION_REJECTED')),entry(select('/api/ai/recommend','NO_FEASIBLE_CANDIDATE'))],historyFailures:['docs/evidence/batch1c/ai-live-initial.json','docs/evidence/batch1c/ai-live-protocol-recheck.json','docs/evidence/batch1c/application-ack-red.spec.txt'],note:'Original JSON/PNG files remain in their original Batch folders. Rejected model replies and test failures were not overwritten. All user confirmations here were performed by the browser test script, not claimed as a human study.'};
fs.writeFileSync(`${directory}/ai-chains-index.json`,JSON.stringify(summary,null,2)+'\n');
const protectedHistory=['docs/evidence/batch1a','docs/evidence/batch1b','docs/evidence/batch1c'];
assert.equal(git('diff','--name-only',base,'--',...protectedHistory),'');
const history=git('log','--reverse','--format=%H%x09%aI%x09%s','main..HEAD').split('\n').map(line=>{const [sha,date,subject]=line.split('\t');return {sha,date,subject};});
fs.writeFileSync(`${directory}/git-history.json`,JSON.stringify({capturedAt:new Date().toISOString(),headAtIndexing:git('rev-parse','HEAD'),branch:git('branch','--show-current'),main:git('rev-parse','main'),commits:history,pushed:false,merged:false},null,2)+'\n');
function walk(path){return fs.readdirSync(path,{withFileTypes:true}).flatMap(entry=>{const item=path+'/'+entry.name;return entry.isDirectory()?walk(item):[item];});}
const items=[...protectedHistory.flatMap(walk),...walk(directory),...walk('docs/reports/final')].filter(path=>!path.endsWith('/manifest.json')).sort();
const manifest={createdAt:new Date().toISOString(),kind:'SHA256_EVIDENCE_MANIFEST',baseline:base,headAtIndexing:git('rev-parse','HEAD'),historicalEvidenceUnchanged:true,files:items.map(path=>({path,bytes:fs.statSync(path).size,sha256:hash(path)})),note:'Manifest excludes itself. SHA values locate recorded files; they are not a new performance or API result.'};
fs.writeFileSync(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({indexedFiles:items.length,historicalEvidenceUnchanged:true,aiSource:source,chains:Object.fromEntries(Object.entries(summary.chains).map(([key,value])=>[key,value.length]))}));
