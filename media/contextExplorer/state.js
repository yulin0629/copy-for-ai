// media/contextExplorer/state.js
import { sendMessageToExtension, getSavedState, saveState as saveWebViewState } from './vscodeApi.js';

// 初始化狀態物件
const state = {
    files: [],              // 原始檔案樹結構
    snippets: [],           // 程式碼片段列表
    selectionState: {},     // Checkbox 的勾選狀態 { pathOrId: boolean } (包含檔案路徑和片段 ID) - 已棄用，遷移到 selectedFiles/selectedSnippets
    expandedFolders: {},    // 資料夾展開狀態 { path: boolean }
    filter: '',             // 篩選條件
    showSelectedOnly: false,// 是否僅顯示已選
    tokenLimit: 0,          // Token 上限
    copyInProgress: false,  // 是否正在複製
    sessionId: '',          // 會話 ID
    lastClickedPathForShift: null, // Shift 鍵選取的錨點 (檔案或片段 ID)
    currentVisualSelection: new Set(), // 當前視覺選取的項目路徑或 ID
    itemMap: {},            // 路徑到檔案 item 物件的映射
    snippetMap: {},         // ID 到 snippet 物件的映射
    // 新增：管理勾選狀態
    selectedFiles: new Set(),   // 已勾選檔案的相對路徑
    selectedSnippets: new Set(), // 已勾選片段的 ID
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
    state.snippets = initialState.savedState?.snippets || []; // 載入片段
    // state.selectionState = initialState.savedState?.selectionState || {}; // 載入舊的勾選狀態 (在 migrate 中處理)
    state.expandedFolders = initialState.savedState?.expandedFolders || {};
    state.tokenLimit = initialState.tokenLimit || 0;
    state.sessionId = initialState.sessionId || Date.now().toString(); // 確保有 sessionId

    // 建立 itemMap 和 snippetMap
    buildItemMap(state.files);
    buildSnippetMap(state.snippets);

    // 遷移舊的 selectionState 到新的 selectedFiles/selectedSnippets
    // 這裡需要從 initialState.savedState 讀取舊的 selectionState
    migrateSelectionState(initialState.savedState?.selectionState || {});

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
 * 遷移舊的 selectionState 到 selectedFiles 和 selectedSnippets
 * @param {Record<string, boolean>} oldSelectionState - 舊的勾選狀態
 */
function migrateSelectionState(oldSelectionState) {
    state.selectedFiles.clear();
    state.selectedSnippets.clear();
    for (const key in oldSelectionState) {
        if (oldSelectionState[key]) {
            if (state.itemMap[key]) { // 如果是檔案路徑
                state.selectedFiles.add(key);
            } else if (state.snippetMap[key]) { // 如果是片段 ID
                state.selectedSnippets.add(key);
            }
        }
    }
    // 清除舊的 selectionState，避免混淆 (不需要清除 state.selectionState，因為它本來就是空的)
    // state.selectionState = {};
    // 保存一次遷移後的狀態
    saveSelectionAndExpansionState();
}


/**
 * 更新檔案列表
 * @param {Array<object>} newFiles - 新的檔案列表
 */
export function updateFiles(newFiles) {
    state.files = newFiles || [];
    buildItemMap(state.files);
    clearVisualSelection(); // 檔案列表更新，清除視覺選取
    // 檔案更新不影響片段
}

/**
 * 更新片段列表
 * @param {Array<object>} newSnippets - 新的片段列表
 */
export function updateSnippets(newSnippets) {
    console.log('[State] updateSnippets called with:', newSnippets); // <-- 日誌 S1
    state.snippets = newSnippets || [];
    buildSnippetMap(state.snippets); // 確保 snippetMap 更新
    console.log('[State] Snippet map updated:', state.snippetMap); // <-- 日誌 S2

    // 清理可能已不存在的片段勾選
    const currentSnippetIds = new Set(state.snippets.map(s => s.id));
    let snippetsSelectionChanged = false;
    state.selectedSnippets.forEach(id => {
        if (!currentSnippetIds.has(id)) {
            console.log(`[State] Removing non-existent snippet ID from selection: ${id}`); // <-- 日誌 S3
            state.selectedSnippets.delete(id);
            snippetsSelectionChanged = true;
        }
    });

    // clearVisualSelection(); // 在 updateStateFromExtension 的末尾統一處理
    // 如果片段勾選狀態因此改變，也需要保存
    if (snippetsSelectionChanged) {
        // saveSelectionAndExpansionState(); // 狀態來自後端，不應再發送回後端
    }
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
 * 更新項目勾選狀態 (遞迴更新檔案，單獨更新片段)
 * @param {object} item - 要更新的項目 (檔案 TreeNode 或 片段 Snippet)
 * @param {boolean} isSelected - 是否勾選
 */
export function updateItemSelectionState(item, isSelected) {
    if (!item) return;

    if (item.type === 'file') { // 處理檔案
        if (isSelected) {
            state.selectedFiles.add(item.path);
        } else {
            state.selectedFiles.delete(item.path);
        }
    } else if (item.type === 'folder' || item.type === 'root') { // 處理資料夾
        // 遞迴更新子項
        if (item.children) {
            for (const child of item.children) {
                updateItemSelectionState(child, isSelected);
            }
        }
    } else if (item.id && item.relativePath) { // 處理片段 (更精確的判斷)
        if (isSelected) {
            state.selectedSnippets.add(item.id);
        } else {
            state.selectedSnippets.delete(item.id);
        }
    }
}


/**
 * 批量更新勾選狀態 (檔案和片段)
 * @param {Set<string>} pathsToUpdate - 需要更新的檔案相對路徑集合
 * @param {Set<string>} snippetIdsToUpdate - 需要更新的片段 ID 集合
 * @param {boolean} isSelected - 目標勾選狀態
 */
export function batchUpdateSelectionState(pathsToUpdate, snippetIdsToUpdate, isSelected) {
    pathsToUpdate.forEach(path => {
        const targetItem = state.itemMap[path];
        if (targetItem) {
            updateItemSelectionState(targetItem, isSelected); // 會遞迴處理資料夾
        }
    });
    snippetIdsToUpdate.forEach(id => {
        const targetSnippet = state.snippetMap[id];
        if (targetSnippet) {
            updateItemSelectionState(targetSnippet, isSelected);
        }
    });
    saveSelectionAndExpansionState();
}


/**
 * 設置複製狀態
 * @param {boolean} inProgress - 是否正在複製
 */
export function setCopyInProgress(inProgress) {
    // **** 添加日誌 ****
    console.log(`[WebView State] setCopyInProgress called with: ${inProgress}. Current value: ${state.copyInProgress}`);
    state.copyInProgress = inProgress;
    console.log(`[WebView State] state.copyInProgress is now: ${state.copyInProgress}`);
}

/**
 * 更新 Token 上限
 * @param {number} limit - 新的 Token 上限
 */
export function setTokenLimit(limit) {
    state.tokenLimit = limit || 0;
}

/**
 * 建立路徑到檔案 item 物件的映射
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
    if (items) {
        traverse(items);
    }
}

/**
 * 建立 ID 到 snippet 物件的映射
 * @param {Array<object>} snippets - 片段列表
 */
function buildSnippetMap(snippets) {
    state.snippetMap = {};
    if (snippets) {
        for (const snippet of snippets) {
            state.snippetMap[snippet.id] = snippet;
        }
    }
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
                if (state.selectedFiles.has(item.path)) {
                    hasSelected = true;
                } else {
                    hasUnselected = true;
                }
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                checkSelection(item.children);
            }
            // 如果已經同時存在選中和未選中，或者所有檔案都檢查完了，可以提前結束
            if (hasSelected && hasUnselected) return;
        }
    }

    checkSelection(folder.children);

    if (fileCount === 0) return 'none'; // 資料夾下沒有檔案
    if (hasSelected && hasUnselected) return 'partial';
    if (hasSelected) return 'all';
    return 'none';
}

