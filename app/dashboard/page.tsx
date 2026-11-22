'use client';import {FormEvent,useEffect,useId,useState} from 'react';import {useRouter} from 'next/navigation';import Link from 'next/link';import OwnerScheduleTools from './OwnerScheduleTools';import OwnerDiscountCodes from './OwnerDiscountCodes'; import {CalendarDays,Plus,LogOut,MapPin,CheckCircle2,XCircle,Trash2} from 'lucide-react';import {request,User,Booking,Venue,Court,money,hourLabel,localDate,isCourtLive} from '../../lib/api';
const formatBookingHours=(b:Booking)=>b.selected_hours?b.selected_hours.split(',').map(h=>`${hourLabel(Number(h))}–${hourLabel(Number(h)+1)}`).join(', '):`${hourLabel(Number(b.start_hour))} · ${b.duration} hr`;
type OwnerBooking = Booking & {
  player_name: string;
  player_phone: string;
  player_email: string;
  venue_id: number;
  payment_screenshot?: string | null;
  booking_source?: 'online' | 'walkin';
};
type BlockedSlot={id:number;court_id:number;booking_date:string;hour:number};
type ManagedCourt = Court & {
  is_active: number | boolean;
};
type ManagedVenue = Venue & {
  is_active: number | boolean;
};
const emptyCourtForm = {
  name: 'Court 1',
  day_rate: 150,
  night_rate: 250,
  open_hour: 8,
  close_hour: 23,
  terms_and_conditions: '',
  facebook_live_url: '',
  facebook_live_active: false,
};

function CourtFacebookLiveField({ url, isLive, onUrlChange, onLiveChange }: {
  url: string;
  isLive: boolean;
  onUrlChange: (url: string) => void;
  onLiveChange: (isLive: boolean) => void;
}) {
  const helpId = useId();
  return (
    <div className="court-facebook-field">
      <label>
        Facebook Live link (optional)
        <input
          type="url"
          maxLength={1000}
          aria-describedby={helpId}
          value={url}
          onChange={event => onUrlChange(event.target.value)}
          placeholder="https://www.facebook.com/your-page/videos/123456789"
        />
        <small id={helpId}>Use the full public video link for in-page playback.</small>
      </label>
      <label className="court-live-toggle">
        <input
          type="checkbox"
          checked={isLive}
          disabled={!url.trim()}
          onChange={event => onLiveChange(event.target.checked)}
        />
        Mark court as live now
      </label>
      <small>Uncheck this and save when the broadcast ends. The video link stays saved.</small>
    </div>
  );
}

function CourtTermsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Terms and conditions (optional)
      <textarea
        className="court-terms-input"
        rows={5}
        maxLength={4000}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="For example, cancellation rules or court etiquette"
      />
    </label>
  );
}

function VenueImageUpload({value,onChange,label='Venue photo'}:{value:string;onChange:(url:string)=>void;label?:string}) {
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState('');
  async function upload(file:File) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setUploadError('Use JPG, PNG or WebP');return;}
    if(file.size>5*1024*1024){setUploadError('Maximum image size is 5 MB');return;}
    setUploading(true);setUploadError('');
    try {
      const form=new FormData();form.append('image',file);
      const token=localStorage.getItem('pv_token');
      const response=await fetch('/api/backend/owner/upload-image',{
        method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:form
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Upload failed');
      onChange(result.image_url);
    }catch(e){setUploadError((e as Error).message)}finally{setUploading(false)}
  }
  return <div className="venue-image-uploader">
    <label>{label} (JPG, PNG or WebP, max 5 MB)
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
        onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value='';}}/>
    </label>
    {uploading&&<p>Uploading image…</p>}
    {uploadError&&<p role="alert" className="form-error">{uploadError}</p>}
    {value&&<div><img src={value} alt="Venue preview" style={{maxWidth:260,maxHeight:170,objectFit:'cover',borderRadius:12}}/>
      <button type="button" className="btn btn-outline small" onClick={()=>onChange('')}>Remove image</button></div>}
  </div>;
}

