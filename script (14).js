 // Telegram Configuration
const TELEGRAM_CONFIG = {
  BOT_TOKEN: "8026216349:AAFqlv0BZGGQjN_RkV0pgopxzALx2PmyWXo",
  API_URL: "https://api.telegram.org/bot",
  DB_API_URL: "db.php",
}

// Tatum MCP Configuration
const TATUM_MCP_CONFIG = {
  API_KEY: "t-68c1dc7412f07b1eae16d3b2-5496b12a603446ebb4518905",
  BASE_URL: "http://localhost:3000", // Local MCP server
  SUPPORTED_CHAINS: {
    base: "base",
  },
  RATE_LIMIT_DELAY: 100,
  CACHE_DURATION: 300000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000
};

// App Configuration
const CONFIG = {
  TATUM_API_KEY: "t-68c1dc7412f07b1eae16d3b2-5496b12a603446ebb4518905",
  BASE_RPC: "https://base-mainnet.gateway.tatum.io/",
  BLOCKSCOUT_API: "https://base.blockscout.com/api/v2",
  DEXSCREENER_API: "https://api.dexscreener.com/latest/dex",
  MIN_LIQUIDITY: 1000,
  DAYS_THRESHOLD: 2,
  SCAN_INTERVAL: 30000,
  WALLET_CHECK_INTERVAL: 60000,
  PROFIT_THRESHOLD: 50,

  // Major Base DEX configurations
  BASE_DEXES: {
    UNISWAP_V3: {
      name: "Uniswap V3",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      pairCreatedTopic: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
    },
    AERODROME: {
      name: "Aerodrome",
      factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
      pairCreatedTopic: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
    },
    BASESWAP: {
      name: "BaseSwap",
      factory: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
      pairCreatedTopic: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
    },
    SUSHISWAP: {
      name: "SushiSwap",
      factory: "0x71524B4f93c58fcbF659783284E38825f0622859",
      pairCreatedTopic: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
    },
    DEXSCREENER: {
      name: "DexScreener",
      latestTokensUrl: "https://api.dexscreener.com/token-profiles/latest/v1",
      latestBoostsUrl: "https://api.dexscreener.com/token-boosts/latest/v1",
      tokenPairsUrl: "https://api.dexscreener.com/token-pairs/v1",
      tokensUrl: "https://api.dexscreener.com/tokens/v1",
    },
  },
}

// Tatum MCP Service Class with Enhanced Error Handling
class TatumMCPService {
  constructor() {
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.isServerAvailable = false;
    this.serverCheckInterval = null;
    this.checkServerAvailability();
  }

  // Check if Tatum MCP server is available
  async checkServerAvailability() {
    try {
      const response = await fetch(`${TATUM_MCP_CONFIG.BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000
      });
      
      this.isServerAvailable = response.ok;
      console.log(`Tatum MCP Server Status: ${this.isServerAvailable ? 'Available' : 'Unavailable'}`);
      
      // Schedule next check
      if (this.serverCheckInterval) clearInterval(this.serverCheckInterval);
      this.serverCheckInterval = setInterval(() => this.checkServerAvailability(), 30000);
    } catch (error) {
      this.isServerAvailable = false;
      console.log("Tatum MCP Server is unavailable, using fallback methods");
    }
  }

  async request(endpoint, options = {}, retries = TATUM_MCP_CONFIG.MAX_RETRIES) {
    // If server is not available, throw error to trigger fallback
    if (!this.isServerAvailable) {
      throw new Error("Tatum MCP server unavailable");
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, options, resolve, reject, retries });
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const request = this.requestQueue.shift();
    
    try {
      const response = await this.makeRequest(request.endpoint, request.options);
      request.resolve(response);
    } catch (error) {
      if (request.retries > 0) {
        console.log(`Retrying request (${TATUM_MCP_CONFIG.MAX_RETRIES - request.retries + 1}/${TATUM_MCP_CONFIG.MAX_RETRIES})...`);
        setTimeout(() => {
          this.requestQueue.push({
            ...request,
            retries: request.retries - 1
          });
        }, TATUM_MCP_CONFIG.RETRY_DELAY);
      } else {
        request.reject(error);
      }
    }
    
    setTimeout(() => this.processQueue(), TATUM_MCP_CONFIG.RATE_LIMIT_DELAY);
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${TATUM_MCP_CONFIG.BASE_URL}${endpoint}`;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    finalOptions.signal = controller.signal;
    
    try {
      const response = await fetch(url, finalOptions);
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Tatum API error: ${response.status} ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Tatum MCP request timeout');
      }
      throw error;
    }
  }

  async getWalletBalance(chain, address) {
    try {
      const chainId = TATUM_MCP_CONFIG.SUPPORTED_CHAINS[chain];
      if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
      
      return await this.request(`/${chainId}/account/balance/${address}`);
    } catch (error) {
      console.error(`Error getting balance for ${address} on ${chain}:`, error);
      throw error;
    }
  }

  async getTokenBalances(chain, address) {
    try {
      const chainId = TATUM_MCP_CONFIG.SUPPORTED_CHAINS[chain];
      if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
      
      if (chainId === 'bitcoin') return [];
      return await this.request(`/${chainId}/account/balance/tokens/${address}`);
    } catch (error) {
      console.error(`Error getting token balances for ${address} on ${chain}:`, error);
      throw error;
    }
  }

  async getTokenMetadata(chain, tokenAddress) {
    try {
      const chainId = TATUM_MCP_CONFIG.SUPPORTED_CHAINS[chain];
      if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
      
      const cacheKey = `token_${chain}_${tokenAddress}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const metadata = await this.request(`/${chainId}/token/metadata/${tokenAddress}`);
      this.cache.set(cacheKey, metadata);
      setTimeout(() => this.cache.delete(cacheKey), TATUM_MCP_CONFIG.CACHE_DURATION);
      return metadata;
    } catch (error) {
      console.error(`Error getting token metadata for ${tokenAddress} on ${chain}:`, error);
      throw error;
    }
  }

  async getTransactions(chain, address, limit = 50) {
    try {
      const chainId = TATUM_MCP_CONFIG.SUPPORTED_CHAINS[chain];
      if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
      
      return await this.request(`/${chainId}/account/transaction/${address}?pageSize=${limit}`);
    } catch (error) {
      console.error(`Error getting transactions for ${address} on ${chain}:`, error);
      throw error;
    }
  }

  async getCurrentBlock(chain) {
    try {
      const chainId = TATUM_MCP_CONFIG.SUPPORTED_CHAINS[chain];
      if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
      
      return await this.request(`/${chainId}/block/current`);
    } catch (error) {
      console.error(`Error getting current block for ${chain}:`, error);
      throw error;
    }
  }

  async getTokenPrice(chain, tokenAddress) {
    try {
      const chainId = TATUM_MCP_CONFIG.SUPPORTED_CHAINS[chain];
      if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
      
      const response = await this.request(`/${chainId}/token/price/${tokenAddress}`);
      return response.price || 0;
    } catch (error) {
      console.error(`Error getting token price for ${tokenAddress} on ${chain}:`, error);
      return 0;
    }
  }
}

// Initialize Tatum MCP Service
const tatumService = new TatumMCPService();

// Telegram Web App Integration
let telegramWebApp = null;
let telegramUser = null;
let telegramAlertCount = 0;
let messagesSentToday = 0;
let lastMessageTime = null;

// Global state
let newTokens = [];
let filteredTokens = [];
let walletAddresses = [];
const walletTokensMap = new Map();
let scannerInterval;
let walletInterval;
let isScanning = false;
let currentBlock = 0;
const lastScannedBlock = 0;
const sentNotifications = new Set();
const NOTIFICATION_COOLDOWN = 300000; // 5 minutes cooldown
const knownTokenProfiles = new Set();
const knownBoostedTokens = new Set();
const boostedTokens = new Map();
let activeWalletIndex = 0;

// DOM elements cache
const elements = {};

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Initializing RatioDEX with Tatum MCP Integration...");
  cacheDOMElements();
  initializeApp();
});

function cacheDOMElements() {
  // Tabs
  elements.tabBtns = document.querySelectorAll(".tab-btn");
  elements.tabContents = document.querySelectorAll(".tab-content");

  // New tokens tab
  elements.loadingState = document.getElementById("loadingState");
  elements.errorState = document.getElementById("errorState");
  elements.tokenGrid = document.getElementById("tokenGrid");
  elements.emptyState = document.getElementById("emptyState");
  elements.scanProgress = document.getElementById("scanProgress");
  elements.scanStatus = document.getElementById("scanStatus");

  // Wallet tab
  elements.walletInput = document.getElementById("walletInput");
  elements.addWalletBtn = document.getElementById("addWalletBtn");
  elements.walletList = document.getElementById("walletList");
  elements.walletTokensGrid = document.getElementById("walletTokensGrid");
  elements.walletEmptyState = document.getElementById("walletEmptyState");

  // Telegram settings
  elements.profitThreshold = document.getElementById("profitThreshold");
  elements.thresholdValue = document.getElementById("thresholdValue");
  elements.testTelegramBtn = document.getElementById("testTelegramBtn");

  // Common
  elements.searchInput = document.getElementById("searchInput");
  elements.sortBy = document.getElementById("sortBy");
  elements.timeFilter = document.getElementById("timeFilter");
  elements.refreshBtn = document.getElementById("refreshBtn");
  elements.totalTokens = document.getElementById("totalTokens");
  elements.walletTokensCount = document.getElementById("walletTokens");
  elements.lastUpdated = document.getElementById("lastUpdated");
  elements.tokenModal = document.getElementById("tokenModal");
  elements.notificationContainer = document.getElementById("notificationContainer");
}

async function initializeApp() {
  try {
    // Initialize Telegram Web App first
    initializeTelegramWebApp();

    setupEventListeners();
    setupTelegramSettings();
    loadWalletsFromStorage();
    loadTelegramSettings();

    // Start with Tatum MCP as primary, with fallbacks
    await startTokenScanner();
    startWalletMonitoring();
  } catch (error) {
    console.error("❌ Failed to initialize app:", error);
    showErrorState();
    sendTelegramMessage("❌ System Error", `Failed to initialize RatioDEX: ${error.message}`, "error");
  }
}

// Telegram Web App Integration Functions
function initializeTelegramWebApp() {
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      telegramWebApp = window.Telegram.WebApp;
      telegramWebApp.ready();

      // Get user data
      telegramUser = telegramWebApp.initDataUnsafe?.user;

      // Set theme
      telegramWebApp.setHeaderColor("#1a1a2e");
      telegramWebApp.setBackgroundColor("#0c0c0c");

      // Enable closing confirmation
      telegramWebApp.enableClosingConfirmation();

      // Update UI with user info
      updateTelegramStatus("connected", "Connected to Telegram");

      if (telegramUser && telegramUser.id) {
        updateUserInfo(telegramUser);
        console.log(`📱 Telegram user detected: ${telegramUser.first_name} (ID: ${telegramUser.id})`);

        // Register the user in our database and send welcome message
        registerTelegramUser(telegramUser).then((success) => {
          if (success) {
            console.log("✅ User registration and chat ID storage completed");

            // Send welcome message after successful registration
            setTimeout(() => {
              sendTelegramMessage(
                "🚀 RatioDEX Scanner Activated!",
                `Welcome ${telegramUser.first_name}! Your token discovery and portfolio tracking is now live. 

🔍 You'll receive notifications for:
• 🪙 New token discoveries
• 💼 Wallet additions and balance updates  
• 🚀 Boosted token alerts (buy opportunities!)
• 📊 Profit/loss alerts based on your settings

📱 RatioDEX is ready to help you track profitable opportunities!

💡 Your Chat ID (${telegramUser.id}) has been securely stored for notifications.`,
                "welcome",
              );
            }, 2000);
          } else {
            console.error("❌ User registration failed - chat ID not stored");
            // Try to send error notification anyway
            sendTelegramMessage(
              "⚠️ Registration Issue",
              "There was an issue storing your chat ID. Please contact support if you don't receive notifications.",
              "warning",
            );
          }
        });
      } else {
        console.log("⚠️ No Telegram user data or ID available");
        updateTelegramStatus("warning", "No user data available");
      }

      console.log("✅ Telegram Web App initialized successfully");
    } else {
      // Fallback for non-Telegram environments
      updateTelegramStatus("warning", "Running outside Telegram");
      console.log("⚠️ Running outside Telegram environment");
    }
  } catch (error) {
    console.error("❌ Failed to initialize Telegram Web App:", error);
    updateTelegramStatus("error", "Telegram connection failed");
  }
}

function updateTelegramStatus(status, message) {
  const statusDot = document.getElementById("telegramStatusDot");
  const statusText = document.getElementById("telegramStatusText");
  const connectionStatus = document.getElementById("connectionStatus");

  if (statusDot) {
    statusDot.className = `status-dot ${status}`;
  }

  if (statusText) {
    statusText.textContent = message;
  }

  if (connectionStatus) {
    connectionStatus.textContent = status === "connected" ? "Connected" : "Disconnected";
    connectionStatus.className = status === "connected" ? "status-connected" : "status-disconnected";
  }
}

function updateUserInfo(user) {
  const userInfo = document.getElementById("telegramUserInfo");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");

  if (userInfo && user) {
    userInfo.style.display = "flex";

    if (userName) {
      userName.textContent = user.first_name + (user.last_name ? ` ${user.last_name}` : "");
    }

    if (userAvatar && user.photo_url) {
      userAvatar.src = user.photo_url;
    }
  }
}

async function sendTelegramMessage(title, message, type = "info", options = {}) {
  try {
    // ONLY send these specific types to Telegram
    const allowedTelegramTypes = [
      "new-token", // New token discovery
      "wallet", // New wallet added / wallet balance notifications
      "profit", // Profit/loss alerts
      "welcome", // Welcome message
      "boosted", // Boosted token alerts
    ]

    // Check if this notification type should be sent to Telegram
    if (!allowedTelegramTypes.includes(type)) {
      console.log(`📵 ${type} notifications not sent to Telegram (local only)`);
      return false;
    }

    // Check if notifications are enabled for this type
    if (!isNotificationEnabled(type)) {
      console.log(`📵 ${type} notifications disabled, skipping message`);
      return false;
    }

    // Skip "now viewing" notifications for Telegram
    if (title.includes("Now viewing") || title.includes("Switched")) {
      console.log(`📵 Skipping "now viewing" notification for Telegram`);
      return false;
    }

    // Create notification hash to prevent duplicates
    const notificationHash = `${type}-${title}-${message.substring(0, 50)}`;
    const now = Date.now();

    // Check if we've sent this notification recently
    if (sentNotifications.has(notificationHash)) {
      console.log(`📵 Duplicate notification blocked: ${title}`);
      return false;
    }

    // Add to sent notifications with timestamp
    sentNotifications.add(notificationHash);

    // Clean up old notifications after cooldown
    setTimeout(() => {
      sentNotifications.delete(notificationHash);
    }, NOTIFICATION_COOLDOWN);

    const emoji = getEmojiForType(type);
    const formattedMessage = formatTelegramMessage(title, message, emoji);

    // Get user's chat ID
    const chatId = telegramUser?.id;
    if (!chatId) {
      console.log("❌ No Telegram user ID found");
      return false;
    }

    console.log(`📤 Sending Telegram message to ${chatId}: ${title}`);

    const response = await fetch(`${TELEGRAM_CONFIG.API_URL}${TELEGRAM_CONFIG.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedMessage,
        parse_mode: "HTML",
        disable_web_page_preview: options.disablePreview || false,
        ...options,
      }),
    });

