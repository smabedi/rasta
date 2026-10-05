<?php
declare(strict_types=1);

/**
 * 🏛️ Rasta Backend Engine & Concurrency Store
 * Pure PHP PDO SQLite with WAL Mode & IDOR Protection
 */

date_default_timezone_set('Asia/Tehran');

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DB_PATH', __DIR__ . '/data/rasta.sqlite');

function normalizeDigits(string $input): string {
    $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    $arabic  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    $ascii   = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return str_replace($arabic, $ascii, str_replace($persian, $ascii, $input));
}

// --- DATABASE CONNECTION ---

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $dir = dirname(DB_PATH);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }

            try {
                self::$instance = new PDO('sqlite:' . DB_PATH, null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);

                self::$instance->exec("PRAGMA journal_mode = WAL;");
                self::$instance->exec("PRAGMA foreign_keys = ON;");
                self::$instance->exec("PRAGMA synchronous = NORMAL;");
                self::$instance->exec("PRAGMA busy_timeout = 5000;");
            } catch (PDOException $e) {
                self::sendJsonError('Database connection error: ' . $e->getMessage(), 500);
            }
        }
        return self::$instance;
    }

    public static function sendJsonResponse(array $payload, int $statusCode = 200): void {
        http_response_code($statusCode);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function sendJsonError(string $message, int $statusCode = 400, array $details = []): void {
        http_response_code($statusCode);
        $res = ['ok' => false, 'error' => $message];
        if (!empty($details)) {
            $res['details'] = $details;
        }
        echo json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

// --- SCHEMA BOOTSTRAP ---

// --- SCHEMA BOOTSTRAP ---

class Schema {
    public static function initialize(): void {
        $pdo = Database::getConnection();
        $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS institutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            invite_code TEXT UNIQUE NOT NULL,
            contact_phone TEXT DEFAULT NULL,
            city TEXT DEFAULT 'تهران',
            accepts_new_students INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            institute_id INTEGER DEFAULT NULL REFERENCES institutes(id) ON DELETE SET NULL,
            phone TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            gender TEXT DEFAULT NULL CHECK(gender IN ('male', 'female')),
            role TEXT NOT NULL CHECK(role IN ('admin', 'institute', 'student_affiliated', 'student_independent')),
            stream TEXT DEFAULT NULL CHECK(stream IN ('math', 'experimental', 'humanities')),
            academic_year TEXT DEFAULT '04-05',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS counselor_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            institute_id INTEGER NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
            token TEXT UNIQUE NOT NULL,
            phone TEXT DEFAULT NULL,
            expires_at INTEGER NOT NULL,
            used_at INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sms_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS scenario_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 1 AND 20),
            title TEXT NOT NULL DEFAULT 'چینش پیش‌فرض',
            stream TEXT NOT NULL CHECK(stream IN ('math', 'experimental', 'humanities')),
            preferences_json TEXT NOT NULL DEFAULT '{}',
            custom_ordering_json TEXT NOT NULL DEFAULT '[]',
            version INTEGER NOT NULL DEFAULT 1,
            active_editor_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
            locked_until INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, slot_index)
        );

        CREATE TABLE IF NOT EXISTS auth_tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS presence (
            client_id TEXT PRIMARY KEY,
            last_seen INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
        CREATE INDEX IF NOT EXISTS idx_users_institute ON users(institute_id);
        CREATE INDEX IF NOT EXISTS idx_users_cohort ON users(institute_id, academic_year);
        CREATE INDEX IF NOT EXISTS idx_slots_user_slot ON scenario_slots(user_id, slot_index);
        CREATE INDEX IF NOT EXISTS idx_slots_version ON scenario_slots(id, version);
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(token_hash, expires_at);
        CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen);
        CREATE INDEX IF NOT EXISTS idx_counselor_invites_token ON counselor_invites(token, expires_at);
        SQL
        );

        /*// Dynamic column migrations for existing SQLite databases
        $cols = $pdo->query("PRAGMA table_info(institutes)")->fetchAll(PDO::FETCH_COLUMN, 1);
        if (!in_array('city', $cols, true)) {
            $pdo->exec("ALTER TABLE institutes ADD COLUMN city TEXT DEFAULT 'تهران';");
        }
        if (!in_array('accepts_new_students', $cols, true)) {
            $pdo->exec("ALTER TABLE institutes ADD COLUMN accepts_new_students INTEGER DEFAULT 1;");
        }
        if (!in_array('created_at', $cols, true)) {
            $pdo->exec("ALTER TABLE institutes ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;");
        }*/
    }
}

// --- AUTHENTICATION & ACCESS CONTROL ---

class Auth {
    public static function createToken(int $userId): string {
        $pdo = Database::getConnection();
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = time() + (30 * 86400); // 30 Days

        $stmt = $pdo->prepare("INSERT INTO auth_tokens (token_hash, user_id, expires_at) VALUES (:token_hash, :user_id, :expires_at)");
        $stmt->execute([
            'token_hash' => $tokenHash,
            'user_id' => $userId,
            'expires_at' => $expiresAt
        ]);

        return $token;
    }

    public static function getCurrentUser(): ?array {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $authHeader = $headers['Authorization']
            ?? $headers['authorization']
            ?? $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        $token = null;
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            $token = $matches[1];
        } elseif (!empty($_COOKIE['rasta_token'])) {
            $token = $_COOKIE['rasta_token'];
        } elseif (!empty($GLOBALS['body']['token'])) {
            $token = $GLOBALS['body']['token'];
        }

        if (!$token) {
            return null;
        }

        $tokenHash = hash('sha256', $token);
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("
            SELECT u.id, u.institute_id, u.phone, u.full_name, u.role, u.stream, u.gender, u.academic_year, u.created_at,
                   i.name as institute_name, i.invite_code as institute_invite_code, i.city as institute_city,
                   i.accepts_new_students as institute_accepts_new_students
            FROM auth_tokens t
            JOIN users u ON u.id = t.user_id
            LEFT JOIN institutes i ON i.id = u.institute_id
            WHERE t.token_hash = :token_hash AND t.expires_at > :now
            LIMIT 1
        ");
        $stmt->execute([
            'token_hash' => $tokenHash,
            'now' => time()
        ]);

        $user = $stmt->fetch();
        return $user ?: null;
    }

    public static function requireAuth(): array {
        $user = self::getCurrentUser();
        if (!$user) {
            Database::sendJsonError('احراز هویت انجام نشده است یا نشست منقضی شده است.', 401);
        }
        return $user;
    }

    public static function requireRole(string ...$allowedRoles): array {
        $user = self::requireAuth();
        if (!in_array($user['role'], $allowedRoles, true)) {
            Database::sendJsonError('دسترسی غیرمجاز برای سطح کاربری شما.', 403);
        }
        return $user;
    }

    /**
     * IDOR Guard: Resolves whether the current user is permitted to inspect/modify a student's slots
     */
    public static function resolveTargetStudentId(array $currentUser, PDO $pdo): int {
        $targetIdParam = $_GET['student_id'] ?? $GLOBALS['body']['student_id'] ?? null;

        if ($targetIdParam === null) {
            if (in_array($currentUser['role'], ['admin', 'institute'], true)) {
                Database::sendJsonError('مشاوران و مدیران باید شناسه داوطلب (student_id) را در درخواست مشخص نمایند.', 400);
            }
            return (int)$currentUser['id'];
        }

        $targetId = (int)$targetIdParam;
        if ($targetId === (int)$currentUser['id']) {
            return $targetId;
        }

        if ($currentUser['role'] === 'admin') {
            return $targetId;
        }

        if (str_starts_with($currentUser['role'], 'institute')) {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE id = :id AND institute_id = :inst LIMIT 1");
            $stmt->execute(['id' => $targetId, 'inst' => $currentUser['institute_id']]);
            if ($stmt->fetch()) {
                return $targetId;
            }
        }

        Database::sendJsonError('شما دسترسی مجاز به چینش این داوطلب را ندارید.', 403);
        exit;
    }

    /**
     * Verifies OTP, throttles failed attempts to 5 max, and invalidates on success.
     */
    public static function verifyOtp(PDO $pdo, string $phone, string $code): void {
        $stmt = $pdo->prepare("SELECT * FROM sms_otps WHERE phone = :phone AND expires_at > :now ORDER BY id DESC LIMIT 1");
        $stmt->execute(['phone' => $phone, 'now' => time()]);
        $otp = $stmt->fetch();

        if (!$otp) {
            Database::sendJsonError('کد تأیید اشتباه یا منقضی شده است.', 400);
        }

        // Lockout check
        if ((int)$otp['attempts'] >= 5) {
            Database::sendJsonError('تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً پس از پایان زمان اعتبار، کد جدید دریافت کنید.', 429);
        }

        if (!password_verify($code, $otp['code_hash'])) {
            $newAttempts = (int)$otp['attempts'] + 1;
            $pdo->prepare("UPDATE sms_otps SET attempts = :att WHERE id = :id")->execute([
                'att' => $newAttempts,
                'id' => $otp['id']
            ]);

            if ($newAttempts >= 5) {
                Database::sendJsonError('تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً پس از پایان زمان اعتبار، مجدداً درخواست دهید.', 429);
            }

            $remaining = 5 - $newAttempts;
            Database::sendJsonError("کد تأیید وارد شده اشتباه است. ({$remaining} تلاش باقی‌مانده)", 400);
        }

        // Clean up OTP on successful verification
        $pdo->prepare("DELETE FROM sms_otps WHERE phone = :phone")->execute(['phone' => $phone]);
    }
}

// Initialize Schema
Schema::initialize();

// --- TRANSACTIONAL SMS & NOTIFICATION ENGINE ---

class SmsEngine {
    // Set to 'smsir', 'kavenegar', or 'simulator'
    public const MODE = 'simulator';

