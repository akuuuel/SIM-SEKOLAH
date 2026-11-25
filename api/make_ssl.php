<?php
/**
 * Generator Sertifikat SSL RSA 2048-bit (SHA-256 + SAN) untuk Vite HTTPS Dev Server
 * MAN 1 Bulukumba
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die(json_encode(['success' => false, 'error' => 'Akses ditolak: Skrip ini hanya dapat dijalankan melalui CLI.']));
}

$sslDir = __DIR__ . '/../ssl';
if (!is_dir($sslDir)) {
    mkdir($sslDir, 0777, true);
}

// Buat custom OpenSSL config temporer untuk memastikan SHA-256 dan SAN (Subject Alternative Names)
$tempCnfPath = $sslDir . '/openssl_san.cnf';
$ipAddress = '192.168.0.137';

$cnfContent = <<<EOT
[ req ]
default_bits        = 2048
default_md          = sha256
distinguished_name  = req_distinguished_name
prompt              = no
x509_extensions     = v3_req

[ req_distinguished_name ]
C                   = ID
ST                  = Sulawesi Selatan
L                   = Bulukumba
O                   = MAN 1 Bulukumba
OU                  = Web Absensi
CN                  = {$ipAddress}

[ v3_req ]
basicConstraints    = CA:FALSE
keyUsage            = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage    = serverAuth, clientAuth
subjectAltName      = @alt_names

[ alt_names ]
IP.1                = {$ipAddress}
IP.2                = 127.0.0.1
DNS.1               = localhost
EOT;

file_put_contents($tempCnfPath, $cnfContent);
putenv("OPENSSL_CONF=" . $tempCnfPath);

$config = [
    'config'           => $tempCnfPath,
    'digest_alg'       => 'sha256',
    'private_key_bits' => 2048,
    'private_key_type' => OPENSSL_KEYTYPE_RSA,
];

// 1. Generate 2048-bit RSA Private Key
$privkey = openssl_pkey_new($config);
if (!$privkey) {
    die(json_encode(['success' => false, 'error' => 'Gagal generate RSA key.']));
}

// 2. Generate CSR
$dn = [
    "countryName"            => "ID",
    "stateOrProvinceName"    => "Sulawesi Selatan",
    "localityName"           => "Bulukumba",
    "organizationName"       => "MAN 1 Bulukumba",
    "organizationalUnitName" => "Web Absensi",
    "commonName"             => $ipAddress,
];

$csr = openssl_csr_new($dn, $privkey, $config);

// 3. Self-sign Certificate (valid 10 tahun / 3650 hari) dengan SHA-256
$sscert = openssl_csr_sign($csr, null, $privkey, 3650, $config);

// 4. Export PEM
$pkeyout = '';
$certout = '';
openssl_pkey_export($privkey, $pkeyout, null, $config);
openssl_x509_export($sscert, $certout);

file_put_contents($sslDir . '/server.key', $pkeyout);
file_put_contents($sslDir . '/server.crt', $certout);

// Bersihkan file cnf temporer
@unlink($tempCnfPath);

// Inisialisasi juga VAPID key jika belum ada
require_once __DIR__ . '/web_push.php';
$vapid = getOrGenerateVapidKeys();

echo json_encode([
    'success' => true,
    'message' => 'Sertifikat SSL 2048-bit SHA-256 + SAN berhasil dibuat di folder ssl/',
    'key'     => $sslDir . '/server.key',
    'crt'     => $sslDir . '/server.crt',
    'vapid'   => !empty($vapid['publicKey'])
]);
