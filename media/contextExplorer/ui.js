import { getState, getFolderSelectionState, isItemOrChildrenSelected, isSnippetSelected, calculateSelectedSummary, setCopyInProgress } from './state.js';
import { handleItemClick, handleCheckboxClick, toggleFolderExpansionHandler, handleSnippetClick, handleSnippetCheckboxClick, handleSnippetDeleteClick } from './events.js'; // 引入事件處理器
import { sendMessageToExtension } from './vscodeApi.js'; // 引入 sendMessageToExtension

// DOM 元素引用
export const filterInput = document.getElementById('filter-input');
export const clearFilterButton = document.getElementById('clear-filter');
export const showSelectedOnlyCheckbox = document.getElementById('show-selected-only');
// 檔案列表相關
export const fileListContainer = document.getElementById('file-list-container');
export const fileListElement = document.getElementById('file-list');
// 片段列表相關
export const snippetListContainer = document.getElementById('snippet-list-container');
export const snippetListElement = document.getElementById('snippet-list');
// 摘要相關
export const selectedCountElement = document.getElementById('selected-count');
export const tokensCountElement = document.getElementById('tokens-count');
export const progressContainer = document.getElementById('progress-container');
export const progressBar = document.getElementById('progress-bar');
export const progressPercentage = document.getElementById('progress-percentage');
export const copyButton = document.getElementById('copy-button');
// 可摺疊區塊
export const filesSection = document.getElementById('files-section');
export const snippetsSection = document.getElementById('snippets-section');


/**
 * 渲染整個檔案列表和片段列表
 */
export function renderFileList() {
    const state = getState();
    const fileScrollTop = fileListContainer.scrollTop; // 記錄滾動位置
    const snippetScrollTop = snippetListContainer.scrollTop;

    fileListElement.innerHTML = ''; // 清空列表
    snippetListElement.innerHTML = ''; // 清空片段列表

    const isSearchMode = !!state.filter;
    const filterLower = state.filter.toLowerCase();
    const filterKeywords = filterLower.split(' ').filter(k => k);

    // --- 渲染檔案列表 ---
    if (state.files.length === 0 && !isSearchMode) {
        renderEmptyState(fileListElement, '工作區中沒有找到符合條件的檔案。<br>請檢查您的包含/排除設定。');
    } else {
        const visibleFiles = renderFileTree(state.files, 0, isSearchMode, filterKeywords);
        if (visibleFiles === 0) {
            const message = isSearchMode
                ? `沒有符合「${state.filter}」的檔案${state.showSelectedOnly ? ' (在已選取中)' : ''}`
                : (state.showSelectedOnly ? '沒有符合條件的已選取檔案' : '沒有符合條件的檔案');
            renderEmptyState(fileListElement, message);
        }
    }

    // --- 渲染片段列表 ---
    if (state.snippets.length === 0 && !isSearchMode) {
         renderEmptyState(snippetListElement, '尚未添加任何程式碼片段。<br>在編輯器中選取程式碼，右鍵點擊並選擇 "Add Snippet to Copy For AI Explorer"。');
    } else {
        const visibleSnippets = renderSnippetList(state.snippets, isSearchMode, filterKeywords);
         if (visibleSnippets === 0) {
            const message = isSearchMode
                ? `沒有符合「${state.filter}」的片段${state.showSelectedOnly ? ' (在已選取中)' : ''}`
                : (state.showSelectedOnly ? '沒有符合條件的已選取片段' : '沒有符合條件的片段');
            renderEmptyState(snippetListElement, message);
        }
    }

    // 更新摘要和按鈕狀態
    updateSummary();

    // 恢復滾動位置
    fileListContainer.scrollTop = fileScrollTop;
    snippetListContainer.scrollTop = snippetScrollTop;

    // 更新可摺疊區塊的顯示狀態 (基於是否有內容 *或* 是否在搜尋模式)
    // 保持區塊總是可見，由內部 empty state 處理無內容情況
    filesSection.style.display = '';
    snippetsSection.style.display = '';
}

/**
 * 渲染無項目時的提示狀態
 * @param {HTMLElement} container - 要顯示提示的容器
 * @param {string} [message] - 自訂訊息
 */
