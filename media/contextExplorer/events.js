// media/contextExplorer/events.js
import {
    getState, setFilter, setShowSelectedOnly, toggleFolderExpansion,
    batchUpdateSelectionState, clearVisualSelection, setVisualSelection,
    addToVisualSelection, removeFromVisualSelection, setLastClickedPathForShift,
    getSelectedFilePaths, getSelectedSnippetIds, saveSelectionAndExpansionState,
    isItemOrChildrenSelected, isSnippetSelected, setCopyInProgress, // 確保 setCopyInProgress 已導入
    // **** 添加 state.itemMap 和 state.snippetMap 的訪問 (雖然 getState() 會返回它們) ****
} from './state.js';
import {
    filterInput, clearFilterButton, showSelectedOnlyCheckbox,
    fileListContainer, fileListElement, snippetListContainer, snippetListElement,
    copyButton, renderFileList, updateClearButtonVisibility, showMessage,
    // **** 確保 getVisibleItemIds 在這裡定義或導入 ****
} from './ui.js';
import { sendMessageToExtension } from './vscodeApi.js';

// --- Click Delay Handling ---
let clickTimeout = null;
let clickTargetElement = null;
const CLICK_DELAY = 250; // ms, adjust as needed

/**
 * 防抖函數
 * @param {function} func - 要執行的函數
 * @param {number} wait - 延遲時間 (毫秒)
 * @returns {function} - 防抖後的函數
 */
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

/**
 * 設置所有事件監聽器
 */
export function setupEventListeners() {
    console.log('[WebView Events] Setting up event listeners...'); // <-- 驗證 setupEventListeners 是否執行
    // 篩選框輸入 (防抖)
    filterInput.addEventListener('input', debounce(handleFilterChange, 300));

    // 清除篩選按鈕
    clearFilterButton.addEventListener('click', clearFilter);

    // 篩選框 ESC 鍵
    filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearFilter();
        }
    });

    // 僅顯示已選 Checkbox
    showSelectedOnlyCheckbox.addEventListener('change', handleShowSelectedOnlyChange);

    // 複製按鈕
    if (copyButton) {
        copyButton.addEventListener('click', handleCopyClick); // <-- 恢復調用 handleCopyClick
        console.log('[WebView Events] Click listener added to copyButton (pointing to handleCopyClick).');
    } else {
        console.error('[WebView Events] copyButton element NOT found!');
    }

    // 點擊列表空白處取消視覺選取 (檔案列表)
    fileListContainer.addEventListener('click', (event) => {
        if (event.target === fileListContainer || event.target === fileListElement) {
            clearVisualSelection();
            renderFileList(); // 重繪以移除高亮
        }
    });

    // 點擊列表空白處取消視覺選取 (片段列表)
    snippetListContainer.addEventListener('click', (event) => {
        if (event.target === snippetListContainer || event.target === snippetListElement) {
            clearVisualSelection();
            renderFileList(); // 重繪以移除高亮
        }
    });


    // 初始更新清除按鈕可見性
    updateClearButtonVisibility();
}

/**
 * 處理篩選輸入變更
 */
function handleFilterChange() {
    setFilter(filterInput.value);
    updateClearButtonVisibility();
    renderFileList();
}

/**
 * 清除篩選條件
 */
export function clearFilter() {
    filterInput.value = ''; // 清空輸入框
    setFilter('');          // 更新狀態
    updateClearButtonVisibility();
    renderFileList();
}

/**
 * 處理 "僅顯示已選" Checkbox 變更
 */
function handleShowSelectedOnlyChange() {
    setShowSelectedOnly(showSelectedOnlyCheckbox.checked);
    renderFileList();
}

/**
 * 處理複製按鈕點擊
 */
export function handleCopyClick() {
    console.log('[WebView Events] handleCopyClick triggered'); // <-- 日誌 1
    const state = getState();
    if (state.copyInProgress) {
        console.log("[WebView Events] Copy already in progress, ignoring click.");
        return;
    }

    const selectedFilePaths = getSelectedFilePaths();
    const selectedSnippetIds = getSelectedSnippetIds();
    console.log('[WebView Events] Selected Files:', selectedFilePaths); // <-- 日誌 2
    console.log('[WebView Events] Selected Snippets:', selectedSnippetIds); // <-- 日誌 3

    if (selectedFilePaths.length === 0 && selectedSnippetIds.length === 0) {
        console.log('[WebView Events] No items selected, showing message.'); // <-- 日誌 4
        showMessage('請先勾選至少一個檔案或片段');
        return;
    }

    setCopyInProgress(true);
    renderFileList(); // 更新按鈕狀態

    console.log('[WebView Events] Sending copyToClipboard message to extension...'); // <-- 日誌 5
    try {
        sendMessageToExtension({
            command: 'copyToClipboard',
            selectedFiles: selectedFilePaths,
            selectedSnippets: selectedSnippetIds
        });
        console.log('[WebView Events] Message sent successfully.'); // <-- 日誌 6
    } catch (error) {
        console.error('[WebView Events] Error sending message to extension:', error); // <-- 錯誤日誌
    }


    console.log(`[WebView Events] 將 ${selectedFilePaths.length} 個檔案和 ${selectedSnippetIds.length} 個片段發送給後端複製`);
}

