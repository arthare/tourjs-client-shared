
import { apiGet } from 'bt-web2/set-up-ride/route';
import { TourJsAccount } from '../../../api/tourjs-shared/signin-types';

import auth0 from 'npm:auth0-js';


export interface SignInResult {
  signedIn:boolean;
  account?:TourJsAccount;
  auth0?:any;
}


export class TourJsSignin {
  constructor() {
    // <Auth0Provider domain="dev-enlwsasz.us.auth0.com" clientId="sVfg9SlUyknsFxwh74CDlseT0aL7iWS8" redirectUri={window.location.origin}>
  }

  async isSignedIn(auth0:any):Promise<SignInResult> {
    const signedIn = await auth0.isAuthenticated();
    if(signedIn) {
      // let's get client details
      const deets = await auth0.getUser();
      if(deets?.sub) {
        const account = await this._getAccount(deets.sub);
        return {
          signedIn,
          account,
          auth0: deets,
        }
      } else {
        throw new Error(`No sub found for your auth0 user`);
      }

    } else {
      return {
        signedIn,
      }
    }
  }



  //////////////////////////////////
  // private stuff
  //////////////////////////////////
  private async _getAccount(sub:string):Promise<TourJsAccount> {
    return apiGet('user-account', {sub}) as Promise<TourJsAccount>;
  }
}