import { DecorationState } from "./DecorationState";
import { DisplayUser, PaintFrameState, RGB } from "./drawing-interface";
import { DrawingBase } from "./drawing-shared";
import { RaceState } from "../tourjs-shared/RaceState";
import { CanvasTexture, DoubleSide, Matrix4, PerspectiveCamera, Plane, Vector2, Vector3 } from 'three';
import { User, UserInterface, UserTypeFlags } from "../tourjs-shared/User";
import { RideMap, RideMapElevationOnly } from "../tourjs-shared/RideMap";
import { defaultThemeConfig } from "./drawing-constants";
import { ThemeConfig, ConfiggedDecoration, randRange, Layer} from './DecorationFactory';
import * as THREE from 'three';

enum Planes {
  Background = -20,
  CloudLayer = -5,
  RoadFar = -5,
  RacingLane = 2.5,
  RoadNear = 5,
  GrassNear = 80,
  CameraClose = 20,
  CameraFast = 40,
}

const FAST_R = 1;
const FAST_G = 0;
const FAST_B = 0;
const LAZY_R = 0;
const LAZY_G = 0.5;
const LAZY_B = 0;
const REGULAR_R = 1;
const REGULAR_G = 1;
const REGULAR_B = 1;

const VIS_ELEV_SCALE = 6.5;
function getVisElev(map:RideMap, dist:number) {
  return VIS_ELEV_SCALE*map.getElevationAtDistance(dist);
}

function measureText(str:string, size:number, font:string):Vector2 {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if(!ctx) {
    return new Vector2(0,0);
  }
  ctx.font = `${size}px ${font}`;
  const measure = ctx?.measureText(str);
  return new Vector2(measure?.width, (measure?.actualBoundingBoxAscent || 0) - (measure?.actualBoundingBoxDescent || 0));
}

function getFirstLettersOfName(name:string):string {
  
  /*const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');*/
  
  let splitted = name.split(/[\W\s]/gi);
  splitted = splitted.filter((word) => !!word.trim());
  return splitted.map((word) => {

    
    if(word) {
      let everyLetterNumeric = true;
      for(var letter of word) {
        if(letter >= '0' && letter <= '9') {

        } else {
          everyLetterNumeric = false;
          break;
        }
      }
      if(everyLetterNumeric) {
        return word;
      } else {
        return word[0];
      }
    } else {
      return '';
    }
  }).join('');
}
function buildImageFromName(name:string) {
  const initials = getFirstLettersOfName(name);

  
  const font = 'Arial';
  const fontSize = 92;
  const sizeNeeded = measureText(initials, fontSize, font);
  
  const canvas = document.createElement('canvas');
  canvas.width = sizeNeeded.x*1.25;
  canvas.height = sizeNeeded.y*1.55;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.font = `${fontSize}px ${font}`;

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.strokeText(initials, 0, sizeNeeded.y);

  ctx.strokeStyle = 'black';
  ctx.fillStyle = 'black';
  ctx.fillText(initials, canvas.width*0.125, sizeNeeded.y);
  
  const dataUrl = canvas.toDataURL();
  console.log("made name for ", name, initials, dataUrl);
  return dataUrl
}

getFirstLettersOfName(`"Dilan Tuf-Overes"`);

class DisplayUser3D extends DisplayUser {
  geometry:THREE.BoxGeometry;
  material:THREE.MeshStandardMaterial;
  cube:THREE.Mesh;
  myUser:UserInterface;
  myScene:THREE.Scene;
  obj:THREE.Object3D;
  name:THREE.Object3D;
  nameCube:THREE.Mesh;
  nameWidth:number;
  camera:THREE.PerspectiveCamera;

  regularMaterial:THREE.MeshStandardMaterial;
  lazyMaterial:THREE.MeshStandardMaterial;
  fastMaterial:THREE.MeshStandardMaterial;
  ar:number;

  draftingMaterial:THREE.ShaderMaterial;
  draftingCube:THREE.Object3D;
  draftingGeo:THREE.BufferGeometry;
  draftingCycle:Float32Array;
  draftingLength:Float32Array;
  draftingEffort:Float32Array;

  map:RideMapElevationOnly;

