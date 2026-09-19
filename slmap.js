(function(){
  if(window.SLGridMap)return;

  const TILE=256, GRID=5;
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
.slg-viewport{height:700px;overflow:hidden;position:relative;background:#09070d;touch-action:none}
.slg-stage{position:absolute;left:50%;top:50%;width:${TILE*GRID}px;height:${TILE*GRID}px;transform-origin:center center;cursor:grab;background:#09070d}
.slg-stage.dragging{cursor:grabbing}
.slg-tile{position:absolute;width:${TILE}px;height:${TILE}px;object-fit:cover;background:#14101a}
.slg-marker{position:absolute;transform:translate(-50%,-100%);z-index:5;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50% 50% 50% 0;background:#ff5fa8;border:3px solid #fff;color:#1b0f1b;font-size:11px;font-weight:900;box-shadow:0 2px 12px #000;rotate:-45deg}
.slg-marker>span{rotate:45deg}
.slg-marker.secondary{background:#69d8ff}.slg-marker.tertiary{background:#ffd166}
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
      this.panX=0;this.panY=0;this.scale=1;this.drag=null;
      this._build();
    }
    _build(){
      this.el.innerHTML=`<div class="slg-wrap">
        <div class="slg-head"><div><div class="slg-title">${this.opts.title||'Second Life Map'}</div><div class="slg-sub" data-slg-sub>Drag to pan · mouse wheel to zoom · World shows the broad grid</div></div>
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
      this.vp.addEventListener('wheel',e=>{e.preventDefault();this.setLevel(Math.max(1,Math.min(8,this.level+(e.deltaY>0?1:-1))))},{passive:false});
      this.stage.addEventListener('pointerdown',e=>{this.drag={x:e.clientX-this.panX,y:e.clientY-this.panY};this.stage.classList.add('dragging');try{this.stage.setPointerCapture(e.pointerId)}catch(err){}});
      this.stage.addEventListener('pointermove',e=>{if(!this.drag)return;this.panX=e.clientX-this.drag.x;this.panY=e.clientY-this.drag.y;this._applyTransform()});
      this.stage.addEventListener('pointerup',()=>{this.drag=null;this.stage.classList.remove('dragging')});
      this.stage.addEventListener('pointercancel',()=>{this.drag=null;this.stage.classList.remove('dragging')});
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
      const avgX=out.reduce((n,m)=>n+m.gridX,0)/out.length;
      const avgY=out.reduce((n,m)=>n+m.gridY,0)/out.length;
      this.center={x:avgX,y:avgY};
      if(opts.fit!==false)this.level=this._fitLevel(out);
      else if(opts.level)this.level=opts.level;
      this.panX=0;this.panY=0;this.scale=1;
      this.render();
    }
    _fitLevel(ms){
      if(ms.length<=1)return 3;
      const xs=ms.map(m=>m.gridX+Number(m.x||128)/256),ys=ms.map(m=>m.gridY+Number(m.y||128)/256);
      const spanNeeded=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
      for(let z=1;z<=8;z++){
        const tileSpan=Math.pow(2,z-1);
        if(spanNeeded<=tileSpan*3)return z;
      }
      return 8;
    }
    fitMarkers(){
      if(!this.markers.length)return;
      this.center={
        x:this.markers.reduce((n,m)=>n+m.gridX,0)/this.markers.length,
        y:this.markers.reduce((n,m)=>n+m.gridY,0)/this.markers.length
      };
      this.level=this._fitLevel(this.markers);this.panX=0;this.panY=0;this.scale=1;this.render();
    }
    setLevel(z,world=false){
      this.level=Math.max(1,Math.min(8,Number(z)||1));
      this.panX=0;this.panY=0;this.scale=1;
      if(world&&this.markers.length){
        this.center={
          x:this.markers.reduce((n,m)=>n+m.gridX,0)/this.markers.length,
          y:this.markers.reduce((n,m)=>n+m.gridY,0)/this.markers.length
        };
      }
      this.render();
    }
    _applyTransform(){
      this.stage.style.transform='translate(calc(-50% + '+this.panX+'px),calc(-50% + '+this.panY+'px)) scale('+this.scale+')';
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
          h+='<img class="slg-tile" loading="lazy" src="https://map.secondlife.com/map-'+z+'-'+tx+'-'+ty+'-objects.jpg" style="left:'+(col*TILE)+'px;top:'+(row*TILE)+'px" alt="">';
        }
      }
      this.markers.forEach((m,i)=>{
        const wx=m.gridX+Number(m.x||128)/256,wy=m.gridY+Number(m.y||128)/256;
        const px=((wx-baseX)/span)*TILE,py=((topY-wy)/span)*TILE;
        if(px>=-20&&px<=TILE*GRID+20&&py>=-20&&py<=TILE*GRID+20){
          const cls=i===1?' secondary':i===2?' tertiary':'';
          h+='<div class="slg-marker'+cls+'" title="'+String(m.name||m.region).replace(/"/g,'&quot;')+'" style="left:'+px+'px;top:'+py+'px"><span>'+(m.label||String(i+1))+'</span></div>';
        }
      });
      this.stage.innerHTML=h;
      this.levelLabel.textContent=(z===1?'Region detail':z===8?'World view':'Zoom '+z)+' · '+span+' region'+(span===1?'':'s')+'/tile';
      this._applyTransform();
    }
  }

  window.SLGridMap=SLGridMap;
  window.SLGridLookupRegion=lookupRegion;
})();