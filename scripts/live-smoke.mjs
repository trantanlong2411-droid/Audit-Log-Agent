import {analyze,markdown,csv} from '../src/core.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const wallet=process.env.DEMO_WALLET||'0xfaC0718D882E5f07e1972D617bd430CD72A55D84';
const today=new Date();
const end=today.toISOString().slice(0,10);
const start=new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
const report=await analyze({address:wallet,start,end});
const proof={schema:'pharos-audit-log-live-v1',checkedAtUtc:new Date().toISOString(),
 wallet:report.wallet,period:{start,end},network:report.network,chainId:report.chainId,
 blockRange:{from:report.fromBlockApprox,to:report.toBlockApprox},chainTip:report.asOfBlock,
 totals:report.totals,notable:report.notable,coverage:report.coverage,
 exports:{markdownBytes:markdown(report).length,csvBytes:csv(report).length},
 warning:'Real Chain MCP sampling only; report is NOT exhaustive for the date range.'};
await mkdir('proof',{recursive:true});
await writeFile('proof/live-mcp-evidence.json',JSON.stringify(proof,null,2)+'\n');
console.log('AUDIT_LOG_LIVE_MCP_SUCCESS',JSON.stringify(proof));
if(report.chainId!==1672||report.coverage.logsSucceeded===0||!report.coverage.windows.length)process.exitCode=1;
