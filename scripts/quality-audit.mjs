import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const output=process.env.QA_OUTPUT||'artifacts/quality';
mkdirSync(output,{recursive:true});
const results=[];
for(const [page,suffix] of [['home',''],['story','#/story']]) for(let run=1;run<=3;run++){
 const file=`${output}/lighthouse-${page}-${run}.json`;
 execFileSync(process.execPath,['node_modules/lighthouse/cli/index.js',`http://127.0.0.1:4318/${suffix}`,'--chrome-flags=--headless=new','--only-categories=performance,accessibility,best-practices','--output=json',`--output-path=${file}`,'--no-enable-error-reporting','--quiet'],{stdio:'inherit'});
 const r=JSON.parse(readFileSync(file));
 const entry={page,run,performance:r.categories.performance.score*100,accessibility:r.categories.accessibility.score*100,LCP:r.audits['largest-contentful-paint'].numericValue,CLS:r.audits['cumulative-layout-shift'].numericValue,failedAccessibility:r.categories.accessibility.auditRefs.filter(x=>r.audits[x.id].score===0).map(x=>({id:x.id,details:r.audits[x.id].details})),environment:r.environment,throttling:r.configSettings.throttling};
 results.push(entry);writeFileSync(`${output}/performance-accessibility.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({...entry,failedAccessibility:entry.failedAccessibility.map(x=>x.id)}));
}
const median=values=>values.toSorted((a,b)=>a-b)[1];
const summary={at:new Date().toISOString(),pages:['home','story'].map(page=>{const r=results.filter(x=>x.page===page);return {page,medianPerformance:median(r.map(x=>x.performance)),medianLCP:median(r.map(x=>x.LCP)),maxCLS:Math.max(...r.map(x=>x.CLS)),minAccessibility:Math.min(...r.map(x=>x.accessibility))}})};
writeFileSync(`${output}/performance-summary.json`,JSON.stringify(summary,null,2));
if(summary.pages.some(x=>x.medianPerformance<90||x.medianLCP>2500||x.maxCLS>.1||x.minAccessibility<100))process.exitCode=1;
