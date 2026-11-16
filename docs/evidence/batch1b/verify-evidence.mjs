import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {analyzePeriod} from '../../../src/domain/period.js';
import {enumerateCandidates} from '../../../src/domain/candidates.js';

const base='003b7a38a69271dfab65bd82aef3bf2b47551011';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const baselineFiles=git('ls-tree','-r','--name-only',base).split('\n');
const protectedFiles=baselineFiles.filter(path=>path.startsWith('test/')||path.startsWith('src/core/')||path.startsWith('src/probe/')||path.startsWith('src/domain/')||path.startsWith('src/view/')||['src/main.js','public/index.html','public/styles.css','package.json','package-lock.json'].includes(path));
assert.equal(git('diff','--name-only',base,'--',...protectedFiles),'');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(pkg.dependencies.three,'0.160.0');
assert.equal(pkg.dependencies.suncalc,'1.9.0');
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
for(const name of ['three','suncalc']){
  assert.equal(lock.packages['node_modules/'+name].version,pkg.dependencies[name]);
  assert.equal(JSON.parse(fs.readFileSync('node_modules/'+name+'/package.json','utf8')).version,pkg.dependencies[name]);
}
const tap=fs.readFileSync('docs/evidence/batch1b/all-tests.tap','utf8');
for(const expected of ['tests 93','pass 93','fail 0','skipped 0','cancelled 0'])assert.ok(tap.includes('# '+expected));
let periods=0,samples=0,candidates=0,rankedLists=0;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} vs ${b}`);
const files=['stage2-browser.json','stage3-browser.json','stage4-browser.json','stage5-browser.json','final-browser.json'];
for(const file of files){
  const data=JSON.parse(fs.readFileSync('docs/evidence/batch1b/'+file,'utf8'));
  for(const record of data.records){
    if(!record.period)continue;
    // diagnostics.period is the confirmed A result; metrics follows shownSelection.
    const result=analyzePeriod(record.selection,record.period.settings);
    assert.equal(result.status,record.period.status);
    assert.equal(result.samples.length,record.period.samples.length);
    for(const layer of ['ground','elevated']){
      assert.equal(result[layer].status,record.period[layer].status);
      if(result[layer].status==='valid'){
        close(result[layer].average,record.period[layer].average);
        close(result[layer].minimum,record.period[layer].minimum);
        assert.deepEqual(result[layer].minimumTimes,record.period[layer].minimumTimes);
      }
    }
    for(let i=0;i<result.samples.length;i++){
      const expected=result.samples[i],observed=record.period.samples[i];
      assert.equal(expected.timestamp,observed.timestamp);
      assert.equal(expected.status,observed.status);
      for(const layer of ['ground','elevated'])assert.equal(expected.analysis[layer]?.rate??null,observed[layer]);
      samples++;
    }
    periods++;
    if(record.metrics){
      const displayed=analyzePeriod(record.shownSelection??record.selection,record.period.settings).samples[record.period.selectedSampleIndex].analysis;
      for(const layer of ['ground','elevated'])assert.equal(displayed[layer].rate,record.metrics[layer]);
    }
    if(!record.comparison?.candidates.length)continue;
    const layer=record.comparison.height===0?'ground':'elevated';
    for(const row of record.comparison.candidates){
      const expected=analyzePeriod(row.selection,record.period.settings);
      assert.equal(expected.status,'valid');
      close(expected[layer].minimum,row.minimum);
      close(expected[layer].average,row.average);
      assert.equal(Number(row.selection.regionId!==record.selection.regionId)+Number(row.selection.canopyId!==record.selection.canopyId),row.movedCount);
      candidates++;
    }
    // Early UI records predate session snapshots; never invent missing permissions.
    if(record.state?.constraints){
      const expected=enumerateCandidates(record.selection,record.period.settings,record.comparison.height,record.state.constraints);
      assert.deepEqual(expected.candidates.map(row=>row.id),record.comparison.candidates.map(row=>row.id));
      assert.deepEqual(expected.candidates.map(row=>row.qualified),record.comparison.candidates.map(row=>row.qualified));
      rankedLists++;
    }
  }
}
const tracked=git('ls-files').split('\n');
const sensitivePaths=tracked.filter(path=>path!=='.env.example'&&(/(^|\/)\.env($|\.)|\.env($|\.)|\.(pem|p12|pfx|jks|keystore)$|(^|\/)id_(rsa|ed25519)$/.test(path)));
assert.deepEqual(sensitivePaths,[]);
assert.equal(git('check-ignore','--','.env'),'.env');
const report={capturedAt:new Date().toISOString(),codeHead:git('rev-parse','HEAD'),branch:git('branch','--show-current'),baseline:base,node:process.version,dependencies:pkg.dependencies,protectedFiles:{count:protectedFiles.length,unchanged:true,files:protectedFiles},tests:{total:93,PASS:93,FAIL:0,SKIP:0,CANCELLED:0},browserNodeComparison:{records:periods,samples,candidates,rankedLists,status:'PASS',tolerance:1e-12,files},sensitivePathsTracked:sensitivePaths,envIgnored:true,main:git('rev-parse','main'),originMainLocalRef:git('rev-parse','origin/main'),note:'No fetch/push/merge or environment-secret reads. Remote reference is local only.'};
console.log(JSON.stringify({...report,protectedFiles:{count:protectedFiles.length,unchanged:true}}));
