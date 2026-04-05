const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const qr = require('qr-image');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('.'));

// File paths
const CONFIG_FILE = path.join(__dirname, 'config.json');
const RESPONSES_FILE = path.join(__dirname, 'responses.json');
const DEFAULT_CONFIG = path.join(__dirname, 'default-config.json');

// WebSocket clients
const clients = {
    admins: new Set(),   // Admin panel connections
    users: new Set()     // Main website connections
};

// Track admin stats
let adminStats = {
    yesCount: 0,
    noCount: 0,
    totalCount: 0,
    recentCount: 0
};

// Track response logging to prevent duplicates
const loggedResponses = new Set();

// Function to check if port is in use
function isPortInUse(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const tester = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .once('listening', () => {
                tester.once('close', () => resolve(false)).close();
            })
            .listen(port);
    });
}

// Read JSON file safely
async function readJsonFile(filePath, defaultValue = null) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (defaultValue !== null) {
            return defaultValue;
        }
        throw error;
    }
}

// Write JSON file safely
async function writeJsonFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error);
        return false;
    }
}

// Default configuration
const defaultConfig = {
    HER_NAME: "Hey Bibek 💌",
    BUILD_UP_MESSAGES: [
        "My heart beats a little faster when you're around...",
        "Every moment with you feels magical...",
        "You're the most beautiful person I know...",
        "I can't imagine my life without you...",
        "This is the most important question I'll ever ask..."
    ],
    TEASING_TEXTS: [
        "Are you sure? 🥺",
        "My heart is breaking... 💔",
        "Try again? 👉👈",
        "You're making me nervous! 😅",
        "Please? 🥹",
        "Just think about it... 💭",
        "I'll keep asking! 💪"
    ],
    FINAL_MESSAGES: [
        "You just made my entire world brighter.",
        "This is the beginning of something beautiful.",
        "My heart is overflowing with happiness.",
        "I promise to cherish every moment with you.",
        "You're my dream come true. 💫"
    ],
    QUESTION: "Will you be mine? 💖",
    GIFS: {
        MAIN: ["gif1.gif", "gif3c.gif", "gif3b.gif", "gif5.gif"],
        CELEBRATION: ["gif2.gif", "gif7.gif"]
    },
    SOUNDS: {
        enabled: true,
        volumes: {
            click: 0.3,
            heart: 0.2,
            type: 0.1,
            celebrate: 0.4,
            tease: 0.3,
            no: 0.4,
            yes: 0.4,
            hover: 0.1
        }
    },
    musicUrl: "music.mp3"
};

// Ensure files exist with proper structure
async function ensureFiles() {
    try {
        console.log('📁 Initializing files...');
        
        // Small delay in development to avoid nodemon restart loops
        if (isDev) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Create/check default config file
        try {
            await fs.access(DEFAULT_CONFIG);
            console.log('✅ Default config file exists');
        } catch {
            await writeJsonFile(DEFAULT_CONFIG, defaultConfig);
            console.log('📝 Created default config file');
        }

        // Create/check config file
        try {
            await fs.access(CONFIG_FILE);
            console.log('✅ Config file exists');
        } catch {
            await writeJsonFile(CONFIG_FILE, defaultConfig);
            console.log('📝 Created config file from default');
        }

        // Create/check responses file
        try {
            await fs.access(RESPONSES_FILE);
            console.log('✅ Responses file exists');
        } catch {
            await writeJsonFile(RESPONSES_FILE, []);
            console.log('📝 Created empty responses file');
        }
        
        // Initialize stats
        const responses = await readJsonFile(RESPONSES_FILE, []);
        await updateStatsFromResponses(responses);
        
        console.log('✨ Files initialized successfully\n');
        
    } catch (error) {
        console.error('❌ Error initializing files:', error);
        throw error;
    }
}