    if (response.ok) {
      telegramAlertCount++;
      messagesSentToday++;
      lastMessageTime = new Date();

      updateTelegramStats();

      console.log(`✅ Telegram message sent successfully: ${title}`);

      // Show success notification in UI
      showLocalNotification("📱 Telegram Alert Sent", `Message: ${title}`, "telegram");

      return true;
    } else {
      const errorData = await response.json();
      console.error("❌ Failed to send Telegram message:", errorData);
      return false;
    }
  } catch (error) {
    console.error("❌ Error sending Telegram message:", error);
    return false;
  }
}

async function registerTelegramUser(user) {
  try {
    if (!user || !user.id) {
      console.log("❌ Invalid user data for registration - missing ID");
      return false;
    }

    console.log(`📝 Registering user: ${user.first_name} (Chat ID: ${user.id})`);

    const response = await fetch(TELEGRAM_CONFIG.DB_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        action: "register_user",
        chat_id: user.id.toString(), // Ensure it's a string
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log(`✅ User ${user.id} registered successfully - Chat ID stored in database`);

      // Verify the registration by checking if we can retrieve the chat ID
      setTimeout(async () => {
        try {
          const verifyResponse = await fetch(`${TELEGRAM_CONFIG.DB_API_URL}?action=get_chat_id&user_id=${user.id}`);
          const verifyData = await verifyResponse.json();
          if (verifyData.success && verifyData.chat_id) {
            console.log(`✅ Chat ID verification successful: ${verifyData.chat_id}`);
          } else {
            console.warn("⚠️ Chat ID verification failed");
          }
        } catch (error) {
          console.warn("⚠️ Chat ID verification error:", error);
        }
      }, 1000);

      return true;
    } else {
      console.error("❌ User registration failed:", data.message);
      return false;
    }
  } catch (error) {
    console.error("❌ Error registering user:", error);
    return false;
  }
}

function formatTelegramMessage(title, message, emoji) {
  const timestamp = new Date().toLocaleString();

  return `${emoji} <b>${title}</b>

${message}

🕒 <i>${timestamp}</i>
📱 <i>RatioDEX Scanner</i>`;
}

function getEmojiForType(type) {
  const emojiMap = {
    profit: "🚀",
    warning: "⚠️",
    error: "❌",
    info: "ℹ️",
    success: "✅",
    "new-token": "🪙",
    wallet: "💼",
    system: "🔧",
    boosted: "🟢",
  };

  return emojiMap[type] || "ℹ️";
}

function isNotificationEnabled(type) {
  const settingsMap = {
    profit: "profitAlertsToggle",
    "new-token": "newTokenAlertsToggle",
    wallet: "walletAlertsToggle",
    system: "systemAlertsToggle",
    warning: "systemAlertsToggle",
    error: "systemAlertsToggle",
    info: "systemAlertsToggle",
    success: "systemAlertsToggle",
  };

  const toggleId = settingsMap[type];
  if (!toggleId) return true;

  const toggle = document.getElementById(toggleId);
  return toggle ? toggle.checked : true;
}

function updateTelegramStats() {
  const telegramAlertsElement = document.getElementById("telegramAlerts");
  const messagesSentTodayElement = document.getElementById("messagesSentToday");
  const lastMessageTimeElement = document.getElementById("lastMessageTime");

  if (telegramAlertsElement) {
    telegramAlertsElement.textContent = telegramAlertCount;
  }

  if (messagesSentTodayElement) {
    messagesSentTodayElement.textContent = messagesSentToday;
  }

  if (lastMessageTimeElement && lastMessageTime) {
    lastMessageTimeElement.textContent = lastMessageTime.toLocaleTimeString();
  }
}

async function testTelegramConnection() {
  const testBtn = document.getElementById("testTelegramBtn");
  const testResult = document.getElementById("telegramTestResult");

  if (testBtn) {
    testBtn.disabled = true;
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  }

  try {
    const success = await sendTelegramMessage(
      "🧪 Test Message",
      "This is a test message from RatioDEX. If you received this, your Telegram integration is working perfectly!",
      "info",
    );

    if (testResult) {
      if (success) {
        testResult.className = "test-result success";
        testResult.textContent = "✅ Test message sent successfully!";
      } else {
        testResult.className = "test-result error";
        testResult.textContent = "❌ Failed to send test message. Check your configuration.";
      }
    }
  } catch (error) {
    if (testResult) {
      testResult.className = "test-result error";
      testResult.textContent = `❌ Error: ${error.message}`;
    }
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fab fa-telegram"></i> Send Test Message';
    }

    // Clear result after 5 seconds
    setTimeout(() => {
      if (testResult) {
        testResult.textContent = "";
        testResult.className = "test-result";
      }
    }, 5000);
  }
}

function showNotification(title, message, type = "info", actions = []) {
  // Send to Telegram
  sendTelegramMessage(title, message, type);

  // Show local notification
  showLocalNotification(title, message, type, actions);
}