  constructor(user:UserInterface, scene:THREE.Scene, camera:THREE.PerspectiveCamera, map:RideMapElevationOnly) {
    super(user);
    this.camera = camera;
    this.geometry = new THREE.BoxGeometry(0.25 + randRange(0,0.02),3,3);
    this.geometry.translate(0,0,0);

    let myColor = 0xffffff;
    if(!(user.getUserType() & UserTypeFlags.Ai)) {
      // we're a human
      myColor = 0xFF4444;
    } else if(!(user.getUserType() & UserTypeFlags.Bot)) {
      myColor = 0x888888;
    }


    this.material = new THREE.MeshStandardMaterial( { 
      color: myColor,
      opacity: 1,
    } );
    const img = user.getImage() || buildImageFromName(user.getName());
    if(img) {
      const tex = new THREE.TextureLoader().load(img);
      tex.rotation = -Math.PI/2;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = 1;
      this.material.map = tex;
    }
    this.cube = new THREE.Mesh( this.geometry, this.material );
    this.cube.castShadow = true;
    this.myUser = user;
    this.myScene = scene;
    this.map = map;


    { // building our name
      let fontSize = 128;
      if(user.getUserType() & UserTypeFlags.Ai) {
        fontSize = 92;
      }
      const font = 'Arial';
      const sizeNeeded = measureText(user.getName(), fontSize, font);
      console.log("we need ", sizeNeeded.x, sizeNeeded.y, " for ", user.getName());
      const canvas = document.createElement('canvas');
      canvas.width = sizeNeeded.x;
      canvas.height = sizeNeeded.y;
      const ctx = canvas.getContext('2d');
      if(ctx) {
        ctx.fillStyle = 'transparent';
        ctx.font = `${fontSize}px ${font}`;
        ctx.fillRect(0,0,canvas.width, canvas.height);

        const isHuman = !(this.myUser.getUserType() & (UserTypeFlags.Ai | UserTypeFlags.Bot));
        const transparentBlack = 'rgba(0,0,0,0.3)';
        const transparentWhite = 'rgba(255,255,255,0.3)';
        ctx.strokeStyle = isHuman ? 'black' : transparentBlack;
        ctx.lineWidth = 9;
        ctx.strokeText(user.getName(), 0, canvas.height);
        ctx.fillStyle =  isHuman ? 'white' : transparentWhite;
        ctx.strokeStyle = isHuman ? 'white' : transparentWhite;
        ctx.fillText(user.getName(), 0, canvas.height);
        const nameTex = new THREE.CanvasTexture(canvas);

        const makeMaterial = (userType:number, color:number) => {
          return new THREE.MeshStandardMaterial({
            color,
            map: nameTex,
            transparent: true,
            depthTest: false,
            side: DoubleSide,
          });
        }
        this.fastMaterial = makeMaterial(this.myUser.getUserType(), new THREE.Color(FAST_R, FAST_G, FAST_B).getHex());
        this.lazyMaterial = makeMaterial(this.myUser.getUserType(), new THREE.Color(LAZY_R, LAZY_G, LAZY_B).getHex());
        this.regularMaterial = makeMaterial(this.myUser.getUserType(), new THREE.Color(REGULAR_R, REGULAR_G, REGULAR_B).getHex());

        const sizeOfGeo = fontSize / 46;
        const ar = canvas.width / canvas.height;
        this.ar = ar;
        const nameGeo = new THREE.PlaneBufferGeometry(ar*sizeOfGeo, sizeOfGeo);
        this.nameCube = new THREE.Mesh(nameGeo, this.fastMaterial);
        
        this.name = new THREE.Object3D();
        this.name.position.set(0,1,Planes.RoadNear + this.ar/2);
        this.name.add(this.nameCube);
        scene.add(this.name);
      }
    }
    { // drafting indicator// create the particle variables
      const particleCount = 300;
      const particleGeometry = new THREE.BufferGeometry();
      this.draftingCycle = new Float32Array(particleCount);
      this.draftingLength = new Float32Array(particleCount);
      this.draftingEffort = new Float32Array(particleCount*4);
      
      // now create the individual particles
      let particleVerts:Float32Array = new Float32Array(particleCount*3);
      let ixVert = 0;
      for (var p = 0; p < particleCount; p++) {
      
        // create a particle with random
        // position values, -250 -> 250
        const pX = randRange(-0.25, 0.25);
        const pY = 0;
        const pZ = -0.5 + randRange(0, 2);
        this.draftingCycle[p] = randRange(0, 1);
      
        // add it to the geometry
        particleVerts[ixVert++] = pX;
        particleVerts[ixVert++] = pY;
        particleVerts[ixVert++] = pZ;
      }
      particleGeometry.setAttribute('position', new THREE.BufferAttribute( particleVerts, 3 ) );

      const particleVertexCode = `attribute float draftPct;
                                  attribute float draftLength;
                                  attribute vec4 draftEffort;
                                  varying vec4 vColor;

                                  float rand(float co){
                                      return fract(sin(co) * 43758.5453);
                                  }
                                  void main() {

                                    vColor = vec4(draftEffort.r, draftEffort.g, draftEffort.b, 1.0 - draftPct);

                                    vec3 rawPos = position;
                                    rawPos.x = (position.x / abs(position.x)) * sqrt(draftPct) * 3.0;
                                    rawPos.z = position.z + 0.1;
                                    rawPos.y -= draftPct * draftLength;

                                    float r = rand(draftPct);
                                    rawPos += 0.1*draftEffort.w*vec3(r,r,r);
                                    vec4 mvPosition = modelViewMatrix * vec4( rawPos, 1.0 );
                                    gl_PointSize = (1.0 - draftPct) * 12.0 * ( 10.0 / -mvPosition.z );

                                    gl_Position = projectionMatrix * mvPosition;

                                  }`
      const particleFragmentCode = `
                                    uniform sampler2D pointTexture;

                                    varying vec4 vColor;

                                    void main() {

                                      gl_FragColor = vColor;

                                    }
      `;

      const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: particleVertexCode,
        fragmentShader: particleFragmentCode,
        vertexColors: true,
        transparent: true,
      })
      const points = new THREE.Points(particleGeometry, particleMaterial);
      // add it to the scene
      particleGeometry.setAttribute('draftPct', new THREE.Float32BufferAttribute(this.draftingCycle, 1, false).setUsage(THREE.DynamicDrawUsage));
      particleGeometry.setAttribute('draftLength', new THREE.Float32BufferAttribute(this.draftingLength, 1, false).setUsage(THREE.DynamicDrawUsage));
      particleGeometry.setAttribute('draftEffort', new THREE.Float32BufferAttribute(this.draftingEffort, 4, false).setUsage(THREE.DynamicDrawUsage));
      this.draftingGeo = particleGeometry;
      this.draftingMaterial = particleMaterial;
      this.draftingCube = new THREE.Object3D();
      points.translateX(0.5);
      this.draftingCube.add(points);
    }


    // so we've got our cube, but we'll need it in an object
    this.obj = new THREE.Object3D();
    this.obj.add(this.cube);
    this.obj.add(this.draftingCube);
    scene.add(this.obj);

    
  }

  tmLastUpdate:number = 0;
  update(tmNow:number) {

    let dist = this.myUser.getDistanceForUi(tmNow);
    let elev = this.myUser.getLastElevation();
    if(this.myUser.isProbablyFinished()) {
      dist = this.map.getLength();
    }

    let zTarget = Planes.RacingLane;
    if(this.myUser.isFinished()) {
      zTarget -= (Planes.RoadNear - Planes.RoadFar);
      dist -= this.myUser.getFinishRank() * 4; // set everyone 4m apart
    } else if(this.myUser.getUserType() & UserTypeFlags.Ai) {
      // AIs get no Z boost
    } else {
      // it's a human of some flavour, so let's have it closer to the camera than the AIs
      zTarget += 0.1;
      if(this.myUser.getUserType() & UserTypeFlags.Local) {
        // local users are closer still
        zTarget += 0.1;
      }
      
    }

    elev = this.map.getElevationAtDistance(dist);
    this.obj.position.x = dist;
    this.obj.position.y = VIS_ELEV_SCALE*elev + 1;
    this.obj.position.z = zTarget;

    const dt = this.tmLastUpdate > 0 ? (tmNow - this.tmLastUpdate) / 1000 : 0;
    this.tmLastUpdate = tmNow;


    const slopePercent = this.myUser.getLastSlopeInWholePercent();
    const slopeMath = slopePercent / 100;
    const visSlopeMath = slopeMath * VIS_ELEV_SCALE;
    // so if we're have slope 0.2 (rise 0.2, run 1), then our up-vector will be (rise 1, run -0.2)
    const upVector = new THREE.Vector3(-visSlopeMath, 1, 0);
    const upMe = upVector.clone().add(this.obj.position);
    if(slopePercent > 0) {
      this.cube.rotation.z = Math.PI;
      this.draftingCube.rotation.z = 0;
      //this.cube.rotateZ(Math.PI/2);
    } else {
      this.cube.rotation.z = 0;
      this.draftingCube.rotation.z = Math.PI;
    }
    
    this.obj.lookAt(upMe);
    
    
    if(this.myUser.hasDraftersThisCycle(tmNow)) { // handling drafting graphics
      this.draftingCube.visible = true;
      const rgDraftCycle:any = this.draftingGeo.attributes.draftPct.array;
      const rgDraftLength:any = this.draftingGeo.attributes.draftLength.array;
      const rgDraftEffort:any = this.draftingGeo.attributes.draftEffort.array;
      const userSpeed = this.myUser.getSpeed();
      const draftLength = this.myUser.getLastDraftLength();
      const draftEffort = (this.myUser.getLastPower() / this.myUser.getHandicap());
      if(draftLength > 0) {
        for(var index = 0; index < rgDraftCycle.length; index++) {
          let val = rgDraftCycle[index];
          const pct = Math.max(0.3, val);
          const speed = userSpeed;
          val += speed*dt / draftLength;
          if(val >= 1) {
            // resetting the particle back to the start
            
            rgDraftLength[index] = draftLength;

            if(draftEffort >= 1.3) {
              rgDraftEffort[index*4 + 0] = FAST_R;
              rgDraftEffort[index*4 + 1] = FAST_G;
              rgDraftEffort[index*4 + 2] = FAST_B;
              rgDraftEffort[index*4 + 3] = 1;
            } else if(draftEffort <= 0.5) {
              rgDraftEffort[index*4 + 0] = LAZY_R;
              rgDraftEffort[index*4 + 1] = LAZY_G;
              rgDraftEffort[index*4 + 2] = LAZY_B;
              rgDraftEffort[index*4 + 3] = 0;
            } else {
              rgDraftEffort[index*4 + 0] = REGULAR_R;
              rgDraftEffort[index*4 + 1] = REGULAR_G;
              rgDraftEffort[index*4 + 2] = REGULAR_B;
              rgDraftEffort[index*4 + 3] = 0;
            }
            val = val % 1;
          }
          rgDraftCycle[index] = val;
        }
      }
      this.draftingGeo.attributes.draftPct.needsUpdate = true;
      this.draftingGeo.attributes.draftLength.needsUpdate = true;
      this.draftingGeo.attributes.draftEffort.needsUpdate = true;
    } else {
      this.draftingCube.visible = false;
    }

    this.name.lookAt(this.camera.position);
    
    const handicapRatio = this.myUser.getLastPower() / this.myUser.getHandicap();
    if(handicapRatio > 1.3) {
      this.nameCube.material = this.fastMaterial;
    } else if(handicapRatio < 0.5) {
      this.nameCube.material = this.lazyMaterial;
    } else {
      this.nameCube.material = this.regularMaterial;
    }

    let xShift = 0;
    let yShift = 0;
    if(handicapRatio > 1.6) {
      xShift = Math.random() * 0.6;
      yShift = Math.random() * 0.6;
    }

    let minusAmount = 1;
    if(this.myUser.getUserType() & (UserTypeFlags.Ai | UserTypeFlags.Bot)) {
      minusAmount = 1;
    }
    this.name.position.set(this.obj.position.x + xShift, this.obj.position.y - minusAmount, Planes.RoadNear + this.ar + yShift + minusAmount);
    

  }
}

