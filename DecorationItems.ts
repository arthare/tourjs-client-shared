
export interface DecorationPosition {
  x:number;
  y:number;
}

export interface Decoration {
  draw(ctx:CanvasRenderingContext2D):void;
  tick(dt:number):void;
  isOnScreen(leftSide:number):boolean;
}

export class DecorationBase implements Decoration {
  protected position: DecorationPosition;
  protected dimensions: DecorationPosition;
  myImg:HTMLImageElement;
  constructor(position:DecorationPosition, dimensions:DecorationPosition, myImg:HTMLImageElement) {
    this.position = position;
    this.dimensions = dimensions;
    this.myImg = myImg;

  }
  tick(dt:number) {
    // nothing to do! we're a nonmoving decoration
  }
  isOnScreen(leftSide:number):boolean {
    let ret = (this.position.x + this.dimensions.x / 2) >= leftSide;
    return ret;
  }
  draw(ctx:CanvasRenderingContext2D):void {
    ctx.drawImage(this.myImg, this.position.x - this.dimensions.x/2, this.position.y - this.dimensions.y/2, this.dimensions.x, this.dimensions.y);
  }
}

export class MovingDecoration extends DecorationBase {
  protected speed: DecorationPosition;

  constructor(position:DecorationPosition, speed:DecorationPosition, dimensions:DecorationPosition, myImg:HTMLImageElement) {
    super(position, dimensions, myImg);
    this.speed = speed;
  }

  tick(dt:number) {
    this.position.x += this.speed.x * dt;
    this.position.y += this.speed.y * dt;
  }
}