/**
 * 檢查項目或其子項目是否已勾選 (檔案)
 * @param {object} item - 要檢查的檔案或資料夾項目
 * @returns {boolean}
 */
export function isItemOrChildrenSelected(item) {
    if (!item) return false;
    if (item.type === 'file') {
        return state.selectedFiles.has(item.path);
    }
    if ((item.type === 'folder' || item.type === 'root')) {
        // 資料夾本身不直接勾選，檢查子項目
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
 * 檢查片段是否已勾選
 * @param {object} snippet - 要檢查的片段項目
 * @returns {boolean}
 */
export function isSnippetSelected(snippet) {
    return snippet && state.selectedSnippets.has(snippet.id);
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
 * @param {Set<string>} newSelection - 新的視覺選取路徑或 ID 集合
 */
export function setVisualSelection(newSelection) {
    state.currentVisualSelection = newSelection;
}

/**
 * 添加到視覺選取
 * @param {string} pathOrId - 要添加的路徑或 ID
 */
export function addToVisualSelection(pathOrId) {
    state.currentVisualSelection.add(pathOrId);
}

/**
 * 從視覺選取中移除
 * @param {string} pathOrId - 要移除的路徑或 ID
 */
export function removeFromVisualSelection(pathOrId) {
    state.currentVisualSelection.delete(pathOrId);
}

/**
 * 設置 Shift 選取的錨點
 * @param {string | null} pathOrId - 錨點路徑/ID 或 null
 */
export function setLastClickedPathForShift(pathOrId) {
    state.lastClickedPathForShift = pathOrId;
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
 * 注意：片段狀態由後端 StateManager 管理，這裡只保存檔案相關狀態
 */
export function saveSelectionAndExpansionState() {
    // 將 Set 轉換為 Record<string, boolean> 以便儲存
    const selectionStateForFiles = {};
    state.selectedFiles.forEach(path => {
        selectionStateForFiles[path] = true;
    });

    // 將片段 ID Set 轉換為 Record<string, boolean> (雖然目前後端不直接使用，但保持一致性)
    // const selectionStateForSnippets = {};
    // state.selectedSnippets.forEach(id => {
    //     selectionStateForSnippets[id] = true;
    // });

    sendMessageToExtension({
        command: 'saveState',
        state: {
            // 只保存檔案的勾選狀態和資料夾展開狀態
            selectionState: selectionStateForFiles, // 只包含檔案
            expandedFolders: state.expandedFolders
            // snippets 由後端 StateManager 持久化，不在這裡發送
        }
    });
}

/**
 * 更新從擴充功能接收的狀態
 * @param {object} newState - 包含 selectionState, expandedFolders, snippets 的物件
 */
export function updateStateFromExtension(newState) {
    let stateChanged = false;
    let selectionChanged = false; // 追蹤選擇狀態是否有變化
    let snippetsChanged = false; // 追蹤片段列表是否有變化
    let expansionChanged = false; // 追蹤展開狀態是否有變化

    console.log('[State] updateStateFromExtension received newState:', JSON.stringify(newState)); // <-- 日誌 1

    // **** 1. 先處理 snippets 更新，確保 snippetMap 是最新的 ****
    if (newState.snippets) {
        console.log('[State] Processing snippets update...'); // <-- 日誌 5
        // 比較是否有變化 (比較陣列長度和每個元素的 id)
        if (newState.snippets.length !== state.snippets.length ||
            !newState.snippets.every((snippet, index) => state.snippets[index]?.id === snippet.id)) {
            console.log('[State] Snippets list changed, calling updateSnippets.'); // <-- 日誌 6
            updateSnippets(newState.snippets); // updateSnippets 內部會更新 state.snippets 和 state.snippetMap
            snippetsChanged = true;
            stateChanged = true;
        } else {
            console.log('[State] Snippets list seems unchanged.'); // <-- 日誌 7
        }
    }

    // **** 2. 更新勾選狀態 (使用更新後的 snippetMap) ****
    if (newState.selectionState) {
        console.log('[State] Processing selectionState:', JSON.stringify(newState.selectionState)); // <-- 日誌 2
        const newSelectedFiles = new Set();
        const newSelectedSnippets = new Set();

        for (const key in newState.selectionState) {
            if (newState.selectionState[key]) { // 只處理值為 true 的 key
                // 判斷 key 是檔案路徑還是片段 ID
                if (state.itemMap[key] && state.itemMap[key].type === 'file') {
                    console.log(`[State] Key "${key}" identified as file.`); // <-- 日誌 2.1
                    newSelectedFiles.add(key);
                } else if (state.snippetMap[key]) { // 優先使用 snippetMap 判斷
                    console.log(`[State] Key "${key}" identified as snippet via snippetMap.`); // <-- 日誌 2.2
                    newSelectedSnippets.add(key);
                } else if (typeof key === 'string' && key.includes('-') && !key.includes(path.sep)) { // 備用判斷
                    console.log(`[State] Key "${key}" identified as snippet via format.`); // <-- 日誌 2.3
                    newSelectedSnippets.add(key);
                } else {
                    // 如果 itemMap 中存在但不是 file (可能是 folder/root)，則忽略其勾選狀態
                    if (!state.itemMap[key]) {
                         console.warn(`[State] updateStateFromExtension: Could not determine type for key "${key}" from selectionState.`);
                    } else {
                         console.log(`[State] Ignoring selection state for non-file item: "${key}"`);
                    }
                }
            }
        }

        // 比較檔案勾選是否有變化
        if (newSelectedFiles.size !== state.selectedFiles.size || ![...newSelectedFiles].every(path => state.selectedFiles.has(path))) {
            console.log('[State] Updating selectedFiles:', newSelectedFiles); // <-- 日誌 3
            state.selectedFiles = newSelectedFiles;
            selectionChanged = true;
        }
        // 比較片段勾選是否有變化
        if (newSelectedSnippets.size !== state.selectedSnippets.size || ![...newSelectedSnippets].every(id => state.selectedSnippets.has(id))) {
            console.log('[State] Updating selectedSnippets:', newSelectedSnippets); // <-- 日誌 4
            state.selectedSnippets = newSelectedSnippets;
            selectionChanged = true;
        }
        if (selectionChanged) stateChanged = true;
    }

    // **** 3. 更新資料夾展開狀態 ****
    if (newState.expandedFolders) {
        console.log('[State] Processing expandedFolders update...'); // <-- 日誌 E1
        // 比較是否有變化 (簡單比較 key 的數量和值)
        if (Object.keys(newState.expandedFolders).length !== Object.keys(state.expandedFolders).length ||
            !Object.keys(newState.expandedFolders).every(key => state.expandedFolders[key] === newState.expandedFolders[key])) {
            console.log('[State] Updating expandedFolders:', newState.expandedFolders); // <-- 日誌 E2
            state.expandedFolders = newState.expandedFolders;
            expansionChanged = true;
            stateChanged = true;
        } else {
             console.log('[State] expandedFolders seem unchanged.'); // <-- 日誌 E3
        }
    }

    // **** 4. 根據狀態變化決定是否清除視覺選取 ****
    if (stateChanged) {
        console.log(`[State] State changed (selection: ${selectionChanged}, snippets: ${snippetsChanged}, expansion: ${expansionChanged}), clearing visual selection.`); // <-- 日誌 8
        clearVisualSelection(); // 外部更新狀態，清除本地視覺選取
    } else {
        console.log('[State] No state changes detected.'); // <-- 日誌 9
    }
    // 注意：這裡不需要調用 saveSelectionAndExpansionState，因為狀態是從後端來的
}

/**
 * 獲取所有已勾選檔案的路徑 (fsPath)
 * @returns {string[]}
 */
export function getSelectedFilePaths() /* 移除 : string[] */ {
    const selectedFilePaths = []; // 移除 : string[]
    state.selectedFiles.forEach(relativePath => {
        const item = state.itemMap[relativePath];
        if (item && item.fsPath) {
            selectedFilePaths.push(item.fsPath);
        } else if (item && item.uri) {
            // 嘗試從 URI 解碼路徑 (備用)
             try {
                let path = decodeURIComponent(item.uri.replace(/^file:\/\//, ''));
                if (path.startsWith('/') && path[2] === ':') { // Windows 路徑
                    path = path.substring(1);
                }
                selectedFilePaths.push(path);
            } catch (e) {
                console.error(`無法解析檔案 URI: ${item.uri}`, e);
            }
        } else {
            // 可能是根節點或資料夾被錯誤地加入 selectedFiles，或者 itemMap 不完整
            console.warn(`找不到已選檔案的路徑資訊或項目類型不符: ${relativePath}`);
        }
    });
    return selectedFilePaths;
}

/**
 * 獲取所有已勾選片段的 ID
 * @returns {string[]}
 */
export function getSelectedSnippetIds() {
    return Array.from(state.selectedSnippets);
}


/**
 * 計算已勾選項目 (檔案+片段) 的數量和 Tokens
 * @returns {{count: number, tokens: number, fileCount: number, snippetCount: number}}
 */
export function calculateSelectedSummary() /* 移除 : {count: number, tokens: number, fileCount: number, snippetCount: number} */ {
    let fileCount = 0;
    let snippetCount = 0;
    let totalTokens = 0;

    // 計算檔案
    state.selectedFiles.forEach(path => {
        const item = state.itemMap[path];
        // 確保只計算檔案類型
        if (item && item.type === 'file') {
            fileCount++;
            if (item.estimatedTokens !== undefined) {
                totalTokens += item.estimatedTokens;
            }
        }
    });

    // 計算片段
    state.selectedSnippets.forEach(id => {
        const snippet = state.snippetMap[id];
        if (snippet) {
            snippetCount++;
            if (snippet.estimatedTokens !== undefined) {
                totalTokens += snippet.estimatedTokens;
            }
        }
    });

    return {
        count: fileCount + snippetCount,
        tokens: totalTokens,
        fileCount: fileCount,
        snippetCount: snippetCount
    };
}