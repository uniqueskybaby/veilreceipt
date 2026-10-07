import React,{useEffect,useState,useRef,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {FileCheck2,X,AlertTriangle,RefreshCw,ArrowUpRight} from './icons';
import {Session,useSession} from './session';
import Lab from './components/Lab';
const Receipts=lazy(()=>import('./components/Receipts'));
const Protocol=lazy(()=>import('./components/Protocol'));
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles.css';
import Story from './components/Story';
const pages={'/':Lab,'/lab':Lab,'/story':Story,'/receipts':Receipts,'/protocol':Protocol};
const nav=[['/','现场演示'],['/story','项目介绍'],['/receipts','公共凭证'],['/protocol','技术说明']];
const route=()=>location.hash.slice(1).split('?')[0]||'/';
function App(){
 const [path,setPath]=useState(route),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const s=useSession(),main=useRef(null),first=useRef(true);
 useEffect(()=>{const change=()=>setPath(route());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change)},[]);
 useEffect(()=>{document.title=`VeilReceipt · ${nav.find(n=>n[0]===(path==='/lab'?'/':path))?.[1]||'页面未找到'}`;if(first.current){first.current=false;return}window.scrollTo(0,0);main.current?.focus({preventScroll:true})},[path]);
 const Page=pages[path];
 return <div className={`site ${reduced?'reduce-motion':''} ${path==='/story'?'story-site':''}`}>
  <a className="skip-link" href="#main" onClick={e=>{e.preventDefault();main.current?.focus()}}>跳到主要内容</a>
  <header className="site-header"><a className="brand" href="#/" aria-label="VeilReceipt 首页"><span className="brand-mark"><FileCheck2 size={21}/></span><span>VeilReceipt</span></a>
   <nav aria-label="主导航">{nav.map(([url,title])=><a href={`#${url}`} key={url} aria-current={(path==='/lab'?'/':path)===url?'page':undefined}>{title}</a>)}</nav>
   <div className="header-state"><span className={`status-dot ${s.connection}`}/><span>{s.connection==='online'?'本地演示':s.connection==='offline'?'连接中断':'正在连接'}</span></div>
  </header>
  {s.connection==='offline'&&<div className="connection-banner" role="alert"><AlertTriangle size={18}/><span>本地服务未连接，保留最后确认的状态。</span><button onClick={s.refresh}><RefreshCw size={15}/>重新连接</button></div>}
  <main id="main" ref={main} tabIndex={-1}><Suspense fallback={<div className="page empty" role="status">正在打开页面…</div>}>{Page?<Page/>:<section className="page empty"><h1>暂时没有这个页面。</h1><a className="action" href="#/">返回现场演示<ArrowUpRight size={17}/></a></section>}</Suspense></main>
  <footer className="site-footer"><a href="#/" className="footer-brand">VeilReceipt <span>零知识验收凭证</span></a><span>真实 ZK · 合成数据 · 本地 EVM</span><button className="motion-toggle" aria-pressed={reduced} onClick={()=>setReduced(!reduced)}>{reduced?'动效已减少':'减少动效'}</button><a href="#/protocol">技术说明<ArrowUpRight size={14}/></a></footer>
  {s.notice&&<div className="toast" role="status"><span>{s.notice}</span><button onClick={()=>s.setNotice('')} aria-label="关闭提示"><X size={18}/></button></div>}
 </div>
}
createRoot(document.getElementById('root')).render(<Session><App/></Session>);
