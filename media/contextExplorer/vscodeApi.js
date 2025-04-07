// media/contextExplorer/vscodeApi.js

// 獲取 VS Code API
const vscode = acquireVsCodeApi();

/**
 * 發送訊息到 VS Code 擴充功能
 * @param {object} message - 要發送的訊息物件
 */
export function sendMessageToExtension(message) {
    vscode.postMessage(message);
}

/**
 * 獲取保存的 WebView UI 狀態
 * @returns {object | undefined} - 保存的狀態或 undefined
 */
export function getSavedState() {
    return vscode.getState();
}

/**
 * 保存 WebView UI 狀態
 * @param {object} state - 要保存的狀態物件
 */
export function saveState(state) {
    vscode.setState(state);
}

/**
 * 設置訊息監聽器
 * @param {function} handler - 處理接收到的訊息的函數
 */
export function setMessageListener(handler) {
    window.addEventListener('message', event => {
        handler(event.data);
    });
}