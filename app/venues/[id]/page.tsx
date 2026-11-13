'use client';
import {useParams} from 'next/navigation';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,MapPin,Clock3,Check,CalendarDays,ChevronLeft,ChevronRight,Info} from 'lucide-react';
import {request,Venue,Court,Slot,money,hourLabel,localDate} from '../../../lib/api';
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
type Pick={courtId:number;hours:number[]};
export default function BookingPage(){
 const {id}=useParams<{id:string}>();
 const [venue,setVenue]=useState<Venue|null>(null),[courts,setCourts]=useState<Court[]>([]),[slots,setSlots]=useState<Slot[]>([]);
 const [date,setDate]=useState(localDate(today())),[offset,setOffset]=useState(0),[selection,setSelection]=useState<Pick|null>(null);
 const [err,setErr]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [proof,setProof]=useState<File|null>(null),[fullName,setFullName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [hold,setHold]=useState<{booking_id:number;guest_token:string;payment_deadline:string;total_amount:number;gcash_number:string|null;gcash_qr_url:string|null}|null>(null);
 const [seconds,setSeconds]=useState(0);
 const [receipt,setReceipt]=useState<{booking_id:number;total_amount:number}|null>(null);
 useEffect(()=>{if(!hold)return;const tick=()=>setSeconds(Math.max(0,Math.ceil((new Date(hold.payment_deadline).getTime()-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[hold]);

 useEffect(()=>{request<{venue:Venue;courts:Court[]}>(`/venues/${id}`).then(x=>{setVenue(x.venue);setCourts(x.courts)}).catch(e=>setErr(e.message)).finally(()=>setLoading(false))},[id]);
 useEffect(()=>{if(!venue)return;setSelection(null);request<{slots:Slot[]}>(`/availability?venue_id=${id}&date=${date}`).then(x=>setSlots(x.slots)).catch(e=>setErr(e.message))},[date,id,venue]);
 const dates=useMemo(()=>Array.from({length:7},(_,i)=>{const d=today();d.setDate(d.getDate()+offset+i);return d}),[offset]);
 const lookup=new Map(slots.map(s=>[`${s.court_id}-${s.hour}`,s]));
 const selectedCourt=courts.find(c=>c.id===selection?.courtId);
 const chosen=selection?.hours.slice().sort((a,b)=>a-b)??[];
 const total=chosen.reduce((n,h)=>n+(lookup.get(`${selection?.courtId}-${h}`)?.price||0),0);
 function toggle(c:Court,h:number){const s=lookup.get(`${c.id}-${h}`);if(s?.status!=='available')return;setErr('');setSelection(old=>{if(!old||old.courtId!==c.id)return{courtId:c.id,hours:[h]};const hours=old.hours.includes(h)?old.hours.filter(v=>v!==h):[...old.hours,h];return hours.length?{courtId:c.id,hours}:null})}
 async function reserve(){
  if(!selection||chosen.length===0)return;
  if(fullName.trim().length<2 || !email.includes('@') || phone.trim().length<7){setErr('Please enter your full name, email and contact number.');return;}
  setBusy(true);setErr('');
  try{
   const booking=await request<NonNullable<typeof hold>>('/bookings',{method:'POST',body:JSON.stringify({court_id:selection.courtId,booking_date:date,selected_hours:chosen,full_name:fullName.trim(),email:email.trim(),contact_number:phone.trim()})});
   setHold(booking);setProof(null);
   const availability=await request<{slots:Slot[]}>(`/availability?venue_id=${id}&date=${date}`);setSlots(availability.slots);
  }catch(e){setErr((e as Error).message)}finally{setBusy(false)}
 }
 async function submitProof(){
  if(!hold||!proof)return;
  if(seconds<=0){setErr('Payment window has expired. Please choose your hours again.');setHold(null);return;}
  setBusy(true);setErr('');
  try{
   const form=new FormData();form.append('guest_token',hold.guest_token);form.append('payment_screenshot',proof);
   const result=await request<{booking_id:number;total_amount:number}>(`/bookings/${hold.booking_id}/payment-proof`,{method:'POST',body:form});
   setReceipt(result);setHold(null);setSelection(null);setProof(null);
  }catch(e){setErr((e as Error).message)}finally{setBusy(false)}
 }
 async function closeHold(){
   const current=hold;setHold(null);setProof(null);
   if(current){await request(`/bookings/${current.booking_id}/abandon`,{method:'POST',body:JSON.stringify({guest_token:current.guest_token})}).catch(()=>{});}
   request<{slots:Slot[]}>(`/availability?venue_id=${id}&date=${date}`).then(x=>setSlots(x.slots)).catch(()=>{});
 }
 const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;

 return <main className="booking-page shell"><Link href="/venues" className="back"><ArrowLeft size={16}/> All courts</Link>
 {loading?<p>Loading court information...</p>:venue?<>
 <section className="venue-banner"><div><div className="eyebrow">BOOK YOUR NEXT MATCH</div><h1>{venue.name}</h1><div className="venue-meta"><span><MapPin size={16}/>{venue.address}</span><span>🏓 {courts.length} pickleball courts</span></div><p>{venue.description}</p></div><div className="banner-symbol">✳</div></section>
 {receipt&&<section className="success-box" role="status"><h2>Booking request submitted!</h2><p>Booking #{receipt.booking_id} · Total {money(receipt.total_amount)}. Your reservation is pending owner approval. Save your booking number for reference. GCash payment has not been automatically verified.</p><p>Contact the venue owner for confirmation.</p></section>}
 <section className="board-section"><div className="board-top"><div><span className="overline">PICK A DATE</span><h2>Choose your <em>play time.</em></h2></div><div className="legend"><span><i className="key green"/> Available</span><span><i className="key red"/> Booked</span><span><i className="key gray"/> Unavailable</span></div></div>
 <div className="date-picker"><button aria-label="Previous week" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-7))}><ChevronLeft/></button>{dates.map(d=><button key={localDate(d)} className={`day-button ${date===localDate(d)?'active':''}`} onClick={()=>setDate(localDate(d))}><small>{d.toLocaleDateString('en-US',{weekday:'short'})}</small><strong>{d.getDate()}</strong><small>{d.toLocaleDateString('en-US',{month:'short'})}</small></button>)}<button aria-label="Next week" onClick={()=>setOffset(offset+7)}><ChevronRight/></button></div>
 <div className="booking-toolbar"><div><strong>Booking board</strong><span>{new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</span></div><strong>{chosen.length} hour{chosen.length===1?'':'s'} selected</strong></div>
 <p className="board-help"><Info size={14}/> Select any available green hours on the same court, including nonconsecutive hours (for example, 3–4 PM and 6–7 PM). Click again to deselect. Switching courts starts a new selection.</p>
 <div className="board-scroll"><div className="board-grid" style={{gridTemplateColumns:`98px repeat(${courts.length},minmax(130px,1fr))`}}><div className="board-cell sticky-head head-time">TIME</div>{courts.map(c=><div key={c.id} className="board-cell court-head"><strong>{c.name}</strong><small>Pickleball</small></div>)}
 {Array.from({length:24},(_,i)=>i).flatMap(h=>[<div key={`time${h}`} className="board-cell time-cell">{hourLabel(h)}<small>{hourLabel(h+1)}</small></div>,...courts.map(c=>{const item=lookup.get(`${c.id}-${h}`);const selected=selection?.courtId===c.id&&chosen.includes(h);const available=item?.status==='available';return <button key={`${c.id}-${h}`} disabled={!available} onClick={()=>toggle(c,h)} aria-pressed={selected} className={`board-cell slot ${selected?'slot-selected':available?'slot-open':item?.status==='booked'?'slot-booked':'slot-closed'}`}>{selected?<><Check size={15}/> Selected</>:available?<><strong>{money(item.price)}</strong><small>Available</small></>:<small>{item?.status==='booked'?'Booked':item?.status==='blocked'?'Blocked':'Unavailable'}</small>}</button>})])}</div></div>
 </section>
 {selectedCourt&&chosen.length>0&&<aside className="checkout pv-checkout">
  <div className="pv-checkout-main"><span className="overline">YOUR SELECTED HOURS</span><h3>{selectedCourt.name} <span>· {chosen.length} hour{chosen.length===1?'':'s'}</span></h3>
   <p><CalendarDays size={15}/>{new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</p>
   <div className="selected-times">{chosen.map(h=><button key={h} onClick={()=>toggle(selectedCourt,h)} title="Remove hour"><Clock3 size={14}/>{hourLabel(h)} – {hourLabel(h+1)} ×</button>)}</div>
   <div className="guest-booking-fields"><h4>Guest booking · No account required</h4>
    <label className="pv-form-field"><span>Full name</span><input required autoComplete="name" placeholder="Your full name" value={fullName} onChange={e=>setFullName(e.target.value)} maxLength={150}/></label>
    <label className="pv-form-field"><span>Contact number</span><input required type="tel" autoComplete="tel" placeholder="09XXXXXXXXX" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={32}/></label>
    <label className="pv-form-field"><span>Email address</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} maxLength={190}/></label>
    <small>Click Request booking to temporarily hold your selected time slots. Then scan the venue's GCash QR and upload your payment screenshot within 5 minutes.</small>
   </div>
  </div><div className="checkout-right"><span>Total <strong>{money(total)}</strong></span><button className="btn btn-lime" disabled={busy||!!hold} onClick={reserve}>{busy?'Preparing...':'Request booking →'}</button></div>
 </aside>}
 {hold&&<div className="pv-payment-backdrop" role="presentation"><section className="pv-payment-modal" role="dialog" aria-modal="true" aria-labelledby="pv-pay-title">
  <div className="pv-payment-header"><div><span className="overline">COMPLETE YOUR PAYMENT</span><h2 id="pv-pay-title">Pay via GCash</h2><p>Booking #{hold.booking_id} · {venue.name}</p></div><button type="button" onClick={()=>void closeHold()} aria-label="Cancel this reservation">✕</button></div>
  <div className="pv-hold-warning"><strong>{seconds>0?clock:'00:00'}</strong><span>{seconds>0?'Time remaining to upload your screenshot':'Payment window expired'}</span></div>
  <p className="pv-payment-alert">Your booking request will be <strong>automatically disregarded</strong> if a valid payment screenshot isn't uploaded before the timer expires. Your selected court slots will then be released.</p>
  <div className="pv-payment-details"><div><span className="pv-subhead">SEND PAYMENT TO</span><strong>GCash</strong>{hold.gcash_number&&<div className="pv-gcash-number">{hold.gcash_number}</div>}{hold.gcash_number&&<button type="button" className="btn btn-outline small" onClick={()=>void navigator.clipboard.writeText(hold.gcash_number!)}>Copy number</button>}<p>Amount to pay</p><div className="pv-pay-total">{money(hold.total_amount)}</div></div>
   {hold.gcash_qr_url&&<div className="pv-qr"><img src={hold.gcash_qr_url} alt={`GCash payment QR for ${venue.name}`}/><small>Scan using GCash</small></div>}
  </div>
  <label className="pv-modal-upload"><strong>Upload your GCash payment screenshot</strong><span>Include the GCash transaction reference in your screenshot. No separate reference field needed.</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||seconds<=0} onChange={e=>{const file=e.target.files?.[0]??null;if(file&&(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){setErr('Choose a JPG, PNG or WebP up to 5 MB');setProof(null);return}setProof(file);setErr('')}}/>{proof&&<small>Selected: {proof.name}</small>}</label>
  {err&&<p className="pv-payment-error" role="alert">{err}</p>}
  <div className="pv-payment-actions"><button type="button" className="btn btn-outline" onClick={()=>void closeHold()}>Cancel request</button><button type="button" className="btn btn-lime" disabled={!proof||busy||seconds<=0} onClick={()=>void submitProof()}>{busy?'Uploading...':'Submit proof & finish booking'}</button></div>
  {seconds<=0&&<button className="btn btn-outline" onClick={()=>void closeHold()}>Choose new time slots</button>}
 </section></div>}

 {err&&<div className="form-error">{err}</div>}<p className="after-board">Your reservation is pending owner approval only after you upload payment proof. GCash payments are verified manually.</p>
 </>:<div className="form-error">{err||'Venue not found'}</div>}</main>
}
