import assert from 'node:assert/strict';
const base=(process.env.WORKER_URL||'https://audit-log-agent.trantanlong2411.workers.dev').replace(/\/$/,'');
const VERSION='pharos-audit-log-2026-11-07-v1';
async function json(path,body){
 const r=await fetch(base+path,{method:body?'POST':'GET',
  headers:body?{'content-type':'application/json'}:{},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000),cache:'no-store'});
 const content=await r.text();let data;try{data=JSON.parse(content)}catch{data={error:content.slice(0,160)}}
 return {status:r.status,data};
}
let health;
for(let i=0;i<22;i++){
 try{health=await json('/api/health');if(health.status===200&&health.data.version===VERSION)break;
 console.log('WAIT_FOR_DEPLOY',i,health.status,health.data.version||health.data.error||'unknown');}
 catch(e){console.log('WAIT_FOR_DEPLOY',i,String(e.message||e));}
 await new Promise(done=>setTimeout(done,4500));
}
assert.equal(health?.status,200);assert.equal(health.data.version,VERSION);
assert.equal(health.data.sampledNotComplete,true);
const invalid=await json('/api/analyze',{address:'bad',start:'2026-11-01',end:'2026-11-07'});
assert.equal(invalid.status,400);
const today=new Date(),end=today.toISOString().slice(0,10);
const start=new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
const run=await json('/api/analyze',{address:'0xfaC0718D882E5f07e1972D617bd430CD72A55D84',start,end});
assert.equal(run.status,200,JSON.stringify(run.data).slice(0,550));
assert.equal(run.data.ok,true);
assert.equal(run.data.coverage.logsAttempted,18);
assert.ok(run.data.coverage.logsSucceeded>0);
assert.equal(run.data.coverage.completePeriod,false);
assert.deepEqual(Object.keys(run.data.totals.counts),['transfer_in','transfer_out','swap','approval','contract_interaction']);
for(const format of ['markdown','csv']){
 const r=await fetch(base+'/api/export?format='+format,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify(run.data),signal:AbortSignal.timeout(18000)});
 assert.equal(r.status,200,format+' export failed');
 const t=await r.text();
 assert.ok(t.length>80);
 assert.match(t,/Pharos|pharos|transfer/i);
}
const page=await fetch(base,{signal:AbortSignal.timeout(15000)});
assert.equal(page.status,200);
assert.match(await page.text(),/Audit-Log Agent/);
console.log('AUDIT_LOG_DEPLOYED_PROOF',JSON.stringify({
 website:base,version:VERSION,chain:run.data.chainId,from:start,to:end,
 sampledWindows:run.data.coverage.windows,logsSucceeded:run.data.coverage.logsSucceeded,
 observedByCategory:run.data.totals.counts,notableLinks:run.data.notable.map(e=>e.link),
 markdownExport:true,csvExport:true,completeHistory:false}));
