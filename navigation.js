(function(root){
'use strict';
const core = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.RoadlyCore;
const point=c=>({lat:c[1],lon:c[0]});
function instruction(step){
 const m=step?.maneuver||{}, mod={left:'links',right:'rechts','slight left':'leicht links','slight right':'leicht rechts','sharp left':'scharf links','sharp right':'scharf rechts',straight:'geradeaus',uturn:'wenden'}[m.modifier]||'';
 let s=m.type==='arrive'?'Ziel erreicht':m.type==='depart'?'Losfahren':m.modifier==='uturn'?'Wenden':m.type==='roundabout'||m.type==='rotary'?`Im Kreisverkehr ${m.exit?`die ${m.exit}. Ausfahrt nehmen`:'weiterfahren'}`:m.type==='turn'?`${mod} abbiegen`:m.type==='off ramp'?`Die Ausfahrt ${mod} nehmen`:m.type==='on ramp'?`Auf die Auffahrt ${mod} fahren`:m.type==='merge'?`${mod} einfädeln`:m.type==='fork'?`${mod} halten`:m.type==='end of road'?`Am Straßenende ${mod} abbiegen`:`${mod||'Geradeaus'} weiterfahren`;
 if(step?.name && m.type!=='arrive')s+=` auf ${step.name}`;
 return s.charAt(0).toUpperCase()+s.slice(1);
}
function project(p,a,b){
 const scale=Math.cos(p.lat*Math.PI/180), k=111195;
 const ax=(a.lon-p.lon)*k*scale, ay=(a.lat-p.lat)*k, bx=(b.lon-p.lon)*k*scale, by=(b.lat-p.lat)*k;
 const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;
 const t=l?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/l)):0;
 return {t,distance:Math.hypot(ax+t*dx,ay+t*dy)};
}
class Guide{
 constructor(route){
  this.segments=[];this.steps=[];this.total=0;this.progress=0;this.lastTime=null;this.offSince=null;this.arrivalCount=0;
  for(const step of (route.legs||[]).flatMap(l=>l.steps||[])){
   const coords=step.geometry?.coordinates||[]; const begin=this.total;
   for(let i=1;i<coords.length;i++){
    const a=point(coords[i-1]),b=point(coords[i]),length=core.distance(a,b);
    if(length>0.05){this.segments.push({a,b,length,start:this.total});this.total+=length;}
   }
   this.steps.push({step,start:begin,end:this.total,duration:step.duration||0});
  }
  if(!this.segments.length)throw Error('Die Route enthält keine befahrbare Strecke.');
  this.end=this.segments[this.segments.length-1].b;
 }
 update(fix,now=Date.now()){
  if(!fix||!Number.isFinite(fix.accuracy)||fix.accuracy>50||fix.accuracy<0||now-fix.time>10000||fix.time>now+2000){this.offSince=null;this.arrivalCount=0;return {state:'gps'};}
  if(this.lastTime!==null&&fix.time<=this.lastTime)return {state:'unchanged'};
  const dt=this.lastTime===null?0:Math.min(30,(fix.time-this.lastTime)/1000);
  const windowForward=this.lastTime===null?500:Math.max(160,Math.min(2500,(Math.max(fix.speed||0,15)*dt*2)+100));
  let best=null;
  for(const seg of this.segments){
   if(seg.start+seg.length<this.progress-100||seg.start>this.progress+windowForward)continue;
   const hit=project(fix,seg.a,seg.b),along=seg.start+hit.t*seg.length;
   if(along<this.progress-100||along>this.progress+windowForward)continue;
   const score=hit.distance+Math.abs(along-this.progress)*0.025;
   if(!best||score<best.score)best={...hit,along,score};
  }
  this.lastTime=fix.time;
  if(!best||best.distance>Math.max(60,fix.accuracy*2)){
   if(this.offSince===null)this.offSince=now;
   this.arrivalCount=0;
   return {state:'offroute',reroute:now-this.offSince>=8000};
  }
  this.offSince=null;
  // Allow small backward motion; do not jump to distant crossing segments.
  this.progress=Math.max(0,best.along);
  const remaining=Math.max(0,this.total-this.progress);
  const upcoming=this.steps.find(s=>s.start>this.progress+8)||this.steps[this.steps.length-1];
  const meters=Math.max(0,upcoming.start-this.progress);
  const seconds=this.steps.reduce((sum,s)=>sum+(s.end>this.progress?s.duration*(s.end-Math.max(s.start,this.progress))/Math.max(0.01,s.end-s.start):0),0);
  const near=remaining<35&&core.distance(fix,this.end)<35&&fix.accuracy<=25&&(fix.speed===null||fix.speed===undefined||fix.speed<3);
  this.arrivalCount=near?this.arrivalCount+1:0;
  return {state:this.arrivalCount>=2?'arrived':'onroute',remaining,seconds,meters,index:this.steps.indexOf(upcoming),step:upcoming.step};
 }
}
const api={Guide,instruction,project};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RoadlyNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
