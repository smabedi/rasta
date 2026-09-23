<?php
/**
 * Rasta | Core REST Backend (PHP Edition)
 * Completely replaces server.js with zero client-side breaking changes.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$DATA_DIR = __DIR__ . '/data';
$USERS_FILE = $DATA_DIR . '/users.json';
$MATRICES_DIR = $DATA_DIR . '/matrices';

// Ensure data storage directories exist
if (!is_dir($DATA_DIR)) mkdir($DATA_DIR, 0755, true);
if (!is_dir($MATRICES_DIR)) mkdir($MATRICES_DIR, 0755, true);

// Read and write helper functions
function readUsers(string $file): array {
    if (!file_exists($file)) return [];
    $raw = file_get_contents($file);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function writeUsers(string $file, array $users): void {
    file_put_contents($file, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function generateSafeId(string $persianName): string {
    $hash = substr(md5($persianName . microtime(true)), 0, 6);
    return 'u_' . $hash;
}

function safe_lower(string $str): string {
    return function_exists('mb_strtolower') ? mb_strtolower($str, 'UTF-8') : strtolower($str);
}

function safe_len(string $str): int {
    return function_exists('mb_strlen') ? mb_strlen($str, 'UTF-8') : strlen($str);
}

// Extract method and endpoint path
$method = $_SERVER['REQUEST_METHOD'];
$endpoint = isset($_GET['endpoint']) ? trim($_GET['endpoint'], '/') : '';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

// --------------------------------------------------------------------------
// 1. Authentication Endpoints
// --------------------------------------------------------------------------

// GET /api/auth/status
if ($method === 'GET' && $endpoint === 'auth/status') {
    $users = readUsers($USERS_FILE);
    $hasAdmin = false;
    foreach ($users as $u) {
        if (($u['role'] ?? '') === 'ADMIN') {
            $hasAdmin = true;
            break;
        }
    }
    echo json_encode(['hasAdmin' => $hasAdmin]);
    exit;
}

// POST /api/auth/setup
if ($method === 'POST' && $endpoint === 'auth/setup') {
    $username = trim($input['username'] ?? '');
    $pin = trim($input['pin'] ?? '');
    $users = readUsers($USERS_FILE);

    foreach ($users as $u) {
        if (($u['role'] ?? '') === 'ADMIN') {
            http_response_code(400);
            echo json_encode(['error' => 'مدیر ارشد قبلاً تعریف شده است.']);
            exit;
        }
    }

    if (safe_len($username) < 2 || strlen($pin) < 4) {
        http_response_code(400);
        echo json_encode(['error' => 'اطلاعات نام و رمز عبور معتبر نیست.']);
        exit;
    }

    $adminUser = [
        'id' => generateSafeId($username),
        'username' => $username,
        'pin' => $pin,
        'role' => 'ADMIN',
        'createdAt' => date('c')
    ];

    $users[] = $adminUser;
    writeUsers($USERS_FILE, $users);

    echo json_encode([
        'success' => true,
        'user' => ['id' => $adminUser['id'], 'username' => $adminUser['username'], 'role' => $adminUser['role']]
    ]);
    exit;
}

// POST /api/auth/login
if ($method === 'POST' && $endpoint === 'auth/login') {
    $username = trim($input['username'] ?? '');
    $pin = trim($input['pin'] ?? '');
    $users = readUsers($USERS_FILE);

    $found = null;
    foreach ($users as $u) {
        if (safe_lower(trim($u['username'])) === safe_lower($username) && trim($u['pin']) === $pin) {
            $found = $u;
            break;
        }
    }

    if (!$found) {
        http_response_code(401);
        echo json_encode(['error' => 'نام کاربری یا رمز عبور اشتباه است.']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'user' => ['id' => $found['id'], 'username' => $found['username'], 'role' => $found['role']]
    ]);
    exit;
}

// --------------------------------------------------------------------------
// 2. User Management Endpoints
// --------------------------------------------------------------------------

// GET /api/users
if ($method === 'GET' && $endpoint === 'users') {
    $users = readUsers($USERS_FILE);
    $sanitized = array_map(function ($u) {
        unset($u['pin']);
        return $u;
    }, $users);
    echo json_encode(['users' => array_values($sanitized)]);
    exit;
}

// POST /api/users
if ($method === 'POST' && $endpoint === 'users') {
    $username = trim($input['username'] ?? '');
    $pin = trim($input['pin'] ?? '');
    $users = readUsers($USERS_FILE);

    if (safe_len($username) < 2) {
        http_response_code(400);
        echo json_encode(['error' => 'نام کاربری باید حداقل ۲ نویسه باشد.']);
        exit;
    }
    if (strlen($pin) < 4) {
        http_response_code(400);
        echo json_encode(['error' => 'رمز عبور باید حداقل ۴ رقم باشد.']);
        exit;
    }

    foreach ($users as $u) {
        if (safe_lower(trim($u['username'])) === safe_lower($username)) {
            http_response_code(400);
            echo json_encode(['error' => 'کاربری با این نام قبلاً ثبت شده است.']);
            exit;
        }
    }

    $newUser = [
        'id' => generateSafeId($username),
        'username' => $username,
        'pin' => $pin,
        'role' => 'EDITOR',
        'createdAt' => date('c')
    ];

    $users[] = $newUser;
    writeUsers($USERS_FILE, $users);

    echo json_encode([
        'success' => true,
        'user' => ['id' => $newUser['id'], 'username' => $newUser['username'], 'role' => $newUser['role']]
    ]);
    exit;
}

// DELETE /api/users/:id
if ($method === 'DELETE' && preg_match('#^users/([a-zA-Z0-9_]+)$#', $endpoint, $matches)) {
    $targetId = $matches[1];
    $users = readUsers($USERS_FILE);

    $filtered = [];
    $found = false;
    foreach ($users as $u) {
        if ($u['id'] === $targetId) {
            $found = true;
            if ($u['role'] === 'ADMIN') {
                http_response_code(403);
                echo json_encode(['error' => 'حذف حساب مدیر ارشد ممکن نیست.']);
                exit;
            }
            continue;
        }
        $filtered[] = $u;
    }

    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'کاربر یافت نشد.']);
        exit;
    }

    writeUsers($USERS_FILE, $filtered);
    echo json_encode(['success' => true]);
    exit;
}

// --------------------------------------------------------------------------
// 3. Matrix File Persistence Endpoints
// --------------------------------------------------------------------------

// GET /api/matrix/:stream/:userId
if ($method === 'GET' && preg_match('#^matrix/([a-zA-Z0-9_]+)/([a-zA-Z0-9_]+)$#', $endpoint, $matches)) {
    $stream = $matches[1];
    $userId = $matches[2];
    $filePath = $MATRICES_DIR . "/{$stream}_$userId.json";

    if (!file_exists($filePath)) {
        echo json_encode(['matrix' => (object)[], 'updatedAt' => 0, 'lastModifiedBy' => null]);
        exit;
    }

    $content = file_get_contents($filePath);
    echo $content ?: json_encode(['matrix' => (object)[], 'updatedAt' => 0, 'lastModifiedBy' => null]);
    exit;
}

// POST /api/matrix/:stream/:userId
if ($method === 'POST' && preg_match('#^matrix/([a-zA-Z0-9_]+)/([a-zA-Z0-9_]+)$#', $endpoint, $matches)) {
    $stream = $matches[1];
    $userId = $matches[2];
    $filePath = $MATRICES_DIR . "/{$stream}_$userId.json";

    $payload = [
        'meta' => [
            'stream' => $stream,
            'userId' => $userId,
            'savedAt' => date('c')
        ],
        'updatedAt' => round(microtime(true) * 1000),
        'lastModifiedBy' => $input['modifiedByName'] ?? 'ناشناس',
        'matrix' => $input['matrix'] ?? (object)[]
    ];

    file_put_contents($filePath, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo json_encode(['success' => true, 'updatedAt' => $payload['updatedAt']]);
    exit;
}

// --------------------------------------------------------------------------
// 4. Real-Time Online Presence Counter
// --------------------------------------------------------------------------
if ($method === 'POST' && $endpoint === 'presence/ping') {
    $PRESENCE_FILE = $DATA_DIR . '/presence.json';
    $timeoutWindow = 12; // Inactive after 12 seconds (handles 5s pings + lag)
    $now = time();

    // Unique tab/visitor identifier generated by the client
    $clientId = trim($input['clientId'] ?? '');
    if (!$clientId) {
        $clientId = md5($_SERVER['REMOTE_ADDR'] . ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    }

    // Read current presence records
    $sessions = [];
    if (file_exists($PRESENCE_FILE)) {
        $raw = file_get_contents($PRESENCE_FILE);
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $sessions = $decoded;
        }
    }

    // 1. Prune expired users
    $activeSessions = array_filter($sessions, function ($lastSeen) use ($now, $timeoutWindow) {
        return ($now - $lastSeen) < $timeoutWindow;
    });

    // 2. Register / renew current visitor
    $activeSessions[$clientId] = $now;

    // 3. Write back with exclusive file lock to avoid concurrency collision
    file_put_contents($PRESENCE_FILE, json_encode($activeSessions), LOCK_EX);

    echo json_encode([
        'success' => true,
        'onlineCount' => count($activeSessions)
    ]);
    exit;
}

// Fallback for unhandled routes
http_response_code(404);
echo json_encode(['error' => 'مسیر مورد نظر یافت نشد.']);
