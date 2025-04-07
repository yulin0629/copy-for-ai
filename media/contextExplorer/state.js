// media/contextExplorer/state.js
import { sendMessageToExtension, getSavedState, saveState as saveWebViewState } from './vscodeApi.js';

// 初始化狀態物件
const state = {
    files: [],              // 原始檔案樹結構
    selectionState: {},     // Checkbox 的勾選狀態 { path: boolean }
    expandedFolders: {},    // 資料夾展開狀態 { path: boolean }
    filter: '',             // 篩選條件
    showSelectedOnly: false,// 是否僅顯示已選
    tokenLimit: 0,          // Token 上限
    copyInProgress: false,  // 是否正在複製
    sessionId: '',          // 會話 ID
    lastClickedPathForShift: null, // Shift 鍵選取的錨點
    currentVisualSelection: new Set(), // 當前視覺選取的項目路徑 (path)
    itemMap: {},            // 路徑到 item 物件的映射
};

/**
 * 獲取當前狀態的唯讀副本
 * @returns {object}
 */
export function getState() {
    // 返回一個淺拷貝以防止外部直接修改
    return { ...state };
}

/**
 * 設置初始狀態
 * @param {object} initialState - 從擴充功能接收的初始資料
 */
export function initializeState(initialState) {
    state.files = initialState.files || [];
    state.selectionState = initialState.savedState?.selectionState || {};
    state.expandedFolders = initialState.savedState?.expandedFolders || {};
    state.tokenLimit = initialState.tokenLimit || 0;
    state.sessionId = initialState.sessionId || Date.now().toString(); // 確保有 sessionId

    // 建立 itemMap
    buildItemMap(state.files);

    // 嘗試載入 WebView UI 狀態
    const savedWebViewState = getSavedState();
    if (savedWebViewState && savedWebViewState.sessionId === state.sessionId) {
        state.filter = savedWebViewState.filter || '';
        state.showSelectedOnly = !!savedWebViewState.showSelectedOnly;
    } else {
        // 如果 sessionId 不匹配或沒有保存狀態，則重置 UI 狀態
        state.filter = '';
        state.showSelectedOnly = false;
        saveWebViewUIState(); // 保存重置後的狀態
    }

    // 預設展開根資料夾 (如果沒有保存的展開狀態)
    if (Object.keys(state.expandedFolders).length === 0 && state.files && state.files.length > 0) {
        for (const rootItem of state.files) {
            if ((rootItem.type === 'folder' || rootItem.type === 'root') && rootItem.children && rootItem.children.length > 0) {
                state.expandedFolders[rootItem.path] = true;
            }
        }
        // 如果預設展開了，需要保存這個狀態
        saveSelectionAndExpansionState();
    }

    clearVisualSelection(); // 初始化時清除視覺選取
}

/**
 * 更新檔案列表
 * @param {Array<object>} newFiles - 新的檔案列表
 */
export function updateFiles(newFiles) {
    state.files = newFiles || [];
    buildItemMap(state.files);
    clearVisualSelection(); // 檔案列表更新，清除視覺選取
}

/**
 * 設置篩選條件
 * @param {string} filterValue - 新的篩選值
 */
export function setFilter(filterValue) {
    if (state.filter !== filterValue) {
        state.filter = filterValue;
        clearVisualSelection(); // 篩選時清除視覺選取
        saveWebViewUIState();
    }
}

/**
 * 設置是否僅顯示已選
 * @param {boolean} showSelected - 新的狀態值
 */
export function setShowSelectedOnly(showSelected) {
    if (state.showSelectedOnly !== showSelected) {
        state.showSelectedOnly = showSelected;
        clearVisualSelection(); // 切換顯示時清除視覺選取
        saveWebViewUIState();
    }
}

/**
 * 切換資料夾展開狀態
 * @param {string} folderPath - 資料夾路徑
 */
export function toggleFolderExpansion(folderPath) {
    state.expandedFolders[folderPath] = !state.expandedFolders[folderPath];
    saveSelectionAndExpansionState();
}

/**
 * 更新項目勾選狀態 (遞迴)
 * @param {object} item - 要更新的項目
 * @param {boolean} isSelected - 是否勾選
 */
export function updateItemSelectionState(item, isSelected) {
    if (!item) return;
    if (item.type === 'file') {
        state.selectionState[item.path] = isSelected;
    } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
        // 資料夾本身不記錄勾選狀態，遞迴更新子項
        for (const child of item.children) {
            updateItemSelectionState(child, isSelected);
        }
    }
}

/**
 * 批量更新勾選狀態
 * @param {Set<string>} pathsToUpdate - 需要更新的路徑集合
 * @param {boolean} isSelected - 目標勾選狀態
 */
export function batchUpdateSelectionState(pathsToUpdate, isSelected) {
    pathsToUpdate.forEach(path => {
        const targetItem = state.itemMap[path];
        if (targetItem) {
            updateItemSelectionState(targetItem, isSelected);
        }
    });
    saveSelectionAndExpansionState();
}


/**
 * 設置複製狀態
 * @param {boolean} inProgress - 是否正在複製
 */
export function setCopyInProgress(inProgress) {
    state.copyInProgress = inProgress;
}

/**
 * 更新 Token 上限
 * @param {number} limit - 新的 Token 上限
 */
export function setTokenLimit(limit) {
    state.tokenLimit = limit || 0;
}

/**
 * 建立路徑到 item 物件的映射
 * @param {Array<object>} items - 檔案項目列表
 */
