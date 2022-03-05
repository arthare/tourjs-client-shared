
function getApiRoot() {
  switch(window.location.hostname) {
    case 'localhost':
    case 'dev.tourjs.ca':
      return 'http://localhost:8081';
    default:
      return 'https://tourjs.ca/tourjs-api'
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