function renderEmptyState(container, message) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    // 使用 ::before 顯示圖示，這裡只放訊息
    emptyState.innerHTML = `
        <div class="empty-state-icon"></div>
        <div class="empty-state-message">${message}</div>
    `;
    container.appendChild(emptyState);
}

/**
 * 遞迴渲染檔案樹或搜尋結果
 * @param {Array<object>} items - 當前層級的項目列表
 * @param {number} level - 當前縮排層級
 * @param {boolean} isSearchMode - 是否為搜尋模式
 * @param {Array<string>} filterKeywords - 搜尋關鍵字
 * @returns {number} - 實際渲染的項目數量
 */
function renderFileTree(items, level, isSearchMode, filterKeywords) {
    const state = getState();
    let renderedCount = 0;

    // 排序：資料夾優先，然後按名稱
    const sortedItems = [...items].sort((a, b) => {
        if (a.type === b.type) {
            return a.name.localeCompare(b.name);
        }
        return (a.type === 'folder' || a.type === 'root') ? -1 : 1;
    });

    for (const item of sortedItems) {
        const itemPathLower = item.path.toLowerCase();
        const nameLower = item.name.toLowerCase();
        // 搜尋模式下，檢查路徑或名稱是否匹配所有關鍵字
        const matchesSearch = !isSearchMode || filterKeywords.every(keyword => itemPathLower.includes(keyword) || nameLower.includes(keyword));
        // 檢查是否僅顯示已選
        const matchesSelectedOnly = !state.showSelectedOnly || isItemOrChildrenSelected(item);

        let shouldRender = false;
        let hasVisibleChild = false; // 移到迴圈開始處

        // 檢查子項目可見性 (需要在判斷 shouldRender 之前)
        if ((item.type === 'folder' || item.type === 'root') && item.children) {
            // 預先檢查子項目是否可見 (遞迴檢查)
            function checkChildrenVisibility(childrenToCheck) {
                for (const child of childrenToCheck) {
                    const childPathLower = child.path.toLowerCase();
                    const childNameLower = child.name.toLowerCase();
                    const childMatchesSearch = !isSearchMode || filterKeywords.every(keyword => childPathLower.includes(keyword) || childNameLower.includes(keyword));
                    const childMatchesSelectedOnly = !state.showSelectedOnly || isItemOrChildrenSelected(child);

                    if (childMatchesSearch && childMatchesSelectedOnly) {
                        return true; // 找到一個可見的子項目
                    }
                    // 如果子項目是資料夾且有子項，遞迴檢查
                    if ((child.type === 'folder' || child.type === 'root') && child.children && child.children.length > 0) {
                        // *** 修正遞迴邏輯：需要檢查子資料夾是否展開 ***
                        // 只有展開的子資料夾下的可見項才算
                        if (state.expandedFolders[child.path] && checkChildrenVisibility(child.children)) {
                            return true; // 遞迴找到可見子項目
                        }
                        // *** 或者，如果子資料夾本身就匹配，也算 ***
                        else if (childMatchesSearch && childMatchesSelectedOnly) {
                             return true;
                        }
                    }
                }
                return false; // 這一層沒有找到
            }
            hasVisibleChild = checkChildrenVisibility(item.children);
        }


        // 判斷是否渲染當前項目
        if (matchesSearch && matchesSelectedOnly) {
            shouldRender = true;
        } else if (!isSearchMode && hasVisibleChild && (item.type === 'folder' || item.type === 'root')) {
            // 非搜尋模式下，如果自身不匹配但有可見子項，資料夾本身也要渲染
            shouldRender = true;
        }
        // 搜尋模式下，只渲染直接匹配的檔案/片段，不渲染不匹配的資料夾


        if (shouldRender) {
            if (isSearchMode) {
                // 搜尋模式下只渲染匹配的檔案 (不渲染資料夾)
                if (item.type === 'file') {
                    renderSearchResultItem(item, item.path);
                    renderedCount++;
                } else if (item.type === 'folder' || item.type === 'root') {
                    // 搜尋模式下，如果資料夾本身匹配，遞迴渲染其子項 (尋找匹配的檔案)
                    if (item.children) {
                         renderedCount += renderFileTree(item.children, level, isSearchMode, filterKeywords);
                    }
                }
            } else {
                // 樹狀模式下渲染
                renderFileItem(item, level);
                renderedCount++;
                // 只有當資料夾展開且有可見子項時才遞迴渲染子項
                if ((item.type === 'folder' || item.type === 'root') && item.children && state.expandedFolders[item.path] /* && hasVisibleChild */) {
                    // *** 移除 hasVisibleChild 檢查，只要展開就遞迴，讓子層自己判斷是否渲染 ***
                    renderedCount += renderFileTree(item.children, level + 1, isSearchMode, filterKeywords);
                }
            }
        } else if (hasVisibleChild && (item.type === 'folder' || item.type === 'root') && item.children && !isSearchMode && state.expandedFolders[item.path]) {
             // 特殊情況：資料夾本身不滿足條件，但子項目滿足且資料夾已展開 (非搜尋模式)
             // 遞迴渲染子項目，但不渲染父資料夾本身
             renderedCount += renderFileTree(item.children, level + 1, isSearchMode, filterKeywords);
        }
    }
    return renderedCount;
}


