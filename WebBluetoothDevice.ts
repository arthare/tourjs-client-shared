import { writeToCharacteristic, monitorCharacteristic, serviceUuids, FnCancel } from "./DeviceUtils";
import { CadenceRecipient, HrmRecipient, SlopeSource } from "../tourjs-shared/User";
import { assert2 } from "../tourjs-shared/Utils";
import { request } from "http";

export enum BTDeviceState {
  Ok,
  BrieflyGone,
  ExtendedGone,
  Disconnected,
}

export type FnPowerReceipient = (tmNow:number, watts:number) => void


export interface ConnectedDeviceInterface {
  disconnect():Promise<void>;
  zeroOffset():Promise<void>;
  userWantsToKeep():boolean; // if you get disconnected, then the user doesn't want to keep you

  getDeviceId():string; // return the same device ID for the same physical device
  getState():BTDeviceState;
  name():string;
  getDeviceTypeDescription():string;
  getDeviceFlags():number;
  setDeviceFlags(flags:number):void; // tell the device what it's currently getting used for

  setPowerRecipient(who:FnPowerReceipient):void;
  setCadenceRecipient(who:CadenceRecipient):void;
  setHrmRecipient(who:HrmRecipient):void;
  setSlopeSource(who:SlopeSource):void;

  // tell your device to update its slope.
  // resolve(true) -> device successfully updated
  // resolve(false) -> device not updated for rate-limiting reasons or other benign issues
  // reject -> device not updated because something is messed up
  updateSlope(tmNow:number, ftmsPct:number):Promise<boolean>; 
  updateErg(tmNow:number, watts:number):Promise<boolean>;
  updateResistance(tmNow:number, pct:number):Promise<boolean>;
}

export abstract class PowerDataDistributor implements ConnectedDeviceInterface {
  private _powerOutput:FnPowerReceipient[] = [];
  private _cadenceOutput:CadenceRecipient[] = [];
  private _hrmOutput:HrmRecipient[] = [];
  protected _slopeSource:SlopeSource|null = null;
  private _userWantsToKeep:boolean = true;
  private _deviceFlags:number = 0;

  getDeviceFlags():number {
    return this._deviceFlags;
  }
  setDeviceFlags(flags:number) {
    this._deviceFlags = flags;
  }
  disconnect():Promise<void> {
    this._userWantsToKeep = false;
    return Promise.resolve();
  }
  zeroOffset(): Promise<void> {
    throw new Error("Zero Offset not implemented for this device");
  }
  userWantsToKeep():boolean {
    return this._userWantsToKeep;
  }
  abstract getDeviceTypeDescription():string;
  abstract getDeviceId():string;
  abstract getState():BTDeviceState;
  abstract name():string;
  abstract updateErg(tmNow:number, watts:number):Promise<boolean>;
  abstract updateSlope(tmNow:number, ftmsPct:number):Promise<boolean>;
  abstract updateResistance(tmNow:number, pct:number):Promise<boolean>;

  public setPowerRecipient(who: FnPowerReceipient): void {
    this._powerOutput.push(who);
  }
  public setCadenceRecipient(who: CadenceRecipient): void {
    this._cadenceOutput.push(who);
  }
  public setHrmRecipient(who: HrmRecipient): void {
    this._hrmOutput.push(who);
  }
  public setSlopeSource(who: SlopeSource):void {
    this._slopeSource = who;
  }

  protected _notifyNewPower(tmNow:number, watts:number) :void {
    this._powerOutput.forEach((pwr) => {
      pwr(tmNow, watts);
    });
  }
  protected _notifyNewCadence(tmNow:number, cadence:number) :void {
    this._cadenceOutput.forEach((cad) => {
      cad.notifyCadence(tmNow, cadence);
    });
  }
  protected _notifyNewHrm(tmNow:number, newHrm:number):void {
    this._hrmOutput.forEach((hrm) => {
      hrm.notifyHrm(tmNow, newHrm);
    });
  }

}


export abstract class BluetoothDeviceShared extends PowerDataDistributor {
  protected _gattDevice:BluetoothRemoteGATTServer;
  protected _state:BTDeviceState;

  public _startupPromise:Promise<any> = Promise.resolve();


  constructor(gattDevice:BluetoothRemoteGATTServer) {
    super();
    this._gattDevice = gattDevice;
    this._state = BTDeviceState.Disconnected;
  }
  disconnect(): Promise<void> {
    return super.disconnect().then(() => {
      this._gattDevice.disconnect();
      return Promise.resolve();
    })
  }
  getDeviceId():string {
    return this._gattDevice.device.id;
  }
  getState(): BTDeviceState {
    return this._state;
  }
  name(): string {
    return this._gattDevice.device.name || "Unknown";
  }
  abstract hasPower(): boolean;
  abstract hasCadence(): boolean;
  abstract hasHrm(): boolean;

}

