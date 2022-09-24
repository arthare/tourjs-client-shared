import { DrawingInterface } from "./drawing-interface";
import { DrawingOnCanvas } from "./drawing2d";
import { Drawer3D } from "./drawing3d";

export function createDrawer(mode:"2d"|"3d"):DrawingInterface {
  switch(mode) {
    case '3d':
      return new Drawer3D();
    default:
    case '2d':
      return new DrawingOnCanvas();
  }
  
}