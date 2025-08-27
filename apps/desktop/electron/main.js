const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Keep a global reference of the window object
let mainWindow;

// Production server URL
const PRODUCTION_SERVER = 'https://krackenx.onrender.com';

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, '..', 'public', 'icon.png'), // We'll create this later
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false, // Don't show until ready
        titleBarStyle: 'default'
    });

    // Set application menu
    mainWindow.setMenuBarVisibility(false);

    // Intercept requests from local file:// UI to backend
    const { session } = mainWindow.webContents;
    session.webRequest.onBeforeRequest((details, callback) => {
        try {
            const requestUrl = new URL(details.url);
            // Only intercept file:// requests coming from our loaded UI
            if (requestUrl.protocol === 'file:') {
                const pathname = requestUrl.pathname || '';
                if (pathname.startsWith('/api/')) {
                    const redirectURL = `${PRODUCTION_SERVER}${pathname}${requestUrl.search || ''}`;
                    return callback({ redirectURL });
                }
                if (pathname.startsWith('/socket.io/')) {
                    const redirectURL = `${PRODUCTION_SERVER}${pathname}${requestUrl.search || ''}`;
                    return callback({ redirectURL });
                }
            }
        } catch (_) {}
        callback({});
    });

    // Load the local UI (copied from web version)
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    console.log('Loading local file:', indexPath);
    mainWindow.loadFile(indexPath);
    
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Allow navigation to production server
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.origin !== PRODUCTION_SERVER) {
            event.preventDefault();
        }
    });
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('set-theme', (event, theme) => {
    nativeTheme.themeSource = theme;
    return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle('get-theme', () => {
    return {
        theme: nativeTheme.themeSource,
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors
    };
});

// App event handlers
app.whenReady().then(() => {
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});