export class BluetoothFtmsDevice extends BluetoothDeviceShared {
  _hasSeenCadence: boolean = false;

  constructor(gattDevice:BluetoothRemoteGATTServer) {
    super(gattDevice);

    this._startupPromise = this._startupPromise.then(() => {
      // need to start up property monitoring for ftms

      const fnIndoorBikeData = (evt:any) => { this._decodeIndoorBikeData(evt.target.value)};
      return monitorCharacteristic(gattDevice, 'fitness_machine', 'indoor_bike_data', fnIndoorBikeData).then(() => {

        const fnFtmsStatus = (evt:any) => { this._decodeFitnessMachineStatus(evt.target.value)};
        return monitorCharacteristic(gattDevice, 'fitness_machine', 'fitness_machine_status', fnFtmsStatus);
      }).then(() => {
        const fnFtmsControlPoint = (evt:any) => { this._decodeFtmsControlPoint(evt.target.value)};
        return monitorCharacteristic(gattDevice, 'fitness_machine', 'fitness_machine_control_point', fnFtmsControlPoint);
      }).then(() => {
        const charOut = new DataView(new ArrayBuffer(1));
        charOut.setUint8(0, 0); // request control
    
        return writeToCharacteristic(gattDevice, 'fitness_machine', 'fitness_machine_control_point', charOut);
      });
    })
  }
  getDeviceTypeDescription():string {
    return "FTMS Smart Trainer";
  }

  _tmLastErgUpdate:number = 0;
  public updateErg(tmNow: number, watts:number): Promise<boolean> {
    const dtMs = tmNow - this._tmLastErgUpdate;
    if(dtMs < 500) {
      return Promise.resolve(false); // don't update the ftms device too often
    }
    this._tmLastErgUpdate = tmNow;

    console.log("updating FTMS device with erg " + watts.toFixed(0) + 'W');
    
    const charOut = new DataView(new ArrayBuffer(20));
    charOut.setUint8(0, 5); // setTargetPower
    charOut.setInt16(1, watts, true);

    return writeToCharacteristic(this._gattDevice, 'fitness_machine', 'fitness_machine_control_point', charOut).then(() => {
      console.log("sent FTMS command to " + this._gattDevice.device.name);
      return true;
    }).catch((failure) => {
      throw failure;
    });
  }
  _tmLastSlopeUpdate:number = 0;
  updateSlope(tmNow:number, ftmsPct:number):Promise<boolean> {


    const dtMs = tmNow - this._tmLastSlopeUpdate;
    if(dtMs < 500) {
      return Promise.resolve(false); // don't update the ftms device too often
    }
    this._tmLastSlopeUpdate = tmNow;

    if(!this._slopeSource) {
      console.log("Not updating FTMS device because no slope source");
      return Promise.resolve(false);
    }


    let slopeInWholePercent = this._slopeSource.getLastSlopeInWholePercent() * ftmsPct;
    if(slopeInWholePercent < 0) {
      slopeInWholePercent /= 4; // zwift-style, let's not spin out on downhills
    }


    console.log("updating FTMS device with slope " + slopeInWholePercent.toFixed(1) + '%');
    const charOut = new DataView(new ArrayBuffer(7));
    charOut.setUint8(0, 0x11); // setIndoorBikesimParams

    // the actual object looks like:
    // typedef struct
    // {
    //   int16_t windMmPerSec;
    //   int16_t gradeHundredths;
    //   uint8_t crrTenThousandths;
    //   uint8_t windResistanceCoefficientHundredths; // in "kilograms per meter"
    // } INDOORBIKESIMPARAMS;
    charOut.setInt16(1, 0, true);
    charOut.setInt16(3, slopeInWholePercent*100, true);
    charOut.setUint8(5, 33);
    charOut.setUint8(6, 0);

    return writeToCharacteristic(this._gattDevice, 'fitness_machine', 'fitness_machine_control_point', charOut).then(() => {
      console.log("sent FTMS command to " + this._gattDevice.device.name);
      return true;
    }).catch((failure) => {
      throw failure;
    });
  }
  
