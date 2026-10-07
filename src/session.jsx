import React,{createContext,useContext,useState,useRef,useEffect,useCallback} from 'react';
import {api,readSession,saveSession} from './model';
const Context=createContext(null);
export const useSession=()=>useContext(Context);
export function Session({children}) {
 const [state,setState]=useState(null),[connection,setConnection]=useState('loading'),[notice,setNotice]=useState(''),[launching,setLaunching]=useState(false);
 const [runId,updateId]=useState(()=>readSession('veil-run',null)),[chapter,updateChapter]=useState(()=>readSession('veil-chapter',0));
 const [candidate,setCandidate]=useState(null),[base,setBase]=useState(null),[verification,setVerification]=useState(null),[checking,setChecking]=useState(false),[candidateName,setCandidateName]=useState('');
 const mounted=useRef(true),inflight=useRef(false),launchLock=useRef(false);
 const refresh=useCallback(async()=>{if(inflight.current)return;inflight.current=true;try{const x=await api('/api/state');if(mounted.current){setState(x);setConnection('online');}}catch{if(mounted.current)setConnection('offline')}finally{inflight.current=false}},[]);
 useEffect(()=>{mounted.current=true;refresh();const t=setInterval(refresh,1500);return()=>{mounted.current=false;clearInterval(t)}},[refresh]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),8000);return()=>clearTimeout(t)},[notice]);
 const setRunId=id=>{updateId(id);saveSession('veil-run',id)};
 const setChapter=i=>{updateChapter(i);saveSession('veil-chapter',i)};
 const busy=launching || state?.busy;
 const run=state?.runs.find(r=>r.id===runId);
 const receipt=state?.receipts.find(r=>r.orderId===run?.receiptId);
 async function launch(scenario){if(launchLock.current||busy||connection!=='online')return;launchLock.current=true;setLaunching(true);setRunId(null);setBase(null);setCandidate(null);setVerification(null);setCandidateName('');try{const r=await api('/api/run',{scenario});setRunId(r.id);await refresh()}catch(e){setNotice(e.message)}finally{launchLock.current=false;setLaunching(false)}}
 async function verify(r,name,keepBase=false){if(!r||checking)return;if(!keepBase)setBase(r);setCandidate(r);setCandidateName(name);setChecking(true);setVerification(null);try{setVerification(await api('/api/verify',{receipt:r}))}catch(e){setNotice(e.message);setVerification({valid:false,unavailable:true,checks:[]})}finally{setChecking(false)}}
 function tamper(){const original=base||receipt||state?.receipts[0];if(!original)return;const changed=structuredClone(original);changed.outcome=!changed.outcome;verify(changed,'篡改副本 · 仅翻转验收结果',true)}
 async function expire(){if(busy)return;setLaunching(true);try{await api(`/api/runs/${run.id}/expire`,{});await refresh();setNotice('已推进本地测试时钟，并确认到期退款。')}catch(e){setNotice(e.message)}finally{setLaunching(false)}}
 return <Context.Provider value={{state,connection,refresh,notice,setNotice,busy,run,runId,setRunId,receipt,chapter,setChapter,launch,expire,candidate,base,verification,checking,candidateName,verify,tamper}}>{children}</Context.Provider>
}
