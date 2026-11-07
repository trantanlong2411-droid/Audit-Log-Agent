import {analyze,markdown,csv,TOKENS} from './core.mjs';
import {HTML} from './page.mjs';
export const VERSION='pharos-audit-log-2026-11-07-v1';
const resp=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const limit=new Map();
function overLimit(request){
 const ip=(request.headers.get('cf-connecting-ip')||'anonymous').slice(0,80),now=Date.now();
 const item=limit.get(ip);
 if(!item||now-item.since>60000){limit.set(ip,{since:now,count:1});return false;}
 item.count++;return item.count>6;
}
async function parseBody(req,size=1300){
 const txt=await req.text();
 if(txt.length>size)throw Error('Request body too large');
 const json=JSON.parse(txt);
 if(!json||typeof json!=='object'||Array.isArray(json))throw Error('Expected JSON object');
 return json;
}
export default {
 async fetch(request){
  const u=new URL(request.url),p=u.pathname;
  if(request.method==='GET'&&p==='/')return new Response(HTML,{headers:{
   'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
   'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  }});
  if(request.method==='GET'&&p==='/api/health')return resp({ok:true,version:VERSION,
   chainId:1672,network:'Pharos Mainnet',mcp:'https://mcp.pharos.xyz/mcp',
   exports:['markdown','csv'],walletRequired:true,utcDates:true,
   categories:['transfer_in','transfer_out','swap','approval','contract_interaction'],
   sampledNotComplete:true,monitoredTokens:TOKENS.map(x=>x.symbol),
   safety:'Read-only; no private keys, login, or on-chain signing',
   note:'Health validates the public Worker only. Use /api/analyze for real on-chain proof.'});
  if(request.method==='POST'&&p==='/api/analyze'){
   if(overLimit(request))return resp({ok:false,error:'Rate limited; retry in 60 seconds'},429);
   try{
    const body=await parseBody(request);
    return resp(await analyze(body));
   }catch(err){
    const msg=String(err.message||err).slice(0,350);
    const invalid=/Enter a valid|UTC|date|start date|end date|range|future|older than|Expected JSON/.test(msg);
    return resp({ok:false,error:msg,warning:'No on-chain evidence has been fabricated.'},invalid?400:503);
   }
  }
  if(request.method==='POST'&&p==='/api/export'){
   try{
    const report=await parseBody(request,180000),format=u.searchParams.get('format');
    if(report.schema!=='pharos-wallet-audit-v1'||report.chainId!==1672||!Array.isArray(report.records)||
       report.records.length>250||!Array.isArray(report.categories)||!report.coverage||!report.totals)
       throw Error('Invalid or unsupported audit report');
    if(!['markdown','csv'].includes(format))throw Error('Only markdown or csv supported');
    const body=format==='csv'?csv(report):markdown(report);
    return new Response(body,{headers:{'content-type':format==='csv'?'text/csv;charset=utf-8':'text/markdown;charset=utf-8',
      'content-disposition':'attachment; filename="pharos-wallet-audit.'+(format==='csv'?'csv':'md')+'"',
      'cache-control':'no-store','x-content-type-options':'nosniff'}});
   }catch(err){return resp({ok:false,error:String(err.message||err).slice(0,160)},400);}
  }
  return resp({ok:false,error:'Not found'},404);
 }
};