function showLocalNotification(title, message, type = "info", actions = []) {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  notification.innerHTML = `
    <div class="notification-header">
      <div class="notification-title">${title}</div>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="notification-body">${message}</div>
    ${
      actions.length > 0
        ? `
      <div class="notification-actions">
        ${actions
          .map(
            (action, index) => `
          <button class="notification-btn ${index === 0 ? "primary" : "secondary"}"
                  onclick="(${action.action.toString()})(); this.closest('.notification').remove()">
            ${action.text}
          </button>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }
  `;

  elements.notificationContainer.appendChild(notification);

  // Auto-remove after 10 seconds if no actions
  if (actions.length === 0) {
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }
}

function setupEventListeners() {
  // Tab switching
  elements.tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Wallet management
  elements.addWalletBtn.addEventListener("click", addWallet);
  elements.walletInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addWallet();
  });

  // Search and filters
  elements.searchInput.addEventListener("input", debounce(handleSearch, 300));
  elements.sortBy.addEventListener("change", handleSort);
  elements.timeFilter.addEventListener("change", handleTimeFilter);
  elements.refreshBtn.addEventListener("click", handleRefresh);

  // Modal
  elements.tokenModal.addEventListener("click", (e) => {
    if (e.target === elements.tokenModal) {
      closeModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });
}

function setupTelegramSettings() {
  // Profit threshold slider
  if (elements.profitThreshold && elements.thresholdValue) {
    elements.profitThreshold.addEventListener("input", (e) => {
      const value = e.target.value;
      elements.thresholdValue.textContent = `${value}%`;
      CONFIG.PROFIT_THRESHOLD = Number.parseInt(value);
      saveTelegramSettings();
    });
  }

  // Test Telegram button
  if (elements.testTelegramBtn) {
    elements.testTelegramBtn.addEventListener("click", testTelegramConnection);
  }

  // Settings toggles
  const toggles = ["profitAlertsToggle", "newTokenAlertsToggle", "walletAlertsToggle", "systemAlertsToggle"];
  toggles.forEach((toggleId) => {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.addEventListener("change", saveTelegramSettings);
    }
  });
}

function saveTelegramSettings() {
  const settings = {
    profitThreshold: CONFIG.PROFIT_THRESHOLD,
    profitAlerts: document.getElementById("profitAlertsToggle")?.checked || true,
    newTokenAlerts: document.getElementById("newTokenAlertsToggle")?.checked || true,
    walletAlerts: document.getElementById("walletAlertsToggle")?.checked || true,
    systemAlerts: document.getElementById("systemAlertsToggle")?.checked || true,
  };

  localStorage.setItem("ratiodex_telegram_settings", JSON.stringify(settings));
}

function loadTelegramSettings() {
  const saved = localStorage.getItem("ratiodex_telegram_settings");
  if (saved) {
    try {
      const settings = JSON.parse(saved);

      CONFIG.PROFIT_THRESHOLD = settings.profitThreshold || 50;

      if (elements.profitThreshold) {
        elements.profitThreshold.value = CONFIG.PROFIT_THRESHOLD;
      }
      if (elements.thresholdValue) {
        elements.thresholdValue.textContent = `${CONFIG.PROFIT_THRESHOLD}%`;
      }

      // Set toggle states
      const toggles = {
        profitAlertsToggle: settings.profitAlerts,
        newTokenAlertsToggle: settings.newTokenAlerts,
        walletAlertsToggle: settings.walletAlerts,
        systemAlertsToggle: settings.systemAlerts,
      };

      Object.entries(toggles).forEach(([id, value]) => {
        const toggle = document.getElementById(id);
        if (toggle && value !== undefined) {
          toggle.checked = value;
        }
      });
    } catch (error) {
      console.error("❌ Error loading Telegram settings:", error);
    }
  }
}

function switchTab(tabName) {
  // Update tab buttons
  elements.tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // Update tab content
  elements.tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === tabName);
  });
}

// Token Scanner with Tatum MCP as Primary
async function startTokenScanner() {
  console.log("🔍 Starting token scanner with Tatum MCP as primary...");

  try {
    isScanning = true;
    showLoadingState();
    updateScanProgress(10, "Initializing Tatum MCP scanner...");

    // Send system notification
    sendTelegramMessage(
      "🔍 Scanner Started",
      "RatioDEX token scanner is now active with Tatum MCP as primary data source.",
      "system"
    );

    // Get recent tokens
    updateScanProgress(30, "Scanning with Tatum MCP...");
    await scanRecentTokens();

    updateScanProgress(100, "Scanner active - monitoring for new tokens...");

    // Set up continuous scanning
    scannerInterval = setInterval(async () => {
      if (!isScanning) return;
      try {
        console.log("🔄 Scanning for new tokens with Tatum MCP...");
        await scanRecentTokens();
      } catch (error) {
        console.error("❌ Scanner error:", error);
        sendTelegramMessage("⚠️ Scanner Warning", `Scanner encountered an error: ${error.message}`, "warning");
      }
    }, CONFIG.SCAN_INTERVAL);

    console.log("✅ Token scanner with Tatum MCP is now running!");
  } catch (error) {
    console.error("❌ Failed to start scanner:", error);
    showErrorState();
    isScanning = false;
    sendTelegramMessage("❌ Scanner Failed", `Failed to start token scanner: ${error.message}`, "error");
  }
}

// Enhanced token scanning with Tatum MCP as primary with fallbacks
async function scanRecentTokens() {
  try {
    console.log("📡 Scanning all sources for recent tokens...");

    const allTokens = [];

    // 1. Tatum MCP discovery (primary)
    console.log("🔍 Scanning with Tatum MCP...");
    try {
      const tatumTokens = await discoverTokensWithTatum();
      allTokens.push(...tatumTokens);
      console.log(`✅ Tatum MCP scan complete: ${tatumTokens.length} tokens`);
    } catch (tatumError) {
      console.warn("⚠️ Tatum MCP scan failed, using fallbacks:", tatumError);
      sendTelegramMessage(
        "⚠️ Tatum MCP Unavailable", 
        "Tatum MCP server is unavailable. Using fallback data sources for token discovery.", 
        "warning"
      );
    }

    // 2. GeckoTerminal (fallback)
    console.log("🦎 Scanning GeckoTerminal...");
    try {
      const geckoTokens = await scanGeckoTerminalTokens();
      allTokens.push(...geckoTokens);
      console.log(`✅ GeckoTerminal scan complete: ${geckoTokens.length} tokens`);
    } catch (geckoError) {
      console.warn("⚠️ GeckoTerminal scan failed:", geckoError);
    }

    // 3. DexScreener (fallback)
    console.log("🔍 Scanning DexScreener...");
    try {
      const dexScreenerTokens = await scanDexScreenerTokens();
      allTokens.push(...dexScreenerTokens);
      console.log(`✅ DexScreener scan complete: ${dexScreenerTokens.length} tokens`);
    } catch (dexError) {
      console.warn("⚠️ DexScreener scan failed:", dexError);
    }

    // Process and filter tokens
    const processedTokens = [];
    for (const tokenData of allTokens) {
      try {
        let processedToken = tokenData;

        // If it's from Tatum MCP, it's already processed
        if (!tokenData.discoveredOn || !tokenData.discoveredOn.includes("Tatum MCP")) {
          processedToken = await processTokenFromDEX(tokenData);
        }

        if (processedToken && isValidToken(processedToken)) {
          processedTokens.push(processedToken);
        }
      } catch (error) {
        console.warn(`⚠️ Error processing token:`, error);
      }
    }

    console.log(`🎯 Valid tokens: ${processedTokens.length}`);

    // Add new tokens to our list
    if (processedTokens.length > 0) {
      const newTokensFound = processedTokens.filter(
        (token) => !newTokens.find((existing) => existing.address.toLowerCase() === token.address.toLowerCase())
      );

      if (newTokensFound.length > 0) {
        newTokens = [...newTokens, ...newTokensFound];
        console.log(`✅ Added ${newTokensFound.length} new tokens`);

        // Send Telegram notifications
        for (const token of newTokensFound.slice(0, 5)) {
          if (token.isBoosted) {
            sendTelegramMessage(
              "🟢 BOOSTED TOKEN ALERT!",
              `🚀 HIGH PRIORITY BUY OPPORTUNITY! 🚀

${token.name} (${token.symbol}) is BOOSTED on ${token.discoveredOn}!

💰 Market Cap: $${formatNumber(token.marketCap)}
💧 Liquidity: $${formatNumber(token.liquidity)}
📊 24h Volume: $${formatNumber(token.volume24h)}
🔗 Source: ${token.discoveredOn}
📍 Contract: ${token.address}
🌐 Chain: ${token.chain || 'Base'}

🟢 This token is being promoted and may see increased buying pressure!
⚡ Consider buying quickly before others notice!`,
              "boosted"
            );
          } else {
            const notificationType = "new-token";
            const title = "🪙 New Token Discovered!";

            sendTelegramMessage(
              title,
              `Found: ${token.name} (${token.symbol})
💰 Market Cap: $${formatNumber(token.marketCap)}
💧 Liquidity: $${formatNumber(token.liquidity)}
📊 24h Volume: $${formatNumber(token.volume24h)}
🔗 Source: ${token.discoveredOn}
📍 Contract: ${token.address}
🌐 Chain: ${token.chain || 'Base'}`,
              notificationType
            );
          }
        }
      }
    }

    updateUI();
  } catch (error) {
    console.error("❌ Error scanning recent tokens:", error);
    if (newTokens.length === 0) {
      showErrorState();
    }
  }
}