function buildSquareMesh(map:RideMap, nearZ:number, farZ:number, stepSize:number, material:THREE.Material, fnColor:(dist:number, left:boolean, near:boolean)=>RGB, fnHeights?:(dist:number)=>{near:number,far:number}, fnUv?:(pos:THREE.Vector3,left:boolean, near:boolean)=>{u:number,v:number}):THREE.Mesh {

  if(!fnHeights) {
    fnHeights = (dist:number)=> {
      const e = getVisElev(map, dist);
      return {near:e,far:e};
    }
  }

  if(!fnUv) {
    fnUv = (pos:THREE.Vector3, left:boolean, near:boolean) => {
      let u,v;
      if(left) {
        u = 0;
      } else {
        u = 1;
      }
      if(near) {
        v = 1;
      } else {
        v = 0;
      }
      return {u,v};
    }
  }

  const geometry = new THREE.BufferGeometry();
  // create a simple square shape. We duplicate the top left and bottom right
  // vertices because each vertex needs to appear once per triangle.

  const startDist = -500;
  const endDist = map.getLength() + 100;
  const nPoints = Math.floor((endDist - startDist) / stepSize);
  const floatsPerPoint = 3;
  const floatsPerUv = 2;
  const pointsPerSegment = 6;
  const verts = new Float32Array(nPoints*floatsPerPoint*pointsPerSegment);
  const norms = new Float32Array(verts.length);
  const colors = new Float32Array(verts.length);
  const uv = new Float32Array(nPoints * pointsPerSegment * floatsPerUv);
  let ixBase = 0;
  let ixUvBase = 0;
  
  let ix = 0;
  for(var dist = startDist; dist < endDist; dist += stepSize) {
    ix++;
    const leftX = dist;
    const rightX = dist+stepSize;
    const elevsLeft = fnHeights(dist);
    const elevsRight = fnHeights(dist+stepSize);

    const colorLeftNear = fnColor(dist, true, true);
    const colorLeftFar = fnColor(dist, true, false);
    const colorRightNear = fnColor(dist+stepSize, false, true);
    const colorRightFar = fnColor(dist+stepSize, false, false);


    const posLeftNear = new THREE.Vector3(leftX, elevsLeft.near, nearZ);
    const posRightNear = new THREE.Vector3(rightX, elevsRight.near, nearZ);
    const posLeftFar = new THREE.Vector3(leftX, elevsLeft.far, farZ);
    const posRightFar = new THREE.Vector3(rightX, elevsRight.far, farZ);

    const uvLeftNear = fnUv(posLeftNear, true, true);
    const uvRightNear = fnUv(posRightNear, false, true);
    const uvLeftFar = fnUv(posLeftFar, true, false);
    const uvRightFar = fnUv(posRightFar, false, false);

    { // triangle based on near side of road, going far-left, near-left, near-right
      verts[ixBase+0] = posLeftNear.x;
      verts[ixBase+1] = posLeftNear.y;
      verts[ixBase+2] = posLeftNear.z;
      norms[ixBase+0] = 0; norms[ixBase+1] = 1; norms[ixBase+2] = 0;
      colors[ixBase+0] = colorLeftNear.r; colors[ixBase+1] = colorLeftNear.g; colors[ixBase+2] = colorLeftNear.b;
      uv[ixUvBase+0] = uvLeftNear.u; 
      uv[ixUvBase+1] = uvLeftNear.v; 
      ixBase+=3;  ixUvBase += 2;
      
      verts[ixBase+0] = posRightNear.x;
      verts[ixBase+1] = posRightNear.y;
      verts[ixBase+2] = posRightNear.z;
      norms[ixBase+0] = 0; norms[ixBase+1] = 1; norms[ixBase+2] = 0;
      colors[ixBase+0] = colorRightNear.r; colors[ixBase+1] = colorRightNear.g; colors[ixBase+2] = colorRightNear.b;
      uv[ixUvBase+0] = uvRightNear.u; 
      uv[ixUvBase+1] = uvRightNear.v; 
      ixBase+=3;  ixUvBase += 2;

      verts[ixBase+0] = posLeftFar.x;
      verts[ixBase+1] = posLeftFar.y;
      verts[ixBase+2] = posLeftFar.z;
      norms[ixBase+0] = 0; norms[ixBase+1] = 1; norms[ixBase+2] = 0;
      colors[ixBase+0] = colorLeftFar.r; colors[ixBase+1] = colorLeftFar.g; colors[ixBase+2] = colorLeftFar.b;
      uv[ixUvBase+0] = uvLeftFar.u; 
      uv[ixUvBase+1] = uvLeftFar.v; 
      ixBase+=3;  ixUvBase += 2;

    }
    
    { // triangle based on far side of road, going far-left, near-right, far-right
      verts[ixBase+0] = posLeftFar.x;
      verts[ixBase+1] = posLeftFar.y;
      verts[ixBase+2] = posLeftFar.z;
      norms[ixBase+0] = 0; norms[ixBase+1] = 1; norms[ixBase+2] = 0;
      colors[ixBase+0] = colorLeftFar.r; colors[ixBase+1] = colorLeftFar.g; colors[ixBase+2] = colorLeftFar.b;
      uv[ixUvBase+0] = uvLeftFar.u; 
      uv[ixUvBase+1] = uvLeftFar.v; 
      ixBase+=3;  ixUvBase += 2;
      
      verts[ixBase+0] = posRightNear.x;
      verts[ixBase+1] = posRightNear.y;
      verts[ixBase+2] = posRightNear.z;
      norms[ixBase+0] = 0; norms[ixBase+1] = 1; norms[ixBase+2] = 0;
      colors[ixBase+0] = colorRightNear.r; colors[ixBase+1] = colorRightNear.g; colors[ixBase+2] = colorRightNear.b;
      uv[ixUvBase+0] = uvRightNear.u; 
      uv[ixUvBase+1] = uvRightNear.v; 
      ixBase+=3;  ixUvBase += 2;

      verts[ixBase+0] = posRightFar.x;
      verts[ixBase+1] = posRightFar.y;
      verts[ixBase+2] = posRightFar.z;
      norms[ixBase+0] = 0; norms[ixBase+1] = 1; norms[ixBase+2] = 0;
      colors[ixBase+0] = colorRightFar.r; colors[ixBase+1] = colorRightFar.g; colors[ixBase+2] = colorRightFar.b;
      uv[ixUvBase+0] = uvRightFar.u; 
      uv[ixUvBase+1] = uvRightFar.v; 
      ixBase+=3;  ixUvBase += 2;

    }
  }
  geometry.setAttribute( 'position', new THREE.BufferAttribute( verts, 3 ) );
  geometry.setAttribute( 'normal', new THREE.BufferAttribute( norms, 3 ) );
  geometry.setAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
  geometry.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
  const mesh = new THREE.Mesh( geometry, material );
  mesh.receiveShadow = true;
  return mesh;
}


