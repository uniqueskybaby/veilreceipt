import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from '../server/prover.mjs';

const version = '1.0.0-beta.19';
const toolsDir = path.join(root,'.runtime/tools');
await mkdir(toolsDir,{recursive:true});
const nargo = process.env.NARGO || path.join(toolsDir,'nargo');
try { await access(nargo); }
catch {
  const platform = { 'darwin-arm64':'aarch64-apple-darwin', 'darwin-x64':'x86_64-apple-darwin', 'linux-x64':'x86_64-unknown-linux-gnu', 'linux-arm64':'aarch64-unknown-linux-gnu' }[`${process.platform}-${process.arch}`];
  if(!platform) throw new Error('Set NARGO to an installed nargo 1.0.0-beta.19 executable on this platform.');
  const url=`https://github.com/noir-lang/noir/releases/download/v${version}/noir-${platform}.tar.gz`;
  console.log(`Downloading pinned Noir ${version} from the official release…`);
  const response=await fetch(url); if(!response.ok) throw new Error(`Noir download failed: ${response.status}`);
  const archive=path.join(toolsDir,'noir.tar.gz');
  await writeFile(archive,Buffer.from(await response.arrayBuffer()));
  execFileSync('tar',['-xzf',archive,'-C',toolsDir],{stdio:'inherit'});
}
const detected=execFileSync(nargo,['--version'],{encoding:'utf8'});
if(!detected.includes(`nargo version = ${version}\n`)) throw new Error(`Expected nargo ${version}, got ${detected}`);
for(const name of ['receipt','commitments']) execFileSync(nargo,['compile'],{cwd:path.join(root,'circuits',name),stdio:'inherit'});
execFileSync(process.execPath,['scripts/setup.mjs'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['scripts/compile.mjs'],{cwd:root,stdio:'inherit'});
console.log('Ready. npm test, then npm run dev. The warmed runtime no longer needs remote SRS downloads.');