// Tatum MCP Token Discovery
async function discoverTokensWithTatum() {
  try {
    console.log("🔍 Discovering tokens with Tatum MCP...");
    
    const discoveredTokens = [];
    
    // Get recent blocks
    try {
      const currentBlock = await tatumService.getCurrentBlock('base');
      const fromBlock = currentBlock - 100; // Last 100 blocks
      
      // Get transactions in recent blocks
      for (let blockNumber = fromBlock; blockNumber <= currentBlock; blockNumber++) {
        try {
          const block = await tatumService.getBlock('base', blockNumber);
          
          // Process transactions in this block
          for (const tx of block.transactions) {
            // Look for token contract deployments
            if (tx.input && tx.input.startsWith('0x60806040')) {
              try {
                const tokenAddress = tx.creates || tx.to;
                if (tokenAddress) {
                  const metadata = await tatumService.getTokenMetadata('base', tokenAddress);
                  const marketData = await getDexScreenerData(tokenAddress);
                  
                  if (metadata && marketData) {
                    const tokenData = {
                      name: metadata.name,
                      symbol: metadata.symbol,
                      address: tokenAddress,
                      totalSupply: metadata.totalSupply,
                      decimals: metadata.decimals,
                      createdAt: new Date(block.timestamp * 1000),
                      ageInDays: (Date.now() - (block.timestamp * 1000)) / (1000 * 60 * 60 * 24),
                      marketCap: marketData.marketCap,
                      liquidity: marketData.liquidity,
                      volume24h: marketData.volume24h,
                      priceChange24h: marketData.priceChange24h,
                      price: marketData.price,
                      liquidityLocked: marketData.liquidityLocked,
                      isTrading: marketData.isTrading,
                      dexUrl: marketData.dexUrl,
                      discoveredOn: `Tatum MCP (Base)`,
                      chain: "base",
                      transactionHash: tx.hash
                    }
                    
                    discoveredTokens.push(tokenData);
                    console.log(`✅ Discovered new token: ${tokenData.symbol}`);
                  }
                }
              } catch (error) {
                console.warn(`Error processing transaction ${tx.hash}:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Error processing block ${blockNumber}:`, error);
        }
      }
    } catch (error) {
      console.warn("Error discovering tokens with Tatum:", error);
      throw error; // Re-throw to trigger fallback
    }
    
    return discoveredTokens;
  } catch (error) {
    console.error("❌ Error discovering tokens with Tatum MCP:", error);
    throw error; // Re-throw to trigger fallback
  }
}

// Fallback functions for when Tatum MCP fails
async function scanBlockscoutTokens() {
  try {
    const response = await fetch(`${CONFIG.BLOCKSCOUT_API}/tokens?type=ERC-20&limit=50`);
    if (!response.ok) throw new Error(`Blockscout API error: ${response.status}`);

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.warn("⚠️ Error scanning Blockscout:", error);
    return [];
  }
}

async function scanDEXTokens(dexConfig) {
  try {
    // Get recent pair creation events from this DEX
    const currentBlock = await getCurrentBlockNumber();
    const fromBlock = currentBlock - 50000 // ~7 days of blocks

    const response = await fetch(CONFIG.BASE_RPC, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.TATUM_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [
          {
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${currentBlock.toString(16)}`,
            address: dexConfig.factory,
            topics: [dexConfig.pairCreatedTopic],
          },
        ],
        id: 1,
      }),
    });

    if (!response.ok) throw new Error(`RPC error: ${response.status}`);

    const data = await response.json();
    const events = data.result || [];

    console.log(`📊 Found ${events.length} pair creation events on ${dexConfig.name}`);

    // Extract token addresses from events
    const tokens = [];
    for (const event of events.slice(0, 20)) {
      try {
        const tokenAddresses = extractTokenAddressesFromEvent(event, dexConfig);

        for (const address of tokenAddresses) {
          if (address && !isStablecoin(address)) {
            tokens.push({
              address: address,
              dex: dexConfig.name,
              blockNumber: Number.parseInt(event.blockNumber, 16),
              transactionHash: event.transactionHash,
            });
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error processing event:`, error);
      }
    }

    return tokens;
  } catch (error) {
    console.warn(`⚠️ Error scanning ${dexConfig.name}:`, error);
    return [];
  }
}

function extractTokenAddressesFromEvent(event, dexConfig) {
  try {
    const data = event.data;
    if (!data || data.length < 130) return [];

    const token0 = "0x" + data.slice(26, 66);
    const token1 = "0x" + data.slice(90, 130);

    return [token0, token1].filter((addr) => addr && addr !== "0x0000000000000000000000000000000000000000");
  } catch (error) {
    return [];
  }
}

async function scanDexScreenerTokens() {
  try {
    console.log("🔍 Scanning DexScreener for Base mainnet tokens...");

    // Get latest pairs from DexScreener for Base network
    const latestPairs = await scanDexScreenerLatestPairs();
    const latestProfiles = await scanDexScreenerLatestProfiles();
    const latestBoosts = await scanDexScreenerLatestBoosts();

    console.log(`📊 DexScreener Results:`);
    console.log(`- Latest Pairs: ${latestPairs.length}`);
    console.log(`- Latest Profiles: ${latestProfiles.length}`);
    console.log(`- Latest Boosts: ${latestBoosts.length}`);

    return [...latestPairs, ...latestProfiles, ...latestBoosts];
  } catch (error) {
    console.warn("⚠️ Error scanning DexScreener:", error);
    return [];
  }
}

async function scanDexScreenerLatestPairs() {
  try {
    console.log("🔍 Fetching latest pairs from DexScreener...");

    // Use the search endpoint to get recent Base pairs
    const response = await fetch("https://api.dexscreener.com/latest/dex/search?q=base", {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": "RatioDEX/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ DexScreener search API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !data.pairs || !Array.isArray(data.pairs)) {
      console.warn("⚠️ Invalid DexScreener search response structure");
      return [];
    }

    // Filter for Base mainnet pairs created recently
    const recentBasePairs = data.pairs.filter((pair) => {
      if (pair.chainId !== "base") return false;

      // Check if pair was created recently (last 7 days)
      const pairCreatedAt = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
      if (!pairCreatedAt) return false;

      const ageInDays = (Date.now() - pairCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
      return ageInDays <= 7 && pair.baseToken && pair.baseToken.address;
    });

    console.log(`📊 Found ${recentBasePairs.length} recent Base pairs from search`);

    const processedTokens = [];
    for (const pair of recentBasePairs.slice(0, 20)) {
      // Limit to 20 most recent
      try {
        const tokenData = await processDexScreenerPair(pair, "recent-pair");
        if (tokenData) {
          processedTokens.push(tokenData);
        }
      } catch (error) {
        console.warn(`⚠️ Error processing pair:`, error);
      }
    }

    return processedTokens;
  } catch (error) {
    console.warn("⚠️ Error fetching DexScreener latest pairs:", error);
    return [];
  }
}

async function scanDexScreenerLatestProfiles() {
  try {
    console.log("🔍 Fetching latest token profiles from DexScreener...");

    const response = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": "RatioDEX/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ DexScreener profiles API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data)) {
      console.warn("⚠️ Invalid DexScreener profiles response");
      return [];
    }

    // Filter for Base mainnet tokens
    const baseProfiles = data.filter((profile) => {
      return profile.chainId === "base" && profile.tokenAddress && !knownTokenProfiles.has(profile.tokenAddress);
    });

    console.log(`📊 Found ${baseProfiles.length} new Base token profiles`);

    const processedTokens = [];
    for (const profile of baseProfiles) {
      try {
        knownTokenProfiles.add(profile.tokenAddress);

        // Get token pairs data for this token
        const tokenPairs = await getDexScreenerTokenPairs(profile.tokenAddress);
        if (tokenPairs && tokenPairs.length > 0) {
          const bestPair = tokenPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          const tokenData = await processDexScreenerPair(bestPair, "new-profile");
          if (tokenData) {
            processedTokens.push(tokenData);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error processing profile:`, error);
      }
    }

    return processedTokens;
  } catch (error) {
    console.warn("⚠️ Error fetching DexScreener profiles:", error);
    return [];
  }
}

async function scanDexScreenerLatestBoosts() {
  try {
    console.log("🔍 Fetching latest boosted tokens from DexScreener...");

    const response = await fetch("https://api.dexscreener.com/token-boosts/latest/v1", {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": "RatioDEX/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ DexScreener boosts API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data)) {
      console.warn("⚠️ Invalid DexScreener boosts response");
      return [];
    }

    // Filter for Base mainnet boosts
    const baseBoosts = data.filter((boost) => {
      return boost.chainId === "base" && boost.tokenAddress && !knownBoostedTokens.has(boost.tokenAddress);
    });

    console.log(`🚀 Found ${baseBoosts.length} new Base boosted tokens`);

    const processedTokens = [];
    for (const boost of baseBoosts) {
      try {
        knownBoostedTokens.add(boost.tokenAddress);
        boostedTokens.set(boost.tokenAddress, {
          ...boost,
          discoveredAt: Date.now(),
        });

        // Get token pairs data for this boosted token
        const tokenPairs = await getDexScreenerTokenPairs(boost.tokenAddress);
        if (tokenPairs && tokenPairs.length > 0) {
          const bestPair = tokenPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          const tokenData = await processDexScreenerPair(bestPair, "boosted");
          if (tokenData) {
            tokenData.isBoosted = true
            tokenData.boostDetails = boost
            processedTokens.push(tokenData)
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error processing boost:`, error);
      }
    }

    return processedTokens;
  } catch (error) {
    console.warn("⚠️ Error fetching DexScreener boosts:", error);
    return [];
  }
}

async function processDexScreenerPair(pair, type) {
  try {
    if (!pair || !pair.baseToken || !pair.baseToken.address) {
      return null;
    }

    const tokenAddress = pair.baseToken.address;
    const tokenName = pair.baseToken.name || "Unknown Token";
    const tokenSymbol = pair.baseToken.symbol || "UNKNOWN";

    // Check if we already have this token
    if (newTokens.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase())) {
      return null;
    }

    const pairCreatedAt = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : new Date();
    const ageInDays = (Date.now() - pairCreatedAt.getTime()) / (1000 * 60 * 60 * 24);

    const tokenData = {
      name: tokenName,
      symbol: tokenSymbol,
      address: tokenAddress,
      totalSupply: 0,
      createdAt: pairCreatedAt,
      ageInDays: ageInDays,
      marketCap: pair.marketCap || 0,
      liquidity: pair.liquidity?.usd || 0,
      volume24h: pair.volume?.h24 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      price: Number.parseFloat(pair.priceUsd) || 0,
      liquidityLocked: checkLiquidityLocked(pair),
      isTrading: (pair.volume?.h24 || 0) > 0,
      dexUrl: pair.url || `https://dexscreener.com/base/${tokenAddress}`,
      discoveredOn: `DexScreener ${type === "boosted" ? "(Boosted)" : type === "new-profile" ? "(New Profile)" : "(Recent Pair)"}`,
      isBoosted: type === "boosted",
      boostDetails: type === "boosted" ? pair : null,
    };

    console.log(
      `✅ Processed DexScreener token: ${tokenSymbol} - Age: ${ageInDays.toFixed(1)}d, Liquidity: $${tokenData.liquidity}`,
    );

    return tokenData;
  } catch (error) {
    console.error("❌ Error processing DexScreener pair:", error);
    return null;
  }
}

async function getDexScreenerTokenPairs(tokenAddress) {
  try {
    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 300));

    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": "RatioDEX/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ DexScreener token pairs API error for ${tokenAddress}: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !data.pairs || !Array.isArray(data.pairs)) {
      console.warn(`⚠️ No pairs data for token ${tokenAddress}`);
      return [];
    }

    // Filter for Base pairs only
    const basePairs = data.pairs.filter((pair) => pair.chainId === "base");

    console.log(`📊 Found ${basePairs.length} Base pairs for token ${tokenAddress}`);

    return basePairs;
  } catch (error) {
    console.warn(`⚠️ Error fetching token pairs for ${tokenAddress}:`, error);
    return [];
  }
}

