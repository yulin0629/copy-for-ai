// media/contextExplorer/ui.js
import { getState, getFolderSelectionState, isItemOrChildrenSelected, calculateSelectedSummary } from './state.js';
import { handleItemClick, handleCheckboxClick, toggleFolderExpansionHandler, clearFilter, handleCopyClick } from './events.js'; // 引入事件處理器

// DOM 元素引用
export const filterInput = document.getElementById('filter-input');
export const clearFilterButton = document.getElementById('clear-filter');
export const showSelectedOnlyCheckbox = document.getElementById('show-selected-only');
export const fileListElement = document.getElementById('file-list');
export const fileListContainer = document.querySelector('.file-list-container'); // 父容器
export const selectedCountElement = document.getElementById('selected-count');
export const tokensCountElement = document.getElementById('tokens-count');
export const progressContainer = document.getElementById('progress-container');
export const progressBar = document.getElementById('progress-bar');
export const progressPercentage = document.getElementById('progress-percentage');
export const copyButton = document.getElementById('copy-button');

/**
 * 渲染整個檔案列表
 */
export function renderFileList() {
    const state = getState();
    const scrollTop = fileListContainer.scrollTop; // 記錄滾動位置

    fileListElement.innerHTML = ''; // 清空列表

    const isSearchMode = !!state.filter;

    if (state.files.length === 0 && !isSearchMode) {
        renderEmptyState();
    } else if (isSearchMode) {
        renderSearchResults();
    } else {
        // 一般模式：渲染樹狀結構
        for (const item of state.files) {
            renderFileItem(item, 0);
        }
        // 如果樹渲染完後是空的 (可能因為 showSelectedOnly)
        if (fileListElement.children.length === 0) {
             renderEmptyState(state.showSelectedOnly ? '沒有符合條件的已選取項目' : '沒有符合條件的項目');
        }
    }

    updateSummary(); // 更新摘要資訊

    fileListContainer.scrollTop = scrollTop; // 恢復滾動位置
}

/**
 * 渲染無檔案或無結果時的提示狀態
 * @param {string} [message] - 自訂訊息
 */
