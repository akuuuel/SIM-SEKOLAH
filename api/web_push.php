<?php
/**
 * Pure PHP Web Push Notification Engine (RFC 8291 / RFC 8292 / VAPID)
 * Madrasah Aliyah Negeri 1 Bulukumba
 * 
 * Pengiriman Notifikasi Langsung ke Browser HP Android / PWA
 * Membangunkan Service Worker di Layar Kunci HP Saat Aplikasi Ditutup Total!
 */

// Sembunyikan pesan deprecation (seperti curl_close di PHP 8.5+) agar tidak merusak output JSON
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);

define('VAPID_FILE', __DIR__ . '/vapid.json');

/**
 * Konfigurasi Path OpenSSL untuk Windows XAMPP
 */
function getOpenSslConfigPath() {
    static $detected = null;
    if ($detected !== null) return $detected;

    $candidates = [
        'C:/xampp.new/apache/conf/openssl.cnf',
        'C:/xampp.new/php/extras/ssl/openssl.cnf',
        'C:/xampp/apache/conf/openssl.cnf',
        'C:/xampp/php/extras/ssl/openssl.cnf',
    ];
    foreach ($candidates as $cand) {
        if (file_exists($cand)) {
            $detected = $cand;
            @putenv("OPENSSL_CONF={$cand}");
            return $detected;
        }
    }
    return null;
}

// Inisialisasi awal config OpenSSL
getOpenSslConfigPath();

/**
 * Base64URL encoder (RFC 7515 / RFC 8291)
 */
function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/**
 * Base64URL decoder (RFC 7515 / RFC 8291)
 * Menambahkan padding '=' yang wajib ada agar PHP base64_decode tidak kehilangan byte terakhir
 */
