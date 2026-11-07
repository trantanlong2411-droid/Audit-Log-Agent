// Fixed, official Pharos Mainnet MCP. No custom RPC URLs accepted.
export const ENDPOINT='https://mcp.pharos.xyz/mcp';
const PROTOCOL='2025-03-26';
function parseSse(raw,id){
  for(const chunk of raw.replace(/\r\n/g,'\n').split(/\n\n+/)){
    const line=chunk.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trim()).join('\n');
    if(!line)continue;
    try{const obj=JSON.parse(line);if(obj.id===id)return obj;}catch{}
  }
  throw Error('MCP SSE result missing request ID '+id);
}
export function unpack(value,name){
  if(!value||value.isError)throw Error(name+' returned MCP error '+JSON.stringify(value?.content||[]).slice(0,190));
  if(value.structuredContent&&typeof value.structuredContent==='object'){
    const obj=value.structuredContent;
    if(obj.error||obj.mcpError)throw Error(name+': '+JSON.stringify(obj.error||obj.mcpError).slice(0,190));
    if(obj.chainId!==undefined||obj.number!==undefined||obj.result!==undefined||Array.isArray(obj))return obj;
  }
  const text=value.content?.find(s=>s.type==='text')?.text;
  if(typeof text!=='string')throw Error(name+' returned no JSON text');
  const obj=JSON.parse(text);
  if(obj?.error||obj?.mcpError)throw Error(name+' returned RPC error '+String(obj.error?.message||obj.mcpError?.message||'error'));
  return obj;
}
export async function connect(fetcher=fetch){
  let seq=0,session='',version=PROTOCOL;
  async function send(method,params={},notify=false){
    const id=notify?null:++seq;
    const msg={jsonrpc:'2.0',...(!notify?{id}:{}),method,...(!notify?{params}:{})};
    const res=await fetcher(ENDPOINT,{method:'POST',headers:{
      'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':version,
      ...(session?{'mcp-session-id':session}:{})
    },body:JSON.stringify(msg),signal:AbortSignal.timeout(23000)});
    if(!res.ok)throw Error('Chain MCP HTTP '+res.status+': '+(await res.text()).slice(0,150));
    session=res.headers.get('mcp-session-id')||session;
    if(notify){await res.text();return null;}
    const raw=await res.text();if(raw.length>1050000)throw Error('Oversized Chain MCP result');
    const response=(res.headers.get('content-type')||'').includes('event-stream')?parseSse(raw,id):JSON.parse(raw);
    if(response.id!==id)throw Error('MCP response ID mismatch');
    if(response.error)throw Error('MCP '+String(response.error.message||'protocol error'));
    return response.result;
  }
  const init=await send('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'audit-log-agent',version:'1.0.0'}});
  version=init?.protocolVersion||version;
  await send('notifications/initialized',{},true);
  return {
    list:async()=>{const val=await send('tools/list');return val.tools||[];},
    tool:async(name,args={})=>unpack(await send('tools/call',{name,arguments:args}),name),
    close:async()=>{if(session)try{await fetcher(ENDPOINT,{method:'DELETE',headers:{'mcp-session-id':session,'mcp-protocol-version':version},signal:AbortSignal.timeout(2200)});}catch{}}
  };
}