/**
 * 獲取所有可見項目的 ID 或路徑 (用於 Shift 選取)
 * @returns {string[]}
 */
function getVisibleItemIds() {
    const visibleItems = [];
    // 獲取可見的檔案項目
    const visibleFileElements = fileListElement.querySelectorAll('.file-item, .folder-item, .root-item'); // 包含資料夾
    visibleFileElements.forEach(el => {
        // 檢查元素是否實際可見 (更可靠的方式是檢查 offsetParent)
        if (el.offsetParent !== null && el.dataset.path) {
             visibleItems.push(el.dataset.path);
        }
    });
    // 獲取可見的片段項目
    const visibleSnippetElements = snippetListElement.querySelectorAll('.snippet-item');
    visibleSnippetElements.forEach(el => {
        if (el.offsetParent !== null && el.dataset.id) {
            visibleItems.push(el.dataset.id);
        }
    });
    return visibleItems;
}


/**
 * 處理項目行點擊 (視覺選取 - 檔案或片段)
 * @param {Event} event - 點擊事件
 * @param {object} item - 被點擊的項目物件 (TreeNode 或 Snippet)
 * @param {HTMLElement} itemElement - 被點擊的 DOM 元素
 */
export function handleItemClick(event, item, itemElement) {
    // 阻止 Checkbox、展開圖示、刪除按鈕觸發
    if (event.target.classList.contains('item-checkbox') ||
        event.target.closest('.expand-icon') ||
        event.target.closest('.delete-snippet-button')) {
        return;
    }

    event.preventDefault(); // 防止文字選取

    // --- Click Delay Logic ---
    if (clickTimeout && clickTargetElement === itemElement) {
        // Double click detected (or rapid clicks) - clear timeout and do nothing for click action
        clearTimeout(clickTimeout);
        clickTimeout = null;
        clickTargetElement = null;
        console.log("Double click detected, ignoring single click action.");
        // 如果需要雙擊動作，可以在這裡添加
        // 例如：執行勾選操作？
        // handleCheckboxClick(event, item, itemElement.querySelector('.item-checkbox'));
        return; // Stop further processing for this click
    }

    // Clear previous timeout if clicking a different element
    if (clickTimeout) {
        clearTimeout(clickTimeout);
    }

    clickTargetElement = itemElement; // Store the target element for double click check
    clickTimeout = setTimeout(() => {
        // --- Execute Single Click Action after delay ---
        console.log("Executing single click action.");
        const state = getState();
        const currentIdOrPath = item.id || item.path; // 獲取 ID 或路徑
        const isCtrlPressed = event.ctrlKey || event.metaKey;
        const isShiftPressed = event.shiftKey;
        const isSimpleClick = !isCtrlPressed && !isShiftPressed;

        let newSelection = new Set(state.currentVisualSelection); // 複製當前選取

        if (isShiftPressed && state.lastClickedPathForShift) {
            // --- Shift 選取 ---
            const visibleIdsOrPaths = getVisibleItemIds();
            const lastIndex = visibleIdsOrPaths.indexOf(state.lastClickedPathForShift);
            const currentIndex = visibleIdsOrPaths.indexOf(currentIdOrPath);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);
                if (!isCtrlPressed) {
                    newSelection.clear(); // Shift 單獨使用時清除原有選取
                }
                for (let i = start; i <= end; i++) {
                    if (visibleIdsOrPaths[i]) {
                        newSelection.add(visibleIdsOrPaths[i]);
                    }
                }
            } else {
                // 如果找不到上次點擊或當前點擊的項目 (可能被過濾掉了)，則退化為普通單擊
                newSelection.clear();
                newSelection.add(currentIdOrPath);
                setLastClickedPathForShift(currentIdOrPath);
            }
        } else if (isCtrlPressed) {
            // --- Ctrl 選取 (Toggle) ---
            if (newSelection.has(currentIdOrPath)) {
                newSelection.delete(currentIdOrPath);
            } else {
                newSelection.add(currentIdOrPath);
            }
            setLastClickedPathForShift(currentIdOrPath); // Ctrl 點擊也更新 shift 起點
        } else {
            // --- 普通單擊 (單選) ---
            newSelection.clear();
            newSelection.add(currentIdOrPath);
            setLastClickedPathForShift(currentIdOrPath);
        }

        setVisualSelection(newSelection); // 更新狀態
        renderFileList(); // 觸發 UI 更新

        // --- 處理普通單擊的開啟/預覽邏輯 ---
        if (isSimpleClick) {
            // **** 修改判斷邏輯 ****
            // 1. 優先判斷是否為片段 (根據 item 是否有 id 和 relativePath)
            if (item.id && item.relativePath) { // 這是片段
                // 確保 state.snippetMap 中確實存在這個片段 (可選但更安全)
                if (state.snippetMap[item.id]) {
                    sendMessageToExtension({
                        command: 'viewSnippet',
                        snippetId: item.id
                    });
                    console.log(`Requesting to view snippet: ${item.id}`);
                } else {
                     console.warn(`Clicked snippet item not found in snippetMap: ${item.id}`);
                }
            }
            // 2. 如果不是片段，再判斷是否為檔案 (根據 itemMap 和 item.type)
            else if (state.itemMap[currentIdOrPath] && item.type === 'file' && item.fsPath) { // 這是檔案
                sendMessageToExtension({
                    command: 'viewFile',
                    filePath: item.fsPath // 發送絕對路徑
                });
                console.log(`Requesting to view file: ${item.fsPath}`);
            }
            // 3. 如果都不是（例如點擊了資料夾或根節點，或者 itemMap/snippetMap 中找不到）
            else {
                // 可以選擇在這裡處理資料夾點擊（例如展開/摺疊），或者像現在一樣忽略
                if (!state.itemMap[currentIdOrPath] && !state.snippetMap[currentIdOrPath]) {
                     console.warn("Clicked item not found in itemMap or snippetMap:", currentIdOrPath);
                } else if (item.type === 'folder' || item.type === 'root') {
                     console.log("Simple click on folder/root ignored:", currentIdOrPath);
                     // 如果需要點擊資料夾觸發展開/摺疊，可以在這裡調用 toggleFolderExpansionHandler(item.path)
                     // toggleFolderExpansionHandler(item.path);
                } else {
                     console.log("Simple click on other item type ignored:", currentIdOrPath, item.type);
                }
            }
        }

        // Reset click tracking after action
        clickTimeout = null;
        clickTargetElement = null;

    }, CLICK_DELAY); // Execute after CLICK_DELAY ms
}