function buildItemMap(items) {
    state.itemMap = {};
    function traverse(currentItems) {
        for (const item of currentItems) {
            state.itemMap[item.path] = item;
            if ((item.type === 'folder' || item.type === 'root') && item.children) {
                traverse(item.children);
            }
        }
    }
    traverse(items);
}

/**
 * 獲取資料夾的勾選狀態 (全選/部分選取/未選取)
 * @param {object} folder - 資料夾項目
 * @returns {'all' | 'partial' | 'none'}
 */
export function getFolderSelectionState(folder) {
    if (!folder || !folder.children || folder.children.length === 0) {
        return 'none';
    }

    let hasSelected = false;
    let hasUnselected = false;
    let fileCount = 0;

    function checkSelection(items) {
        for (const item of items) {
            if (item.type === 'file') {
                fileCount++;
                if (state.selectionState[item.path]) {
                    hasSelected = true;
                } else {
                    hasUnselected = true;
                }
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                checkSelection(item.children);
            }
            if (hasSelected && hasUnselected) return; // 提前結束
        }
    }

    checkSelection(folder.children);

    if (fileCount === 0) return 'none';
    if (hasSelected && hasUnselected) return 'partial';
    if (hasSelected) return 'all';
    return 'none';
}

/**
 * 檢查項目或其子項目是否已勾選
 * @param {object} item - 要檢查的項目
 * @returns {boolean}
 */
export function isItemOrChildrenSelected(item) {
    if (!item) return false;
    if (item.type === 'file') {
        return !!state.selectionState[item.path];
    }
    if ((item.type === 'folder' || item.type === 'root')) {
        if (state.selectionState[item.path]) return true; // 雖然不推薦，但檢查自身
        if (item.children) {
            for (const child of item.children) {
                if (isItemOrChildrenSelected(child)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * 清除視覺選取狀態
 */
export function clearVisualSelection() {
    state.currentVisualSelection.clear();
    state.lastClickedPathForShift = null;
}

/**
 * 更新視覺選取狀態
 * @param {Set<string>} newSelection - 新的視覺選取路徑集合
 */
export function setVisualSelection(newSelection) {
    state.currentVisualSelection = newSelection;
}

/**
 * 添加到視覺選取
 * @param {string} path - 要添加的路徑
 */
export function addToVisualSelection(path) {
    state.currentVisualSelection.add(path);
}

/**
 * 從視覺選取中移除
 * @param {string} path - 要移除的路徑
 */
export function removeFromVisualSelection(path) {
    state.currentVisualSelection.delete(path);
}

/**
 * 設置 Shift 選取的錨點
 * @param {string | null} path - 錨點路徑或 null
 */
export function setLastClickedPathForShift(path) {
    state.lastClickedPathForShift = path;
}

/**
 * 保存 WebView UI 狀態 (篩選、僅顯示已選) 到 VS Code
 */
function saveWebViewUIState() {
    saveWebViewState({
        filter: state.filter,
        showSelectedOnly: state.showSelectedOnly,
        sessionId: state.sessionId
    });
}

/**
 * 保存勾選狀態和展開狀態到擴充功能
 */
export function saveSelectionAndExpansionState() {
    sendMessageToExtension({
        command: 'saveState',
        state: {
            selectionState: state.selectionState,
            expandedFolders: state.expandedFolders
        }
    });
}

/**
 * 更新從擴充功能接收的狀態
 * @param {object} newState - 包含 selectionState 和 expandedFolders 的物件
 */
export function updateStateFromExtension(newState) {
    if (newState.selectionState) {
        state.selectionState = newState.selectionState;
    }
    if (newState.expandedFolders) {
        state.expandedFolders = newState.expandedFolders;
    }
    clearVisualSelection(); // 外部更新狀態，清除本地視覺選取
    saveSelectionAndExpansionState(); // 可能需要將合併後的狀態存回去？或者假設外部來源是權威的
}

/**
 * 獲取所有已勾選檔案的路徑 (fsPath)
 * @returns {string[]}
 */
export function getSelectedFilePaths() {
    const selectedFilePaths = [];
    function findSelectedFiles(items) {
        for (const item of items) {
            if (item.type === 'file' && state.selectionState[item.path]) {
                if (item.fsPath) {
                    selectedFilePaths.push(item.fsPath);
                } else if (item.uri) {
                    try {
                        // 嘗試從 URI 解碼路徑 (適用於非 Windows)
                        let path = decodeURIComponent(item.uri.replace(/^file:\/\//, ''));
                        // 處理 Windows 路徑 (file:///C:/...)
                        if (path.startsWith('/') && path[2] === ':') {
                            path = path.substring(1);
                        }
                        selectedFilePaths.push(path);
                    } catch (e) {
                        console.error(`無法解析檔案 URI: ${item.uri}`, e);
                        // 可以考慮添加一個備用路徑，如果有的話
                    }
                }
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                findSelectedFiles(item.children);
            }
        }
    }
    findSelectedFiles(state.files);
    return selectedFilePaths;
}

/**
 * 計算已勾選檔案的數量和 Tokens
 * @returns {{count: number, tokens: number}}
 */
export function calculateSelectedSummary() {
    let fileCount = 0;
    let totalTokens = 0;
    function countTokensAndFiles(items) {
        for (const item of items) {
            if (item.type === 'file' && state.selectionState[item.path]) {
                fileCount++;
                if (item.estimatedTokens !== undefined) {
                    totalTokens += item.estimatedTokens;
                }
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                countTokensAndFiles(item.children);
            }
        }
    }
    countTokensAndFiles(state.files);
    return { count: fileCount, tokens: totalTokens };
}