    public static function send(string $phone, string $templateType, array $params = []): array {
        $message = self::renderMessage($templateType, $params);

        if (self::MODE === 'simulator') {
            return [
                'dispatched' => true,
                'channel' => 'console_simulator',
                'phone' => $phone,
                'message' => $message,
                'params' => $params
            ];
        }

        // When Enamad / SMS provider is connected, call outbound cURL here.
        return ['dispatched' => false, 'channel' => 'unsupported'];
    }

    private static function renderMessage(string $type, array $p): string {
        return match($type) {
            'otp' => "کد تایید ورود به سامانه رستا:\n" . ($p['code'] ?? '-----'),
            'register_otp' => "کد فعال‌سازی ثبت‌نام در سامانه رستا:\n" . ($p['code'] ?? '-----'),
            'password_reset' => "کد بازیابی کلمه عبور در سامانه رستا:\n" . ($p['code'] ?? '-----'),
            'counselor_invite' => "مشاور گرامی، دعوت‌نامه همکاری در سامانه رستا:\nکد اختصاصی: " . ($p['invite_code'] ?? '') . "\nلینک: " . ($p['link'] ?? ''),
            default => "پیام سیستم رستا"
        };
    }
}

// Request Routing
$endpoint = trim($_GET['endpoint'] ?? '', '/');
if ($endpoint === '') {
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if (str_starts_with($uriPath, '/api/')) {
        $endpoint = trim(substr($uriPath, 5), '/');
    }
}

$segments = $endpoint !== '' ? explode('/', $endpoint) : [];
$resource = $segments[0] ?? '';
$action = $segments[1] ?? '';
$subAction = $segments[2] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

