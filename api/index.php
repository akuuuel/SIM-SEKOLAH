<?php
require_once __DIR__ . '/db.php';

// Tangkap request body JSON atau POST
$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);

if (!is_array($payload)) {
    $payload = $_POST;
}

$action = isset($payload['action']) ? trim($payload['action']) : (isset($_GET['action']) ? trim($_GET['action']) : 'ping');

switch ($action) {
    // --------------------------------------------------------
    // 1. PING / TEST KONEKSI
    // --------------------------------------------------------
    case 'ping':
        try {
            $countSiswa = $pdo->query("SELECT COUNT(*) FROM siswa")->fetchColumn();
            $countAbsensi = $pdo->query("SELECT COUNT(*) FROM absensi")->fetchColumn();
            echo json_encode([
                'success' => true,
                'message' => 'Backend PHP XAMPP aktif & terhubung ke MySQL database [db_absensi_man1].',
                'database' => 'db_absensi_man1',
                'totalSiswa' => (int) $countSiswa,
                'totalAbsensi' => (int) $countAbsensi,
                'serverTime' => date('Y-m-d H:i:s')
            ]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 2. TARIK DATA MASTER SISWA
    // --------------------------------------------------------
    case 'getInitialData':
        try {
            // Pastikan kolom nama_wali ada jika belum dibuat
            try {
                $checkCol = $pdo->query("SHOW COLUMNS FROM siswa LIKE 'nama_wali'")->fetch();
                if (!$checkCol) {
                    $pdo->exec("ALTER TABLE siswa ADD COLUMN nama_wali VARCHAR(100) DEFAULT NULL AFTER no_wa");
                }
            } catch (Exception $e) {
            }

            $stmt = $pdo->query("SELECT id, nama AS name, kelas AS className, barcode AS barcodeValue, no_wa AS whatsappNumber, nama_wali AS parentName, status_aktif AS isActive FROM siswa WHERE status_aktif = 1 ORDER BY nama ASC");
            $students = $stmt->fetchAll();

            // Ubah format isActive ke boolean
            foreach ($students as &$s) {
                $s['isActive'] = (bool) $s['isActive'];
            }

            if (isset($_GET['_t']) || isset($_GET['nocache'])) {
                header("Cache-Control: no-cache, no-store, must-revalidate");
                echo json_encode([
                    'success' => true,
                    'students' => $students,
                    'totalStudents' => count($students),
                    'serverTime' => date('c')
                ]);
                exit();
            }

            sendJsonWithETag([
                'success' => true,
                'students' => $students,
                'totalStudents' => count($students),
                'serverTime' => date('c')
            ], 10);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal mengambil data siswa: ' . $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 3. SINKRONISASI BATCH ABSENSI (MASUK & PULANG MERGE 1 BARIS)
    // --------------------------------------------------------
    case 'submitAttendanceBatch':
        $transactions = isset($payload['transactions']) ? $payload['transactions'] : [];
        if (!is_array($transactions) || empty($transactions)) {
            echo json_encode(['success' => true, 'processedCount' => 0, 'results' => []]);
            exit();
        }

        $results = [];
        $pdo->beginTransaction();

        try {
            $checkStmt = $pdo->prepare("
                SELECT id, jam_masuk, jam_pulang, status 
                FROM absensi 
                WHERE (LOWER(TRIM(id_siswa)) = LOWER(TRIM(?))) AND tanggal = ? 
                LIMIT 1
            ");

            $insertStmt = $pdo->prepare("
                INSERT INTO absensi 
                (transaction_id, tanggal, id_siswa, nama_siswa, kelas, jam_masuk, jam_pulang, status, metode, device_id, operator_id, operator_name, keterangan)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            $updateMasukStmt = $pdo->prepare("
                UPDATE absensi SET jam_masuk = ?, status = ?, device_id = ?, operator_id = ?, operator_name = ?
                WHERE id = ?
            ");

            $updatePulangStmt = $pdo->prepare("
                UPDATE absensi SET jam_pulang = ?, device_id = ?, operator_id = ?, operator_name = ?
                WHERE id = ?
            ");

            // 1. Urutkan transaksi batch agar untuk setiap siswa di tanggal yang sama,
            // transaksi MASUK SELALU diproses sebelum PULANG
            usort($transactions, function ($a, $b) {
                $dateA = substr(trim($a['attendanceDate'] ?? ''), 0, 10);
                $dateB = substr(trim($b['attendanceDate'] ?? ''), 0, 10);
                if ($dateA !== $dateB) return strcmp($dateA, $dateB);

                $sIdA = trim($a['studentId'] ?? '');
                $sIdB = trim($b['studentId'] ?? '');
                if ($sIdA !== $sIdB) return strcmp($sIdA, $sIdB);

                $typeA = strtoupper(trim($a['attendanceType'] ?? ''));
                $typeB = strtoupper(trim($b['attendanceType'] ?? ''));
                $rankA = ($typeA === 'MASUK') ? 0 : 1;
                $rankB = ($typeB === 'MASUK') ? 0 : 1;
                if ($rankA !== $rankB) return $rankA - $rankB;

                $timeA = $a['deviceTimestamp'] ?? '';
                $timeB = $b['deviceTimestamp'] ?? '';
                return strcmp($timeA, $timeB);
            });

            foreach ($transactions as $tx) {
                $txId = trim($tx['transactionId']);
                $date = substr(trim($tx['attendanceDate']), 0, 10);
                $studentId = trim($tx['studentId']);
                $name = trim($tx['studentName']);
                $className = trim($tx['className']);
                $session = strtoupper(trim($tx['attendanceType'])); // MASUK / PULANG
                $status = strtoupper(trim($tx['attendanceStatus'])); // HADIR, TERLAMBAT, IZIN, SAKIT, ALFA, BK
                $method = isset($tx['method']) ? trim($tx['method']) : 'USB_SCANNER';
                $deviceId = isset($tx['deviceId']) ? trim($tx['deviceId']) : 'PC-01';
                $operatorId = isset($tx['operatorId']) ? trim($tx['operatorId']) : 'admin';
                $operatorName = isset($tx['operatorName']) ? trim($tx['operatorName']) : 'Operator';
                $notes = isset($tx['notes']) ? trim($tx['notes']) : null;

                // Format Jam (HH:MM:SS) dari deviceTimestamp sesuai zona waktu WITA (Asia/Makassar)
                $timestamp = isset($tx['deviceTimestamp']) ? $tx['deviceTimestamp'] : date('Y-m-d H:i:s');
                try {
                    $dt = new DateTime($timestamp);
                    $dt->setTimezone(new DateTimeZone('Asia/Makassar'));
                    $timeStr = $dt->format('H:i:s');
                    if (empty($date)) {
                        $date = $dt->format('Y-m-d');
                    }
                } catch (Exception $e) {
                    $timeStr = date('H:i:s', strtotime($timestamp));
                    if (empty($date)) {
                        $date = date('Y-m-d', strtotime($timestamp));
                    }
                }

                // Cek apakah siswa sudah punya baris absensi di tanggal ini
                $checkStmt->execute([$studentId, $date]);
                $existing = $checkStmt->fetch();

                if ($existing) {
                    // Siswa SUDAH ADA di tanggal ini: Gabungkan Jam Pulang atau Jam Masuk
                    if ($session === 'PULANG') {
                        $updatePulangStmt->execute([$timeStr, $deviceId, $operatorId, $operatorName, $existing['id']]);
                    } else {
                        // Sesi MASUK: perbarui jam_masuk & status jika sebelumnya belum ada jam masuk atau statusnya ALFA
                        $updateMasukStmt->execute([$timeStr, $status, $deviceId, $operatorId, $operatorName, $existing['id']]);
                    }
                } else {
                    // Siswa BELUM ADA di tanggal ini: Buat baris baru!
                    // JANGAN DITOLAK: Jika scan PULANG masuk lebih dulu atau tanpa scan MASUK, tetap catat ke database
                    $jamMasuk = ($session === 'MASUK') ? $timeStr : null;
                    $jamPulang = ($session === 'PULANG') ? $timeStr : null;
                    $statusFinal = ($session === 'PULANG' && !in_array($status, ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALFA', 'BK']))
                        ? 'HADIR'
                        : $status;

                    try {
                        $insertStmt->execute([
                            $txId,
                            $date,
                            $studentId,
                            $name,
                            $className,
                            $jamMasuk,
                            $jamPulang,
                            $statusFinal,
                            $method,
                            $deviceId,
                            $operatorId,
                            $operatorName,
                            $notes
                        ]);
                    } catch (PDOException $e) {
                        // Jika terjadi race condition (unique key id_siswa + tanggal), update baris yang sudah ada
                        $checkStmt->execute([$studentId, $date]);
                        $fallbackRow = $checkStmt->fetch();
                        if ($fallbackRow) {
                            if ($session === 'PULANG') {
                                $updatePulangStmt->execute([$timeStr, $deviceId, $operatorId, $operatorName, $fallbackRow['id']]);
                            } else {
                                $updateMasukStmt->execute([$timeStr, $statusFinal, $deviceId, $operatorId, $operatorName, $fallbackRow['id']]);
                            }
                        }
                    }
                }

                $results[] = ['transactionId' => $txId, 'status' => 'SYNCED'];
            }

            $pdo->commit();

            // ========================================================
            // WEB PUSH NOTIFICATION ENGINE (RFC 8291 / VAPID)
            // Mengirim notifikasi langsung ke HP Orang Tua secara real-time
            // Tetap berdering walau aplikasi ditutup total / layar kunci
            // ========================================================
            try {
                require_once __DIR__ . '/web_push.php';

                // Buat tabel push_subscriptions jika belum ada
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS push_subscriptions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id VARCHAR(50),
                        student_id VARCHAR(50),
                        phone VARCHAR(50),
                        endpoint TEXT NOT NULL,
                        p256dh VARCHAR(255) NOT NULL,
                        auth VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_student_id (student_id),
                        INDEX idx_phone (phone)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");

                // Bersihkan langganan tanpa endpoint valid
                $pdo->exec("DELETE FROM push_subscriptions WHERE endpoint IS NULL OR endpoint = ''");

                // Pastikan tabel orang_tua ada dan memiliki kolom student_ids
                try {
                    $pdo->exec("
                        CREATE TABLE IF NOT EXISTS orang_tua (
                            id VARCHAR(50) PRIMARY KEY,
                            nama_wali VARCHAR(150) NOT NULL,
                            no_hp VARCHAR(50) NOT NULL UNIQUE,
                            password VARCHAR(255) NOT NULL,
                            id_siswa VARCHAR(50) NOT NULL,
                            student_ids TEXT DEFAULT NULL,
                            status VARCHAR(20) DEFAULT 'ACTIVE',
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            INDEX idx_no_hp (no_hp),
                            INDEX idx_id_siswa (id_siswa)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    ");
                    $checkCol = $pdo->query("SHOW COLUMNS FROM orang_tua LIKE 'student_ids'")->fetch();
                    if (!$checkCol) {
                        $pdo->exec("ALTER TABLE orang_tua ADD COLUMN student_ids TEXT DEFAULT NULL AFTER id_siswa");
                    }
                } catch (Exception $e) {
                }

                // Statement pembantu untuk mencari kontak orang tua dari data siswa
                $siswaContactStmt = $pdo->prepare("SELECT id, barcode, no_wa, nama FROM siswa WHERE id = ? OR barcode = ? LIMIT 1");

                // Statement pembantu untuk mencari kontak orang tua dari tabel orang_tua (mendukung id_siswa tunggal maupun multi-anak student_ids)
                $otContactStmt = $pdo->prepare("
                    SELECT id, no_hp 
                    FROM orang_tua 
                    WHERE id_siswa = ? 
                       OR id_siswa = ? 
                       OR (student_ids IS NOT NULL AND (student_ids LIKE ? OR student_ids LIKE ? OR FIND_IN_SET(?, student_ids)))
                ");

                foreach ($transactions as $tx) {
                    $sId = trim($tx['studentId'] ?? '');
                    if (empty($sId))
                        continue;

                    $sName = trim($tx['studentName'] ?? 'Siswa');
                    $sClass = trim($tx['className'] ?? '-');
                    $sSession = strtoupper(trim($tx['attendanceType'] ?? 'MASUK'));
                    $sStatus = strtoupper(trim($tx['attendanceStatus'] ?? 'HADIR'));
                    $sTime = isset($tx['deviceTimestamp']) ? date('H:i:s', strtotime($tx['deviceTimestamp'])) : date('H:i:s');

                    $notifTitle = ($sSession === 'MASUK') ? 'Presensi: Siswa Tiba di Madrasah' : 'Presensi: Siswa Scan Pulang';
                    if ($sSession === 'MASUK') {
                        $statusText = ($sStatus === 'HADIR') ? 'Tepat Waktu' : (($sStatus === 'TERLAMBAT') ? 'Terlambat' : $sStatus);
                        $notifBody = "{$sName} ({$sClass}) telah tiba di madrasah & scan MASUK [{$statusText}] pukul {$sTime} WITA.";
                    } else {
                        $notifBody = "{$sName} ({$sClass}) telah scan PULANG pukul {$sTime} WITA. Sedang dalam perjalanan pulang.";
                    }

                    // 1. Ambil info siswa untuk mendapatkan ID resmi, barcode, dan nomor WA
                    $siswaContactStmt->execute([$sId, $sId]);
                    $siswaRow = $siswaContactStmt->fetch(PDO::FETCH_ASSOC);
                    $officialId = $siswaRow ? trim($siswaRow['id']) : $sId;
                    $barcodeVal = $siswaRow ? trim($siswaRow['barcode']) : '';

                    $targetPhones = [];
                    $targetUserIds = [];
                    $targetStudentIds = array_unique(array_filter([$sId, $officialId, $barcodeVal]));

                    if ($siswaRow && !empty($siswaRow['no_wa'])) {
                        $targetPhones[] = trim($siswaRow['no_wa']);
                    }

                    // 2. Ambil dari tabel orang_tua yang terhubung ke siswa ini
                    $otContactStmt->execute([
                        $sId,
                        $officialId,
                        "%{$sId}%",
                        "%{$officialId}%",
                        $officialId ?: $sId
                    ]);
                    $otRows = $otContactStmt->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($otRows as $ot) {
                        if (!empty($ot['no_hp']))
                            $targetPhones[] = trim($ot['no_hp']);
                        if (!empty($ot['id']))
                            $targetUserIds[] = trim($ot['id']);
                    }

                    // 3. Bangun seluruh variasi format nomor telepon orang tua
                    $validPhoneVariants = [];
                    foreach ($targetPhones as $tp) {
                        $digits = preg_replace('/[^0-9]/', '', $tp);
                        if (strlen($digits) >= 8) {
                            $validPhoneVariants[] = $tp;
                            $validPhoneVariants[] = $digits;
                            if (strpos($digits, '62') === 0) {
                                $validPhoneVariants[] = '0' . substr($digits, 2);
                                $validPhoneVariants[] = substr($digits, 2);
                            } elseif (strpos($digits, '0') === 0) {
                                $validPhoneVariants[] = substr($digits, 1);
                                $validPhoneVariants[] = '62' . substr($digits, 1);
                            }
                        }
                    }
                    $validPhoneVariants = array_unique(array_filter($validPhoneVariants));
                    $targetUserIds = array_unique(array_filter($targetUserIds));

                    // 4. Query tabel push_subscriptions untuk menemukan HP orang tua siswa ini
                    $subConditions = [];
                    $subParams = [];

                    // A. Berdasarkan student_id (Barcode)
                    if (!empty($targetStudentIds)) {
                        $inS = implode(',', array_fill(0, count($targetStudentIds), '?'));
                        $subConditions[] = "student_id IN ($inS)";
                        $subParams = array_merge($subParams, $targetStudentIds);
                    }

                    // B. Berdasarkan nomor telepon orang tua
                    if (!empty($validPhoneVariants)) {
                        $inP = implode(',', array_fill(0, count($validPhoneVariants), '?'));
                        $subConditions[] = "phone IN ($inP)";
                        $subParams = array_merge($subParams, $validPhoneVariants);

                        foreach ($validPhoneVariants as $vp) {
                            $cleanD = preg_replace('/[^0-9]/', '', $vp);
                            if (strlen($cleanD) >= 8) {
                                $last8 = substr($cleanD, -8);
                                $subConditions[] = "(phone LIKE ? AND ? != '')";
                                $subParams[] = "%{$last8}%";
                                $subParams[] = $last8;
                                break;
                            }
                        }
                    }

                    // C. Berdasarkan user_id orang tua
                    if (!empty($targetUserIds)) {
                        $inU = implode(',', array_fill(0, count($targetUserIds), '?'));
                        $subConditions[] = "user_id IN ($inU)";
                        $subParams = array_merge($subParams, $targetUserIds);
                    }

                    $subs = [];
                    if (!empty($subConditions)) {
                        $subSql = "
                            SELECT DISTINCT endpoint, p256dh, auth, student_id, phone, user_id 
                            FROM push_subscriptions 
                            WHERE " . implode(' OR ', $subConditions) . "
                            ORDER BY id DESC
                        ";
                        $subStmt = $pdo->prepare($subSql);
                        $subStmt->execute($subParams);
                        $subs = $subStmt->fetchAll(PDO::FETCH_ASSOC);
                    }

                    // 5. Kirim Web Push Notification ke setiap perangkat terdaftar
                    $sentEndpoints = [];
                    $seenTargets = [];
                    foreach ($subs as $sub) {
                        $ep = trim($sub['endpoint'] ?? '');
                        if (empty($ep) || empty($sub['p256dh']) || empty($sub['auth']))
                            continue;
                        if (isset($sentEndpoints[$ep]))
                            continue; // Hindari kirim duplikat ke endpoint yang sama
                        $sentEndpoints[$ep] = true;

                        // Cegah kirim ganda ke beberapa token residu lama dari akun/HP yang sama
                        $targetKey = !empty($sub['user_id']) ? 'usr_' . $sub['user_id'] : (!empty($sub['phone']) ? 'ph_' . $sub['phone'] : $ep);
                        if (isset($seenTargets[$targetKey]))
                            continue;
                        $seenTargets[$targetKey] = true;

                        // Tag deterministik per siswa, sesi, dan tanggal agar sistem HP otomatis menduplikasi / menimpa notif ganda
                        $txDateClean = !empty($tx['attendanceDate']) ? preg_replace('/[^0-9]/', '', $tx['attendanceDate']) : date('Ymd');
                        $notifTag = 'tx-' . $sId . '-' . $sSession . '-' . $txDateClean;

                        $pushRes = sendSingleWebPush($sub['endpoint'], $sub['p256dh'], $sub['auth'], [
                            'title' => $notifTitle,
                            'body' => $notifBody,
                            'icon' => '/icon-192.png?v=2',
                            'badge' => '/badge-96.png?v=2',
                            'url' => '/',
                            'tag' => $notifTag,
                            'actions' => [
                                ['action' => 'open', 'title' => 'Buka Presensi'],
                                ['action' => 'close', 'title' => 'Tutup']
                            ]
                        ]);

                        if (isset($pushRes['expired']) && $pushRes['expired'] === true) {
                            try {
                                $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")->execute([$sub['endpoint']]);
                            } catch (Throwable $e) {
                            }
                        }
                    }
                }
            } catch (Throwable $e) {
                // Log error push jika diperlukan, tetapi jangan gagalkan transaksi absensi
                error_log("Web Push Error in submitAttendanceBatch: " . $e->getMessage());
            }

            echo json_encode([
                'success' => true,
                'processedCount' => count($transactions),
                'results' => $results,
                'serverTimestamp' => date('c')
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Gagal memproses batch absensi: ' . $e->getMessage()
            ]);
        }
        break;

    // --------------------------------------------------------
    // 4. SIMPAN / UPDATE SISWA KE MYSQL (Lengkap Barcode & Kontak Wali)
    // --------------------------------------------------------
    case 'saveStudent':
        $id = isset($payload['id']) ? trim($payload['id']) : '';
        $name = isset($payload['name']) ? trim($payload['name']) : '';
        $className = isset($payload['className']) ? trim($payload['className']) : '';
        $barcode = isset($payload['barcodeValue']) ? trim($payload['barcodeValue']) : $id;
        $noWa = isset($payload['whatsappNumber']) ? trim($payload['whatsappNumber']) : null;
        $parentName = isset($payload['parentName']) ? trim($payload['parentName']) : (isset($payload['nama_wali']) ? trim($payload['nama_wali']) : null);
        $isActive = isset($payload['isActive']) ? ($payload['isActive'] ? 1 : 0) : 1;

        $isEdit = !empty($payload['isEdit']);

        if (empty($id) || empty($name)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID Siswa dan Nama wajib diisi.']);
            exit();
        }

        try {
            // Jika bukan edit (tambah siswa baru), tolak jika ID sudah digunakan siswa lain
            if (!$isEdit) {
                $checkExisting = $pdo->prepare("SELECT id, nama, kelas FROM siswa WHERE id = ? LIMIT 1");
                $checkExisting->execute([$id]);
                $existingStudent = $checkExisting->fetch(PDO::FETCH_ASSOC);
                if ($existingStudent) {
                    http_response_code(409); // Conflict
                    echo json_encode([
                        'success' => false,
                        'error' => "ID [{$id}] sudah digunakan oleh {$existingStudent['nama']} ({$existingStudent['kelas']}). Penambahan ditolak untuk mencegah data tertimpa."
                    ]);
                    exit();
                }
            }

            // Pastikan kolom nama_wali ada jika belum dibuat
            try {
                $checkCol = $pdo->query("SHOW COLUMNS FROM siswa LIKE 'nama_wali'")->fetch();
                if (!$checkCol) {
                    $pdo->exec("ALTER TABLE siswa ADD COLUMN nama_wali VARCHAR(100) DEFAULT NULL AFTER no_wa");
                }
            } catch (Exception $e) {
            }

            $stmt = $pdo->prepare("
                INSERT INTO siswa (id, nama, kelas, barcode, no_wa, nama_wali, status_aktif)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    nama = VALUES(nama),
                    kelas = VALUES(kelas),
                    barcode = VALUES(barcode),
                    no_wa = VALUES(no_wa),
                    nama_wali = VALUES(nama_wali),
                    status_aktif = VALUES(status_aktif)
            ");
            $stmt->execute([$id, $name, $className, $barcode, $noWa, $parentName, $isActive]);

            echo json_encode([
                'success' => true,
                'message' => "Siswa [{$name}] berhasil disimpan ke database MySQL.",
                'student' => [
                    'id' => $id,
                    'name' => $name,
                    'className' => $className,
                    'barcodeValue' => $barcode,
                    'whatsappNumber' => $noWa,
                    'parentName' => $parentName,
                    'isActive' => (bool) $isActive,
                ]
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal menyimpan siswa: ' . $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 4B. SIMPAN / UPDATE BATCH SISWA KE MYSQL (Cepat & Skala Besar)
    // --------------------------------------------------------
    case 'saveStudentsBatch':
        $studentsList = isset($payload['students']) ? $payload['students'] : [];
        if (!is_array($studentsList) || empty($studentsList)) {
            echo json_encode(['success' => true, 'count' => 0, 'message' => 'Tidak ada data siswa yang dikirim.']);
            exit();
        }

        try {
            // Pastikan kolom nama_wali ada jika belum dibuat
            try {
                $checkCol = $pdo->query("SHOW COLUMNS FROM siswa LIKE 'nama_wali'")->fetch();
                if (!$checkCol) {
                    $pdo->exec("ALTER TABLE siswa ADD COLUMN nama_wali VARCHAR(100) DEFAULT NULL AFTER no_wa");
                }
            } catch (Exception $e) {
            }

            $stmt = $pdo->prepare("
                INSERT INTO siswa (id, nama, kelas, barcode, no_wa, nama_wali, status_aktif)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    nama = VALUES(nama),
                    kelas = VALUES(kelas),
                    barcode = VALUES(barcode),
                    no_wa = VALUES(no_wa),
                    nama_wali = VALUES(nama_wali),
                    status_aktif = VALUES(status_aktif)
            ");

            $pdo->beginTransaction();
            $savedCount = 0;
            foreach ($studentsList as $s) {
                $sId = trim($s['id'] ?? '');
                $sName = trim($s['name'] ?? '');
                if (empty($sId) || empty($sName))
                    continue;
                $sClass = trim($s['className'] ?? '');
                $sBarcode = trim($s['barcodeValue'] ?? '') ?: $sId;
                $sWa = trim($s['whatsappNumber'] ?? '') ?: null;
                $sParent = trim($s['parentName'] ?? ($s['nama_wali'] ?? '')) ?: null;
                $sActive = isset($s['isActive']) ? ($s['isActive'] ? 1 : 0) : 1;
                $stmt->execute([$sId, $sName, $sClass, $sBarcode, $sWa, $sParent, $sActive]);
                $savedCount++;
            }
            $pdo->commit();

            echo json_encode([
                'success' => true,
                'count' => $savedCount,
                'message' => "Berhasil menyimpan {$savedCount} data siswa ke database MySQL secara batch."
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal batch simpan siswa: ' . $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 4C. PERBAIKI KOLOM SISWA TERTUKAR DI MYSQL (AUTOMATIC REPAIR)
    // --------------------------------------------------------
    case 'fixShiftedStudents':
        try {
            // Pastikan kolom nama_wali ada jika belum dibuat
            try {
                $checkCol = $pdo->query("SHOW COLUMNS FROM siswa LIKE 'nama_wali'")->fetch();
                if (!$checkCol) {
                    $pdo->exec("ALTER TABLE siswa ADD COLUMN nama_wali VARCHAR(100) DEFAULT NULL AFTER no_wa");
                }
            } catch (Exception $e) {
            }

            $stmt = $pdo->prepare("
                UPDATE siswa 
                SET no_wa = kelas, 
                    kelas = nama, 
                    nama = barcode, 
                    barcode = id 
                WHERE (kelas LIKE '62%' OR kelas LIKE '08%' OR kelas LIKE '8%' OR kelas REGEXP '^[0-9]{8,}$')
            ");
            $stmt->execute();
            $affected = $stmt->rowCount();

            echo json_encode([
                'success' => true,
                'affected' => $affected,
                'message' => "Berhasil menormalkan posisi kolom {$affected} siswa di database MySQL."
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal memperbaiki kolom siswa di MySQL: ' . $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 5. HAPUS SISWA DARI MYSQL
    // --------------------------------------------------------
    case 'deleteStudent':
        $id = isset($payload['id']) ? trim($payload['id']) : (isset($_GET['id']) ? trim($_GET['id']) : '');
        if (empty($id)) {
            echo json_encode(['success' => false, 'error' => 'ID siswa tidak ditentukan.']);
            exit();
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM siswa WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true, 'message' => "Siswa [{$id}] berhasil dihapus dari database."]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 5B. KOSONGKAN SELURUH SISWA DARI MYSQL DENGAN VERIFIKASI PASSWORD
    // --------------------------------------------------------
    case 'clearAllStudents':
        $username = isset($payload['username']) ? trim($payload['username']) : '';
        $password = isset($payload['password']) ? trim($payload['password']) : '';

        // Otentikasi ketat wajib: tolak jika kredensial admin tidak disertakan
        if (empty($username) || empty($password)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Kredensial otentikasi admin wajib disertakan untuk tindakan pengosongan data master.']);
            exit();
        }

        $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        $targetTable = null;
        foreach (['users', 'user', 'tb_users', 'tb_user'] as $tbl) {
            if (in_array($tbl, $tables)) {
                $targetTable = $tbl;
                break;
            }
        }

        $authenticated = false;
        if ($targetTable) {
            $colsStmt = $pdo->query("SHOW COLUMNS FROM `{$targetTable}`");
            $existingCols = $colsStmt->fetchAll(PDO::FETCH_COLUMN);
            $unameCol = in_array('username', $existingCols) ? 'username' : (in_array('uname', $existingCols) ? 'uname' : (in_array('user', $existingCols) ? 'user' : 'user_id'));
            $passCol = in_array('password_hash', $existingCols) ? 'password_hash' : (in_array('password', $existingCols) ? 'password' : 'pass');
            $roleCol = in_array('role', $existingCols) ? 'role' : (in_array('level', $existingCols) ? 'level' : '');

            $selectCols = "`{$passCol}`";
            if ($roleCol) {
                $selectCols .= ", `{$roleCol}`";
            }

            $uStmt = $pdo->prepare("SELECT {$selectCols} FROM `{$targetTable}` WHERE `{$unameCol}` = ? LIMIT 1");
            $uStmt->execute([$username]);
            $userRow = $uStmt->fetch(PDO::FETCH_ASSOC);

            if ($userRow) {
                $storedHash = $userRow[$passCol] ?? '';
                $userRole = strtoupper(trim($userRow[$roleCol] ?? 'SUPER_ADMIN'));

                // Hanya akun dengan role administrator yang berhak mengosongkan data master
                if ($userRole === 'SUPER_ADMIN' || $userRole === 'ADMIN' || $userRole === 'ADMIN_PC') {
                    $saltedHash = hash('sha256', $password . 'absensi_sekolah_salt_2026');
                    $plainHash = hash('sha256', $password);
                    if ($storedHash === $saltedHash || $storedHash === $password || $storedHash === $plainHash) {
                        $authenticated = true;
                    }
                }
            }
        }

        if (!$authenticated) {
            // Delay anti automated brute-force
            usleep(300000);
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Kredensial atau hak akses admin tidak valid. Tindakan pengosongan data ditolak.']);
            exit();
        }

        try {
            $pdo->exec("DELETE FROM siswa");
            echo json_encode([
                'success' => true,
                'message' => 'Seluruh data master siswa di database server MySQL berhasil dikosongkan.'
            ]);
        } catch (Exception $e) {
            error_log("Clear Students Error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal mengosongkan data siswa di MySQL.']);
        }
        break;

    // --------------------------------------------------------
    // 6. AMBIL REKAP LAPORAN ABSENSI
    // --------------------------------------------------------
    case 'getReports':
        $date = isset($_GET['date']) ? trim($_GET['date']) : date('Y-m-d');
        try {
            $stmt = $pdo->prepare("SELECT * FROM absensi WHERE tanggal = ? ORDER BY jam_masuk ASC");
            $stmt->execute([$date]);
            $rows = $stmt->fetchAll();
            echo json_encode([
                'success' => true,
                'date' => $date,
                'total' => count($rows),
                'data' => $rows
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 6B. TARIK TRANSAKSI ABSENSI DARI MYSQL KE DASHBOARD PC / LAPTOP (SYNC REAL-TIME)
    // --------------------------------------------------------
    case 'getAttendanceTransactions':
        $date = isset($_GET['date']) ? trim($_GET['date']) : (isset($payload['date']) ? trim($payload['date']) : date('Y-m-d'));
        try {
            $stmt = $pdo->prepare("SELECT * FROM absensi WHERE tanggal = ? ORDER BY id DESC");
            $stmt->execute([$date]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $transactions = [];
            foreach ($rows as $r) {
                $tgl = $r['tanggal'];
                $sId = $r['id_siswa'];
                $sName = $r['nama_siswa'];
                $sClass = $r['kelas'];
                $baseTxId = !empty($r['transaction_id']) ? $r['transaction_id'] : ('TX-' . $r['id']);

                if (!empty($r['jam_masuk']) && $r['jam_masuk'] !== '-') {
                    $jamFormatted = strlen($r['jam_masuk']) === 5 ? $r['jam_masuk'] . ':00' : $r['jam_masuk'];
                    $transactions[] = [
                        'transactionId' => str_ends_with($baseTxId, '_IN') ? $baseTxId : ($baseTxId . '_IN'),
                        'studentId' => $sId,
                        'studentName' => $sName,
                        'className' => $sClass,
                        'attendanceDate' => $tgl,
                        'attendanceType' => 'MASUK',
                        'attendanceStatus' => strtoupper(trim($r['status'] ?: 'HADIR')),
                        'method' => $r['metode'] ?: 'USB_SCANNER',
                        'deviceId' => $r['device_id'] ?: 'PC-01',
                        'operatorId' => $r['operator_id'] ?: 'admin',
                        'operatorName' => $r['operator_name'] ?: 'Operator',
                        'deviceTimestamp' => $tgl . 'T' . $jamFormatted . '+08:00',
                        'syncStatus' => 'SYNCED',
                        'note' => $r['keterangan'] ?: null,
                    ];
                }

                if (!empty($r['jam_pulang']) && $r['jam_pulang'] !== '-') {
                    $jamPulangFormatted = strlen($r['jam_pulang']) === 5 ? $r['jam_pulang'] . ':00' : $r['jam_pulang'];
                    $transactions[] = [
                        'transactionId' => str_ends_with($baseTxId, '_OUT') ? $baseTxId : ($baseTxId . '_OUT'),
                        'studentId' => $sId,
                        'studentName' => $sName,
                        'className' => $sClass,
                        'attendanceDate' => $tgl,
                        'attendanceType' => 'PULANG',
                        'attendanceStatus' => 'PULANG',
                        'method' => $r['metode'] ?: 'USB_SCANNER',
                        'deviceId' => $r['device_id'] ?: 'PC-01',
                        'operatorId' => $r['operator_id'] ?: 'admin',
                        'operatorName' => $r['operator_name'] ?: 'Operator',
                        'deviceTimestamp' => $tgl . 'T' . $jamPulangFormatted . '+08:00',
                        'syncStatus' => 'SYNCED',
                        'note' => $r['keterangan'] ?: null,
                    ];
                }
            }

            sendJsonWithETag([
                'success' => true,
                'date' => $date,
                'total' => count($transactions),
                'transactions' => $transactions
            ], 6);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal mengambil transaksi absensi: ' . $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 7. MANAJEMEN AKUN ORANG TUA SISWA (TABEL TERPISAH: orang_tua)
    // --------------------------------------------------------
    case 'getParents':
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS orang_tua (
                    id VARCHAR(50) PRIMARY KEY,
                    nama_wali VARCHAR(150) NOT NULL,
                    no_hp VARCHAR(50) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    id_siswa VARCHAR(50) NOT NULL,
                    status VARCHAR(20) DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_no_hp (no_hp),
                    INDEX idx_id_siswa (id_siswa)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Otomatis migrasikan akun orang tua dari tabel users ke orang_tua jika ada
            try {
                $checkUsers = $pdo->query("SHOW TABLES LIKE 'users'")->fetch();
                if ($checkUsers) {
                    $oldParents = $pdo->query("SELECT * FROM users WHERE UPPER(role) IN ('PARENT', 'ORANG_TUA', 'ORANG TUA', 'WALI', 'USER')")->fetchAll();
                    foreach ($oldParents as $op) {
                        $pId = !empty($op['user_id']) ? $op['user_id'] : 'P-' . $op['username'];
                        $pName = !empty($op['full_name']) ? $op['full_name'] : 'Wali Siswa';
                        $pPhone = !empty($op['phone']) ? $op['phone'] : $op['username'];
                        $pPass = $op['password_hash'];
                        $pStudent = !empty($op['student_id']) ? $op['student_id'] : '';
                        $pStatus = !empty($op['status']) ? $op['status'] : 'ACTIVE';

                        $mStmt = $pdo->prepare("
                            INSERT INTO orang_tua (id, nama_wali, no_hp, password, id_siswa, status)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE 
                                nama_wali = VALUES(nama_wali),
                                password = VALUES(password),
                                id_siswa = VALUES(id_siswa),
                                status = VALUES(status)
                        ");
                        $mStmt->execute([$pId, $pName, $pPhone, $pPass, $pStudent, $pStatus]);
                    }
                    if (!empty($oldParents)) {
                        $pdo->exec("DELETE FROM users WHERE UPPER(role) IN ('PARENT', 'ORANG_TUA', 'ORANG TUA', 'WALI', 'USER')");
                    }
                }
            } catch (Exception $e) {
            }

            // Pastikan kolom student_ids ada di tabel orang_tua jika belum dibuat
            try {
                $checkCol = $pdo->query("SHOW COLUMNS FROM orang_tua LIKE 'student_ids'")->fetch();
                if (!$checkCol) {
                    $pdo->exec("ALTER TABLE orang_tua ADD COLUMN student_ids TEXT DEFAULT NULL AFTER id_siswa");
                }
            } catch (Exception $e) {
            }

            $stmt = $pdo->query("SELECT id, nama_wali AS fullName, no_hp AS phone, no_hp AS username, password AS passwordHash, id_siswa AS studentId, student_ids AS studentIds, status, created_at AS createdAt FROM orang_tua ORDER BY nama_wali ASC");
            $parents = $stmt->fetchAll();

            foreach ($parents as &$p) {
                $p['userId'] = $p['id'];
                $p['role'] = 'PARENT';
                $p['assignedDeviceId'] = 'ALL';
                $sIds = !empty($p['studentIds']) ? explode(',', $p['studentIds']) : (!empty($p['studentId']) ? explode(',', $p['studentId']) : []);
                $sIdsClean = array_values(array_filter(array_map('trim', $sIds)));
                $p['studentIds'] = $sIdsClean;
                $p['studentId'] = !empty($sIdsClean) ? $sIdsClean[0] : ($p['studentId'] ?? '');
            }

            // Ambil daftar akun orang tua yang telah dihapus dalam 30 hari terakhir agar klien dapat membersihkan cache lokal
            $deletedAccounts = [];
            try {
                // Bersihkan deleted_accounts yang nomor HP-nya aktif kembali di orang_tua
                $pdo->exec("
                    DELETE d FROM deleted_accounts d
                    INNER JOIN orang_tua ot ON (
                        ot.id = d.id 
                        OR ot.no_hp = d.identifier 
                        OR ot.no_hp = d.phone
                    )
                ");

                $delStmt = $pdo->query("SELECT identifier, phone FROM deleted_accounts WHERE deleted_at >= NOW() - INTERVAL 30 DAY");
                if ($delStmt) {
                    $deletedAccounts = $delStmt->fetchAll(PDO::FETCH_ASSOC);
                }
            } catch (Exception $e) {
            }

            if (isset($_GET['_t']) || isset($_GET['nocache'])) {
                header("Cache-Control: no-cache, no-store, must-revalidate");
                echo json_encode([
                    'success' => true,
                    'table' => 'orang_tua',
                    'parents' => $parents,
                    'deletedAccounts' => $deletedAccounts,
                    'total' => count($parents)
                ]);
                exit();
            }

            sendJsonWithETag([
                'success' => true,
                'table' => 'orang_tua',
                'parents' => $parents,
                'deletedAccounts' => $deletedAccounts,
                'total' => count($parents)
            ], 10);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal mengambil data orang tua: ' . $e->getMessage()]);
        }
        break;

    case 'saveParent':
        $id = isset($payload['id']) ? trim($payload['id']) : (isset($payload['userId']) ? trim($payload['userId']) : '');
        $namaWali = isset($payload['fullName']) ? trim($payload['fullName']) : (isset($payload['nama_wali']) ? trim($payload['nama_wali']) : '');
        $noHp = isset($payload['phone']) ? trim($payload['phone']) : (isset($payload['username']) ? trim($payload['username']) : (isset($payload['no_hp']) ? trim($payload['no_hp']) : ''));
        $oldPhone = isset($payload['oldPhone']) ? trim($payload['oldPhone']) : '';
        $password = isset($payload['passwordHash']) ? trim($payload['passwordHash']) : (isset($payload['password']) ? trim($payload['password']) : '');
        $idSiswa = isset($payload['studentId']) ? trim($payload['studentId']) : (isset($payload['id_siswa']) ? trim($payload['id_siswa']) : '');
        $status = isset($payload['status']) ? trim($payload['status']) : 'ACTIVE';
        $studentIds = isset($payload['studentIds']) && is_array($payload['studentIds']) ? $payload['studentIds'] : [];
        if (!empty($studentIds)) {
            $studentIdsClean = array_values(array_filter(array_map('trim', $studentIds)));
            $studentIdsStr = !empty($studentIdsClean) ? implode(',', $studentIdsClean) : $idSiswa;
            if (empty($idSiswa) && !empty($studentIdsClean)) {
                $idSiswa = $studentIdsClean[0];
            }
        } else {
            $studentIdsStr = $idSiswa;
            $studentIdsClean = !empty($idSiswa) ? [$idSiswa] : [];
        }

        if (empty($noHp)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Nomor HP wajib diisi.']);
            exit();
        }

        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS orang_tua (
                    id VARCHAR(50) PRIMARY KEY,
                    nama_wali VARCHAR(150) NOT NULL,
                    no_hp VARCHAR(50) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    id_siswa VARCHAR(255) NOT NULL,
                    student_ids TEXT DEFAULT NULL,
                    status VARCHAR(20) DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_no_hp (no_hp),
                    INDEX idx_id_siswa (id_siswa)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Pastikan kolom student_ids dan panjang id_siswa sudah diperbarui
            try {
                $pdo->exec("ALTER TABLE orang_tua MODIFY COLUMN id_siswa VARCHAR(255) NOT NULL");
            } catch (Throwable $e) {
            }
            try {
                $checkCol = $pdo->query("SHOW COLUMNS FROM orang_tua LIKE 'student_ids'")->fetch();
                if (!$checkCol) {
                    $pdo->exec("ALTER TABLE orang_tua ADD COLUMN student_ids TEXT DEFAULT NULL AFTER id_siswa");
                }
            } catch (Throwable $e) {
            }

            // Normalisasi nomor HP baru
            $cleanNewDigits = preg_replace('/[^0-9]/', '', $noHp);

            // Bangun variasi nomor HP lama untuk pencocokan menyeluruh (08..., 62..., 8...)
            $cleanOldDigits = preg_replace('/[^0-9]/', '', $oldPhone);
            $oldPhoneVariants = array_unique(array_filter([$oldPhone, $cleanOldDigits]));
            if (!empty($cleanOldDigits)) {
                if (strpos($cleanOldDigits, '0') === 0) {
                    $oldPhoneVariants[] = '62' . substr($cleanOldDigits, 1);
                    $oldPhoneVariants[] = substr($cleanOldDigits, 1);
                } elseif (strpos($cleanOldDigits, '62') === 0) {
                    $oldPhoneVariants[] = '0' . substr($cleanOldDigits, 2);
                    $oldPhoneVariants[] = substr($cleanOldDigits, 2);
                }
            }

            // CARI ROW EKSISTING ORANG TUA:
            // Cek apakah akun ini sudah ada di tabel orang_tua (berdasarkan id, noHp, variasi oldPhone, atau id_siswa)
            $existingOtRow = null;
            $searchQueries = [];
            $searchParams = [];
            if (!empty($id)) {
                $searchQueries[] = "id = ?";
                $searchParams[] = $id;
            }
            foreach ($oldPhoneVariants as $opv) {
                $searchQueries[] = "no_hp = ?";
                $searchParams[] = $opv;
            }
            if (!empty($noHp)) {
                $searchQueries[] = "no_hp = ?";
                $searchParams[] = $noHp;
            }
            if (!empty($cleanNewDigits) && $cleanNewDigits !== $noHp) {
                $searchQueries[] = "no_hp = ?";
                $searchParams[] = $cleanNewDigits;
            }
            if (!empty($idSiswa)) {
                $searchQueries[] = "id_siswa = ?";
                $searchParams[] = $idSiswa;
                $searchQueries[] = "student_ids LIKE ?";
                $searchParams[] = "%{$idSiswa}%";
            }

            if (!empty($searchQueries)) {
                $findSql = "SELECT id, password, id_siswa, student_ids FROM orang_tua WHERE " . implode(' OR ', $searchQueries) . " LIMIT 1";
                $findStmt = $pdo->prepare($findSql);
                $findStmt->execute($searchParams);
                $existingOtRow = $findStmt->fetch(PDO::FETCH_ASSOC);
            }

            if ($existingOtRow) {
                // Gunakan ID asli yang sudah tersimpan di database jika ditemukan
                $id = $existingOtRow['id'];
                // Jika password kosong (hanya ganti nomor HP), pertahankan password hash lama!
                if (empty($password)) {
                    $password = $existingOtRow['password'];
                }
                if (empty($idSiswa) && !empty($existingOtRow['id_siswa'])) {
                    $idSiswa = $existingOtRow['id_siswa'];
                }
                if (empty($studentIdsStr) && !empty($existingOtRow['student_ids'])) {
                    $studentIdsStr = $existingOtRow['student_ids'];
                }
            }

            // Jika masih kosong (akun baru dibuat tanpa password), buat hash default
            if (empty($password)) {
                $password = password_hash('parent123', PASSWORD_BCRYPT);
            }

            if (empty($id)) {
                $id = 'P-' . ($cleanNewDigits ?: preg_replace('/[^0-9]/', '', $noHp));
            }

            // Simpan / update ke tabel orang_tua
            if ($existingOtRow) {
                $stmt = $pdo->prepare("
                    UPDATE orang_tua 
                    SET nama_wali = ?, 
                        no_hp = ?, 
                        password = ?, 
                        id_siswa = ?, 
                        student_ids = ?, 
                        status = ?
                    WHERE id = ?
                ");
                $stmt->execute([$namaWali, $noHp, $password, $idSiswa, $studentIdsStr, $status, $id]);
            } else {
                $stmt = $pdo->prepare("
                    INSERT INTO orang_tua (id, nama_wali, no_hp, password, id_siswa, student_ids, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        nama_wali = VALUES(nama_wali),
                        no_hp = VALUES(no_hp),
                        password = VALUES(password),
                        id_siswa = VALUES(id_siswa),
                        student_ids = VALUES(student_ids),
                        status = VALUES(status)
                ");
                $stmt->execute([$id, $namaWali, $noHp, $password, $idSiswa, $studentIdsStr, $status]);
            }

            // Bersihkan data orang_tua ganda/usang dengan nomor HP lama
            if (!empty($oldPhoneVariants)) {
                foreach ($oldPhoneVariants as $opv) {
                    if ($opv !== $noHp && $opv !== $cleanNewDigits) {
                        try {
                            $pdo->prepare("DELETE FROM orang_tua WHERE id != ? AND no_hp = ?")->execute([$id, $opv]);
                        } catch (Throwable $e) {
                        }
                    }
                }
            }

            // Pastikan akun orang tua dihapus dari tabel users agar tidak campur aduk
            try {
                $pdo->prepare("DELETE FROM users WHERE username = ? OR phone = ? OR user_id = ?")->execute([$noHp, $noHp, $id]);
            } catch (Throwable $e) {
            }

            // OTOMATIS SINKRONKAN KE DATA SISWA (no_wa & nama_wali) DI MYSQL
            $studentsToSync = !empty($studentIdsClean) ? $studentIdsClean : (!empty($idSiswa) ? [$idSiswa] : []);
            if (!empty($existingOtRow)) {
                if (!empty($existingOtRow['student_ids'])) {
                    $studentsToSync = array_merge($studentsToSync, explode(',', $existingOtRow['student_ids']));
                }
                if (!empty($existingOtRow['id_siswa'])) {
                    $studentsToSync[] = $existingOtRow['id_siswa'];
                }
            }
            $studentsToSync = array_unique(array_filter(array_map('trim', $studentsToSync)));

            // 1. Perbarui tabel siswa berdasarkan id_siswa & barcode
            if (!empty($studentsToSync)) {
                try {
                    $inStudents = implode(',', array_fill(0, count($studentsToSync), '?'));
                    $updParams = array_merge([$noHp, $namaWali], $studentsToSync, $studentsToSync);
                    $pdo->prepare("UPDATE siswa SET no_wa = ?, nama_wali = ? WHERE id IN ($inStudents) OR barcode IN ($inStudents)")->execute($updParams);
                } catch (Throwable $e) {
                }
            }

            // 2. Perbarui tabel siswa berdasarkan nomor lama (no_wa)
            if (!empty($oldPhoneVariants) && (!empty($oldPhone) && $oldPhone !== $noHp)) {
                try {
                    $old8 = strlen($cleanOldDigits) >= 8 ? substr($cleanOldDigits, -8) : $cleanOldDigits;
                    $likeOld = $old8 ? "%{$old8}%" : "";

                    $inOld = implode(',', array_fill(0, count($oldPhoneVariants), '?'));
                    $updOldParams = array_merge([$noHp, $namaWali], $oldPhoneVariants, [$likeOld, $likeOld]);
                    $pdo->prepare("UPDATE siswa SET no_wa = ?, nama_wali = ? WHERE no_wa IN ($inOld) OR (no_wa LIKE ? AND ? != '')")
                        ->execute($updOldParams);
                } catch (Throwable $e) {
                }
            }

            // 3. Perbarui subscriptions Web Push jika ada
            try {
                $pushCleanOld = preg_replace('/[^0-9]/', '', $oldPhone);
                $pdo->prepare("UPDATE push_subscriptions SET phone = ? WHERE user_id = ? OR phone = ? OR phone = ?")->execute([$noHp, $id, $oldPhone, $pushCleanOld]);
            } catch (Throwable $e) {
            }

            // 4. Perbarui users jika ada role PARENT lama tersisa
            try {
                $pdo->prepare("UPDATE users SET phone = ?, username = ?, full_name = ? WHERE user_id = ? OR phone = ? OR username = ?")->execute([$noHp, $noHp, $namaWali, $id, $oldPhone, $oldPhone]);
            } catch (Throwable $e) {
            }

            // 5. Hapus dari deleted_accounts jika sebelumnya pernah dihapus dan sekarang dibuat kembali
            try {
                $phone8 = strlen($cleanNewDigits) >= 8 ? substr($cleanNewDigits, -8) : $cleanNewDigits;
                $likeClean = $phone8 ? "%{$phone8}%" : "";
                $pdo->prepare("DELETE FROM deleted_accounts WHERE id = ? OR identifier = ? OR phone = ? OR (phone LIKE ? AND ? != '')")->execute([$id, $noHp, $cleanNewDigits, $likeClean, $likeClean]);
            } catch (Throwable $e) {
            }

            echo json_encode([
                'success' => true,
                'message' => "Akun orang tua [{$namaWali}] & data siswa terkait berhasil diperbarui di database MySQL."
            ]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal menyimpan ke tabel orang_tua: ' . $e->getMessage()]);
        }
        break;

    case 'deleteParent':
        $id = isset($payload['id']) ? trim($payload['id']) : (isset($payload['userId']) ? trim($payload['userId']) : (isset($_GET['id']) ? trim($_GET['id']) : ''));
        $noHp = isset($payload['phone']) ? trim($payload['phone']) : (isset($payload['username']) ? trim($payload['username']) : (isset($_GET['phone']) ? trim($_GET['phone']) : ''));

        if (empty($id) && empty($noHp)) {
            echo json_encode(['success' => false, 'error' => 'ID atau Nomor HP tidak ditentukan.']);
            exit();
        }

        try {
            // Pastikan tabel orang_tua ada
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS orang_tua (
                    id VARCHAR(50) PRIMARY KEY,
                    nama_wali VARCHAR(150) NOT NULL,
                    no_hp VARCHAR(50) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    id_siswa VARCHAR(50) NOT NULL,
                    status VARCHAR(20) DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_no_hp (no_hp),
                    INDEX idx_id_siswa (id_siswa)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Format variasi nomor telepon untuk pencocokan yang 100% akurat
            $cleanDigits = preg_replace('/[^0-9]/', '', $noHp ?: $id);
            $phone08 = '';
            $phone62 = '';
            $phone8 = '';
            if (strlen($cleanDigits) >= 9) {
                if (strpos($cleanDigits, '62') === 0) {
                    $phone62 = $cleanDigits;
                    $phone08 = '0' . substr($cleanDigits, 2);
                    $phone8 = substr($cleanDigits, 2);
                } else if (strpos($cleanDigits, '0') === 0) {
                    $phone08 = $cleanDigits;
                    $phone62 = '62' . substr($cleanDigits, 1);
                    $phone8 = substr($cleanDigits, 1);
                } else {
                    $phone8 = $cleanDigits;
                    $phone08 = '0' . $cleanDigits;
                    $phone62 = '62' . $cleanDigits;
                }
            }

            // 1. Hapus dari tabel orang_tua
            $deletedCount = 0;
            $stmt = $pdo->prepare("
                DELETE FROM orang_tua 
                WHERE id = ? 
                   OR no_hp = ? 
                   OR no_hp = ? 
                   OR no_hp = ? 
                   OR no_hp = ? 
                   OR (no_hp LIKE ? AND ? != '')
            ");
            $likeClean = $phone8 ? "%{$phone8}%" : "";
            $stmt->execute([$id, $noHp, $phone08, $phone62, $cleanDigits, $likeClean, $likeClean]);
            $deletedCount += $stmt->rowCount();

            // 2. Hapus juga dari tabel users/user/tb_users jika akun masih tersisa di sana
            $allTables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            foreach (['users', 'user', 'tb_users', 'tb_user'] as $uTable) {
                if (in_array($uTable, $allTables)) {
                    try {
                        $uCols = $pdo->query("SHOW COLUMNS FROM `{$uTable}`")->fetchAll(PDO::FETCH_COLUMN);
                        $idC = in_array('user_id', $uCols) ? 'user_id' : (in_array('id', $uCols) ? 'id' : $uCols[0]);
                        $uNameC = in_array('username', $uCols) ? 'username' : (in_array('uname', $uCols) ? 'uname' : $idC);
                        $phoneC = in_array('phone', $uCols) ? 'phone' : (in_array('no_hp', $uCols) ? 'no_hp' : (in_array('no_wa', $uCols) ? 'no_wa' : null));

                        $sqlDel = "DELETE FROM `{$uTable}` WHERE `{$idC}` = ? OR `{$uNameC}` = ? OR `{$uNameC}` = ? OR `{$uNameC}` = ?";
                        $params = [$id, $noHp, $phone08, $cleanDigits];
                        if ($phoneC) {
                            $sqlDel .= " OR `{$phoneC}` = ? OR `{$phoneC}` = ? OR `{$phoneC}` = ?";
                            $params[] = $noHp;
                            $params[] = $phone08;
                            $params[] = $cleanDigits;
                        }
                        if ($likeClean) {
                            $sqlDel .= " OR `{$uNameC}` LIKE ? OR `{$phoneC}` LIKE ?";
                            $params[] = $likeClean;
                            $params[] = $likeClean;
                        }
                        $delUStmt = $pdo->prepare($sqlDel);
                        $delUStmt->execute($params);
                        $deletedCount += $delUStmt->rowCount();
                    } catch (Exception $e) {
                    }
                }
            }

            // 3. Catat ke tabel deleted_accounts agar HP orang tua langsung auto-logout & tidak bisa login
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS deleted_accounts (
                        id VARCHAR(100) PRIMARY KEY,
                        identifier VARCHAR(150),
                        phone VARCHAR(50),
                        role VARCHAR(50),
                        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_ident (identifier),
                        INDEX idx_phone (phone)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
                $insDel = $pdo->prepare("
                    INSERT INTO deleted_accounts (id, identifier, phone, role) 
                    VALUES (?, ?, ?, 'PARENT') 
                    ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP
                ");
                $insDel->execute([$id, $noHp, $cleanDigits]);
            } catch (Exception $e) {
            }

            // 4. Hapus subscription Web Push untuk akun ini
            try {
                $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ? OR phone = ? OR phone = ?")->execute([$id, $noHp, $cleanDigits]);
            } catch (Exception $e) {
            }

            echo json_encode([
                'success' => true,
                'message' => "Akun orang tua berhasil dihapus permanen dari database ({$deletedCount} baris terhapus).",
                'deletedCount' => $deletedCount
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 8. SINKRONISASI DATA SISWA & REKAP ABSENSI KE PORTAL ORANG TUA
    // --------------------------------------------------------
    case 'getParentSyncData':
        $studentId = isset($_GET['studentId']) ? trim($_GET['studentId']) : (isset($payload['studentId']) ? trim($payload['studentId']) : '');
        $phone = isset($_GET['phone']) ? trim($_GET['phone']) : (isset($payload['phone']) ? trim($payload['phone']) : '');

        try {
            // Pastikan tabel orang_tua ada sebelum query
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS orang_tua (
                        id VARCHAR(50) PRIMARY KEY,
                        nama_wali VARCHAR(150) NOT NULL,
                        no_hp VARCHAR(50) NOT NULL UNIQUE,
                        password VARCHAR(255) NOT NULL,
                        id_siswa VARCHAR(50) NOT NULL,
                        status VARCHAR(20) DEFAULT 'ACTIVE',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_no_hp (no_hp),
                        INDEX idx_id_siswa (id_siswa)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
            } catch (Exception $e) {
            }

            // Validasi keamanan: jika nomor HP dikirim, cek apakah akun telah dihapus admin
            if (!empty($phone)) {
                $cleanPhoneDigits = preg_replace('/[^0-9]/', '', $phone);
                $phone8Digits = strlen($cleanPhoneDigits) >= 8 ? substr($cleanPhoneDigits, -8) : $cleanPhoneDigits;
                $likeCleanDigits = $phone8Digits ? "%{$phone8Digits}%" : "";

                // PENTING: Cek terlebih dahulu di tabel orang_tua!
                // Jika nomor HP aktif di tabel orang_tua, akun ini 100% aktif dan BUKAN terhapus!
                $isActiveInOrangTua = false;
                try {
                    $chkOt = $pdo->prepare("
                        SELECT id, status FROM orang_tua 
                        WHERE no_hp = ? 
                           OR no_hp = ? 
                           OR (no_hp LIKE ? AND ? != '')
                        LIMIT 1
                    ");
                    $chkOt->execute([$phone, $cleanPhoneDigits, $likeCleanDigits, $likeCleanDigits]);
                    $otRow = $chkOt->fetch();
                    if ($otRow) {
                        if (strtoupper($otRow['status'] ?? 'ACTIVE') === 'ACTIVE') {
                            $isActiveInOrangTua = true;
                            // Hapus residu deleted_accounts lama jika ada
                            try {
                                $pdo->prepare("DELETE FROM deleted_accounts WHERE id = ? OR identifier = ? OR phone = ? OR (phone LIKE ? AND ? != '')")
                                    ->execute([$otRow['id'], $phone, $cleanPhoneDigits, $likeCleanDigits, $likeCleanDigits]);
                            } catch (Exception $e) {
                            }
                        }
                    }
                } catch (Exception $e) {
                }

                if (!$isActiveInOrangTua) {
                    try {
                        $chkDel = $pdo->prepare("SELECT id FROM deleted_accounts WHERE identifier = ? OR phone = ? OR (phone LIKE ? AND ? != '') LIMIT 1");
                        $chkDel->execute([$phone, $cleanPhoneDigits, $likeCleanDigits, $likeCleanDigits]);
                        if ($chkDel->fetch()) {
                            echo json_encode([
                                'success' => false,
                                'accountDeleted' => true,
                                'error' => 'Akun orang tua ini telah dihapus oleh Administrator madrasah.'
                            ]);
                            exit();
                        }
                    } catch (Exception $e) {
                    }
                }
            }

            // 1. Kumpulkan seluruh ID anak terkait orang tua ini (Dukungan Multi-Anak)
            $targetStudentIds = [];
            $requestedStudentId = trim($_GET['studentId'] ?? $_POST['studentId'] ?? '');
            $studentIdsParam = trim($_GET['studentIds'] ?? $_POST['studentIds'] ?? '');

            if (!empty($requestedStudentId)) {
                foreach (explode(',', $requestedStudentId) as $s) {
                    $s = trim($s);
                    if (!empty($s))
                        $targetStudentIds[$s] = true;
                }
            }

            if (!empty($studentIdsParam)) {
                foreach (explode(',', $studentIdsParam) as $s) {
                    $s = trim($s);
                    if (!empty($s))
                        $targetStudentIds[$s] = true;
                }
            }

            // Cari seluruh anak yang terhubung ke nomor HP orang tua (dari tabel orang_tua dan siswa)
            if (!empty($phone)) {
                $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
                if (strlen($cleanPhone) >= 8) {
                    $last8 = substr($cleanPhone, -8);
                    try {
                        $otStmt = $pdo->prepare("SELECT id_siswa, student_ids FROM orang_tua WHERE no_hp = ? OR no_hp LIKE ?");
                        $otStmt->execute([$phone, "%{$last8}%"]);
                        $otRows = $otStmt->fetchAll(PDO::FETCH_ASSOC);
                        foreach ($otRows as $ot) {
                            if (!empty($ot['id_siswa'])) {
                                foreach (explode(',', $ot['id_siswa']) as $s) {
                                    $s = trim($s);
                                    if (!empty($s))
                                        $targetStudentIds[$s] = true;
                                }
                            }
                            if (!empty($ot['student_ids'])) {
                                foreach (explode(',', $ot['student_ids']) as $s) {
                                    $s = trim($s);
                                    if (!empty($s))
                                        $targetStudentIds[$s] = true;
                                }
                            }
                        }
                    } catch (Exception $e) {
                    }

                    // Cari juga seluruh siswa dengan nomor WhatsApp yang cocok di tabel siswa
                    try {
                        $stByPhoneStmt = $pdo->prepare("SELECT id FROM siswa WHERE no_wa = ? OR no_wa LIKE ?");
                        $stByPhoneStmt->execute([$phone, "%{$last8}%"]);
                        $stIds = $stByPhoneStmt->fetchAll(PDO::FETCH_COLUMN);
                        foreach ($stIds as $s) {
                            $s = trim($s);
                            if (!empty($s))
                                $targetStudentIds[$s] = true;
                        }
                    } catch (Exception $e) {
                    }
                }
            }

            $allStudentIds = array_keys($targetStudentIds);

            // 2. Ambil data profil seluruh anak yang terhubung
            $students = [];
            $studentMap = [];
            if (!empty($allStudentIds)) {
                $inPlaceholders = implode(',', array_fill(0, count($allStudentIds), '?'));
                $stStmt = $pdo->prepare("SELECT id, nama AS name, kelas AS className, barcode AS barcodeValue, no_wa AS whatsappNumber, nama_wali AS parentName, status_aktif AS isActive FROM siswa WHERE id IN ($inPlaceholders)");
                $stStmt->execute($allStudentIds);
                $stRows = $stStmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($stRows as $st) {
                    $st['isActive'] = (bool) $st['isActive'];
                    $students[] = $st;
                    $studentMap[$st['id']] = $st;
                }
            }

            // Siswa utama untuk backwards compatibility
            $student = null;
            if (!empty($requestedStudentId) && isset($studentMap[$requestedStudentId])) {
                $student = $studentMap[$requestedStudentId];
            } elseif (!empty($students)) {
                $student = $students[0];
            }

            // 3. Ambil seluruh riwayat kehadiran untuk SEMUA anak dari tabel absensi
            $transactions = [];
            if (!empty($allStudentIds)) {
                $inPlaceholders = implode(',', array_fill(0, count($allStudentIds), '?'));
                $abStmt = $pdo->prepare("SELECT * FROM absensi WHERE id_siswa IN ($inPlaceholders) ORDER BY tanggal DESC, jam_masuk DESC");
                $abStmt->execute($allStudentIds);
                $rows = $abStmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($rows as $r) {
                    $tgl = $r['tanggal'];
                    $curStudentId = $r['id_siswa'];
                    $curSt = $studentMap[$curStudentId] ?? null;
                    $sName = $r['nama_siswa'] ?: ($curSt['name'] ?? 'Siswa');
                    $sClass = $r['kelas'] ?: ($curSt['className'] ?? '-');

                    // Bersihkan suffix _IN / _OUT yang mungkin sudah ada agar tidak berulang menjadi _IN_IN
                    $rawTxId = trim($r['transaction_id'] ?? '');
                    $baseTxId = !empty($rawTxId) ? preg_replace('/_(IN|OUT)$/i', '', $rawTxId) : ('TX-' . $r['id']);
                    $inTxId = $baseTxId . '_IN';
                    $outTxId = $baseTxId . '_OUT';

                    // Transaksi Masuk (jika ada jam_masuk)
                    if (!empty($r['jam_masuk']) && $r['jam_masuk'] !== '-') {
                        // Pastikan format ISO lengkap dengan offset WITA (+08:00) agar akurat di HP
                        $jamFormatted = strlen($r['jam_masuk']) === 5 ? $r['jam_masuk'] . ':00' : $r['jam_masuk'];
                        $transactions[] = [
                            'transactionId' => $inTxId,
                            'studentId' => $curStudentId,
                            'studentName' => $sName,
                            'className' => $sClass,
                            'attendanceDate' => $tgl,
                            'attendanceType' => 'MASUK',
                            'attendanceStatus' => strtoupper(trim($r['status'] ?: 'HADIR')),
                            'method' => $r['metode'] ?: 'USB_SCANNER',
                            'deviceId' => $r['device_id'] ?: 'PC-01',
                            'operatorId' => $r['operator_id'] ?: 'admin',
                            'operatorName' => $r['operator_name'] ?: 'Operator',
                            'deviceTimestamp' => $tgl . 'T' . $jamFormatted . '+08:00',
                            'syncStatus' => 'SYNCED',
                            'notes' => $r['keterangan'] ?: null,
                        ];
                    }

                    // Transaksi Pulang (jika ada jam_pulang)
                    if (!empty($r['jam_pulang']) && $r['jam_pulang'] !== '-') {
                        $jamPulangFormatted = strlen($r['jam_pulang']) === 5 ? $r['jam_pulang'] . ':00' : $r['jam_pulang'];
                        $transactions[] = [
                            'transactionId' => $outTxId,
                            'studentId' => $curStudentId,
                            'studentName' => $sName,
                            'className' => $sClass,
                            'attendanceDate' => $tgl,
                            'attendanceType' => 'PULANG',
                            'attendanceStatus' => 'PULANG',
                            'method' => $r['metode'] ?: 'USB_SCANNER',
                            'deviceId' => $r['device_id'] ?: 'PC-01',
                            'operatorId' => $r['operator_id'] ?: 'admin',
                            'operatorName' => $r['operator_name'] ?: 'Operator',
                            'deviceTimestamp' => $tgl . 'T' . $jamPulangFormatted . '+08:00',
                            'syncStatus' => 'SYNCED',
                            'notes' => $r['keterangan'] ?: null,
                        ];
                    }
                }
            }

            // Ambil jadwal operasional madrasah terkini dari database
            $schoolSettings = [
                'entry_limit' => '07:15',
                'entry_start' => '06:30',
                'late_limit' => '07:30',
                'dismissal' => '15:30',
                'timezone' => 'Asia/Makassar'
            ];
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS pengaturan (
                        kunci VARCHAR(50) PRIMARY KEY,
                        nilai TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
                $setStmt = $pdo->query("SELECT kunci, nilai FROM pengaturan");
                while ($setRow = $setStmt->fetch(PDO::FETCH_ASSOC)) {
                    $schoolSettings[$setRow['kunci']] = $setRow['nilai'];
                }
            } catch (Exception $e) {
            }

            echo json_encode([
                'success' => true,
                'studentId' => $student ? $student['id'] : $requestedStudentId,
                'student' => $student,
                'students' => $students,
                'studentIds' => $allStudentIds,
                'transactions' => $transactions,
                'totalTransactions' => count($transactions),
                'settings' => $schoolSettings,
                'serverTime' => date('c')
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal memuat data portal orang tua: ' . $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 8B. PENGATURAN JADWAL OPERASIONAL MADRASAH (SERVER SYNC)
    // --------------------------------------------------------
    case 'saveSettings':
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS pengaturan (
                    kunci VARCHAR(50) PRIMARY KEY,
                    nilai TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            $settings = isset($payload['settings']) && is_array($payload['settings']) ? $payload['settings'] : $payload;
            $setStmt = $pdo->prepare("
                INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)
            ");
            foreach ($settings as $k => $v) {
                if ($k === 'action')
                    continue;
                $setStmt->execute([trim($k), trim($v)]);
            }
            echo json_encode(['success' => true, 'message' => 'Pengaturan jadwal berhasil disimpan ke database.']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    case 'getSettings':
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS pengaturan (
                    kunci VARCHAR(50) PRIMARY KEY,
                    nilai TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            $defaults = [
                'entry_limit' => '07:15',
                'entry_start' => '06:30',
                'late_limit' => '07:30',
                'dismissal' => '15:30',
                'timezone' => 'Asia/Makassar'
            ];
            $rows = $pdo->query("SELECT kunci, nilai FROM pengaturan")->fetchAll(PDO::FETCH_KEY_PAIR);
            $merged = array_merge($defaults, $rows ?: []);
            sendJsonWithETag(['success' => true, 'settings' => $merged], 30);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 9. MANAJEMEN PENGGUNA PETUGAS (SUPER ADMIN & OPERATOR PC: tabel users)
    //    CATATAN: Endpoint ini HANYA untuk tabel users (admin/operator).
    //    Akun orang tua dipisah di endpoint getParents (tabel orang_tua).
    // --------------------------------------------------------
    case 'getUsers':
        try {
            // Cek nama tabel yang ada di database MySQL — KHUSUS tabel staff, BUKAN orang_tua
            $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            $targetTable = null;
            foreach (['users', 'user', 'tb_users', 'tb_user'] as $tbl) {
                // Jangan gunakan tabel orang_tua/wali_murid di sini
                if (in_array($tbl, $tables)) {
                    $targetTable = $tbl;
                    break;
                }
            }

            // Hapus akun operator demo bawaan lama agar tidak muncul kembali di UI
            if ($targetTable) {
                try {
                    $pdo->exec("DELETE FROM `{$targetTable}` WHERE username IN ('admin_pc01', 'admin_pc02', 'admin_pc03')");
                } catch (Exception $e) {
                }
            }

            if (!$targetTable) {
                // Buat tabel users standar jika belum ada tabel user sama sekali
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS users (
                        user_id VARCHAR(50) PRIMARY KEY,
                        username VARCHAR(100) NOT NULL UNIQUE,
                        full_name VARCHAR(150) NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        role VARCHAR(50) NOT NULL DEFAULT 'PARENT',
                        assigned_device_id VARCHAR(50) DEFAULT 'ALL',
                        student_id VARCHAR(50) DEFAULT NULL,
                        phone VARCHAR(50) DEFAULT NULL,
                        status VARCHAR(20) DEFAULT 'ACTIVE',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
                $targetTable = 'users';
            }

            // Dapatkan semua kolom aktual yang ada pada tabel tersebut
            $colsStmt = $pdo->query("SHOW COLUMNS FROM `{$targetTable}`");
            $existingCols = $colsStmt->fetchAll(PDO::FETCH_COLUMN);

            // Petakan nama kolom secara dinamis dan fleksibel
            $idCol = in_array('user_id', $existingCols) ? 'user_id' : (in_array('id', $existingCols) ? 'id' : $existingCols[0]);
            $unameCol = in_array('username', $existingCols) ? 'username' : (in_array('uname', $existingCols) ? 'uname' : (in_array('user', $existingCols) ? 'user' : $idCol));
            $nameCol = in_array('full_name', $existingCols) ? 'full_name' : (in_array('nama', $existingCols) ? 'nama' : (in_array('nama_lengkap', $existingCols) ? 'nama_lengkap' : $unameCol));
            $passCol = in_array('password_hash', $existingCols) ? 'password_hash' : (in_array('password', $existingCols) ? 'password' : (in_array('pass', $existingCols) ? 'pass' : ''));
            $roleCol = in_array('role', $existingCols) ? 'role' : (in_array('level', $existingCols) ? 'level' : '');
            $deviceCol = in_array('assigned_device_id', $existingCols) ? 'assigned_device_id' : (in_array('device_id', $existingCols) ? 'device_id' : '');
            $studentCol = in_array('student_id', $existingCols) ? 'student_id' : (in_array('id_siswa', $existingCols) ? 'id_siswa' : (in_array('ID', $existingCols) ? 'ID' : ''));
            $phoneCol = in_array('phone', $existingCols) ? 'phone' : (in_array('no_hp', $existingCols) ? 'no_hp' : (in_array('no_wa', $existingCols) ? 'no_wa' : (in_array('telepon', $existingCols) ? 'telepon' : '')));
            $statusCol = in_array('status', $existingCols) ? 'status' : (in_array('status_aktif', $existingCols) ? 'status_aktif' : '');

            $selectParts = [
                "`{$idCol}` AS userId",
                "`{$unameCol}` AS username",
                "`{$nameCol}` AS fullName",
            ];
            $selectParts[] = $passCol ? "`{$passCol}` AS passwordHash" : "'' AS passwordHash";
            $selectParts[] = $roleCol ? "`{$roleCol}` AS role" : "'PARENT' AS role";
            $selectParts[] = $deviceCol ? "`{$deviceCol}` AS assignedDeviceId" : "'ALL' AS assignedDeviceId";
            $selectParts[] = $studentCol ? "`{$studentCol}` AS studentId" : "NULL AS studentId";
            $selectParts[] = $phoneCol ? "`{$phoneCol}` AS phone" : "NULL AS phone";
            $selectParts[] = $statusCol ? "`{$statusCol}` AS status" : "'ACTIVE' AS status";

            $sql = "SELECT " . implode(', ', $selectParts) . " FROM `{$targetTable}`";
            $stmt = $pdo->query($sql);
            $rawUsers = $stmt->fetchAll();

            $mappedUsers = [];
            foreach ($rawUsers as $u) {
                $r = strtoupper(trim($u['role'] ?? ''));
                if ($r === 'ORANG_TUA' || $r === 'ORANG TUA' || $r === 'WALI' || $r === 'USER' || $r === 'SISWA') {
                    $r = 'PARENT';
                } elseif ($r === 'ADMIN' || $r === 'SUPERADMIN' || $r === 'SUPER_ADMIN') {
                    $r = 'SUPER_ADMIN';
                } elseif ($r === 'OPERATOR') {
                    $r = 'ADMIN_PC';
                } elseif (empty($r)) {
                    $r = 'PARENT';
                }

                $st = strtoupper(trim($u['status'] ?? ''));
                if ($st === '1' || $st === 'AKTIF' || $st === 'ACTIVE' || empty($st)) {
                    $st = 'ACTIVE';
                } else {
                    $st = 'INACTIVE';
                }

                $mappedUsers[] = [
                    'userId' => (string) $u['userId'],
                    'username' => (string) $u['username'],
                    'fullName' => (string) $u['fullName'],
                    'passwordHash' => (string) $u['passwordHash'],
                    'role' => $r,
                    'assignedDeviceId' => $u['assignedDeviceId'] ?: 'ALL',
                    'studentId' => $u['studentId'] ?: null,
                    'phone' => $u['phone'] ?: (string) $u['username'],
                    'status' => $st,
                    'createdAt' => date('c'),
                ];
            }

            sendJsonWithETag([
                'success' => true,
                'table' => $targetTable,
                'users' => $mappedUsers,
                'total' => count($mappedUsers)
            ], 15);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal mengambil data pengguna: ' . $e->getMessage()]);
        }
        break;

    case 'saveUser':
        $userId = isset($payload['userId']) ? trim($payload['userId']) : '';
        $username = isset($payload['username']) ? trim($payload['username']) : '';
        $fullName = isset($payload['fullName']) ? trim($payload['fullName']) : '';
        $passwordHash = isset($payload['passwordHash']) ? trim($payload['passwordHash']) : '';
        $role = isset($payload['role']) ? trim($payload['role']) : 'PARENT';
        $assignedDeviceId = isset($payload['assignedDeviceId']) ? trim($payload['assignedDeviceId']) : 'ALL';
        $studentId = isset($payload['studentId']) ? trim($payload['studentId']) : null;
        $phone = isset($payload['phone']) ? trim($payload['phone']) : null;
        $status = isset($payload['status']) ? trim($payload['status']) : 'ACTIVE';

        if (empty($userId) || empty($username) || empty($passwordHash)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Data user tidak lengkap.']);
            exit();
        }

        try {
            // Cek nama tabel yang ada di database MySQL — KHUSUS tabel staff
            $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            $targetTable = null;
            foreach (['users', 'user', 'tb_users', 'tb_user'] as $tbl) {
                if (in_array($tbl, $tables)) {
                    $targetTable = $tbl;
                    break;
                }
            }
            if (!$targetTable) {
                $targetTable = 'users';
            }

            // Pastikan tabel users ada jika belum dibuat
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `{$targetTable}` (
                    user_id VARCHAR(50) PRIMARY KEY,
                    username VARCHAR(100) NOT NULL UNIQUE,
                    full_name VARCHAR(150) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(50) NOT NULL DEFAULT 'PARENT',
                    assigned_device_id VARCHAR(50) DEFAULT 'ALL',
                    student_id VARCHAR(50) DEFAULT NULL,
                    phone VARCHAR(50) DEFAULT NULL,
                    status VARCHAR(20) DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Cek kolom aktual pada tabel
            $colsStmt = $pdo->query("SHOW COLUMNS FROM `{$targetTable}`");
            $existingCols = $colsStmt->fetchAll(PDO::FETCH_COLUMN);

            $idCol = in_array('user_id', $existingCols) ? 'user_id' : (in_array('id', $existingCols) ? 'id' : $existingCols[0]);
            $unameCol = in_array('username', $existingCols) ? 'username' : (in_array('uname', $existingCols) ? 'uname' : (in_array('user', $existingCols) ? 'user' : $idCol));
            $nameCol = in_array('full_name', $existingCols) ? 'full_name' : (in_array('nama', $existingCols) ? 'nama' : (in_array('nama_lengkap', $existingCols) ? 'nama_lengkap' : $unameCol));
            $passCol = in_array('password_hash', $existingCols) ? 'password_hash' : (in_array('password', $existingCols) ? 'password' : (in_array('pass', $existingCols) ? 'pass' : ''));
            $roleCol = in_array('role', $existingCols) ? 'role' : (in_array('level', $existingCols) ? 'level' : '');
            $deviceCol = in_array('assigned_device_id', $existingCols) ? 'assigned_device_id' : (in_array('device_id', $existingCols) ? 'device_id' : '');
            $studentCol = in_array('student_id', $existingCols) ? 'student_id' : (in_array('id_siswa', $existingCols) ? 'id_siswa' : (in_array('ID', $existingCols) ? 'ID' : ''));
            $phoneCol = in_array('phone', $existingCols) ? 'phone' : (in_array('no_hp', $existingCols) ? 'no_hp' : (in_array('no_wa', $existingCols) ? 'no_wa' : (in_array('telepon', $existingCols) ? 'telepon' : '')));
            $statusCol = in_array('status', $existingCols) ? 'status' : (in_array('status_aktif', $existingCols) ? 'status_aktif' : '');

            // Bangun kolom INSERT & VALUES secara dinamis
            $insertFields = ["`{$idCol}`", "`{$unameCol}`", "`{$nameCol}`"];
            $insertPlaceholders = ["?", "?", "?"];
            $insertValues = [$userId, $username, $fullName];
            $updateClauses = ["`{$unameCol}` = VALUES(`{$unameCol}`)", "`{$nameCol}` = VALUES(`{$nameCol}`)"];

            if ($passCol) {
                $insertFields[] = "`{$passCol}`";
                $insertPlaceholders[] = "?";
                $insertValues[] = $passwordHash;
                $updateClauses[] = "`{$passCol}` = VALUES(`{$passCol}`)";
            }
            if ($roleCol) {
                $insertFields[] = "`{$roleCol}`";
                $insertPlaceholders[] = "?";
                $insertValues[] = $role;
                $updateClauses[] = "`{$roleCol}` = VALUES(`{$roleCol}`)";
            }
            if ($deviceCol) {
                $insertFields[] = "`{$deviceCol}`";
                $insertPlaceholders[] = "?";
                $insertValues[] = $assignedDeviceId;
                $updateClauses[] = "`{$deviceCol}` = VALUES(`{$deviceCol}`)";
            }
            if ($studentCol) {
                $insertFields[] = "`{$studentCol}`";
                $insertPlaceholders[] = "?";
                $insertValues[] = $studentId;
                $updateClauses[] = "`{$studentCol}` = VALUES(`{$studentCol}`)";
            }
            if ($phoneCol) {
                $insertFields[] = "`{$phoneCol}`";
                $insertPlaceholders[] = "?";
                $insertValues[] = $phone;
                $updateClauses[] = "`{$phoneCol}` = VALUES(`{$phoneCol}`)";
            }
            if ($statusCol) {
                $insertFields[] = "`{$statusCol}`";
                $insertPlaceholders[] = "?";
                $insertValues[] = $status;
                $updateClauses[] = "`{$statusCol}` = VALUES(`{$statusCol}`)";
            }

            $sql = "INSERT INTO `{$targetTable}` (" . implode(', ', $insertFields) . ")
                    VALUES (" . implode(', ', $insertPlaceholders) . ")
                    ON DUPLICATE KEY UPDATE " . implode(', ', $updateClauses);

            $stmt = $pdo->prepare($sql);
            $stmt->execute($insertValues);

            echo json_encode(['success' => true, 'message' => "User [{$username}] berhasil disimpan ke MySQL ({$targetTable})."]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Gagal menyimpan user ke MySQL: ' . $e->getMessage()]);
        }
        break;

    case 'deleteUser':
        $userId = isset($payload['userId']) ? trim($payload['userId']) : (isset($_GET['userId']) ? trim($_GET['userId']) : '');
        $username = isset($payload['username']) ? trim($payload['username']) : (isset($_GET['username']) ? trim($_GET['username']) : '');
        if (empty($userId) && empty($username)) {
            echo json_encode(['success' => false, 'error' => 'User ID atau Username tidak ditentukan.']);
            exit();
        }
        try {
            $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
            $targetTable = null;
            foreach (['users', 'user', 'tb_users', 'tb_user'] as $tbl) {
                if (in_array($tbl, $tables)) {
                    $targetTable = $tbl;
                    break;
                }
            }
            if (!$targetTable)
                $targetTable = 'users';

            $colsStmt = $pdo->query("SHOW COLUMNS FROM `{$targetTable}`");
            $existingCols = $colsStmt->fetchAll(PDO::FETCH_COLUMN);

            $idCol = in_array('user_id', $existingCols) ? 'user_id' : (in_array('id', $existingCols) ? 'id' : $existingCols[0]);
            $unameCol = in_array('username', $existingCols) ? 'username' : (in_array('uname', $existingCols) ? 'uname' : (in_array('user', $existingCols) ? 'user' : $idCol));

            $stmt = $pdo->prepare("DELETE FROM `{$targetTable}` WHERE `{$idCol}` = ? OR `{$unameCol}` = ?");
            $stmt->execute([$userId, $username ?: $userId]);

            // Hapus juga dari orang_tua jika ada
            try {
                $stmtOt = $pdo->prepare("DELETE FROM orang_tua WHERE id = ? OR no_hp = ?");
                $stmtOt->execute([$userId, $username ?: $userId]);
            } catch (Exception $e) {
            }

            // Catat ke deleted_accounts
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS deleted_accounts (
                        id VARCHAR(100) PRIMARY KEY,
                        identifier VARCHAR(150),
                        phone VARCHAR(50),
                        role VARCHAR(50),
                        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_ident (identifier),
                        INDEX idx_phone (phone)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
                $insDel = $pdo->prepare("
                    INSERT INTO deleted_accounts (id, identifier, phone, role) 
                    VALUES (?, ?, '', 'STAFF') 
                    ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP
                ");
                $insDel->execute([$userId, $username ?: $userId]);
            } catch (Exception $e) {
            }

            echo json_encode(['success' => true, 'message' => "User berhasil dihapus dari MySQL ({$targetTable})."]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 9B. VALIDASI SESI PENGGUNA (CEK APAKAH AKUN MASIH AKTIF / SUDAH DIHAPUS)
    // --------------------------------------------------------
    case 'validateSession':
        $userId = isset($payload['userId']) ? trim($payload['userId']) : (isset($_GET['userId']) ? trim($_GET['userId']) : '');
        $username = isset($payload['username']) ? trim($payload['username']) : (isset($_GET['username']) ? trim($_GET['username']) : '');
        $phone = isset($payload['phone']) ? trim($payload['phone']) : (isset($_GET['phone']) ? trim($_GET['phone']) : '');
        $role = isset($payload['role']) ? strtoupper(trim($payload['role'])) : (isset($_GET['role']) ? strtoupper(trim($_GET['role'])) : '');

        if (empty($userId) && empty($username) && empty($phone)) {
            echo json_encode(['success' => false, 'valid' => false, 'error' => 'Parameter identitas user kosong.']);
            exit();
        }

        try {
            // Pastikan tabel deleted_accounts ada
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS deleted_accounts (
                    id VARCHAR(100) PRIMARY KEY,
                    identifier VARCHAR(150),
                    phone VARCHAR(50),
                    role VARCHAR(50),
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_ident (identifier),
                    INDEX idx_phone (phone)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            $cleanDigits = preg_replace('/[^0-9]/', '', $phone ?: ($username ?: $userId));
            $phone8 = strlen($cleanDigits) >= 8 ? substr($cleanDigits, -8) : $cleanDigits;
            $likeClean = $phone8 ? "%{$phone8}%" : "";

            // 1. Jika role PARENT (Orang Tua): Cek terlebih dahulu di tabel orang_tua!
            // Jika akun aktif terdaftar di orang_tua, akun tersebut 100% SAH dan tidak boleh ditandai terhapus.
            if ($role === 'PARENT' || (!empty($phone) && $role !== 'SUPER_ADMIN' && $role !== 'ADMIN_PC')) {
                try {
                    $otStmt = $pdo->prepare("
                        SELECT id, status, id_siswa FROM orang_tua 
                        WHERE id = ? 
                           OR no_hp = ? 
                           OR no_hp = ? 
                           OR (no_hp LIKE ? AND ? != '')
                        LIMIT 1
                    ");
                    $otStmt->execute([$userId, $phone ?: $username, $cleanDigits, $likeClean, $likeClean]);
                    $ot = $otStmt->fetch();
                    if ($ot) {
                        if (strtoupper($ot['status']) !== 'ACTIVE') {
                            echo json_encode([
                                'success' => true,
                                'valid' => false,
                                'reason' => 'INACTIVE',
                                'message' => 'Akun orang tua ini sedang dinonaktifkan oleh Administrator.'
                            ]);
                            exit();
                        }
                        // Bersihkan riwayat deleted_accounts lama jika akun dibuat kembali
                        try {
                            $pdo->prepare("DELETE FROM deleted_accounts WHERE id = ? OR identifier = ? OR phone = ? OR (phone LIKE ? AND ? != '')")
                                ->execute([$ot['id'], $phone ?: $username, $cleanDigits, $likeClean, $likeClean]);
                        } catch (Exception $e) {
                        }

                        echo json_encode([
                            'success' => true,
                            'valid' => true,
                            'studentId' => $ot['id_siswa']
                        ]);
                        exit();
                    }
                } catch (Exception $e) {
                }

                // Jika tidak ada di tabel orang_tua, baru cek apakah memang pernah sengaja dihapus
                $chkDel = $pdo->prepare("
                    SELECT id FROM deleted_accounts 
                    WHERE (id = ? AND ? != '') 
                       OR (identifier = ? AND ? != '') 
                       OR (phone = ? AND ? != '') 
                       OR (phone = ? AND ? != '')
                    LIMIT 1
                ");
                $chkDel->execute([$userId, $userId, $username ?: $phone, $username ?: $phone, $phone, $phone, $cleanDigits, $cleanDigits]);
                if ($chkDel->fetch()) {
                    echo json_encode([
                        'success' => true,
                        'valid' => false,
                        'reason' => 'DELETED',
                        'message' => 'Akun ini telah dihapus oleh Administrator madrasah.'
                    ]);
                    exit();
                }

                // Akun belum tersinkron ke server, tetapi bukan terhapus: jangan blokir login lokal
                echo json_encode(['success' => true, 'valid' => true, 'note' => 'LOCAL_OR_UNSYNCED']);
                exit();
            } else {
                // 2. Jika STAFF (Petugas / Admin)
                // Cek deleted_accounts
                $chkDel = $pdo->prepare("
                    SELECT id FROM deleted_accounts 
                    WHERE (id = ? AND ? != '') 
                       OR (identifier = ? AND ? != '') 
                    LIMIT 1
                ");
                $chkDel->execute([$userId, $userId, $username, $username]);
                if ($chkDel->fetch()) {
                    echo json_encode([
                        'success' => true,
                        'valid' => false,
                        'reason' => 'DELETED',
                        'message' => 'Akun ini telah dihapus oleh Administrator madrasah.'
                    ]);
                    exit();
                }

                $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
                $targetTable = 'users';
                foreach (['users', 'user', 'tb_users', 'tb_user'] as $tbl) {
                    if (in_array($tbl, $tables)) {
                        $targetTable = $tbl;
                        break;
                    }
                }
                $uStmt = $pdo->prepare("SELECT * FROM `{$targetTable}` WHERE user_id = ? OR username = ? LIMIT 1");
                $uStmt->execute([$userId, $username ?: $userId]);
                $u = $uStmt->fetch();
                if (!$u) {
                    echo json_encode([
                        'success' => true,
                        'valid' => false,
                        'reason' => 'NOT_FOUND',
                        'message' => 'Akun petugas tidak ditemukan di database.'
                    ]);
                    exit();
                }
                $st = strtoupper($u['status'] ?? ($u['status_aktif'] ?? 'ACTIVE'));
                if ($st !== 'ACTIVE' && $st !== '1') {
                    echo json_encode([
                        'success' => true,
                        'valid' => false,
                        'reason' => 'INACTIVE',
                        'message' => 'Akun petugas sedang dinonaktifkan.'
                    ]);
                    exit();
                }
                echo json_encode(['success' => true, 'valid' => true]);
                exit();
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    // --------------------------------------------------------
    // 10. WEB PUSH NOTIFICATION SUBSCRIPTION & DISPATCH
    // --------------------------------------------------------
    case 'getVapidPublicKey':
        require_once __DIR__ . '/web_push.php';
        $vapidKeys = getOrGenerateVapidKeys();
        $count = 0;
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(50),
                    student_id VARCHAR(50),
                    phone VARCHAR(50),
                    endpoint TEXT NOT NULL,
                    p256dh VARCHAR(255) NOT NULL,
                    auth VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_student_id (student_id),
                    INDEX idx_phone (phone)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            // Bersihkan data sampah tanpa endpoint atau tanpa pemilik
            $pdo->exec("DELETE FROM push_subscriptions WHERE endpoint IS NULL OR endpoint = ''");
            $pdo->exec("DELETE FROM push_subscriptions WHERE (student_id IS NULL OR student_id = '') AND (phone IS NULL OR phone = '') AND (user_id IS NULL OR user_id = '')");

            // Otomatis bersihkan stale token berlebih (sisakan max 2 subscription terbaru per user/phone)
            $allUsers = $pdo->query("SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IS NOT NULL AND user_id != ''")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($allUsers as $uId) {
                $q = $pdo->prepare("SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC");
                $q->execute([$uId]);
                $ids = $q->fetchAll(PDO::FETCH_COLUMN);
                if (count($ids) > 2) {
                    $toDel = array_slice($ids, 2);
                    $inP = implode(',', array_fill(0, count($toDel), '?'));
                    $pdo->prepare("DELETE FROM push_subscriptions WHERE id IN ($inP)")->execute($toDel);
                }
            }

            $count = (int) $pdo->query("SELECT COUNT(*) FROM push_subscriptions")->fetchColumn();
        } catch (Exception $e) {
        }
        echo json_encode([
            'success' => true,
            'publicKey' => $vapidKeys['publicKey'],
            'totalSubscribers' => $count,
        ]);
        break;

    case 'savePushSubscription':
        try {
            require_once __DIR__ . '/web_push.php';

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(50),
                    student_id VARCHAR(50),
                    phone VARCHAR(50),
                    endpoint TEXT NOT NULL,
                    p256dh VARCHAR(255) NOT NULL,
                    auth VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_student_id (student_id),
                    INDEX idx_phone (phone)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            $userId = isset($payload['userId']) ? trim($payload['userId']) : '';
            $studentId = isset($payload['studentId']) ? trim($payload['studentId']) : '';
            $phone = isset($payload['phone']) ? trim($payload['phone']) : '';
            $endpoint = isset($payload['endpoint']) ? trim($payload['endpoint']) : '';

            // Fallback otomatis: jika studentId kosong, cari dari tabel users / orang_tua / siswa lewat userId atau nomor HP (minimal 8 digit)
            if (empty($studentId) && !empty($userId)) {
                try {
                    $uQ = $pdo->prepare("SELECT studentId FROM users WHERE userId = ? AND role = 'PARENT' LIMIT 1");
                    $uQ->execute([$userId]);
                    $found = $uQ->fetchColumn();
                    if ($found)
                        $studentId = trim($found);
                } catch (Exception $e) {
                }
            }

            if (empty($studentId) && !empty($phone)) {
                $cleanP = preg_replace('/[^0-9]/', '', $phone);
                if (strlen($cleanP) >= 8) {
                    $last8 = substr($cleanP, -8);
                    try {
                        $otQ = $pdo->prepare("SELECT id_siswa, student_ids FROM orang_tua WHERE no_hp = ? OR no_hp LIKE ? OR id = ? LIMIT 1");
                        $otQ->execute([$phone, "%{$last8}%", $userId]);
                        $otRow = $otQ->fetch(PDO::FETCH_ASSOC);
                        if ($otRow) {
                            $studentId = !empty($otRow['id_siswa']) ? $otRow['id_siswa'] : '';
                            if (empty($studentId) && !empty($otRow['student_ids'])) {
                                $ids = explode(',', $otRow['student_ids']);
                                $studentId = trim($ids[0]);
                            }
                        }
                    } catch (Throwable $e) {
                    }

                    if (empty($studentId)) {
                        try {
                            $stQ = $pdo->prepare("SELECT id FROM siswa WHERE no_wa = ? OR no_wa LIKE ? LIMIT 1");
                            $stQ->execute([$phone, "%{$last8}%"]);
                            $foundId = $stQ->fetchColumn();
                            if ($foundId)
                                $studentId = $foundId;
                        } catch (Throwable $e) {
                        }
                    }
                }
            }

            $keys = isset($payload['keys']) ? $payload['keys'] : [];
            $p256dh = isset($keys['p256dh']) ? trim($keys['p256dh']) : (isset($payload['p256dh']) ? trim($payload['p256dh']) : '');
            $auth = isset($keys['auth']) ? trim($keys['auth']) : (isset($payload['auth']) ? trim($payload['auth']) : '');

            if (empty($endpoint) || empty($p256dh) || empty($auth)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Data langganan push tidak lengkap.']);
                exit();
            }

            // Hapus duplikat endpoint lama dari browser ini
            $delStmt = $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
            $delStmt->execute([$endpoint]);

            // Simpan pendaftaran baru
            $insStmt = $pdo->prepare("
                INSERT INTO push_subscriptions (user_id, student_id, phone, endpoint, p256dh, auth)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $insStmt->execute([$userId, $studentId, $phone, $endpoint, $p256dh, $auth]);

            // PEMBERSIHAN OTOMATIS (PRUNING TOKEN KEDALUWARSA):
            // Batasi riwayat token push per akun / per nomor HP agar tidak menumpuk saat HP re-subscribe.
            // Sisakan maksimal 2 token perangkat terbaru (misal HP Ayah dan HP Ibu) per akun.
            if (!empty($userId)) {
                $subIdsStmt = $pdo->prepare("SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC");
                $subIdsStmt->execute([$userId]);
                $allIds = $subIdsStmt->fetchAll(PDO::FETCH_COLUMN);
                if (count($allIds) > 2) {
                    $staleIds = array_slice($allIds, 2);
                    $placeholders = implode(',', array_fill(0, count($staleIds), '?'));
                    $pdo->prepare("DELETE FROM push_subscriptions WHERE id IN ($placeholders)")->execute($staleIds);
                }
            } elseif (!empty($phone)) {
                $subIdsStmt = $pdo->prepare("SELECT id FROM push_subscriptions WHERE phone = ? ORDER BY id DESC");
                $subIdsStmt->execute([$phone]);
                $allIds = $subIdsStmt->fetchAll(PDO::FETCH_COLUMN);
                if (count($allIds) > 2) {
                    $staleIds = array_slice($allIds, 2);
                    $placeholders = implode(',', array_fill(0, count($staleIds), '?'));
                    $pdo->prepare("DELETE FROM push_subscriptions WHERE id IN ($placeholders)")->execute($staleIds);
                }
            }

            echo json_encode([
                'success' => true,
                'message' => 'Langganan Web Push berhasil disimpan di server. HP siap menerima notifikasi saat aplikasi ditutup.'
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    case 'cleanPushSubscriptions':
        try {
            // Bersihkan data sampah tanpa endpoint atau tanpa pemilik
            $pdo->exec("DELETE FROM push_subscriptions WHERE endpoint IS NULL OR endpoint = ''");
            $pdo->exec("DELETE FROM push_subscriptions WHERE (student_id IS NULL OR student_id = '') AND (phone IS NULL OR phone = '') AND (user_id IS NULL OR user_id = '')");

            // Hanya sisakan 2 token pendaftaran paling baru untuk setiap user / nomor HP
            $allUsers = $pdo->query("SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IS NOT NULL AND user_id != ''")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($allUsers as $uId) {
                $q = $pdo->prepare("SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC");
                $q->execute([$uId]);
                $ids = $q->fetchAll(PDO::FETCH_COLUMN);
                if (count($ids) > 2) {
                    $toDel = array_slice($ids, 2);
                    $inP = implode(',', array_fill(0, count($toDel), '?'));
                    $pdo->prepare("DELETE FROM push_subscriptions WHERE id IN ($inP)")->execute($toDel);
                }
            }

            $countAfter = (int) $pdo->query("SELECT COUNT(*) FROM push_subscriptions")->fetchColumn();
            echo json_encode([
                'success' => true,
                'message' => 'Tabel push_subscriptions berhasil dirapikan.',
                'remainingSubscribers' => $countAfter
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    case 'testPushNotification':
        try {
            require_once __DIR__ . '/web_push.php';
            $endpoint = isset($payload['endpoint']) ? trim($payload['endpoint']) : '';
            $studentId = isset($payload['studentId']) ? trim($payload['studentId']) : '';
            $phone = isset($payload['phone']) ? trim($payload['phone']) : '';

            if (!empty($endpoint)) {
                $stmt = $pdo->prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? LIMIT 1");
                $stmt->execute([$endpoint]);
            } else {
                $cleanP = preg_replace('/[^0-9]/', '', $phone);
                $last8 = strlen($cleanP) >= 8 ? substr($cleanP, -8) : $cleanP;
                $like8 = $last8 ? "%{$last8}%" : "";
                $stmt = $pdo->prepare("
                    SELECT endpoint, p256dh, auth 
                    FROM push_subscriptions 
                    WHERE student_id = ? 
                       OR phone = ? 
                       OR phone = ? 
                       OR (phone LIKE ? AND ? != '') 
                    ORDER BY id DESC LIMIT 1
                ");
                $stmt->execute([$studentId, $phone, $cleanP, $like8, $like8]);
            }
            $sub = $stmt->fetch();

            if (!$sub) {
                echo json_encode(['success' => false, 'error' => 'Belum ada pendaftaran Push Subscription untuk HP ini. Silakan klik Aktifkan Notifikasi terlebih dahulu.']);
                exit();
            }

            $delay = isset($payload['delay']) ? intval($payload['delay']) : 0;
            if ($delay > 0 && $delay <= 15) {
                sleep($delay);
            }

            $pushPayload = [
                'title' => 'Pop-up Presensi MAN 1 BULUKUMBA',
                'body' => 'Tes berhasil! Notifikasi muncul di atas layar & layar kunci (lock screen). Aktifkan "Notifikasi Pop-up/Mengambang" di Pengaturan → Aplikasi → Chrome jika tidak muncul.',
                'icon' => '/icon-192.png?v=2',
                'badge' => '/badge-96.png?v=2',
                'url' => '/',
                'tag' => 'test-push-' . time(),
                'actions' => [
                    ['action' => 'open', 'title' => 'Buka Presensi'],
                    ['action' => 'close', 'title' => 'Tutup']
                ]
            ];

            $pushRes = sendSingleWebPush($sub['endpoint'], $sub['p256dh'], $sub['auth'], $pushPayload);

            $isOk = !empty($pushRes['success']);
            echo json_encode([
                'success' => $isOk,
                'error' => $isOk ? null : ($pushRes['error'] ?? 'Push gateway gagal mengirim notifikasi.'),
                'result' => $pushRes,
                'debug' => [
                    'endpointPrefix' => substr($sub['endpoint'], 0, 50) . '...',
                    'hasP256dh' => !empty($sub['p256dh']),
                    'hasAuth' => !empty($sub['auth']),
                ],
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;

    default:
        // --------------------------------------------------------
        // 7. EKSPOR CSV REKAP ABSENSI LANGSUNG DARI PHP
        // --------------------------------------------------------
        if ($action === 'exportCsv') {
            $date = isset($_GET['date']) ? preg_replace('/[^0-9\-]/', '', trim($_GET['date'])) : date('Y-m-d');
            try {
                $stmt = $pdo->prepare("
                    SELECT a.tanggal, a.jam_masuk, a.jam_pulang, a.id_siswa, a.nama_siswa, a.kelas,
                           a.status, a.metode, a.device_id, a.operator_id, a.keterangan
                    FROM absensi a
                    WHERE a.tanggal = ?
                    ORDER BY a.jam_masuk ASC
                ");
                $stmt->execute([$date]);
                $rows = $stmt->fetchAll();

                // Output sebagai file CSV
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="rekap_absensi_MAN1_BULUKUMBA_' . $date . '.csv"');
                header('Cache-Control: no-cache, no-store, must-revalidate');

                $output = fopen('php://output', 'w');
                // BOM UTF-8 agar Excel baca karakter Indonesia
                fputs($output, "\xEF\xBB\xBF");
                fputcsv($output, ['No', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'ID Siswa', 'Nama Siswa', 'Kelas', 'Status', 'Metode', 'Device', 'Operator', 'Keterangan']);

                // Mitigasi CSV Formula Injection (CWE-1236)
                $sanitizeCsv = function ($val) {
                    if (is_string($val) && strlen($val) > 0) {
                        if (in_array($val[0], ['=', '+', '-', '@', "\t", "\r"])) {
                            return "'" . $val;
                        }
                    }
                    return $val;
                };

                foreach ($rows as $i => $row) {
                    $csvRow = [
                        $i + 1,
                        $row['tanggal'],
                        $row['jam_masuk'] ?: '-',
                        $row['jam_pulang'] ?: '-',
                        $row['id_siswa'],
                        $row['nama_siswa'],
                        $row['kelas'],
                        $row['status'],
                        $row['metode'],
                        $row['device_id'],
                        $row['operator_id'],
                        $row['keterangan'] ?: '',
                    ];
                    fputcsv($output, array_map($sanitizeCsv, $csvRow));
                }
                fclose($output);
                exit();
            } catch (Exception $e) {
                error_log("Export CSV Error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Gagal mengekspor data absensi ke format CSV.']);
            }
            break;
        }
        echo json_encode(['success' => false, 'error' => 'Aksi API tidak valid: ' . $action]);
        break;
}

