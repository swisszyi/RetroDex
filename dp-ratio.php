<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *"); // For development
ini_set('display_errors', 1);
error_reporting(E_ALL);

// MySQL Configuration
define('DB_HOST', 'sql309.infinityfree.com');
define('DB_NAME', 'if0_39267200_Telegram_chat');
define('DB_USER', 'if0_39267200');
define('DB_PASS', 'HFHa5Id5IM');

// Connect to MySQL
try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME,
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
} catch (PDOException $e) {
    die(json_encode([
        'success' => false,
        'message' => 'Database connection failed',
        'error' => $e->getMessage()
    ]));
}

// Handle requests
$action = $_REQUEST['action'] ?? '';
$response = ['success' => false];

try {
    switch ($action) {
        case 'register_user':
            $response = handleRegistration($pdo, $_REQUEST);
            break;

        case 'get_chat_id':
            $response = handleGetChatId($pdo, $_REQUEST['user_id'] ?? '');
            break;

        case 'check_subscription':
            $response = handleCheckSubscription($pdo, $_REQUEST['chat_id'] ?? '');
            break;

        case 'update_last_notified':
            $response = handleUpdateLastNotified($pdo, $_REQUEST['chat_id'] ?? '');
            break;

        case 'test_connection':
            $response = [
                'success' => true,
                'message' => 'MySQL connection successful',
                'tables' => $pdo->query("SHOW TABLES")->fetchAll()
            ];
            break;

        default:
            $response['message'] = 'Invalid action';
    }
} catch (Exception $e) {
    $response['message'] = 'Error: ' . $e->getMessage();
}

echo json_encode($response);

// === Helper Functions ===
function handleRegistration($pdo, $data) {
    $stmt = $pdo->prepare("
        INSERT INTO telegram_users
            (chat_id, username, first_name, last_name, subscribed)
        VALUES
            (:chat_id, :username, :first_name, :last_name, TRUE)
        ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            subscribed = TRUE
    ");

    $stmt->execute([
        ':chat_id' => $data['chat_id'],
        ':username' => $data['username'] ?? '',
        ':first_name' => $data['first_name'] ?? '',
        ':last_name' => $data['last_name'] ?? ''
    ]);

    return [
        'success' => true,
        'affected_rows' => $stmt->rowCount()
    ];
}

function handleGetChatId($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT chat_id FROM telegram_users WHERE chat_id = ?");
    $stmt->execute([$userId]);
    $result = $stmt->fetch();

    return [
        'success' => !empty($result),
        'chat_id' => $result['chat_id'] ?? null
    ];
}

function handleCheckSubscription($pdo, $chatId) {
    $stmt = $pdo->prepare("SELECT subscribed FROM telegram_users WHERE chat_id = ?");
    $stmt->execute([$chatId]);
    $result = $stmt->fetch();

    return [
        'success' => !empty($result),
        'subscribed' => $result['subscribed'] ?? false
    ];
}

function handleUpdateLastNotified($pdo, $chatId) {
    $stmt = $pdo->prepare("UPDATE telegram_users SET last_notified = NOW() WHERE chat_id = ?");
    $stmt->execute([$chatId]);

    return [
        'success' => true,
        'affected_rows' => $stmt->rowCount()
    ];
}
?>