function buildRoad(raceState:RaceState):THREE.Mesh[] {
  const map = raceState.getMap();
  const stepSize = 20;

  const fnRoadColor = (dist:number) => {
    let r = (Math.sin(dist / 250) + 1) / 2;
    r *= 0.2;
    return {
      r: 0.35 + r,
      g: 0.35 + r,
      b: 0.35 + r,
    }
  }

  const roadTexture = new THREE.TextureLoader().load( "/road.jpg" );
  const roadMaterial = new THREE.MeshPhongMaterial( {vertexColors:true} );
  roadMaterial.map = roadTexture;
  const roadMesh = buildSquareMesh(map, Planes.RoadNear, Planes.RoadFar, stepSize, roadMaterial, fnRoadColor);

  const backGrassTexture = new THREE.TextureLoader().load( "/grass.jpg" );
  backGrassTexture.wrapS = THREE.RepeatWrapping;
  backGrassTexture.wrapT = THREE.RepeatWrapping;
  backGrassTexture.repeat.set( 2, (Planes.RoadFar - Planes.Background) / 8 );
  const fnGrassColor = (dist:number) => {
    let r = (Math.sin(dist / 168) + 1) / 2;
    return {r:0.6, 
            g:0.8,
            b:0.6
          }
  }
  const backGrassMaterial = new THREE.MeshPhongMaterial({vertexColors:true});
  backGrassMaterial.map = backGrassTexture;
  const farGrassMesh = buildSquareMesh(map, Planes.RoadFar, Planes.Background, stepSize, backGrassMaterial, fnGrassColor);

  const nearGrassTexture = backGrassTexture.clone();
  nearGrassTexture.repeat.set(2, (Planes.GrassNear - Planes.RoadNear)/8);
  const nearGrassMaterial = new THREE.MeshPhongMaterial({vertexColors:true});
  nearGrassMaterial.map = nearGrassTexture;
  const nearGrassMesh = buildSquareMesh(map, Planes.GrassNear, Planes.RoadNear, stepSize, nearGrassMaterial, fnGrassColor);


  const fnSkyColor = (dist:number, left:boolean, near:boolean) => {
    return {r:near ? 1 : 0.1, 
            g:near ? 1 : 0.1,
            b:near ? 1 : 0.1,
          }
  }
  const bounds = map.getBounds();
  const threeQuartersUp = 0.75*bounds.maxElev + 0.25*bounds.minElev;
  const fnSkyHeight = (dist:number) => {
    return {
      near: bounds.minElev*VIS_ELEV_SCALE,
      far: VIS_ELEV_SCALE*threeQuartersUp,
    }
  }

  const grid = new THREE.TextureLoader().load( "/grid.png" );
  grid.wrapS = THREE.RepeatWrapping;
  grid.wrapT = THREE.RepeatWrapping;
  grid.repeat.set( 2, (threeQuartersUp-bounds.minElev) );
  const skyMaterial = new THREE.MeshStandardMaterial({color: 0x35D6ed, vertexColors: true});
  skyMaterial.map = grid;
  const skyMesh = buildSquareMesh(map, Planes.Background, Planes.Background, stepSize, skyMaterial, fnSkyColor, fnSkyHeight);
  
  const fnSpaceColor = (dist:number, left:boolean, near:boolean) => {
    return {
      r:1,
      g:1,
      b:1,
    }
  }
  const fnSpaceHeight = (dist:number) => {
    return {
      near: fnSkyHeight(dist).far,
      far: bounds.maxElev + VIS_ELEV_SCALE * 30,
    }
  }
  const fnSpaceUv = (pos:THREE.Vector3, left:boolean, near:boolean) => {
    return {
      u: pos.x / 50,
      v: pos.y / 50,
    }
  }
  const stars = new THREE.TextureLoader().load( "/stars.png" );
  stars.wrapS = THREE.RepeatWrapping;
  stars.wrapT = THREE.RepeatWrapping;
  stars.repeat.set(1.25, (bounds.maxElev - threeQuartersUp)/10);
  const spaceMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, vertexColors: true});
  spaceMaterial.map = stars;
  
  const spaceMesh = buildSquareMesh(map, Planes.Background, Planes.Background, stepSize, spaceMaterial, fnSpaceColor, fnSpaceHeight, fnSpaceUv);

  return [roadMesh, farGrassMesh, skyMesh, nearGrassMesh, spaceMesh]
}

