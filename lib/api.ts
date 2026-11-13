// Same-origin Next.js proxy. The private key never reaches the browser.
export const API = '/api/backend';
export type User={id:number;name:string;email:string;role:'player'|'owner';phone?:string};
export type Venue={id:number;name:string;city:string;address:string;description:string;image_url:string|null;gcash_number?:string|null;gcash_qr_url?:string|null;court_count:number;price_from:number;owner_id?:number;phone?:string};
export type Court={id:number;name:string;day_rate:number;night_rate:number;open_hour:number;close_hour:number};
export type Slot={court_id:number;hour:number;price:number;status:'available'|'booked'|'blocked'|'closed'};
export type Booking={id:number;venue_name:string;court_name:string;booking_date:string;start_hour:number;duration:number;total_amount:number;status:string;payment_reference:string|null;created_at:string;selected_hours?:string|null};
export async function request<T>(path:string,options:RequestInit={}):Promise<T>{
  const token=typeof window!=='undefined'?localStorage.getItem('pv_token'):null;
  const r=await fetch(`${API}${path}`,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{}) ,...options.headers},cache:'no-store'});
  const raw=await r.text();let result:any;
  try{result=raw?JSON.parse(raw):null}catch{console.error('PiklVenue API non-JSON response',{url:r.url,status:r.status,preview:raw.slice(0,250)});throw new Error(`Invalid server response (HTTP ${r.status})`)}
  if(!r.ok)throw new Error(result?.error||`Request failed (HTTP ${r.status})`);
  return result as T;
}
export const money=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(n);
export const localDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const hourLabel=(h:number)=>`${h%12||12}:00 ${h<12?'AM':'PM'}`;
