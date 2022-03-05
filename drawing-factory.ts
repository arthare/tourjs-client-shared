import { DrawingOnCanvas } from "./drawing2d";
import { Drawer3D } from "./drawing3d";

export function createDrawer(mode:string) {
  console.log("creating drawing in ", mode);
  switch(mode) {
    case '3d':
      return new Drawer3D();
    default:
    case '2d':
      return new DrawingOnCanvas();
  }
  
}