function base64UrlDecode($data) {
    $data = trim($data);
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $padlen = 4 - $remainder;
        $data .= str_repeat('=', $padlen);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

/**
 * Konversi DER ASN.1 signature dari openssl_sign ke format IEEE P1363 (64 bytes R||S)
 */
function derToRawSignature($der) {
    if (strlen($der) < 8 || ord($der[0]) !== 0x30) {
        return str_pad($der, 64, "\0");
    }
    $pos = 2;
    if (ord($der[1]) & 0x80) {
        $pos += (ord($der[1]) & 0x7f);
    }
    if ($pos >= strlen($der) || ord($der[$pos]) !== 0x02) {
        return str_pad($der, 64, "\0");
    }
    $rLen = ord($der[$pos + 1]);
    $r = substr($der, $pos + 2, $rLen);
    $pos += 2 + $rLen;
    if ($pos >= strlen($der) || ord($der[$pos]) !== 0x02) {
        return str_pad($der, 64, "\0");
    }
    $sLen = ord($der[$pos + 1]);
    $s = substr($der, $pos + 2, $sLen);

    // Hilangkan leading zero byte yang ditambahkan DER untuk bilangan positif
    $r = ltrim($r, "\x00");
    $s = ltrim($s, "\x00");
    $r = str_pad($r, 32, "\x00", STR_PAD_LEFT);
    $s = str_pad($s, 32, "\x00", STR_PAD_LEFT);
    return $r . $s;
}

/**
 * Ambil atau generate pasangan kunci VAPID NIST P-256 (RFC 8292)
 */
function getOrGenerateVapidKeys() {
    if (file_exists(VAPID_FILE)) {
        $saved = @json_decode(@file_get_contents(VAPID_FILE), true);
        if ($saved && !empty($saved['publicKey']) && !empty($saved['privateKey'])) {
            return $saved;
        }
    }

    $cnf = getOpenSslConfigPath();
    $config = [
        'curve_name'       => 'prime256v1',
        'private_key_type' => OPENSSL_KEYTYPE_EC,
    ];
    if ($cnf) {
        $config['config'] = $cnf;
    }

    $res = @openssl_pkey_new($config);
    if ($res) {
        $details = @openssl_pkey_get_details($res);
        if ($details && isset($details['ec'])) {
            $ec = $details['ec'];
            $pubRaw = "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
            $privRaw = str_pad($ec['d'], 32, "\0", STR_PAD_LEFT);

            $privatePem = '';
            @openssl_pkey_export($res, $privatePem, null, $config);

            $keys = [
                'publicKey'  => base64UrlEncode($pubRaw),
                'privateKey' => base64UrlEncode($privRaw),
                'privatePem' => $privatePem,
                'subject'    => 'mailto:admin@man1bulukumba.sch.id',
            ];
            @file_put_contents(VAPID_FILE, json_encode($keys, JSON_PRETTY_PRINT));
            return $keys;
        }
    }

    // Pasangan Kunci NIST P-256 Valid dan Teruji untuk Fallback jika OpenSSL keygen terkendala
    $fallbackPubRaw  = "\x04\x38\xb5\x1e\x88\x3a\x96\x42\x3a\x1b\x90\x02\x47\x9d\x41\xd1\x32\x72\x05\xaa\xc2\x62\x0e\xaa\xb1\x40\xb6\xeb\x5e\x01\x19\xd4\xdc\x83\x4d\x4f\x7f\x83\xa3\x79\xa4\x19\x53\x99\xb4\xa2\x70\x08\x1e\x9f\xba\x45\x2e\xc5\x19\x5f\x60\xd2\x9d\x9e\xa6\x0c\x83\x12\x3b";
    $fallbackPrivRaw = "\x1e\x7a\x6a\xb9\x51\x62\x95\xbb\x01\x1a\x38\xbd\xa9\xa9\xd3\x52\x9e\x71\x8a\x27\x5e\x35\x0a\x37\x3b\x8d\x4e\x84\x2e\x54\xb1\x05";

    $sec1Der = "\x30\x77\x02\x01\x01\x04\x20" . $fallbackPrivRaw . "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\xa1\x44\x03\x42\x00" . $fallbackPubRaw;
    $fallbackPem = "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($sec1Der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";

    $fallback = [
        'publicKey'  => base64UrlEncode($fallbackPubRaw),
        'privateKey' => base64UrlEncode($fallbackPrivRaw),
        'privatePem' => $fallbackPem,
        'subject'    => 'mailto:admin@man1bulukumba.sch.id',
    ];
    @file_put_contents(VAPID_FILE, json_encode($fallback, JSON_PRETTY_PRINT));
    return $fallback;
}

/**
 * Buat JWT VAPID Authorization Header (RFC 8292 ES256)
 */
function createVapidJwt($audience, $subject, $publicKey, $privateKey, $privatePem = null) {
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = base64UrlEncode(json_encode([
        'aud' => $audience,
        'exp' => time() + 43200, // 12 jam (mencegah penolakan Google FCM jika jam server selisih beberapa detik)
        'sub' => $subject,
    ]));

    $signingInput = "{$header}.{$claims}";

    $pkey = false;
    if (!empty($privatePem)) {
        $pkey = @openssl_pkey_get_private($privatePem);
    }

    if (!$pkey) {
        $privRaw = base64UrlDecode($privateKey);
        $pubRaw  = base64UrlDecode($publicKey);
        $der = "\x30\x77\x02\x01\x01\x04\x20" . $privRaw . "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\xa1\x44\x03\x42\x00" . $pubRaw;
        $pem = "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
        $pkey = @openssl_pkey_get_private($pem);
    }

    if (!$pkey) {
        return "{$signingInput}." . base64UrlEncode('dummy-sig');
    }

    $signature = '';
    @openssl_sign($signingInput, $signature, $pkey, OPENSSL_ALGO_SHA256);
    $rawSig = derToRawSignature($signature);

    return "{$signingInput}." . base64UrlEncode($rawSig);
}

/**
 * Enkripsi payload notifikasi Web Push (RFC 8291 aes128gcm)
 */
function encryptWebPushPayload($plaintext, $clientP256dh, $clientAuth) {
    $clientPub = base64UrlDecode($clientP256dh);
    $clientSecret = base64UrlDecode($clientAuth);

    if (strlen($clientPub) !== 65 || strlen($clientSecret) !== 16) {
        return false;
    }

    $cnf = getOpenSslConfigPath();
    $config = [
        'curve_name'       => 'prime256v1',
        'private_key_type' => OPENSSL_KEYTYPE_EC,
    ];
    if ($cnf) {
        $config['config'] = $cnf;
    }

    $localKey = @openssl_pkey_new($config);
    if (!$localKey) return false;

    $details = @openssl_pkey_get_details($localKey);
    if (!$details || !isset($details['ec'])) return false;

    $ec = $details['ec'];
    $localPub = "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);

    // Public Key Import
    $clientPem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(
        "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00" . $clientPub
    ), 64, "\n") . "-----END PUBLIC KEY-----\n";

    $clientPkey = @openssl_pkey_get_public($clientPem);
    if (!$clientPkey) return false;

    if (!function_exists('openssl_pkey_derive')) {
        return false;
    }

    $sharedSecret = @openssl_pkey_derive($clientPkey, $localKey, 32);
    if (!$sharedSecret) return false;

    // HKDF Key Derivation (RFC 8291)
    $salt = random_bytes(16);
    $authInfo = "WebPush: info\0" . $clientPub . $localPub;
    $prk = hash_hmac('sha256', $sharedSecret, $clientSecret, true);
    $ikm = hash_hmac('sha256', $authInfo . "\x01", $prk, true);
    $prk = hash_hmac('sha256', $ikm, $salt, true);

    $cekInfo = "Content-Encoding: aes128gcm\0\x01";
    $cek = substr(hash_hmac('sha256', $cekInfo, $prk, true), 0, 16);

    $nonceInfo = "Content-Encoding: nonce\0\x01";
    $nonce = substr(hash_hmac('sha256', $nonceInfo, $prk, true), 0, 12);

    // Enkripsi AES-128-GCM
    $paddedPlaintext = $plaintext . "\x02";
    $tag = '';
    $ciphertext = @openssl_encrypt($paddedPlaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($ciphertext === false) return false;

    // Header (RFC 8291): salt (16 bytes) + rs (4 bytes) + idlen (1 byte) + localPub (65 bytes)
    $header = $salt . pack('N', 4096) . chr(strlen($localPub)) . $localPub;

    return $header . $ciphertext . $tag;
}

/**
 * Kirim Web Push Notification ke Endpoint Browser Android/Chrome dan Apple iOS
 * Mendukung RFC 8292 (Apple/Mozilla) dan format WebPush legacy (Google FCM Android)
 */
function sendSingleWebPush($endpoint, $clientP256dh, $clientAuth, $payloadArray) {
    $vapid = getOrGenerateVapidKeys();
    $urlParts = parse_url($endpoint);
    $host = isset($urlParts['host']) ? $urlParts['host'] : '';
    $scheme = isset($urlParts['scheme']) ? $urlParts['scheme'] : 'https';
    
    // Khusus Android GCM/FCM: pastikan audience valid
    $audience = "{$scheme}://{$host}";
    if ($host === 'android.googleapis.com') {
        $audience = 'https://fcm.googleapis.com';
    }

    $privatePem = isset($vapid['privatePem']) ? $vapid['privatePem'] : null;
    $jwt = createVapidJwt($audience, $vapid['subject'], $vapid['publicKey'], $vapid['privateKey'], $privatePem);
    $payloadJson = json_encode($payloadArray, JSON_UNESCAPED_UNICODE);

    $encryptedBody = encryptWebPushPayload($payloadJson, $clientP256dh, $clientAuth);

    // Deteksi gateway push: Google FCM Android vs Apple Web Push / Standard
    $isFcm = (strpos($endpoint, 'fcm.googleapis.com') !== false || strpos($endpoint, 'android.googleapis.com') !== false);

    // Helper untuk mengeksekusi request curl dengan variasi format Authorization
    $executePush = function($authHeaderType) use ($endpoint, $jwt, $vapid, $encryptedBody, $payloadJson) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $endpoint);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

        $headers = [
            "TTL: 86400",
            "Urgency: high",
        ];

        if ($authHeaderType === 'legacy_webpush') {
            // Format WebPush Legacy (draft-ietf-webpush-protocol-00)
            $headers[] = "Authorization: WebPush {$jwt}";
            $headers[] = "Crypto-Key: p256ecdsa={$vapid['publicKey']}";
        } else {
            // Format RFC 8292 Standard Resmi (Google FCM Android & Apple APNs Safari iOS)
            // WAJIB: Jangan kirim Crypto-Key saat memakai Authorization: vapid (dilarang RFC 8292 Section 4)
            $headers[] = "Authorization: vapid t={$jwt}, k={$vapid['publicKey']}";
        }

        if ($encryptedBody !== false && strlen($encryptedBody) > 0) {
            $headers[] = "Content-Type: application/octet-stream";
            $headers[] = "Content-Encoding: aes128gcm";
            $headers[] = "Content-Length: " . strlen($encryptedBody);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $encryptedBody);
        } else {
            error_log("[WebPush] encryptWebPushPayload gagal untuk endpoint: " . substr($endpoint, 0, 60));
            $headers[] = "Content-Type: application/json";
            $headers[] = "Content-Length: " . strlen($payloadJson);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        
        // PHP 8.0+: CurlHandle otomatis dibersihkan saat variabel di-unset (curl_close deprecated di PHP 8.5)
        unset($ch);

        return ['response' => $response, 'httpCode' => $httpCode, 'curlErr' => $curlErr];
    };

    // Percobaan 1: Gunakan RFC 8292 standard resmi (didukung penuh Google FCM Android & Apple APNs)
    $res = $executePush('rfc_standard');

    // Jika percobaan 1 gagal dengan HTTP 400/401/403, coba format legacy
    if (($res['httpCode'] === 400 || $res['httpCode'] === 401 || $res['httpCode'] === 403)) {
        $res = $executePush('legacy_webpush');
    }

    if ($res['curlErr']) {
        return ['success' => false, 'error' => $res['curlErr'], 'code' => $res['httpCode']];
    }

    // 201 Created atau 202 Accepted = Berhasil diterima push gateway Google FCM / Mozilla / Apple
    if ($res['httpCode'] === 200 || $res['httpCode'] === 201 || $res['httpCode'] === 202) {
        return ['success' => true, 'code' => $res['httpCode']];
    }

    if ($res['httpCode'] === 410 || $res['httpCode'] === 404) {
        return ['success' => false, 'expired' => true, 'code' => $res['httpCode']];
    }

    return ['success' => false, 'error' => "Push server response HTTP {$res['httpCode']}", 'response' => $res['response'], 'code' => $res['httpCode']];
}
