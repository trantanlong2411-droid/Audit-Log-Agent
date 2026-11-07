import {connect} from '../src/mcp.mjs';
const c=await connect();
try{
 const info=await c.tool('get_chain_info');
 const candidates=[22205123,22003449,21940276,22242605];
 for(const blockNumber of candidates){
  const b=await c.tool('get_block',{block:String(blockNumber),includeTransactions:true});
  const txs=b?.transactions||[];
  console.log('EXAMPLE_BLOCK',JSON.stringify({block:blockNumber,timestamp:b.timestamp,count:txs.length,
    transactions:txs.slice(0,4).map(x=>({from:x.from,to:x.to,hash:x.hash,value:x.value,selector:(x.input||'').slice(0,10)}))}));
  if(txs.length>0)break;
 }
}finally{await c.close()}
