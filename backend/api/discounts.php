<?php
// Included by api/index.php after its q(), fail(), response(), body(), user(), ownerOf() functions.
// All dates use the backend Asia/Manila timezone.
function pvDiscountCode(string $raw): string {
    $code = strtoupper(trim($raw));
    if (!preg_match('/^[A-Z0-9_-]{3,50}$/D', $code)) fail('Promo code must be 3–50 letters, digits, _ or -',400);
    return $code;
}
function pvDiscountAmount(array $discount, int $subtotalCents): int {
    $type = $discount['discount_type'];
    if ($type === 'free') return $subtotalCents;
    if ($type === 'percent') return min($subtotalCents,(int)round($subtotalCents * (float)$discount['discount_value'] / 100));
    return min($subtotalCents,(int)round((float)$discount['discount_value'] * 100));
}
function pvLookupDiscount(PDO $db,int $venueId,string $code,int $subtotalCents,int $slotCount,bool $lock=false):array {
    $discount=q($db,'SELECT * FROM discount_codes WHERE venue_id=? AND code=?'.($lock?' FOR UPDATE':''),[$venueId,pvDiscountCode($code)])->fetch();
    if(!$discount || $discount['deleted_at']!==null || (int)$discount['is_active']!==1)fail('Promo code is not valid for this venue',400);
    if($discount['expires_at']!==null && strtotime($discount['expires_at']) < time())fail('Promo code has expired',400);
    if($discount['usage_limit']!==null && (int)$discount['used_count'] >= (int)$discount['usage_limit'])fail('Promo code has reached its usage limit',409);
    if($subtotalCents < (int)round((float)$discount['min_booking_amount'] * 100))fail('Booking does not meet promo minimum spend',400);
    if($slotCount < (int)$discount['min_slots'])fail('This promo requires at least '.$discount['min_slots'].' booked one-hour slots',400);
    if($discount['max_slots']!==null && $slotCount > (int)$discount['max_slots'])fail('This promo allows a maximum of '.$discount['max_slots'].' selected one-hour slots. Remove the coupon to book more hours.',400);
    return $discount;
}
function pvReleaseDiscount(PDO $db,int $bookingId):void {
    // Caller holds a transaction. Bookings are locked before discount codes to avoid duplicate releases.
    $b=q($db,'SELECT discount_code_id,discount_released FROM bookings WHERE id=? FOR UPDATE',[$bookingId])->fetch();
    if (!$b || !$b['discount_code_id'] || (int)$b['discount_released']===1) return;
    q($db,'UPDATE discount_codes SET used_count=GREATEST(0,used_count-1) WHERE id=?',[(int)$b['discount_code_id']]);
    q($db,'UPDATE bookings SET discount_released=1 WHERE id=?',[$bookingId]);
}
function pvDiscountRoutes(PDO $db,string $path,string $method):void {
    if ($path==='owner/discounts' && $method==='GET') {
        $u=user($db,'owner');$venueId=(int)($_GET['venue_id']??0);
        ownerOf($db,$venueId,(int)$u['id']);
        $items=q($db,'SELECT id,venue_id,code,discount_type,discount_value,min_booking_amount,min_slots,max_slots,usage_limit,used_count,expires_at,is_active FROM discount_codes WHERE venue_id=? AND deleted_at IS NULL ORDER BY id DESC',[$venueId])->fetchAll();
        response(['discounts'=>$items]);
    }
    if ($path==='owner/discounts' && $method==='POST') {
        $u=user($db,'owner');$d=body();$venueId=(int)($d['venue_id']??0);
        ownerOf($db,$venueId,(int)$u['id']);
        $code=pvDiscountCode((string)($d['code']??''));$type=(string)($d['discount_type']??'');
        if(!in_array($type,['free','percent','fixed'],true))fail('Invalid discount type');
        $value=($type==='free')?0:(float)($d['discount_value']??-1);
        if(!is_finite($value)||$value<0||$value>1000000 || ($type==='percent'&&($value<=0||$value>100)) || ($type==='fixed'&&$value<=0))fail('Invalid discount value');
        $min=(float)($d['min_booking_amount']??0);
        if(!is_finite($min)||$min<0||$min>1000000)fail('Invalid minimum spend');
        $minSlots=$d['min_slots']??1;
        if(!is_int($minSlots)||$minSlots<1||$minSlots>12)fail('Minimum slots must be an integer from 1 to 12');
        $maxSlots=$d['max_slots']??null;
        if($maxSlots==='')$maxSlots=null;
        if($maxSlots!==null&&(!is_int($maxSlots)||$maxSlots<1||$maxSlots>12||$maxSlots<$minSlots))fail('Maximum slots must be between minimum slots and 12');
        $limit=($d['usage_limit']??null);if($limit==='')$limit=null;
        if($limit!==null&&(!is_int($limit)||$limit<1||$limit>1000000))fail('Usage limit must be a positive integer');
        $expires=$d['expires_at']??null;
        if($expires==='')$expires=null;
        if($expires!==null){
            if(!is_string($expires)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$expires)||!validDate($expires))fail('Expiration must be YYYY-MM-DD');
            $expires.=' 23:59:59';
        }
        $active=isset($d['is_active'])?(bool)$d['is_active']:true;
        try{
            q($db,'INSERT INTO discount_codes(venue_id,code,discount_type,discount_value,min_booking_amount,min_slots,max_slots,usage_limit,expires_at,is_active) VALUES(?,?,?,?,?,?,?,?,?,?)',[$venueId,$code,$type,number_format($value,2,'.',''),number_format($min,2,'.',''),$minSlots,$maxSlots,$limit,$expires,$active?1:0]);
        }catch(PDOException $e){if($e->getCode()==='23000')fail('This venue already has that promo code',409);throw $e;}
        response(['id'=>(int)$db->lastInsertId(),'code'=>$code],201);
    }
    if(preg_match('#^owner/discounts/(\d+)$#',$path,$m) && $method==='PUT'){
        $u=user($db,'owner');$id=(int)$m[1];$d=body();
        $db->beginTransaction();
        try {
            $row=q($db,'SELECT dc.* FROM discount_codes dc JOIN venues v ON v.id=dc.venue_id WHERE dc.id=? AND v.owner_id=? AND dc.deleted_at IS NULL FOR UPDATE',[$id,(int)$u['id']])->fetch();
            if(!$row){$db->rollBack();fail('Promo code not found',404);}
            $code=pvDiscountCode((string)($d['code']??''));
            $type=(string)($d['discount_type']??'');
            if(!in_array($type,['free','percent','fixed'],true)){$db->rollBack();fail('Invalid discount type');}
            $value=$type==='free'?0:(float)($d['discount_value']??-1);
            if(!is_finite($value)||$value<0||$value>1000000||($type==='percent'&&($value<=0||$value>100))||($type==='fixed'&&$value<=0)){$db->rollBack();fail('Invalid discount value');}
            $min=(float)($d['min_booking_amount']??0);
            if(!is_finite($min)||$min<0||$min>1000000){$db->rollBack();fail('Invalid minimum spend');}
            $minSlots=$d['min_slots']??1;
            if(!is_int($minSlots)||$minSlots<1||$minSlots>12){$db->rollBack();fail('Minimum slots must be 1–12');}
            $maxSlots=$d['max_slots']??null;
            if($maxSlots==='')$maxSlots=null;
            if($maxSlots!==null&&(!is_int($maxSlots)||$maxSlots<1||$maxSlots>12||$maxSlots<$minSlots)){$db->rollBack();fail('Maximum slots must be between minimum slots and 12');}
            $limit=$d['usage_limit']??null;
            if($limit==='')$limit=null;
            if($limit!==null&&(!is_int($limit)||$limit<1||$limit>1000000)){$db->rollBack();fail('Usage limit must be a positive integer');}
            if($limit!==null&&$limit<(int)$row['used_count']){$db->rollBack();fail('Usage limit cannot be less than the current number of uses');}
            $expires=$d['expires_at']??null;
            if($expires==='')$expires=null;
            if($expires!==null){
                if(!is_string($expires)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$expires)||!validDate($expires)){$db->rollBack();fail('Expiration must be YYYY-MM-DD');}
                $expires.=' 23:59:59';
            }
            if(!isset($d['is_active'])||!is_bool($d['is_active'])){$db->rollBack();fail('is_active must be boolean');}
            q($db,'UPDATE discount_codes SET code=?,discount_type=?,discount_value=?,min_booking_amount=?,min_slots=?,max_slots=?,usage_limit=?,expires_at=?,is_active=? WHERE id=?',[$code,$type,number_format($value,2,'.',''),number_format($min,2,'.',''),$minSlots,$maxSlots,$limit,$expires,$d['is_active']?1:0,$id]);
            $db->commit();
            response(['ok'=>true,'id'=>$id]);
        }catch(PDOException $e){if($db->inTransaction())$db->rollBack();if($e->getCode()==='23000')fail('This venue already has that promo code',409);throw $e;}
        catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    }
    if(preg_match('#^owner/discounts/(\d+)$#',$path,$m) && $method==='DELETE'){
        $u=user($db,'owner');$id=(int)$m[1];
        // Archive rather than hard-delete. Bookings retain discount_code_id and redemption history.
        $changed=q($db,'UPDATE discount_codes dc JOIN venues v ON v.id=dc.venue_id SET dc.deleted_at=NOW(),dc.is_active=0 WHERE dc.id=? AND v.owner_id=? AND dc.deleted_at IS NULL',[$id,(int)$u['id']])->rowCount();
        if(!$changed)fail('Promo code not found',404);
        response(['ok'=>true,'archived'=>true]);
    }
    if(preg_match('#^owner/discounts/(\d+)/toggle$#',$path,$m)&&$method==='POST'){
        $u=user($db,'owner');$id=(int)$m[1];$d=body();
        if(!array_key_exists('is_active',$d)||!is_bool($d['is_active']))fail('is_active must be boolean');
        $row=q($db,'SELECT dc.id,dc.venue_id FROM discount_codes dc JOIN venues v ON v.id=dc.venue_id WHERE dc.id=? AND dc.deleted_at IS NULL AND v.owner_id=?',[$id,$u['id']])->fetch();
        if(!$row)fail('Promo code not found',404);
        q($db,'UPDATE discount_codes SET is_active=? WHERE id=?',[$d['is_active']?1:0,$id]);
        response(['ok'=>true]);
    }
    if($path==='discounts/quote'&&$method==='POST'){
        $d=body();$courtId=(int)($d['court_id']??0);$hours=$d['selected_hours']??null;
        $date=(string)($d['booking_date']??'');
        if(!$courtId||!validDate($date)||!is_array($hours)||count($hours)<1||count($hours)>12)fail('Choose a court, date and hours');
        foreach($hours as $h)if(!is_int($h)||$h<0||$h>23)fail('Invalid selected hour');
        if(count(array_unique($hours))!==count($hours))fail('Duplicate selected hours');
        $court=q($db,'SELECT c.*,v.is_active AS venue_active FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=?',[$courtId])->fetch();
        if(!$court||(int)$court['is_active']!==1||(int)$court['venue_active']!==1)fail('Court unavailable',409);
        $subtotalCents=0;
        foreach($hours as $h){
            if($h<(int)$court['open_hour']||$h>=(int)$court['close_hour']||!currentCheck($date,$h))fail('Hour unavailable',409);
            $subtotalCents+=(int)round((float)($h>=17?$court['night_rate']:$court['day_rate'])*100);
        }
        $discount=pvLookupDiscount($db,(int)$court['venue_id'],(string)($d['code']??''),$subtotalCents,count($hours));
        $saved=pvDiscountAmount($discount,$subtotalCents);
        response(['code'=>$discount['code'],'subtotal_amount'=>$subtotalCents/100,'discount_amount'=>$saved/100,'total_amount'=>($subtotalCents-$saved)/100,'min_slots'=>(int)$discount['min_slots'],'max_slots'=>$discount['max_slots']===null?null:(int)$discount['max_slots']]);
    }
}
