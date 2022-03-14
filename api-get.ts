import { Auth0ContextInterface, User as Auth0User } from "@auth0/auth0-react";

function getApiRoot() {
  switch(window.location.hostname) {
    case 'localhost':
    case 'dev.tourjs.ca':
      return 'http://localhost:8081/';
    default:
      return 'https://tourjs.ca/tourjs-api/'
  }
}

export function apiPost(endPoint:string, data?:any):Promise<any> {
  const apiRoot:string = getApiRoot();
  return apiPostInternal(apiRoot, endPoint, data);
}

export function apiGet(endPoint:string, data?:any):Promise<any> {
  const apiRoot:string = getApiRoot();
  return apiGetInternal(apiRoot, endPoint, data);
}

export function apiGetInternal(apiRoot:string, endPoint:string, data?:any) {
  const slash = endPoint[0] === '/' || apiRoot[apiRoot.length - 1] === '/' ? '' : '/';

  let queries = '?';
  for(var key in data) {
    queries += key + '=' + encodeURIComponent(data[key]) + '&';
  }

  return fetch(apiRoot + slash + endPoint + queries, {
    method: 'GET',
  }).then((response) => {
    return response.json();
  })
}

export function apiPostInternal(apiRoot:string, endPoint:string, data?:any):Promise<any> {
  const slash = endPoint[0] === '/' || apiRoot[apiRoot.length - 1] === '/' ? '' : '/';
  const final = apiRoot + slash + endPoint;
  console.log("posting to ", final);
  return fetch(final, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: data && JSON.stringify(data),
  }).then((response) => {
    return response.json();
  })
}


export async function secureApiGet(endpoint:string, auth0:Auth0ContextInterface<Auth0User>, data:any) {
  const urlBase = getApiRoot();
  try {
    let query = [];

    if(data) {
      for(var key in data) {
        query.push(`${key}=${encodeURIComponent(JSON.stringify(data[key]))}`);
      }
    }

    const accessToken = await auth0.getAccessTokenSilently({
      audience: 'https://tourjs.ca/',
      scope: "read",
    });

    return fetch(urlBase + endpoint + '?' + query.join('&'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    }).then((result) => {
      if(!result.ok) {
        return result.json().then((json) => {
          throw json;
        }, (failureAgain) => {
          throw result.statusText;
        })
      }
      return result.json();
    }).catch((failure) => {
      throw failure;
    })

  } catch(e) {
    return Promise.reject(e);
  }
}

export async function secureApiPost(endpoint:string, auth0:Auth0ContextInterface<Auth0User>, data:any) {
  const urlBase = getApiRoot();
  try {


    const accessToken = await auth0.getAccessTokenSilently({
      audience: 'https://tourjs.ca/',
      scope: "read",
    });

    return fetch(urlBase + endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: data && JSON.stringify(data),
    }).then((result) => {
      if(!result.ok) {
        return result.json().then((json) => {
          throw json;
        }, (failureAgain) => {
          throw result.statusText;
        })
      }
      return result.json();
    }).catch((failure) => {
      throw failure;
    })

  } catch(e) {
    return Promise.reject(e);
  }
}