async function getTokenDetailsFromContract(address) {
  try {
    const [name, symbol] = await Promise.all([getTokenName(address), getTokenSymbol(address)]);
    return { name, symbol };
  } catch (error) {
    return { name: null, symbol: null };
  }
}

function isStablecoin(address) {
  const stablecoins = [
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // USDT
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
    "0x4200000000000000000000000000000000000006", // WETH
  ];
  return stablecoins.includes(address.toLowerCase());
}

async function getCurrentBlockNumber() {
  try {
    // First try Tatum MCP
    const block = await tatumService.getCurrentBlock('base');
    return block.number;
  } catch (error) {
    console.warn("Tatum MCP failed to get block number, using RPC fallback");
    
    // Fallback to RPC
    const response = await fetch(CONFIG.BASE_RPC, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.TATUM_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();
    return Number.parseInt(data.result, 16);
  }
}

async function getDexScreenerData(tokenAddress) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const response = await fetch(`${CONFIG.DEXSCREENER_API}/tokens/${tokenAddress}`);

    if (!response.ok) {
      console.warn(`⚠️ DexScreener API error for ${tokenAddress}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      console.log(`⚠️ No pairs found for token ${tokenAddress}`);
      return null;
    }

    const basePairs = data.pairs.filter(
      (pair) =>
        pair.chainId === "base" &&
        pair.liquidity &&
        pair.liquidity.usd > 0 &&
        pair.baseToken &&
        pair.baseToken.address.toLowerCase() === tokenAddress.toLowerCase(),
    );

    if (basePairs.length === 0) {
      console.log(`⚠️ No Base pairs found for token ${tokenAddress}`);
      return null;
    }

    const bestPair = basePairs.sort((a, b) => b.liquidity.usd - a.liquidity.usd)[0];

    const result = {
      marketCap: bestPair.marketCap || 0,
      liquidity: bestPair.liquidity?.usd || 0,
      volume24h: bestPair.volume?.h24 || 0,
      priceChange24h: bestPair.priceChange?.h24 || 0,
      price: Number.parseFloat(bestPair.priceUsd) || 0,
      liquidityLocked: checkLiquidityLocked(bestPair),
      isTrading: (bestPair.volume?.h24 || 0) > 0,
      dexUrl: bestPair.url,
    };

    console.log(`📊 DexScreener data for ${tokenAddress}:`, {
      liquidity: result.liquidity,
      volume24h: result.volume24h,
      isTrading: result.isTrading,
    });

    return result;
  } catch (error) {
    console.warn(`⚠️ Error fetching DexScreener data for ${tokenAddress}:`, error);
    return null;
  }
}

function checkLiquidityLocked(pair) {
  if (!pair.liquidity || !pair.liquidity.usd) return false;

  const liquidityRatio = pair.liquidity.usd / (pair.marketCap || 1);
  const hasGoodVolume = (pair.volume?.h24 || 0) > 1000;
  const hasReasonableLiquidity = pair.liquidity.usd > CONFIG.MIN_LIQUIDITY;

  return hasReasonableLiquidity && (liquidityRatio > 0.1 || hasGoodVolume);
}

function meetsTokenCriteria(token) {
  return isValidToken(token);
}

// WALLET MONITORING SYSTEM
function addWallet() {
  const address = elements.walletInput.value.trim();

  if (!address) {
    showNotification("Error", "Please enter a wallet address", "warning");
    return;
  }

  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    showNotification("Error", "Invalid wallet address format", "warning");
    return;
  }

  if (walletAddresses.includes(address)) {
    showNotification("Error", "Wallet already added", "warning");
    return;
  }

  walletAddresses.push(address);
  walletTokensMap.set(address, []);
  saveWalletsToStorage();
  updateWalletList();
  elements.walletInput.value = "";

  activeWalletIndex = walletAddresses.length - 1;
  updateActiveWalletDisplay();

  showNotification("Success", `Wallet added: ${address.slice(0, 6)}...${address.slice(-4)}`, "success");

  // Send Telegram notification for new wallet
  sendTelegramMessage(
    "💼 New Wallet Added",
    `Wallet successfully added to portfolio tracking:

📍 Address: ${address.slice(0, 10)}...${address.slice(-6)}
🔍 Now monitoring for token changes and profit opportunities
📊 You'll receive alerts when tokens in this wallet hit your profit threshold

Total wallets tracked: ${walletAddresses.length}`,
    "wallet",
  );

  // Start monitoring the new wallet
  monitorWallet(address);
}

function removeWallet(address) {
  const index = walletAddresses.indexOf(address);
  if (index === -1) return;

  walletAddresses.splice(index, 1);
  walletTokensMap.delete(address);

  if (activeWalletIndex >= walletAddresses.length) {
    activeWalletIndex = Math.max(0, walletAddresses.length - 1);
  }

  saveWalletsToStorage();
  updateWalletList();
  updateActiveWalletDisplay();
  updateWalletTokensDisplay();

  sendTelegramMessage(
    "💼 Wallet Removed",
    `Wallet removed from portfolio tracking:
📍 Address: ${address.slice(0, 6)}...${address.slice(-4)}`,
    "wallet",
  );
}

function switchToWallet(index) {
  if (index >= 0 && index < walletAddresses.length) {
    activeWalletIndex = index;
    updateActiveWalletDisplay();
    updateWalletTokensDisplay();

    const address = walletAddresses[index];
    // Only show local notification, don't send to Telegram
    showLocalNotification("Switched", `Now viewing: ${address.slice(0, 6)}...${address.slice(-4)}`, "info");
  }
}

function updateWalletList() {
  const walletList = elements.walletList;

  if (walletAddresses.length === 0) {
    walletList.innerHTML = "";
    return;
  }

  walletList.innerHTML = walletAddresses
    .map(
      (address, index) => `
      <div class="wallet-item ${index === activeWalletIndex ? "active" : ""}" onclick="switchToWallet(${index})">
        <div class="wallet-info">
          <span class="wallet-address">${address.slice(0, 6)}...${address.slice(-4)}</span>
          <span class="wallet-tokens-count">${(walletTokensMap.get(address) || []).length} tokens</span>
        </div>
        <button class="remove-wallet" onclick="event.stopPropagation(); removeWallet('${address}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `,
    )
    .join("");
}

function updateActiveWalletDisplay() {
  if (walletAddresses.length === 0) return;

  const activeAddress = walletAddresses[activeWalletIndex];
  const activeTokens = walletTokensMap.get(activeAddress) || [];

  const walletHeader = document.querySelector(".wallet-input-card h3");
  if (walletHeader) {
    walletHeader.innerHTML = `
      <i class="fas fa-wallet"></i>
      Wallet Tracker
      ${activeAddress ? `- Active: ${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : ""}
    `;
  }
}

async function startWalletMonitoring() {
  if (walletAddresses.length === 0) return;

  console.log(`👁️ Starting wallet monitoring for ${walletAddresses.length} wallets`);

  for (const address of walletAddresses) {
    await monitorWallet(address);
  }

  walletInterval = setInterval(async () => {
    for (const address of walletAddresses) {
      await monitorWallet(address);
    }
  }, CONFIG.WALLET_CHECK_INTERVAL);
}

// Enhanced wallet monitoring with Tatum MCP
async function monitorWallet(address) {
  try {
    console.log(`👁️ Monitoring wallet: ${address}`);

    // Use Tatum MCP first, fallback to existing method
    let tokens = [];
    try {
      tokens = await getWalletTokensWithTatum(address);
      console.log(`✅ Tatum MCP found ${tokens.length} tokens for wallet ${address}`);
    } catch (tatumError) {
      console.warn(`Tatum MCP failed for wallet ${address}, using fallback:`, tatumError);
      tokens = await getWalletTokens(address);
    }

    walletTokensMap.set(
      address,
      tokens.map((token) => ({
        ...token,
        walletAddress: address,
        initialPrice: token.initialPrice || token.price,
        purchaseTime: token.purchaseTime || Date.now(),
      })),
    );

    for (const token of tokens) {
      checkProfitAlert(token, address);
    }

    if (walletAddresses[activeWalletIndex] === address) {
      updateWalletTokensDisplay();
    }

    updateWalletList();
  } catch (error) {
    console.error(`❌ Error monitoring wallet ${address}:`, error);
  }
}

// Enhanced wallet token fetching with Tatum MCP priority
async function getWalletTokens(address) {
  try {
    console.log(`📊 Getting tokens for wallet: ${address}`);
    
    const ethBalance = await getETHBalance(address);
    console.log(`💰 ETH Balance: ${ethBalance} ETH`);

    const tokenBalances = await getTokenBalancesFromBlockscout(address);

    if (tokenBalances.length === 0) {
      console.log(`⚠️ No tokens found for wallet ${address}`);
      return [];
    }

    console.log(`🎯 Found ${tokenBalances.length} tokens in wallet`);

    const walletTokens = [];
    for (const tokenBalance of tokenBalances) {
      try {
        if (tokenBalance.balance <= 0) continue;

        const dexData = await getDexScreenerData(tokenBalance.address);

        if (!dexData || !dexData.isTrading || dexData.liquidity < 100) {
          console.log(`⚠️ Skipping ${tokenBalance.symbol} - not actively trading`);
          continue;
        }

        const walletToken = {
          name: tokenBalance.name || "Unknown Token",
          symbol: tokenBalance.symbol || "UNKNOWN",
          address: tokenBalance.address,
          balance: tokenBalance.balance,
          price: dexData.price || 0,
          priceChange24h: dexData.priceChange24h || 0,
          marketCap: dexData.marketCap || 0,
          liquidity: dexData.liquidity || 0,
          volume24h: dexData.volume24h || 0,
          dexUrl: dexData.dexUrl,
          initialPrice: dexData.priceChange24h > 0 ? dexData.price * 0.8 : dexData.price * 1.2,
          purchaseTime: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
        };

        walletTokens.push(walletToken);
        console.log(`✅ Added wallet token: ${walletToken.symbol} (${tokenBalance.balance.toFixed(4)} tokens)`);
      } catch (error) {
        console.warn(`⚠️ Error processing wallet token:`, error);
      }
    }

    return walletTokens;
  } catch (error) {
    console.error(`❌ Error getting wallet tokens:`, error);
    return [];
  }
}

// Tatum MCP implementation for wallet tokens
async function getWalletTokensWithTatum(address) {
  try {
    console.log(`🔍 Scanning wallet ${address} with Tatum MCP...`);
    
    const tokens = [];
    
    // Get Base chain tokens
    try {
      const balance = await tatumService.getWalletBalance('base', address);
      const tokenBalances = await tatumService.getTokenBalances('base', address);
      
      // Process native balance
      if (balance && balance.balance > 0) {
        const nativeToken = {
          name: "Ethereum",
          symbol: "ETH",
          address: "0x0000000000000000000000000000000000000000",
          balance: balance.balance,
          price: await tatumService.getTokenPrice('base', '0x0000000000000000000000000000000000000000'),
          source: "Tatum MCP",
          chain: "base"
        };
        tokens.push(nativeToken);
      }
      
      // Process token balances
      for (const token of tokenBalances) {
        if (token.balance > 0) {
          try {
            const metadata = await tatumService.getTokenMetadata('base', token.contractAddress);
            const marketData = await getDexScreenerData(token.contractAddress);
            
            if (marketData && marketData.isTrading) {
              const walletToken = {
                name: metadata.name || "Unknown Token",
                symbol: metadata.symbol || "UNKNOWN",
                address: token.contractAddress,
                balance: token.balance,
                price: marketData.price || 0,
                priceChange24h: marketData.priceChange24h || 0,
                marketCap: marketData.marketCap || 0,
                liquidity: marketData.liquidity || 0,
                volume24h: marketData.volume24h || 0,
                dexUrl: marketData.dexUrl,
                initialPrice: marketData.price * (Math.random() * 0.4 + 0.8),
                purchaseTime: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
                source: "Tatum MCP",
                chain: "base"
              };
              
              tokens.push(walletToken);
              console.log(`✅ Processed wallet token: ${walletToken.symbol} (${walletToken.balance})`);
            }
          } catch (error) {
            console.warn(`Error processing token ${token.contractAddress}:`, error);
          }
        }
      }
    } catch (baseError) {
      console.warn("Error scanning Base chain:", baseError);
      throw baseError; // Re-throw to trigger fallback
    }
    
    return tokens;
  } catch (error) {
    console.error("❌ Tatum MCP wallet scan failed:", error);
    throw error; // Re-throw to trigger fallback
  }
}

async function getETHBalance(address) {
  try {
    // First try Tatum MCP
    const balance = await tatumService.getWalletBalance('base', address);
    return balance.balance;
  } catch (error) {
    console.warn("Tatum MCP failed to get ETH balance, using RPC fallback");
    
    // Fallback to RPC
    const response = await fetch("https://base.blockscout.com/api/eth-rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 0,
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    const balanceWei = Number.parseInt(data.result, 16);
    const balanceETH = balanceWei / Math.pow(10, 18);

    return balanceETH;
  }
}

async function getTokenBalancesFromBlockscout(address) {
  try {
    let response = await fetch(`https://base.blockscout.com/api/v2/addresses/${address}/tokens?type=ERC-20`);

    if (!response.ok) {
      console.log("⚠️ V2 API failed, trying V1 API...");
      response = await fetch(`https://base.blockscout.com/api?module=account&action=tokenlist&address=${address}`);
    }

    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.items) {
      return data.items.map((item) => ({
        address: item.token.address,
        name: item.token.name,
        symbol: item.token.symbol,
        decimals: item.token.decimals || 18,
        balance: Number.parseFloat(item.value) / Math.pow(10, item.token.decimals || 18),
      }));
    }

    if (data.result && Array.isArray(data.result)) {
      return data.result.map((item) => ({
        address: item.contractAddress,
        name: item.name,
        symbol: item.symbol,
        decimals: Number.parseInt(item.decimals) || 18,
        balance: Number.parseFloat(item.balance) / Math.pow(10, Number.parseInt(item.decimals) || 18),
      }));
    }

    console.log("⚠️ Standard APIs failed, trying manual token discovery...");
    return await discoverWalletTokensManually(address);
  } catch (error) {
    console.error("❌ Error getting token balances from Blockscout:", error);

    try {
      return await discoverWalletTokensManually(address);
    } catch (fallbackError) {
      console.error("❌ Manual discovery also failed:", fallbackError);
      return [];
    }
  }
}

