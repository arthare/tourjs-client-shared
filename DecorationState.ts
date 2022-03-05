import { RideMapElevationOnly } from "./RideMap";
import { Decoration } from "./DecorationItems";
import { DecorationFactory, Layer } from "./DecorationFactory";

export class DecorationState {
  private _decorations:Map<Layer,Decoration[]>;
  private _factory:DecorationFactory;
  private _map:RideMapElevationOnly;
  private _lastRight:number = 0;

  private _images:{[key:string]:HTMLImageElement} = {};

  constructor(map:RideMapElevationOnly, factory:DecorationFactory) {
    this._decorations = new Map<Layer, Decoration[]>();
    
    Object.keys(Layer).forEach((layer) => {
      this._decorations.set(<Layer><unknown>layer, []);
    })
    this._factory = factory;
    this._map = map;

    const imageNames:{[key:string]:string} = {
      "heart": "/assets/heart.png",
    }
    for(var key in imageNames) {
      const el = document.createElement('img');
      el.onload = () => {
        this._images[key] = el;
      }
      el.onerror = () => {
        console.error("Failed to load ", imageNames[key]);
        debugger;
      }
      el.src = imageNames[key];
    }
  }

  public getImage(key:string):HTMLImageElement|null {
    if(this._images[key]) {
      return this._images[key];
    }
    return null;
  }

  public tick(dt:number, windowLeft:number, windowRight:number) {
    this._decorations.forEach((decorations) => {
      decorations.forEach((dec) => {
        dec.tick(dt);
      })
    });

    this._decorations.forEach((decorations, key) => {
      this._decorations.set(key, decorations.filter((dec) => {
        return dec.isOnScreen(windowLeft);
      }))
    });

    if(this._lastRight && windowRight > this._lastRight) {
      const metersPerSec = (windowRight - this._lastRight) / dt;

      for(let layer in Layer) {
        const rg = this._decorations.get(<Layer><unknown>layer);
        if(rg) {
          rg.push(...this._factory.generateNewDecorations(<Layer><unknown>layer, dt, metersPerSec, windowRight, this._map));
        }
        

      }
    }
    this._lastRight = windowRight;    
  }
  public draw(ctx:CanvasRenderingContext2D, layer:Layer) {
    const rg = this._decorations.get(layer);
    if(rg) {
      rg.forEach((dec) => {
        dec.draw(ctx)
      });
    }
  }

}
