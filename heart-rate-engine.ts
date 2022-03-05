import { User, UserInterface } from "../tourjs-shared/User";

export class HeartRateEngine {

  lastBpm:number;


  constructor(firstBpm:number) {
    this.lastBpm = firstBpm;
  }

  tick(user:UserInterface, tmNow:number, dt:number, targetBpm:number, targetHandicap:number, gainFactorZeroToOne:number):{newTargetHandicap:number} {

    if(user) {
      const lastBpm = user.getLastHrm(tmNow);
      const lastWatts = user.getLastPower();
      this.lastBpm = lastBpm;

      const gainFactor = gainFactorZeroToOne;

      if(lastBpm > 0 && lastWatts > 0) {
        // ok, so we know their lastBpm (in lastBpm), and we know their targetBpm (in targetBpm).
        // we probably need to adjust targetErg up or down based on the delta

        let error = targetBpm - lastBpm;
        let handicapsPerSecToAdjust = 0;
        if(error > 0) {
          // we're too low, heartrate wise, so we need to gradually increase the difficulty

          // clamp it to a max of 10bpm error - this way when you initially get on the bike with a HR of 60 it doesn't shoot way the hell up
          error = Math.min(10, error);
          handicapsPerSecToAdjust = gainFactor*0.025*(Math.min(10, error));
        } else {
          // we're too high.  bring things down fairly quickly.
          handicapsPerSecToAdjust = gainFactor*0.065*(error);
        }
  
        let newTargetHandicap = targetHandicap + handicapsPerSecToAdjust*dt;
        return {newTargetHandicap};
      } else {
        return {newTargetHandicap: targetHandicap};
      }
    } else {
      return {newTargetHandicap: 0};
    }

  }

}