<?php
/**
 * Utility to generate all PWA, Browser favicon, and App Logo assets from the uploaded artwork.
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die(json_encode(['success' => false, 'error' => 'Akses ditolak: Skrip ini hanya dapat dijalankan melalui CLI.']));
}

// Redam deprecation warning untuk PHP 8.5+
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);

function generateAllLogoAssets() {
    $marker = __DIR__ . '/.badge_v2_done';
    if (file_exists($marker)) {
        return;
    }

    $sourcePath = 'C:/Users/Thinkpad/.gemini/antigravity/brain/78571f9e-f68a-4e68-8b44-b1fe9a251001/.user_uploaded/media_1795416543414_000388ee.jpg';
    if (!file_exists($sourcePath)) {
        return;
    }

    $rootDir = realpath(__DIR__ . '/..');
    if (!$rootDir) {
        $rootDir = dirname(__DIR__);
    }
    $htdocsDir = dirname($rootDir); // c:\xampp.new\htdocs
    $publicDir = $rootDir . '/public';
    $distDir = $rootDir . '/dist';

    if (!is_dir($publicDir)) @mkdir($publicDir, 0777, true);
    if (!is_dir($distDir)) @mkdir($distDir, 0777, true);

    $srcImg = @imagecreatefromjpeg($sourcePath);
    if (!$srcImg) {
        return;
    }

    $resizeAndSave = function($src, $w, $h, $destPaths) {
        $dst = imagecreatetruecolor($w, $h);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        $transparent = imagecolorallocatealpha($dst, 255, 255, 255, 127);
        imagefilledrectangle($dst, 0, 0, $w, $h, $transparent);
        imagealphablending($dst, true);

        imagecopyresampled($dst, $src, 0, 0, 0, 0, $w, $h, imagesx($src), imagesy($src));

        foreach ($destPaths as $path) {
            @imagepng($dst, $path, 9);
        }
        unset($dst);
    };

    // 1. 512x512
    $resizeAndSave($srcImg, 512, 512, [
        $publicDir . '/icon-512.png',
        $publicDir . '/maskable-icon-512.png',
        $distDir . '/icon-512.png',
        $distDir . '/maskable-icon-512.png',
        $rootDir . '/icon-512.png',
        $rootDir . '/maskable-icon-512.png',
        $publicDir . '/logo.png',
        $rootDir . '/logo.png',
        $htdocsDir . '/icon-512.png',
        $htdocsDir . '/maskable-icon-512.png',
        $htdocsDir . '/logo.png',
    ]);

    // 2. 192x192
    $resizeAndSave($srcImg, 192, 192, [
        $publicDir . '/icon-192.png',
        $publicDir . '/apple-touch-icon.png',
        $distDir . '/icon-192.png',
        $distDir . '/apple-touch-icon.png',
        $rootDir . '/icon-192.png',
        $rootDir . '/apple-touch-icon.png',
        $htdocsDir . '/icon-192.png',
        $htdocsDir . '/apple-touch-icon.png',
    ]);

    // 3. 64x64
    $resizeAndSave($srcImg, 64, 64, [
        $publicDir . '/favicon.png',
        $distDir . '/favicon.png',
        $rootDir . '/favicon.png',
        $htdocsDir . '/favicon.png',
    ]);

    // 4. Monochrome Silhouette Badge 96x96 untuk Android Status Bar Notification
    $srcW = imagesx($srcImg);
    $srcH = imagesy($srcImg);
    $minX = $srcW; $maxX = 0; $minY = $srcH; $maxY = 0;
    for ($y = 120; $y < 850; $y++) {
        for ($x = 120; $x < 890; $x++) {
            $c = imagecolorat($srcImg, $x, $y);
            $r = ($c >> 16) & 0xFF; $g = ($c >> 8) & 0xFF; $b = $c & 0xFF;
            $isOuterWhite = ($r > 240 && $g > 240 && $b > 240);
            $brightness = ($r + $g + $b) / 3;
            if (!$isOuterWhite && $brightness > 100) {
                if ($x < $minX) $minX = $x;
                if ($x > $maxX) $maxX = $x;
                if ($y < $minY) $minY = $y;
                if ($y > $maxY) $maxY = $y;
            }
        }
    }
    $emblemW = $maxX - $minX;
    $emblemH = $maxY - $minY;
    $size = max($emblemW, $emblemH);
    $cropX0 = (($minX + $maxX) / 2) - ($size / 2);
    $cropY0 = (($minY + $maxY) / 2) - ($size / 2);

    $badgeSize = 96;
    $badge = imagecreatetruecolor($badgeSize, $badgeSize);
    imagealphablending($badge, false);
    imagesavealpha($badge, true);
    $transparent = imagecolorallocatealpha($badge, 0, 0, 0, 127);
    imagefilledrectangle($badge, 0, 0, $badgeSize, $badgeSize, $transparent);
    imagealphablending($badge, true);
    $white = imagecolorallocatealpha($badge, 255, 255, 255, 0);

    for ($by = 0; $by < $badgeSize; $by++) {
        for ($bx = 0; $bx < $badgeSize; $bx++) {
            $sx = (int)($cropX0 + ($bx / $badgeSize) * $size);
            $sy = (int)($cropY0 + ($by / $badgeSize) * $size);
            if ($sx < 0 || $sx >= $srcW || $sy < 0 || $sy >= $srcH) continue;
            $c = imagecolorat($srcImg, $sx, $sy);
            $r = ($c >> 16) & 0xFF; $g = ($c >> 8) & 0xFF; $b = $c & 0xFF;
            $isOuterWhite = ($r > 240 && $g > 240 && $b > 240);
            $brightness = ($r + $g + $b) / 3;
            if (!$isOuterWhite && $brightness > 105) {
                imagesetpixel($badge, $bx, $by, $white);
            }
        }
    }
    @imagepng($badge, $publicDir . '/badge-96.png', 9);
    @imagepng($badge, $distDir . '/badge-96.png', 9);
    @imagepng($badge, $rootDir . '/badge-96.png', 9);
    @imagepng($badge, $htdocsDir . '/badge-96.png', 9);
    unset($badge);

    @copy($sourcePath, $publicDir . '/logo-master.jpg');
    @copy($sourcePath, $distDir . '/logo-master.jpg');
    @copy($sourcePath, $rootDir . '/logo-master.jpg');
    @copy($sourcePath, $htdocsDir . '/logo-master.jpg');

    if (file_exists($publicDir . '/splash.css')) {
        @copy($publicDir . '/splash.css', $distDir . '/splash.css');
        @copy($publicDir . '/splash.css', $rootDir . '/splash.css');
        @copy($publicDir . '/splash.css', $htdocsDir . '/splash.css');
    }

    // Salin juga manifest dan sw ke htdocs root agar URL absolute /manifest.json & /sw.js bekerja di Apache
    if (file_exists($publicDir . '/manifest.json')) {
        @copy($publicDir . '/manifest.json', $htdocsDir . '/manifest.json');
        @copy($publicDir . '/manifest.json', $htdocsDir . '/manifest.webmanifest');
    }
    if (file_exists($publicDir . '/sw.js')) {
        @copy($publicDir . '/sw.js', $htdocsDir . '/sw.js');
    }

    // Buat data URI base64 dari icon-192.png untuk splash screen instan tanpa ketergantungan jaringan
    if (file_exists($publicDir . '/icon-192.png')) {
        $b64 = 'data:image/png;base64,' . base64_encode(file_get_contents($publicDir . '/icon-192.png'));
        @file_put_contents(__DIR__ . '/logo_base64.txt', $b64);
    }

    unset($srcImg);
    @file_put_contents($marker, date('c'));
}

generateAllLogoAssets();
