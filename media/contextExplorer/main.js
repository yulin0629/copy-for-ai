// media/contextExplorer/main.js
import { initializeState, updateFiles, setTokenLimit, updateStateFromExtension } from './state.js';
import { initializeUI, renderFileList, showMessage, updateCopyButtonStatus } from './ui.js';
import { setupEventListeners } from './events.js';
import { setMessageListener, sendMessageToExtension } from './vscodeApi.js';

/**
 * 初始化 WebView
 */
function initialize() {
    // 1. 設置與 VS Code 的訊息監聽器
    setMessageListener(handleExtensionMessage);

    // 2. 設置 UI 事件監聽器
    setupEventListeners();

    // 3. 向擴充功能請求初始資料
    sendMessageToExtension({ command: 'getFiles' });

    console.log("Context Explorer WebView Initializing...");
}

/**
 * 處理從 VS Code 擴充功能接收的訊息
 * @param {object} message - 接收到的訊息
 */
function handleExtensionMessage(message) {
    console.log("Message received from extension:", message.command, message);

    switch (message.command) {
        case 'initialize':
            // 使用從擴充功能獲取的資料初始化狀態
            initializeState(message);
            // 初始化 UI (例如設置篩選框的值)
            initializeUI();
            // 根據初始狀態渲染檔案列表
            renderFileList();
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
            updateCopyButtonStatus(message);
            break;

        case 'updateTokenLimit':
            // 更新 Token 上限狀態
            setTokenLimit(message.tokenLimit);
            // 重新渲染以反映 Token 百分比變化
            renderFileList();
            break;

        case 'updateState': // 處理來自擴充功能的狀態強制更新 (例如右鍵添加檔案)
            // 更新 selectionState 和 expandedFolders
            updateStateFromExtension(message.state);
            // 重新渲染列表以反映狀態變化
            renderFileList();
            break;

        // 可以添加其他命令處理...
        default:
            console.warn("Received unknown command from extension:", message.command);
            break;
    }
}

// --- 啟動 ---
initialize();