const texHash:{[key:string]:THREE.Texture} = {};

function makeTexturedSceneryCube(dist:number, scenery:ConfiggedDecoration, map:RideMap):THREE.Mesh {

  
  const ixImage = Math.floor(scenery.imageUrl.length * Math.random());
  const imgUrl = `/${scenery.imageUrl[ixImage]}`;
  let tex;
  if(texHash[imgUrl]) {
    tex = texHash[imgUrl];
  } else {
    tex = texHash[imgUrl] = new THREE.TextureLoader().load(imgUrl);
  }

  
  const width = randRange(scenery.minDimensions.x, scenery.maxDimensions.x);
  const height = randRange(scenery.minDimensions.y, scenery.maxDimensions.y);

  const geometry = new THREE.BoxGeometry(0, height, width);
  const material = new THREE.MeshStandardMaterial( { 
    //color: 0xff0000,
    transparent: true,
    map: tex,
  } );
  material.map = tex;
  
  const cube = new THREE.Mesh( geometry, material );
  cube.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex,
    alphaTest: 0.5,
  })

  const elevOfItem = map.getElevationAtDistance(dist) + randRange(scenery.minAltitude, scenery.maxAltitude);

  cube.position.x = dist + Math.random();
  cube.position.y = VIS_ELEV_SCALE * elevOfItem + height/2;
  cube.position.z = randRange(Planes.RoadFar, Planes.Background);


  const slopeAt = -map.getSlopeAtDistance(dist)*VIS_ELEV_SCALE;
  const lookAt = new THREE.Vector3(cube.position.x + slopeAt, cube.position.y,cube.position.z)
  
  cube.lookAt(lookAt);
  
  return cube;
}