// Update stats from responses
async function updateStatsFromResponses(responses) {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        
        const yesCount = responses.filter(r => r.response === 'yes').length;
        const noCount = responses.filter(r => r.response === 'no').length;
        const recentCount = responses.filter(r => {
            try {
                return new Date(r.timestamp) > oneDayAgo;
            } catch {
                return false;
            }
        }).length;
        
        adminStats = {
            yesCount,
            noCount,
            totalCount: responses.length,
            recentCount
        };
        
        console.log('📊 Stats updated:', adminStats);
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Generate unique response ID
function generateResponseId(responseData) {
    return `${responseData.response}_${responseData.timestamp}_${responseData.noClickCount}_${Math.random().toString(36).substr(2, 9)}`;
}

// Log response with duplicate prevention
async function logResponse(responseData) {
    const responseId = generateResponseId(responseData);
    
    // Check if already logged (prevents duplicates)
    if (loggedResponses.has(responseId)) {
        console.log('⚠️  Duplicate response ignored:', responseId);
        return false;
    }
    
    loggedResponses.add(responseId);
    
    try {
        // Load existing responses
        const responses = await readJsonFile(RESPONSES_FILE, []);
        
        // Add new response
        responses.unshift(responseData);
        
        // Save to file
        const saved = await writeJsonFile(RESPONSES_FILE, responses);
        
        if (saved) {
            // Update stats
            await updateStatsFromResponses(responses);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error logging response:', error);
        loggedResponses.delete(responseId);
        return false;
    }
}

// WebSocket connection
wss.on('connection', (ws, req) => {
    const url = req.url;
    let clientType = 'users';
    
    // Determine client type based on URL
    if (url === '/admin-ws') {
        clientType = 'admins';
        console.log('👑 Admin WebSocket connection established');
    } else {
        console.log('👤 User WebSocket connection established');
    }
    
    clients[clientType].add(ws);
    
    console.log(`🔌 New ${clientType.slice(0, -1)} connected. Total ${clientType}:`, clients[clientType].size);
    
    // Send initial data based on client type
    (async () => {
        try {
            if (clientType === 'admins') {
                // Send initial stats to admin
                ws.send(JSON.stringify({
                    type: 'initial_stats',
                    stats: adminStats
                }));
                
                // Send current config
                const config = await readJsonFile(CONFIG_FILE, defaultConfig);
                ws.send(JSON.stringify({
                    type: 'config_updated',
                    config: config
                }));
                
                // Send recent responses
                const responses = await readJsonFile(RESPONSES_FILE, []);
                const recentResponses = responses.slice(0, 10).reverse();
                
                recentResponses.forEach(response => {
                    ws.send(JSON.stringify({
                        type: 'new_response',
                        response: response,
                        stats: adminStats
                    }));
                });
                
                console.log('📤 Sent initial data to admin');
            } else {
                // Send current config to user
                const config = await readJsonFile(CONFIG_FILE, defaultConfig);
                ws.send(JSON.stringify({
                    type: 'config_updated',
                    config: config
                }));
                console.log('📤 Sent config to user');
            }
        } catch (error) {
            console.error('❌ Error sending initial data:', error);
        }
    })();
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            await handleWebSocketMessage(ws, data, clientType);
        } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error);
        }
    });
    
    ws.on('close', () => {
        clients[clientType].delete(ws);
        console.log(`📴 ${clientType.slice(0, -1)} disconnected. Total ${clientType}:`, clients[clientType].size);
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
    
    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 30000);
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data, clientType) {
    try {
        console.log(`📨 Received ${data.type} from ${clientType}`);
        
        switch (data.type) {
            case 'admin_connected':
                // Acknowledge admin connection
                ws.send(JSON.stringify({
                    type: 'admin_connected',
                    message: 'Admin panel connected successfully'
                }));
                break;
                
            case 'config_update':
                // Save config and broadcast to all clients
                const config = data.config;
                const saved = await writeJsonFile(CONFIG_FILE, config);
                
                if (saved) {
                    // Broadcast to all admins
                    broadcastToAdmins({
                        type: 'config_updated',
                        config: config
                    });
                    
                    // Broadcast to all users
                    broadcastToUsers({
                        type: 'config_updated',
                        config: config
                    });
                    
                    ws.send(JSON.stringify({
                        type: 'config_saved',
                        success: true
                    }));
                    
                    console.log('✅ Configuration saved and broadcasted');
                } else {
                    ws.send(JSON.stringify({
                        type: 'config_saved',
                        success: false,
                        error: 'Failed to save config'
                    }));
                }
                break;
                
            case 'user_response':
                // Handle response from user
                const responseData = data.data || data;
                
                // Add required fields
                responseData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                responseData.timestamp = new Date().toISOString();
                
                if (!responseData.noClickCount) responseData.noClickCount = 0;
                if (!responseData.userAgent) responseData.userAgent = 'Unknown';
                if (!responseData.screenSize) responseData.screenSize = 'N/A';
                
                // Log response with duplicate prevention
                const logged = await logResponse(responseData);
                
                if (logged) {
                    // Broadcast to all admins
                    broadcastToAdmins({
                        type: 'new_response',
                        response: responseData,
                        stats: adminStats
                    });
                    console.log(`📝 Logged ${responseData.response} response`);
                }
                
                // Acknowledge to user
                if (clientType === 'users') {
                    ws.send(JSON.stringify({
                        type: 'response_logged',
                        success: logged
                    }));
                }
                break;
                
            case 'clear_responses':
                // Clear all responses
                await writeJsonFile(RESPONSES_FILE, []);
                loggedResponses.clear(); // Clear duplicate tracking
                await updateStatsFromResponses([]);
                
                // Broadcast to all admins
                broadcastToAdmins({
                    type: 'responses_cleared',
                    stats: adminStats
                });
                
                ws.send(JSON.stringify({
                    type: 'responses_cleared',
                    success: true
                }));
                
                console.log('🧹 All responses cleared');
                break;
                
            case 'reset_config':
                // Reset config to defaults
                const defaultConfigData = await readJsonFile(DEFAULT_CONFIG, defaultConfig);
                await writeJsonFile(CONFIG_FILE, defaultConfigData);
                
                // Broadcast to all clients
                broadcast({
                    type: 'config_updated',
                    config: defaultConfigData
                });
                
                ws.send(JSON.stringify({
                    type: 'config_reset',
                    success: true,
                    config: defaultConfigData
                }));
                
                console.log('🔄 Configuration reset to defaults');
                break;
                
            case 'get_responses':
                // Send all responses to admin
                const allResponses = await readJsonFile(RESPONSES_FILE, []);
                
                ws.send(JSON.stringify({
                    type: 'all_responses',
                    responses: allResponses,
                    stats: adminStats
                }));
                break;
                
            case 'ping':
                // Respond to ping
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    } catch (error) {
        console.error('❌ Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: error.message
        }));
    }
}

