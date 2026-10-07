import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Inspect the index, not the working tree: these are the exact bytes to publish.
const files=execFileSync('git',['ls-files','--cached','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw new Error('Stage the release files before checking publication.');
const forbidden=/(^|\/)(node_modules|dist|\.runtime|\.git|target|artifacts)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:pem|key|zip|log)$/i;
const rules=[
 ['private key PEM',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
 ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
 ['API token',/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b/],
 ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['machine-specific path',/\/(?:Users|var\/folders)\/[A-Za-z0-9_.-]+\//],
 ['credential in URL',/https?:\/\/[^\s/:]+:[^\s/@]+@/],
];
const binary=new Set(['.png','.jpg','.jpeg','.webp','.woff','.woff2','.bin']);
const problems=[];let total=0;
for(const name of files){
 if(forbidden.test(name)&&name!=='.env.example')problems.push({file:name,reason:'excluded runtime or secret path'});
 const data=execFileSync('git',['show',':'+name],{maxBuffer:30*1024*1024});total+=data.length;
 if(data.length>25*1024*1024)problems.push({file:name,reason:'file exceeds 25 MiB release limit'});
 if(binary.has(path.extname(name).toLowerCase())||data.includes(0))continue;
 const text=data.toString('utf8');
 for(const [reason,pattern]of rules)if(pattern.test(text))problems.push({file:name,reason});
}
if(problems.length){console.error(JSON.stringify({ok:false,problems},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,files:files.length,bytes:total,note:'Known public development mnemonic is intentionally retained; never fund those accounts.'},null,2));
