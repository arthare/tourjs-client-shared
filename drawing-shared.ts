import { DecorationState } from "./DecorationState";
import { DrawingInterface, DisplayUser, RGB, PaintFrameState, DrawMinimapParameters, ai_color, human_color, local_color } from "./drawing-interface";
import { RaceState } from "./RaceState";
import { assert2 } from "./Utils";

export abstract class DrawingBase implements DrawingInterface {
  getColorForDraftSegment(displayUser:DisplayUser, draftColor:RGB, baseLineWidth:number, pctAlongLine:number, userSpeed:number, minAlpha:number){
    const cosRaw = Math.cos(pctAlongLine * 6.28 + (displayUser as DisplayUser).draftCosBase);
    
    const cosForWidth = cosRaw + 1;
    const cosForColor = 0.5*(1.0 + 0.5*cosRaw) + 0.5;
    return {
      strokeStyle: `rgba(${cosForColor*draftColor.r},${cosForColor*draftColor.g},${cosForColor*draftColor.b},1.0)`,
      lineWidth: baseLineWidth*cosForWidth,
    }
  }
  doPaintFrameStateUpdates(rootResourceUrl:string, tmNow:number, dtSeconds:number, raceState:RaceState, paintState:PaintFrameState) {
    const users = raceState.getUserProvider().getUsers(tmNow);

    if(!paintState.defaultAiImage && !paintState.loadingAi) {
      paintState.loadingAi = true;


      const aiSrc = ['assets/cyclist-spritesheet.webp'];
      const whichOne = aiSrc[Math.floor(Math.random()*aiSrc.length) % aiSrc.length];
      
      const imgAi = document.createElement('img');
      imgAi.onload = () => {

        // now we have to divvy this up into 8 actual images
        let subImages = [];
        for(var x = 0;x < 8; x++) {
          const myCanvas = document.createElement('canvas');
          const myImage = document.createElement('img');
          myCanvas.width = 111;
          myCanvas.height = 117;
          const ctx = myCanvas.getContext('2d');
          if(ctx) {
            ctx.drawImage(imgAi, 0, x*117, 111, 117, 0, 0, 111, 117);
            myImage.src = myCanvas.toDataURL('png');
            subImages.push(myImage);
          }
          

        }

        paintState.defaultAiImage = subImages;
        paintState.loadingAi = false;
      }
      imgAi.src = rootResourceUrl + whichOne;
    }

    let needToLoad = users.find((user) => user.getImage() && !paintState.userPaint.get(user.getId())?.image);
    let anyUsersNeedLoading = false;
    let anyUsersLoading = false;
    users.forEach((user) => {
      const paintUser = paintState.userPaint.get(user.getId()) || new DisplayUser(user);

      const rpm = Math.random()*20 + 80;
      const rps = rpm/60;
      paintUser.crankPosition += rps*dtSeconds;
      while(paintUser.crankPosition >= 1.0) {
        paintUser.crankPosition -= 1.0;
      }

      const bpm = user.getLastHrm(tmNow);
      const bps = bpm / 60;
      paintUser.heartPosition += bps*dtSeconds;
      while(paintUser.heartPosition >= 1.0) {
        paintUser.heartPosition -= 1.0;
      }
      

      if(!paintUser.image && user.getImage()) {
        anyUsersNeedLoading = true;
      }
      if(paintUser.loadingImage && user.getImage()) {
        anyUsersLoading = true;
      }

      paintState.userPaint.set(user.getId(), paintUser);
    })

    if(!anyUsersLoading && anyUsersNeedLoading) {
      // some users need to load!
      if(needToLoad) {
        const imageBase64 = needToLoad.getImage();
        const paintUser = paintState.userPaint.get(needToLoad.getId());
        
        if(paintUser && imageBase64) {
          paintUser.loadingImage = true;
          const img = document.createElement('img');
          img.onload = () => {
            paintUser.loadingImage = false;
            paintUser.image = [img];
          }
          img.src = imageBase64;
        }
      }
    }
  }
  
  drawMinimap(params:DrawMinimapParameters) {
    
    const {
      ctx,
      elevations,
      w,
      h,
      minElevSpan,
      localPositionPct,
      humanPositions,
      aiPositions,
    } = params;

    if(!ctx) {
      return;
    }
    // do the sky
    const skyGradient = ctx.createLinearGradient(0,0,w,h);
    skyGradient.addColorStop(0, "#35D6ed");
    skyGradient.addColorStop(1, "#c9f6ff");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0,0,w,h);

    // grass gradient
    const grassGradient = ctx.createLinearGradient(0,0,w,h);
    grassGradient.addColorStop(0, "#709b40");
    grassGradient.addColorStop(1, "#285028");

    
    let maxElev:number = elevations[0];
    let minElev:number = elevations[0];
    elevations.forEach((elev) => {
      if(!maxElev || elev > maxElev) {
        maxElev = elev;
      }
      if(!minElev || elev < minElev) {
        minElev = elev;
      }
    })

    let elevSpan = maxElev - minElev;
    if(elevSpan < minElevSpan) {
      const missedBy = minElevSpan - elevSpan;
      maxElev += missedBy / 2;
      minElev -= missedBy / 2;
      elevSpan = minElevSpan;
    }
    
    ctx.scale(1,-1);
    ctx.translate(0,-h);
    ctx.beginPath();
    ctx.fillStyle = grassGradient;
    const elevs = [...elevations];
    elevs.forEach((elev, index) => {
      const pctX = index / (elevations.length - 1);
      const pctY = (elev - minElev) / elevSpan;
      const px = pctX * w;
      const py = pctY * h;

      if(index === 0) {
        ctx.lineTo(0, py);
      } else {
        ctx.lineTo(px, py);
      }
    })
    ctx.lineTo(w, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, (elevations[0] - minElev) / elevSpan);
    ctx.closePath();
    ctx.fill();

    if(aiPositions) {
      ctx.strokeStyle = ai_color;
      ctx.beginPath();
      aiPositions.forEach((positionPct) => {
        assert2(positionPct >= -0.001 && positionPct <= 1.01);
        ctx.moveTo(positionPct*w, 0);
        ctx.lineTo(positionPct*w, h);
      })
      ctx.stroke();
    }
    if(humanPositions) {
      ctx.strokeStyle = human_color;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      humanPositions.forEach((positionPct) => {
        assert2(positionPct >= 0 && positionPct <= 1.01);
        ctx.moveTo(positionPct*w, 0);
        ctx.lineTo(positionPct*w, h);
      })
      ctx.stroke();
    }
    if(localPositionPct) {
      assert2(localPositionPct >= 0 && localPositionPct <= 1.01);
      ctx.strokeStyle = local_color;
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.moveTo(localPositionPct*w, 0);
      ctx.lineTo(localPositionPct*w, h);
      ctx.stroke();
    }
  }
  abstract paintCanvasFrame(canvas:HTMLCanvasElement, raceState:RaceState, timeMs:number, decorationState:DecorationState, dt:number, paintState:PaintFrameState):void;
}