// Broadcast to all admin clients
function broadcastToAdmins(data) {
    const message = JSON.stringify(data);
    let sentCount = 0;
    clients.admins.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sentCount++;
        }
    });
    if (sentCount > 0) {
        console.log(`📤 Broadcast to ${sentCount} admin(s)`);
    }
}

// Broadcast to all user clients
function broadcastToUsers(data) {
    const message = JSON.stringify(data);
    let sentCount = 0;
    clients.users.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sentCount++;
        }
    });
    if (sentCount > 0) {
        console.log(`📤 Broadcast to ${sentCount} user(s)`);
    }
}

// Broadcast to all clients
function broadcast(data) {
    broadcastToAdmins(data);
    broadcastToUsers(data);
}

// API Routes

// Get current configuration
app.get('/api/config', async (req, res) => {
    try {
        const config = await readJsonFile(CONFIG_FILE, defaultConfig);
        res.json({ success: true, config });
    } catch (error) {
        console.error('❌ Error loading config:', error);
        res.status(500).json({ success: false, error: 'Failed to load config' });
    }
});

// Update configuration
app.post('/api/config', async (req, res) => {
    try {
        const config = req.body;
        const saved = await writeJsonFile(CONFIG_FILE, config);
        
        if (saved) {
            // Broadcast config update to all clients
            broadcast({ type: 'config_updated', config });
            res.json({ success: true, message: 'Configuration saved successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save config' });
        }
    } catch (error) {
        console.error('❌ Error saving config:', error);
        res.status(500).json({ success: false, error: 'Failed to save config' });
    }
});