  updateResistance(tmNow:number, pct:number):Promise<boolean> {

    const dtMs = tmNow - this._tmLastSlopeUpdate;
    if(dtMs < 500) {
      return Promise.resolve(false); // don't update the ftms device too often
    }
    this._tmLastSlopeUpdate = tmNow;

    const charOut = new DataView(new ArrayBuffer(7));
    charOut.setUint8(0, 0x04); // setTargetResistance
    charOut.setUint8(1, pct * 200);

    return writeToCharacteristic(this._gattDevice, 'fitness_machine', 'fitness_machine_control_point', charOut).then(() => {
      console.log("sent FTMS resistance command to " + this._gattDevice.device.name);
      return true;
    }).catch((failure) => {
      throw failure;
    });

  }
  
  hasPower(): boolean {
    return true;
  }
  hasCadence(): boolean {
    return this._hasSeenCadence;
  }
  hasHrm():boolean {
    return false;
  }
  _decodeFtmsControlPoint(dataView:DataView):any {
    // we're mainly just looking for the "control not permitted" response so we can re-request control
    console.log("decoding ftms control point");
    if(dataView.getUint8(0) === 0x80) {
      // this is a response
      if(dataView.getUint8(2) === 0x5) {
        // this says "control not permitted"
        const dvTakeControl:DataView = new DataView(new ArrayBuffer(1));
        dvTakeControl.setUint8(0, 0);
        return writeToCharacteristic(this._gattDevice, 'fitness_machine', 'fitness_machine_control_point', dvTakeControl).catch(() => {
          // oh well, try again I guess?
        });
      }
    }
  }
  _decodeIndoorBikeData(dataView:DataView) {

    const tmNow = new Date().getTime();
    const update:any = {};

    const flags = dataView.getUint16(0, true);
    
    const MORE_DATA = 1<<0;
    const AVERAGE_SPEED = 1<<1;
    const INSTANT_CADENCE = 1<<2;
    const AVERAGE_CADENCE = 1<<3;
    const TOTALDISTANCE = 1<<4;
    const RESISTANCELEVEL = 1<<5;
    const INSTANT_POWER = 1<<6;
    const AVERAGE_POWER = 1<<7;
    const EXPENDED_ENERGY = 1<<8;
    const HEART_RATE = 1<<9;
    
    let pos = 2;
    if(!(flags & MORE_DATA)) {
      const kph100 = dataView.getUint16(pos, true);
      pos += 2;

      update.lastSpeedKph = kph100 / 100;
    }
    if(flags & AVERAGE_SPEED) {
      pos += 2; // we don't care about this, so we'll just skip the bytes
    }

    if(flags & INSTANT_CADENCE) {
      const cadence2 = dataView.getUint16(pos, true);
      pos += 2;
      this._notifyNewCadence(tmNow, cadence2 / 2);
      this._hasSeenCadence = true;
    }
    

    if(flags & AVERAGE_CADENCE) {
      pos += 2;
    }

    if(flags & TOTALDISTANCE) {
      pos += 3;
    }

    if(flags & RESISTANCELEVEL) {
      pos += 2;
    }

    if(flags & INSTANT_POWER) {
      const power = dataView.getInt16(pos, true);
      pos += 2;
      this._notifyNewPower(tmNow, power);
    }

    if(flags & AVERAGE_POWER) {
      pos += 2;
    }


  }
  _decodeFitnessMachineStatus(value:DataView) {
  }
}


export class BluetoothCpsDevice extends BluetoothDeviceShared {
  updateSlope(tmNow: number, ftmsPct:number):Promise<boolean> {
    // powermeters don't have slope adjustment, dummy!
    return Promise.resolve(false);
  }
  public updateErg(tmNow: number, watts:number): Promise<boolean> {
    return Promise.resolve(false);
  }
  getDeviceTypeDescription():string {
    return "Bluetooth Powermeter";
  }
  async zeroOffset():Promise<void> {
    const gatt = this._gattDevice;
    if(gatt) {
      const dvZeroOffset:DataView = new DataView(new ArrayBuffer(1));
      dvZeroOffset.setUint8(0, 0x0c);
      let cancelMonitorControlPoint:FnCancel|null = null;
      try {

        const result = await new Promise<void>(async (resolve, reject) => {
          cancelMonitorControlPoint = await monitorCharacteristic(gatt, serviceUuids.cps, serviceUuids.cyclingPowerControlPoint, (evt:any) => {
            const buf = evt.target.value as DataView;
            console.log("Zero offset response: ", buf);
            if(buf && buf.byteLength >= 3) {
              // byte 0 is an opcode
              // byte 1 is the request opcode
              // byte 2 is the response value
              // byte 3 and 4 is apparently optional and is a residual Nm in 1/32Nm
              const responseOpCode = buf.getUint8(0);
              const requestOpCode = buf.getUint8(1);
              const responseValue = buf.getUint8(2);
              const residualNm = buf.getUint16(3, true);
              if(requestOpCode === 0x0c) {
                if(responseValue === 0x04) {
                  reject(new Error("Zero offset failed.  Crank calibration response code: " + responseValue.toString(16)));
                } else if(responseValue === 0x01) {
                  resolve();
                } else {
                  reject(new Error("Unknown response from crank: 0x" + responseValue.toString(16)));
                }
              }
            }
          });
          const written = await writeToCharacteristic(gatt, serviceUuids.cps, serviceUuids.cyclingPowerControlPoint, dvZeroOffset).catch(() => {
  
          })
          console.log("wrote to cps control point for zero offset");
        })
      } catch(e) {
        console.log("Failed to zero-offset your powermeter.  You may have success if you try again", e);
        alert("Failed to zero-offset your powermeter.  You may have success if you try again");
      } finally {
        if(cancelMonitorControlPoint) {
          cancelMonitorControlPoint();
        }
      }
    }
  }
  _hasSeenCadence: boolean = false;