$body = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($resource) {
    case 'health':
        $pdo = Database::getConnection();
        Database::sendJsonResponse([
            'ok' => true,
            'service' => 'Rasta Engine',
            'timestamp' => time(),
            'sqlite' => [
                'journal_mode' => $pdo->query("PRAGMA journal_mode;")->fetchColumn(),
                'tables' => $pdo->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")->fetchAll(PDO::FETCH_COLUMN),
                'total_users' => (int)$pdo->query("SELECT COUNT(*) FROM users;")->fetchColumn(),
                'total_slots' => (int)$pdo->query("SELECT COUNT(*) FROM scenario_slots;")->fetchColumn()
            ]
        ]);
    case 'presence':
        if ($action === 'ping') {
            if ($method !== 'POST') {
                Database::sendJsonError('متد مجاز نمی‌باشد.', 405);
            }

            $clientId = trim((string)($body['clientId'] ?? ''));
            if ($clientId === '' || strlen($clientId) > 64) {
                $clientId = 'anon_' . bin2hex(random_bytes(4));
            }

            $pdo = Database::getConnection();
            $now = time();

            // 1. Atomic SQLite upsert
            $stmt = $pdo->prepare("
                INSERT INTO presence (client_id, last_seen)
                VALUES (:cid, :now)
                ON CONFLICT(client_id) DO UPDATE SET last_seen = :now
            ");
            $stmt->execute(['cid' => $clientId, 'now' => $now]);

            // 2. Purge clients inactive for over 20 seconds
            $cutoff = $now - 20;
            $pdo->prepare("DELETE FROM presence WHERE last_seen < :cutoff")->execute(['cutoff' => $cutoff]);

            // 3. Return active count
            $onlineCount = (int)$pdo->query("SELECT COUNT(*) FROM presence")->fetchColumn();
            Database::sendJsonResponse(['ok' => true, 'onlineCount' => max(1, $onlineCount)]);
        }

        // Fixes silent fallthrough for unhandled actions/methods
        Database::sendJsonError('نقطه پایانی یا متد نامعتبر است.', 404);
        break;

    // --- AUTHENTICATION & SMS OTP ---

    case 'auth':
        $pdo = Database::getConnection();

        // --- 1. CANDIDATE SIGN-UP ---
        if ($action === 'register' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $code = normalizeDigits(trim($body['code'] ?? ''));
            $password = trim($body['password'] ?? '');
            $fullName = trim($body['full_name'] ?? '');
            $stream = $body['stream'] ?? null;
            $gender = $body['gender'] ?? null;
            $academicYear = trim($body['academic_year'] ?? '04-05');
            $inviteCode = strtoupper(trim($body['invite_code'] ?? ''));

            // Check if this is a coworker invite first
            $cwStmt = $pdo->prepare("SELECT id, institute_id FROM counselor_invites WHERE token = :token AND expires_at > :now AND used_at IS NULL LIMIT 1");
            $cwStmt->execute(['token' => $inviteCode, 'now' => time()]);
            $cwInvite = $cwStmt->fetch();
            $isCoworker = (bool)$cwInvite;

            if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                Database::sendJsonError('شماره تلفن همراه نامعتبر است.');
            }
            if (empty($code)) {
                Database::sendJsonError('کد تأیید پیامکی الزامی است.');
            }

            $minPass = $isCoworker ? 8 : 6;
            if (strlen($password) < $minPass) {
                Database::sendJsonError("رمز عبور باید حداقل {$minPass} نویسه باشد.");
            }
            if (empty($fullName)) {
                Database::sendJsonError('نام و نام خانوادگی الزامی است.');
            }

            // Only require stream & gender for students
            if (!$isCoworker) {
                if (!in_array($stream, ['math', 'experimental', 'humanities'], true)) {
                    Database::sendJsonError('گروه آزمایشی معتبر نمی‌باشد.');
                }
                if (!in_array($gender, ['male', 'female'], true)) {
                    Database::sendJsonError('جنسیت داوطلب الزامی است.');
                }
            }

            Auth::verifyOtp($pdo, $phone, $code);

            // Ensure phone is unique
            $chk = $pdo->prepare("SELECT id FROM users WHERE phone = :phone");
            $chk->execute(['phone' => $phone]);
            if ($chk->fetch()) {
                Database::sendJsonError('این شماره تلفن قبلاً در سامانه ثبت شده است.');
            }

            $instituteId = null;
            $role = 'student_independent';

            // Check if invite code matches a 24-hour counselor invite (CW-XXXX)
            $coworkerToken = strtoupper($inviteCode);
            $cwStmt = $pdo->prepare("SELECT id, institute_id FROM counselor_invites WHERE token = :token AND expires_at > :now AND used_at IS NULL LIMIT 1");
            $cwStmt->execute(['token' => $coworkerToken, 'now' => time()]);
            $cwInvite = $cwStmt->fetch();

            if ($cwInvite) {
                $instituteId = (int)$cwInvite['institute_id'];
                $role = 'institute';
                $pdo->prepare("UPDATE counselor_invites SET used_at = :now WHERE id = :id")->execute(['now' => time(), 'id' => $cwInvite['id']]);
            } elseif (!empty($inviteCode)) {
                $instStmt = $pdo->prepare("SELECT id, accepts_new_students FROM institutes WHERE invite_code = :code LIMIT 1");
                $instStmt->execute(['code' => $inviteCode]);
                $inst = $instStmt->fetch();
                if (!$inst) {
                    Database::sendJsonError('کد پیوند آموزشگاه نامعتبر است.');
                }
                if ((int)($inst['accepts_new_students'] ?? 1) === 0) {
                    Database::sendJsonError('پذیرش داوطلب جدید توسط این آموزشگاه در حال حاضر غیرفعال است.', 403);
                }
                $instituteId = (int)$inst['id'];
                $role = 'student_affiliated';
            }

            // Atomic PDO SQLite Transaction
            $pdo->beginTransaction();
            try {
                $passwordHash = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("
                    INSERT INTO users (institute_id, phone, password_hash, full_name, role, stream, gender, academic_year)
                    VALUES (:institute_id, :phone, :password_hash, :full_name, :role, :stream, :gender, :academic_year)
                ");
                $stmt->execute([
                    'institute_id' => $instituteId,
                    'phone' => $phone,
                    'password_hash' => $passwordHash,
                    'full_name' => $fullName,
                    'role' => $role,
                    'stream' => $stream,
                    'gender' => $gender,
                    'academic_year' => $academicYear
                ]);

                $userId = (int)$pdo->lastInsertId();
                $token = Auth::createToken($userId);

                $pdo->commit();

                $redirectUrl = match ($role) {
                    'institute' => '/dashboard/institute/',
                    default => '/dashboard/student/'
                };

                Database::sendJsonResponse([
                    'ok' => true,
                    'token' => $token,
                    'user' => [
                        'id' => $userId,
                        'phone' => $phone,
                        'full_name' => $fullName,
                        'role' => $role,
                        'stream' => $stream,
                        'gender' => $gender,
                        'academic_year' => $academicYear,
                        'institute_id' => $instituteId
                    ],
                    'redirect' => $redirectUrl
                ], 201);
            } catch (Exception $e) {
                $pdo->rollBack();
                Database::sendJsonError('خطا در ثبت‌نام داوطلب: ' . $e->getMessage(), 500);
            }
        }

        // --- 2. COUNSELOR & INSTITUTE ATOMIC SIGN-UP ---
        if ($action === 'register-institute' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $code = normalizeDigits(trim($body['code'] ?? ''));
            $password = trim($body['password'] ?? '');
            $counselorName = trim($body['full_name'] ?? '');
            $instituteName = trim($body['institute_name'] ?? '');
            $contactPhone = normalizeDigits(trim($body['contact_phone'] ?? ''));
            $city = trim($body['city'] ?? 'تهران');
            if (empty($city)) {
                $city = 'تهران';
            }

            if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                Database::sendJsonError('شماره تلفن همراه مشاور نامعتبر است.');
            }
            if (empty($code)) {
                Database::sendJsonError('کد تأیید پیامکی الزامی است.');
            }
            if (strlen($password) < 8) {
                Database::sendJsonError('رمز عبور مشاور باید حداقل ۸ نویسه باشد.');
            }
            if (empty($counselorName)) {
                Database::sendJsonError('نام مشاور مسئول الزامی است.');
            }
            if (empty($instituteName)) {
                Database::sendJsonError('نام آموزشگاه یا مرکز مشاوره الزامی است.');
            }
            if (empty($contactPhone)) {
                Database::sendJsonError('تلفن تماس ثابت یا اداری آموزشگاه الزامی است.');
            }
            if (!preg_match('/^0[0-9]{9,10}$/', $contactPhone)) {
                Database::sendJsonError('شماره تلفن اداری نامعتبر است. لطفاً شماره را کامل و همراه با پیش‌شماره استان وارد نمایید (مثال: 02112345678).');
            }

            // Verify OTP with brute-force protection
            Auth::verifyOtp($pdo, $phone, $code);

            $chk = $pdo->prepare("SELECT id FROM users WHERE phone = :phone");
            $chk->execute(['phone' => $phone]);
            if ($chk->fetch()) {
                Database::sendJsonError('این شماره تلفن قبلاً در سامانه ثبت شده است.');
            }

            // Atomic PDO SQLite Transaction
            $pdo->beginTransaction();
            try {
                // Generate a unique 16-character code: RASTA-XXXX-XXXX-XXXX
                $inviteCode = 'RASTA-' . strtoupper(implode('-', str_split(bin2hex(random_bytes(6)), 4)));

                $instStmt = $pdo->prepare("
                    INSERT INTO institutes (name, invite_code, contact_phone, city) 
                    VALUES (:name, :code, :phone, :city)
                ");
                $instStmt->execute([
                    'name' => $instituteName,
                    'code' => $inviteCode,
                    'phone' => $contactPhone,
                    'city' => $city
                ]);
                $instituteId = (int)$pdo->lastInsertId();

                $pwdHash = password_hash($password, PASSWORD_BCRYPT);
                $userStmt = $pdo->prepare("
                    INSERT INTO users (institute_id, phone, password_hash, full_name, role, stream)
                    VALUES (:inst_id, :phone, :hash, :name, 'institute', NULL)
                ");
                $userStmt->execute([
                    'inst_id' => $instituteId,
                    'phone' => $phone,
                    'hash' => $pwdHash,
                    'name' => $counselorName
                ]);
                $userId = (int)$pdo->lastInsertId();

                $pdo->commit();

                $token = Auth::createToken($userId);
                Database::sendJsonResponse([
                    'ok' => true,
                    'token' => $token,
                    'user' => [
                        'id' => $userId,
                        'phone' => $phone,
                        'full_name' => $counselorName,
                        'role' => 'institute',
                        'institute_id' => $instituteId,
                        'institute_name' => $instituteName,
                        'invite_code' => $inviteCode,
                        'city' => $city
                    ],
                    'redirect' => '/dashboard/institute/'
                ], 201);
            } catch (Exception $e) {
                $pdo->rollBack();
                Database::sendJsonError('خطا در ثبت آموزشگاه: ' . $e->getMessage(), 500);
            }
        }

        // --- 3. LOGIN & REDIRECT DISPATCHER ---
        if ($action === 'login' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $password = trim($body['password'] ?? '');

            $stmt = $pdo->prepare("
                SELECT u.*, i.name as institute_name 
                FROM users u 
                LEFT JOIN institutes i ON i.id = u.institute_id 
                WHERE u.phone = :phone LIMIT 1
            ");
            $stmt->execute(['phone' => $phone]);
            $user = $stmt->fetch();

            if (!$user || !password_verify($password, $user['password_hash'])) {
                Database::sendJsonError('شماره همراه یا کلمه عبور نادرست است.', 401);
            }

            $redirectUrl = match ($user['role']) {
                'admin' => '/management/admin/',
                'institute' => '/dashboard/institute/',
                'student_affiliated', 'student_independent' => '/dashboard/student/',
                default => '/dashboard/student/'
            };

            $token = Auth::createToken((int)$user['id']);
            Database::sendJsonResponse([
                'ok' => true,
                'token' => $token,
                'redirect' => $redirectUrl,
                'user' => [
                    'id' => (int)$user['id'],
                    'phone' => $user['phone'],
                    'full_name' => $user['full_name'],
                    'role' => $user['role'],
                    'stream' => $user['stream'],
                    'gender' => $user['gender'],
                    'institute_id' => $user['institute_id'],
                    'institute_name' => $user['institute_name']
                ]
            ]);
        }

        if ($action === 'me' && $method === 'GET') {
            $user = Auth::requireAuth();
            Database::sendJsonResponse(['ok' => true, 'user' => $user]);
        }

        if ($action === 'logout' && $method === 'POST') {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
            if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
                $tokenHash = hash('sha256', $matches[1]);
                $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE token_hash = :hash");
                $stmt->execute(['hash' => $tokenHash]);
            }
            Database::sendJsonResponse(['ok' => true, 'message' => 'خروج با موفقیت انجام شد.']);
        }

        // SMS OTP Request (Used for Login & Registration)
        if ($action === 'otp-request' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $type = trim($body['type'] ?? 'otp'); // 'otp' or 'register_otp'

            if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                Database::sendJsonError('شماره تلفن همراه نامعتبر است.');
            }

            // Check existence based on flow
            $uCheck = $pdo->prepare("SELECT id FROM users WHERE phone = :phone LIMIT 1");
            $uCheck->execute(['phone' => $phone]);
            $userExists = (bool)$uCheck->fetch();

            if (in_array($type, ['otp', 'password_reset'], true) && !$userExists) {
                Database::sendJsonError('این شماره تلفن در سامانه ثبت نشده است. لطفاً ابتدا ثبت‌نام کنید.', 404);
            }

            if ($type === 'register_otp' && $userExists) {
                Database::sendJsonError('این شماره تلفن قبلاً ثبت شده است. لطفاً وارد شوید.', 400);
            }

            // Server-side cooldown: enforce 120-second interval per phone
            $cooldownStmt = $pdo->prepare("SELECT expires_at FROM sms_otps WHERE phone = :phone AND expires_at > :now ORDER BY id DESC LIMIT 1");
            $cooldownStmt->execute(['phone' => $phone, 'now' => time()]);
            $existingOtp = $cooldownStmt->fetch();

            if ($existingOtp) {
                $secondsLeft = (int)$existingOtp['expires_at'] - time();
                Database::sendJsonError("کد تأیید قبلاً ارسال شده است. لطفاً {$secondsLeft} ثانیه دیگر مجدداً تلاش نمایید.", 429);
            }

            $code = (string)random_int(10000, 99999);
            $codeHash = password_hash($code, PASSWORD_BCRYPT);
            $expiresAt = time() + 120; // 2 minutes

            $stmt = $pdo->prepare("INSERT INTO sms_otps (phone, code_hash, expires_at) VALUES (:phone, :hash, :exp)");
            $stmt->execute(['phone' => $phone, 'hash' => $codeHash, 'exp' => $expiresAt]);

            // Dispatch via engine
            $smsResult = SmsEngine::send($phone, $type, ['code' => $code]);

            Database::sendJsonResponse([
                'ok' => true,
                'message' => 'کد تأیید ارسال شد.',
                'dev_sms' => $smsResult, // Full simulated message payload
                'dev_code' => $code
            ]);
        }

        // SMS OTP Verify & Login
        if ($action === 'otp-verify' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $code = normalizeDigits(trim($body['code'] ?? ''));

            if (empty($code)) {
                Database::sendJsonError('کد تأیید الزامی است.', 400);
            }

            Auth::verifyOtp($pdo, $phone, $code);

            // Locate or return user state
            $uStmt = $pdo->prepare("SELECT * FROM users WHERE phone = :phone LIMIT 1");
            $uStmt->execute(['phone' => $phone]);
            $user = $uStmt->fetch();

            if ($user) {
                $token = Auth::createToken((int)$user['id']);
                $redirectUrl = match ($user['role']) {
                    'admin' => '/management/admin/',
                    'institute' => '/dashboard/institute/',
                    'student_affiliated', 'student_independent' => '/dashboard/student/',
                    default => '/dashboard/student/'
                };
                Database::sendJsonResponse([
                    'ok' => true,
                    'registered' => true,
                    'token' => $token,
                    'redirect' => $redirectUrl,
                    'user' => [
                        'id' => (int)$user['id'],
                        'phone' => $user['phone'],
                        'full_name' => $user['full_name'],
                        'role' => $user['role'],
                        'stream' => $user['stream'],
                        'gender' => $user['gender'] ?? null,
                        'academic_year' => $user['academic_year'] ?? '04-05',
                        'institute_id' => $user['institute_id']
                    ]
                ]);
            } else {
                Database::sendJsonError('حساب کاربری با این شماره یافت نشد. لطفاً ابتدا ثبت‌نام کنید.', 404);
            }
        }

        // Password Reset via OTP
        if ($action === 'reset-password' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $code = normalizeDigits(trim($body['code'] ?? ''));
            $newPassword = trim($body['password'] ?? '');

            if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                Database::sendJsonError('شماره تلفن همراه نامعتبر است.');
            }
            if (empty($code)) {
                Database::sendJsonError('کد تأیید پیامکی الزامی است.');
            }
            $uStmt = $pdo->prepare("SELECT id, role FROM users WHERE phone = :phone LIMIT 1");
            $uStmt->execute(['phone' => $phone]);
            $user = $uStmt->fetch();

            if (!$user) {
                Database::sendJsonError('کاربری با این شماره تلفن یافت نشد.', 404);
            }

            $minLen = str_starts_with($user['role'], 'student') ? 6 : 8;
            if (strlen($newPassword) < $minLen) {
                Database::sendJsonError("کلمه عبور جدید باید حداقل {$minLen} نویسه باشد.");
            }

            Auth::verifyOtp($pdo, $phone, $code);

            $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
            $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id")->execute([
                'hash' => $newHash,
                'id' => $user['id']
            ]);

            // Issue session token and direct to dashboard
            $token = Auth::createToken((int)$user['id']);
            $redirectUrl = match ($user['role']) {
                'admin' => '/management/admin/',
                'institute' => '/dashboard/institute/',
                'student_affiliated', 'student_independent' => '/dashboard/student/',
                default => '/dashboard/student/'
            };

            Database::sendJsonResponse([
                'ok' => true,
                'token' => $token,
                'redirect' => $redirectUrl,
                'message' => 'کلمه عبور با موفقیت تغییر یافت.'
            ]);
        }

        // GET /api/auth/invite-info?token=CW-XXXX
        if ($action === 'invite-info' && $method === 'GET') {
            $token = strtoupper(trim($_GET['token'] ?? ''));
            if (empty($token)) {
                Database::sendJsonError('توکن دعوت الزامی است.', 400);
            }

            $stmt = $pdo->prepare("
                SELECT ci.id, ci.token, ci.expires_at, ci.used_at, i.name AS institute_name
                FROM counselor_invites ci
                JOIN institutes i ON i.id = ci.institute_id
                WHERE ci.token = :token LIMIT 1
            ");
            $stmt->execute(['token' => $token]);
            $invite = $stmt->fetch();

            if (!$invite) {
                Database::sendJsonError('لینک دعوت معتبر نمی‌باشد یا یافت نشد.', 404);
            }
            if (!empty($invite['used_at'])) {
                Database::sendJsonError('این لینک دعوت قبلاً استفاده شده است.', 410);
            }
            if ((int)$invite['expires_at'] < time()) {
                Database::sendJsonError('مهلت ۲۴ ساعته این لینک دعوت به پایان رسیده است.', 410);
            }

            Database::sendJsonResponse([
                'ok' => true,
                'token' => $invite['token'],
                'institute_name' => $invite['institute_name']
            ]);
        }
        break;

    // --- USER PROFILE & ACCOUNT MANAGEMENT ---

    case 'user':
        $user = Auth::requireAuth();
        $pdo = Database::getConnection();

        // 1. PUT /api/user/profile -> Update personal & academic info
        if ($action === 'profile' && in_array($method, ['PUT', 'POST'], true)) {
            $fullName = trim($body['full_name'] ?? '');
            if (empty($fullName)) {
                Database::sendJsonError('نام و نام خانوادگی الزامی است.', 422);
            }

            if (in_array($user['role'], ['institute', 'admin'], true)) {
                $stmt = $pdo->prepare("UPDATE users SET full_name = :full_name WHERE id = :id");
                $stmt->execute(['full_name' => $fullName, 'id' => $user['id']]);
                Database::sendJsonResponse(['ok' => true, 'message' => 'مشخصات شما با موفقیت بروزرسانی شد.']);
            }

            $stream = $body['stream'] ?? null;
            $gender = $body['gender'] ?? null;
            $academicYear = trim($body['academic_year'] ?? '1405');

            if (!in_array($stream, ['math', 'experimental', 'humanities'], true)) {
                Database::sendJsonError('گروه آزمایشی معتبر نمی‌باشد.', 422);
            }
            if (!in_array($gender, ['male', 'female'], true)) {
                Database::sendJsonError('انتخاب جنسیت الزامی است.', 422);
            }

            $stmt = $pdo->prepare("
                UPDATE users 
                SET full_name = :full_name, stream = :stream, gender = :gender, academic_year = :academic_year 
                WHERE id = :id
            ");
            $stmt->execute([
                'full_name' => $fullName,
                'stream' => $stream,
                'gender' => $gender,
                'academic_year' => $academicYear,
                'id' => $user['id']
            ]);

            Database::sendJsonResponse(['ok' => true, 'message' => 'مشخصات فردی با موفقیت بروزرسانی شد.']);
        }

        // 2. Phone Number Change Flow
        if ($action === 'phone') {
            // POST /api/user/phone/request-otp
            if ($subAction === 'request-otp' && $method === 'POST') {
                $newPhone = normalizeDigits(trim($body['new_phone'] ?? ''));

                if (!preg_match('/^09[0-9]{9}$/', $newPhone)) {
                    Database::sendJsonError('شماره تلفن همراه جدید نامعتبر است.', 422);
                }
                if ($newPhone === $user['phone']) {
                    Database::sendJsonError('شماره وارد شده با شماره فعلی شما یکسان است.', 422);
                }

                $chk = $pdo->prepare("SELECT id FROM users WHERE phone = :p AND id != :id");
                $chk->execute(['p' => $newPhone, 'id' => $user['id']]);
                if ($chk->fetch()) {
                    Database::sendJsonError('این شماره تلفن قبلاً به نام کاربر دیگری در سامانه ثبت شده است.', 409);
                }

                $code = (string)random_int(10000, 99999);
                $codeHash = password_hash($code, PASSWORD_BCRYPT);
                $expiresAt = time() + 120;

                $pdo->prepare("DELETE FROM sms_otps WHERE phone = :phone")->execute(['phone' => $newPhone]);
                $stmt = $pdo->prepare("INSERT INTO sms_otps (phone, code_hash, expires_at) VALUES (:phone, :hash, :exp)");
                $stmt->execute(['phone' => $newPhone, 'hash' => $codeHash, 'exp' => $expiresAt]);

                $smsResult = SmsEngine::send($newPhone, 'otp', ['code' => $code]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'message' => 'کد تأیید به شماره جدید ارسال شد.',
                    'dev_code' => $code,
                    'dev_sms' => $smsResult
                ]);
            }

            // POST /api/user/phone/verify
            if ($subAction === 'verify' && $method === 'POST') {
                $newPhone = normalizeDigits(trim($body['new_phone'] ?? ''));
                $code = normalizeDigits(trim($body['code'] ?? ''));

                if (!preg_match('/^09[0-9]{9}$/', $newPhone)) {
                    Database::sendJsonError('شماره تلفن نامعتبر است.', 422);
                }
                if (empty($code)) {
                    Database::sendJsonError('کد تأیید پیامکی الزامی است.', 422);
                }

                Auth::verifyOtp($pdo, $newPhone, $code);

                $pdo->prepare("UPDATE users SET phone = :phone WHERE id = :id")->execute([
                    'phone' => $newPhone,
                    'id' => $user['id']
                ]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'message' => 'شماره تلفن همراه شما با موفقیت تغییر یافت.',
                    'phone' => $newPhone
                ]);
            }
        }

        // 3. Institute Affiliation Flow
        if ($action === 'institute') {
            // POST /api/user/institute/attach
            if ($subAction === 'attach' && $method === 'POST') {
                $inviteCode = strtoupper(trim($body['invite_code'] ?? ''));
                if (empty($inviteCode)) {
                    Database::sendJsonError('کد دعوت آموزشگاه الزامی است.', 422);
                }

                $instStmt = $pdo->prepare("SELECT id, name, accepts_new_students FROM institutes WHERE UPPER(invite_code) = :code LIMIT 1");
                $instStmt->execute(['code' => $inviteCode]);
                $inst = $instStmt->fetch();

                if (!$inst) {
                    Database::sendJsonError('کد دعوت آموزشگاه یافت نشد.', 404);
                }
                if ((int)($inst['accepts_new_students'] ?? 1) === 0) {
                    Database::sendJsonError('پذیرش داوطلب جدید توسط این آموزشگاه موقتاً غیرفعال است.', 403);
                }

                $newRole = ($user['role'] === 'student_independent') ? 'student_affiliated' : $user['role'];
                $pdo->prepare("UPDATE users SET institute_id = :inst_id, role = :role WHERE id = :id")->execute([
                    'inst_id' => $inst['id'],
                    'role' => $newRole,
                    'id' => $user['id']
                ]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'message' => 'اتصال به آموزشگاه با موفقیت برقرار شد.',
                    'institute_name' => $inst['name']
                ]);
            }

            // POST /api/user/institute/detach
            if ($subAction === 'detach' && $method === 'POST') {
                $newRole = ($user['role'] === 'student_affiliated') ? 'student_independent' : $user['role'];
                $pdo->prepare("UPDATE users SET institute_id = NULL, role = :role WHERE id = :id")->execute([
                    'role' => $newRole,
                    'id' => $user['id']
                ]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'message' => 'ارتباط با آموزشگاه با موفقیت قطع گردید.'
                ]);
            }
        }

        // 4. Password Management
        if ($action === 'password') {
            // POST /api/user/password -> Change password with current password
            if ($subAction === '' && $method === 'POST') {
                $currentPass = trim($body['current_password'] ?? '');
                $newPass = trim($body['new_password'] ?? '');

                $minLen = str_starts_with($user['role'], 'student') ? 6 : 8;
                if (strlen($newPass) < $minLen) {
                    Database::sendJsonError("کلمه عبور جدید باید حداقل {$minLen} نویسه باشد.", 422);
                }

                $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = :id LIMIT 1");
                $stmt->execute(['id' => $user['id']]);
                $currentHash = $stmt->fetchColumn();

                if (!$currentHash || !password_verify($currentPass, $currentHash)) {
                    Database::sendJsonError('کلمه عبور فعلی نادرست است.', 400);
                }

                $newHash = password_hash($newPass, PASSWORD_BCRYPT);
                $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id")->execute([
                    'hash' => $newHash,
                    'id' => $user['id']
                ]);

                Database::sendJsonResponse(['ok' => true, 'message' => 'کلمه عبور با موفقیت به‌روزرسانی شد.']);
            }

            // POST /api/user/password/reset-otp-request
            if ($subAction === 'reset-otp-request' && $method === 'POST') {
                $code = (string)random_int(10000, 99999);
                $codeHash = password_hash($code, PASSWORD_BCRYPT);
                $expiresAt = time() + 120;

                $pdo->prepare("DELETE FROM sms_otps WHERE phone = :phone")->execute(['phone' => $user['phone']]);
                $stmt = $pdo->prepare("INSERT INTO sms_otps (phone, code_hash, expires_at) VALUES (:phone, :hash, :exp)");
                $stmt->execute(['phone' => $user['phone'], 'hash' => $codeHash, 'exp' => $expiresAt]);

                $smsResult = SmsEngine::send($user['phone'], 'password_reset', ['code' => $code]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'message' => 'کد تایید بازنشانی پیامک شد.',
                    'dev_code' => $code,
                    'dev_sms' => $smsResult
                ]);
            }

            // POST /api/user/password/reset-otp-verify
            if ($subAction === 'reset-otp-verify' && $method === 'POST') {
                $code = normalizeDigits(trim($body['code'] ?? ''));
                $newPass = trim($body['new_password'] ?? '');

                $minLen = str_starts_with($user['role'], 'student') ? 6 : 8;
                if (strlen($newPass) < $minLen) {
                    Database::sendJsonError("کلمه عبور جدید باید حداقل {$minLen} نویسه باشد.", 422);
                }

                Auth::verifyOtp($pdo, $user['phone'], $code);

                $newHash = password_hash($newPass, PASSWORD_BCRYPT);
                $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id")->execute([
                    'hash' => $newHash,
                    'id' => $user['id']
                ]);

                Database::sendJsonResponse(['ok' => true, 'message' => 'کلمه عبور جدید با موفقیت ثبت شد.']);
            }
        }

        Database::sendJsonError('نقطه پایانی کاربر نامعتبر است.', 404);
        break;

    // --- INSTITUTE COHORT & COUNSELOR MANAGEMENT ---

    case 'institute':
        $user = Auth::requireRole('institute', 'admin');
        $pdo = Database::getConnection();
        $instituteId = (int)$user['institute_id'];
        if ($user['role'] === 'admin' && isset($_GET['institute_id'])) {
            $instituteId = (int)$_GET['institute_id'];
        }

        if ($instituteId <= 0) {
            Database::sendJsonError('حساب کاربری شما به هیچ آموزشگاهی متصل نیست.', 400);
        }

        // 1. GET /api/institute/details
        if ($action === 'details' && $method === 'GET') {
            $stmt = $pdo->prepare("SELECT id, name, invite_code, contact_phone, city, accepts_new_students, created_at FROM institutes WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $instituteId]);
            $inst = $stmt->fetch();
            if (!$inst) {
                Database::sendJsonError('آموزشگاه یافت نشد.', 404);
            }
            Database::sendJsonResponse(['ok' => true, 'institute' => $inst]);
        }

        // 2. PUT /api/institute/details
        if ($action === 'details' && in_array($method, ['PUT', 'POST'], true)) {
            $name = trim($body['name'] ?? '');
            $contactPhone = trim($body['contact_phone'] ?? '');
            $city = trim($body['city'] ?? '');
            $accepts = array_key_exists('accepts_new_students', $body) ? (int)$body['accepts_new_students'] : null;

            $fields = [];
            $params = ['id' => $instituteId];

            if ($name !== '') {
                $fields[] = 'name = :name';
                $params['name'] = $name;
            }
            if ($contactPhone !== '') {
                $fields[] = 'contact_phone = :phone';
                $params['phone'] = $contactPhone;
            }
            if ($city !== '') {
                $fields[] = 'city = :city';
                $params['city'] = $city;
            }
            if ($accepts !== null) {
                $fields[] = 'accepts_new_students = :accepts';
                $params['accepts'] = $accepts ? 1 : 0;
            }

            if (!empty($fields)) {
                $sql = "UPDATE institutes SET " . implode(', ', $fields) . " WHERE id = :id";
                $pdo->prepare($sql)->execute($params);
            }

            Database::sendJsonResponse(['ok' => true, 'message' => 'مشخصات آموزشگاه با موفقیت بروزرسانی شد.']);
        }

        // 3. POST /api/institute/regenerate-code
        if ($action === 'regenerate-code' && $method === 'POST') {
            $newCode = 'RASTA-' . strtoupper(implode('-', str_split(bin2hex(random_bytes(6)), 4)));
            $stmt = $pdo->prepare("UPDATE institutes SET invite_code = :code WHERE id = :id");
            $stmt->execute(['code' => $newCode, 'id' => $instituteId]);

            Database::sendJsonResponse([
                'ok' => true,
                'message' => 'کد معرف آموزشگاه با موفقیت تغییر یافت.',
                'invite_code' => $newCode
            ]);
        }

        // 4. GET /api/institute/students
        if ($action === 'students' && $method === 'GET') {
            $year = $_GET['academic_year'] ?? null;
            $sql = "
                SELECT u.id, u.full_name, u.phone, u.stream, u.gender, u.academic_year, u.created_at,
                       (SELECT COUNT(*) FROM scenario_slots WHERE user_id = u.id) as slot_count
                FROM users u
                WHERE u.institute_id = :inst AND u.role LIKE 'student%'
            ";
            $params = ['inst' => $instituteId];
            if ($year && $year !== 'all') {
                $sql .= " AND u.academic_year = :year";
                $params['year'] = $year;
            }
            $sql .= " ORDER BY u.id DESC";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            Database::sendJsonResponse(['ok' => true, 'students' => $stmt->fetchAll()]);
        }

        // 5. DELETE /api/institute/students/{id} -> Detach student
        if ($action === 'students' && is_numeric($subAction) && $method === 'DELETE') {
            $targetStudentId = (int)$subAction;
            $delStmt = $pdo->prepare("
                UPDATE users 
                SET institute_id = NULL, role = 'student_independent' 
                WHERE id = :id AND institute_id = :inst
            ");
            $delStmt->execute(['id' => $targetStudentId, 'inst' => $instituteId]);

            if ($delStmt->rowCount() === 0) {
                Database::sendJsonError('داوطلب مورد نظر در این آموزشگاه یافت نشد.', 404);
            }

            Database::sendJsonResponse(['ok' => true, 'message' => 'داوطلب با موفقیت از آموزشگاه حذف گردید.']);
        }

        // 6. GET /api/institute/coworkers
        if ($action === 'coworkers' && $method === 'GET') {
            $stmt = $pdo->prepare("
                SELECT id, full_name, phone, role, created_at
                FROM users
                WHERE institute_id = :inst AND role = 'institute'
                ORDER BY id
            ");
            $stmt->execute(['inst' => $instituteId]);
            $coworkers = $stmt->fetchAll();
            Database::sendJsonResponse(['ok' => true, 'coworkers' => $coworkers]);
        }

        // 7. DELETE /api/institute/coworkers/{id}
        if ($action === 'coworkers' && is_numeric($subAction) && $method === 'DELETE') {
            $targetCoworkerId = (int)$subAction;
            if ($targetCoworkerId === (int)$user['id']) {
                Database::sendJsonError('امکان حذف حساب کاربری جاری خودتان وجود ندارد.', 400);
            }

            $stmt = $pdo->prepare("UPDATE users SET institute_id = NULL WHERE id = :id AND institute_id = :inst AND role = 'institute'");
            $stmt->execute(['id' => $targetCoworkerId, 'inst' => $instituteId]);

            if ($stmt->rowCount() === 0) {
                Database::sendJsonError('مشاور مورد نظر یافت نشد.', 404);
            }

            Database::sendJsonResponse(['ok' => true, 'message' => 'مشاور با موفقیت از کادر آموزشگاه حذف شد.']);
        }

        // 8. POST /api/institute/coworkers/invite-link (24-Hour Link)
        if ($action === 'coworkers' && $subAction === 'invite-link' && $method === 'POST') {
            $token = 'CW-' . strtoupper(bin2hex(random_bytes(4)));
            $expiresAt = time() + 86400; // 24 Hours

            $stmt = $pdo->prepare("INSERT INTO counselor_invites (institute_id, token, expires_at) VALUES (:inst, :token, :exp)");
            $stmt->execute(['inst' => $instituteId, 'token' => $token, 'exp' => $expiresAt]);

            $host = $_SERVER['HTTP_HOST'] ?? 'rasta-app.ir';
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $inviteUrl = "{$protocol}://{$host}/?counselor_invite={$token}";

            Database::sendJsonResponse([
                'ok' => true,
                'token' => $token,
                'invite_url' => $inviteUrl,
                'expires_at' => $expiresAt,
                'message' => 'لینک دعوت ۲۴ ساعته با موفقیت تولید شد.'
            ]);
        }

        // 9. POST /api/institute/coworkers/invite-sms
        if ($action === 'coworkers' && $subAction === 'invite-sms' && $method === 'POST') {
            $phone = normalizeDigits(trim($body['phone'] ?? ''));
            $name = trim($body['full_name'] ?? 'همکار گرامی');

            if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                Database::sendJsonError('شماره همراه نامعتبر است.', 422);
            }

            $token = 'CW-' . strtoupper(bin2hex(random_bytes(4)));
            $expiresAt = time() + 86400;

            $stmt = $pdo->prepare("INSERT INTO counselor_invites (institute_id, token, phone, expires_at) VALUES (:inst, :token, :phone, :exp)");
            $stmt->execute(['inst' => $instituteId, 'token' => $token, 'phone' => $phone, 'exp' => $expiresAt]);

            $host = $_SERVER['HTTP_HOST'] ?? 'rasta-app.ir';
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $inviteUrl = "{$protocol}://{$host}/?counselor_invite={$token}";

            $smsResult = SmsEngine::send($phone, 'counselor_invite', [
                'invite_code' => $token,
                'link' => $inviteUrl
            ]);

            Database::sendJsonResponse([
                'ok' => true,
                'message' => 'دعوت‌نامه با موفقیت پیامک شد.',
                'dev_sms' => $smsResult,
                'token' => $token
            ]);
        }

        break;

    // --- COLLABORATIVE 20-SLOT MANAGEMENT ---

    case 'slots':
        $user = Auth::requireAuth();
        $pdo = Database::getConnection();
        $targetUserId = Auth::resolveTargetStudentId($user, $pdo);

        // 1. GET /api/slots -> List slots (1 to 20)
        if ($action === '' && $method === 'GET') {
            $stmt = $pdo->prepare("
                SELECT id, slot_index, title, stream, preferences_json, custom_ordering_json, version, active_editor_id, locked_until, updated_at
                FROM scenario_slots
                WHERE user_id = :user_id
                ORDER BY slot_index
            ");
            $stmt->execute(['user_id' => $targetUserId]);
            $slots = $stmt->fetchAll();
            Database::sendJsonResponse(['ok' => true, 'slots' => $slots]);
        }

        // 1.5 POST /api/slots -> Create and dump wizard scenario into next available slot
        if ($action === '' && $method === 'POST') {
            $usedSlotsStmt = $pdo->prepare("SELECT slot_index FROM scenario_slots WHERE user_id = :user_id");
            $usedSlotsStmt->execute(['user_id' => $targetUserId]);
            $used = $usedSlotsStmt->fetchAll(PDO::FETCH_COLUMN);

            $availableIndex = null;
            for ($i = 1; $i <= 20; $i++) {
                if (!in_array($i, $used)) {
                    $availableIndex = $i;
                    break;
                }
            }

            if ($availableIndex === null) {
                Database::sendJsonError('سقف مجاز ۲۰ چینش تکمیل است.', 400);
            }

            $targetStudentStmt = $pdo->prepare("SELECT stream FROM users WHERE id = :id LIMIT 1");
            $targetStudentStmt->execute(['id' => $targetUserId]);
            $studentDefaultStream = $targetStudentStmt->fetchColumn() ?: 'math';

            $title = trim($body['title'] ?? '') ?: "چینش {$availableIndex}";
            $stream = $body['preferences']['stream'] ?? $body['stream'] ?? $studentDefaultStream;

            if (!in_array($stream, ['math', 'experimental', 'humanities'], true)) {
                $stream = 'math';
            }

            $preferencesJson = isset($body['preferences'])
                ? json_encode($body['preferences'], JSON_UNESCAPED_UNICODE)
                : '{}';
            $customOrderingJson = isset($body['custom_ordering'])
                ? json_encode($body['custom_ordering'], JSON_UNESCAPED_UNICODE)
                : '[]';

            $insStmt = $pdo->prepare("
                INSERT INTO scenario_slots (user_id, slot_index, title, stream, preferences_json, custom_ordering_json, version)
                VALUES (:user_id, :slot_index, :title, :stream, :pref, :ordering, 1)
            ");
            $insStmt->execute([
                'user_id' => $targetUserId,
                'slot_index' => $availableIndex,
                'title' => $title,
                'stream' => $stream,
                'pref' => $preferencesJson,
                'ordering' => $customOrderingJson
            ]);

            Database::sendJsonResponse([
                'ok' => true,
                'message' => 'چینش با موفقیت ذخیره شد.',
                'slot' => [
                    'id' => (int)$pdo->lastInsertId(),
                    'slot_index' => $availableIndex,
                    'title' => $title,
                    'stream' => $stream,
                    'version' => 1
                ]
            ], 201);
        }

        // 2. GET /api/slots/{index} -> Load slot & target student metadata
        if (is_numeric($action) && $subAction === '' && $method === 'GET') {
            $slotIndex = (int)$action;

            $uStmt = $pdo->prepare("SELECT id, full_name, stream, gender, role FROM users WHERE id = :id LIMIT 1");
            $uStmt->execute(['id' => $targetUserId]);
            $studentMeta = $uStmt->fetch();

            $stmt = $pdo->prepare("
                SELECT s.*, u.full_name as editor_name
                FROM scenario_slots s
                LEFT JOIN users u ON u.id = s.active_editor_id
                WHERE s.user_id = :user_id AND s.slot_index = :slot_index
                LIMIT 1
            ");
            $stmt->execute(['user_id' => $targetUserId, 'slot_index' => $slotIndex]);
            $slot = $stmt->fetch();

            if (!$slot) {
                Database::sendJsonResponse([
                    'ok' => true,
                    'exists' => false,
                    'slot' => null,
                    'student' => $studentMeta
                ]);
            }

            $isLocked = ((int)$slot['locked_until'] > time()) && ((int)$slot['active_editor_id'] !== (int)$user['id']);

            $decodedPref = json_decode($slot['preferences_json'], true);
            $slot['preferences'] = !empty($decodedPref) ? $decodedPref : new stdClass();
            $slot['custom_ordering'] = json_decode($slot['custom_ordering_json'], true) ?: [];
            unset($slot['preferences_json'], $slot['custom_ordering_json']);

            Database::sendJsonResponse([
                'ok' => true,
                'exists' => true,
                'slot' => $slot,
                'student' => $studentMeta,
                'is_locked' => $isLocked,
                'locked_by' => $isLocked ? $slot['editor_name'] : null
            ]);
        }

        // 3. PUT /api/slots/{index} -> Update slot with stream synchronization
        if (is_numeric($action) && $subAction === '' && $method === 'PUT') {
            $slotIndex = (int)$action;
            $title = $body['title'] ?? null;
            $preferences = isset($body['preferences']) ? json_encode($body['preferences'], JSON_UNESCAPED_UNICODE) : null;
            $customOrdering = isset($body['custom_ordering']) ? json_encode($body['custom_ordering'], JSON_UNESCAPED_UNICODE) : null;
            $clientVersion = (int)($body['version'] ?? 0);

            $stream = null;
            if (isset($body['preferences']['stream']) && in_array($body['preferences']['stream'], ['math', 'experimental', 'humanities'], true)) {
                $stream = $body['preferences']['stream'];
            } elseif (isset($body['stream']) && in_array($body['stream'], ['math', 'experimental', 'humanities'], true)) {
                $stream = $body['stream'];
            }

            $checkStmt = $pdo->prepare("SELECT id, version, locked_until, active_editor_id FROM scenario_slots WHERE user_id = :user_id AND slot_index = :slot_index");
            $checkStmt->execute(['user_id' => $targetUserId, 'slot_index' => $slotIndex]);
            $current = $checkStmt->fetch();

            // Auto-create row on first save from wizard builder
            if (!$current) {
                $targetStudentStmt = $pdo->prepare("SELECT stream FROM users WHERE id = :id LIMIT 1");
                $targetStudentStmt->execute(['id' => $targetUserId]);
                $studentDefaultStream = $targetStudentStmt->fetchColumn() ?: 'math';

                $finalStream = $stream ?? $studentDefaultStream;
                if (!in_array($finalStream, ['math', 'experimental', 'humanities'], true)) {
                    $finalStream = 'math';
                }

                $defaultTitle = $title ?: "چینش شماره {$slotIndex}";
                $insStmt = $pdo->prepare("
                    INSERT INTO scenario_slots (user_id, slot_index, title, stream, preferences_json, custom_ordering_json, version, active_editor_id, locked_until)
                    VALUES (:user_id, :slot_index, :title, :stream, :pref, :ordering, 1, :editor_id, :locked_until)
                ");
                $insStmt->execute([
                    'user_id' => $targetUserId,
                    'slot_index' => $slotIndex,
                    'title' => $defaultTitle,
                    'stream' => $finalStream,
                    'pref' => $preferences ?: '{}',
                    'ordering' => $customOrdering ?: '[]',
                    'editor_id' => $user['id'],
                    'locked_until' => time() + 30
                ]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'created' => true,
                    'version' => 1,
                    'updated_at' => date('Y-m-d H:i:s')
                ], 201);
            }

            // Mutex Lock Check: Prevent overwriting another active user's session
            $isLocked = ((int)$current['locked_until'] > time()) && ((int)$current['active_editor_id'] !== (int)$user['id']);
            if ($isLocked) {
                $editorStmt = $pdo->prepare("SELECT full_name FROM users WHERE id = :id LIMIT 1");
                $editorStmt->execute(['id' => $current['active_editor_id']]);
                $editorName = $editorStmt->fetchColumn() ?: 'کاربر دیگری';

                Database::sendJsonError("این چینش در حال حاضر توسط «{$editorName}» در حال ویرایش است و موقتاً قفل می‌باشد.", 423, [
                    'locked_by' => $editorName,
                    'locked_until' => (int)$current['locked_until']
                ]);
            }

            if ($clientVersion > 0 && (int)$current['version'] !== $clientVersion) {
                Database::sendJsonError('این چینش همزمان توسط کاربر دیگری تغییر یافته است.', 409, [
                    'server_version' => (int)$current['version']
                ]);
            }

            $newVersion = (int)$current['version'] + 1;
            $lockExpiry = time() + 30;

            $updateStmt = $pdo->prepare("
                UPDATE scenario_slots
                SET title = COALESCE(:title, title),
                    stream = COALESCE(:stream, stream),
                    preferences_json = COALESCE(:pref, preferences_json),
                    custom_ordering_json = COALESCE(:ordering, custom_ordering_json),
                    version = :version,
                    active_editor_id = :editor_id,
                    locked_until = :locked_until,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :user_id AND slot_index = :slot_index
            ");
            $updateStmt->execute([
                'title' => $title,
                'stream' => $stream,
                'pref' => $preferences,
                'ordering' => $customOrdering,
                'version' => $newVersion,
                'editor_id' => $user['id'],
                'locked_until' => $lockExpiry,
                'user_id' => $targetUserId,
                'slot_index' => $slotIndex
            ]);

            Database::sendJsonResponse([
                'ok' => true,
                'version' => $newVersion,
                'updated_at' => gmdate('Y-m-d H:i:s')
            ]);
        }

        // 4. DELETE /api/slots/{index} -> Delete slot
        if (is_numeric($action) && $subAction === '' && $method === 'DELETE') {
            $slotIndex = (int)$action;

            $delStmt = $pdo->prepare("DELETE FROM scenario_slots WHERE user_id = :user_id AND slot_index = :slot_index");
            $delStmt->execute(['user_id' => $targetUserId, 'slot_index' => $slotIndex]);

            if ($delStmt->rowCount() === 0) {
                Database::sendJsonError('چینش مورد نظر جهت حذف یافت نشد.', 404);
            }

            Database::sendJsonResponse(['ok' => true, 'message' => 'چینش با موفقیت حذف گردید.']);
        }

        // 5. POST /api/slots/{index}/clone -> Duplicate slot
        if (is_numeric($action) && $subAction === 'clone' && $method === 'POST') {
            $sourceIndex = (int)$action;

            $usedSlotsStmt = $pdo->prepare("SELECT slot_index FROM scenario_slots WHERE user_id = :user_id");
            $usedSlotsStmt->execute(['user_id' => $targetUserId]);
            $used = $usedSlotsStmt->fetchAll(PDO::FETCH_COLUMN);

            $availableIndex = null;
            for ($i = 1; $i <= 20; $i++) {
                if (!in_array($i, $used)) {
                    $availableIndex = $i;
                    break;
                }
            }

            if ($availableIndex === null) {
                Database::sendJsonError('سقف مجاز ۲۰ چینش تکمیل است.', 400);
            }

            $sourceStmt = $pdo->prepare("SELECT * FROM scenario_slots WHERE user_id = :user_id AND slot_index = :slot_index");
            $sourceStmt->execute(['user_id' => $targetUserId, 'slot_index' => $sourceIndex]);
            $source = $sourceStmt->fetch();

            if (!$source) {
                Database::sendJsonError('چینش مبدا یافت نشد.', 404);
            }

            $newTitle = 'رونوشت از ' . $source['title'];
            $cloneStmt = $pdo->prepare("
                INSERT INTO scenario_slots (user_id, slot_index, title, stream, preferences_json, custom_ordering_json, version)
                VALUES (:user_id, :slot_index, :title, :stream, :pref, :ordering, 1)
            ");
            $cloneStmt->execute([
                'user_id' => $targetUserId,
                'slot_index' => $availableIndex,
                'title' => $newTitle,
                'stream' => $source['stream'],
                'pref' => $source['preferences_json'],
                'ordering' => $source['custom_ordering_json']
            ]);

            Database::sendJsonResponse([
                'ok' => true,
                'message' => 'چینش با موفقیت تکثیر شد.',
                'new_slot_index' => $availableIndex,
                'title' => $newTitle
            ], 201);
        }

        // 6. GET /api/slots/{index}/poll -> Concurrency Polling with Heartbeat Lock Extension
        if (is_numeric($action) && $subAction === 'poll' && $method === 'GET') {
            $slotIndex = (int)$action;
            $clientVersion = (int)($_GET['version'] ?? 0);

            $stmt = $pdo->prepare("
                SELECT s.id, s.version, s.active_editor_id, s.locked_until, s.updated_at, u.full_name as editor_name
                FROM scenario_slots s
                LEFT JOIN users u ON u.id = s.active_editor_id
                WHERE s.user_id = :user_id AND s.slot_index = :slot_index
                LIMIT 1
            ");
            $stmt->execute(['user_id' => $targetUserId, 'slot_index' => $slotIndex]);
            $slot = $stmt->fetch();

            if (!$slot) {
                Database::sendJsonResponse([
                    'ok' => true,
                    'exists' => false,
                    'modified' => false,
                    'version' => 0,
                    'is_locked' => false,
                    'locked_by' => null
                ]);
            }

            // Extend lock heartbeat if current client is active editor
            if ((int)$slot['active_editor_id'] === (int)$user['id']) {
                $renewedLock = time() + 30;
                $pdo->prepare("UPDATE scenario_slots SET locked_until = :exp WHERE id = :id")->execute([
                    'exp' => $renewedLock,
                    'id' => $slot['id']
                ]);
                $slot['locked_until'] = $renewedLock;
            }

            $serverVersion = (int)$slot['version'];
            $isLocked = ((int)$slot['locked_until'] > time()) && ((int)$slot['active_editor_id'] !== (int)$user['id']);

            if ($serverVersion === $clientVersion) {
                Database::sendJsonResponse([
                    'ok' => true,
                    'exists' => true,
                    'modified' => false,
                    'version' => $serverVersion,
                    'is_locked' => $isLocked,
                    'locked_by' => $isLocked ? $slot['editor_name'] : null
                ]);
            }

            $fullStmt = $pdo->prepare("SELECT title, stream, preferences_json, custom_ordering_json FROM scenario_slots WHERE id = :id");
            $fullStmt->execute(['id' => $slot['id']]);
            $full = $fullStmt->fetch();

            $decodedPollPref = json_decode($full['preferences_json'], true);

            Database::sendJsonResponse([
                'ok' => true,
                'exists' => true,
                'modified' => true,
                'version' => $serverVersion,
                'is_locked' => $isLocked,
                'locked_by' => $isLocked ? $slot['editor_name'] : null,
                'title' => $full['title'],
                'stream' => $full['stream'],
                'preferences' => !empty($decodedPollPref) ? $decodedPollPref : new stdClass(),
                'custom_ordering' => json_decode($full['custom_ordering_json'], true) ?: []
            ]);
        }

        // 7. POST /api/slots/{index}/release-lock -> Explicit Lock Release on Unload
        if (is_numeric($action) && $subAction === 'release-lock' && $method === 'POST') {
            $slotIndex = (int)$action;

            $stmt = $pdo->prepare("
                UPDATE scenario_slots
                SET active_editor_id = NULL, locked_until = 0
                WHERE user_id = :user_id AND slot_index = :slot_index AND active_editor_id = :editor_id
            ");
            $stmt->execute([
                'user_id' => $targetUserId,
                'slot_index' => $slotIndex,
                'editor_id' => $user['id']
            ]);

            Database::sendJsonResponse(['ok' => true, 'message' => 'قفل ویرایش آزاد شد.']);
        }
        break;

    // --- ADMIN MANAGEMENT LAYER ---

    case 'admin':
        $pdo = Database::getConnection();

        // 1. One-time Bootstrap
        if ($action === 'bootstrap') {
            $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();

            if ($method === 'GET') {
                Database::sendJsonResponse([
                    'ok' => true,
                    'needs_bootstrap' => ($adminCount === 0)
                ]);
            }

            if ($method === 'POST') {
                if ($adminCount > 0) {
                    Database::sendJsonError('سامانه قبلاً راه‌اندازی شده است.', 403);
                }

                $phone = normalizeDigits(trim($body['phone'] ?? ''));
                $password = trim($body['password'] ?? '');
                $fullName = trim($body['full_name'] ?? 'مدیر ارشد سامانه');

                if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                    Database::sendJsonError('شماره تلفن معتبر نیست.');
                }
                if (strlen($password) < 8) {
                    Database::sendJsonError('رمز عبور مدیر ارشد باید حداقل ۸ نویسه باشد.');
                }

                $hash = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("INSERT INTO users (phone, password_hash, full_name, role) VALUES (:phone, :hash, :name, 'admin')");
                $stmt->execute(['phone' => $phone, 'hash' => $hash, 'name' => $fullName]);
                $adminId = (int)$pdo->lastInsertId();

                $token = Auth::createToken($adminId);
                Database::sendJsonResponse([
                    'ok' => true,
                    'message' => 'مدیر ارشد سامانه ایجاد شد.',
                    'token' => $token,
                    'user' => ['id' => $adminId, 'phone' => $phone, 'full_name' => $fullName, 'role' => 'admin']
                ], 201);
            }
        }

        $adminUser = Auth::requireRole('admin');

        // 2. GET /api/admin/stats
        if ($action === 'stats' && $method === 'GET') {
            $stats = [
                'users_count' => (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
                'students_count' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role LIKE 'student%'")->fetchColumn(),
                'institutes_count' => (int)$pdo->query("SELECT COUNT(*) FROM institutes")->fetchColumn(),
                'slots_count' => (int)$pdo->query("SELECT COUNT(*) FROM scenario_slots")->fetchColumn(),
                'by_stream' => [
                    'math' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE stream = 'math'")->fetchColumn(),
                    'experimental' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE stream = 'experimental'")->fetchColumn(),
                    'humanities' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE stream = 'humanities'")->fetchColumn(),
                ]
            ];
            Database::sendJsonResponse(['ok' => true, 'stats' => $stats]);
        }

        // 3. User Management: /api/admin/users
        if ($action === 'users') {
            $targetUserId = is_numeric($subAction) ? (int)$subAction : null;

            if ($method === 'GET' && !$targetUserId) {
                $roleFilter = $_GET['role'] ?? '';
                $sql = "
                    SELECT u.id, u.full_name, u.phone, u.role, u.stream, u.gender, u.academic_year, 
                           u.institute_id, u.created_at, i.name as institute_name,
                           (SELECT COUNT(*) FROM scenario_slots WHERE user_id = u.id) as slot_count
                    FROM users u
                    LEFT JOIN institutes i ON i.id = u.institute_id
                ";
                $params = [];
                if (!empty($roleFilter)) {
                    $sql .= " WHERE u.role = :role";
                    $params['role'] = $roleFilter;
                }
                $sql .= " ORDER BY u.id DESC";

                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                Database::sendJsonResponse(['ok' => true, 'users' => $stmt->fetchAll()]);
            }

            if ($method === 'POST') {
                $phone = normalizeDigits(trim($body['phone'] ?? ''));
                $password = trim($body['password'] ?? '');
                $fullName = trim($body['full_name'] ?? '');
                $role = $body['role'] ?? 'student_independent';
                $gender = !empty($body['gender']) ? $body['gender'] : null;
                $stream = !empty($body['stream']) ? $body['stream'] : null;
                $academicYear = trim($body['academic_year'] ?? '04-05');
                $instituteId = !empty($body['institute_id']) ? (int)$body['institute_id'] : null;

                if (!preg_match('/^09[0-9]{9}$/', $phone)) {
                    Database::sendJsonError('شماره تلفن معتبر نیست. (مثال: 09123456789)');
                }
                if (strlen($password) < 6) {
                    Database::sendJsonError('رمز عبور باید حداقل ۶ نویسه باشد.');
                }
                if (empty($fullName)) {
                    Database::sendJsonError('نام و نام خانوادگی الزامی است.');
                }

                if (str_starts_with($role, 'student')) {
                    if (!in_array($gender, ['male', 'female'], true)) {
                        Database::sendJsonError('انتخاب جنسیت برای داوطلب الزامی است.');
                    }
                    if (!in_array($stream, ['math', 'experimental', 'humanities'], true)) {
                        Database::sendJsonError('انتخاب گروه آزمایشی برای داوطلب الزامی است.');
                    }
                } else {
                    $stream = null;
                }

                $chk = $pdo->prepare("SELECT id FROM users WHERE phone = :p");
                $chk->execute(['p' => $phone]);
                if ($chk->fetch()) {
                    Database::sendJsonError('این شماره تلفن قبلاً در سامانه ثبت شده است.');
                }

                $hash = password_hash($password, PASSWORD_BCRYPT);
                $stmt = $pdo->prepare("
                    INSERT INTO users (institute_id, phone, password_hash, full_name, role, stream, gender, academic_year)
                    VALUES (:institute_id, :phone, :password_hash, :full_name, :role, :stream, :gender, :academic_year)
                ");
                $stmt->execute([
                    'institute_id' => ($role === 'student_affiliated') ? $instituteId : null,
                    'phone' => $phone,
                    'password_hash' => $hash,
                    'full_name' => $fullName,
                    'role' => $role,
                    'stream' => $stream,
                    'gender' => $gender,
                    'academic_year' => $academicYear
                ]);
                $newId = (int)$pdo->lastInsertId();
                Database::sendJsonResponse(['ok' => true, 'id' => $newId, 'message' => 'کاربر با موفقیت ایجاد شد.'], 201);
            }

            if ($method === 'PUT' && $targetUserId) {
                // 1. Fetch target user's current role
                $targetUserStmt = $pdo->prepare("SELECT role FROM users WHERE id = :id LIMIT 1");
                $targetUserStmt->execute(['id' => $targetUserId]);
                $targetCurrentRole = $targetUserStmt->fetchColumn();

                if (!$targetCurrentRole) {
                    Database::sendJsonError('کاربر مورد نظر یافت نشد.', 404);
                }

                $requestedRole = $body['role'] ?? null;

                // 2. Prevent self-demotion
                if ($targetUserId === (int)$adminUser['id'] && $requestedRole !== null && $requestedRole !== 'admin') {
                    Database::sendJsonError('شما نمی‌توانید نقش حساب مدیریتی جاری خود را تنزل دهید.', 400);
                }

                // 3. Prevent demoting the last remaining admin
                if ($targetCurrentRole === 'admin' && $requestedRole !== null && $requestedRole !== 'admin') {
                    $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
                    if ($adminCount <= 1) {
                        Database::sendJsonError('امکان تغییر نقش آخرین مدیر ارشد سامانه وجود ندارد.', 400);
                    }
                }

                $fullName = trim($body['full_name'] ?? '');
                $role = $body['role'] ?? null;
                $gender = array_key_exists('gender', $body) ? ($body['gender'] ?: null) : null;
                $stream = array_key_exists('stream', $body) ? ($body['stream'] ?: null) : null;
                $academicYear = trim($body['academic_year'] ?? '');
                $instituteId = array_key_exists('institute_id', $body) ? ($body['institute_id'] ? (int)$body['institute_id'] : null) : null;
                $password = trim($body['password'] ?? '');

                $updateFields = [];
                $params = ['id' => $targetUserId];

                if (!empty($fullName)) {
                    $updateFields[] = "full_name = :full_name";
                    $params['full_name'] = $fullName;
                }
                if (!empty($role)) {
                    $updateFields[] = "role = :role";
                    $params['role'] = $role;
                }
                if (array_key_exists('gender', $body)) {
                    $updateFields[] = "gender = :gender";
                    $params['gender'] = $gender;
                }
                if (array_key_exists('stream', $body)) {
                    $updateFields[] = "stream = :stream";
                    $params['stream'] = $stream;
                }
                if (!empty($academicYear)) {
                    $updateFields[] = "academic_year = :academic_year";
                    $params['academic_year'] = $academicYear;
                }
                if (array_key_exists('institute_id', $body)) {
                    $updateFields[] = "institute_id = :institute_id";
                    $params['institute_id'] = ($role === 'student_affiliated') ? $instituteId : null;
                }
                if (!empty($password)) {
                    $effectiveRole = $role ?: $targetCurrentRole;
                    $minLen = str_starts_with($effectiveRole, 'student') ? 6 : 8;
                    if (strlen($password) < $minLen) {
                        Database::sendJsonError("رمز عبور جدید برای این نقش باید حداقل {$minLen} نویسه باشد.");
                    }
                    $updateFields[] = "password_hash = :pwd";
                    $params['pwd'] = password_hash($password, PASSWORD_BCRYPT);
                }

                if (empty($updateFields)) {
                    Database::sendJsonError('هیچ تغییری ارسال نشده است.');
                }

                $sql = "UPDATE users SET " . implode(', ', $updateFields) . " WHERE id = :id";
                $pdo->prepare($sql)->execute($params);

                Database::sendJsonResponse(['ok' => true, 'message' => 'مشخصات کاربر با موفقیت به‌روزرسانی شد.']);
            }

            if ($method === 'DELETE' && $targetUserId) {
                if ($targetUserId === (int)$adminUser['id']) {
                    Database::sendJsonError('شما نمی‌توانید حساب کاربری جاری خود را حذف کنید.', 400);
                }

                // Ensure the last admin cannot be deleted
                $targetRoleStmt = $pdo->prepare("SELECT role FROM users WHERE id = :id LIMIT 1");
                $targetRoleStmt->execute(['id' => $targetUserId]);
                $targetRole = $targetRoleStmt->fetchColumn();

                if ($targetRole === 'admin') {
                    $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
                    if ($adminCount <= 1) {
                        Database::sendJsonError('امکان حذف آخرین مدیر ارشد سامانه وجود ندارد.', 400);
                    }
                }

                $pdo->prepare("DELETE FROM users WHERE id = :id")->execute(['id' => $targetUserId]);
                Database::sendJsonResponse(['ok' => true, 'message' => 'کاربر حذف شد.']);
            }
        }

        // 4. Institute Management: /api/admin/institutes
        if ($action === 'institutes') {
            $targetInstId = is_numeric($subAction) ? (int)$subAction : null;

            if ($method === 'GET') {
                $sql = "
                    SELECT i.id, i.name, i.invite_code, i.contact_phone, i.created_at,
                           COUNT(u.id) as student_count
                    FROM institutes i
                    LEFT JOIN users u ON u.institute_id = i.id
                    GROUP BY i.id
                    ORDER BY i.id DESC
                ";
                $list = $pdo->query($sql)->fetchAll();
                Database::sendJsonResponse(['ok' => true, 'institutes' => $list]);
            }

            if ($method === 'POST') {
                $name = trim($body['name'] ?? '');
                $phone = trim($body['contact_phone'] ?? '');
                $inviteCode = strtoupper(trim($body['invite_code'] ?? ''));

                if (empty($name)) {
                    Database::sendJsonError('نام آموزشگاه الزامی است.');
                }
                if (!empty($phone) && !preg_match('/^0[0-9]{9,10}$/', $phone)) {
                    Database::sendJsonError('شماره تماس مرکز نامعتبر است. فرمت صحیح: 0xxxxxxxxxx');
                }

                if (empty($inviteCode)) {
                    $inviteCode = 'RASTA-' . strtoupper(implode('-', str_split(bin2hex(random_bytes(6)), 4)));
                } else {
                    if (!preg_match('/^[A-Z0-9_-]{4,30}$/i', $inviteCode)) {
                        Database::sendJsonError('کد پیوند باید بین ۴ تا ۳۰ نویسه و شامل حروف انگلیسی، اعداد یا خط تیره باشد.');
                    }
                    $inviteCode = strtoupper($inviteCode);
                }

                $chk = $pdo->prepare("SELECT id FROM institutes WHERE invite_code = :c");
                $chk->execute(['c' => $inviteCode]);
                if ($chk->fetch()) {
                    Database::sendJsonError('این کد پیوند قبلاً به آموزشگاه دیگری اختصاص یافته است.');
                }

                $stmt = $pdo->prepare("INSERT INTO institutes (name, invite_code, contact_phone) VALUES (:name, :code, :phone)");
                $stmt->execute(['name' => $name, 'code' => $inviteCode, 'phone' => $phone ?: null]);

                Database::sendJsonResponse([
                    'ok' => true,
                    'id' => (int)$pdo->lastInsertId(),
                    'invite_code' => $inviteCode,
                    'message' => 'آموزشگاه جدید با موفقیت ایجاد شد.'
                ], 201);
            }

            if ($method === 'PUT' && $targetInstId) {
                $name = trim($body['name'] ?? '');
                $phone = trim($body['contact_phone'] ?? '');

                if (!empty($phone) && !preg_match('/^0[0-9]{9,10}$/', $phone)) {
                    Database::sendJsonError('شماره تماس مرکز نامعتبر است. فرمت صحیح: 0xxxxxxxxxx');
                }

                $stmt = $pdo->prepare("UPDATE institutes SET name = COALESCE(:name, name), contact_phone = :phone WHERE id = :id");
                $stmt->execute(['name' => $name ?: null, 'phone' => $phone ?: null, 'id' => $targetInstId]);

                Database::sendJsonResponse(['ok' => true, 'message' => 'اطلاعات مرکز آموزشی به‌روزرسانی شد.']);
            }

            if ($method === 'DELETE' && $targetInstId) {
                $pdo->prepare("DELETE FROM institutes WHERE id = :id")->execute(['id' => $targetInstId]);
                Database::sendJsonResponse(['ok' => true, 'message' => 'مرکز آموزشی حذف شد.']);
            }
        }
        break;

    // --- PUBLIC INSTITUTE VERIFICATION ---

    case 'institutes':
        if ($action === 'verify' && $method === 'GET') {
            $code = strtoupper(trim($_GET['code'] ?? ''));
            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("SELECT id, name FROM institutes WHERE invite_code = :code LIMIT 1");
            $stmt->execute(['code' => $code]);
            $inst = $stmt->fetch();

            if (!$inst) {
                Database::sendJsonError('کد پیوند یافت نشد.', 404);
            }
            Database::sendJsonResponse(['ok' => true, 'institute' => $inst]);
        }
        break;

    default:
        Database::sendJsonError('نقطه پایانی نامعتبر است: ' . $endpoint, 404);
        break;
}