'use client';
import {FormEvent,useCallback,useEffect,useState} from 'react';
import {request,money} from '../../lib/api';

type Promo = {
  id:number;code:string;discount_type:'free'|'percent'|'fixed';
  discount_value:number|string;min_booking_amount:number|string;min_slots:number|string;max_slots:number|string|null;
  usage_limit:number|null;used_count:number;expires_at:string|null;is_active:number|boolean;
};
type PromoType = Promo['discount_type'];

export default function OwnerDiscountCodes({venueId}:{venueId:number}){
  const [items,setItems]=useState<Promo[]>([]);
  const [editingId,setEditingId]=useState<number|null>(null);
  const [code,setCode]=useState('SAVE20');
  const [type,setType]=useState<PromoType>('percent');
  const [value,setValue]=useState('20');
  const [min,setMin]=useState('0');
  const [minSlots,setMinSlots]=useState('1');
  const [maxSlots,setMaxSlots]=useState('');
  const [limit,setLimit]=useState('50');
  const [expires,setExpires]=useState('2026-12-31');
  const [active,setActive]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    const r=await request<{discounts:Promo[]}>(`/owner/discounts?venue_id=${venueId}`);
    setItems(r.discounts);
  },[venueId]);
  useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[load]);
  function reset(){setEditingId(null);setCode('SAVE20');setType('percent');setValue('20');setMin('0');setMinSlots('1');setMaxSlots('');setLimit('50');setExpires('2026-12-31');setActive(true);}
  function edit(p:Promo){
    setEditingId(p.id);setCode(p.code);setType(p.discount_type);
    setValue(String(p.discount_value));setMin(String(p.min_booking_amount));
    setMinSlots(String(p.min_slots??1));setMaxSlots(p.max_slots===null?'':String(p.max_slots));setLimit(p.usage_limit===null?'':String(p.usage_limit));
    setExpires(p.expires_at?.slice(0,10)??'');setActive(Number(p.is_active)===1);
    setError('');setNotice('');
  }
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setNotice('');
    const payload={venue_id:venueId,code:code.trim().toUpperCase(),discount_type:type,
      discount_value:type==='free'?0:Number(value),min_booking_amount:Number(min),
      min_slots:Number(minSlots),max_slots:maxSlots.trim()===''?null:Number(maxSlots),usage_limit:limit.trim()===''?null:Number(limit),
      expires_at:expires||null,is_active:active};
    try{
      await request(editingId===null?'/owner/discounts':`/owner/discounts/${editingId}`,{
        method:editingId===null?'POST':'PUT',body:JSON.stringify(payload)
      });
      setNotice(editingId===null?'Promo code created.':'Promo code updated.');
      reset();await load();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function toggle(p:Promo){
    setBusy(true);setError('');setNotice('');
    try{
      await request(`/owner/discounts/${p.id}/toggle`,{
        method:'POST',body:JSON.stringify({is_active:Number(p.is_active)!==1})
      });
      setNotice('Promo code status updated.');await load();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function remove(p:Promo){
    if(!window.confirm(`Delete coupon "${p.code}"? It will stop working immediately. Previous bookings will retain their discount history.`))return;
    setBusy(true);setError('');setNotice('');
    try{
      await request(`/owner/discounts/${p.id}`,{method:'DELETE'});
      if(editingId===p.id)reset();
      setNotice('Coupon deleted (archived).');await load();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <section className="admin-form" style={{marginTop:24}}>
    <h3>Discount Codes</h3>
    <p>Make free, percentage or fixed-price coupons. Configure minimum and maximum one-hour slots for a coupon. For a free coupon limited to 2 hours, set maximum to 2.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {notice&&<p className="success-box" role="status">{notice}</p>}
    <form onSubmit={save} className="form-grid">
      <label>Promo code<input required minLength={3} maxLength={50} pattern="[A-Za-z0-9_-]{3,50}" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label>
      <label>Type<select value={type} onChange={e=>setType(e.target.value as PromoType)}><option value="free">Free booking</option><option value="percent">Percentage (%)</option><option value="fixed">Fixed amount (₱)</option></select></label>
      {type!=='free'&&<label>{type==='percent'?'Discount percentage':'Discount amount (₱)'}<input required type="number" min="0.01" max={type==='percent'?100:1000000} step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></label>}
      <label>Minimum spend (₱)<input type="number" min="0" step="0.01" required value={min} onChange={e=>setMin(e.target.value)}/></label>
      <label>Minimum selected slots (1–12)<input type="number" min="1" max="12" step="1" required value={minSlots} onChange={e=>setMinSlots(e.target.value)}/><small>For more than 2 hours, enter 3. Exactly 2 hours won't qualify.</small></label>
      <label>Maximum selected slots (blank = unlimited)<input type="number" min={minSlots || "1"} max="12" step="1" value={maxSlots} onChange={e=>setMaxSlots(e.target.value)}/><small>For a FREE coupon covering at most 2 hours, enter 2. Bookings of 3+ hours cannot use this coupon.</small></label>
      <label>Usage limit (blank = unlimited)<input type="number" min="1" step="1" value={limit} onChange={e=>setLimit(e.target.value)}/></label>
      <label>Expires (end of day, Philippine time)<input type="date" value={expires} onChange={e=>setExpires(e.target.value)}/></label>
      <label><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Active</label>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <button className="btn btn-dark" type="submit" disabled={busy}>{busy?'Saving...':editingId===null?'Create discount code':'Save changes'}</button>
        {editingId!==null&&<button type="button" className="btn btn-outline" disabled={busy} onClick={reset}>Cancel edit</button>}
      </div>
    </form>
    <div style={{display:'grid',gap:10,marginTop:18}}>
      {items.map(p=><div key={p.id} className="court-management-item">
        <div><strong>{p.code}</strong> — {p.discount_type==='free'?'FREE':p.discount_type==='percent'?`${p.discount_value}% off`:`${money(Number(p.discount_value))} off`}
          <p>Min. {p.min_slots??1} / Max. {p.max_slots??'unlimited'} slots · Min. spend {money(Number(p.min_booking_amount))} · Used {p.used_count}/{p.usage_limit??'∞'} · {p.expires_at?`Expires ${p.expires_at.slice(0,10)}`:'No expiry'} · {Number(p.is_active)===1?'Active':'Inactive'}</p>
        </div>
        <div className="crud-actions" style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button type="button" className="btn btn-outline small" disabled={busy} onClick={()=>edit(p)}>Edit</button>
          <button type="button" className="btn btn-outline small" disabled={busy} onClick={()=>void toggle(p)}>{Number(p.is_active)===1?'Disable':'Enable'}</button>
          <button type="button" className="text-danger" disabled={busy} onClick={()=>void remove(p)}>Delete</button>
        </div>
      </div>)}
    </div>
  </section>;
}
