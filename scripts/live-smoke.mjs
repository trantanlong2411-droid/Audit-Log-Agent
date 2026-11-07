import {analyze,markdown,csv} from '../src/core.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const wallet=process.env.DEMO_WALLET||'0xa55170cd156ca6dafd0b1ee3de87f3161799ad4c';
const today=new Date();
const end=today.toISOString().slice(0,10);
const start=new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
const evidenceTxHashes=process.env.DEMO_WALLET?undefined:'0x28a76a84b85e494cdf509611421e08ee871e74e9bd8b332e9ebcf146b60bd61b';
const report=await analyze({address:wallet,start,end,evidenceTxHashes});
const proof={schema:'pharos-audit-log-live-v1',checkedAtUtc:new Date().toISOString(),
 wallet:report.wallet,period:{start,end},network:report.network,chainId:report.chainId,
 blockRange:{from:report.fromBlockApprox,to:report.toBlockApprox},chainTip:report.asOfBlock,
 totals:report.totals,notable:report.notable,coverage:report.coverage,
 manuallyVerifiedTxHashes:report.coverage.manuallyVerifiedTxHashes,
 exports:{markdownBytes:markdown(report).length,csvBytes:csv(report).length},
 warning:'Real Chain MCP sampling only; report is NOT exhaustive for the date range.'};
await mkdir('proof',{recursive:true});
await writeFile('proof/live-mcp-evidence.json',JSON.stringify(proof,null,2)+'\n');
console.log('AUDIT_LOG_LIVE_MCP_SUCCESS',JSON.stringify(proof));
if(report.chainId!==1672||report.coverage.logsSucceeded===0||!report.coverage.windows.length)process.exitCode=1;
