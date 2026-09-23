(function(){
  if(window.SLGridMap)return;

  const TILE=256, GRID=5;
  const FAILED_TILE_TTL=5*60*1000, failedTiles=new Map();
  function tileFailedRecently(url){const t=failedTiles.get(url);if(!t)return false;if(Date.now()-t>FAILED_TILE_TTL){failedTiles.delete(url);return false}return true}
  function rememberFailedTile(url){failedTiles.set(url,Date.now());if(failedTiles.size>400){const first=failedTiles.keys().next().value;failedTiles.delete(first)}}
  function injectStyles(){
    if(document.getElementById('slg-map-styles'))return;
    const s=document.createElement('style');s.id='slg-map-styles';
    s.textContent=`
.slg-wrap{background:#0d0a14;border:1px solid #49385e;border-radius:16px;overflow:hidden}
.slg-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid #3a2f50;background:#151020}
.slg-title{font-weight:800}.slg-sub{font-size:11px;color:#bcb0ca;margin-top:2px}
.slg-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.slg-controls button{border:1px solid #4b3b61;border-radius:10px;background:#171121;color:#fff9ff;padding:7px 9px;cursor:pointer}
.slg-level{font-size:11px;color:#bcb0ca;min-width:95px;text-align:center}
.slg-viewport{height:700px;overflow:hidden;position:relative;background:#09070d;touch-action:none;user-select:none;cursor:grab}.slg-viewport.dragging{cursor:grabbing}
.slg-stage{position:absolute;left:50%;top:50%;width:${TILE*GRID}px;height:${TILE*GRID}px;transform:translate(-50%,-50%);transform-origin:center center;cursor:grab;background:#09070d}
.slg-stage.dragging{cursor:grabbing}
.slg-tilecell{position:absolute;width:${TILE}px;height:${TILE}px;overflow:hidden;background:linear-gradient(135deg,#173f54,#204f66)}.slg-tile{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:transparent;pointer-events:none;-webkit-user-drag:none;user-select:none}.slg-tilecell.missing:after{content:'map tile unavailable';position:absolute;inset:0;display:grid;place-items:center;color:#ffffff55;font-size:10px;letter-spacing:.04em}
.slg-marker{position:absolute;transform:translate(-50%,-100%);z-index:5;display:flex;pointer-events:none;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50% 50% 50% 0;background:#ff5fa8;border:3px solid #fff;color:#1b0f1b;font-size:11px;font-weight:900;box-shadow:0 2px 12px #000;rotate:-45deg}
.slg-marker>span{rotate:45deg}
.slg-marker.secondary{background:#69d8ff}.slg-marker.tertiary{background:#ffd166}.slg-marker.focused{box-shadow:0 0 0 5px #ff78c855,0 2px 16px #000;z-index:8}
.slg-empty{padding:28px;text-align:center;color:#bcb0ca}
@media(max-width:760px){.slg-viewport{height:560px}.slg-level{min-width:auto}}
`;
    document.head.appendChild(s);
  }

  function lookupRegion(region){
    return new Promise(resolve=>{
      const varName='slg_'+Math.random().toString(36).slice(2);
      window[varName]=null;
      const script=document.createElement('script');
      script.src='https://cap.secondlife.com/cap/0/d661249b-2b5a-4436-966a-3d3b8d7a574f?var='+encodeURIComponent(varName)+'&sim_name='+encodeURIComponent(region);
      let done=false;
      const finish=(v)=>{if(done)return;done=true;try{delete window[varName]}catch(e){};script.remove();resolve(v&& !v.error?{x:Number(v.x),y:Number(v.y)}:null)};
      script.onload=()=>finish(window[varName]);
      script.onerror=()=>finish(null);
      document.head.appendChild(script);
      setTimeout(()=>finish(null),7000);
    });
  }

  class SLGridMap{
    constructor(el,opts={}){
      injectStyles();
      this.el=typeof el==='string'?document.querySelector(el):el;
      this.opts=opts;
      this.level=Number(opts.level||4);
      this.center={x:1024,y:1024};
      this.markers=[];
      this.panX=0;this.panY=0;this.scale=1;this.drag=null;this.pointers=new Map();this.pinch=null;this.focusIndex=-1;this.wheelTimer=null;this.wheelDir=0;this.tileStats={loaded:0,missing:0,total:0};
      this._build();
    }
    _build(){
      this.el.innerHTML=`<div class="slg-wrap">
        <div class="slg-head"><div><div class="slg-title">${this.opts.title||'Second Life Map'}</div><div class="slg-sub" data-slg-sub>Drag to pan · wheel or pinch to zoom · World shows the broad grid</div></div>
        <div class="slg-controls"><button type="button" data-slg-in>＋</button><button type="button" data-slg-out>−</button><button type="button" data-slg-fit>Fit</button><button type="button" data-slg-world>World</button><span class="slg-level" data-slg-level></span></div></div>
        <div class="slg-viewport" data-slg-vp><div class="slg-stage" data-slg-stage></div></div>
      </div>`;
      this.stage=this.el.querySelector('[data-slg-stage]');
      this.vp=this.el.querySelector('[data-slg-vp]');
      this.levelLabel=this.el.querySelector('[data-slg-level]');
      this.el.querySelector('[data-slg-in]').onclick=()=>this.setLevel(Math.max(1,this.level-1));
      this.el.querySelector('[data-slg-out]').onclick=()=>this.setLevel(Math.min(8,this.level+1));
      this.el.querySelector('[data-slg-fit]').onclick=()=>this.fitMarkers();
      this.el.querySelector('[data-slg-world]').onclick=()=>this.setLevel(8,true);
      this.vp.addEventListener('wheel',e=>{
        e.preventDefault();
        this.wheelDir=e.deltaY>0?1:-1;
        clearTimeout(this.wheelTimer);
        this.wheelTimer=setTimeout(()=>{
          this.setLevel(Math.max(1,Math.min(8,this.level+this.wheelDir)));
          this.wheelTimer=null;
        },140);
      },{passive:false});
      this.vp.addEventListener('dragstart',e=>e.preventDefault());
      const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
      const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const beginSingleDrag=p=>{
        this.drag={id:p.id,x:p.x-this.panX,y:p.y-this.panY};
        this.vp.classList.add('dragging');
      };
      const beginPinch=()=>{
        const pts=[...this.pointers.values()];
        if(pts.length<2)return;
        const a=pts[0],b=pts[1],mid=midpoint(a,b);
        this.drag=null;
        this.pinch={
          startDistance:Math.max(1,distance(a,b)),
          lastRatio:1,
          startPanX:this.panX,startPanY:this.panY,
          startMidX:mid.x,startMidY:mid.y
        };
        this.vp.classList.add('dragging');
      };
      const commitPinch=()=>{
        if(!this.pinch)return;
        const ratio=this.pinch.lastRatio||1,keepPanX=this.panX,keepPanY=this.panY;
        this.scale=1;
        this.pinch=null;
        if(ratio>1.16){
          const steps=Math.max(1,Math.min(3,Math.round(Math.log(ratio)/Math.log(1.55))));
          this.setLevel(Math.max(1,this.level-steps));
          this.panX=keepPanX;this.panY=keepPanY;this._applyTransform();
        }else if(ratio<0.86){
          const steps=Math.max(1,Math.min(3,Math.round(Math.log(1/ratio)/Math.log(1.55))));
          this.setLevel(Math.min(8,this.level+steps));
          this.panX=keepPanX;this.panY=keepPanY;this._applyTransform();
        }else{
          this._applyTransform();
        }
      };
      this.vp.addEventListener('pointerdown',e=>{
        if(e.pointerType!=='touch'&&e.button!==undefined&&e.button!==0)return;
        e.preventDefault();
        const p={id:e.pointerId,x:e.clientX,y:e.clientY,type:e.pointerType};
        this.pointers.set(e.pointerId,p);
        try{this.vp.setPointerCapture(e.pointerId)}catch(err){}
        if(this.pointers.size>=2)beginPinch();
        else beginSingleDrag(p);
      });
      this.vp.addEventListener('pointermove',e=>{
        if(!this.pointers.has(e.pointerId))return;
        e.preventDefault();
        const p={id:e.pointerId,x:e.clientX,y:e.clientY,type:e.pointerType};
        this.pointers.set(e.pointerId,p);
        if(this.pointers.size>=2){
          if(!this.pinch)beginPinch();
          const pts=[...this.pointers.values()],a=pts[0],b=pts[1],mid=midpoint(a,b);
          const ratio=Math.max(.55,Math.min(1.8,distance(a,b)/this.pinch.startDistance));
          this.pinch.lastRatio=ratio;
          this.scale=ratio;
          this.panX=this.pinch.startPanX+(mid.x-this.pinch.startMidX);
          this.panY=this.pinch.startPanY+(mid.y-this.pinch.startMidY);
          this._applyTransform();
          return;
        }
        if(this.drag&&this.drag.id===e.pointerId){
          this.panX=e.clientX-this.drag.x;
          this.panY=e.clientY-this.drag.y;
          this._applyTransform();
        }
      });
      const endPointer=e=>{
        const had=this.pointers.has(e.pointerId);
        if(had)this.pointers.delete(e.pointerId);
        try{if(this.vp.hasPointerCapture(e.pointerId))this.vp.releasePointerCapture(e.pointerId)}catch(err){}
        if(this.pinch&&this.pointers.size<2)commitPinch();
        if(this.pointers.size===1){
          const p=[...this.pointers.values()][0];
          beginSingleDrag(p);
        }else if(!this.pointers.size){
          this.drag=null;
          this.vp.classList.remove('dragging');
        }
      };
      this.vp.addEventListener('pointerup',endPointer);
      this.vp.addEventListener('pointercancel',endPointer);
      this.vp.addEventListener('lostpointercapture',e=>{
        if(this.pointers.has(e.pointerId))endPointer(e);
      });
    }
    async setLocations(locations,opts={}){
      const out=[];
      for(let i=0;i<locations.length;i++){
        const l=locations[i];
        const pos=(Number.isFinite(Number(l.gridX))&&Number.isFinite(Number(l.gridY)))?{x:Number(l.gridX),y:Number(l.gridY)}:await lookupRegion(l.region);
        if(pos)out.push({...l,gridX:pos.x,gridY:pos.y});
      }
      this.markers=out;
      if(!out.length){
        this.stage.innerHTML='<div class="slg-empty">Map coordinates unavailable for these locations.</div>';
        return;
      }
      this.center=this._markerCenter(out);
      if(opts.fit!==false)this.level=this._fitLevel(out);
      else if(opts.level)this.level=opts.level;
      this.panX=0;this.panY=0;this.scale=1;
      this.render();
    }
    _markerCenter(ms){
      if(!ms.length)return {x:1024,y:1024};
      const xs=ms.map(m=>m.gridX+Number(m.x||128)/256),ys=ms.map(m=>m.gridY+Number(m.y||128)/256);
      return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
    }
    _fitLevel(ms){
      if(ms.length<=1)return 3;
      const xs=ms.map(m=>m.gridX+Number(m.x||128)/256),ys=ms.map(m=>m.gridY+Number(m.y||128)/256);
      const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
      const width=Math.max(320,this.vp?.clientWidth||0),height=Math.max(360,this.vp?.clientHeight||0);
      const padX=Math.min(150,Math.max(84,width*.12)),padY=Math.min(150,Math.max(100,height*.14));
      for(let z=1;z<=8;z++){
        const regionPixels=TILE/Math.pow(2,z-1);
        if(spanX*regionPixels+padX*2<=width && spanY*regionPixels+padY*2<=height)return z;
      }
      return 8;
    }
    async focusLocation(location,opts={}){
      let idx=this.markers.findIndex(m=>
        String(m.region||'').toLowerCase()===String(location.region||'').toLowerCase() &&
        Number(m.x||0)===Number(location.x||0) &&
        Number(m.y||0)===Number(location.y||0)
      );
      let pos=idx>=0?{x:this.markers[idx].gridX,y:this.markers[idx].gridY}:await lookupRegion(location.region);
      if(!pos)return false;
      if(idx<0){
        this.markers.push({...location,gridX:Number(pos.x),gridY:Number(pos.y)});
        idx=this.markers.length-1;
      }
      this.focusIndex=idx;
      this.center={x:Number(pos.x),y:Number(pos.y)};
      this.level=Math.max(1,Math.min(8,Number(opts.level||1)));
      this.panX=0;this.panY=0;this.scale=1;
      this.render();
      return true;
    }
    clearFocus(){
      this.focusIndex=-1;
      this.render();
    }
    fitMarkers(){
      if(!this.markers.length)return;
      this.center=this._markerCenter(this.markers);
      this.level=this._fitLevel(this.markers);this.panX=0;this.panY=0;this.scale=1;this.focusIndex=-1;this.render();
    }
    setLevel(z,world=false){
      const next=Math.max(1,Math.min(8,Number(z)||1));
      if(next===this.level&&!world)return;
      this.level=next;
      this.panX=0;this.panY=0;this.scale=1;
      if(world&&this.markers.length){
        this.center=this._markerCenter(this.markers);
      }
      this.render();
    }
    _applyTransform(){
      this.stage.style.left='calc(50% + '+this.panX+'px)';
      this.stage.style.top='calc(50% + '+this.panY+'px)';
      this.stage.style.transform='translate(-50%,-50%) scale('+this.scale+')';
    }
    _levelText(){
      const z=this.level,span=Math.pow(2,z-1);
      let text=(z===1?'Region detail':z===8?'World view':'Zoom '+z)+' · '+span+' region'+(span===1?'':'s')+'/tile';
      if(this.tileStats.missing)text+=' · '+this.tileStats.missing+' tile'+(this.tileStats.missing===1?'':'s')+' unavailable';
      return text;
    }
    _updateLevelText(){this.levelLabel.textContent=this._levelText()}
    _wireTiles(){
      const cells=Array.from(this.stage.querySelectorAll('.slg-tilecell'));
      this.tileStats={loaded:0,missing:0,total:cells.length};
      const update=()=>this._updateLevelText();
      cells.forEach(cell=>{
        const img=cell.querySelector('.slg-tile'),url=img&&img.dataset.src;
        if(!img||!url)return;
        if(tileFailedRecently(url)){
          cell.classList.add('missing');
          img.remove();
          this.tileStats.missing++;
          update();
          return;
        }
        let retried=false;
        img.onload=()=>{
          failedTiles.delete(url);
          this.tileStats.loaded++;
          update();
        };
        img.onerror=()=>{
          if(!retried){
            retried=true;
            setTimeout(()=>{if(img.isConnected)img.src=url+(url.includes('?')?'&':'?')+'retry='+Date.now()},650);
            return;
          }
          rememberFailedTile(url);
          cell.classList.add('missing');
          img.remove();
          this.tileStats.missing++;
          update();
        };
        img.src=url;
      });
      update();
    }
    render(){
      const z=this.level,span=Math.pow(2,z-1),half=Math.floor(GRID/2);
      const cx=Math.floor(this.center.x/span)*span,cy=Math.floor(this.center.y/span)*span;
      const baseX=cx-half*span,topY=cy+(half+1)*span;
      let h='';
      for(let row=0;row<GRID;row++){
        const ty=cy+(half-row)*span;
        for(let col=0;col<GRID;col++){
          const tx=baseX+col*span;
          const tileUrl='https://map.secondlife.com/map-'+z+'-'+tx+'-'+ty+'-objects.jpg';
          h+='<div class="slg-tilecell" style="left:'+(col*TILE)+'px;top:'+(row*TILE)+'px"><img class="slg-tile" draggable="false" decoding="async" data-src="'+tileUrl+'" alt=""></div>';
        }
      }
      this.markers.forEach((m,i)=>{
        const wx=m.gridX+Number(m.x||128)/256,wy=m.gridY+Number(m.y||128)/256;
        const px=((wx-baseX)/span)*TILE,py=((topY-wy)/span)*TILE;
        if(px>=-20&&px<=TILE*GRID+20&&py>=-20&&py<=TILE*GRID+20){
          const cls=(i===1?' secondary':i===2?' tertiary':'')+(i===this.focusIndex?' focused':'');
          h+='<div class="slg-marker'+cls+'" title="'+String(m.name||m.region).replace(/"/g,'&quot;')+'" style="left:'+px+'px;top:'+py+'px"><span>'+(m.label||String(i+1))+'</span></div>';
        }
      });
      this.stage.innerHTML=h;
      this._wireTiles();
      this._applyTransform();
    }
  }

  window.SLGridMap=SLGridMap;
  window.SLGridLookupRegion=lookupRegion;
})();