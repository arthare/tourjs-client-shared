import { ConnectedDeviceInterface, BTDeviceState, PowerDataDistributor, BluetoothFtmsDevice, BluetoothCpsDevice, BluetoothKickrDevice, BluetoothDeviceShared } from "./WebBluetoothDevice";
import { getFtms, monitorCharacteristic, writeToCharacteristic, getCps, getKickrService, serviceUuids, deviceUtilsNotifyConnect, getHrm } from "./DeviceUtils";

type BluetoothRemoteGATTCharacteristic = any;
type BluetoothRemoteGATTServer = any;

export interface DeviceFactory {
    findPowermeter():Promise<ConnectedDeviceInterface>;
    findHrm():Promise<ConnectedDeviceInterface>;
    findDisplay():Promise<BluetoothRemoteGATTCharacteristic>;
}

export class TestPowermeter extends PowerDataDistributor {
    _interval:any = null;

    constructor() {
        super();
        this._interval = setInterval(() => {
            const tmNow = new Date().getTime();
            this._notifyNewPower(tmNow, Math.random() * 50 + 200);
        }, 500);
    }

    getDeviceTypeDescription():string {
      return "Fake Device";
    }
    disconnect(): Promise<void> {
        clearInterval(this._interval);
        this._interval = null;
        return Promise.resolve();
    }
    getState(): BTDeviceState {
        return BTDeviceState.Ok;
    }
    name(): string {
        return "Test Powermeter";
    }
    hasPower(): boolean {
        return true;
    }
    hasCadence(): boolean {
        return false;
    }
    hasHrm(): boolean {
        return false;
    }
    updateSlope(tmNow:number, ftmsPct:number): Promise<boolean> {
      return Promise.resolve(false);
    }
    updateErg(tmNow: number, watts:number): Promise<boolean> {
      return Promise.resolve(false);
    }
    getDeviceId(): string {
      throw new Error("Method not implemented.");
    }
    updateResistance(tmNow: number, pct: number): Promise<boolean> {
      throw new Error("Method not implemented.");
    }
}

class BluetoothHrmDevice extends BluetoothDeviceShared {

  constructor(gattDevice:BluetoothRemoteGATTServer) {
    super(gattDevice);
    
    this._startupPromise = this._startupPromise.then(() => {
      // need to start up property monitoring for ftms

      const fnHrmData = (evt:any) => { this._decodeHrmData(evt.target.value)};
      return monitorCharacteristic(gattDevice, 'heart_rate', 'heart_rate_measurement', fnHrmData);
    })
  }
  _decodeHrmData(dataView:DataView) {
    const tmNow = new Date().getTime();
    const flags = dataView.getUint8(0);
    let hr = 0;
    if((flags & 1) === 0) {
      // this is a uint8 hrm
      hr = dataView.getUint8(1);
    } else {
      // this is a uint16 hrm
      hr = dataView.getUint16(1, true);
    }

    this._notifyNewHrm(tmNow, hr);
  }


  public hasPower(): boolean { return false;}
  public hasCadence(): boolean { return false;}
  public hasHrm(): boolean {return true;}
  
  public getDeviceTypeDescription():string {
    return "Bluetooth HRM";
  }

  public updateErg(tmNow: number, watts:number): Promise<boolean> {
    return Promise.resolve(false);
  }
  public updateSlope(tmNow:number, ftmsPct:number):Promise<boolean> {
    return Promise.resolve(false);
  }
  public updateResistance(tmNow:number, pct:number):Promise<boolean> {
    return Promise.resolve(false);
  }
}

class TestDeviceFactory implements DeviceFactory {
    async findDisplay():Promise<BluetoothRemoteGATTCharacteristic> {
      this._checkAvailable();

      const filters = {
        filters: [
          {services: [serviceUuids.display4iiii]}
        ]
      }

      const device = await  navigator.bluetooth.requestDevice(filters);
      if(device.gatt) {
        const gattServer = await device.gatt.connect();
        const displayService = await gattServer.getPrimaryService(serviceUuids.display4iiii);
        const displayCp = await displayService.getCharacteristic(serviceUuids.display4iiiiControlPoint);

        return displayCp;
      } else {
        throw new Error("No device gatt?");
      }
    }
    async findPowermeter(byPlugin?:boolean):Promise<ConnectedDeviceInterface>{

      this._checkAvailable();
        
      const filters = {
        filters: [
          {services: ['cycling_power']},
          {services: ['fitness_machine', 'cycling_power']},
          {services: [serviceUuids.kickrService, 'cycling_power']},
        ]
      }
      return navigator.bluetooth.requestDevice(filters).then((device) => {
        if(device.gatt) {
          return device.gatt.connect();
        } else {
          throw new Error("No device gatt?");
        }
      }).then((gattServer) => {
        deviceUtilsNotifyConnect();
        return gattServer.getPrimaryServices().then((services) => {
          const ftms = getFtms(services);
          const cps = getCps(services);
          const kickr = getKickrService(services);

          if(ftms) {
            return new BluetoothFtmsDevice(gattServer);
          } else if(kickr) {
            return new BluetoothKickrDevice(gattServer);
          } else if(cps) {
            return new BluetoothCpsDevice(gattServer);
          } else {
            throw new Error("We don't recognize what kind of device this is");
          }
        })
      });
    }
    async findHrm(): Promise<ConnectedDeviceInterface> {
      this._checkAvailable();
        
      const filters = {
        filters: [
          {services: ['heart_rate']},
        ]
      }
      return navigator.bluetooth.requestDevice(filters).then((device) => {
        if(device.gatt) {
          return device.gatt.connect();
        } else {
          throw new Error("No device gatt?");
        }
      }).then((gattServer) => {
        deviceUtilsNotifyConnect();
        return gattServer.getPrimaryServices().then((services) => {
          const hrm = getHrm(services);

          if(hrm) {
            return new BluetoothHrmDevice(gattServer);
          } else {
            throw new Error("We don't recognize what kind of device this is");
          }
        })
      });
    }

    
    async _checkAvailable() {
      if(window.location.search.includes('fake') || window.location.hostname === 'localhost') {
        return;
      }
      const available = await navigator.bluetooth.getAvailability();
      if(!available) {
        const msg = "It looks like your browser/OS combo doesn't support BLE in the browser.\n\nOr your bluetooth is disabled.\n\nTourJS is best enjoyed on a Mac with Chrome or Android phone with Chrome.  If it asks for location services, allow them.  If none of that works, try a paid service like Zwift.";
        alert(msg);
        throw msg;
      }
    }
}

const g_deviceFactory:DeviceFactory = new TestDeviceFactory();
export function getDeviceFactory():DeviceFactory {
    return g_deviceFactory;
}