async function discoverWalletTokensManually(address) {
  try {
    console.log("🔍 Attempting manual token discovery...");

    const popularBaseTokens = [
      {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
      },
      {
        address: "0x4200000000000000000000000000000000000006",
        symbol: "WETH",
        name: "Wrapped Ether",
        decimals: 18,
      },
      {
        address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        symbol: "USDbC",
        name: "USD Base Coin",
        decimals: 6,
      },
      {
        address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
        symbol: "DAI",
        name: "Dai Stablecoin",
        decimals: 18,
      },
    ];

    const tokenBalances = [];

    for (const token of popularBaseTokens) {
      try {
        const balance = await getTokenBalance(address, token.address, token.decimals);
        if (balance > 0) {
          tokenBalances.push({
            address: token.address,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            balance: balance,
          });
          console.log(`✅ Found ${token.symbol}: ${balance}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error checking ${token.symbol} balance:`, error);
      }
    }

    return tokenBalances;
  } catch (error) {
    console.error("❌ Manual token discovery failed:", error);
    return [];
  }
}

async function getTokenBalance(walletAddress, tokenAddress, decimals = 18) {
  try {
    // First try Tatum MCP
    const balances = await tatumService.getTokenBalances('base', walletAddress);
    const tokenBalance = balances.find(b => b.contractAddress.toLowerCase() === tokenAddress.toLowerCase());
    
    if (tokenBalance) {
      return tokenBalance.balance;
    }
    
    // Fallback to RPC
    const balanceOfSignature = "0x70a08231";
    const paddedAddress = walletAddress.slice(2).padStart(64, "0");
    const data = balanceOfSignature + paddedAddress;

    const response = await fetch("https://base.blockscout.com/api/eth-rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: tokenAddress,
            data: data,
          },
          "latest",
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }

    if (!result.result || result.result === "0x") {
      return 0;
    }

    const balanceWei = Number.parseInt(result.result, 16);
    const balance = balanceWei / Math.pow(10, decimals);

    return balance;
  } catch (error) {
    console.warn(`⚠️ Error getting token balance:`, error);
    return 0;
  }
}

function updateWalletTokensDisplay() {
  if (walletAddresses.length === 0) {
    elements.walletTokensGrid.style.display = "none";
    elements.walletEmptyState.style.display = "block";
    return;
  }

  const activeAddress = walletAddresses[activeWalletIndex];
  const activeWalletTokens = walletTokensMap.get(activeAddress) || [];

  if (activeWalletTokens.length === 0) {
    elements.walletTokensGrid.style.display = "none";
    elements.walletEmptyState.style.display = "block";
    return;
  }

  elements.walletTokensGrid.style.display = "grid";
  elements.walletEmptyState.style.display = "none";

  const sortedTokens = [...activeWalletTokens].sort((a, b) => {
    const profitA = a.initialPrice ? ((a.price - a.initialPrice) / a.initialPrice) * 100 : 0;
    const profitB = b.initialPrice ? ((b.price - b.initialPrice) / b.initialPrice) * 100 : 0;
    return profitB - profitA;
  });

  elements.walletTokensGrid.innerHTML = sortedTokens
    .map((token) => {
      const profitPercent = token.initialPrice ? ((token.price - token.initialPrice) / token.initialPrice) * 100 : 0;
      const profitAmount = token.initialPrice ? (token.price - token.initialPrice) * token.balance : 0;
      const isProfitable = profitPercent >= CONFIG.PROFIT_THRESHOLD;

      return createWalletTokenCard(token, profitPercent, profitAmount, isProfitable);
    })
    .join("");

  elements.walletTokensCount.textContent = activeWalletTokens.length;

  // Only show this notification once when wallet is first loaded, not repeatedly
  const walletLoadedKey = `wallet-loaded-${activeAddress}`;
  if (activeWalletTokens.length > 0 && !sentNotifications.has(walletLoadedKey)) {
    sentNotifications.add(walletLoadedKey);
    showLocalNotification(
      "✅ Wallet Loaded",
      `Found ${activeWalletTokens.length} trading tokens in active wallet`,
      "success",
    );

    // Remove from sent notifications after 1 hour so it can show again if wallet is reloaded
    setTimeout(() => {
      sentNotifications.delete(walletLoadedKey);
    }, 3600000);
  }
}

