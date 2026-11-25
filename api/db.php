<?php
// ========================================================
// KONEKSI DATABASE MYSQL XAMPP / HOSTING
// Sistem Presensi MAN 1 Bulukumba
// ========================================================

// Abaikan peringatan deprecation (seperti curl_close di PHP 8.5) agar tidak merusak output JSON
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);

// Set zona waktu default ke WITA (Asia/Makassar / UTC+8) untuk Bulukumba, Sulsel
date_default_timezone_set('Asia/Makassar');

// Keamanan CORS & Security Headers Dinamis
$origin = isset($_SERVER['HTTP_ORIGIN']) ? trim($_SERVER['HTTP_ORIGIN']) : '';
$currentHost = isset($_SERVER['HTTP_HOST']) ? preg_replace('/:\d+$/', '', trim($_SERVER['HTTP_HOST'])) : '';

$isAllowedOrigin = false;
if (!empty($origin)) {
    $parsedOrigin = parse_url($origin);
    $originHost = $parsedOrigin['host'] ?? '';

    // Izinkan jika origin sama dengan domain host, localhost, atau jaringan lokal sekolah (192.168.x.x, 10.x.x.x, 127.0.0.1)
    if ($originHost === $currentHost
        || in_array($originHost, ['localhost', '127.0.0.1'])
        || filter_var($originHost, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        $isAllowedOrigin = true;
    }
}

if ($isAllowedOrigin) {
    header("Access-Control-Allow-Origin: {$origin}");
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
} else if (!empty($origin)) {
    // External origin yang tidak diizinkan: batasi ke domain host saat ini
    $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https://' : 'http://';
    header("Access-Control-Allow-Origin: {$protocol}{$currentHost}");
    header("Vary: Origin");
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, If-None-Match");
header("Access-Control-Expose-Headers: ETag");
header("Content-Type: application/json; charset=UTF-8");

// HTTP Security Headers (Pertahanan Berlapis / Defense-in-Depth)
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("Referrer-Policy: strict-origin-when-cross-origin");

// Helper Caching HTTP 304 Not Modified untuk menghemat bandwidth & CPU
function sendJsonWithETag($data, $maxAge = 5) {
    $json = json_encode($data);
    $etag = '"' . md5($json) . '"';
    header("ETag: {$etag}");
    header("Cache-Control: private, max-age={$maxAge}, must-revalidate");

    $ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
    if ($ifNoneMatch === $etag) {
        http_response_code(304);
        exit();
    }

    echo $json;
    exit();
}

// Handle CORS Preflight request
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$db_host = 'localhost';
$db_name = 'db_absensi_man1';
$db_user = 'root';
$db_pass = ''; // Default XAMPP password kosong (sesuaikan saat upload ke shared hosting)

try {
    $pdo = new PDO("mysql:host={$db_host};dbname={$db_name};charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    // Sinkronkan zona waktu sesi MySQL ke WITA (UTC+08:00)
    try {
        $pdo->exec("SET time_zone = '+08:00'");
    } catch (Exception $e) {}
} catch (PDOException $e) {
    // Catat log detail di server secara aman tanpa mengekspos kredensial ke publik
    error_log("Database Connection Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Gagal terhubung ke database server. Silakan pastikan konfigurasi database di api/db.php sudah benar.'
    ]);
    exit();
}
