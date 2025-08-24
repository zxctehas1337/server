const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getServerPort: () => ipcRenderer.invoke('get-server-port'),
    
    // Theme management
    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
    getTheme: () => ipcRenderer.invoke('get-theme'),
    
    // Platform detection
    platform: process.platform,
    isDesktop: true,
    
    // Version info
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron
    }
});

// Listen for theme changes
window.addEventListener('DOMContentLoaded', () => {
    // Initialize theme on load
    ipcRenderer.invoke('get-theme').then(themeInfo => {
        if (themeInfo.shouldUseDarkColors) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    });
});
