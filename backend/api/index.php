<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Manila');
function envLoad(string $path): array { $env=[];if(is_file($path))foreach(file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){if(str_starts_with(trim($line),'#')||!str_contains($line,'='))continue;[$k,$v]=explode('=',$line,2);$env[trim($k)]=trim($v," \t\n\r\0\x0B\"'");}return $env;}
$env=envLoad(dirname(__DIR__).'/.env');
require_once dirname(__DIR__) . '/mailer.php';
$origin=$env['FRONTEND_ORIGIN']??'http://localhost:3000';
header('Content-Type: application/json; charset=utf-8');header('Access-Control-Allow-Origin: '.$origin);header('Vary: Origin');header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
if($_SERVER['REQUEST_METHOD']==='OPTIONS'){http_response_code(204);exit;}
function response(array $obj,int $status=200):never{http_response_code($status);echo json_encode($obj,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);exit;}
function fail(string $message,int $status=400):never{response(['error'=>$message],$status);}
function body():array{$raw=file_get_contents('php://input');$data=json_decode($raw,true);if(!is_array($data)||array_is_list($data))fail('Expected JSON object');return $data;}
function mustString(array $a,string $key,int $max=200):string{$v=trim((string)($a[$key]??''));if(!$v||mb_strlen($v)>$max)fail("Invalid $key");return $v;}
function readCourtTerms(array $data): ?string {
    $terms = $data['terms_and_conditions'] ?? null;
    if ($terms !== null && !is_string($terms)) {
        fail('Court terms and conditions must be text');
    }
    $terms = trim($terms ?? '');
    if (mb_strlen($terms, 'UTF-8') > 4000) {
        fail('Court terms and conditions must be 4,000 characters or fewer');
    }
    return $terms === '' ? null : $terms;
}
function readCourtFacebookLiveUrl(array $data): ?string {
    $value = $data['facebook_live_url'] ?? '';
    $message = 'Enter a public Facebook Live video link';
    if (!is_string($value)) fail($message);
    $url = trim($value);
    if ($url === '') return null;
    if (strlen($url) > 1000 || !filter_var($url, FILTER_VALIDATE_URL)) fail($message);

    $parts = parse_url($url);
    $host = strtolower($parts['host'] ?? '');
    if (strtolower($parts['scheme'] ?? '') !== 'https' ||
        isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
        fail($message);
    }

    $path = rtrim($parts['path'] ?? '', '/');
    if ($host === 'fb.watch' && preg_match('~^/[A-Za-z0-9_-]+$~D', $path)) return $url;
    if (!in_array($host, ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'], true)) {
        fail($message);
    }
    if (preg_match('~^/(?:(?:groups/)?[A-Za-z0-9._-]+/)?(?:videos|posts|live)/(?:[0-9]+|pfbid[A-Za-z0-9]+)$~D', $path) ||
        preg_match('~^/share/v/[A-Za-z0-9_-]+$~D', $path)) {
        return $url;
    }
    if (in_array($path, ['/watch', '/live', '/video.php'], true)) {
        parse_str($parts['query'] ?? '', $query);
        if (is_string($query['v'] ?? null) && ctype_digit($query['v'])) return $url;
    }
    fail($message);
}
function readCourtFacebookLiveActive(array $data): ?bool {
    if (!array_key_exists('facebook_live_active', $data)) return null;
    if (!is_bool($data['facebook_live_active'])) fail('Facebook Live status must be true or false');
    return $data['facebook_live_active'];
}
function db():PDO{global $env;try{return new PDO('mysql:host='.($env['DB_HOST']??'127.0.0.1').';port='.($env['DB_PORT']??'3306').';dbname='.($env['DB_NAME']??'piklvenue').';charset=utf8mb4',$env['DB_USER']??'root',$env['DB_PASS']??'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false,PDO::MYSQL_ATTR_INIT_COMMAND=>"SET time_zone = '+08:00'"]);}catch(PDOException $e){fail('Database connection failed. Check backend/.env and import database/schema.sql.',503);}}
function q(PDO $db,string $sql,array $params=[]):PDOStatement{$s=$db->prepare($sql);$s->execute($params);return $s;}
function user(PDO $db,?string $role=null):array{$header=$_SERVER['HTTP_AUTHORIZATION']??'';if(!preg_match('/^Bearer ([a-f0-9]{64})$/i',$header,$m))fail('Please log in',401);$row=q($db,'SELECT u.id,u.name,u.email,u.phone,u.role FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>NOW()',[hash('sha256',$m[1])])->fetch();if(!$row)fail('Session expired. Please log in again.',401);if($row['role']!=='owner')fail('Player access is temporarily disabled',403);if($role&&$row['role']!==$role)fail('Forbidden for this account type',403);return $row;}
function token(PDO $db,array $u):array{$plain=bin2hex(random_bytes(32));q($db,'INSERT INTO api_tokens(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 DAY))',[$u['id'],hash('sha256',$plain)]);unset($u['password_hash']);return ['user'=>$u,'token'=>$plain];}
function validDate(string $date):bool{$dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);return $dt!==false&&$dt->format('Y-m-d')===$date;}
function currentCheck(string $date,int $hour):bool{return strtotime("$date ".str_pad((string)$hour,2,'0',STR_PAD_LEFT).':00:00')>time();}
function ownerOf(PDO $db,int $venueId,int $ownerId):void{if(!q($db,'SELECT id FROM venues WHERE id=? AND owner_id=?',[$venueId,$ownerId])->fetch())fail('Venue not found or not yours',404);}
function releaseBooking(PDO $db,int $id,string $status):void{pvReleaseDiscount($db,$id);q($db,'UPDATE bookings SET status=? WHERE id=?',[$status,$id]);q($db,'DELETE FROM booking_slots WHERE booking_id=?',[$id]);}
// Release abandoned payment holds. Run this on reads and writes; also use cron for proactive cleanup.
function expirePaymentHolds(PDO $db): void {
    $db->beginTransaction();
    try {
        $expiringIds=q($db,"SELECT id FROM bookings WHERE status='awaiting_payment' AND payment_deadline <= NOW() FOR UPDATE")->fetchAll(PDO::FETCH_COLUMN);
        foreach($expiringIds as $expiringId) pvReleaseDiscount($db,(int)$expiringId);
        q($db,"UPDATE bookings SET status='expired' WHERE status='awaiting_payment' AND payment_deadline <= NOW()");
        q($db,"DELETE bs FROM booking_slots bs JOIN bookings b ON b.id=bs.booking_id WHERE b.status='expired'");
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}
require_once __DIR__ . '/discounts.php';
// Require a private server-to-server API key for every non-OPTIONS endpoint.
// Set API_SECRET_KEY in the backend .env file, not in browser JavaScript.
$expectedApiKey = (string)($env['API_SECRET_KEY'] ?? '');
$providedApiKey = (string)($_SERVER['HTTP_X_API_KEY'] ?? '');
if ($expectedApiKey === '') {
    error_log('PiklVenue: API_SECRET_KEY is missing in .env');
    fail('API is not configured', 503);
}
if ($providedApiKey === '' || !hash_equals($expectedApiKey, $providedApiKey)) {
    fail('Invalid or missing API key', 401);
}

$db=db();
$requestPath=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '/';
$apiPrefix='/api';
if (!($requestPath===$apiPrefix || str_starts_with($requestPath,$apiPrefix.'/'))) fail('Endpoint not found',404);
$path=trim(substr($requestPath,strlen($apiPrefix)),'/');
$method=$_SERVER['REQUEST_METHOD'];
try{
expirePaymentHolds($db);
pvDiscountRoutes($db,$path,$method);
if($path==='register'&&$method==='POST'){$data=body();$name=mustString($data,'name',150);$email=strtolower(mustString($data,'email',190));$password=(string)($data['password']??'');$role=(string)($data['role']??'');$phone=trim((string)($data['phone']??''));if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Invalid email');if(strlen($password)<8||strlen($password)>200)fail('Password must be 8–200 characters');if($role!=='owner')fail('Player registration is temporarily disabled',403);if(strlen($phone)>32)fail('Invalid phone');try{q($db,'INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)',[$name,$email,$phone,password_hash($password,PASSWORD_DEFAULT),$role]);}catch(PDOException $e){if($e->getCode()==='23000')fail('Email already registered',409);throw $e;}$u=q($db,'SELECT id,name,email,phone,role FROM users WHERE id=?',[$db->lastInsertId()])->fetch();response(token($db,$u),201);}
if($path==='login'&&$method==='POST'){$data=body();$u=q($db,'SELECT * FROM users WHERE email=?',[strtolower(trim((string)($data['email']??'')))])->fetch();if(!$u||!password_verify((string)($data['password']??''),$u['password_hash']))fail('Incorrect email or password',401);if($u['role']!=='owner')fail('Player login is temporarily disabled',403);response(token($db,$u));}
// Public listing: only visible venues, and count only visible courts.
if ($path === 'venues' && $method === 'GET') {
    $rows = q($db, 'SELECT v.id, v.name, v.city, v.address, v.description,
            v.phone, v.image_url, v.gcash_number, v.gcash_qr_url,
            COUNT(c.id) AS court_count,
            COALESCE(MIN(c.day_rate), 0) AS price_from,
            MAX(CASE WHEN c.facebook_live_active = 1 AND LENGTH(c.facebook_live_url) > 0 THEN 1 ELSE 0 END) AS has_live_court
        FROM venues v
        LEFT JOIN courts c ON c.venue_id = v.id AND c.is_active = 1
        WHERE v.is_active = 1
        GROUP BY v.id
        ORDER BY v.id DESC')->fetchAll();
    response(['venues' => $rows]);
}

// Public detail page: never reference an undefined $court variable.
if (preg_match('#^venues/(\d+)$#', $path, $m) && $method === 'GET') {
    $venueId = (int)$m[1];
    $venue = q($db, 'SELECT v.*, COUNT(c.id) AS court_count,
            COALESCE(MIN(c.day_rate), 0) AS price_from
        FROM venues v
        LEFT JOIN courts c ON c.venue_id = v.id AND c.is_active = 1
        WHERE v.id = ? AND v.is_active = 1
        GROUP BY v.id', [$venueId])->fetch();
    if (!$venue) fail('Venue not found or unavailable', 404);

    $courts = q($db, 'SELECT id, name, day_rate, night_rate, open_hour, close_hour, terms_and_conditions, facebook_live_url, facebook_live_active
        FROM courts WHERE venue_id = ? AND is_active = 1 ORDER BY id', [$venueId])->fetchAll();
    response(['venue' => $venue, 'courts' => $courts]);
}

if($path==='availability'&&$method==='GET'){$venue=(int)($_GET['venue_id']??0);$date=(string)($_GET['date']??'');if(!$venue||!validDate($date))fail('Valid venue and YYYY-MM-DD date required');$courts=q($db,'SELECT c.* FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.venue_id=? AND c.is_active=1 AND v.is_active=1',[$venue])->fetchAll();$taken=q($db,'SELECT bs.court_id,bs.hour FROM booking_slots bs JOIN courts c ON c.id=bs.court_id WHERE c.venue_id=? AND bs.booking_date=?',[$venue,$date])->fetchAll();$blocked=q($db,'SELECT b.court_id,b.hour FROM blocked_slots b JOIN courts c ON c.id=b.court_id WHERE c.venue_id=? AND b.booking_date=?',[$venue,$date])->fetchAll();$busy=array_fill_keys(array_map(fn($x)=>$x['court_id'].'-'.$x['hour'],$taken),true);$blocks=array_fill_keys(array_map(fn($x)=>$x['court_id'].'-'.$x['hour'],$blocked),true);$slots=[];foreach($courts as $c)for($h=0;$h<24;$h++){$k=$c['id'].'-'.$h;$status=($h<(int)$c['open_hour']||$h>=(int)$c['close_hour']||!currentCheck($date,$h))?'closed':(isset($blocks[$k])?'blocked':(isset($busy[$k])?'booked':'available'));$slots[]=['court_id'=>(int)$c['id'],'hour'=>$h,'price'=>(float)($h>=17?$c['night_rate']:$c['day_rate']),'status'=>$status];}response(['slots'=>$slots]);}
if($path==='bookings'&&$method==='GET'){$u=user($db,'player');$rows=q($db,"SELECT b.*,(SELECT GROUP_CONCAT(bs.hour ORDER BY bs.hour SEPARATOR ',') FROM booking_slots bs WHERE bs.booking_id=b.id) selected_hours,c.name court_name,v.name venue_name FROM bookings b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id WHERE b.player_id=? ORDER BY b.created_at DESC",[$u['id']])->fetchAll();response(['bookings'=>$rows]);}
// Start guest payment: temporarily hold the chosen court slots, without a screenshot yet.
if ($path==='bookings' && $method==='POST') {
    $d=body();
    $courtId=(int)($d['court_id']??0);$date=(string)($d['booking_date']??'');
    $name=trim((string)($d['full_name']??''));
    $email=strtolower(trim((string)($d['email']??'')));
    $phone=trim((string)($d['contact_number']??''));
    $hours=$d['selected_hours']??null;
    $discountCode=trim((string)($d['discount_code']??''));
    if (!$courtId || !validDate($date) || mb_strlen($name)<2 || mb_strlen($name)>150 ||
        !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($email)>190 ||
        !preg_match('/^[0-9+() .-]{7,32}$/',$phone)) fail('Enter valid guest details',400);
    if(!is_array($hours)||count($hours)<1||count($hours)>12) fail('Select 1–12 hourly slots',400);
    foreach($hours as $h)if(!is_int($h)||$h<0||$h>23)fail('Invalid hour',400);
    if(count(array_unique($hours))!==count($hours))fail('Duplicate time slots',400);
    sort($hours,SORT_NUMERIC);
    $plain=bin2hex(random_bytes(32));$tokenHash=hash('sha256',$plain);
    $minutes=max(3,min(5,(int)($env['PAYMENT_HOLD_MINUTES']??5)));
    $db->beginTransaction();
    try {
        // Lock the venue before the court to serialize with hide/restore actions.
        $courtVenueId = q($db, 'SELECT venue_id FROM courts WHERE id=?', [$courtId])->fetchColumn();
        if (!$courtVenueId) { $db->rollBack(); fail('Court not found', 404); }
        $venue = q($db, 'SELECT id, is_active, gcash_number, gcash_qr_url FROM venues WHERE id=? FOR UPDATE', [(int)$courtVenueId])->fetch();
        $court = q($db, 'SELECT * FROM courts WHERE id=? FOR UPDATE', [$courtId])->fetch();
        if (!$venue || !$court || (int)$court['venue_id'] !== (int)$courtVenueId
            || (int)$venue['is_active'] !== 1 || (int)$court['is_active'] !== 1) {
            $db->rollBack();
            fail('This court or venue is not available for new bookings', 409);
        }
        $subtotalCents=0;
        foreach($hours as $h){
            if($h<(int)$court['open_hour']||$h>=(int)$court['close_hour']||!currentCheck($date,$h)){
                $db->rollBack();fail('Selected hours are no longer available',409);
            }
            if(q($db,'SELECT id FROM blocked_slots WHERE court_id=? AND booking_date=? AND hour=?',[$courtId,$date,$h])->fetch() ||
               q($db,'SELECT id FROM booking_slots WHERE court_id=? AND booking_date=? AND hour=?',[$courtId,$date,$h])->fetch()) {
                $db->rollBack();fail('A selected hour is occupied. Refresh availability.',409);
            }
            $subtotalCents+=(int)round((float)($h>=17?$court['night_rate']:$court['day_rate'])*100);
        }
        $discount=null;
        $discountCents=0;
        if($discountCode!==''){
            $discount=pvLookupDiscount($db,(int)$court['venue_id'],$discountCode,$subtotalCents,count($hours),true);
            $discountCents=pvDiscountAmount($discount,$subtotalCents);
            // Counts both unpaid holds and confirmed requests, preventing over-redemption.
            q($db,'UPDATE discount_codes SET used_count=used_count+1 WHERE id=?',[(int)$discount['id']]);
        }
        $totalCents=$subtotalCents-$discountCents;
        $total=number_format($totalCents/100,2,'.','');
        $subtotal=number_format($subtotalCents/100,2,'.','');
        $saved=number_format($discountCents/100,2,'.','');
        $free=$totalCents===0;
        if(!$free && empty($venue['gcash_number']) && empty($venue['gcash_qr_url'])){
            $db->rollBack();fail('Court owner has not configured GCash payment details',409);
        }
        $bookingStatus=$free?'pending':'awaiting_payment';
        $deadlineSql=$free?'NULL':"DATE_ADD(NOW(), INTERVAL $minutes MINUTE)";
        $accessHash=$free?null:$tokenHash;
        q($db,"INSERT INTO bookings(player_id,court_id,booking_date,start_hour,duration,total_amount,status,payment_reference,guest_name,guest_email,guest_phone,payment_screenshot,payment_deadline,guest_access_hash,subtotal_amount,discount_amount,discount_code_id) VALUES(NULL,?,?,?,?,?,?,NULL,?,?,?,NULL,$deadlineSql,?,?,?,?)",[$courtId,$date,min($hours),count($hours),$total,$bookingStatus,$name,$email,$phone,$accessHash,$subtotal,$saved,$discount?(int)$discount['id']:null]);
        $bookingId=(int)$db->lastInsertId();
        foreach($hours as $h)q($db,'INSERT INTO booking_slots(booking_id,court_id,booking_date,hour) VALUES(?,?,?,?)',[$bookingId,$courtId,$date,$h]);
        $deadline=$free?null:q($db,'SELECT payment_deadline FROM bookings WHERE id=?',[$bookingId])->fetchColumn();
        $db->commit();
        if($free){
            pvNotifySafely($db,$env,$bookingId,'submitted');
            response(['booking_id'=>$bookingId,'status'=>'pending','payment_required'=>false,'total_amount'=>0,'subtotal_amount'=>(float)$subtotal,'discount_amount'=>(float)$saved,'selected_hours'=>$hours],201);
        }
        $iso=(new DateTimeImmutable((string)$deadline,new DateTimeZone('Asia/Manila')))->format(DateTimeInterface::ATOM);
        response(['booking_id'=>$bookingId,'guest_token'=>$plain,'payment_deadline'=>$iso,'payment_required'=>true,'total_amount'=>(float)$total,'subtotal_amount'=>(float)$subtotal,'discount_amount'=>(float)$saved,'gcash_number'=>$venue['gcash_number'],'gcash_qr_url'=>$venue['gcash_qr_url'],'selected_hours'=>$hours],201);
    }catch(Throwable $e){
        if($db->inTransaction())$db->rollBack();
        if($e instanceof PDOException && $e->getCode()==='23000') fail('This time slot was just reserved. Refresh availability.',409);
        throw $e;
    }
}
// Guest completes the held booking by uploading payment proof within the deadline.
if(preg_match('#^bookings/(\d+)/payment-proof$#',$path,$m) && $method==='POST') {
    $bookingId=(int)$m[1];$tokenValue=(string)($_POST['guest_token']??'');
    if(!preg_match('/^[a-f0-9]{64}$/',$tokenValue)) fail('Invalid payment session',401);
    $file=$_FILES['payment_screenshot']??null;
    if(!is_array($file)||($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK||!is_uploaded_file($file['tmp_name']??''))fail('GCash screenshot is required',400);
    if((int)$file['size']<1||(int)$file['size']>5*1024*1024)fail('Screenshot must be at most 5 MB',413);
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
    if(!isset($allowed[$mime])||@getimagesize($file['tmp_name'])===false)fail('Only valid JPG, PNG or WebP images are allowed',415);
    $directory=(string)($env['PAYMENT_PROOF_DIR']??'');
    if(!$directory || !is_dir($directory) || !is_writable($directory))fail('Private payment storage is not configured',503);
    $db->beginTransaction();$stored=null;
    try{
        $booking=q($db,'SELECT * FROM bookings WHERE id=? FOR UPDATE',[$bookingId])->fetch();
        if(!$booking || !hash_equals((string)$booking['guest_access_hash'],hash('sha256',$tokenValue))){$db->rollBack();fail('Invalid payment session',401);}
        if($booking['status']!=='awaiting_payment' || strtotime($booking['payment_deadline'].' Asia/Manila')<=time()){
            $db->rollBack();fail('Payment window expired. Please book again.',410);
        }
        $filename=bin2hex(random_bytes(24)).'.'.$allowed[$mime];
        $stored=rtrim($directory,'/').'/'.$filename;
        if(!move_uploaded_file($file['tmp_name'],$stored)) throw new RuntimeException('Could not store the screenshot');
        @chmod($stored,0600);
        q($db,"UPDATE bookings SET status='pending',payment_screenshot=?,guest_access_hash=NULL WHERE id=?",[$filename,$bookingId]);
        $db->commit();
        $stored = null; // Screenshot is now part of a committed booking; do not delete it on later errors.
        // A hold is not a booking notification. Notify both parties only after proof upload.
        pvNotifySafely($db, $env, $bookingId, 'submitted');
        response(['booking_id'=>$bookingId,'status'=>'pending','total_amount'=>(float)$booking['total_amount']],200);
    }catch(Throwable $e){
        if($db->inTransaction())$db->rollBack();
        if($stored && is_file($stored))@unlink($stored);
        throw $e;
    }
}
// Abandon a guest hold immediately instead of waiting for the timer.
if(preg_match('#^bookings/(\d+)/abandon$#',$path,$m) && $method==='POST') {
    $d=body();$tokenValue=(string)($d['guest_token']??'');
    if(!preg_match('/^[a-f0-9]{64}$/',$tokenValue)) fail('Invalid payment session',401);
    $db->beginTransaction();
    try{
        $booking=q($db,'SELECT * FROM bookings WHERE id=? FOR UPDATE',[(int)$m[1]])->fetch();
        if(!$booking || !hash_equals((string)$booking['guest_access_hash'],hash('sha256',$tokenValue))){$db->rollBack();fail('Invalid payment session',401);}
        if($booking['status']==='awaiting_payment')releaseBooking($db,(int)$booking['id'],'expired');
        $db->commit();response(['ok'=>true]);
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
if(preg_match('#^bookings/(\d+)/cancel$#',$path,$m)&&$method==='POST'){
    $u=user($db,'player');$bookingId=(int)$m[1];
    $db->beginTransaction();
    try {
        $b=q($db,'SELECT * FROM bookings WHERE id=? FOR UPDATE',[$bookingId])->fetch();
        if(!$b||$b['player_id']!=$u['id'])fail('Reservation not found',404);
        if(!in_array($b['status'],['pending','approved'],true))fail('Booking cannot be cancelled');
        $hours=array_map('intval',q($db,'SELECT hour FROM booking_slots WHERE booking_id=? ORDER BY hour',[$bookingId])->fetchAll(PDO::FETCH_COLUMN));
        releaseBooking($db,$bookingId,'cancelled');
        $db->commit();
    } catch(Throwable $e) {if($db->inTransaction())$db->rollBack();throw $e;}
    pvNotifySafely($db,$env,$bookingId,'cancelled',$hours);
    response(['ok'=>true]);
}
if($path==='owner/dashboard'&&$method==='GET'){$u=user($db,'owner');$venues=q($db,'SELECT v.id,v.name,v.city,v.address,v.description,v.phone,v.image_url,v.gcash_number,v.gcash_qr_url,v.is_active,COUNT(c.id) court_count,COALESCE(MIN(c.day_rate),0) price_from FROM venues v LEFT JOIN courts c ON c.venue_id=v.id WHERE v.owner_id=? GROUP BY v.id ORDER BY v.id DESC',[$u['id']])->fetchAll();$bookings=q($db,"SELECT b.*,(SELECT GROUP_CONCAT(bs.hour ORDER BY bs.hour SEPARATOR ',') FROM booking_slots bs WHERE bs.booking_id=b.id) selected_hours,COALESCE(b.guest_name,u.name) player_name,COALESCE(b.guest_email,u.email) player_email,COALESCE(b.guest_phone,u.phone) player_phone,c.name court_name,v.name venue_name,v.id venue_id FROM bookings b LEFT JOIN users u ON u.id=b.player_id JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id WHERE v.owner_id=? AND b.status<>'awaiting_payment' ORDER BY b.created_at DESC",[$u['id']])->fetchAll();response(['venues'=>$venues,'bookings'=>$bookings]);}
// Authenticated owner-only venue image upload (JPEG, PNG, WebP; maximum 5 MB).
if ($path === 'owner/upload-image' && $method === 'POST') {
    $u = user($db, 'owner');
    if (!isset($_FILES['image']) || !is_array($_FILES['image'])) fail('Please select an image', 400);
    $file = $_FILES['image'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail('Image upload failed (check PHP upload limits)', 400);
    if (!is_uploaded_file($file['tmp_name'])) fail('Invalid upload', 400);
    if ((int)$file['size'] < 1 || (int)$file['size'] > 5 * 1024 * 1024) fail('Maximum image size is 5 MB', 413);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($allowed[$mime]) || @getimagesize($file['tmp_name']) === false) fail('Upload a valid JPG, PNG or WebP image', 415);
    $root = dirname(__DIR__);
    $dir = $root . '/uploads/venues';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) fail('Upload directory unavailable', 500);
    $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $filename)) fail('Could not save uploaded image', 500);
    chmod($dir . '/' . $filename, 0644);
    $scheme = 'https'; // This CloudPanel site is HTTPS-only.
    $host = (string)($env['PUBLIC_BASE_URL'] ?? 'https://pickleball.156-67-214-49.sslip.io');
    response(['image_url' => rtrim($host, '/') . '/uploads/venues/' . $filename], 201);
}
if($path==='owner/venues'&&$method==='POST'){$u=user($db,'owner');$d=body();$name=mustString($d,'name',180);$city=mustString($d,'city',130);$address=mustString($d,'address',240);$description=trim((string)($d['description']??''));$phone=trim((string)($d['phone']??''));$image=trim((string)($d['image_url']??''));$gcashNumber=trim((string)($d['gcash_number']??''));$gcashQr=trim((string)($d['gcash_qr_url']??''));if(strlen($gcashNumber)>32||($gcashNumber&&!preg_match('/^[0-9+ ]{8,32}$/',$gcashNumber))||strlen($gcashQr)>500||($gcashQr&&!filter_var($gcashQr,FILTER_VALIDATE_URL)))fail('Invalid GCash details');if(strlen($description)>3000||strlen($phone)>32||strlen($image)>500||($image&&!filter_var($image,FILTER_VALIDATE_URL)))fail('Invalid venue details');q($db,'INSERT INTO venues(owner_id,name,city,address,description,phone,image_url,gcash_number,gcash_qr_url) VALUES(?,?,?,?,?,?,?,?,?)',[$u['id'],$name,$city,$address,$description,$phone,$image?:null,$gcashNumber?:null,$gcashQr?:null]);response(['id'=>(int)$db->lastInsertId()],201);}
if($path==='owner/courts'&&$method==='GET'){
    $u=user($db,'owner');$venueId=(int)($_GET['venue_id']??0);ownerOf($db,$venueId,(int)$u['id']);
    $courts=q($db,'SELECT id,venue_id,name,day_rate,night_rate,open_hour,close_hour,is_active,terms_and_conditions,facebook_live_url,facebook_live_active FROM courts WHERE venue_id=? ORDER BY id',[$venueId])->fetchAll();
    response(['courts'=>$courts]);
}
if(preg_match('#^owner/venues/(\d+)$#',$path,$m)&&$method==='PUT'){
    $u=user($db,'owner');$venueId=(int)$m[1];ownerOf($db,$venueId,(int)$u['id']);$d=body();
    $name=mustString($d,'name',180);$city=mustString($d,'city',130);$address=mustString($d,'address',240);
    $description=trim((string)($d['description']??''));$phone=trim((string)($d['phone']??''));$image=trim((string)($d['image_url']??''));$gcashNumber=trim((string)($d['gcash_number']??''));$gcashQr=trim((string)($d['gcash_qr_url']??''));
    if(strlen($gcashNumber)>32||($gcashNumber&&!preg_match('/^[0-9+ ]{8,32}$/',$gcashNumber))||strlen($gcashQr)>500||($gcashQr&&!filter_var($gcashQr,FILTER_VALIDATE_URL)))fail('Invalid GCash details');
    if(strlen($description)>3000||strlen($phone)>32||strlen($image)>500||($image&&!filter_var($image,FILTER_VALIDATE_URL)))fail('Invalid venue details');
    q($db,'UPDATE venues SET name=?,city=?,address=?,description=?,phone=?,image_url=?,gcash_number=?,gcash_qr_url=? WHERE id=?',[$name,$city,$address,$description,$phone,$image?:null,$gcashNumber?:null,$gcashQr?:null,$venueId]);
    response(['ok'=>true]);
}
if(preg_match('#^owner/courts/(\d+)$#',$path,$m)&&$method==='PUT'){
    $u=user($db,'owner');$id=(int)$m[1];$d=body();
    $name=mustString($d,'name',100);
    $terms = readCourtTerms($d);
    $facebookLiveUrl = readCourtFacebookLiveUrl($d);
    $facebookLiveActive = readCourtFacebookLiveActive($d);
    foreach(['day_rate','night_rate','open_hour','close_hour'] as $field)if(!isset($d[$field])||!is_numeric($d[$field]))fail('Invalid '.$field);
    $day=(float)$d['day_rate'];$night=(float)$d['night_rate'];$open=filter_var($d['open_hour'],FILTER_VALIDATE_INT);$close=filter_var($d['close_hour'],FILTER_VALIDATE_INT);
    if($day<=0||$night<=0||$day>100000||$night>100000||$open===false||$close===false||$open<0||$close>24||$open>=$close)fail('Invalid rates or operating hours');
    $db->beginTransaction();
    try{
        $court=q($db,'SELECT c.id,c.terms_and_conditions,c.facebook_live_url,c.facebook_live_active FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=? AND v.owner_id=? FOR UPDATE',[$id,$u['id']])->fetch();
        if(!$court){$db->rollBack();fail('Court not found or not yours',404);}
        // Never strand future active reservations outside new opening hours.
        $conflict=q($db,"SELECT bs.id FROM booking_slots bs JOIN bookings b ON b.id=bs.booking_id WHERE bs.court_id=? AND b.status IN ('pending','approved') AND (bs.booking_date>CURDATE() OR (bs.booking_date=CURDATE() AND bs.hour>HOUR(NOW()))) AND (bs.hour<? OR bs.hour>=?) LIMIT 1",[$id,$open,$close])->fetch();
        if($conflict){$db->rollBack();fail('Operating hours conflict with an existing future reservation',409);}
        $savedTerms = array_key_exists('terms_and_conditions', $d) ? $terms : $court['terms_and_conditions'];
        $savedFacebookLiveUrl = array_key_exists('facebook_live_url', $d) ? $facebookLiveUrl : $court['facebook_live_url'];
        $savedFacebookLiveActive = $facebookLiveActive ?? (
            $savedFacebookLiveUrl !== null &&
            $savedFacebookLiveUrl === $court['facebook_live_url'] &&
            (bool)$court['facebook_live_active']
        );
        if ($savedFacebookLiveActive && $savedFacebookLiveUrl === null) {
            $db->rollBack();
            fail('Add a Facebook Live link before marking this court live');
        }
        q($db, 'UPDATE courts SET name=?,day_rate=?,night_rate=?,open_hour=?,close_hour=?,terms_and_conditions=?,facebook_live_url=?,facebook_live_active=? WHERE id=?',
            [$name,$day,$night,$open,$close,$savedTerms,$savedFacebookLiveUrl,(int)$savedFacebookLiveActive,$id]);
        $db->commit();response(['ok'=>true]);
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
if ($path === 'owner/courts' && $method === 'POST') {
    $u = user($db, 'owner');
    $d = body();
    $venueId = (int)($d['venue_id'] ?? 0);
    ownerOf($db, $venueId, (int)$u['id']);
    $name = mustString($d, 'name', 100);
    $day = (float)($d['day_rate'] ?? 0);
    $night = (float)($d['night_rate'] ?? 0);
    $open = (int)($d['open_hour'] ?? 8);
    $close = (int)($d['close_hour'] ?? 23);
    if ($day <= 0 || $night <= 0 || $day > 100000 || $night > 100000 || $open < 0 || $close > 24 || $open >= $close) {
        fail('Invalid rates or operating hours');
    }
    $facebookLiveUrl = readCourtFacebookLiveUrl($d);
    $facebookLiveActive = readCourtFacebookLiveActive($d) ?? false;
    if ($facebookLiveActive && $facebookLiveUrl === null) fail('Add a Facebook Live link before marking this court live');
    q($db, 'INSERT INTO courts(venue_id,name,day_rate,night_rate,open_hour,close_hour,terms_and_conditions,facebook_live_url,facebook_live_active) VALUES(?,?,?,?,?,?,?,?,?)',
        [$venueId,$name,$day,$night,$open,$close,readCourtTerms($d),$facebookLiveUrl,(int)$facebookLiveActive]);
    response(['id' => (int)$db->lastInsertId()], 201);
}
// Read one court (owner only).
if (preg_match('#^owner/courts/(\d+)$#', $path, $m) && $method==='GET') {
    $u=user($db,'owner');
    $court=q($db,'SELECT c.id,c.venue_id,c.name,c.day_rate,c.night_rate,c.open_hour,c.close_hour,c.is_active,c.terms_and_conditions,c.facebook_live_url,c.facebook_live_active FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=? AND v.owner_id=?',[(int)$m[1],$u['id']])->fetch();
    if (!$court) fail('Court not found or not yours',404);
    response(['court'=>$court]);
}
// Delete a court only when no booking history exists; prevent lost receipts/history.
if (preg_match('#^owner/courts/(\d+)$#', $path, $m) && $method==='DELETE') {
    $u=user($db,'owner'); $id=(int)$m[1];
    $db->beginTransaction();
    try {
        $court=q($db,'SELECT c.id FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=? AND v.owner_id=? FOR UPDATE',[$id,$u['id']])->fetch();
        if (!$court) { $db->rollBack(); fail('Court not found or not yours',404); }
        if (q($db,'SELECT id FROM bookings WHERE court_id=? LIMIT 1',[$id])->fetch()) {
            $db->rollBack(); fail('Court has booking history. Delete is disabled to preserve reservations and payment records.',409);
        }
        // blocked_slots is ON DELETE CASCADE.
        q($db,'DELETE FROM courts WHERE id=?',[$id]);
        $db->commit(); response(['ok'=>true]);
    } catch(Throwable $e) { if($db->inTransaction()) $db->rollBack(); throw $e; }
}
// Delete empty venue, never delete courts or booking history implicitly.
if (preg_match('#^owner/venues/(\d+)$#', $path, $m) && $method==='DELETE') {
    $u=user($db,'owner'); $id=(int)$m[1];
    $db->beginTransaction();
    try {
        $venue=q($db,'SELECT id FROM venues WHERE id=? AND owner_id=? FOR UPDATE',[$id,$u['id']])->fetch();
        if (!$venue) { $db->rollBack(); fail('Venue not found or not yours',404); }
        if(q($db,'SELECT id FROM courts WHERE venue_id=? LIMIT 1',[$id])->fetch()) {
            $db->rollBack(); fail('Remove all courts before deleting this venue.',409);
        }
        q($db,'DELETE FROM venues WHERE id=?',[$id]);
        $db->commit(); response(['ok'=>true]);
    } catch(Throwable $e) { if($db->inTransaction()) $db->rollBack(); throw $e; }
}
// View maintenance/unavailable slots for the owner's selected court and date.
if($path==='owner/blocked-slots' && $method==='GET') {
    $u=user($db,'owner'); $courtId=(int)($_GET['court_id']??0); $date=(string)($_GET['date']??'');
    if (!$courtId||!validDate($date)) fail('Valid court_id and date required');
    $court=q($db,'SELECT c.id FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=? AND v.owner_id=?',[$courtId,$u['id']])->fetch();
    if(!$court) fail('Court not found or not yours',404);
    $rows=q($db,'SELECT id,court_id,booking_date,hour FROM blocked_slots WHERE court_id=? AND booking_date=? ORDER BY hour',[$courtId,$date])->fetchAll();
    response(['blocked_slots'=>$rows]);
}
// Block a free hour. Lock court to serialize against new bookings.
if($path==='owner/blocked-slots' && $method==='POST') {
    $u=user($db,'owner'); $d=body(); $courtId=(int)($d['court_id']??0); $date=(string)($d['booking_date']??'');
    $hour=filter_var($d['hour']??null,FILTER_VALIDATE_INT);
    if(!$courtId||!validDate($date)||$hour===false||$hour<0||$hour>23||!currentCheck($date,$hour)) fail('Choose a future date and hour');
    $db->beginTransaction();
    try {
        $c=q($db,'SELECT c.* FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=? AND v.owner_id=? FOR UPDATE',[$courtId,$u['id']])->fetch();
        if(!$c) { $db->rollBack(); fail('Court not found or not yours',404); }
        if($hour<(int)$c['open_hour']||$hour>=(int)$c['close_hour']) { $db->rollBack(); fail('Hour outside operating hours',400); }
        if(q($db,'SELECT id FROM booking_slots WHERE court_id=? AND booking_date=? AND hour=?',[$courtId,$date,$hour])->fetch()) {
            $db->rollBack(); fail('Hour is already reserved',409);
        }
        if(q($db,'SELECT id FROM blocked_slots WHERE court_id=? AND booking_date=? AND hour=?',[$courtId,$date,$hour])->fetch()) {
            $db->rollBack(); fail('Hour is already blocked',409);
        }
        q($db,'INSERT INTO blocked_slots(court_id,booking_date,hour) VALUES(?,?,?)',[$courtId,$date,$hour]);
        $id=(int)$db->lastInsertId();$db->commit();response(['id'=>$id],201);
    } catch(Throwable $e) { if($db->inTransaction())$db->rollBack(); if($e instanceof PDOException && $e->getCode()==='23000') fail('Hour is no longer available',409); throw $e; }
}
// Unblock a slot, checking it belongs to this owner.
if(preg_match('#^owner/blocked-slots/(\d+)$#',$path,$m) && $method==='DELETE') {
    $u=user($db,'owner'); $id=(int)$m[1];
    $row=q($db,'SELECT b.id FROM blocked_slots b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id WHERE b.id=? AND v.owner_id=?',[$id,$u['id']])->fetch();
    if(!$row) fail('Blocked slot not found',404);
    q($db,'DELETE FROM blocked_slots WHERE id=?',[$id]);response(['ok'=>true]);
}
// Authenticated owners can view only screenshots from bookings at their own venues.
if (preg_match('#^owner/bookings/(\d+)/payment-proof$#', $path, $m) && $method === 'GET') {
    $u = user($db, 'owner');
    $row = q($db, 'SELECT b.payment_screenshot FROM bookings b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id WHERE b.id=? AND v.owner_id=?', [(int)$m[1], $u['id']])->fetch();
    if (!$row || !$row['payment_screenshot']) fail('Payment screenshot not found', 404);
    $proofDir = (string)($env['PAYMENT_PROOF_DIR'] ?? (dirname(dirname(__DIR__)) . '/private_payment_proofs'));
    $filename = basename((string)$row['payment_screenshot']);
    $filepath = rtrim($proofDir, '/') . '/' . $filename;
    if (!is_file($filepath)) fail('Screenshot file not found', 404);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($filepath);
    if (!in_array($mime, ['image/jpeg','image/png','image/webp'], true)) fail('Invalid stored screenshot', 500);
    header('Content-Type: ' . $mime);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($filepath);
    exit;
}
if(preg_match('#^owner/bookings/(\d+)/(approve|reject|cancel)$#',$path,$m)&&$method==='POST'){
    $u=user($db,'owner');$bookingId=(int)$m[1];$action=$m[2];
    $db->beginTransaction();
    try {
        $b=q($db,'SELECT b.* FROM bookings b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id WHERE b.id=? AND v.owner_id=? FOR UPDATE',[$bookingId,$u['id']])->fetch();
        if(!$b)fail('Reservation not found',404);
        if($b['status']!=='pending' && !($action==='cancel' && $b['status']==='approved' && ($b['booking_source']??'online')==='walkin'))fail('Only pending bookings or confirmed walk-in cancellations can be updated',409);
        // Capture exact non-consecutive hours before releaseBooking deletes the rows.
        $hours=array_map('intval',q($db,'SELECT hour FROM booking_slots WHERE booking_id=? ORDER BY hour',[$bookingId])->fetchAll(PDO::FETCH_COLUMN));
        if($action==='approve')q($db,"UPDATE bookings SET status='approved' WHERE id=?",[$bookingId]);
        else releaseBooking($db,$bookingId,$action==='reject'?'rejected':'cancelled');
        $db->commit();
    } catch(Throwable $e) {if($db->inTransaction())$db->rollBack();throw $e;}
    $event=match($action){'approve'=>'approved','reject'=>'rejected','cancel'=>'cancelled'};
    pvNotifySafely($db,$env,$bookingId,$event,$hours);
    response(['ok'=>true]);
}

// POST /owner/blocked-slots/batch: block exact hours, including nonconsecutive hours.
if ($path === 'owner/blocked-slots/batch' && $method === 'POST') {
    $u = user($db, 'owner');
    $d = body();
    $courtId = (int)($d['court_id'] ?? 0);
    $date = (string)($d['booking_date'] ?? '');
    $hours = $d['selected_hours'] ?? null;

    if ($courtId < 1 || !validDate($date)) fail('Valid court and YYYY-MM-DD date required', 400);
    if (!is_array($hours) || count($hours) < 1 || count($hours) > 24) fail('Select 1–24 hourly slots', 400);
    foreach ($hours as $hour) {
        if (!is_int($hour) || $hour < 0 || $hour > 23) fail('Invalid hour', 400);
    }
    if (count(array_unique($hours)) !== count($hours)) fail('Duplicate time slots', 400);
    sort($hours, SORT_NUMERIC);

    $db->beginTransaction();
    try {
        $ownerVenueId = q($db,
            'SELECT v.id FROM venues v JOIN courts c ON c.venue_id=v.id WHERE c.id=? AND v.owner_id=?',
            [$courtId, $u['id']]
        )->fetchColumn();
        if (!$ownerVenueId) { $db->rollBack(); fail('Court not found or not yours', 404); }
        // Use the same venue -> court locking order as online bookings.
        q($db, 'SELECT id FROM venues WHERE id=? FOR UPDATE', [(int)$ownerVenueId])->fetch();
        $court = q($db, 'SELECT * FROM courts WHERE id=? AND venue_id=? FOR UPDATE', [$courtId, (int)$ownerVenueId])->fetch();
        if (!$court) { $db->rollBack(); fail('Court not found or not yours', 404); }

        foreach ($hours as $hour) {
            if ($hour < (int)$court['open_hour'] || $hour >= (int)$court['close_hour'] || !currentCheck($date, $hour)) {
                $db->rollBack(); fail('Selected hour is outside future operating hours', 409);
            }
            if (q($db, 'SELECT id FROM booking_slots WHERE court_id=? AND booking_date=? AND hour=?', [$courtId, $date, $hour])->fetch()) {
                $db->rollBack(); fail('A selected hour is already booked', 409);
            }
            if (q($db, 'SELECT id FROM blocked_slots WHERE court_id=? AND booking_date=? AND hour=?', [$courtId, $date, $hour])->fetch()) {
                $db->rollBack(); fail('A selected hour is already blocked', 409);
            }
        }
        foreach ($hours as $hour) {
            q($db, 'INSERT INTO blocked_slots(court_id,booking_date,hour) VALUES(?,?,?)', [$courtId, $date, $hour]);
        }
        $db->commit();
        response(['ok'=>true, 'court_id'=>$courtId, 'booking_date'=>$date, 'selected_hours'=>$hours], 201);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') fail('Time slot was just reserved', 409);
        throw $e;
    }
}

// POST /owner/walkin-bookings: immediately approve an in-person booking with no GCash screenshot.
if ($path === 'owner/walkin-bookings' && $method === 'POST') {
    $u = user($db, 'owner');
    $d = body();
    $courtId = (int)($d['court_id'] ?? 0);
    $date = (string)($d['booking_date'] ?? '');
    $hours = $d['selected_hours'] ?? null;
    $name = trim((string)($d['full_name'] ?? ''));
    $email = strtolower(trim((string)($d['email'] ?? '')));
    $phone = trim((string)($d['contact_number'] ?? ''));

    if ($courtId < 1 || !validDate($date)) fail('Valid court and YYYY-MM-DD date required', 400);
    if (mb_strlen($name) < 2 || mb_strlen($name) > 150) fail('Enter a valid customer name', 400);
    if ($email !== '' && (strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL))) fail('Invalid email', 400);
    if ($phone !== '' && !preg_match('/^[0-9+() .-]{7,32}$/', $phone)) fail('Invalid phone number', 400);
    if (!is_array($hours) || count($hours) < 1 || count($hours) > 12) fail('Select 1–12 hourly slots', 400);
    foreach ($hours as $hour) {
        if (!is_int($hour) || $hour < 0 || $hour > 23) fail('Invalid hour', 400);
    }
    if (count(array_unique($hours)) !== count($hours)) fail('Duplicate time slots', 400);
    sort($hours, SORT_NUMERIC);

    $db->beginTransaction();
    try {
        $ownerVenueId = q($db,
            'SELECT v.id FROM venues v JOIN courts c ON c.venue_id=v.id WHERE c.id=? AND v.owner_id=?',
            [$courtId, $u['id']]
        )->fetchColumn();
        if (!$ownerVenueId) { $db->rollBack(); fail('Court not found or not yours', 404); }
        // Use the same venue -> court locking order as online bookings.
        q($db, 'SELECT id FROM venues WHERE id=? FOR UPDATE', [(int)$ownerVenueId])->fetch();
        $court = q($db, 'SELECT * FROM courts WHERE id=? AND venue_id=? FOR UPDATE', [$courtId, (int)$ownerVenueId])->fetch();
        if (!$court) { $db->rollBack(); fail('Court not found or not yours', 404); }
        $total = 0.0;
        foreach ($hours as $hour) {
            if ($hour < (int)$court['open_hour'] || $hour >= (int)$court['close_hour'] || !currentCheck($date, $hour)) {
                $db->rollBack(); fail('Selected hour is outside future operating hours', 409);
            }
            if (q($db, 'SELECT id FROM booking_slots WHERE court_id=? AND booking_date=? AND hour=?', [$courtId, $date, $hour])->fetch()) {
                $db->rollBack(); fail('A selected hour is already booked', 409);
            }
            if (q($db, 'SELECT id FROM blocked_slots WHERE court_id=? AND booking_date=? AND hour=?', [$courtId, $date, $hour])->fetch()) {
                $db->rollBack(); fail('A selected hour is blocked', 409);
            }
            $total += (float)($hour >= 17 ? $court['night_rate'] : $court['day_rate']);
        }
        q($db,
            "INSERT INTO bookings(player_id,court_id,booking_date,start_hour,duration,total_amount,status,payment_reference,guest_name,guest_email,guest_phone,payment_screenshot,payment_deadline,guest_access_hash,booking_source) VALUES(NULL,?,?,?,?,?,'approved',NULL,?,?,?,NULL,NOW(),NULL,'walkin')",
            [$courtId, $date, min($hours), count($hours), $total, $name, $email ?: null, $phone ?: null]
        );
        $bookingId = (int)$db->lastInsertId();
        foreach ($hours as $hour) {
            q($db, 'INSERT INTO booking_slots(booking_id,court_id,booking_date,hour) VALUES(?,?,?,?)', [$bookingId, $courtId, $date, $hour]);
        }
        $db->commit();
        // Walk-in bookings do not send the online GCash payment notifications.
        response(['ok'=>true, 'booking_id'=>$bookingId, 'booking_source'=>'walkin', 'status'=>'approved', 'booking_date'=>$date, 'selected_hours'=>$hours, 'total_amount'=>$total], 201);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') fail('A selected hour was just reserved', 409);
        throw $e;
    }
}


// Owner: hide/restore a single court. Bookings/history remain untouched.
if (preg_match('#^owner/courts/(\d+)/visibility$#', $path, $m) && $method === 'POST') {
    $u = user($db, 'owner');
    $data = body();
    if (!isset($data['is_active']) || !is_bool($data['is_active'])) {
        fail('is_active must be true or false', 400);
    }
    $courtId = (int)$m[1];
    $db->beginTransaction();
    try {
        $venueId = q($db, 'SELECT v.id FROM venues v JOIN courts c ON c.venue_id=v.id
            WHERE c.id=? AND v.owner_id=?', [$courtId, $u['id']])->fetchColumn();
        if (!$venueId) { $db->rollBack(); fail('Court not found or not yours', 404); }
        q($db, 'SELECT id FROM venues WHERE id=? FOR UPDATE', [(int)$venueId])->fetch();
        $court = q($db, 'SELECT id FROM courts WHERE id=? AND venue_id=? FOR UPDATE', [$courtId, (int)$venueId])->fetch();
        if (!$court) { $db->rollBack(); fail('Court not found or not yours', 404); }
        q($db, 'UPDATE courts SET is_active=? WHERE id=?', [$data['is_active'] ? 1 : 0, $courtId]);
        $db->commit();
        response(['ok'=>true, 'court_id'=>$courtId, 'is_active'=>$data['is_active']]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

// Owner: hide/restore an entire venue, without deleting courts or booking history.
if (preg_match('#^owner/venues/(\d+)/visibility$#', $path, $m) && $method === 'POST') {
    $u = user($db, 'owner');
    $data = body();
    if (!isset($data['is_active']) || !is_bool($data['is_active'])) {
        fail('is_active must be true or false', 400);
    }
    $venueId = (int)$m[1];
    $db->beginTransaction();
    try {
        $venue = q($db, 'SELECT id FROM venues WHERE id=? AND owner_id=? FOR UPDATE', [$venueId, $u['id']])->fetch();
        if (!$venue) { $db->rollBack(); fail('Venue not found or not yours', 404); }
        q($db, 'UPDATE venues SET is_active=? WHERE id=?', [$data['is_active'] ? 1 : 0, $venueId]);
        $db->commit();
        response(['ok'=>true, 'venue_id'=>$venueId, 'is_active'=>$data['is_active']]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

fail('Endpoint not found',404);
}catch(PDOException $e){if($db->inTransaction())$db->rollBack();error_log($e->getMessage());fail('Database operation failed',500);}catch(Throwable $e){if($db->inTransaction())$db->rollBack();error_log($e->getMessage());fail('Unexpected server error',500);}