  constructor(gattDevice:BluetoothRemoteGATTServer) {
    super(gattDevice);

    this._startupPromise = this._startupPromise.then(() => {
      // need to start up property monitoring for ftms

      return monitorCharacteristic(gattDevice, 'cycling_power', 'cycling_power_measurement', (evt:any) => this.onPowerMeasurementChanged(evt.target.value));
    })
  }

  onPowerMeasurementChanged(buf:DataView) {
    const tmNow = new Date().getTime();
    const flags = buf.getUint16(0);
    const power = buf.getInt16(2, true);

    console.log('power device sez ', power);
    this._notifyNewPower(tmNow, power);

  }
  updateResistance(tmNow:number, pct:number):Promise<boolean> {
    return Promise.resolve(false);
  }

  hasPower(): boolean {
    return true;
  }
  hasCadence(): boolean {
    return this._hasSeenCadence;
  }
  hasHrm():boolean {
    return false;
  }
}


export class BluetoothKickrDevice extends BluetoothCpsDevice {
  private static _singleton:BluetoothKickrDevice|null = null;
  public static getKickrDevice() {
    return BluetoothKickrDevice._singleton;
  }
  private _downhillValue = 0x3fff;
  private _uphillValue = 0x2000;
  private _lastSlopeSent = 0;

  _responsed:boolean = false;
  constructor(gattDevice:BluetoothRemoteGATTServer) {
    super(gattDevice);

    BluetoothKickrDevice._singleton = this;

    try {
      const dh = parseInt(window.localStorage.getItem('kickr-downhill-number') || '0x3fff');
      const uh = parseInt(window.localStorage.getItem('kickr-uphill-number') || '0x3fff');
      if(isFinite(dh) && isFinite(uh) &&
         dh >= 0 && dh <= 0x3fff &&
         uh >= 0 && uh <= 0x3fff &&
         dh > uh) {
        this._downhillValue = dh;
        this._uphillValue = uh;
        console.log("kickr inited to ", dh, uh);
      }
    } catch(e) {

    }

    this._startupPromise = this._startupPromise.then(() => {
      return monitorCharacteristic(gattDevice, 'cycling_power', serviceUuids.kickrWriteCharacteristic, (evt:any) => this._handleKickrResponse(evt.target.value));
    }).catch((failure) => {
      throw failure;
    })
  }
  getDeviceTypeDescription():string {
    return "Wahoo Kickr";
  }

  _handleKickrResponse(value:DataView) {
    this._responsed = true;
  }

  setUphillDownhill(downhillValue:number, uphillValue:number) {
    this._downhillValue = downhillValue;
    this._uphillValue = uphillValue;
  }