// Reset configuration to defaults
app.post('/api/reset-config', async (req, res) => {
    try {
        const defaultConfigData = await readJsonFile(DEFAULT_CONFIG, defaultConfig);
        await writeJsonFile(CONFIG_FILE, defaultConfigData);
        
        // Broadcast config update to all clients
        broadcast({ type: 'config_updated', config: defaultConfigData });
        
        res.json({ success: true, config: defaultConfigData });
    } catch (error) {
        console.error('❌ Error resetting config:', error);
        res.status(500).json({ success: false, error: 'Failed to reset config' });
    }
});

// Log a response
app.post('/api/log-response', async (req, res) => {
    try {
        let responseData = req.body;
        
        // Add required fields
        responseData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        responseData.timestamp = new Date().toISOString();
        if (!responseData.noClickCount) responseData.noClickCount = 0;
        if (!responseData.userAgent) responseData.userAgent = req.get('User-Agent') || 'Unknown';
        if (!responseData.screenSize) responseData.screenSize = 'N/A';
        
        // Log response with duplicate prevention
        const logged = await logResponse(responseData);
        
        if (logged) {
            // Broadcast new response to all admin clients
            broadcastToAdmins({ 
                type: 'new_response', 
                response: responseData,
                stats: adminStats
            });
        }
        
        res.json({ success: logged, message: logged ? 'Response logged successfully' : 'Duplicate response ignored' });
    } catch (error) {
        console.error('❌ Error logging response:', error);
        res.status(500).json({ success: false, error: 'Failed to log response' });
    }
});

// Get all responses
app.get('/api/responses', async (req, res) => {
    try {
        const responses = await readJsonFile(RESPONSES_FILE, []);
        res.json({ success: true, responses });
    } catch (error) {
        console.error('❌ Error loading responses:', error);
        res.status(500).json({ success: false, error: 'Failed to load responses' });
    }
});

// Clear all responses
app.delete('/api/clear-responses', async (req, res) => {
    try {
        await writeJsonFile(RESPONSES_FILE, []);
        loggedResponses.clear(); // Clear duplicate tracking
        
        // Update stats
        await updateStatsFromResponses([]);
        
        // Broadcast clear event to all admins
        broadcastToAdmins({ 
            type: 'responses_cleared',
            stats: adminStats
        });
        
        res.json({ success: true, message: 'All responses cleared' });
    } catch (error) {
        console.error('❌ Error clearing responses:', error);
        res.status(500).json({ success: false, error: 'Failed to clear responses' });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        res.json({ success: true, stats: adminStats });
    } catch (error) {
        console.error('❌ Error loading stats:', error);
        res.status(500).json({ success: false, error: 'Failed to load stats' });
    }
});

// Export responses as CSV
app.get('/api/export-responses', async (req, res) => {
    try {
        const responses = await readJsonFile(RESPONSES_FILE, []);
        
        // Convert to CSV
        const headers = ['ID', 'Response', 'Timestamp', 'No Clicks', 'User Agent', 'Screen Size'];
        const rows = responses.map(item => [
            item.id,
            item.response,
            item.timestamp,
            item.noClickCount || 0,
            `"${(item.userAgent || '').replace(/"/g, '""')}"`,
            item.screenSize || ''
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.join(','))
            .join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=love_responses.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('❌ Error exporting responses:', error);
        res.status(500).json({ success: false, error: 'Failed to export responses' });
    }
});

// Generate QR code
app.get('/api/qr-code', async (req, res) => {
    try {
        const url = req.query.url || `http://${req.headers.host}`;
        const qrSvg = qr.image(url, { type: 'png' });
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', 'inline; filename=website-qr.png');
        qrSvg.pipe(res);
    } catch (error) {
        console.error('❌ Error generating QR code:', error);
        res.status(500).json({ success: false, error: 'Failed to generate QR code' });
    }
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        stats: adminStats,
        clients: {
            admins: clients.admins.size,
            users: clients.users.size
        },
        version: '1.0.0'
    });
});