/**
 * 渲染單個檔案項目 (樹狀結構)
 * @param {object} item - 檔案項目
 * @param {number} level - 縮排層級
 */
function renderFileItem(item, level) {
    const state = getState();
    const itemElement = document.createElement('div');
    itemElement.className = 'file-item';
    itemElement.dataset.path = item.path; // 使用 path 作為標識
    itemElement.dataset.type = item.type;
    itemElement.style.paddingLeft = `${10 + level * 20}px`;

    if (state.currentVisualSelection.has(item.path)) {
        itemElement.classList.add('selected');
    }
    // *** 新增：如果資料夾是展開的，添加 is-expanded class ***
    if ((item.type === 'folder' || item.type === 'root') && state.expandedFolders[item.path]) {
        itemElement.classList.add('is-expanded');
    }

    // Checkbox
    const checkbox = createCheckbox(item);
    itemElement.appendChild(checkbox);

    // Expand/Collapse Icon or Placeholder
    if ((item.type === 'folder' || item.type === 'root') && item.children && item.children.length > 0) {
        const expandIcon = createExpandIcon(item);
        itemElement.appendChild(expandIcon);
    } else if (item.type === 'folder' || item.type === 'root') {
        // Empty folder placeholder
        const placeholder = createIndentPlaceholder();
        itemElement.appendChild(placeholder);
    } else {
         // File needs alignment placeholder if folders have expand icons
         const placeholder = createIndentPlaceholder();
         itemElement.appendChild(placeholder);
    }


    // File/Folder Icon
    const iconElement = createIcon(item);
    itemElement.appendChild(iconElement);

    // Name
    const nameElement = createNameElement(item);
    itemElement.appendChild(nameElement);

    // Tokens
    if (item.estimatedTokens !== undefined) {
        const tokensElement = createTokensElement(item);
        itemElement.appendChild(tokensElement);
    }

    // --- 事件監聽器 ---
    itemElement.addEventListener('click', (event) => handleItemClick(event, item, itemElement));
    checkbox.addEventListener('click', (event) => handleCheckboxClick(event, item, checkbox));
    // --- ---

    fileListElement.appendChild(itemElement);
}

/**
 * 渲染單個搜尋結果項目 (檔案)
 * @param {object} item - 檔案項目
 * @param {string} displayPath - 顯示的路徑
 */
function renderSearchResultItem(item, displayPath) {
    const state = getState();
    const itemElement = document.createElement('div');
    // 統一使用 file-item 類，增加 search-result 區分樣式
    itemElement.className = 'file-item search-result';
    itemElement.dataset.path = item.path; // 使用 path 作為標識
    itemElement.dataset.type = item.type;

    if (state.currentVisualSelection.has(item.path)) {
        itemElement.classList.add('selected');
    }

    const checkbox = createCheckbox(item);
    itemElement.appendChild(checkbox);

    // Placeholder for alignment with tree view expand icon
    const placeholder = createIndentPlaceholder();
    itemElement.appendChild(placeholder);

    const iconElement = createIcon(item);
    itemElement.appendChild(iconElement);

    // 搜尋結果顯示名稱和路徑
    const nameContainer = document.createElement('div');
    nameContainer.className = 'search-result-container';

    const nameElement = document.createElement('span');
    nameElement.className = 'file-name';
    nameElement.textContent = item.name;
    nameContainer.appendChild(nameElement);

    const pathElement = document.createElement('span');
    pathElement.className = 'search-result-path';
    pathElement.textContent = item.path; // 直接顯示相對路徑
    pathElement.title = item.fsPath || item.path; // 完整路徑放在 title
    nameContainer.appendChild(pathElement);

    itemElement.appendChild(nameContainer);


    if (item.estimatedTokens !== undefined) {
        const tokensElement = createTokensElement(item);
        itemElement.appendChild(tokensElement);
    }

    // --- 事件監聽器 ---
    itemElement.addEventListener('click', (event) => handleItemClick(event, item, itemElement));
    checkbox.addEventListener('click', (event) => handleCheckboxClick(event, item, checkbox));
    // --- ---

    fileListElement.appendChild(itemElement);
}