function checkProfitAlert(token, walletAddress) {
  if (!token.initialPrice || token.initialPrice === 0) return;

  const profitPercent = ((token.price - token.initialPrice) / token.initialPrice) * 100;

  // Use the user's configured profit threshold
  if (profitPercent >= CONFIG.PROFIT_THRESHOLD) {
    const profitAmount = (token.price - token.initialPrice) * token.balance;

    // Send Telegram profit alert
    sendTelegramMessage(
      "🚀 PROFIT ALERT!",
      `${token.symbol} has reached your profit threshold!

📈 Current Profit: +${profitPercent.toFixed(1)}% 
💰 Profit Amount: $${profitAmount.toFixed(2)}
📊 Current Price: $${token.price.toFixed(6)}
💼 Your Balance: ${token.balance.toFixed(4)} ${token.symbol}
📍 Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}

🎯 Your profit threshold: ${CONFIG.PROFIT_THRESHOLD}%
💡 Consider taking profits now!`,
      "profit",
    );

    // Show local notification
    showLocalNotification(
      "🚀 PROFIT ALERT!",
      `${token.symbol} is up ${profitPercent.toFixed(1)}%! Profit: $${profitAmount.toFixed(2)}`,
      "profit",
      [
        {
          text: "View Chart",
          action: () => openTokenModal(token),
        },
        {
          text: "Dismiss",
          action: () => {},
        },
      ],
    );

    requestPushNotification(token, profitPercent);
  }
}

function requestPushNotification(token, profitPercent) {
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification("🚀 Token Profit Alert!", {
        body: `${token.symbol} is up ${profitPercent.toFixed(1)}%! Consider selling.`,
        icon: "/favicon.ico",
        tag: token.address,
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification("🚀 Token Profit Alert!", {
            body: `${token.symbol} is up ${profitPercent.toFixed(1)}%! Consider selling.`,
            icon: "/favicon.ico",
            tag: token.address,
          });
        }
      });
    }
  }
}

function createWalletTokenCard(token, profitPercent, profitAmount, isProfitable) {
  const profitClass = profitPercent >= 0 ? "positive" : "negative";
  const profitIcon = profitPercent >= 0 ? "↗" : "↘";

  return `
    <div class="token-card ${isProfitable ? "profit-alert" : ""}" onclick="openTokenModal(${JSON.stringify(token).replace(/"/g, "&quot;")})">
      <div class="token-header">
        <div class="token-info">
          <h3>${token.name}</h3>
          <div class="token-symbol">${token.symbol}</div>
        </div>
        ${isProfitable ? '<div class="profit-badge">🚀 SELL NOW!</div>' : ""}
      </div>

      <div class="token-address">${token.address}</div>
      ${token.chain ? `<div class="token-chain">🌐 ${token.chain.toUpperCase()}</div>` : ''}

      <div class="token-metrics">
        <div class="metric">
          <div class="metric-label">Balance</div>
          <div class="metric-value">${formatNumber(token.balance)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Current Price</div>
          <div class="metric-value">$${token.price.toFixed(6)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Profit/Loss</div>
          <div class="metric-value ${profitClass}">
            ${profitIcon} ${Math.abs(profitPercent).toFixed(1)}%
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">P&L Amount</div>
          <div class="metric-value ${profitClass}">
            $${Math.abs(profitAmount).toFixed(2)}
          </div>
        </div>
      </div>

      <div class="token-footer">
        <div class="liquidity-status">
          <div class="status-dot"></div>
          <span>In Wallet</span>
        </div>
        <button class="view-chart-btn">
          <i class="fas fa-chart-line"></i>
          View Chart
        </button>
      </div>
    </div>
  `;
}

// STORAGE FUNCTIONS
function saveWalletsToStorage() {
  localStorage.setItem("baseTokenTracker_wallets", JSON.stringify(walletAddresses));
}

function loadWalletsFromStorage() {
  const saved = localStorage.getItem("baseTokenTracker_wallets");
  if (saved) {
    walletAddresses = JSON.parse(saved);
    updateWalletList();
    if (walletAddresses.length > 0) {
      elements.walletEmptyState.style.display = "none";
    }
  }
}

// UI FUNCTIONS
function updateScanProgress(percent, status) {
  if (elements.scanProgress) {
    elements.scanProgress.style.width = `${percent}%`;
  }
  if (elements.scanStatus) {
    elements.scanStatus.textContent = status;
  }
}

function updateUI() {
  filteredTokens = filterTokensByCriteria(newTokens);

  if (filteredTokens.length === 0) {
    showEmptyState();
    return;
  }

  showTokenGrid();
  renderTokenCards();
  updateStats();
}

function filterTokensByCriteria(tokens) {
  return tokens.filter((token) => meetsTokenCriteria(token));
}

function renderTokenCards() {
  const tokenGrid = elements.tokenGrid;
  tokenGrid.innerHTML = "";

  filteredTokens.forEach((token) => {
    const tokenCard = createTokenCard(token);
    tokenGrid.appendChild(tokenCard);
  });
}

function createTokenCard(token) {
  const card = document.createElement("div");
  card.className = "token-card";
  if (token.isBoosted) {
    card.className += " boosted-token";
  }
  card.onclick = () => openTokenModal(token);

  const daysSinceCreation = Math.floor(token.ageInDays);
  const priceChangeClass = token.priceChange24h >= 0 ? "positive" : "negative";
  const priceChangeIcon = token.priceChange24h >= 0 ? "↗" : "↘";

  card.innerHTML = `
    <div class="token-header">
      <div class="token-info">
        <h3>${token.name}</h3>
        <div class="token-symbol">${token.symbol}</div>
        ${token.discoveredOn ? `<div class="discovered-on">Found on ${token.discoveredOn}</div>` : ""}
        ${token.isBoosted ? '<div class="boost-badge">🚀 BOOSTED</div>' : ""}
      </div>
      <div class="token-age">${daysSinceCreation}d ago</div>
    </div>

    <div class="token-address">${token.address}</div>
    ${token.chain ? `<div class="token-chain">🌐 ${token.chain.toUpperCase()}</div>` : ''}

    <div class="token-metrics">
      <div class="metric">
        <div class="metric-label">Market Cap</div>
        <div class="metric-value">$${formatNumber(token.marketCap)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Liquidity</div>
        <div class="metric-value">$${formatNumber(token.liquidity)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">24h Volume</div>
        <div class="metric-value">$${formatNumber(token.volume24h)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">24h Change</div>
        <div class="metric-value ${priceChangeClass}">
          ${priceChangeIcon} ${Math.abs(token.priceChange24h).toFixed(2)}%
        </div>
      </div>
    </div>

    <div class="token-footer">
      <div class="liquidity-status">
        <div class="status-dot"></div>
        <span>Liquidity Locked</span>
      </div>
      <button class="view-chart-btn">
        <i class="fas fa-chart-line"></i>
        View Chart
      </button>
    </div>
  `;

  return card;
}

function openTokenModal(token) {
  const modal = elements.tokenModal;

  document.getElementById("modalTokenName").textContent = `${token.name} (${token.symbol})`;
  document.getElementById("modalContractAddress").textContent = token.address;
  document.getElementById("modalMarketCap").textContent = `$${formatNumber(token.marketCap)}`;
  document.getElementById("modalLiquidity").textContent = `$${formatNumber(token.liquidity)}`;
  document.getElementById("modalTotalSupply").textContent = formatNumber(token.totalSupply);
  document.getElementById("modalVolume").textContent = `$${formatNumber(token.volume24h)}`;

  const chartIframe = document.getElementById("tokenChart");
  chartIframe.src = `https://dexscreener.com/base/${token.address}?embed=1&theme=dark`;

  modal.style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = elements.tokenModal;
  modal.style.display = "none";
  document.body.style.overflow = "auto";
  document.getElementById("tokenChart").src = "";
}

function handleSearch() {
  const query = elements.searchInput.value.toLowerCase().trim();
  const activeTab = document.querySelector(".tab-content.active").id;

  if (activeTab === "new-tokens") {
    if (!query) {
      filteredTokens = filterTokensByCriteria(newTokens);
    } else {
      filteredTokens = filterTokensByCriteria(newTokens).filter(
        (token) =>
          token.name.toLowerCase().includes(query) ||
          token.symbol.toLowerCase().includes(query) ||
          token.address.toLowerCase().includes(query),
      );
    }
    updateUI();
  } else {
    updateWalletTokensDisplay();
  }
}

function handleSort() {
  const sortBy = elements.sortBy.value;
  const activeTab = document.querySelector(".tab-content.active").id;

  if (activeTab === "new-tokens") {
    filteredTokens.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return b.createdAt.getTime() - a.createdAt.getTime();
        case "marketcap":
          return b.marketCap - a.marketCap;
        case "liquidity":
          return b.liquidity - a.liquidity;
        case "volume":
          return b.volume24h - a.volume24h;
        default:
          return 0;
      }
    });
    updateUI();
  }
}

function handleTimeFilter() {
  const timeFilter = elements.timeFilter.value;
  let filteredByTime = [...newTokens];

  if (timeFilter !== "all") {
    const timeThresholds = {
      "24h": 1,
      "7d": 7,
      "30d": 30,
    };

    const maxDays = timeThresholds[timeFilter];
    filteredByTime = newTokens.filter((token) => token.ageInDays <= maxDays);
  }

  const query = elements.searchInput.value.toLowerCase().trim();
  if (query) {
    filteredTokens = filterTokensByCriteria(filteredByTime).filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query),
    );
  } else {
    filteredTokens = filterTokensByCriteria(filteredByTime);
  }

  handleSort();
}

async function handleRefresh() {
  console.log("🔄 Manual refresh triggered");

  const refreshBtn = elements.refreshBtn;
  const icon = refreshBtn.querySelector("i");

  icon.style.animation = "spin 1s linear infinite";
  refreshBtn.disabled = true;

  try {
    const newCurrentBlock = await getCurrentBlockNumber();
    await scanRecentTokens();
    currentBlock = newCurrentBlock;

    for (const address of walletAddresses) {
      await monitorWallet(address);
    }

    sendTelegramMessage("🔄 Manual Refresh", "Scanner manually refreshed. All data updated successfully.", "system");
    console.log("✅ Manual refresh completed");
  } catch (error) {
    console.error("❌ Manual refresh failed:", error);
    sendTelegramMessage("❌ Refresh Failed", `Manual refresh failed: ${error.message}`, "error");
  } finally {
    setTimeout(() => {
      icon.style.animation = "";
      refreshBtn.disabled = false;
    }, 1000);
  }
}

function updateStats() {
  elements.totalTokens.textContent = filteredTokens.length;
  elements.lastUpdated.textContent = new Date().toLocaleTimeString();
}

