<?php
declare(strict_types=1);
// Run via PHP CLI once per minute. Keep this script outside the public document root.
date_default_timezone_set('Asia/Manila');
$path = getenv('PIKLVENUE_ENV_FILE') ?: dirname(__DIR__) . '/.env';
if (!is_file($path)) {fwrite(STDERR, "PiklVenue .env not found\n"); exit(1);}
$env=[];
foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
    [$key,$val]=explode('=',$line,2);
    $env[trim($key)]=trim($val," \t\r\n\"'");
}
try {
    $pdo=new PDO('mysql:host='.($env['DB_HOST']??'127.0.0.1').';port='.($env['DB_PORT']??3306).';dbname='.($env['DB_NAME']??'').';charset=utf8mb4', $env['DB_USER']??'', $env['DB_PASS']??'', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("SET time_zone = '+08:00'");
    $pdo->beginTransaction();
    // Restore discount capacity for payment holds which expired without a screenshot.
    $expired=$pdo->query("SELECT id,discount_code_id,discount_released FROM bookings WHERE status='awaiting_payment' AND payment_deadline<=NOW() FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
    $release=$pdo->prepare('UPDATE discount_codes SET used_count=GREATEST(0,used_count-1) WHERE id=?');
    $mark=$pdo->prepare('UPDATE bookings SET discount_released=1 WHERE id=?');
    foreach($expired as $booking){
        if($booking['discount_code_id']!==null && (int)$booking['discount_released']===0){
            $release->execute([(int)$booking['discount_code_id']]);
            $mark->execute([(int)$booking['id']]);
        }
    }
    $pdo->exec("UPDATE bookings SET status='expired' WHERE status='awaiting_payment' AND payment_deadline<=NOW()");
    $pdo->exec("DELETE bs FROM booking_slots bs INNER JOIN bookings b ON bs.booking_id=b.id WHERE b.status='expired'");
    $pdo->commit();
} catch (Throwable $e) {
    if(isset($pdo) && $pdo->inTransaction())$pdo->rollBack();
    error_log('PiklVenue expiry cron: '.$e->getMessage());exit(1);
}