/**
 * 渲染片段列表
 * @param {Array<object>} snippets - 片段列表
 * @param {boolean} isSearchMode - 是否為搜尋模式
 * @param {Array<string>} filterKeywords - 搜尋關鍵字
 * @returns {number} - 實際渲染的片段數量
 */
function renderSnippetList(snippets, isSearchMode, filterKeywords) {
    const state = getState();
    let renderedCount = 0;

    // 片段排序（可以按添加時間、檔名等，這裡暫時按檔名+行號）
    const sortedSnippets = [...snippets].sort((a, b) => {
        const pathCompare = a.relativePath.localeCompare(b.relativePath);
        if (pathCompare !== 0) return pathCompare;
        return a.startLine - b.startLine;
    });

    for (const snippet of sortedSnippets) {
        const snippetTextLower = `${snippet.relativePath} ${snippet.code}`.toLowerCase();
        // 搜尋模式下，檢查路徑或程式碼內容是否匹配
        const matchesSearch = !isSearchMode || filterKeywords.every(keyword => snippetTextLower.includes(keyword));
        // 檢查是否僅顯示已選
        const matchesSelectedOnly = !state.showSelectedOnly || isSnippetSelected(snippet);

        if (matchesSearch && matchesSelectedOnly) {
            renderSnippetItem(snippet);
            renderedCount++;
        }
    }
    return renderedCount;
}


/**
 * 渲染單個片段項目
 * @param {object} snippet - 片段物件
 */
function renderSnippetItem(snippet) {
    const state = getState();
    const itemElement = document.createElement('div');
    itemElement.className = 'snippet-item'; // 使用不同的 class
    itemElement.dataset.id = snippet.id; // 使用 id 作為標識
    itemElement.dataset.type = 'snippet';

    if (state.currentVisualSelection.has(snippet.id)) {
        itemElement.classList.add('selected');
    }

    // Checkbox
    const checkbox = createCheckbox(snippet); // 複用 createCheckbox
    itemElement.appendChild(checkbox);

    // Placeholder for alignment with file tree expand icon
    const placeholder = createIndentPlaceholder();
    itemElement.appendChild(placeholder);

    // Icon (使用不同的圖示)
    const iconElement = document.createElement('span');
    iconElement.className = 'snippet-icon'; // 使用 snippet-icon (CSS 會用 ::before)
    itemElement.appendChild(iconElement);

    // Snippet Info (Name + Line Range)
    const infoContainer = document.createElement('div');
    infoContainer.className = 'snippet-info-container';

    const nameElement = document.createElement('span');
    nameElement.className = 'snippet-name';
    // 顯示檔名和行號
    nameElement.textContent = `${snippet.relativePath} (${snippet.startLine}-${snippet.endLine})`;
    nameElement.title = snippet.code.substring(0, 100) + (snippet.code.length > 100 ? '...' : ''); // 預覽程式碼
    infoContainer.appendChild(nameElement);

    itemElement.appendChild(infoContainer);


    // Tokens
    if (snippet.estimatedTokens !== undefined) {
        const tokensElement = createTokensElement(snippet); // 複用
        itemElement.appendChild(tokensElement);
    }

    // Delete Button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-snippet-button';
    deleteButton.title = '移除此片段';
    deleteButton.innerHTML = '🗑️'; // Emoji for delete
    deleteButton.addEventListener('click', (event) => handleSnippetDeleteClick(event, snippet));
    itemElement.appendChild(deleteButton);


    // --- 事件監聽器 ---
    // 點擊整行觸發預覽
    itemElement.addEventListener('click', (event) => handleSnippetClick(event, snippet, itemElement));
    // Checkbox 點擊
    checkbox.addEventListener('click', (event) => handleSnippetCheckboxClick(event, snippet, checkbox));
    // --- ---

    snippetListElement.appendChild(itemElement);
}