function getSpaceCutoffElevation(map:RideMap) {
  const bounds = map.getBounds();
  if(bounds.maxElev - bounds.minElev >= 25) {
    // map has enough elevation change to make space worth it
    return 0.75*bounds.maxElev + 0.25*bounds.minElev;
  } else {
    return bounds.maxElev + 25;
  }
}

export class Drawer3D extends DrawingBase {
    
  scene:THREE.Scene|null = null
  camera:THREE.OrthographicCamera|THREE.PerspectiveCamera|null = null;
  renderer:THREE.WebGLRenderer|null = null;

  lastCameraLookShift:THREE.Vector3 = new THREE.Vector3(0,0,0);
  lastCameraPosShift:THREE.Vector3 = new THREE.Vector3(0,0,0);
  lastCameraFocalLengthShift:number = 0;

  lights = {
    sunlight:null as THREE.Light|null,
    ambient:null as THREE.AmbientLight|null,
  };

  myRaceState:RaceState|null = null;
  myCanvas:HTMLCanvasElement|null = null;

  lastCanvasWidth:number = 0;
  lastCanvasHeight:number = 0;
  lastCanvasPixelRatio:number = 1;

  constructor() {
    super();
  }
  private _build(canvas:HTMLCanvasElement, raceState:RaceState, paintState:PaintFrameState, canvasPixelRatio:number) {

    if(raceState !== this.myRaceState || canvas !== this.myCanvas || this.lastCanvasWidth !== canvas.clientWidth || this.lastCanvasHeight !== canvas.clientHeight || this.lastCanvasPixelRatio !== canvasPixelRatio) {
      this.lights.sunlight?.dispose();
      this.lights.ambient?.dispose();
      this.renderer?.dispose();
      paintState.userPaint.clear();



      this.lastCanvasWidth = canvas.clientWidth;
      this.lastCanvasHeight = canvas.clientHeight;
      this.lastCanvasPixelRatio = canvasPixelRatio
      canvas.width = canvas.clientWidth * this.lastCanvasPixelRatio;
      canvas.height = canvas.clientHeight * this.lastCanvasPixelRatio;
      console.log("rebuilding", canvas.clientWidth, canvas.clientHeight,  "created pixel widths ", canvas.width, canvas.height);

      this.scene = new THREE.Scene();
      const aspectRatio = canvas.width / canvas.height;
      {
        const orthoWidth = 30;
        const orthoHeight = orthoWidth / aspectRatio;
        //this.camera = new THREE.OrthographicCamera(-orthoWidth, orthoWidth, orthoHeight, -orthoHeight, 0.001, 1000);
      }
      {
        this.camera = new THREE.PerspectiveCamera(80, aspectRatio, 0.1, Planes.Background*2);
      }

      //const light = new THREE.AmbientLight( 0x404040 ); // soft white light
      //this.scene.add( light );
      const map = raceState.getMap();

      this.lights.ambient = new THREE.AmbientLight(0xc0c0c0);
      this.scene.add(this.lights.ambient);

      this.lights.sunlight = new THREE.PointLight(0xffffff, 1.5, 0);
      //this.sunlight.lookAt(0,0,0);
      const bounds = map.getBounds();
      this.lights.sunlight.position.x = map.getLength() / 2;
      this.lights.sunlight.position.y = (bounds.maxElev) + 100;
      this.lights.sunlight.position.z = Planes.CameraFast
      this.lights.sunlight.castShadow = false;
      //this.lights.sunlight.shadow.mapSize.width = Math.max(window.innerWidth, window.innerHeight); // default
      //this.lights.sunlight.shadow.mapSize.height = Math.max(window.innerWidth, window.innerHeight); // default
      //this.lights.sunlight.shadow.camera.near = this.lights.sunlight.position.z - Planes.RacingLane; // default
      //this.lights.sunlight.shadow.camera.far = map.getLength(); // this appears to control the radius that the LIGHT functions as well as shadows.  so it needs to be the entire radius that we want the light to do

      this.scene.add(this.lights.sunlight);

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias:window.devicePixelRatio <= 1.0 });
      //this.renderer.shadowMap.enabled = false;
      //this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
      
