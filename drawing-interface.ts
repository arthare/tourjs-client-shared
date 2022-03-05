import { Layer, randRange } from "./DecorationFactory";
import { DecorationState } from "./DecorationState";
import { RaceState } from "./RaceState";
import { RideMap } from "./RideMap";
import setupContextWithTheseCoords from "./setupContextWithTheseCoords";
import { DEFAULT_HANDICAP_POWER, User, UserInterface, UserTypeFlags } from "./User";
import { assert2 } from "./Utils";

export const local_color = 'white';
export const human_color = 'lightpink';
export const ai_color = 'black';

export interface DrawMinimapParameters {
  ctx:any;
  elevations:number[];
  w:number;
  h:number;
  minElevSpan:number;
  localPositionPct?:number;
  humanPositions?:number[];
  aiPositions?:number[];
}
export class DisplayUser {
  constructor(user:UserInterface) {
    this.distance = user.getDistance();
    this.image = null;
    this.loadingImage = false;
  }
  public distance:number = 0;
  public image:HTMLImageElement[]|null = null;
  public loadingImage:boolean = false;
  public crankPosition:number = 0;
  public heartPosition:number = 0;
  public slope = 0;
  public draftCosBase = 0;
}
export class PaintFrameState {
  public userPaint:Map<number,DisplayUser> = new Map();

  public defaultAiImage:HTMLImageElement[]|null = null;
  public loadingAi = false;

  public lastCanvasWidth = 0;
  public lastCanvasHeight = 0;
}
export interface RGB {
  r:number;
  g:number;
  b:number;
}


export interface DrawingInterface {
    
  drawMinimap(params:DrawMinimapParameters):void;
  paintCanvasFrame(canvas:HTMLCanvasElement, raceState:RaceState, timeMs:number, decorationState:DecorationState, dt:number, paintState:PaintFrameState):void;

}
