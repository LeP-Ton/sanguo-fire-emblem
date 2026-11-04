// 与具体引擎无关的二维画布参考实现；身体、武器、掌部遮挡分别取样。
export function selectUnitAsset(data,classId,faction,weapon){
 const base=data.assets.find(a=>a.category==='units'&&a.class===classId&&a.faction===faction);if(!base)return null;
 const variant=base.attackVariants?.[weapon?.family];return variant?data.assets.find(a=>a.id===variant)||base:base;
}
export function unitFrame(rig,state,timeMs,{loopOverride=false}={}){
 const animation=rig.animations.find(a=>a.id===state)||rig.animations[0];
 const index=Math.floor(Math.max(0,timeMs)/animation.durationMs);
 const frame=animation.loop||loopOverride?index%animation.frames:Math.min(animation.frames-1,index);
 return {animation,frame,bone:rig.frames[animation.row*4+frame]};
}
let canvasFactory=null,renderCache=new WeakMap(),cachePixels=0;
export function setCanvasFactory(factory){canvasFactory=factory;renderCache=new WeakMap();cachePixels=0;}
function surface(width,height){if(canvasFactory)return canvasFactory(width,height);if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}return null;}
function held(ctx,image,grip,anchor,angle,scale,frameRect,mirror=false){
 if(!image)return;const rect=frameRect||[0,0,image.width,image.height],w=rect[2],h=rect[3],radius=Math.ceil(Math.hypot(Math.max(grip.x,w-grip.x),Math.max(grip.y,h-grip.y))*scale)+3,size=radius*2,key=[grip.x,grip.y,angle.toFixed(2),scale.toFixed(4),rect.join(','),mirror].join('|');
 let cache=renderCache.get(image);if(!cache){cache=new Map();renderCache.set(image,cache);}let layer=cache.get(key);
 if(!layer){const canvas=surface(size,size);if(canvas){const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.translate(radius,radius);c.rotate(angle*Math.PI/180);c.scale(mirror?-scale:scale,scale);c.drawImage(image,...rect,-grip.x,-grip.y,w,h);layer={canvas,radius};cache.set(key,layer);cachePixels+=size*size;if(cachePixels>8e6){renderCache=new WeakMap();cachePixels=0;}}}
 if(layer){ctx.drawImage(layer.canvas,Math.round(anchor.x)-layer.radius,Math.round(anchor.y)-layer.radius);return;}
 ctx.save();ctx.translate(Math.round(anchor.x),Math.round(anchor.y));ctx.rotate(angle*Math.PI/180);ctx.scale(mirror?-scale:scale,scale);ctx.drawImage(image,...rect,-grip.x,-grip.y,w,h);ctx.restore();
}
function fitTwoHands(handle,main,back,scale,{fixed=false}={}){
 const dx=back.x-main.x,dy=back.y-main.y,distance=Math.hypot(dx,dy);if(distance<3)return null;let a=handle.primary,b=handle.secondary;
 if(!fixed){const length=distance/scale,axis={x:handle.end.x-handle.start.x,y:handle.end.y-handle.start.y},available=Math.hypot(axis.x,axis.y);if(length>available||length<3)return null;
  const unit={x:axis.x/available,y:axis.y/available},primaryDistance=Math.hypot(a.x-handle.start.x,a.y-handle.start.y),start=Math.max(0,Math.min(primaryDistance,available-length));a={x:handle.start.x+unit.x*start,y:handle.start.y+unit.y*start};b={x:a.x+unit.x*length,y:a.y+unit.y*length};
 }
 const sourceDistance=Math.hypot(b.x-a.x,b.y-a.y);if(sourceDistance<1)return null;
 return {anchor:main,back,grip:a,supportGrip:b,scale:fixed?distance/sourceDistance:scale,angle:(Math.atan2(dy,dx)-Math.atan2(b.y-a.y,b.x-a.x))*180/Math.PI,twoHanded:true};
}
export function unitEquipmentTransform(rig,bone,weapon,state,frame,{shield=false}={}){
 const scale=(weapon.defaultScale||.3)*(rig.frameSize/64)*(rig.mounted?.8:1),base={anchor:bone,grip:weapon.grip,scale,angle:(bone.rotation||0)+(weapon.angleOffset||0),twoHanded:false};
 if(weapon.family==='bow')base.angle=weapon.angleOffset||0;if(weapon.family==='shield')base.angle=state==='block'?-12:0;if(weapon.id==='feather_fan_held')base.angle=state==='cast'?-20:5;if(state==='defeat')base.angle=95;
 if(weapon.twoHanded&&!rig.mounted&&!shield&&bone.offhand?.detected){const fit=fitTwoHands(weapon.handleRig,bone,bone.offhand,scale);if(fit)return fit;}
 return base;
}
function fingers(ctx,image,data,hand,angle,{pinch=false,mirror=false}={}){
 if(!image||!data||!hand)return;const names=['light','tan','red','steel','gold','leather'],material=Math.max(0,names.indexOf(hand.material)),cell=data.cellSize||8;let pose=0,baseAngle=0;
 if(pinch)pose=3;else{const normalized=((angle%180)+180)%180;if(normalized>25&&normalized<65){pose=1;baseAngle=45;}else if(normalized>=65&&normalized<=115){pose=2;baseAngle=90;}}
 const anchors=[[.625,.5625],[.5625,.53125],[.75,.5],[.65625,.34375]],p=(data.anchors||anchors)[pose],size=hand.gripSize||(cell===8?7:30);
 held(ctx,image,{x:p[0]*cell,y:p[1]*cell},hand,pinch?0:angle-baseAngle,size/cell,[pose*cell,material*cell,cell,cell],mirror);
}
export function drawUnit(ctx,assets,{x,y,scale=2,state='idle',timeMs=0,facing='right',showBone=false,loopOverride=false}={}){
 const {body,hands,equipmentBody,freeHand,gripImage,gripData,rig,weapon,weaponImage,secondaryImage,weaponAnimationImage,shield,shieldImage}=assets,s=rig.frameSize,{animation,frame,bone}=unitFrame(rig,state,timeMs,{loopOverride}),equipped=weapon&&weaponImage,hasShield=!!(shield&&shieldImage),upgraded=equipped&&equipmentBody&&gripImage&&gripData&&rig.handRendering!=='native-occlusion';
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(x,y);ctx.scale(facing==='left'?-scale:scale,scale);ctx.translate(-s/2,-s*(rig.pivot?.[1]||1));
 const factionColor=assets.factionColor||({player:'#378BEE',ally:'#37BA70',enemy:'#E64D55'}[assets.faction||assets.item?.faction]);
 if(factionColor&&assets.showFactionMarker!==false){ctx.fillStyle=factionColor;ctx.fillRect(Math.round(s/2)-3,s-1,6,1);}
 ctx.drawImage(upgraded?equipmentBody:body,frame*s,animation.row*s,s,s,0,0,s,s);
 let transform;if(equipped){transform=unitEquipmentTransform(rig,bone,weapon,state,frame,{shield:hasShield});
  if(upgraded&&!transform.twoHanded&&!weapon.secondary&&!hasShield&&freeHand)ctx.drawImage(freeHand,frame*s,animation.row*s,s,s,0,0,s,s);
  if(state==='attack'&&weapon.attackAnimation&&weaponAnimationImage){const a=weapon.attackAnimation;held(ctx,weaponAnimationImage,a.grips[frame],bone,transform.angle,transform.scale,[frame*a.frameWidth,0,a.frameWidth,a.frameHeight]);}
  else held(ctx,weaponImage,transform.grip,transform.anchor,transform.angle,transform.scale);
  if(weapon.secondary&&secondaryImage)held(ctx,secondaryImage,weapon.secondary.grip,bone.offhand||bone,-12,transform.scale);
  if(upgraded){fingers(ctx,gripImage,gripData,bone,transform.angle);if(transform.twoHanded)fingers(ctx,gripImage,gripData,bone.offhand,transform.angle,{mirror:true});else if(weapon.secondary)fingers(ctx,gripImage,gripData,bone.offhand,-12,{mirror:true});else if(weapon.family==='bow')fingers(ctx,gripImage,gripData,bone.offhand,0,{pinch:true,mirror:true});}
 }
 // 原生掌部遮挡先覆盖武器柄，再画盾牌；持盾手位于盾牌背面。
 if(equipped&&!upgraded&&hands)ctx.drawImage(hands,frame*s,animation.row*s,s,s,0,0,s,s);
 // 盾牌有独立装备槽，使用副手锚点；不再把盾牌当作互斥的主武器。
 if(hasShield){const angle=state==='defeat'?70:state==='block'?-12:0,ratio=shield.id==='tower_shield_held'?.75:shield.id==='kite_shield_held'?.60:.45,shieldScale=shield.defaultScale*((rig.bodyHeight||s*.82)*ratio/(shield.displayLength||39));held(ctx,shieldImage,shield.grip,bone.offhand||bone,angle,shieldScale);if(upgraded)fingers(ctx,gripImage,gripData,bone.offhand,angle,{mirror:true});}
 if(showBone){ctx.fillStyle='#ffde66';ctx.fillRect(bone.x-1,bone.y-1,3,3);if(bone.offhand){ctx.fillStyle='#df73ff';ctx.fillRect(bone.offhand.x-1,bone.offhand.y-1,3,3);}}
 ctx.restore();return {frame,state:animation.id,bone,transform};
}
// 立绘使用完整PNG；同类换武器须编辑图像后替换整张纹理。
export function drawPortrait(ctx,{body,image},{x=0,y=0,scale=1}={}){
 const picture=image||body;if(!picture)return;ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(x,y);ctx.scale(scale,scale);ctx.drawImage(picture,0,0);ctx.restore();
}
export function drawVfx(ctx,image,effect,{x=0,y=0,timeMs=0,scale=1,loop=false}={}){
 const frameIndex=Math.floor(timeMs/effect.frameDurationMs),frame=loop?frameIndex%effect.frames:Math.min(effect.frames-1,frameIndex);
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(image,frame*effect.frameWidth,0,effect.frameWidth,effect.frameHeight,x-effect.frameWidth*scale*.5,y-effect.frameHeight*scale*.75,effect.frameWidth*scale,effect.frameHeight*scale);ctx.restore();
}
export function drawBar(ctx,frame,fill,{x=0,y=0,ratio=1}={}){
 const value=Math.max(0,Math.min(1,ratio));ctx.imageSmoothingEnabled=false;ctx.drawImage(frame,x,y);if(value)ctx.drawImage(fill,0,0,Math.round(fill.width*value),fill.height,x+4,y+4,Math.round(fill.width*value),fill.height);
}
export function typewriter(element,text,{charactersPerSecond=22}={}){
 const letters=Array.from(text);let count=0,started=0,cancelled=false,request=0;element.textContent='';
 function tick(time){if(cancelled)return;if(!started)started=time;count=Math.min(letters.length,Math.floor((time-started)/1000*charactersPerSecond));element.textContent=letters.slice(0,count).join('');if(count<letters.length)request=requestAnimationFrame(tick);}
 request=requestAnimationFrame(tick);
 return {finish(){cancelled=true;cancelAnimationFrame(request);element.textContent=text;},cancel(){cancelled=true;cancelAnimationFrame(request);},get done(){return cancelled||count===letters.length;}};
}

// 火势与水浪以独立特效实例沿格子依次激活；状态数据由关卡提供。
export function drawEnvironment(ctx,image,effect,cells,timeMs,{intervalMs=180,tileSize=64}={}){
 cells.forEach(([column,row],index)=>{const local=timeMs-index*intervalMs;if(local>=0)drawVfx(ctx,image,effect,{x:(column+.5)*tileSize,y:(row+.9)*tileSize,timeMs:local,loop:true});});
}
