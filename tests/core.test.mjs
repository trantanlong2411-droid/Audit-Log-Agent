import test from 'node:test';import assert from 'node:assert/strict';
import {validateRequest,topic,parseLog,TOPICS,TOKENS,windows,parseBlock,locate,makeReport,csv,markdown,analyze} from '../src/core.mjs';
const OWNER='0xfaC0718D882E5f07e1972D617bd430CD72A55D84';
const OTHER='0x0000000000000000000000000000000000000021';
const hex=n=>'0x'+BigInt(n).toString(16);
const hex32=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const HASH='0x'+'a'.repeat(64),TOPIC_OWNER=topic(OWNER);
const NOW=Date.parse('2026-11-07T09:00:00Z'),TIP_SECONDS=Math.floor(NOW/1000),TIP_HEIGHT=22360000;
function approvalLog(block=TIP_HEIGHT-250){
 return {topics:[TOPICS.approval,TOPIC_OWNER,topic(OTHER)],data:hex32(2n**256n-1n),
  blockNumber:hex(block),transactionHash:HASH,logIndex:'0x0'};
}
function mockClient({failWeth=false}={}){
 return async()=>({list:async()=>['get_chain_info','get_block','get_logs','get_transaction','get_transaction_receipt'].map(name=>({name})),
  tool:async(name,args={})=>{
   if(name==='get_chain_info')return {chainId:1672,chainIdMatches:true,latestBlock:String(TIP_HEIGHT)};
   if(name==='get_block'){const n=Number(args.block);
    return {number:hex(n),timestamp:hex(TIP_SECONDS-(TIP_HEIGHT-n)),
     transactions:args.includeTransactions?[{hash:'0x'+'b'.repeat(64),from:OWNER,to:OTHER,value:hex(1000000000000000000n),input:'0x'}]:[]};}
   if(name==='get_logs'){
    if(failWeth&&args.address===TOKENS[2].address)throw Error('RPC provider temporarily unavailable');
    if(args.address===TOKENS[0].address&&Array.isArray(args.topics[0]) &&
      Number(args.toBlock)>TIP_HEIGHT-100000 && Number(args.fromBlock)<TIP_HEIGHT-250)
      return [approvalLog()];
    return [];
   }
   if(name==='get_transaction')return {hash:args.hash,from:OWNER,to:OTHER,input:'0x095ea7b3',blockNumber:hex(TIP_HEIGHT-250),value:'0x0'};
   if(name==='get_transaction_receipt')return {status:'0x1',logs:[]};
   throw Error('Unexpected method '+name);
  },close:async()=>{}});
}
test('accepts an address and inclusive UTC calendar range; rejects future and excess',()=>{
 const req=validateRequest({address:OWNER,start:'2026-11-01',end:'2026-11-07'},NOW);
 assert.equal(req.wallet.toLowerCase(),OWNER.toLowerCase());assert.ok(req.end>req.start);
 assert.throws(()=>validateRequest({address:'bad',start:'2026-11-01',end:'2026-11-07'},NOW),/valid/);
 assert.throws(()=>validateRequest({address:OWNER,start:'2026-10-01',end:'2026-11-07'},NOW),/31/);
 assert.throws(()=>validateRequest({address:OWNER,start:'2026-11-09',end:'2026-11-10'},NOW),/future/);
 assert.throws(()=>validateRequest({address:OWNER,start:'2026-02-30',end:'2026-03-01'},NOW),/valid/);
});
test('three non-overlapping scan windows and approximate date-block mapping',async()=>{
 const w=windows(100000,400000,3);assert.equal(w.length,3);
 assert.ok(w.every(x=>x.toBlock-x.fromBlock+1<=1000));
 const tip={height:TIP_HEIGHT,secs:TIP_SECONDS};
 const target=TIP_SECONDS-50400;
 const found=await locate(async n=>({height:n,secs:TIP_SECONDS-(TIP_HEIGHT-n)}),tip,target,1);
 assert.equal(found,TIP_HEIGHT-50400);
 assert.equal(parseBlock({number:'0xa',timestamp:'0x64'}).height,10);
});
test('parses indexed token approval and excludes unrelated owners',()=>{
 const result=parseLog(approvalLog(),TOKENS[0],OWNER);
 assert.equal(result.type,'approval');assert.equal(result.to.toLowerCase(),OTHER.toLowerCase());
 assert.match(result.notable,/unlimited/i);
 assert.equal(parseLog({...approvalLog(),topics:[TOPICS.approval,topic(OTHER),topic(OTHER)]},TOKENS[0],OWNER),null);
});
test('detects and accounts for native and ERC-20 categories with evidence',()=>{
 const event=parseLog(approvalLog(),TOKENS[0],OWNER);
 const report=makeReport({wallet:OWNER,startDate:'2026-11-06',endDate:'2026-11-07',
  blockStart:22310000,blockEnd:TIP_HEIGHT,chainBlock:TIP_HEIGHT,scope:{logsAttempted:3,logsSucceeded:3,
   windows:[{fromBlock:22310000,toBlock:22311000}],tokens:['USDC'],sampledBlocks:[22310050]},events:[event,event],
  errors:[]});
 assert.equal(report.totals.counts.approval,1);assert.equal(report.notable.length,1);
 assert.match(report.summary,/sampled/);assert.equal(report.coverage.completePeriod,false);
 assert.match(csv(report),/Approval/);assert.match(markdown(report),/PARTIAL OBSERVATIONS/);
 assert.match(markdown(report),new RegExp(HASH));
});
test('end-to-end real-protocol-shape mock uses Chain MCP and gives partial categories',async()=>{
 const out=await analyze({address:OWNER,start:'2026-11-01',end:'2026-11-07'},mockClient(),NOW);
 assert.equal(out.ok,true);assert.equal(out.chainId,1672);
 assert.equal(out.coverage.logsAttempted,18);assert.equal(out.coverage.logsSucceeded,18);
 assert.equal(out.totals.counts.approval,1);
 assert.ok(out.totals.counts.transfer_out>=1);
 assert.ok(out.records.some(x=>x.link.includes('/tx/')));
});
test('individual token RPC failure degrades honestly',async()=>{
 const out=await analyze({address:OWNER,start:'2026-11-01',end:'2026-11-07'},mockClient({failWeth:true}),NOW);
 assert.equal(out.coverage.logsSucceeded,12);
 assert.ok(out.coverage.errors.some(x=>x.includes('WETH')));
 assert.equal(out.coverage.completePeriod,false);
});

test('known user-supplied transaction is verified against the selected wallet and UTC date range',async()=>{
 const data=await analyze({address:OWNER,start:'2026-11-01',end:'2026-11-07',evidenceTxHashes:HASH},mockClient(),NOW);
 assert.deepEqual(data.coverage.manuallyVerifiedTxHashes,[HASH]);
 assert.ok(data.records.some(e=>e.id==='manual-call-'+HASH));
 assert.throws(()=>validateRequest({address:OWNER,start:'2026-11-01',end:'2026-11-07',evidenceTxHashes:'not-a-hash'},NOW),/valid/);
});