export default function Dashboard(){const router=useRouter();const[user,setUser]=useState<User|null>(null),[bookings,setBookings]=useState<Booking[]>([]),[ownerBookings,setOwnerBookings]=useState<OwnerBooking[]>([]),[venues,setVenues]=useState<ManagedVenue[]>([]),[selectedVenue,setSelectedVenue]=useState<number|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[showVenue,setShowVenue]=useState(false),[showCourt,setShowCourt]=useState(false);const [proofImage,setProofImage]=useState<string|null>(null);const [proofBusy,setProofBusy]=useState(false);const [managedCourts,setManagedCourts]=useState<ManagedCourt[]>([]),[editingCourt,setEditingCourt]=useState<number|null>(null),[editingVenue,setEditingVenue]=useState(false);const [blockCourt,setBlockCourt]=useState<number|null>(null),[blockDate,setBlockDate]=useState(localDate(new Date())),[blockHour,setBlockHour]=useState(8),[blockedSlots,setBlockedSlots]=useState<BlockedSlot[]>([]);const [venueForm,setVenueForm]=useState({name:'',city:'',address:'',description:'',phone:'',image_url:'',gcash_number:'',gcash_qr_url:''}),[courtForm,setCourtForm]=useState(emptyCourtForm);function refresh(u:User){if(u.role==='player')request<{bookings:Booking[]}>('/bookings').then(x=>setBookings(x.bookings)).catch(e=>setError(e.message));else {request<{venues:ManagedVenue[];bookings:OwnerBooking[]}>('/owner/dashboard').then(x=>{setVenues(x.venues);setOwnerBookings(x.bookings);if(x.venues.length)setSelectedVenue(old=>old??x.venues[0].id)}).catch(e=>setError(e.message))}}useEffect(()=>{let u:User|null=null;try{u=JSON.parse(localStorage.getItem('pv_user')||'null')}catch{}if(!u){router.replace('/login');return}setUser(u);refresh(u)},[router]);useEffect(()=>{if(!selectedVenue)return;request<{courts:ManagedCourt[]}>(`/owner/courts?venue_id=${selectedVenue}`).then(x=>setManagedCourts(x.courts)).catch(e=>setError(e.message));setEditingCourt(null);setEditingVenue(false);setShowCourt(false)},[selectedVenue]);function logout(){localStorage.removeItem('pv_token');localStorage.removeItem('pv_user');window.dispatchEvent(new Event('pv_auth'));router.push('/')}async function createVenue(e:FormEvent){e.preventDefault();setError('');try{await request('/owner/venues',{method:'POST',body:JSON.stringify(venueForm)});setShowVenue(false);setMessage('Venue created. Add a court to make it bookable.');refresh(user!)}catch(e){setError((e as Error).message)}}async function saveVenue(e:FormEvent){e.preventDefault();setError('');try{await request(`/owner/venues/${selectedVenue}`,{method:'PUT',body:JSON.stringify(venueForm)});setEditingVenue(false);setMessage('Venue details updated.');refresh(user!)}catch(e){setError((e as Error).message)}}
async function saveCourt(e: FormEvent) {
  e.preventDefault();
  setMessage('');
  setError('');
  const { terms_and_conditions, facebook_live_url, facebook_live_active, ...details } = courtForm;
  const terms = terms_and_conditions.trim();
  const liveUrl = facebook_live_url.trim();
  const previousCourt = managedCourts.find(court => court.id === editingCourt);
  const termsChanged = terms !== (previousCourt?.terms_and_conditions ?? '');
  const liveUrlChanged = liveUrl !== (previousCourt?.facebook_live_url ?? '');
  const liveStatusChanged = facebook_live_active !== isCourtLive(previousCourt);

  try {
    await request(`/owner/courts/${editingCourt}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...details,
        ...(termsChanged ? { terms_and_conditions: terms || null } : {}),
        ...(liveUrlChanged ? { facebook_live_url: liveUrl || null } : {}),
        ...(liveStatusChanged || liveUrlChanged ? { facebook_live_active } : {}),
      }),
    });
    const { courts } = await request<{ courts: ManagedCourt[] }>(`/owner/courts?venue_id=${selectedVenue}`);
    setManagedCourts(courts);
    refresh(user!);

    const updatedCourt = courts.find(court => court.id === editingCourt);
    if (liveUrlChanged && updatedCourt?.facebook_live_url !== (liveUrl || null)) {
      setError('Court details were updated, but the Facebook Live link could not be verified.');
      return;
    }
    if ((liveStatusChanged || liveUrlChanged) && isCourtLive(updatedCourt) !== facebook_live_active) {
      setError('Court details were updated, but the live status could not be verified.');
      return;
    }
    if (termsChanged && (!updatedCourt || (updatedCourt.terms_and_conditions ?? '') !== terms)) {
      setError('Court details were updated, but the terms and conditions could not be verified.');
      return;
    }

    setEditingCourt(null);
    setMessage('Court details updated.');
  } catch (error) {
    setError((error as Error).message);
  }
}

async function toggleCourtVisibility(court: ManagedCourt) {
  const currentlyActive = Number(court.is_active) === 1;

  const confirmed = window.confirm(
    currentlyActive
      ? `Hide "${court.name}" from public bookings?\n\nExisting reservations will be preserved, but players will no longer be able to make new bookings on this court.`
      : `Restore "${court.name}" and allow public bookings again?`
  );

  if (!confirmed) return;

  setError('');
  setMessage('');

  try {
    await request(
      `/owner/courts/${court.id}/visibility`,
      {
        method: 'POST',
        body: JSON.stringify({
          is_active: !currentlyActive,
        }),
      }
    );

    setMessage(
      currentlyActive
        ? `${court.name} is now hidden from public bookings.`
        : `${court.name} is now publicly available.`
    );

    const result = await request<{
      courts: ManagedCourt[];
    }>(
      `/owner/courts?venue_id=${selectedVenue}`
    );

    setManagedCourts(result.courts);

    if (user) {
      refresh(user);
    }

  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to update court visibility'
    );
  }
}

async function deleteCourt(c:Court){if(!confirm(`Delete ${c.name}? Courts with booking history cannot be deleted.`))return;setError('');try{await request(`/owner/courts/${c.id}`,{method:'DELETE'});setMessage('Court deleted.');if(blockCourt===c.id)setBlockCourt(null);const x=await request<{courts:ManagedCourt[]}>(`/owner/courts?venue_id=${selectedVenue}`);setManagedCourts(x.courts);refresh(user!)}catch(e){setError((e as Error).message)}}
async function deleteVenue(){const v=venues.find(x=>x.id===selectedVenue);if(!v||!confirm(`Delete ${v.name}? Remove its courts first.`))return;setError('');try{await request(`/owner/venues/${v.id}`,{method:'DELETE'});setSelectedVenue(null);setManagedCourts([]);setBlockCourt(null);setMessage('Venue deleted.');refresh(user!)}catch(e){setError((e as Error).message)}}

async function toggleVenueVisibility() {
  const venue = venues.find(v => v.id === selectedVenue);

  if (!venue) return;

  const currentlyActive = Number(venue.is_active) === 1;

  const confirmed = window.confirm(
    currentlyActive
      ? `Hide "${venue.name}"?\n\nIt will disappear from public listings and new online bookings will be disabled. Existing reservations will be preserved.`
      : `Restore "${venue.name}" to public listings?`
  );

  if (!confirmed) return;

  setError('');
  setMessage('');

  try {
    await request(
      `/owner/venues/${venue.id}/visibility`,
      {
        method: 'POST',
        body: JSON.stringify({
          is_active: !currentlyActive
        })
      }
    );

    setMessage(
      currentlyActive
        ? 'Venue hidden successfully.'
        : 'Venue restored successfully.'
    );

    if (user) {
      refresh(user);
    }
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to update venue visibility'
    );
  }
}

async function loadBlocks(courtId:number,date:string){try{const r=await request<{blocked_slots:BlockedSlot[]}>(`/owner/blocked-slots?court_id=${courtId}&date=${date}`);setBlockedSlots(r.blocked_slots)}catch(e){setError((e as Error).message)}}
async function blockSlot(e:FormEvent){e.preventDefault();if(!blockCourt)return;setError('');try{await request('/owner/blocked-slots',{method:'POST',body:JSON.stringify({court_id:blockCourt,booking_date:blockDate,hour:blockHour})});await loadBlocks(blockCourt,blockDate);setMessage('Hour blocked.');}catch(e){setError((e as Error).message)}}
async function unblockSlot(id:number){if(!blockCourt||!confirm('Make this hour available for booking again?'))return;setError('');try{await request(`/owner/blocked-slots/${id}`,{method:'DELETE'});await loadBlocks(blockCourt,blockDate);setMessage('Hour unblocked.')}catch(e){setError((e as Error).message)}}
function startEditVenue(){const v=venues.find(x=>x.id===selectedVenue);if(!v)return;setVenueForm({name:v.name,city:v.city,address:v.address,description:v.description||'',phone:v.phone||'',image_url:v.image_url||'',gcash_number:v.gcash_number||'',gcash_qr_url:v.gcash_qr_url||''});setEditingVenue(true);setShowVenue(false)}
function updateCourtLiveUrl(url: string) {
  setCourtForm(current => ({
    ...current,
    facebook_live_url: url,
    facebook_live_active: Boolean(url.trim()) && current.facebook_live_active,
  }));
}
function startEditCourt(court: ManagedCourt) {
  setCourtForm({
    name: court.name,
    day_rate: Number(court.day_rate),
    night_rate: Number(court.night_rate),
    open_hour: Number(court.open_hour),
    close_hour: Number(court.close_hour),
    terms_and_conditions: court.terms_and_conditions ?? '',
    facebook_live_url: court.facebook_live_url ?? '',
    facebook_live_active: isCourtLive(court),
  });
  setEditingCourt(court.id);
  setShowCourt(false);
}
async function showPaymentProof(id:number){setError('');setProofBusy(true);try{const token=localStorage.getItem('pv_token');const r=await fetch(`/api/backend/owner/bookings/${id}/payment-proof`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:'no-store'});if(!r.ok){const message=await r.json().catch(()=>({error:'Could not load screenshot'}));throw new Error(message.error||'Could not load screenshot')}const blob=await r.blob();if(!blob.type.startsWith('image/'))throw new Error('Invalid proof image');setProofImage(old=>{if(old)URL.revokeObjectURL(old);return URL.createObjectURL(blob)});}catch(e){setError((e as Error).message)}finally{setProofBusy(false)}}
async function createCourt(e: FormEvent) {
  e.preventDefault();
  setMessage('');
  setError('');
  const { terms_and_conditions, facebook_live_url, facebook_live_active, ...details } = courtForm;
  const terms = terms_and_conditions.trim();
  const liveUrl = facebook_live_url.trim();
  try {
    const { id } = await request<{ id: number }>('/owner/courts', {
      method: 'POST',
      body: JSON.stringify({
        ...details,
        venue_id: selectedVenue,
        ...(terms ? { terms_and_conditions: terms } : {}),
        ...(liveUrl ? { facebook_live_url: liveUrl } : {}),
        ...(facebook_live_active ? { facebook_live_active } : {}),
      }),
    });
    setShowCourt(false);
    const { courts } = await request<{ courts: ManagedCourt[] }>(`/owner/courts?venue_id=${selectedVenue}`);
    setManagedCourts(courts);
    refresh(user!);

    const createdCourt = courts.find(court => court.id === id);
    if (liveUrl && createdCourt?.facebook_live_url !== liveUrl) {
      setError('Court added. The server did not return its Facebook Live link.');
      return;
    }
    if (facebook_live_active && !isCourtLive(createdCourt)) {
      setError('Court added. The server did not return its live status.');
      return;
    }
    if (terms && createdCourt?.terms_and_conditions !== terms) {
      setError('Court added. The server did not return its terms and conditions.');
      return;
    }

    setMessage('Court added successfully.');
  } catch (error) {
    setError((error as Error).message);
  }
}
async function status(id:number,action:'approve'|'reject'|'cancel'){setError('');try{await request(`/owner/bookings/${id}/${action}`,{method:'POST'});setMessage('Reservation updated.');refresh(user!)}catch(e){setError((e as Error).message)}}async function cancelPlayer(id:number){if(!confirm('Cancel this reservation?'))return;try{await request(`/bookings/${id}/cancel`,{method:'POST'});refresh(user!)}catch(e){setError((e as Error).message)}}return <main className="shell dashboard">{proofImage&&<div role="dialog" aria-label="GCash payment screenshot" style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',padding:16}}><button className="btn btn-lime" onClick={()=>{URL.revokeObjectURL(proofImage);setProofImage(null)}}>Close screenshot</button><img src={proofImage} alt="GCash payment proof" style={{maxWidth:'90vw',maxHeight:'80vh',objectFit:'contain',marginTop:12}}/></div>}<div className="dashboard-head"><div><span className="overline">YOUR PIKLVENUE SPACE</span><h1>Hey, {user?.name.split(' ')[0]||'player'} <span>✳</span></h1><p>{user?.role==='owner'?'Manage your venues, courts, and incoming reservations.':'Your games, your schedule. All in one place.'}</p></div><button className="btn btn-outline" onClick={logout}><LogOut size={16}/> Log out</button></div>{message&&<div className="success-box">{message}</div>}{error&&<div className="form-error">{error}</div>}{user?.role==='player'?<><div className="dashboard-section-title"><h2>My reservations</h2><Link href="/" className="btn btn-dark small"><Plus size={16}/> Book a court</Link></div><div className="booking-list">{bookings.map(b=><div className="booking-entry" key={b.id}><div className="booking-icon"><CalendarDays/></div><div className="booking-entry-main"><h3>{b.venue_name}</h3><p>{b.court_name} · {b.booking_date} · {formatBookingHours(b)}</p><small>Reference #{b.id} {b.payment_reference?' · Payment ref: '+b.payment_reference:''}</small></div><div className="booking-entry-side"><span className={`status status-${b.status}`}>{b.status}</span><strong>{money(b.total_amount)}</strong>{['pending','approved'].includes(b.status)&&<button className="text-danger" onClick={()=>cancelPlayer(b.id)}>Cancel</button>}</div></div>)}{!bookings.length&&<div className="empty">No bookings yet. <Link href="/">Explore venues</Link> to find your next game!</div>}</div></>:user?.role==='owner'?<><div className="dashboard-section-title"><h2>My venues</h2><button className="btn btn-dark small" onClick={()=>setShowVenue(!showVenue)}><Plus size={16}/> Add venue</button></div>{showVenue&&<form className="admin-form" onSubmit={createVenue}><h3>Add new venue</h3><div className="form-grid">{(Object.keys(venueForm) as (keyof typeof venueForm)[]).filter(k=>k!=='image_url'&&k!=='gcash_qr_url').map(k=><label key={k}>{k.replace('_',' ')}<input required={['name','city','address'].includes(k)} value={venueForm[k]} onChange={e=>setVenueForm({...venueForm,[k]:e.target.value})}/></label>)}<VenueImageUpload value={venueForm.image_url} onChange={url=>setVenueForm(old=>({...old,image_url:url}))}/><VenueImageUpload label="GCash payment QR code" value={venueForm.gcash_qr_url} onChange={url=>setVenueForm(old=>({...old,gcash_qr_url:url}))}/></div><button className="btn btn-dark">Save venue</button></form>}<div className="owner-venues">{venues.map(v=><button key={v.id} onClick={()=>setSelectedVenue(v.id)} className={`owner-venue ${selectedVenue===v.id?'active':''}`}><MapPin size={19}/><span><strong>{v.name}</strong><small>
  {v.city} · {v.court_count} courts
  {' · '}
  {Number(v.is_active) === 1 ? 'Visible' : 'Hidden'}
</small></span></button>)}{!venues.length&&<div className="empty">Add your first venue to get started.</div>}</div>{selectedVenue&&<>

<div className="dashboard-section-title">
  <h2>Venue Details</h2>

  <div className="crud-actions">
    <button
      type="button"
      className="btn btn-outline small"
      onClick={() =>
        editingVenue
          ? setEditingVenue(false)
          : startEditVenue()
      }
    >
      {editingVenue ? 'Cancel' : 'Edit Venue'}
    </button>

    <button
      type="button"
      className="btn btn-outline small"
      onClick={toggleVenueVisibility}
    >
      {Number(
        venues.find(v => v.id === selectedVenue)?.is_active
      ) === 1
        ? 'Hide Venue'
        : 'Restore Venue'}
    </button>
  </div>
</div>

<div className="crud-toolbar">
  <button type="button" className="text-danger" onClick={deleteVenue}><Trash2 size={16}/> Delete empty venue</button></div>
{editingVenue&&<form className="admin-form" onSubmit={saveVenue}><h3>Edit venue information</h3><div className="form-grid">{(Object.keys(venueForm) as (keyof typeof venueForm)[]).filter(k=>k!=='image_url'&&k!=='gcash_qr_url').map(k=><label key={k}>{k.replace('_',' ')}<input required={['name','city','address'].includes(k)} value={venueForm[k]} onChange={e=>setVenueForm({...venueForm,[k]:e.target.value})}/></label>)}<VenueImageUpload value={venueForm.image_url} onChange={url=>setVenueForm(old=>({...old,image_url:url}))}/><VenueImageUpload label="BANK/GCash payment QR code" value={venueForm.gcash_qr_url} onChange={url=>setVenueForm(old=>({...old,gcash_qr_url:url}))}/></div><button className="btn btn-dark">Update venue</button></form>}
<OwnerDiscountCodes venueId={selectedVenue}/><div className="dashboard-section-title"><h2>Court management</h2><button className="btn btn-outline small" onClick={() => {
  if (!showCourt) {
    setCourtForm(emptyCourtForm);
    setEditingCourt(null);
  }
  setShowCourt(!showCourt);
}}><Plus size={16}/> Add court</button></div>{showCourt&&<form className="admin-form" onSubmit={createCourt}><h3>Add court</h3><div className="form-grid"><label>Court name<input value={courtForm.name} required onChange={e=>setCourtForm({...courtForm,name:e.target.value})}/></label>{(['day_rate','night_rate','open_hour','close_hour'] as const).map(k=><label key={k}>{k.replace('_',' ')}<input type="number" required min={k.includes('hour')?0:1} max={k.includes('hour')?24:undefined} value={courtForm[k]} onChange={e=>setCourtForm({...courtForm,[k]:Number(e.target.value)})}/></label>)}</div>
<CourtFacebookLiveField
  url={courtForm.facebook_live_url}
  isLive={courtForm.facebook_live_active}
  onUrlChange={updateCourtLiveUrl}
  onLiveChange={isLive => setCourtForm(current => ({ ...current, facebook_live_active: isLive }))}
/>
<CourtTermsField
  value={courtForm.terms_and_conditions}
  onChange={value => setCourtForm(current => ({ ...current, terms_and_conditions: value }))}
/>
<p>Night pricing applies from 5 PM onward. All times use the venue's Philippine local time.</p><button className="btn btn-dark">Save court</button></form>}<div className="court-management-list">{managedCourts.map(c=><div className="court-management-item" key={c.id}><div>
  <div className="court-name-status">
  <strong>{c.name}</strong>
  {isCourtLive(c)&&<span className="court-live-badge">Live now</span>}

  <span
    className={
      Number(c.is_active) === 1
        ? 'court-visibility active'
        : 'court-visibility hidden'
    }
  >
    {Number(c.is_active) === 1
      ? 'Visible'
      : 'Hidden'}
  </span>
</div><p>{money(Number(c.day_rate))}/hr day · {money(Number(c.night_rate))}/hr night · {hourLabel(Number(c.open_hour))}–{hourLabel(Number(c.close_hour))}</p></div>

<div className="crud-actions">
  <button
    type="button"
    className="btn btn-outline small"
    onClick={() =>
      editingCourt === c.id
        ? setEditingCourt(null)
        : startEditCourt(c)
    }
  >
    {editingCourt === c.id ? 'Cancel' : 'Edit Court'}
  </button>

  <button
    type="button"
    className="btn btn-outline small"
    onClick={() => {
      const next = blockCourt === c.id ? null : c.id;

      setBlockCourt(next);
      setBlockDate(localDate(new Date()));
      setBlockedSlots([]);

      if (next !== null) {
        void loadBlocks(next, localDate(new Date()));
      }
    }}
  >
    {blockCourt === c.id
      ? 'Close Schedule'
      : 'Manage Schedule'}
  </button>

  <button
    type="button"
    className="btn btn-outline small"
    onClick={() => toggleCourtVisibility(c)}
  >
    {Number(c.is_active) === 1
      ? 'Hide Court'
      : 'Restore Court'}
  </button>

  <button
    type="button"
    className="text-danger"
    onClick={() => deleteCourt(c)}
    title="Permanently delete court (only without history)"
  >
    <Trash2 size={17} />
  </button>
</div>
</div>)}{!managedCourts.length&&<p>No courts yet — add your first court.</p>}</div>

{blockCourt !== null && selectedVenue !== null && (
  <>
    <div className="dashboard-section-title">
      <h2>Manage Court Schedule</h2>

      <button
        type="button"
        className="btn btn-outline small"
        onClick={() => setBlockCourt(null)}
      >
        Close
      </button>
    </div>

    <OwnerScheduleTools
      key={`${selectedVenue}-${blockCourt}`}
      venueId={selectedVenue}
      courtId={blockCourt}
      onSaved={async () => {
        if (user) {
          refresh(user);
        }

        await loadBlocks(blockCourt, blockDate);
      }}
    />

    <section className="admin-form">
      <h3>Unblock Existing Time Slots</h3>

      <p>
        Select a date to view previously blocked hours.
        Unblocking a time slot makes it available for
        new reservations again.
      </p>

      <div className="crud-block-form">
        <label>
          Date
          <input
            type="date"
            value={blockDate}
            onChange={e => {
              const newDate = e.target.value;

              setBlockDate(newDate);
              setBlockedSlots([]);

              if (newDate) {
                void loadBlocks(blockCourt, newDate);
              }
            }}
          />
        </label>

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => loadBlocks(blockCourt, blockDate)}
        >
          Refresh Blocked Slots
        </button>
      </div>

      <div className="crud-blocked-list">
        {blockedSlots.map(slot => (
          <div
            key={slot.id}
            className="crud-blocked-item"
          >
            <span>
              {slot.booking_date} ·{' '}
              {hourLabel(Number(slot.hour))}
              {' – '}
              {hourLabel(Number(slot.hour) + 1)}
            </span>

            <button
              type="button"
              className="text-danger"
              onClick={() => unblockSlot(slot.id)}
            >
              Unblock
            </button>
          </div>
        ))}

        {!blockedSlots.length && (
          <p>No blocked hours for this date.</p>
        )}
      </div>
    </section>
  </>
)}
{editingCourt!==null&&<form className="admin-form" onSubmit={saveCourt}><h3>Edit court details</h3><div className="form-grid"><label>Court name<input value={courtForm.name} required onChange={e=>setCourtForm({...courtForm,name:e.target.value})}/></label>{(['day_rate','night_rate','open_hour','close_hour'] as const).map(k=><label key={k}>{k.replace('_',' ')}<input type="number" required min={k.includes('hour')?0:1} max={k.includes('hour')?24:undefined} value={courtForm[k]} onChange={e=>setCourtForm({...courtForm,[k]:Number(e.target.value)})}/></label>)}</div>
<CourtFacebookLiveField
  url={courtForm.facebook_live_url}
  isLive={courtForm.facebook_live_active}
  onUrlChange={updateCourtLiveUrl}
  onLiveChange={isLive => setCourtForm(current => ({ ...current, facebook_live_active: isLive }))}
/>
<CourtTermsField
  value={courtForm.terms_and_conditions}
  onChange={value => setCourtForm(current => ({ ...current, terms_and_conditions: value }))}
/>
<p>Updating hours cannot exclude already reserved future time slots.</p><button className="btn btn-dark">Save changes</button></form>}
<div className="dashboard-section-title"><h2>Booking requests</h2><Link href={`/venues/${selectedVenue}`} className="btn btn-outline small">View booking board ↗</Link></div><div className="booking-list">{ownerBookings.filter(b=>b.venue_id===selectedVenue).map(b=><div className="booking-entry" key={b.id}><div className="booking-icon"><CalendarDays/></div><div className="booking-entry-main"><h3>{b.player_name} · {b.court_name}</h3><p>{b.booking_date} · {formatBookingHours(b)} · {b.player_phone||'No phone'} · {b.player_email||'No email'}</p>
<small>
  Booking #{b.id}

  {' · '}

  {b.booking_source === 'walkin'
    ? 'Walk-in / Manual Booking'
    : 'Online Booking'}

  {b.payment_reference
    ? ` · Payment ref: ${b.payment_reference}`
    : ''}
</small>
{b.payment_screenshot&&<button type="button" className="btn btn-outline small" disabled={proofBusy} onClick={()=>showPaymentProof(b.id)}>View GCash screenshot</button>}</div><div className="booking-entry-side"><span className={`status status-${b.status}`}>{b.status}</span><strong>{money(b.total_amount)}</strong>
{b.status === 'pending' && (
  <div className="action-row">
    <button
      type="button"
      onClick={() => status(b.id, 'approve')}
      title="Approve"
      aria-label="Approve booking"
    >
      <CheckCircle2 size={20} />
    </button>

    <button
      type="button"
      onClick={() => status(b.id, 'reject')}
      title="Reject"
      aria-label="Reject booking"
    >
      <XCircle size={20} />
    </button>
  </div>
)}

{b.booking_source === 'walkin' &&
  b.status === 'approved' && (
    <button
      type="button"
      className="text-danger"
      onClick={() => {
        if (
          window.confirm(
            'Cancel this walk-in booking and release its reserved hours?'
          )
        ) {
          void status(b.id, 'cancel');
        }
      }}
    >
      Cancel Walk-in
    </button>
  )}
</div></div>)}{!ownerBookings.some(b=>b.venue_id===selectedVenue)&&<div className="empty">No booking requests for this venue yet.</div>}</div></>}</>:null}</main>}
