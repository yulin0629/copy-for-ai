// Context Explorer WebView 的 JavaScript 實作
(function() {
    // 獲取 VS Code API
    const vscode = acquireVsCodeApi();

    // *** 新增：用於 Shift 選取和視覺選取的變數 ***
    let lastClickedPathForShift = null; // Shift 鍵選取的錨點
    let currentVisualSelection = new Set(); // 儲存當前視覺選取的項目路徑 (path)
    let itemMap = {}; // 用於快速查找 item 物件

    // 初始化狀態
    const state = {
        files: [],
        selectionState: {}, // Checkbox 的勾選狀態 { path: boolean }
        expandedFolders: {},
        filter: '',
        showSelectedOnly: false,
        tokenLimit: 0,
        copyInProgress: false,
        sessionId: '' // 會話 ID
    };

    // DOM 元素
    const filterInput = document.getElementById('filter-input');
    const clearFilterButton = document.getElementById('clear-filter');
    const showSelectedOnlyCheckbox = document.getElementById('show-selected-only');
    const fileListElement = document.getElementById('file-list');
    const selectedCountElement = document.getElementById('selected-count');
    const tokensCountElement = document.getElementById('tokens-count');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressPercentage = document.getElementById('progress-percentage');
    const copyButton = document.getElementById('copy-button');

    // 狀態管理器 - 統一管理狀態的保存和載入
    const stateManager = {
        // 保存 WebView UI 狀態
        saveUIState() {
            vscode.setState({
                filter: state.filter,
                showSelectedOnly: state.showSelectedOnly,
                sessionId: state.sessionId
                // 注意：視覺選取狀態 (currentVisualSelection) 通常不保存，因為它是暫時的 UI 狀態
            });
        },

        // 載入 WebView UI 狀態
        loadUIState() {
            const savedState = vscode.getState();
            if (!savedState) return false;

            if (savedState.sessionId === state.sessionId) {
                state.filter = savedState.filter || '';
                filterInput.value = state.filter;

                state.showSelectedOnly = !!savedState.showSelectedOnly;
                showSelectedOnlyCheckbox.checked = state.showSelectedOnly;

                return true;
            }
            return false;
        },

        // 保存檔案勾選狀態和展開狀態到擴展
        saveSelectionState() {
            vscode.postMessage({
                command: 'saveState',
                state: {
                    selectionState: state.selectionState,
                    expandedFolders: state.expandedFolders
                }
            });
        },

        // 儲存所有需要持久化的狀態
        saveAll() {
            this.saveUIState();
            this.saveSelectionState();
        },

        // 清除 UI 狀態
        clearUIState() {
            state.filter = '';
            filterInput.value = '';
            state.showSelectedOnly = false;
            showSelectedOnlyCheckbox.checked = false;
            this.saveUIState();
        }
    };

    // 防抖函數 - 用於搜尋輸入優化
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

    // 事件監聽器設置
    function setupEventListeners() {
        // 篩選框輸入事件 (使用防抖函數優化)
        filterInput.addEventListener('input', debounce(handleFilterChange, 300));

        // 清除篩選按鈕點擊事件
        clearFilterButton.addEventListener('click', clearFilter);

        // 篩選框按下 ESC 鍵清除
        filterInput.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                clearFilter();
            }
        });

        // 初始隱藏清除按鈕
        updateClearButtonVisibility();

        // 僅顯示已選取勾選框變更事件
        showSelectedOnlyCheckbox.addEventListener('change', handleShowSelectedOnlyChange);

        // 複製按鈕點擊事件
        copyButton.addEventListener('click', handleCopyClick);

        // *** 新增：點擊列表空白處取消所有視覺選取 ***
        fileListContainer.addEventListener('click', (event) => {
            if (event.target === fileListContainer || event.target === fileListElement) {
                clearVisualSelection();
                renderFileList(); // 重繪以移除高亮
            }
        });
    }

    // 初始化 WebView
    function initialize() {
        setupEventListeners();

        // 設置會話 ID (如果尚未設置)
        if (!state.sessionId) {
            state.sessionId = Date.now().toString();
        }

        // 使用狀態管理器載入 UI 狀態
        const uiStateLoaded = stateManager.loadUIState();

        if (!uiStateLoaded) {
            // 如果沒有載入到 UI 狀態，則清空
            state.filter = '';
            filterInput.value = '';
            state.showSelectedOnly = false;
            showSelectedOnlyCheckbox.checked = false;
        }

        // 根據篩選狀態更新清除按鈕可見性
        updateClearButtonVisibility();

        // 請求檔案列表
        vscode.postMessage({ command: 'getFiles' });
    }

    // 處理篩選變更
    function handleFilterChange() {
        state.filter = filterInput.value;
        updateClearButtonVisibility();
        clearVisualSelection(); // 篩選時清除視覺選取
        renderFileList();

        // 保存 UI 狀態
        stateManager.saveUIState();
    }

    // 更新清除按鈕可見性
    function updateClearButtonVisibility() {
        clearFilterButton.style.display = state.filter ? 'block' : 'none';
    }

    // 清除篩選
    function clearFilter() {
        state.filter = '';
        filterInput.value = '';
        updateClearButtonVisibility();
        clearVisualSelection(); // 清除篩選時清除視覺選取

        // 保存 UI 狀態
        stateManager.saveUIState();

        // 重新渲染檔案列表
        renderFileList();
    }

    // 處理僅顯示已選取變更
    function handleShowSelectedOnlyChange() {
        state.showSelectedOnly = showSelectedOnlyCheckbox.checked;
        clearVisualSelection(); // 切換顯示時清除視覺選取
        renderFileList();

        // 保存 UI 狀態
        stateManager.saveUIState();
    }

    // 複製按鈕點擊處理函數
    function handleCopyClick() {
        if (state.copyInProgress) {
            return;
        }

        // 獲取所有 *勾選* 的檔案路徑
        const selectedFilePaths = [];

        // 採用深度優先搜尋尋找所有勾選的檔案
        function findSelectedFiles(items) {
            for (const item of items) {
                // 只處理檔案類型且其勾選狀態為 true
                if (item.type === 'file' && state.selectionState[item.path]) {
                    // 使用 fsPath 或從 uri 解析
                    if (item.fsPath) {
                        selectedFilePaths.push(item.fsPath);
                    } else if (item.uri) {
                        try {
                            const fileUri = item.uri;
                            const path = decodeURIComponent(
                                fileUri.replace(/^file:\/\//, '')
                                      .replace(/^\/([a-zA-Z]:)/, '$1') // 處理 Windows 路徑
                            );
                            selectedFilePaths.push(path);
                        } catch (e) {
                            console.error(`無法解析檔案 URI: ${item.uri}`, e);
                        }
                    }
                } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                    // 遞迴處理子項目，即使資料夾本身可能未完全勾選
                    findSelectedFiles(item.children);
                }
            }
        }

        findSelectedFiles(state.files);

        if (selectedFilePaths.length === 0) {
            showMessage('請先勾選至少一個檔案');
            return;
        }

        // 設置複製中狀態
        state.copyInProgress = true;
        copyButton.disabled = true;
        copyButton.textContent = '複製中...';

        // 發送複製請求到擴展
        vscode.postMessage({
            command: 'copyToClipboard',
            selectedFiles: selectedFilePaths
        });

        console.log(`將 ${selectedFilePaths.length} 個已勾選檔案發送給後端複製`, selectedFilePaths);
    }

    // 顯示訊息在 WebView 中
    function showMessage(message, isError = false) {
        const messageElement = document.createElement('div');
        messageElement.className = isError ? 'message error' : 'message';
        messageElement.textContent = message;

        // 如果已經有訊息，移除它
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 加到 DOM 中
        document.body.appendChild(messageElement);

        // 5秒後自動移除
        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }

    // *** 新增：建立路徑到 item 物件的映射 ***
    function buildItemMap(items) {
        const map = {};
        function traverse(currentItems) {
            for (const item of currentItems) {
                map[item.path] = item;
                if ((item.type === 'folder' || item.type === 'root') && item.children) {
                    traverse(item.children);
                }
            }
        }
        traverse(items);
        return map;
    }

    // *** 新增：清除視覺選取狀態 ***
    function clearVisualSelection() {
        currentVisualSelection.clear();
        lastClickedPathForShift = null;
    }

    // 渲染檔案列表
    function renderFileList() {
        // 記錄當前滾動位置
        const scrollTop = fileListElement.parentElement.scrollTop;

        // 清空檔案列表
        fileListElement.innerHTML = '';

        // 確定是否為搜尋模式
        const isSearchMode = !!state.filter;

        if (state.files.length === 0 && !isSearchMode) {
             // 顯示無檔案狀態
             const emptyState = document.createElement('div');
             emptyState.className = 'empty-state';
             emptyState.innerHTML = `
                 <div class="empty-state-icon">🤷</div>
                 <div class="empty-state-message">工作區中沒有找到符合條件的檔案。<br>請檢查您的包含/排除設定。</div>
             `;
             fileListElement.appendChild(emptyState);
        } else if (isSearchMode) {
            // 搜尋模式：顯示扁平列表
            renderSearchResults();
        } else {
            // 一般模式：顯示樹狀結構
            // 渲染根層級的檔案和資料夾
            for (const item of state.files) {
                renderFileItem(item, 0);
            }
        }

        // 更新摘要
        updateSummary();

        // 恢復滾動位置
        fileListElement.parentElement.scrollTop = scrollTop;

        // *** 新增：渲染後建立 itemMap (如果 files 改變了) ***
        // buildItemMap 應該在 state.files 更新時調用，這裡調用可能冗餘，除非 files 在渲染中改變
        // itemMap = buildItemMap(state.files); // 移到 files 更新的地方
    }

    // 渲染搜尋結果為扁平列表
    function renderSearchResults() {
        // 收集所有符合篩選條件的檔案
        const matchingItems = [];

        // 深度優先搜尋找出符合的檔案
        function findMatchingItems(items, parentPath = '') {
            const filterLower = state.filter.toLowerCase();
            const filterKeywords = filterLower.split(' ').filter(k => k);

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
                        // 資料夾本身匹配，且不在 "僅顯示已選" 模式下，或其下有勾選的檔案
                        if (!state.showSelectedOnly || isItemOrChildrenSelected(item)) {
                             shouldAddItem = true;
                        }
                    }
                }

                // 如果項目本身符合條件，加入列表
                if (shouldAddItem) {
                    matchingItems.push({
                        item: item,
                        displayPath: displayPathSegment
                    });
                }

                // 無論父資料夾是否匹配，都要繼續遞迴搜索子項目
                // 但如果父資料夾匹配且已加入，其子項若也匹配，會重複，需要優化
                // 暫時策略：如果父項已加入，不再遞迴其子項（避免顯示層級混亂）
                // 修正：搜尋模式應該扁平化顯示所有匹配項，所以需要遞迴
                if ((item.type === 'folder' || item.type === 'root') && item.children) {
                    findMatchingItems(item.children, displayPathSegment);
                }
            }
        }

        findMatchingItems(state.files);

        // *** 去重：如果父資料夾和子檔案都匹配，可能會有重複的路徑感，但扁平列表需要都列出 ***
        // 排序
        matchingItems.sort((a, b) => a.displayPath.localeCompare(b.displayPath));

        // 渲染搜尋結果
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

    // 渲染單個搜尋結果項目
    function renderSearchResultItem(item, displayPath) {
        const itemElement = document.createElement('div');
        itemElement.className = 'file-item search-result';
        itemElement.dataset.path = item.path; // 設置 data-path

        // *** 新增：根據視覺選取狀態添加 selected class ***
        if (currentVisualSelection.has(item.path)) {
            itemElement.classList.add('selected');
        }

        // 創建勾選框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.dataset.path = item.path; // 方便事件處理

        // 設置勾選狀態 (基於 state.selectionState)
        if (item.type === 'file') {
            checkbox.checked = !!state.selectionState[item.path];
        } else if (item.type === 'folder' || item.type === 'root') {
            const folderState = getFolderSelectionState(item);
            checkbox.checked = folderState === 'all' || folderState === 'partial';
            checkbox.indeterminate = folderState === 'partial';
        }

        // *** 修改：行點擊事件處理視覺選取 ***
        itemElement.addEventListener('click', (event) => handleItemClick(event, item, itemElement));

        // *** 修改：Checkbox 點擊事件處理勾選狀態 ***
        checkbox.addEventListener('click', (event) => handleCheckboxClick(event, item, checkbox));

        itemElement.appendChild(checkbox);

        // 圖示
        const iconElement = document.createElement('span');
        iconElement.className = item.type === 'file' ? 'file-icon' :
                            (item.type === 'root' ? 'root-icon' : 'folder-icon');
        itemElement.appendChild(iconElement);

        // 名稱與路徑
        const nameContainer = document.createElement('div');
        nameContainer.className = 'search-result-container';
        const nameElement = document.createElement('span');
        nameElement.className = 'file-name';
        nameElement.textContent = item.name;
        const pathElement = document.createElement('span');
        pathElement.className = 'search-result-path';
        pathElement.textContent = displayPath;
        pathElement.title = item.path;
        nameContainer.appendChild(nameElement);
        nameContainer.appendChild(pathElement);
        itemElement.appendChild(nameContainer);

        // Tokens
        if (item.estimatedTokens !== undefined) {
            const tokensElement = document.createElement('span');
            tokensElement.className = 'file-tokens';
            tokensElement.textContent = formatTokens(item.estimatedTokens);
            itemElement.appendChild(tokensElement);
        }

        fileListElement.appendChild(itemElement);
    }

    // 渲染單個檔案項目 (樹狀結構)
    function renderFileItem(item, level) {
        // 檢查是否通過篩選條件 (僅在非搜尋模式下)
        // if (!state.filter && !passesFilter(item)) { // passesFilter 已包含 showSelectedOnly 邏輯
        //     return;
        // }
        // 修正：頂層調用 renderFileList 時已處理 showSelectedOnly，這裡遞迴時不需要再判斷 showSelectedOnly
        // 但如果父資料夾可見，其子項目即使不直接匹配 filter，也應顯示（如果父項展開）
        // 篩選邏輯在 renderSearchResults 中處理，這裡只處理 showSelectedOnly
        if (state.showSelectedOnly && !isItemOrChildrenSelected(item)) {
             // 如果是資料夾，即使自身未選，但子項有選，也應顯示以便展開
             if (item.type === 'file') return; // 檔案未選，直接跳過
             // 資料夾需要檢查子項
             let hasSelectedChild = false;
             if (item.children) {
                 for(const child of item.children) {
                     if (isItemOrChildrenSelected(child)) {
                         hasSelectedChild = true;
                         break;
                     }
                 }
             }
             if (!hasSelectedChild) return; // 資料夾及其子項都沒選，跳過
        }


        // 創建檔案項目元素
        const itemElement = document.createElement('div');
        itemElement.className = 'file-item';
        itemElement.dataset.path = item.path; // 設置 data-path
        itemElement.style.paddingLeft = `${10 + level * 20}px`; // 基礎 padding + 縮排

        // *** 新增：根據視覺選取狀態添加 selected class ***
        if (currentVisualSelection.has(item.path)) {
            itemElement.classList.add('selected');
        }

        // 創建勾選框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        checkbox.dataset.path = item.path; // 方便事件處理

        // 設置勾選狀態 (基於 state.selectionState)
        if (item.type === 'file') {
            checkbox.checked = !!state.selectionState[item.path];
        } else if (item.type === 'folder' || item.type === 'root') {
            const folderState = getFolderSelectionState(item);
            checkbox.checked = folderState === 'all' || folderState === 'partial';
            checkbox.indeterminate = folderState === 'partial';
        }

        // *** 修改：行點擊事件處理視覺選取 ***
        itemElement.addEventListener('click', (event) => handleItemClick(event, item, itemElement));

        // *** 修改：Checkbox 點擊事件處理勾選狀態 ***
        checkbox.addEventListener('click', (event) => handleCheckboxClick(event, item, checkbox));

        itemElement.appendChild(checkbox);

        // 展開/摺疊圖示 (僅用於資料夾)
        if ((item.type === 'folder' || item.type === 'root') && item.children && item.children.length > 0) {
            const expandIcon = document.createElement('span');
            expandIcon.className = 'expand-icon ' +
                                 (state.expandedFolders[item.path] ? 'expanded-icon' : 'collapsed-icon');
            expandIcon.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止觸發行點擊
                toggleFolderExpansion(item);
            });
            itemElement.appendChild(expandIcon);
        } else if (item.type === 'folder' || item.type === 'root') {
            // 佔位符，保持對齊
            const placeholder = document.createElement('span');
            placeholder.style.display = 'inline-block';
            placeholder.style.width = '16px'; // 與 expand-icon 同寬
            placeholder.style.marginRight = '4px';
            itemElement.appendChild(placeholder);
        }


        // 圖示
        const iconElement = document.createElement('span');
        iconElement.className = item.type === 'file' ? 'file-icon' :
                            (item.type === 'root' ? 'root-icon' : 'folder-icon');
        itemElement.appendChild(iconElement);

        // 名稱
        const nameElement = document.createElement('span');
        nameElement.className = 'file-name';
        nameElement.textContent = item.name;
        nameElement.title = item.path;
        itemElement.appendChild(nameElement);

        // Tokens
        if (item.estimatedTokens !== undefined) {
            const tokensElement = document.createElement('span');
            tokensElement.className = 'file-tokens';
            tokensElement.textContent = formatTokens(item.estimatedTokens);
            itemElement.appendChild(tokensElement);
        }

        // 添加到列表
        fileListElement.appendChild(itemElement);

        // 如果是展開的資料夾，渲染子項目
        if ((item.type === 'folder' || item.type === 'root') &&
            state.expandedFolders[item.path] &&
            item.children &&
            item.children.length > 0) {
            for (const child of item.children) {
                renderFileItem(child, level + 1);
            }
        }
    }

    // *** 新增：格式化 Tokens 顯示 ***
    function formatTokens(tokens) {
        if (state.tokenLimit > 0) {
            const percentage = Math.round((tokens / state.tokenLimit) * 100);
            return `${tokens} (${percentage}%)`;
        } else {
            return `${tokens}`;
        }
    }

    // 檢查項目是否通過篩選 (僅名稱和路徑，用於樹狀視圖決定是否顯示節點)
    // 注意：這個函數在搜尋模式下不被直接使用，搜尋模式有自己的匹配邏輯
    function passesFilter(item) {
        // // 如果僅顯示已選取，檢查選取狀態 (這個邏輯移到 renderFileItem 開頭)
        // if (state.showSelectedOnly && !isItemOrChildrenSelected(item)) {
        //     return false;
        // }

        // 如果沒有篩選，顯示所有項目
        if (!state.filter) {
            return true;
        }

        const filterLower = state.filter.toLowerCase();
        const nameLower = item.name.toLowerCase();

        // 檢查名稱是否包含篩選文字
        if (nameLower.includes(filterLower)) {
            return true;
        }

        // 檢查路徑是否包含篩選文字
        if (item.path && item.path.toLowerCase().includes(filterLower)) {
            return true;
        }

        // 如果是資料夾，遞迴檢查子項目是否有通過篩選的
        // 這會導致即使父資料夾名稱不匹配，只要子項匹配，父資料夾也會顯示
        // 這在樹狀結構中是期望的行為
        if ((item.type === 'folder' || item.type === 'root') && item.children) {
            for (const child of item.children) {
                if (passesFilter(child)) {
                    return true; // 只要有一個子項通過，父項就通過
                }
            }
        }

        return false; // 自身和所有子項都不匹配
    }


    // 檢查項目或其子項目是否已勾選 (基於 state.selectionState)
    function isItemOrChildrenSelected(item) {
        if (item.type === 'file') {
            return !!state.selectionState[item.path];
        }

        if ((item.type === 'folder' || item.type === 'root')) {
            // 先檢查自身是否在 selectionState (雖然不推薦直接勾選資料夾，但以防萬一)
            if (state.selectionState[item.path]) return true;
            // 檢查子項目
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

    // 獲取資料夾的勾選狀態 (全選/部分選取/未選取) - 基於 state.selectionState
    function getFolderSelectionState(folder) {
        if (!folder.children || folder.children.length === 0) {
            return 'none'; // 沒有子項目的資料夾無法判斷勾選狀態
        }

        let hasSelected = false;
        let hasUnselected = false;
        let fileCount = 0; // 只計算檔案數量

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
                // 如果已經同時存在選中和未選中，可以提前結束遞迴
                if (hasSelected && hasUnselected) {
                    return;
                }
            }
        }

        checkSelection(folder.children);

        if (fileCount === 0) return 'none'; // 資料夾下沒有檔案
        if (hasSelected && hasUnselected) return 'partial';
        if (hasSelected) return 'all';
        return 'none';
    }

    // *** 新增：處理行點擊事件 (視覺選取) ***
    function handleItemClick(event, item, itemElement) {
        // 阻止點擊 Checkbox 或展開圖示時觸發此事件
        if (event.target.classList.contains('file-checkbox') || event.target.classList.contains('expand-icon')) {
            return;
        }

        const currentPath = item.path;
        const isCtrlPressed = event.ctrlKey || event.metaKey; // metaKey for macOS Command key
        const isShiftPressed = event.shiftKey;

        event.preventDefault(); // 防止意外的文字選取等

        if (isShiftPressed && lastClickedPathForShift) {
            // --- Shift 選取 ---
            const allVisibleItemElements = Array.from(fileListElement.querySelectorAll('.file-item'));
            const visiblePaths = allVisibleItemElements.map(el => el.dataset.path);

            const lastIndex = visiblePaths.indexOf(lastClickedPathForShift);
            const currentIndex = visiblePaths.indexOf(currentPath);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);

                // 如果 Ctrl 也按下，則在現有選取基礎上添加/移除範圍
                // 否則，清除現有選取，只選取範圍
                if (!isCtrlPressed) {
                    currentVisualSelection.clear();
                }

                // 將範圍內的項目添加到視覺選取
                for (let i = start; i <= end; i++) {
                    const pathInRange = visiblePaths[i];
                    if (pathInRange) {
                        // Shift+Ctrl 的行為通常是添加範圍，如果已選則不變
                        // Shift 單獨按下則是設定選取為該範圍
                        // 這裡簡化：Shift總是添加範圍到 currentVisualSelection
                        currentVisualSelection.add(pathInRange);
                    }
                }
                // Shift 選取後，錨點通常不變，但最後點擊的項目變了
                // 更新錨點到當前點擊項，以便下次 Shift
                // lastClickedPathForShift = currentPath; // 不更新錨點，保持起始點
            } else {
                // 如果找不到錨點或當前項（可能被過濾），則按普通點擊處理
                currentVisualSelection.clear();
                currentVisualSelection.add(currentPath);
                lastClickedPathForShift = currentPath;
            }

        } else if (isCtrlPressed) {
            // --- Ctrl 選取 (Toggle) ---
            if (currentVisualSelection.has(currentPath)) {
                currentVisualSelection.delete(currentPath);
            } else {
                currentVisualSelection.add(currentPath);
            }
            // Ctrl 點擊後，將此項設為下次 Shift 的錨點
            lastClickedPathForShift = currentPath;

        } else {
            // --- 普通單擊 (單選) ---
            currentVisualSelection.clear();
            currentVisualSelection.add(currentPath);
            // 普通單擊後，將此項設為下次 Shift 的錨點
            lastClickedPathForShift = currentPath;
        }

        // 更新 UI 反映視覺選取變化
        renderFileList(); // 重新渲染以更新 .selected class
    }


    // *** 修改：處理 Checkbox 點擊事件 (更新 state.selectionState) ***
    function handleCheckboxClick(event, item, checkbox) {
        event.stopPropagation(); // 阻止事件冒泡觸發行點擊

        const currentPath = item.path;
        const isChecked = checkbox.checked; // 點擊後的目標狀態

        // 檢查被點擊的行是否處於視覺選取狀態
        const parentItemElement = checkbox.closest('.file-item');
        const isVisuallySelected = parentItemElement && parentItemElement.classList.contains('selected');

        let pathsToUpdate = new Set();

        if (isVisuallySelected && currentVisualSelection.size > 0) {
            // 如果點擊的是視覺選取中的項目，則將操作應用於所有視覺選取的項目
            pathsToUpdate = new Set(currentVisualSelection);
        } else {
            // 否則，只操作當前點擊的項目
            pathsToUpdate.add(currentPath);
            // 同時，清除其他視覺選取，並將當前項設為唯一視覺選取（模擬點擊行為）
            clearVisualSelection();
            currentVisualSelection.add(currentPath);
            lastClickedPathForShift = currentPath;
        }

        // 批量更新 state.selectionState
        pathsToUpdate.forEach(path => {
            const targetItem = itemMap[path];
            if (targetItem) {
                updateItemSelectionState(targetItem, isChecked);
            }
        });

        // 保存勾選狀態
        saveState();

        // 重新渲染以更新 Checkbox 狀態 (checked, indeterminate) 和摘要
        renderFileList();
    }

    // *** 新增：遞迴更新項目及其子項的勾選狀態 ***
    function updateItemSelectionState(item, isSelected) {
        if (item.type === 'file') {
            state.selectionState[item.path] = isSelected;
        } else if ((item.type === 'folder' || item.type === 'root')) {
            // 資料夾本身不記錄勾選狀態，但需要遞迴更新其子項
            // state.selectionState[item.path] = isSelected; // 通常不建議直接設定資料夾狀態
            if (item.children) {
                for (const child of item.children) {
                    updateItemSelectionState(child, isSelected);
                }
            }
        }
    }


    // 切換資料夾展開/摺疊狀態
    function toggleFolderExpansion(folder) {
        state.expandedFolders[folder.path] = !state.expandedFolders[folder.path];

        // 保存展開狀態
        stateManager.saveSelectionState(); // 只保存勾選和展開狀態

        // 重新渲染
        renderFileList();
    }

    // 更新摘要列
    function updateSummary() {
        // 計算 *勾選* 的檔案數量和 token 總量
        let fileCount = 0;
        let totalTokens = 0;

        // 計算 token 和檔案數 (基於 state.selectionState)
        function countTokensAndFiles(items) {
            for (const item of items) {
                if (item.type === 'file' && state.selectionState[item.path]) {
                    fileCount++;
                    if (item.estimatedTokens !== undefined) {
                        totalTokens += item.estimatedTokens;
                    }
                } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                    // 遞迴計算子項
                    countTokensAndFiles(item.children);
                }
            }
        }

        countTokensAndFiles(state.files);

        // 更新介面
        selectedCountElement.textContent = `已勾選 ${fileCount} 個檔案`;
        tokensCountElement.textContent = `預估 ${totalTokens} tokens`;

        // 更新進度條
        if (state.tokenLimit > 0) {
            progressContainer.style.display = 'flex';
            const percentage = totalTokens === 0 ? 0 : Math.round((totalTokens / state.tokenLimit) * 100);
            progressBar.style.width = `${Math.min(100, percentage)}%`; // 進度條視覺上限 100%
            progressPercentage.textContent = `${percentage}%`; // 文字顯示實際百分比
            progressContainer.title = `${totalTokens} / ${state.tokenLimit} tokens (${percentage}%)`;
        } else {
            progressContainer.style.display = 'none';
        }

        // 啟用/禁用複製按鈕 (基於勾選數量)
        copyButton.disabled = fileCount === 0 || state.copyInProgress;
    }

    // 保存狀態 (勾選狀態和展開狀態)
    function saveState() {
        // 使用狀態管理器保存需要持久化的狀態
        stateManager.saveSelectionState();
        // UI 狀態（篩選、僅顯示已選）在各自操作後已保存
    }

    // 處理從擴展來的消息
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'initialize':
                // 初始化檔案列表和狀態
                state.files = message.files || [];
                itemMap = buildItemMap(state.files); // *** 初始化時建立 itemMap ***

                // 更新會話 ID
                if (message.sessionId) {
                    state.sessionId = message.sessionId;
                }

                // 從 savedState 中載入檔案勾選狀態和展開狀態
                state.selectionState = message.savedState?.selectionState || {};
                state.expandedFolders = message.savedState?.expandedFolders || {};

                // 嘗試載入 UI 狀態 (篩選、僅顯示已選)
                const uiStateLoaded = stateManager.loadUIState();
                if (!uiStateLoaded) {
                    stateManager.clearUIState();
                }

                // 處理 token 限制
                state.tokenLimit = message.tokenLimit || 0;

                // 預設展開根資料夾 (如果沒有保存的展開狀態)
                if (Object.keys(state.expandedFolders).length === 0 && state.files && state.files.length > 0) {
                    for (const rootItem of state.files) {
                        if (rootItem.type === 'folder' || rootItem.type === 'root') {
                            // 只有當根項目有子項時才預設展開
                            if (rootItem.children && rootItem.children.length > 0) {
                                state.expandedFolders[rootItem.path] = true;
                            }
                        }
                    }
                }

                // 清除舊的視覺選取
                clearVisualSelection();

                // 保存初始狀態 (主要是展開狀態，如果被修改了)
                saveState();

                // 渲染檔案列表
                renderFileList();
                break;

            case 'updateFiles':
                // 更新檔案列表
                state.files = message.files || [];
                itemMap = buildItemMap(state.files); // *** 更新時重建 itemMap ***
                clearVisualSelection(); // 檔案列表更新，清除視覺選取
                // 可能需要根據情況保留或更新 selectionState 和 expandedFolders
                // 例如，如果只是文件內容變更，不需要清除狀態
                // 如果是文件增刪，可能需要清理無效的 state
                // 此處暫不處理複雜的狀態同步，直接重繪
                renderFileList();

                if (message.reason) {
                    showMessage(`檔案列表已更新: ${message.reason}`);
                }
                break;

            case 'copyStatus':
                // 處理複製狀態更新
                handleCopyStatus(message);
                break;
            case 'updateTokenLimit':
                // 更新令牌限制並重新渲染以反映變更
                state.tokenLimit = message.tokenLimit || 0;
                renderFileList(); // 需要重繪以更新 token 百分比
                break;

            case 'updateSelection': // 這個命令現在可能意義不大，因為勾選狀態由 WebView 管理
                // 如果外部需要強制更新勾選狀態，可以在這裡處理
                state.selectionState = message.selectionState || {};
                clearVisualSelection(); // 外部更新勾選，清除本地視覺選取
                saveState();
                renderFileList();
                break;

            case 'updateState': // 同上，外部強制更新狀態
                if (message.state.selectionState) {
                    state.selectionState = message.state.selectionState;
                }
                if (message.state.expandedFolders) {
                    state.expandedFolders = message.state.expandedFolders;
                }
                clearVisualSelection();
                saveState();
                renderFileList();
                break;
        }
    });

    // 處理複製狀態更新
    function handleCopyStatus(message) {
        state.copyInProgress = false;
        // 重新計算勾選數量來決定按鈕是否可用
        let fileCount = 0;
        function countSelectedFiles(items) {
             for (const item of items) {
                 if (item.type === 'file' && state.selectionState[item.path]) {
                     fileCount++;
                 } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                     countSelectedFiles(item.children);
                 }
             }
        }
        countSelectedFiles(state.files);
        copyButton.disabled = fileCount === 0; // 根據實際勾選數量決定是否禁用
        copyButton.textContent = '複製到剪貼簿';

        switch (message.status) {
            case 'started': // 這個狀態可能不需要了，因為點擊時就設置了
                // state.copyInProgress = true;
                // copyButton.disabled = true;
                // copyButton.textContent = '複製中...';
                break;

            case 'completed':
                showMessage(`已成功複製 ${message.fileCount} 個檔案 (${message.totalTokens} tokens)`);
                break;

            case 'failed':
                showMessage(`複製失敗: ${message.error}`, true);
                break;
        }
    }

    // 添加訊息樣式 (如果 CSS 文件中沒有的話)
    // function addMessageStyles() { ... } // 已在 CSS 中定義

    // 啟動初始化
    initialize();
})();