/**
 * 處理 Checkbox 點擊 (更新勾選狀態 - 檔案)
 * @param {Event} event - 點擊事件
 * @param {object} item - 被點擊的檔案項目物件 (TreeNode)
 * @param {HTMLInputElement} checkbox - 被點擊的 Checkbox 元素
 */
export function handleCheckboxClick(event, item, checkbox) {
    event.stopPropagation(); // 阻止冒泡到 handleItemClick

    // Clear any pending single click action when checkbox is clicked
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        clickTargetElement = null;
    }

    const state = getState();
    const currentPath = item.path;
    const isChecked = checkbox.checked; // 點擊後的目標狀態

    const parentItemElement = checkbox.closest('.file-item, .folder-item, .root-item'); // 包含資料夾
    const isVisuallySelected = parentItemElement && parentItemElement.classList.contains('selected');

    let pathsToUpdate = new Set();
    let snippetIdsToUpdate = new Set(); // 片段 ID 集合

    // 檢查點擊的是否為視覺選取中的項目
    if (isVisuallySelected && state.currentVisualSelection.size > 1 && state.currentVisualSelection.has(currentPath)) {
        // 如果點擊的是視覺選取中的項目 (且不只選取一個，且包含當前點擊項)，則應用於所有視覺選取的項目
        state.currentVisualSelection.forEach(idOrPath => {
            if (state.itemMap[idOrPath]) { // 是檔案路徑或資料夾路徑
                pathsToUpdate.add(idOrPath);
            } else if (state.snippetMap[idOrPath]) { // 是片段 ID
                snippetIdsToUpdate.add(idOrPath);
            }
        });
    } else {
        // 否則，只操作當前點擊的項目 (檔案或資料夾)
        pathsToUpdate.add(currentPath);
        // 同時，清除其他視覺選取，並將當前項設為唯一視覺選取
        clearVisualSelection();
        addToVisualSelection(currentPath);
        setLastClickedPathForShift(currentPath);
    }

    // 批量更新 state.selectedFiles 和 state.selectedSnippets
    batchUpdateSelectionState(pathsToUpdate, snippetIdsToUpdate, isChecked);

    // 重新渲染以更新 Checkbox 狀態和摘要
    renderFileList();
}

