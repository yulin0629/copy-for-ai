// media/contextExplorer/events.js
import { getState, setFilter, setShowSelectedOnly, toggleFolderExpansion, batchUpdateSelectionState, clearVisualSelection, setVisualSelection, addToVisualSelection, removeFromVisualSelection, setLastClickedPathForShift, getSelectedFilePaths, saveSelectionAndExpansionState } from './state.js';
import { filterInput, clearFilterButton, showSelectedOnlyCheckbox, fileListContainer, fileListElement, copyButton, renderFileList, updateClearButtonVisibility } from './ui.js';
import { sendMessageToExtension } from './vscodeApi.js';

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
    copyButton.addEventListener('click', handleCopyClick);

    // 點擊列表空白處取消視覺選取
    fileListContainer.addEventListener('click', (event) => {
        // 確保點擊的是容器本身而不是裡面的項目
        if (event.target === fileListContainer || event.target === fileListElement) {
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
    const state = getState();
    if (state.copyInProgress) return;

    const selectedFilePaths = getSelectedFilePaths();

    if (selectedFilePaths.length === 0) {
        // showMessage 在 ui.js 中
        import('./ui.js').then(ui => ui.showMessage('請先勾選至少一個檔案'));
        return;
    }

    // 更新狀態和 UI (通過 ui.js)
    state.copyInProgress = true; // 直接修改 state 中的標誌位
    import('./ui.js').then(ui => ui.updateCopyButtonStatus({ status: 'started' }));


    // 發送複製請求
    sendMessageToExtension({
        command: 'copyToClipboard',
        selectedFiles: selectedFilePaths
    });

    console.log(`將 ${selectedFilePaths.length} 個已勾選檔案發送給後端複製`, selectedFilePaths);
}

/**
 * 處理項目行點擊 (視覺選取)
 * @param {Event} event - 點擊事件
 * @param {object} item - 被點擊的項目物件
 * @param {HTMLElement} itemElement - 被點擊的 DOM 元素
 */
export function handleItemClick(event, item, itemElement) {
    // 阻止 Checkbox 或展開圖示觸發
    if (event.target.classList.contains('file-checkbox') || event.target.classList.contains('expand-icon')) {
        return;
    }

    const state = getState();
    const currentPath = item.path;
    const isCtrlPressed = event.ctrlKey || event.metaKey;
    const isShiftPressed = event.shiftKey;

    event.preventDefault(); // 防止文字選取

    let newSelection = new Set(state.currentVisualSelection); // 複製當前選取

    if (isShiftPressed && state.lastClickedPathForShift) {
        // --- Shift 選取 ---
        const allVisibleItemElements = Array.from(fileListElement.querySelectorAll('.file-item'));
        const visiblePaths = allVisibleItemElements.map(el => el.dataset.path).filter(Boolean); // 過濾掉 undefined 或空字串

        const lastIndex = visiblePaths.indexOf(state.lastClickedPathForShift);
        const currentIndex = visiblePaths.indexOf(currentPath);

        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);

            if (!isCtrlPressed) {
                newSelection.clear(); // Shift 單獨按下，清除原有選取
            }

            for (let i = start; i <= end; i++) {
                if (visiblePaths[i]) {
                    newSelection.add(visiblePaths[i]);
                }
            }
            // Shift 選取不更新錨點 (lastClickedPathForShift)
        } else {
            // 找不到錨點或當前項，按普通單擊處理
            newSelection.clear();
            newSelection.add(currentPath);
            setLastClickedPathForShift(currentPath);
        }
    } else if (isCtrlPressed) {
        // --- Ctrl 選取 (Toggle) ---
        if (newSelection.has(currentPath)) {
            newSelection.delete(currentPath);
        } else {
            newSelection.add(currentPath);
        }
        setLastClickedPathForShift(currentPath); // 更新錨點
    } else {
        // --- 普通單擊 (單選) ---
        newSelection.clear();
        newSelection.add(currentPath);
        setLastClickedPathForShift(currentPath); // 更新錨點
    }

    setVisualSelection(newSelection); // 更新狀態
    renderFileList(); // 觸發 UI 更新
}


/**
 * 處理 Checkbox 點擊 (更新勾選狀態)
 * @param {Event} event - 點擊事件
 * @param {object} item - 被點擊的項目物件
 * @param {HTMLInputElement} checkbox - 被點擊的 Checkbox 元素
 */
export function handleCheckboxClick(event, item, checkbox) {
    event.stopPropagation(); // 阻止冒泡

    const state = getState();
    const currentPath = item.path;
    const isChecked = checkbox.checked; // 點擊後的目標狀態

    const parentItemElement = checkbox.closest('.file-item');
    const isVisuallySelected = parentItemElement && parentItemElement.classList.contains('selected');

    let pathsToUpdate = new Set();

    if (isVisuallySelected && state.currentVisualSelection.size > 1) {
        // 如果點擊的是視覺選取中的項目 (且不只選取一個)，則應用於所有視覺選取的項目
        pathsToUpdate = new Set(state.currentVisualSelection);
    } else {
        // 否則，只操作當前點擊的項目
        pathsToUpdate.add(currentPath);
        // 同時，清除其他視覺選取，並將當前項設為唯一視覺選取
        clearVisualSelection();
        addToVisualSelection(currentPath);
        setLastClickedPathForShift(currentPath);
    }

    // 批量更新 state.selectionState
    batchUpdateSelectionState(pathsToUpdate, isChecked);

    // 重新渲染以更新 Checkbox 狀態和摘要
    renderFileList();
}


/**
 * 處理資料夾展開/摺疊圖示點擊
 * @param {string} folderPath - 被點擊的資料夾路徑
 */
export function toggleFolderExpansionHandler(folderPath) {
    toggleFolderExpansion(folderPath); // 更新狀態
    renderFileList(); // 觸發 UI 更新
}