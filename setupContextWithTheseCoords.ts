export default function setupContextWithTheseCoords(
  canvas:HTMLCanvasElement, 
  ctx:CanvasRenderingContext2D, 
  left:number, 
  top:number, 
  right:number, 
  bottom:number,
  localUserSlope:number,
) {
  // this sets up a context so that drawing from (left, top) to (right, bottom) draws a diagonal line from visual top left to visual bottom right

  let temp = top;
  top = bottom;
  bottom = temp;

  const averageAltitude = (bottom + top) / 2;
  const spanHeight = bottom - top;
  const spanWidth = right - left;

  const clampedSlope = Math.max(-0.1, Math.min(0.1, localUserSlope));

  const amountToRotateRadians = -3*Math.atan(clampedSlope);
  const a = spanHeight * Math.sin(-Math.abs(amountToRotateRadians))
  const b = spanWidth * Math.cos(-Math.abs(amountToRotateRadians))
  const c = spanWidth * Math.sin(-Math.abs(amountToRotateRadians))
  const d = spanHeight * Math.cos(-Math.abs(amountToRotateRadians))
  let scaleFactor = Math.max(spanWidth / (a + b), spanHeight / (c + d));
  
  if(clampedSlope > 0) {
    // going downhill, just use scaleFactor=1
    scaleFactor=1;
  }

  ctx.resetTransform();
  ctx.translate(canvas.width/2, canvas.height /2);
  ctx.rotate(-amountToRotateRadians);
  ctx.scale(scaleFactor, scaleFactor);
  ctx.translate(-canvas.width/2, -canvas.height /2);

  ctx.scale(canvas.width, canvas.height); // makes our scale 0..1,0..1
  ctx.scale(1 / spanWidth, 1 / spanHeight); // makes our scale 0..span,0..1
  ctx.scale(1,-1); // flips shit



  ctx.translate(-left, -(averageAltitude) - spanHeight/2);

}