// --- Helper functions for creating elements (部分複用，部分新增) ---

function createCheckbox(item) {
    const state = getState();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'item-checkbox';
    const idOrPath = item.id || item.path;
    checkbox.dataset.id = idOrPath;

    if (item.id && item.relativePath) { // 判斷是否為 Snippet
        checkbox.checked = state.selectedSnippets.has(item.id); // <-- 檢查 selectedSnippets
    } else if (item.type === 'file') { // 檔案
        checkbox.checked = state.selectedFiles.has(item.path);
    } else if (item.type === 'folder' || item.type === 'root') { // 資料夾/根目錄
        const folderState = getFolderSelectionState(item);
        checkbox.checked = folderState === 'all' || folderState === 'partial';
        checkbox.indeterminate = folderState === 'partial';
    }
    return checkbox;
}

function createExpandIcon(item) {
    // const state = getState(); // No longer needed here
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon'; // CSS 會用 ::before 顯示圖示, 並根據父元素的 is-expanded class 改變 content
    expandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolderExpansionHandler(item.path); // 調用事件處理器
    });
    return expandIcon;
}

function createIndentPlaceholder() {
    const placeholder = document.createElement('span');
    placeholder.className = 'indent-placeholder';
    return placeholder;
}

function createIcon(item) {
    const iconElement = document.createElement('span');
    // Assign class based on type, CSS ::before will handle the icon
    if (item.type === 'folder') {
        iconElement.className = 'folder-icon';
    } else if (item.type === 'root') {
        iconElement.className = 'root-icon';
    } else { // file
        iconElement.className = 'file-icon';
    }
    return iconElement;
}

function createNameElement(item) {
    const nameElement = document.createElement('span');
    nameElement.className = 'file-name';
    nameElement.textContent = item.name;
    nameElement.title = item.path; // 相對路徑放 title
    return nameElement;
}

function createTokensElement(item) {
    const state = getState();
    const tokensElement = document.createElement('span');
    tokensElement.className = 'item-tokens'; // 通用 class
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
    if (tokens === undefined || tokens === null) return '';
    if (tokenLimit > 0) {
        const percentage = tokens === 0 ? 0 : Math.max(1, Math.round((tokens / tokenLimit) * 100)); // 至少顯示 1%
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
    const { count, tokens, fileCount, snippetCount } = calculateSelectedSummary();

    let countText = `已勾選 ${count} 個項目`;
    if (fileCount > 0 && snippetCount > 0) {
        countText += ` (${fileCount} 檔案, ${snippetCount} 片段)`;
    } else if (fileCount > 0) {
        countText += ` (${fileCount} 檔案)`;
    } else if (snippetCount > 0) {
        countText += ` (${snippetCount} 片段)`;
    }
    selectedCountElement.textContent = countText;

    tokensCountElement.textContent = `預估 ${tokens} tokens`;

    if (state.tokenLimit > 0) {
        progressContainer.style.display = 'flex';
        const percentage = tokens === 0 ? 0 : Math.max(1, Math.round((tokens / state.tokenLimit) * 100)); // 至少 1%
        progressBar.style.width = `${Math.min(100, percentage)}%`;
        progressPercentage.textContent = `${percentage}%`;
        progressContainer.title = `${tokens} / ${state.tokenLimit} tokens (${percentage}%)`;
        // 根據百分比改變進度條顏色
        if (percentage > 100) {
            progressBar.classList.add('over-limit');
        } else {
            progressBar.classList.remove('over-limit');
        }

    } else {
        progressContainer.style.display = 'none';
    }

    copyButton.disabled = count === 0 || state.copyInProgress;
    copyButton.innerHTML = state.copyInProgress
        ? '⏳ 複製中...' // Loading emoji/text
        : '📋 複製到剪貼簿'; // Copy emoji
}

/**
 * 更新清除按鈕的可見性
 */
export function updateClearButtonVisibility() {
    const state = getState();
    clearFilterButton.style.display = state.filter ? 'inline-flex' : 'none'; // Use inline-flex for icon button
}

/**
 * 顯示訊息提示
 * @param {string} message - 要顯示的訊息
 * @param {boolean} [isError=false] - 是否為錯誤訊息
 */
export function showMessage(message, isError = false) {
    const messageElement = document.createElement('div');
    messageElement.className = isError ? 'message error' : 'message info';
    const icon = isError ? '❌' : 'ℹ️'; // Error/Info emoji
    // Use a span for the icon to apply styles if needed
    messageElement.innerHTML = `<span class="message-icon">${icon}</span> ${message}`;

    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }

    document.body.appendChild(messageElement);

    // 自動隱藏
    setTimeout(() => {
        messageElement.classList.add('fade-out');
        // 等待動畫完成後移除
        messageElement.addEventListener('animationend', () => messageElement.remove());
    }, 5000);

     // 點擊關閉
     messageElement.addEventListener('click', () => {
         messageElement.classList.add('fade-out');
         messageElement.addEventListener('animationend', () => messageElement.remove());
     });
}