// Handle WebSocket server errors
wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error);
});

// Handle HTTP server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Trying alternative port...`);
        startServerWithAlternativePort();
    } else {
        console.error('❌ HTTP server error:', error);
    }
});

// Start server with alternative port if default is busy
async function startServerWithAlternativePort() {
    let alternativePort = PORT + 1;
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const portInUse = await isPortInUse(alternativePort);
        if (!portInUse) {
            console.log(`✅ Found available port: ${alternativePort}`);
            server.listen(alternativePort, '0.0.0.0', () => {
                console.log(`\n✨ ========================================== ✨`);
                console.log(`🚀 Server running on http://localhost:${alternativePort}`);
                console.log(`💖 Main page: http://localhost:${alternativePort}`);
                console.log(`⚙️  Admin panel: http://localhost:${alternativePort}/admin`);
                console.log(`🔌 WebSocket ready on ws://localhost:${alternativePort}`);
                console.log(`📊 Initial stats:`, adminStats);
                console.log(`✅ Health check: http://localhost:${alternativePort}/health`);
                console.log(`🔗 QR Code: http://localhost:${alternativePort}/api/qr-code`);
                console.log(`🔑 Admin password: loveadmin123`);
                console.log(`✨ ========================================== ✨\n`);
            });
            return;
        }
        alternativePort++;
    }
    
    console.error(`❌ Could not find an available port after ${maxAttempts} attempts.`);
    process.exit(1);
}

// Start server
async function startServer() {
    try {
        console.log('\n✨ ========================================== ✨');
        console.log('💖 Love Website Admin - Starting Server...');
        console.log('✨ ========================================== ✨\n');
        
        await ensureFiles();
        
        const portInUse = await isPortInUse(PORT);
        if (portInUse) {
            console.log(`⚠️  Port ${PORT} is in use. Trying alternative port...`);
            await startServerWithAlternativePort();
        } else {
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`\n✨ ========================================== ✨`);
                console.log(`🚀 Server running on http://localhost:${PORT}`);
                console.log(`💖 Main page: http://localhost:${PORT}`);
                console.log(`⚙️  Admin panel: http://localhost:${PORT}/admin`);
                console.log(`🔌 WebSocket ready on ws://localhost:${PORT}`);
                console.log(`📊 Initial stats:`, adminStats);
                console.log(`✅ Health check: http://localhost:${PORT}/health`);
                console.log(`🔗 QR Code: http://localhost:${PORT}/api/qr-code`);
                console.log(`🔑 Admin password: loveadmin123`);
                console.log(`✨ ========================================== ✨\n`);
            });
        }
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
function gracefulShutdown() {
    console.log('\n🛑 Received shutdown signal. Gracefully shutting down...');
    
    // Close all WebSocket connections
    let closedClients = 0;
    [...clients.admins, ...clients.users].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.close(1001, 'Server shutting down');
            closedClients++;
        }
    });
    
    console.log(`📤 Closed ${closedClients} WebSocket connections`);
    
    // Close WebSocket server
    wss.close(() => {
        console.log('✅ WebSocket server closed');
        
        // Close HTTP server
        server.close(() => {
            console.log('✅ HTTP server closed');
            console.log('📴 Server shut down successfully');
            process.exit(0);
        });
        
        // Force close after 5 seconds
        setTimeout(() => {
            console.log('⏰ Force shutdown after timeout');
            process.exit(1);
        }, 5000);
    });
}

// Handle termination signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();