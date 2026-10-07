import React from 'react';
import {ArrowUpRight,ArrowRight,Check,Minus,ShieldCheck} from '../icons';
export function Kicker({children}){return <div className="kicker">{children}</div>}
export function Action({href,children,secondary=false,...props}){const Tag=href?'a':'button';return <Tag href={href} className={`action ${secondary?'secondary':''}`} {...props}>{children}<ArrowUpRight size={18} aria-hidden="true"/></Tag>}
export function Aperture({priority=false,className=''}){return <picture className={`aperture ${className}`}><source media="(max-width: 700px)" srcSet="/images/veil-aperture-800.webp"/><img src="/images/veil-aperture.webp" width="1440" height="1000" alt="黑色孔径中的朱砂屏障封存私密包裹，一张公开凭证从另一侧伸出" loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'}/></picture>}
export function RuleList(){return <dl className="rule-list"><div><dt>数据年龄</dt><dd>≤ 120 秒</dd></div><div><dt>样本数量</dt><dd>≥ 100 条</dd></div><div><dt>置信度字段</dt><dd>≥ 90%</dd></div></dl>}
export function VerdictRows({view}){return <dl className="verdict-rows">{[['证明',view.proof],['验收',view.acceptance],['结算',view.money]].map(([a,b],i)=><div key={a}><dt><span>0{i+1}</span>{a}</dt><dd>{i===0&&b==='有效'?<ShieldCheck size={17}/>:b==='待确认'?<Minus size={17}/>:<ArrowRight size={17}/>} {b}</dd></div>)}</dl>}
export function CheckItem({check,label}){return <div className={`check-item ${check.ok?'pass':'fail'}`}><span>{check.ok?<Check size={17}/>:<Minus size={17}/>} {label}</span><strong>{check.ok?'通过':'拒绝'}</strong></div>}