function renderEmptyState(message = '工作區中沒有找到符合條件的檔案。<br>請檢查您的包含/排除設定。') {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
        <div class="empty-state-icon">🤷</div>
        <div class="empty-state-message">${message}</div>
    `;
    fileListElement.appendChild(emptyState);
}


/**
 * 渲染搜尋結果 (扁平列表)
 */
function renderSearchResults() {
    const state = getState();
    const matchingItems = [];
    const filterLower = state.filter.toLowerCase();
    const filterKeywords = filterLower.split(' ').filter(k => k);

    function findMatchingItems(items, parentPath = '') {
        for (const item of items) {
            const displayPathSegment = parentPath ? `${parentPath} › ${item.name}` : item.name;
            const pathLower = item.path.toLowerCase();
            let itemPathMatchesAllKeywords = filterKeywords.length > 0
                ? filterKeywords.every(keyword => pathLower.includes(keyword))
                : true;

            let shouldAddItem = false;
            if (itemPathMatchesAllKeywords) {
                if (item.type === 'file') {
                    if (!state.showSelectedOnly || state.selectionState[item.path]) {
                        shouldAddItem = true;
                    }
                } else if ((item.type === 'folder' || item.type === 'root')) {
                    if (!state.showSelectedOnly || isItemOrChildrenSelected(item)) {
                         shouldAddItem = true;
                    }
                }
            }

            if (shouldAddItem) {
                matchingItems.push({ item: item, displayPath: displayPathSegment });
            }

            // 繼續遞迴搜索子項目
            if ((item.type === 'folder' || item.type === 'root') && item.children) {
                findMatchingItems(item.children, displayPathSegment);
            }
        }
    }

    findMatchingItems(state.files);
    matchingItems.sort((a, b) => a.displayPath.localeCompare(b.displayPath));

    if (matchingItems.length === 0) {
        const emptyElement = document.createElement('div');
        emptyElement.className = 'empty-search';
        emptyElement.textContent = `沒有符合「${state.filter}」的項目${state.showSelectedOnly ? ' (在已選取中)' : ''}`;
        fileListElement.appendChild(emptyElement);
    } else {
        for (const { item, displayPath } of matchingItems) {
            renderSearchResultItem(item, displayPath);
        }
    }
}

/**
 * 渲染單個搜尋結果項目
 * @param {object} item - 檔案項目
 * @param {string} displayPath - 顯示的路徑
 */
function renderSearchResultItem(item, displayPath) {
    const state = getState();
    const itemElement = document.createElement('div');
    itemElement.className = 'file-item search-result';
    itemElement.dataset.path = item.path;

    if (state.currentVisualSelection.has(item.path)) {
        itemElement.classList.add('selected');
    }

    const checkbox = createCheckbox(item);
    itemElement.appendChild(checkbox);

    const iconElement = createIcon(item);
    itemElement.appendChild(iconElement);

    const nameContainer = document.createElement('div');
    nameContainer.className = 'search-result-container';
    const nameElement = document.createElement('span');
    nameElement.className = 'file-name';
    nameElement.textContent = item.name;
    const pathElement = document.createElement('span');
    pathElement.className = 'search-result-path';
    pathElement.textContent = displayPath;
    pathElement.title = item.path; // 完整路徑放在 title
    nameContainer.appendChild(nameElement);
    nameContainer.appendChild(pathElement);
    itemElement.appendChild(nameContainer);

    if (item.estimatedTokens !== undefined) {
        const tokensElement = createTokensElement(item);
        itemElement.appendChild(tokensElement);
    }

    // --- 事件監聽器 ---
    // 使用事件委派可能更高效，但為簡單起見，暫時直接綁定
    itemElement.addEventListener('click', (event) => handleItemClick(event, item, itemElement));
    checkbox.addEventListener('click', (event) => handleCheckboxClick(event, item, checkbox));
    // --- ---

    fileListElement.appendChild(itemElement);
}


/**
 * 渲染單個檔案項目 (樹狀結構)
 * @param {object} item - 檔案項目
 * @param {number} level - 縮排層級
 */
function renderFileItem(item, level) {
    const state = getState();

    // 僅顯示已選邏輯
    if (state.showSelectedOnly && !isItemOrChildrenSelected(item)) {
        if (item.type === 'file') return;
        let hasSelectedChild = false;
        if (item.children) {
            for(const child of item.children) {
                if (isItemOrChildrenSelected(child)) {
                    hasSelectedChild = true;
                    break;
                }
            }
        }
        if (!hasSelectedChild) return;
    }

    const itemElement = document.createElement('div');
    itemElement.className = 'file-item';
    itemElement.dataset.path = item.path;
    itemElement.style.paddingLeft = `${10 + level * 20}px`;

    if (state.currentVisualSelection.has(item.path)) {
        itemElement.classList.add('selected');
    }

    const checkbox = createCheckbox(item);
    itemElement.appendChild(checkbox);

    if ((item.type === 'folder' || item.type === 'root') && item.children && item.children.length > 0) {
        const expandIcon = createExpandIcon(item);
        itemElement.appendChild(expandIcon);
    } else if (item.type === 'folder' || item.type === 'root') {
        const placeholder = createIndentPlaceholder();
        itemElement.appendChild(placeholder);
    }

    const iconElement = createIcon(item);
    itemElement.appendChild(iconElement);

    const nameElement = createNameElement(item);
    itemElement.appendChild(nameElement);

    if (item.estimatedTokens !== undefined) {
        const tokensElement = createTokensElement(item);
        itemElement.appendChild(tokensElement);
    }

    // --- 事件監聽器 ---
    itemElement.addEventListener('click', (event) => handleItemClick(event, item, itemElement));
    checkbox.addEventListener('click', (event) => handleCheckboxClick(event, item, checkbox));
    // --- ---

    fileListElement.appendChild(itemElement);

    // 渲染子項目
    if ((item.type === 'folder' || item.type === 'root') && state.expandedFolders[item.path] && item.children) {
        // 子項目排序：資料夾優先，然後按名稱
        const sortedChildren = [...item.children].sort((a, b) => {
            if (a.type === b.type) {
                return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });
        for (const child of sortedChildren) {
            renderFileItem(child, level + 1);
        }
    }
}

// --- Helper functions for creating elements ---

function createCheckbox(item) {
    const state = getState();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-checkbox';
    checkbox.dataset.path = item.path;

    if (item.type === 'file') {
        checkbox.checked = !!state.selectionState[item.path];
    } else if (item.type === 'folder' || item.type === 'root') {
        const folderState = getFolderSelectionState(item);
        checkbox.checked = folderState === 'all' || folderState === 'partial';
        checkbox.indeterminate = folderState === 'partial';
    }
    return checkbox;
}

function createExpandIcon(item) {
    const state = getState();
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon ' + (state.expandedFolders[item.path] ? 'expanded-icon' : 'collapsed-icon');
    expandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolderExpansionHandler(item.path); // 調用事件處理器
    });
    return expandIcon;
}

function createIndentPlaceholder() {
    const placeholder = document.createElement('span');
    placeholder.style.display = 'inline-block';
    placeholder.style.width = '16px';
    placeholder.style.marginRight = '4px';
    return placeholder;
}

function createIcon(item) {
    const iconElement = document.createElement('span');
    iconElement.className = item.type === 'file' ? 'file-icon' :
                        (item.type === 'root' ? 'root-icon' : 'folder-icon');
    return iconElement;
}

function createNameElement(item) {
    const nameElement = document.createElement('span');
    nameElement.className = 'file-name';
    nameElement.textContent = item.name;
    nameElement.title = item.path; // 完整路徑放 title
    return nameElement;
}

function createTokensElement(item) {
    const state = getState();
    const tokensElement = document.createElement('span');
    tokensElement.className = 'file-tokens';
    tokensElement.textContent = formatTokens(item.estimatedTokens, state.tokenLimit);
    return tokensElement;
}

/**
 * 格式化 Tokens 顯示
 * @param {number} tokens - Token 數量
 * @param {number} tokenLimit - Token 上限
 * @returns {string}
 */
function formatTokens(tokens, tokenLimit) {
    if (tokenLimit > 0) {
        const percentage = tokens === 0 ? 0 : Math.round((tokens / tokenLimit) * 100);
        return `${tokens} (${percentage}%)`;
    } else {
        return `${tokens}`;
    }
}

/**
 * 更新摘要列資訊
 */
export function updateSummary() {
    const state = getState();
    const { count, tokens } = calculateSelectedSummary();

    selectedCountElement.textContent = `已勾選 ${count} 個檔案`;
    tokensCountElement.textContent = `預估 ${tokens} tokens`;

    if (state.tokenLimit > 0) {
        progressContainer.style.display = 'flex';
        const percentage = tokens === 0 ? 0 : Math.round((tokens / state.tokenLimit) * 100);
        progressBar.style.width = `${Math.min(100, percentage)}%`;
        progressPercentage.textContent = `${percentage}%`;
        progressContainer.title = `${tokens} / ${state.tokenLimit} tokens (${percentage}%)`;
    } else {
        progressContainer.style.display = 'none';
    }

    copyButton.disabled = count === 0 || state.copyInProgress;
    copyButton.textContent = state.copyInProgress ? '複製中...' : '複製到剪貼簿';
}

/**
 * 更新清除按鈕的可見性
 */
export function updateClearButtonVisibility() {
    const state = getState();
    clearFilterButton.style.display = state.filter ? 'block' : 'none';
}

/**
 * 顯示訊息提示
 * @param {string} message - 要顯示的訊息
 * @param {boolean} [isError=false] - 是否為錯誤訊息
 */
export function showMessage(message, isError = false) {
    const messageElement = document.createElement('div');
    messageElement.className = isError ? 'message error' : 'message';
    messageElement.textContent = message;

    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }

    document.body.appendChild(messageElement);

    setTimeout(() => {
        messageElement.remove();
    }, 5000);
}

/**
 * 更新複製按鈕狀態
 * @param {object} statusUpdate - 包含 status, fileCount, totalTokens, error 的物件
 */
export function updateCopyButtonStatus(statusUpdate) {
    const state = getState();
    const { count } = calculateSelectedSummary(); // 重新計算當前勾選數量

    switch (statusUpdate.status) {
        case 'started':
            state.copyInProgress = true; // 更新內部狀態
            copyButton.disabled = true;
            copyButton.textContent = '複製中...';
            break;
        case 'completed':
            state.copyInProgress = false;
            copyButton.disabled = count === 0; // 根據實際勾選數決定是否禁用
            copyButton.textContent = '複製到剪貼簿';
            showMessage(`已成功複製 ${statusUpdate.fileCount} 個檔案 (${statusUpdate.totalTokens} tokens)`);
            break;
        case 'failed':
            state.copyInProgress = false;
            copyButton.disabled = count === 0;
            copyButton.textContent = '複製到剪貼簿';
            showMessage(`複製失敗: ${statusUpdate.error}`, true);
            break;
        default: // 處理未知狀態或僅更新按鈕文本/禁用狀態
             state.copyInProgress = false; // 假設未知狀態表示結束
             copyButton.disabled = count === 0;
             copyButton.textContent = '複製到剪貼簿';
             break;
    }
}

/**
 * 初始化 UI 狀態 (例如輸入框的值)
 */
export function initializeUI() {
    const state = getState();
    filterInput.value = state.filter;
    showSelectedOnlyCheckbox.checked = state.showSelectedOnly;
    updateClearButtonVisibility();
}