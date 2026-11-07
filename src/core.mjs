import {getAddress,isAddress,id,formatUnits,Interface} from 'ethers';
import {connect,ENDPOINT} from './mcp.mjs';
export const NETWORK=1672;
export const EXPLORER='https://www.pharosscan.xyz';
export const TOKENS=[
 {symbol:'USDC',address:'0xc879c018db60520f4355c26ed1a6d572cdac1815',decimals:6},
 {symbol:'WPROS',address:'0x52c48d4213107b20bc583832b0d951fb9ca8f0b0',decimals:18},
 {symbol:'WETH',address:'0x1f4b7011ee3d53969bb67f59428a9ec0477856e9',decimals:18}
];
export const TOPICS={transfer:id('Transfer(address,address,uint256)'),approval:id('Approval(address,address,uint256)'),swapV2:id('Swap(address,uint256,uint256,uint256,uint256,address)')};
const SWAP_SELECTORS=new Set(['0x38ed1739','0x8803dbee','0x7ff36ab5','0x18cbafe5','0x414bf389','0xc04b8d59','0x5ae401dc','0x472b43f3','0x12aa3caf']);
export const EVIDENCE_LIMIT=6;
const eth=(n)=>typeof n==='string'&&/^0x[\da-f]+$/i.test(n)?BigInt(n):(()=>{throw Error('Unexpected hex blockchain quantity')})();
export function validateRequest(input,now=Date.now()){
 if(!input||typeof input!=='object'||!isAddress(input.address||''))throw Error('Enter a valid 0x EVM wallet address');
 const wallet=getAddress(input.address);
 for(const k of ['start','end'])if(typeof input[k]!=='string'||!/^(?:20\d\d)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(input[k])||
   !Number.isFinite(Date.parse(input[k]+'T00:00:00Z'))||new Date(input[k]+'T00:00:00Z').toISOString().slice(0,10)!==input[k])
   throw Error('Provide a valid UTC '+k+' date (YYYY-MM-DD)');
 const start=Date.parse(input.start+'T00:00:00Z'),exclusiveEnd=Date.parse(input.end+'T00:00:00Z')+86400000;
 if(start>=exclusiveEnd)throw Error('The start date is after the end date');
 if(exclusiveEnd-start>31*86400000)throw Error('Maximum report range is 31 calendar days');
 if(start>now)throw Error('The selected date range is in the future');
 if(exclusiveEnd<now-180*86400000)throw Error('Reports older than 180 days are outside this demo scope');
 const evidenceTxHashes=typeof input.evidenceTxHashes==='string'?
   [...new Set(input.evidenceTxHashes.split(/[\s,;]+/).filter(Boolean).map(x=>x.toLowerCase()))]:[];
 if(evidenceTxHashes.length>2||evidenceTxHashes.some(x=>!/^0x[\da-f]{64}$/.test(x)))
   throw Error('Provide up to two valid 0x transaction hashes as optional evidence');
 return {wallet,start,end:Math.min(exclusiveEnd,now),startDate:input.start,endDate:input.end,evidenceTxHashes};
}
export function topic(address){return '0x'+getAddress(address).slice(2).toLowerCase().padStart(64,'0')}
export function parseBlock(block){
 if(!block||typeof block!=='object')throw Error('Chain MCP returned empty block');
 const height=Number(eth(block.number)),secs=Number(eth(block.timestamp));
 if(!Number.isSafeInteger(height)||!Number.isSafeInteger(secs))throw Error('Block fields out of range');
 return {height,secs,transactions:Array.isArray(block.transactions)?block.transactions:[]};
}
export async function locate(fetchBlock,tip,target,secondsPerBlock,maxAttempts=5){
 let guess=Math.max(1,Math.min(tip.height,Math.round(tip.height+(target-tip.secs)/secondsPerBlock)));
 let candidate=null;
 for(let i=0;i<maxAttempts;i++){
  candidate=await fetchBlock(guess);
  const delta=target-candidate.secs;
  if(Math.abs(delta)<=140)return candidate.height;
  const shift=Math.round(delta/secondsPerBlock);
  if(!shift)break;
  const next=Math.max(1,Math.min(tip.height,guess+shift));
  if(guess===next)break;guess=next;
 }
 if(candidate&&Math.abs(candidate.secs-target)<=600)return candidate.height;
 throw Error('Could not map requested UTC date to a sufficiently accurate block boundary');
}
export function windows(start,end,count=3){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end)throw Error('Bad period block bounds');
 const points=[];
 const span=end-start+1;
 for(let i=0;i<count;i++){
  const center=Math.floor(start+(i+0.5)*span/count);
  const low=Math.min(end,Math.max(start,center-499));
  const high=Math.min(end,low+999);
  if(!points.some(w=>w.fromBlock===low&&w.toBlock===high))points.push({fromBlock:low,toBlock:high});
 }
 return points;
}
export function parseLog(log,token,owner){
 if(!log||!Array.isArray(log.topics)||log.topics.length<3)return null;
 if(!/^0x[\da-f]{64}$/i.test(log.transactionHash||'')||
   !/^0x[\da-f]+$/i.test(log.blockNumber||'')||!/^0x[\da-f]{64}$/i.test(log.data||''))return null;
 const t=log.topics[0]?.toLowerCase(),mine=topic(owner).toLowerCase(),a=log.topics[1]?.toLowerCase(),b=log.topics[2]?.toLowerCase();
 const approval=t===TOPICS.approval.toLowerCase()&&a===mine;
 const outgoing=t===TOPICS.transfer.toLowerCase()&&a===mine;
 const incoming=t===TOPICS.transfer.toLowerCase()&&b===mine;
 if(!approval&&!outgoing&&!incoming)return null;
 const amount=BigInt(log.data);
 const height=Number(eth(log.blockNumber));
 if(!Number.isSafeInteger(height))return null;
 const event={
  id:log.transactionHash.toLowerCase()+'-'+(log.logIndex||log.transactionLogIndex||'n')+'-'+t,
  type:approval?'approval':outgoing?'transfer_out':'transfer_in',
  label:approval?'Token spending permission':outgoing?'Token transfer out':'Token transfer in',
  token:token.symbol,tokenAddress:token.address,amountRaw:amount.toString(),
  amount:formatUnits(amount,token.decimals),unit:token.symbol,blockNumber:height,
  hash:log.transactionHash,link:EXPLORER+'/tx/'+log.transactionHash,
  from:outgoing?owner:incoming?getAddress('0x'+log.topics[1].slice(-40)):owner,
  to:approval?getAddress('0x'+log.topics[2].slice(-40)):
    outgoing?getAddress('0x'+log.topics[2].slice(-40)):owner,
  source:'Verified ERC-20 '+(approval?'Approval':'Transfer')+' log via Pharos Chain MCP'
 };
 if(approval)event.notable=amount>=(1n<<255n)?'Large / unlimited approval event; this is historical, not proof of current allowance':'Approval event observed in sampled blocks';
 return event;
}
function nativeEvents(block,owner,fromBlock,toBlock){
 const out=[];
 for(const tx of block.transactions){
  if(!tx||typeof tx!=='object'||!/^0x[\da-f]{64}$/i.test(tx.hash||''))continue;
  const incoming=(tx.to||'').toLowerCase()===owner.toLowerCase();
  const outgoing=(tx.from||'').toLowerCase()===owner.toLowerCase();
  if(!incoming&&!outgoing)continue;
  let amount;try{amount=eth(tx.value||'0x0')}catch{continue}
  if(amount>0n){
   out.push({id:'native-'+tx.hash.toLowerCase(),type:outgoing?'transfer_out':'transfer_in',
    label:outgoing?'Native PROS transfer out':'Native PROS transfer in',
    token:'PROS',amountRaw:amount.toString(),amount:formatUnits(amount,18),unit:'PROS',
    blockNumber:block.height,hash:tx.hash,link:EXPLORER+'/tx/'+tx.hash,
    from:tx.from,to:tx.to,source:'Sampled full block transaction via Chain MCP get_block'});
  }
 }
 return out;
}
function totals(events){
 const counts={transfer_in:0,transfer_out:0,swap:0,approval:0,contract_interaction:0};
 const volumes={};
 for(const e of events){
  if(counts[e.type]!==undefined)counts[e.type]++;
  if((e.type==='transfer_in'||e.type==='transfer_out')&&/^\d+$/.test(e.amountRaw||'')){
   const key=e.unit+':'+e.type,decimals=TOKENS.find(t=>t.symbol===e.unit)?.decimals??18;
   volumes[key]=(BigInt(volumes[key]||'0')+BigInt(e.amountRaw)).toString();
  }
 }
 const humanVolumes=Object.fromEntries(Object.entries(volumes).map(([key,raw])=>[key,formatUnits(BigInt(raw),TOKENS.find(t=>t.symbol===key.split(':')[0])?.decimals??18)]));
 return {counts,volumeByAssetAndDirection:humanVolumes,totalObservedRecords:events.length};
}
export function makeReport({wallet,startDate,endDate,blockStart,blockEnd,scope,events,chainBlock,errors=[]}){
 const dedup=[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>b.blockNumber-a.blockNumber||a.hash.localeCompare(b.hash));
 const result=totals(dedup);
 const notable=[...dedup].sort((a,b)=>{
  const rank=x=>x.type==='swap'?5:x.type==='approval'?4:x.type==='contract_interaction'?3:2;
  const score=rank(b)-rank(a);
  return score||b.blockNumber-a.blockNumber;
 }).slice(0,6);
 const coverage={...scope,
  fullHistory:false,
  completePeriod:false,
  method:'Noncontiguous block samples, event logs for three tokens, sampled native blocks, and a bounded number of enriched transactions.',
  limitation:'Totals are for OBSERVED records in sampled blocks only, not totals for all wallet activity during the selected date range. Unindexed internal transfers, other tokens, NFT activity and events outside the samples are missing.',
  errors};
 return {ok:true,schema:'pharos-wallet-audit-v1',wallet,network:'Pharos Mainnet',chainId:1672,
  fromDateUtc:startDate,toDateUtc:endDate,fromBlockApprox:blockStart,toBlockApprox:blockEnd,
  asOfBlock:chainBlock,createdAtUtc:new Date().toISOString(),
  categories:[
   {id:'transfer_in',title:'Transfers in'},{id:'transfer_out',title:'Transfers out'},
   {id:'swap',title:'Swaps identified'},{id:'approval',title:'Approvals observed'},
   {id:'contract_interaction',title:'Contract interactions identified'}],
  totals:result,notable,records:dedup,coverage,
  summary:'Across the inspected samples, I found '+result.counts.transfer_in+' incoming transfers, '+
   result.counts.transfer_out+' outgoing transfers, '+result.counts.swap+' identifiable swaps, '+
   result.counts.approval+' approvals and '+result.counts.contract_interaction+
   ' contract interactions. These are sampled observations, not the wallet’s complete period totals.',
  source:{name:'Official Pharos Chain MCP',endpoint:ENDPOINT,repo:'https://github.com/PharosNetwork/pharos-mcp'},
  explorer:EXPLORER+'/address/'+wallet};
}
export async function analyze(input,connectFn=connect,now=Date.now()){
 const request=validateRequest(input,now),owner=request.wallet;
 let cli;const errors=[],events=[],blocksCache=new Map();
 const empty={logsAttempted:0,logsSucceeded:0,sampledBlocks:[],txHashesEnriched:0,receiptsEnriched:0,
  tokens:TOKENS.map(x=>x.symbol),windows:[],observedEventCapPerQuery:60,
  manuallySuppliedTxHashes:request.evidenceTxHashes.length,manuallyVerifiedTxHashes:[]};
 try{
  cli=await connectFn();
  const tools=(await cli.list()).map(t=>t.name);
  for(const name of ['get_chain_info','get_block','get_logs','get_transaction','get_transaction_receipt'])
   if(!tools.includes(name))throw Error('Pharos Chain MCP is missing '+name);
  const info=await cli.tool('get_chain_info');
  if(Number(info.chainId)!==NETWORK||info.chainIdMatches===false)throw Error('Not connected to Pharos Mainnet 1672');
  const tipNumber=Number(info.latestBlock);
  async function fetchBlock(n,includeTransactions=false){
   const key=String(n)+'-'+includeTransactions;if(blocksCache.has(key))return blocksCache.get(key);
   const b=parseBlock(await cli.tool('get_block',{block:String(n),includeTransactions}));
   if(b.height!==n)throw Error('Mismatched returned block height');
   blocksCache.set(key,b);return b;
  }
  const tip=await fetchBlock(tipNumber);
  if(request.start/1000>tip.secs)throw Error('The requested range starts after the current chain tip');
  const historicalAnchor=await fetchBlock(Math.max(1,tipNumber-1000000));
  const secsPerBlock=(tip.secs-historicalAnchor.secs)/(tipNumber-historicalAnchor.height);
  if(!Number.isFinite(secsPerBlock)||secsPerBlock<=0)throw Error('Cannot estimate Pharos block time');
  const targetStart=Math.round(request.start/1000),targetEnd=Math.min(Math.round(request.end/1000),tip.secs);
  const blockStart=await locate(n=>fetchBlock(n),tip,targetStart,secsPerBlock);
  const blockEnd=targetEnd>=tip.secs?tipNumber:await locate(n=>fetchBlock(n),tip,targetEnd,secsPerBlock);
  if(blockStart>blockEnd)throw Error('No blocks in the requested UTC date range');
  const sampled=windows(blockStart,blockEnd);
  empty.windows=sampled;
  for(const token of TOKENS){
   for(const w of sampled){
    const filters=[
     {label:'outgoing/approvals',topics:[[TOPICS.transfer,TOPICS.approval],topic(owner)]},
     {label:'incoming',topics:[TOPICS.transfer,null,topic(owner)]}
    ];
    for(const filter of filters){
     empty.logsAttempted++;
     try{
      const logs=await cli.tool('get_logs',{address:token.address,topics:filter.topics,
       fromBlock:String(w.fromBlock),toBlock:String(w.toBlock)});
      if(!Array.isArray(logs))throw Error('Logs MCP did not return array');
      empty.logsSucceeded++;
      if(logs.length>60)errors.push('Truncated '+token.symbol+' '+filter.label+' sample at '+w.fromBlock+'-'+w.toBlock+' after 60 records');
      for(const log of logs.slice(0,60)){const result=parseLog(log,token,owner);if(result)events.push(result);}
     }catch(err){errors.push('Failed '+token.symbol+' '+filter.label+' logs at '+w.fromBlock+'-'+w.toBlock+': '+String(err.message||err).slice(0,100));}
    }
   }
  }
  for(const w of sampled){
   const n=Math.floor((w.fromBlock+w.toBlock)/2);
   try{
    const block=await fetchBlock(n,true);
    empty.sampledBlocks.push(n);
    events.push(...nativeEvents(block,owner));
   }catch(err){errors.push('Could not inspect native activity in sampled block #'+n+': '+String(err.message||err).slice(0,120));}
  }
  // Optional user-supplied hashes are never trusted as evidence until
  // Pharos Chain MCP verifies the wallet relationship and exact block date.
  // This is proof enrichment, not proof the entire period was enumerated.
  for(const hash of request.evidenceTxHashes){
   try{
    const tx=await cli.tool('get_transaction',{hash});
    if(!tx||String(tx.hash||'').toLowerCase()!==hash)throw Error('Transaction not found on Mainnet');
    const from=(tx.from||'').toLowerCase(),to=(tx.to||'').toLowerCase();
    if(from!==owner.toLowerCase()&&to!==owner.toLowerCase())throw Error('Transaction does not involve the queried wallet');
    const height=Number(eth(tx.blockNumber||'0x0'));
    if(!Number.isSafeInteger(height)||height<blockStart||height>blockEnd)throw Error('Transaction is outside the selected approximate date range');
    const block=await fetchBlock(height);
    if(block.secs*1000<request.start||block.secs*1000>=request.end)throw Error('Transaction UTC timestamp is outside selected dates');
    const receipt=await cli.tool('get_transaction_receipt',{hash});
    if(!receipt||typeof receipt.status!=='string')throw Error('On-chain receipt is unavailable');
    empty.manuallyVerifiedTxHashes.push(hash);
    empty.receiptsEnriched++;
    const passed=receipt.status==='0x1';
    if(Array.isArray(receipt.logs)){
     for(const log of receipt.logs){
      const token=TOKENS.find(x=>x.address.toLowerCase()===String(log.address||'').toLowerCase());
      if(!token)continue;
      const matched=parseLog(log,token,owner);
      if(matched){matched.source+=' (verified by supplied transaction receipt)';events.push(matched);}
     }
    }
    events.push(...nativeEvents({height,transactions:[tx]},owner));
    if(from===owner.toLowerCase()&&typeof tx.input==='string'&&tx.input.length>=10){
     const selector=tx.input.slice(0,10).toLowerCase();
     const type=SWAP_SELECTORS.has(selector)?'swap':selector==='0x095ea7b3'?'approval':'contract_interaction';
     const label=type==='swap'?(passed?'Swap transaction':'Failed swap attempt'):
       type==='approval'?'Token approval call':(passed?'Contract interaction':'Failed contract interaction');
     events.push({id:'manual-call-'+hash,type,label,token:null,amountRaw:'0',amount:'0',unit:'',
      blockNumber:height,hash,from:tx.from,to:tx.to,link:EXPLORER+'/tx/'+hash,selector,
      status:passed?'success':'failed',
      source:'Explicit transaction evidence verified through Chain MCP get_transaction, get_block and get_transaction_receipt'});
    }
   }catch(err){errors.push('Evidence transaction '+hash+': '+String(err.message||err).slice(0,140));}
  }
  const txHashes=[...new Set(events.filter(e=>e.hash).map(e=>e.hash))]
   .filter(x=>!request.evidenceTxHashes.includes(x.toLowerCase()))
   .slice(0,request.evidenceTxHashes.length?2:EVIDENCE_LIMIT);
  for(const hash of txHashes){
   try{
    const tx=await cli.tool('get_transaction',{hash});
    empty.txHashesEnriched++;
    if(!tx||typeof tx!=='object'||(tx.from||'').toLowerCase()!==owner.toLowerCase())continue;
    const inputData=typeof tx.input==='string'?tx.input:'0x',selector=inputData.slice(0,10).toLowerCase();
    if(inputData.length<=10)continue;
    const type=SWAP_SELECTORS.has(selector)?'swap':selector==='0x095ea7b3'?'approval':'contract_interaction';
    // Avoid synthetic swap labels: known selectors only. Other calls are contract interactions.
    const duplicate=events.some(e=>e.hash.toLowerCase()===hash.toLowerCase() && e.type===type);
    if(!duplicate)events.push({id:'call-'+hash.toLowerCase(),type,
     label:type==='swap'?'Swap call (selector verified)':type==='approval'?'Approval contract call':'Contract interaction',
     token:null,amount:'0',amountRaw:'0',unit:'',blockNumber:Number(eth(tx.blockNumber||'0x0')),
     hash,from:tx.from,to:tx.to,link:EXPLORER+'/tx/'+hash,
     source:'Chain MCP get_transaction / input selector '+selector,selector});
    if(type==='swap'){
     try{
      const receipt=await cli.tool('get_transaction_receipt',{hash});
      empty.receiptsEnriched++;
      const hasSwap=Array.isArray(receipt?.logs)&&receipt.logs.some(l=>l.topics?.[0]?.toLowerCase()===TOPICS.swapV2.toLowerCase());
      if(!hasSwap)errors.push('Swap '+hash+' recognized by selector only; V2 Swap log not confirmed');
     }catch(err){errors.push('Could not confirm swap receipt '+hash);}
    }
   }catch(err){errors.push('Could not enrich transaction '+hash+': '+String(err.message||err).slice(0,90));}
  }
  return makeReport({wallet:owner,startDate:request.startDate,endDate:request.endDate,
   blockStart,blockEnd,chainBlock:tipNumber,events,scope:empty,errors});
 }finally{if(cli)await cli.close().catch(()=>{});}
}
export function csv(report){
 const quote=x=>'"'+String(x??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,s=>"'"+s)+'"';
 const fields=['Type','Label','Token','Amount','Block','Transaction','From','To','Explorer','Evidence'];
 const rows=[fields,...report.records.map(x=>[x.type,x.label,x.unit||'',x.amount,x.blockNumber,x.hash,x.from,x.to,x.link,x.source])];
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
export function markdown(report){
 const tidy=s=>String(s??'').replace(/[|\n\r]/g,' ').slice(0,160);
 const lines=['# Pharos Wallet Activity Audit','',
  '**Wallet:** '+report.wallet,'**Period (UTC):** '+report.fromDateUtc+' through '+report.toDateUtc,
  '**Network:** Pharos Mainnet (1672)','**Chain tip checked:** '+report.asOfBlock,'',
  '> PARTIAL OBSERVATIONS ONLY. This is NOT a full history scan. Only sampled blocks and selected tokens are covered.','',
  '## Summary','',report.summary,'','## Category totals (observed only)','',
  '| Category | Count |','| --- | ---: |',...report.categories.map(x=>'| '+x.title+' | '+report.totals.counts[x.id]+' |'),'',
  '## Token transfer volumes (observed only)','',...Object.entries(report.totals.volumeByAssetAndDirection).map(([k,v])=>'- '+k+': '+v),'',
  '## Notable observed transactions','',...report.notable.map(x=>'- **'+x.type+'** — '+tidy(x.label)+' · Block '+x.blockNumber+' · [Transaction]('+x.link+')'),'',
  '## Transaction evidence (sample only)','',
  '| Category | Asset | Amount | Block | Tx link |','| --- | --- | ---: | ---: | --- |',
  ...report.records.map(x=>'| '+x.type+' | '+tidy(x.unit)+' | '+tidy(x.amount)+' | '+x.blockNumber+' | [Open]('+x.link+') |'),'',
  '## Coverage & limitations','',
  '- Source: '+report.source.endpoint,
  '- Log windows completed: '+report.coverage.logsSucceeded+' / '+report.coverage.logsAttempted,
  '- Sampled windows: '+report.coverage.windows.map(w=>w.fromBlock+'–'+w.toBlock).join(', '),
  '- Tokens: '+report.coverage.tokens.join(', '),
  '- User-provided transaction hashes verified: '+(report.coverage.manuallyVerifiedTxHashes||[]).length,
  '- '+report.coverage.limitation,
  ...report.coverage.errors.map(s=>'- Partial failure: '+tidy(s)),''];
 return lines.join('\n');
}