/**
 * 處理資料夾展開/摺疊圖示點擊
 * @param {string} folderPath - 被點擊的資料夾路徑
 */
export function toggleFolderExpansionHandler(folderPath) {
    // Clear any pending single click action
     if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        clickTargetElement = null;
    }
    toggleFolderExpansion(folderPath); // 更新狀態
    renderFileList(); // 觸發 UI 更新
}


// --- Snippet Event Handlers ---

/**
 * 處理片段項目行點擊 (現在由 handleItemClick 統一處理)
 * @param {Event} event - 點擊事件
 * @param {object} snippet - 被點擊的片段物件
 * @param {HTMLElement} itemElement - 被點擊的 DOM 元素
 */
export function handleSnippetClick(event, snippet, itemElement) {
    // This function is now effectively handled by handleItemClick
    // We keep it separate in ui.js for clarity in attaching listeners,
    // but the core logic (delay, selection, view request) is in handleItemClick.
    handleItemClick(event, snippet, itemElement);
}

/**
 * 處理片段 Checkbox 點擊 (更新勾選狀態)
 * @param {Event} event - 點擊事件
 * @param {object} snippet - 被點擊的片段物件
 * @param {HTMLInputElement} checkbox - 被點擊的 Checkbox 元素
 */
export function handleSnippetCheckboxClick(event, snippet, checkbox) {
    event.stopPropagation(); // 阻止冒泡到 handleSnippetClick/handleItemClick

    // Clear any pending single click action when checkbox is clicked
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        clickTargetElement = null;
    }

    const state = getState();
    const currentId = snippet.id;
    const isChecked = checkbox.checked; // 點擊後的目標狀態

    const parentItemElement = checkbox.closest('.snippet-item');
    const isVisuallySelected = parentItemElement && parentItemElement.classList.contains('selected');

    let pathsToUpdate = new Set();
    let snippetIdsToUpdate = new Set();

    // 檢查點擊的是否為視覺選取中的項目
    if (isVisuallySelected && state.currentVisualSelection.size > 1 && state.currentVisualSelection.has(currentId)) {
        // 如果點擊的是視覺選取中的項目 (且不只選取一個，且包含當前點擊項)，則應用於所有視覺選取的項目
        state.currentVisualSelection.forEach(idOrPath => {
            if (state.itemMap[idOrPath] && !state.snippetMap[idOrPath]) { // 是檔案/資料夾路徑
                pathsToUpdate.add(idOrPath);
            } else if (state.snippetMap[idOrPath]) { // 是片段 ID
                snippetIdsToUpdate.add(idOrPath);
            }
        });
    } else {
        // 否則，只操作當前點擊的片段
        snippetIdsToUpdate.add(currentId);
        // 同時，清除其他視覺選取，並將當前項設為唯一視覺選取
        clearVisualSelection();
        addToVisualSelection(currentId);
        setLastClickedPathForShift(currentId);
    }

    // 批量更新 state.selectedFiles 和 state.selectedSnippets
    batchUpdateSelectionState(pathsToUpdate, snippetIdsToUpdate, isChecked);

    // 重新渲染以更新 Checkbox 狀態和摘要
    renderFileList();
}


/**
 * 處理片段刪除按鈕點擊
 * @param {Event} event - 點擊事件
 * @param {object} snippet - 被點擊的片段物件
 */
export function handleSnippetDeleteClick(event, snippet) {
    event.stopPropagation(); // 阻止冒泡

     // Clear any pending single click action
     if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        clickTargetElement = null;
    }

    // 可選：顯示確認對話框
    // if (!confirm(`確定要移除片段 "${snippet.relativePath} (${snippet.startLine}-${snippet.endLine})" 嗎？`)) {
    //     return;
    // }

    sendMessageToExtension({
        command: 'removeSnippet',
        snippetId: snippet.id
    });
    console.log(`請求移除片段: ${snippet.id}`);

    // 從視覺選取中移除（如果存在）
    removeFromVisualSelection(snippet.id);
    // 從勾選狀態中移除 (如果存在)
    if (getState().selectedSnippets.has(snippet.id)) {
         batchUpdateSelectionState(new Set(), new Set([snippet.id]), false); // 更新勾選狀態
    }
    // UI 會在收到後端的 updateState 消息後重新渲染
    // 但為了更即時的反饋，可以先手動從 UI 移除，或者等待後端消息
    // renderFileList(); // 可以選擇在這裡立即重繪，但後端更新更可靠
}