      // let's build the road
      const road = buildRoad(raceState);
      this.scene.add(...road);

      // let's build scenery
      const themeConfig = defaultThemeConfig;
      this._populateScenery(map, themeConfig);

      this.myRaceState = raceState;
      this.myCanvas = canvas;
    }


  }
  private _populateScenery(map:RideMap, themeConfig:ThemeConfig) {
    
    const km = map.getLength() / 1000;

    const nScenery = Math.floor(map.getLength() / 10);
    const keys = [...themeConfig.decorationSpecs.keys()];

    const spaceCutoff = getSpaceCutoffElevation(map);
    for(var sceneryKey of keys) {
      // each scenery item has a "frequency per km", so let's make sure we put enough in our game
      const scenery = themeConfig.decorationSpecs[sceneryKey];
      if(scenery.layer === Layer.Underground) {
        continue;
      }

      const nNeeded = km * scenery.frequencyPerKm;
      for(var x = 0;x < nNeeded; x++) {
        const dist = Math.random() * map.getLength();
        const elev = map.getElevationAtDistance(dist);
        
        const placementWouldBeInSpace = elev >= spaceCutoff;
        let allowedInSpace = scenery.layer === Layer.Space;
        if(placementWouldBeInSpace === allowedInSpace) {
          this.scene?.add(makeTexturedSceneryCube(dist, scenery, map));
        }
      }
    }
  }
  _tmLastTrack = 0;

  private _trackLocalUser(tmNow:number) {
    let dt = 0;
    if(this._tmLastTrack !== 0) {
      dt = (tmNow - this._tmLastTrack) / 1000;
    }
    this._tmLastTrack = tmNow;
    if(this.myRaceState && this.camera && this.lights.sunlight) {
      const localUser = this.myRaceState.getLocalUser();
      const map = this.myRaceState.getMap();
      if(localUser) {
        const s = tmNow / 1000;

        const dist = localUser.getDistanceForUi(tmNow);
        const elev = map.getElevationAtDistance(dist);

        // we want the shadow-casting light to change where the shadow gets cast depending on how far they are along in the race
        const pct = dist / this.myRaceState.getMap().getLength();
        const shiftage = 60;
        this.lights.sunlight.position.x = dist - shiftage / 2 + shiftage*pct;
        this.lights.sunlight.position.y = getVisElev(map, dist) + Planes.CameraFast;
        
        const maxSpeed = 20;
        const minSpeed = 7.5;
        let pctSpeed = (localUser.getSpeed() - minSpeed) / (maxSpeed - minSpeed);
        pctSpeed = Math.max(0.0, Math.min(1.0, pctSpeed));
        const camDist = pctSpeed*Planes.CameraFast + (1-pctSpeed)*Planes.CameraClose;

        let defaultFocalLength = 15;
        let defaultCamPosition = new THREE.Vector3(dist+1, getVisElev(map, dist) + camDist/4, camDist);
        //let defaultCamPosition = new THREE.Vector3(dist+1, getVisElev(map, dist) + 50, camDist);
        
        const defaultLookAt = new THREE.Vector3(dist, VIS_ELEV_SCALE*localUser.getLastElevation() - 5, Planes.RoadNear);

        // these "shifts" are how far we want to change our aim from the default, "look directly at player" view
        let focalLengthShift = 0;
        let lookAtShift = new THREE.Vector3(0,0,0);
        let positionShift = new THREE.Vector3(0,0,0);
        if(map.getSlopeAtDistance(dist) > 0) {
          // we're going up a hill!
          const stats = map.getHillStatsAtDistance(dist);
          if(stats) {
            stats.startDist = Math.max(dist - 50, stats.startDist);
            stats.startElev = map.getElevationAtDistance(stats.startDist);
            stats.endDist = Math.min(dist+50, stats.endDist);
            stats.endElev = map.getElevationAtDistance(stats.endDist);

            // ok, we have something resembling a hill here
            const avgSlope = (stats.endElev - stats.startElev) / (stats.endDist - stats.startDist);
            if(avgSlope >= 0.025 && localUser.getSpeed() <= 9) {
              // this is a serious hill, and they're slowed down enough that drafting don't matter no more! lets change the view
              lookAtShift = new THREE.Vector3(dist + 10, localUser.getLastElevation()*VIS_ELEV_SCALE, Planes.RacingLane);
              lookAtShift.sub(defaultLookAt);
              

              positionShift = new THREE.Vector3(dist - 15, 
                                                VIS_ELEV_SCALE * (elev), 
                                                Planes.RoadNear + 5);
              positionShift.sub(defaultCamPosition);

              focalLengthShift = 15;
            }
          }
        } else {
          
        }

        const mixLevel = 0.98;
        this.lastCameraLookShift = new Vector3(
          this.lastCameraLookShift.x * mixLevel + (1-mixLevel)*lookAtShift.x,
          this.lastCameraLookShift.y * mixLevel + (1-mixLevel)*lookAtShift.y,
          this.lastCameraLookShift.z * mixLevel + (1-mixLevel)*lookAtShift.z,
        )
        this.lastCameraPosShift = new Vector3(
          this.lastCameraPosShift.x * mixLevel + (1-mixLevel)*positionShift.x,
          this.lastCameraPosShift.y * mixLevel + (1-mixLevel)*positionShift.y,
          this.lastCameraPosShift.z * mixLevel + (1-mixLevel)*positionShift.z,
        )
        this.lastCameraFocalLengthShift = mixLevel*this.lastCameraFocalLengthShift + (1-mixLevel)*focalLengthShift;
        defaultLookAt.add(this.lastCameraLookShift);
        defaultCamPosition.add(this.lastCameraPosShift);
        defaultFocalLength += this.lastCameraFocalLengthShift;

        defaultLookAt.y += 5;
        
        //this.camera.setFocalLength(defaultFocalLength);
        const depth = 25;
        this.camera.position.set(defaultLookAt.x - depth*0.4, defaultLookAt.y + depth/2, Planes.RacingLane + depth);
        this.camera.lookAt(defaultLookAt); // art: I suspect this actually triggers a redraw.  I used to have an _awful_ choppy appearance, and I'm pretty sure it's because I used to do lookAt before setting the camera's position
      }
      
    }
    
  }
  paintCanvasFrame(canvas:HTMLCanvasElement, raceState:RaceState, timeMs:number, decorationState:DecorationState, dt:number, paintState:PaintFrameState):void {

    let cpr = window.devicePixelRatio || 1.0;

    this.doPaintFrameStateUpdates('', timeMs, dt, raceState, paintState);

    
    if((window as any).shrinky) {
      cpr = (window as any).shrinky || 0.5;
      console.log("pixel ratio set to 0.5");
    }

    const tmNow = new Date().getTime();

    this._build(canvas, raceState, paintState, cpr);
    this._trackLocalUser(tmNow);

    const seconds = Math.sin(timeMs / 1000);

    if(this.camera && this.renderer && this.scene) {
      this.renderer.render( this.scene, this.camera );
    }
  }
  doPaintFrameStateUpdates(rootResourceUrl:string, tmNow:number, dtSeconds:number, raceState:RaceState, paintState:PaintFrameState) {
    if(this.scene) {
      const users = raceState.getUserProvider().getUsers(tmNow)
      for(var user of users) {
        const ps:DisplayUser3D = (paintState.userPaint.get(user.getId()) as DisplayUser3D) || new DisplayUser3D(user, this.scene, this.camera, raceState.getMap());
        ps.update(tmNow)

        paintState.userPaint.set(user.getId(), ps);
      }
    }
  }

}