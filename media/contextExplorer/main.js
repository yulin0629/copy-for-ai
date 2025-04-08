import { initializeState, updateFiles, setTokenLimit, updateStateFromExtension, updateSnippets } from './state.js'; // 引入 updateSnippets
import { initializeUI, renderFileList, showMessage, updateCopyButtonStatus } from './ui.js';
import { setupEventListeners } from './events.js';
import { setMessageListener, sendMessageToExtension } from './vscodeApi.js';

/**
 * 初始化 WebView
 */
function initialize() {
    console.log("[WebView Main] Initializing..."); // <-- 驗證 initialize 是否執行
    setMessageListener(handleExtensionMessage);
    setupEventListeners(); // <-- 確保這裡被調用
    sendMessageToExtension({ command: 'getFiles' });
    console.log("[WebView Main] Initialization complete.");
}

/**
 * 處理從 VS Code 擴充功能接收的訊息
 * @param {object} message - 接收到的訊息
 */
function handleExtensionMessage(message) {
    console.log("Message received from extension:", message.command, message);

    switch (message.command) {
        case 'initialize':
            // 使用從擴充功能獲取的資料初始化狀態 (包含檔案和片段)
            initializeState(message);
            // 初始化 UI (例如設置篩選框的值)
            initializeUI(); // initializeUI 內部會調用 renderFileList
            break;

        case 'updateFiles':
            // 更新檔案列表狀態
            updateFiles(message.files);
            // 重新渲染檔案列表
            renderFileList();
            // 顯示更新提示 (如果有的話)
            if (message.reason) {
                showMessage(`檔案列表已更新: ${message.reason}`);
            }
            break;

        case 'copyStatus':
            // 更新複製按鈕狀態和顯示訊息
            console.log('[WebView Main] Handling copyStatus message:', message);
            updateCopyButtonStatus(message);
            break;

        case 'updateTokenLimit':
            // 更新 Token 上限狀態
            setTokenLimit(message.tokenLimit);
            // 重新渲染以反映 Token 百分比變化
            renderFileList();
            break;

        case 'updateState': // 處理來自擴充功能的狀態強制更新 (例如右鍵添加檔案/片段, 或刪除片段後)
            console.log('[WebView Main] Handling updateState message:', message.state); // <-- 添加日誌
            // 更新 selectionState, expandedFolders 和 snippets
            updateStateFromExtension(message.state);
            // **** 關鍵：確保調用 renderFileList ****
            console.log('[WebView Main] Calling renderFileList after updateStateFromExtension'); // <-- 添加日誌
            renderFileList(); // <-- 確保這一行存在且被執行
        break;

        // 可以添加其他命令處理...
        default:
            console.warn("Received unknown command from extension:", message.command);
            break;
    }
}

// --- 啟動 ---
initialize();