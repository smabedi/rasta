<?php // Purely for local dev / IntelliJ built-in PHP server
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

function renderWithSSI(string $filePath): void {
    $content = file_get_contents($filePath);
    echo preg_replace_callback('~<!--#\s*include\s+(?:virtual|file)\s*=\s*["\']([^"\']+)["\']\s*-->~i', function ($matches) {
        // Strip leading slashes and normalize separators for Windows & Linux
        $cleanRelPath = ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $matches[1]), DIRECTORY_SEPARATOR);
        $includePath = __DIR__ . DIRECTORY_SEPARATOR . $cleanRelPath;

        if (!file_exists($includePath)) {
            error_log("[SSI Error] Include file not found at: " . $includePath);
            return "<!-- [SSI ERROR: File not found at: " . htmlspecialchars($includePath) . "] -->";
        }
        return file_get_contents($includePath);
    }, $content);
}

// 1. Serve actual physical static files (CSS, JS, images, fonts, JSON, SHTML)
if ($uri !== '/' && file_exists(__DIR__ . $uri) && !is_dir(__DIR__ . $uri)) {
    if (preg_match('~\.(shtml|html)$~i', $uri)) {
        renderWithSSI(__DIR__ . $uri);
        exit;
    }
    return false;
}

// 2. Route /api/* requests to api.php
if (preg_match('~^/api/(.*)$~', $uri, $matches)) {
    $_GET['endpoint'] = $matches[1];
    require __DIR__ . '/api.php';
    exit;
}

// 3. Support directory indexes (/management/admin/ -> /management/admin/index.html)
$indexPath = rtrim(__DIR__ . str_replace('/', DIRECTORY_SEPARATOR, $uri), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.html';
if (file_exists($indexPath)) {
    renderWithSSI($indexPath);
    exit;
}

// 4. Default 404 Error Fallback
http_response_code(404);
$error404 = __DIR__ . DIRECTORY_SEPARATOR . '404.shtml';
if (file_exists($error404)) {
    renderWithSSI($error404);
} else {
    echo '404 Not Found';
}
exit;