/**
 * 更新複製按鈕狀態
 * @param {object} statusUpdate - 包含 status, fileCount, snippetCount, totalTokens, error 的物件
 */
export function updateCopyButtonStatus(statusUpdate) {
    // **** 添加日誌 ****
    console.log('[WebView UI] updateCopyButtonStatus called with:', statusUpdate);
    const stateBefore = getState(); // 獲取更新前的狀態
    console.log(`[WebView UI] State before update: copyInProgress=${stateBefore.copyInProgress}`);

    const { count } = calculateSelectedSummary();

    const defaultButtonText = '📋 複製到剪貼簿';
    const loadingButtonText = '⏳ 複製中...';

    switch (statusUpdate.status) {
        case 'started':
            console.log('[WebView UI] Status: started. Setting copyInProgress to true.');
            setCopyInProgress(true); // 調用 state 更新
            // 直接更新按鈕，不依賴 updateSummary
            copyButton.disabled = true;
            copyButton.innerHTML = loadingButtonText;
            break;
        case 'completed':
            console.log('[WebView UI] Status: completed. Setting copyInProgress to false.');
            setCopyInProgress(false); // 調用 state 更新
            // 直接更新按鈕
            copyButton.disabled = count === 0;
            copyButton.innerHTML = defaultButtonText;
            // 顯示成功訊息
            const fileMsg = statusUpdate.fileCount > 0 ? `${statusUpdate.fileCount} 個檔案` : '';
            const snippetMsg = statusUpdate.snippetCount > 0 ? `${statusUpdate.snippetCount} 個片段` : '';
            const joiner = fileMsg && snippetMsg ? '和' : '';
            showMessage(`已成功複製 ${fileMsg} ${joiner} ${snippetMsg} (${statusUpdate.totalTokens} tokens)`);
            break;
        case 'failed':
            console.log('[WebView UI] Status: failed. Setting copyInProgress to false.');
            setCopyInProgress(false); // 調用 state 更新
            // 直接更新按鈕
            copyButton.disabled = count === 0;
            copyButton.innerHTML = defaultButtonText;
            showMessage(`複製失敗: ${statusUpdate.error}`, true);
            break;
        default:
             console.log('[WebView UI] Status: unknown/default. Setting copyInProgress to false.');
             setCopyInProgress(false); // 調用 state 更新
             // 直接更新按鈕
             copyButton.disabled = count === 0;
             copyButton.innerHTML = defaultButtonText;
             break;
    }
    const stateAfter = getState(); // 獲取更新後的狀態
    console.log(`[WebView UI] State after update: copyInProgress=${stateAfter.copyInProgress}`);
    console.log(`[WebView UI] Button state after update: disabled=${copyButton.disabled}, innerHTML=${copyButton.innerHTML}`);
    // **** 移除對 updateSummary 的依賴，因為我們在這裡直接更新了按鈕 ****
    // console.log('[WebView UI] Calling updateSummary after status update');
    // updateSummary();
}

/**
 * 初始化 UI 狀態 (例如輸入框的值)
 */
export function initializeUI() {
    const state = getState();
    filterInput.value = state.filter;
    showSelectedOnlyCheckbox.checked = state.showSelectedOnly;
    clearFilterButton.innerHTML = '❌'; // Set clear button icon
    updateClearButtonVisibility();
    // 初始渲染一次列表
    renderFileList();
}