  _tmLastSlopeUpdate:number = 0;
  updateSlope(tmNow:number, ftmsPct:number):Promise<boolean> {
   // we're a kickr!  despite launching as the "open source" trainer, our protocol does
   // not appear to be public.  Therefore, I'm going to send hills as resistance levels
   // since I can't figure out how to reliably do the sim-mode commands.

    // this is not a trainer, but we don't want to force all the powermeters and hrms to implement this method.
    if(!this._slopeSource) {
      return Promise.resolve(false);
    }

    const dtMs = tmNow - this._tmLastSlopeUpdate;
    if(dtMs < 500) {
      return Promise.resolve(false); // don't update the ftms device too often
    }
    this._tmLastSlopeUpdate = tmNow;

    // from goobering around with nRF connect and trainerroad's "set resistance strength"
    // slider, it looks like the kickr's set resistance command looks like:
    // 6 bytes: [01 40 01 00 XX YY]
    // XX: LSB of a 16-bit uint
    // YY: MSB of a 16-bit uint
    // the uint goes from 0 (full resistance) to 3fff (no resistance), which is a little strange
    // but whatevs.

    const charOut = new DataView(new ArrayBuffer(3));
    charOut.setUint8(0, 0x40);

    const minSlope = -10;
    const maxSlope = 10; // if we ever peg the kickr at max slope, you basically can't turn the pedals
    let slopeInWholePercent = this._slopeSource.getLastSlopeInWholePercent() * ftmsPct;
    const slopeShiftRate = 0.5;

    // bounds!
    slopeInWholePercent = Math.min(slopeInWholePercent, maxSlope);
    slopeInWholePercent = Math.max(slopeInWholePercent, minSlope);

    slopeInWholePercent = Math.max(slopeInWholePercent, this._lastSlopeSent - slopeShiftRate);
    slopeInWholePercent = Math.min(slopeInWholePercent, this._lastSlopeSent + slopeShiftRate);
    
    this._lastSlopeSent = slopeInWholePercent;



    const offset = slopeInWholePercent - minSlope;
    const span = maxSlope - minSlope;
    const pctUphill = offset / span;

    let pctUphillClamped = Math.max(0, pctUphill);
    pctUphillClamped = Math.min(1, pctUphill);

    const resistanceAtDownhill = this._downhillValue;
    const resistanceAtUphill = this._uphillValue;

    assert2(pctUphillClamped >= 0 && pctUphillClamped <= 1);
    let uint16 = pctUphillClamped*resistanceAtUphill + (1-pctUphillClamped)*resistanceAtDownhill;
    uint16 = Math.max(this._uphillValue, uint16);
    uint16 = Math.min(this._downhillValue, uint16);

    const buf:Buffer = Buffer.alloc(2);
    buf.writeUInt16LE(uint16, 0);

    console.log("sending ", uint16, pctUphillClamped);
    charOut.setUint16(1, buf.readUInt16LE(0), true);

    return writeToCharacteristic(this._gattDevice, 'cycling_power', serviceUuids.kickrWriteCharacteristic, charOut).then(() => {
      return true;
    }).catch((failure) => {
      throw failure;
    });

  }

  _tmLastErgUpdate = 0;
  updateErg(tmNow:number, watts:number):Promise<boolean> {
    
    const dtMs = tmNow - this._tmLastErgUpdate;
    if(dtMs < 500) {
      return Promise.resolve(false); // don't update the ftms device too often
    }

    const charOut = new DataView(new ArrayBuffer(3));
    charOut.setUint8(0, 0x42); // setTargetPower
    charOut.setUint16(1, watts, true); // setTargetPower

    console.log("writing ", charOut.buffer, " to kickr");
    return writeToCharacteristic(this._gattDevice, 'cycling_power', serviceUuids.kickrWriteCharacteristic, charOut);
  }
  updateResistance(tmNow:number, pct:number):Promise<boolean> {

    const dtMs = tmNow - this._tmLastSlopeUpdate;
    if(dtMs < 500) {
      return Promise.resolve(false); // don't update the ftms device too often
    }

    this._tmLastSlopeUpdate = tmNow;

    console.log("kickr updating slope to ", pct);
    const charOut = new DataView(new ArrayBuffer(3));
    charOut.setUint8(0, 0x40);

    const pctUphill = pct;

    let pctUphillClamped = Math.max(0, pctUphill);
    pctUphillClamped = Math.min(1, pctUphill);

    const resistanceAtDownhill = 0x5f5b;
    const resistanceAtUphill = 0x185b;

    assert2(pctUphillClamped >= 0 && pctUphillClamped <= 1);
    const uint16 = pctUphillClamped*resistanceAtUphill + (1-pctUphillClamped)*resistanceAtDownhill;
    console.log("sending ", uint16, pctUphillClamped);
    charOut.setUint8(1, uint16 & 0xff);
    charOut.setUint8(2, (uint16>>8) & 0xff);

    return writeToCharacteristic(this._gattDevice, 'cycling_power', serviceUuids.kickrWriteCharacteristic, charOut).then(() => {
      return true;
    }).catch((failure) => {
      throw failure;
    });
  }
  
  hasCadence(): boolean {
    return false;
  }
  hasHrm():boolean {
    return false;
  }
}