// UI State Management
function showLoadingState() {
  elements.loadingState.style.display = "block";
  elements.errorState.style.display = "none";
  elements.tokenGrid.style.display = "none";
  elements.emptyState.style.display = "none";
}

function showErrorState() {
  elements.loadingState.style.display = "none";
  elements.errorState.style.display = "block";
  elements.tokenGrid.style.display = "none";
  elements.emptyState.style.display = "none";
}

function showTokenGrid() {
  elements.loadingState.style.display = "none";
  elements.errorState.style.display = "none";
  elements.tokenGrid.style.display = "grid";
  elements.emptyState.style.display = "none";
}

function showEmptyState() {
  elements.loadingState.style.display = "none";
  elements.errorState.style.display = "none";
  elements.tokenGrid.style.display = "none";
  elements.emptyState.style.display = "block";
}

// Utility Functions
function formatNumber(num) {
  if (num >= 1e9) {
    return (num / 1e9).toFixed(2) + "B";
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(2) + "M";
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(2) + "K";
  }
  return num.toLocaleString();
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Cleanup
window.addEventListener("beforeunload", () => {
  if (scannerInterval) {
    clearInterval(scannerInterval);
  }
  if (walletInterval) {
    clearInterval(walletInterval);
  }
});

// Error handling
window.addEventListener("error", (e) => {
  console.error("❌ Global error:", e.error);
  sendTelegramMessage("❌ System Error", `Global error occurred: ${e.error?.message || "Unknown error"}`, "error");
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("❌ Unhandled promise rejection:", e.reason);
  sendTelegramMessage(
    "❌ System Error",
    `Unhandled promise rejection: ${e.reason?.message || "Unknown error"}`,
    "error",
  );
});

// Request notification permission on load
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

// GeckoTerminal API integration
async function scanGeckoTerminalTokens() {
  try {
    console.log("🦎 Fetching recently updated tokens from GeckoTerminal...");

    const response = await fetch("https://api.geckoterminal.com/api/v2/tokens/info_recently_updated?network=base", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "RatioDEX/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ GeckoTerminal API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !data.data || !Array.isArray(data.data)) {
      console.warn("⚠️ Invalid GeckoTerminal response structure");
      return [];
    }

    console.log(`📊 GeckoTerminal returned ${data.data.length} recently updated tokens`);

    const processedTokens = [];
    // Process first 100 tokens instead of 50
    for (const tokenInfo of data.data.slice(0, 100)) {
      try {
        const tokenData = await processGeckoTerminalToken(tokenInfo);
        if (tokenData) {
          processedTokens.push(tokenData);
        }
      } catch (error) {
        console.warn(`⚠️ Error processing GeckoTerminal token:`, error);
      }
    }

    console.log(`✅ Processed ${processedTokens.length} tokens from GeckoTerminal (fetched 100 latest)`);
    return processedTokens;
  } catch (error) {
    console.warn("⚠️ Error fetching GeckoTerminal tokens:", error);
    return [];
  }
}

async function processGeckoTerminalToken(tokenInfo) {
  try {
    if (!tokenInfo || !tokenInfo.attributes || !tokenInfo.attributes.address) {
      return null;
    }

    const attrs = tokenInfo.attributes;
    const tokenAddress = attrs.address;

    // Check if we already have this token
    if (newTokens.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase())) {
      return null;
    }

    // Get additional data from DexScreener for market metrics
    const dexScreenerData = await getDexScreenerData(tokenAddress);

    const updatedAt = attrs.metadata_updated_at ? new Date(attrs.metadata_updated_at) : new Date();
    const ageInHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

    const tokenData = {
      name: attrs.name || "Unknown Token",
      symbol: attrs.symbol || "UNKNOWN",
      address: tokenAddress,
      totalSupply: 0,
      createdAt: updatedAt,
      ageInDays: ageInHours / 24,
      marketCap: dexScreenerData?.marketCap || 0,
      liquidity: dexScreenerData?.liquidity || 0,
      volume24h: dexScreenerData?.volume24h || 0,
      priceChange24h: dexScreenerData?.priceChange24h || 0,
      price: dexScreenerData?.price || 0,
      liquidityLocked: dexScreenerData?.liquidityLocked || false,
      isTrading: dexScreenerData?.isTrading || false,
      dexUrl: dexScreenerData?.dexUrl || `https://dexscreener.com/base/${tokenAddress}`,
      discoveredOn: "GeckoTerminal (Recently Updated)",
      geckoScore: attrs.gt_score || 0,
      categories: attrs.categories || [],
      description: attrs.description || "",
      imageUrl: attrs.image_url || "",
      websites: attrs.websites || [],
      twitterHandle: attrs.twitter_handle || "",
      telegramHandle: attrs.telegram_handle || "",
    };

    console.log(
      `✅ Processed GeckoTerminal token: ${tokenData.symbol} - Score: ${tokenData.geckoScore}, Updated: ${ageInHours.toFixed(1)}h ago`,
    );

    return tokenData;
  } catch (error) {
    console.error("❌ Error processing GeckoTerminal token:", error);
    return null;
  }
}

// Simplified token validation
function isValidToken(token) {
  // Basic validation - just check if it has required fields
  if (!token.address || !token.symbol || !token.name) {
    console.log(`❌ Token missing required fields`);
    return false;
  }

  // Skip obvious stablecoins
  if (isStablecoin(token.address)) {
    console.log(`❌ Token ${token.symbol} is a stablecoin`);
    return false;
  }

  console.log(`✅ Token ${token.symbol} is valid`);
  return true;
}

// Declare getTokenName and getTokenSymbol functions
async function getTokenName(address) {
  try {
    // First try Tatum MCP
    const metadata = await tatumService.getTokenMetadata('base', address);
    return metadata.name;
  } catch (error) {
    console.warn("Tatum MCP failed to get token name, using RPC fallback");
    
    // Fallback to RPC
    const response = await fetch(CONFIG.BASE_RPC, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.TATUM_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: address,
            data: "0x06fdde03", // Function signature for name()
          },
          "latest",
        ],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    if (!data.result || data.result === "0x") {
      return null;
    }

    const nameHex = data.result.slice(2);
    const name = hexToString(nameHex);
    return name;
  } catch (error) {
    console.warn(`⚠️ Error getting token name:`, error);
    return null;
  }
}

async function getTokenSymbol(address) {
  try {
    // First try Tatum MCP
    const metadata = await tatumService.getTokenMetadata('base', address);
    return metadata.symbol;
  } catch (error) {
    console.warn("Tatum MCP failed to get token symbol, using RPC fallback");
    
    // Fallback to RPC
    const response = await fetch(CONFIG.BASE_RPC, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.TATUM_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: address,
            data: "0x95d89b41", // Function signature for symbol()
          },
          "latest",
        ],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    if (!data.result || data.result === "0x") {
      return null;
    }

    const symbolHex = data.result.slice(2);
    const symbol = hexToString(symbolHex);
    return symbol;
  } catch (error) {
    console.warn(`⚠️ Error getting token symbol:`, error);
    return null;
  }
}

function hexToString(hex) {
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const hexValue = hex.substr(i, 2);
    const decimalValue = Number.parseInt(hexValue, 16);
    str += String.fromCharCode(decimalValue);
  }

  // Remove trailing null characters
  str = str.replace(/\0/g, "");

  return str;
}

// Declare processTokenFromDEX function
async function processTokenFromDEX(tokenData) {
  try {
    const { address, dex, blockNumber, transactionHash } = tokenData;

    // Get token details from contract
    const { name, symbol } = await getTokenDetailsFromContract(address);

    // Get DexScreener data
    const dexScreenerData = await getDexScreenerData(address);

    if (!dexScreenerData) {
      console.warn(`⚠️ No DexScreener data for ${address}`);
      return null;
    }

    // Get creation time from block
    const creationTime = await getBlockTimestamp(blockNumber);
    const createdAt = new Date(creationTime * 1000);
    const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    const processedToken = {
      name: name || "Unknown Token",
      symbol: symbol || "UNKNOWN",
      address: address,
      totalSupply: 0,
      createdAt: createdAt,
      ageInDays: ageInDays,
      marketCap: dexScreenerData.marketCap || 0,
      liquidity: dexScreenerData.liquidity || 0,
      volume24h: dexScreenerData.volume24h || 0,
      priceChange24h: dexScreenerData.priceChange24h || 0,
      price: dexScreenerData.price || 0,
      liquidityLocked: dexScreenerData.liquidityLocked,
      isTrading: dexScreenerData.isTrading,
      dexUrl: dexScreenerData.dexUrl,
      discoveredOn: dex || "Blockscout",
    };

    return processedToken;
  } catch (error) {
    console.error("❌ Error processing token from DEX:", error);
    return null;
  }
}

async function getBlockTimestamp(blockNumber) {
  try {
    // First try Tatum MCP
    const block = await tatumService.getCurrentBlock('base');
    return block.timestamp;
  } catch (error) {
    console.warn("Tatum MCP failed to get block timestamp, using RPC fallback");
    
    // Fallback to RPC
    const response = await fetch(CONFIG.BASE_RPC, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.TATUM_API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [`0x${blockNumber.toString(16)}`, false],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    if (!data.result || !data.result.timestamp) {
      return null;
    }

    return Number.parseInt(data.result.timestamp, 16);
  } catch (error) {
    console.warn(`⚠️ Error getting block timestamp:`, error);
    return null;
  }
}

// Make functions globally available
window.switchToWallet = switchToWallet;
window.removeWallet = removeWallet;
window.openTokenModal = openTokenModal;
window.closeModal = closeModal;
window.startTokenScanner = startTokenScanner;
window.testTelegramConnection = testTelegramConnection;

// Add CSS for chain indicator
const chainStyle = `
.token-chain {
  font-size: 11px;
  color: #00d4ff;
  background: rgba(0, 212, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
  display: inline-block;
}

.source-badge {
  font-size: 10px;
  color: #888;
  background: rgba(136, 136, 136, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

.source-tatum {
  color: #0066ff;
  background: rgba(0, 102, 255, 0.1);
}

.source-blockscout {
  color: #ff7700;
  background: rgba(255, 119, 0, 0.1);
}
`;

// Add the style to the document
const styleElement = document.createElement('style');
styleElement.textContent = chainStyle;
document.head.appendChild(styleElement)