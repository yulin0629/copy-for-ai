// Context Explorer WebView 的 JavaScript 實作
(function() {
    // 獲取 VS Code API
    const vscode = acquireVsCodeApi();
    
    // 初始化狀態
    const state = {
        files: [],
        selectionState: {},
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
        
        // 保存檔案選擇狀態到擴展
        saveSelectionState() {
            vscode.postMessage({
                command: 'saveState',
                state: {
                    selectionState: state.selectionState,
                    expandedFolders: state.expandedFolders
                }
            });
        },
        
        // 儲存所有狀態
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
        
        // 保存 UI 狀態
        stateManager.saveUIState();
        
        // 重新渲染檔案列表
        renderFileList();
    }
    
    // 處理僅顯示已選取變更
    function handleShowSelectedOnlyChange() {
        state.showSelectedOnly = showSelectedOnlyCheckbox.checked;
        renderFileList();
        
        // 保存 UI 狀態
        stateManager.saveUIState();
    }
    
    // 複製按鈕點擊處理函數
    function handleCopyClick() {
        if (state.copyInProgress) {
            return;
        }
        
        // 獲取所有選取的檔案路徑
        const selectedFilePaths = [];
        
        // 採用深度優先搜尋尋找所有選取的檔案
        function findSelectedFiles(items) {
            for (const item of items) {
                if (item.type === 'file' && state.selectionState[item.path]) {
                    // 使用 fsPath 而不是 path 或 uri，確保使用檔案系統完整路徑
                    if (item.fsPath) {
                        selectedFilePaths.push(item.fsPath);
                    } else if (item.uri) {
                        // 如果沒有 fsPath，嘗試從 uri 解析
                        try {
                            const fileUri = item.uri;
                            // 移除 file:// 前綴
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
                    findSelectedFiles(item.children);
                }
            }
        }
        
        findSelectedFiles(state.files);
        
        if (selectedFilePaths.length === 0) {
            showMessage('請先選取至少一個檔案');
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
        
        console.log(`將 ${selectedFilePaths.length} 個檔案發送給後端複製`, selectedFilePaths);
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
    
    // 渲染檔案列表
    function renderFileList() {
        // 清空檔案列表
        fileListElement.innerHTML = '';
        
        // 確定是否為搜尋模式
        const isSearchMode = !!state.filter;
        
        if (isSearchMode) {
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
    }
    
    // 渲染搜尋結果為扁平列表
    function renderSearchResults() {
        // 收集所有符合篩選條件的檔案
        const matchingItems = [];
        
        // 深度優先搜尋找出符合的檔案
        function findMatchingItems(items, parentPath = '') {
            for (const item of items) {
                const fullPath = parentPath ? `${parentPath} › ${item.name}` : item.name;
                
                // 檢查項目本身是否符合篩選條件
                const itemMatchesFilter = item.name.toLowerCase().includes(state.filter) || 
                                         item.path.toLowerCase().includes(state.filter);
                
                // 同時包含匹配篩選條件的檔案和資料夾
                if (itemMatchesFilter) {
                    // 對於檔案，遵循"僅顯示已選取"設定
                    if (item.type === 'file') {
                        if (!state.showSelectedOnly || state.selectionState[item.path]) {
                            matchingItems.push({
                                item: item,
                                displayPath: fullPath
                            });
                        }
                    } else if ((item.type === 'folder' || item.type === 'root') && !state.showSelectedOnly) {
                        // 對於資料夾/根目錄，當不在"僅顯示已選取"模式時才添加到結果中
                        matchingItems.push({
                            item: item,
                            displayPath: fullPath
                        });
                    }
                }
                
                // 繼續搜索子項目
                if ((item.type === 'folder' || item.type === 'root') && item.children) {
                    findMatchingItems(item.children, fullPath);
                }
            }
        }
        
        findMatchingItems(state.files);
        
        // 渲染搜尋結果
        if (matchingItems.length === 0) {
            // 無搜尋結果
            const emptyElement = document.createElement('div');
            emptyElement.className = 'empty-search';
            emptyElement.textContent = `沒有符合「${state.filter}」的檔案`;
            fileListElement.appendChild(emptyElement);
        } else {
            // 渲染搜尋結果
            for (const { item, displayPath } of matchingItems) {
                renderSearchResultItem(item, displayPath);
            }
        }
    }
    
    // 渲染單個搜尋結果項目
    function renderSearchResultItem(item, displayPath) {
        const itemElement = document.createElement('div');
        itemElement.className = 'file-item search-result';
        
        // 創建勾選框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        
        // 設置勾選狀態
        if (item.type === 'file') {
            checkbox.checked = !!state.selectionState[item.path];
        } else if (item.type === 'folder' || item.type === 'root') {
            // 檢查資料夾的子項目是否已全部、部分或無勾選
            const folderState = getFolderSelectionState(item);
            checkbox.checked = folderState === 'all' || folderState === 'partial';
            checkbox.indeterminate = folderState === 'partial';
        }
        
        // 勾選事件
        checkbox.addEventListener('change', () => {
            handleItemSelection(item, checkbox.checked);
        });
        
        itemElement.appendChild(checkbox);
        
        // 檔案/資料夾圖示
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
        pathElement.title = item.path; // 提示完整路徑
        
        nameContainer.appendChild(nameElement);
        nameContainer.appendChild(pathElement);
        itemElement.appendChild(nameContainer);
        
        // Tokens 數量
        if (item.estimatedTokens !== undefined) {
            const tokensElement = document.createElement('span');
            tokensElement.className = 'file-tokens';
            
            if (state.tokenLimit > 0) {
                // 同樣移除百分比上限
                const percentage = Math.round((item.estimatedTokens / state.tokenLimit) * 100);
                tokensElement.textContent = `${item.estimatedTokens} (${percentage}%)`;
            } else {
                tokensElement.textContent = item.estimatedTokens;
            }
            
            itemElement.appendChild(tokensElement);
        }
        
        // 添加到列表
        fileListElement.appendChild(itemElement);
    }
    
    // 渲染單個檔案項目
    function renderFileItem(item, level) {
        // 檢查是否通過篩選條件
        if (!passesFilter(item)) {
            return;
        }
        
        // 創建檔案項目元素
        const itemElement = document.createElement('div');
        itemElement.className = 'file-item';
        itemElement.style.paddingLeft = `${level * 20}px`;
        
        // 創建勾選框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'file-checkbox';
        
        // 設置勾選狀態
        if (item.type === 'file') {
            checkbox.checked = !!state.selectionState[item.path];
        } else if (item.type === 'folder' || item.type === 'root') {
            // 檢查資料夾的子項目是否已全部、部分或無勾選
            const folderState = getFolderSelectionState(item);
            checkbox.checked = folderState === 'all' || folderState === 'partial';
            checkbox.indeterminate = folderState === 'partial';
        }
        
        // 勾選事件
        checkbox.addEventListener('change', () => {
            handleItemSelection(item, checkbox.checked);
        });
        
        itemElement.appendChild(checkbox);
        
        // 展開/摺疊圖示 (僅用於資料夾)
        if (item.type === 'folder' || item.type === 'root') {
            const expandIcon = document.createElement('span');
            expandIcon.className = 'expand-icon ' + 
                                 (state.expandedFolders[item.path] ? 'expanded-icon' : 'collapsed-icon');
            expandIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFolderExpansion(item);
            });
            itemElement.appendChild(expandIcon);
        }
        
        // 檔案/資料夾圖示
        const iconElement = document.createElement('span');
        if (item.type === 'root') {
            iconElement.className = 'root-icon';
        } else if (item.type === 'folder') {
            iconElement.className = 'folder-icon';
        } else {
            iconElement.className = 'file-icon';
        }
        itemElement.appendChild(iconElement);
        
        // 名稱
        const nameElement = document.createElement('span');
        nameElement.className = 'file-name';
        nameElement.textContent = item.name;
        nameElement.title = item.path; // 提示完整路徑
        itemElement.appendChild(nameElement);
        
        // Tokens 數量 (檔案與資料夾)
        if (item.estimatedTokens !== undefined) {
            const tokensElement = document.createElement('span');
            tokensElement.className = 'file-tokens';
            
            if (state.tokenLimit > 0) {
                // 移除 Math.min(100, ...) 限制，允許超過 100%
                const percentage = Math.round((item.estimatedTokens / state.tokenLimit) * 100);
                tokensElement.textContent = `${item.estimatedTokens} (${percentage}%)`;
            } else {
                tokensElement.textContent = item.estimatedTokens;
            }
            
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
    
    // 檢查項目是否通過篩選
    function passesFilter(item) {
        // 如果僅顯示已選取，檢查選取狀態
        if (state.showSelectedOnly && !isItemOrChildrenSelected(item)) {
            return false;
        }
        
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
        
        // 如果是資料夾，檢查子項目是否有通過篩選的
        if ((item.type === 'folder' || item.type === 'root') && item.children) {
            for (const child of item.children) {
                if (passesFilter(child)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // 檢查項目或其子項目是否已選取
    function isItemOrChildrenSelected(item) {
        if (item.type === 'file') {
            return !!state.selectionState[item.path];
        }
        
        if ((item.type === 'folder' || item.type === 'root') && item.children) {
            // 資料夾本身沒有選取狀態，檢查子項目
            for (const child of item.children) {
                if (isItemOrChildrenSelected(child)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // 獲取資料夾的選取狀態 (全選/部分選取/未選取)
    function getFolderSelectionState(folder) {
        if (!folder.children || folder.children.length === 0) {
            return 'none';
        }
        
        let selectedCount = 0;
        let totalFiles = 0;
        
        // 計算子項目的選取狀態
        function countSelected(item) {
            if (item.type === 'file') {
                totalFiles++;
                if (state.selectionState[item.path]) {
                    selectedCount++;
                }
            } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
                for (const child of item.children) {
                    countSelected(child);
                }
            }
        }
        
        // 計算資料夾內的所有檔案
        for (const child of folder.children) {
            countSelected(child);
        }
        
        if (selectedCount === 0) {
            return 'none';
        } else if (selectedCount === totalFiles) {
            return 'all';
        } else {
            return 'partial';
        }
    }
    
    // 處理項目選取
    function handleItemSelection(item, isSelected) {
        if (item.type === 'file') {
            // 單個檔案選取/取消選取
            state.selectionState[item.path] = isSelected;
        } else if ((item.type === 'folder' || item.type === 'root') && item.children) {
            // 資料夾選取/取消選取，連帶處理所有子項目
            selectAllChildren(item, isSelected);
        }
        
        // 保存狀態
        saveState();
        
        // 更新介面
        renderFileList();
    }
    
    // 選取/取消選取資料夾的所有子項目
    function selectAllChildren(folder, isSelected) {
        if (!folder.children) {
            return;
        }
        
        for (const child of folder.children) {
            if (child.type === 'file') {
                state.selectionState[child.path] = isSelected;
            } else if (child.type === 'folder' || child.type === 'root') {
                selectAllChildren(child, isSelected);
            }
        }
    }
    
    // 切換資料夾展開/摺疊狀態
    function toggleFolderExpansion(folder) {
        state.expandedFolders[folder.path] = !state.expandedFolders[folder.path];
        
        // 保存狀態
        saveState();
        
        // 重新渲染
        renderFileList();
    }
    
    // 更新摘要列
    function updateSummary() {
        // 計算選取的檔案數量和 token 總量
        let fileCount = 0;
        let totalTokens = 0;
        
        // 計算 token 和檔案數
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
        
        // 更新介面
        selectedCountElement.textContent = `已選取 ${fileCount} 個檔案`;
        tokensCountElement.textContent = `預估 ${totalTokens} tokens`;
        
        // 更新進度條
        if (state.tokenLimit > 0) {
            progressContainer.style.display = 'flex';
            // 移除百分比上限
            const percentage = Math.round((totalTokens / state.tokenLimit) * 100);
            
            // 設置進度條寬度，保持最大 100% 的視覺限制
            progressBar.style.width = `${Math.min(100, percentage)}%`;
            
            // 顯示真實百分比文字，即使超過 100%
            progressPercentage.textContent = `${percentage}%`;
            progressContainer.title = `${totalTokens} / ${state.tokenLimit} tokens (${percentage}%)`;
        } else {
            progressContainer.style.display = 'none';
        }
        
        // 啟用/禁用複製按鈕
        copyButton.disabled = fileCount === 0 || state.copyInProgress;
    }
    
    // 保存狀態
    function saveState() {
        // 使用狀態管理器保存所有狀態
        stateManager.saveAll();
    }
    
    // 處理從擴展來的消息
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'initialize':
                // 初始化檔案列表和狀態
                state.files = message.files || [];
                
                // 更新會話 ID
                if (message.sessionId) {
                    state.sessionId = message.sessionId;
                }
                
                // 從 savedState 中載入檔案選擇狀態和展開狀態
                // 無論會話 ID 是否變更，這些都應該從 workspaceState 中載入
                state.selectionState = message.savedState?.selectionState || {};
                state.expandedFolders = message.savedState?.expandedFolders || {};
                
                // 嘗試載入 UI 狀態
                const uiStateLoaded = stateManager.loadUIState();
                
                if (!uiStateLoaded) {
                    // 如果沒有載入到 UI 狀態，則清空
                    stateManager.clearUIState();
                }
                
                // 重要：處理 token 限制
                state.tokenLimit = message.tokenLimit || 0;
                
                // 預設展開根資料夾
                if (state.files && state.files.length > 0) {
                    for (const rootItem of state.files) {
                        if (rootItem.type === 'folder' || rootItem.type === 'root') {
                            state.expandedFolders[rootItem.path] = true;
                        }
                    }
                }
                
                // 保存初始狀態
                saveState();
                
                // 渲染檔案列表
                renderFileList();
                break;
                
            case 'updateFiles':
                // 更新檔案列表
                state.files = message.files || [];
                renderFileList();
                break;
                
            case 'copyStatus':
                // 處理複製狀態更新
                handleCopyStatus(message);
                break;
            case 'updateTokenLimit':
                // 更新令牌限制並重新渲染以反映變更
                state.tokenLimit = message.tokenLimit || 0;
                renderFileList();
                break;
                
            case 'updateSelection':
                // 更新選擇狀態
                state.selectionState = message.selectionState || {};
                
                // 如果不在篩選模式下，則需要展開對應的資料夾
                if (!state.filter) {
                    // 找出所有選中檔案的父資料夾路徑
                    Object.keys(state.selectionState).forEach(filePath => {
                        if (state.selectionState[filePath]) {
                            const parts = filePath.split('/');
                            let parentPath = '';
                            for (let i = 0; i < parts.length - 1; i++) {
                                parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
                                state.expandedFolders[parentPath] = true;
                            }
                        }
                    });
                }
                
                // 保存更新的狀態
                saveState();
                
                // 重新渲染檔案列表
                renderFileList();
                break;
                
            case 'updateState':
                // 更新整體狀態
                if (message.state.selectionState) {
                    state.selectionState = message.state.selectionState;
                }
                if (message.state.expandedFolders) {
                    state.expandedFolders = message.state.expandedFolders;
                }
                
                // 保存更新的狀態
                saveState();
                
                // 重新渲染檔案列表
                renderFileList();
                break;
        }
    });
    
    // 處理複製狀態更新
    function handleCopyStatus(message) {
        state.copyInProgress = false;
        copyButton.disabled = false;
        copyButton.textContent = '複製到剪貼簿';
        
        switch (message.status) {
            case 'started':
                state.copyInProgress = true;
                copyButton.disabled = true;
                copyButton.textContent = '複製中...';
                break;
                
            case 'completed':
                // 顯示成功訊息
                showMessage(`已成功複製 ${message.fileCount} 個檔案 (${message.totalTokens} tokens)`);
                break;
                
            case 'failed':
                // 顯示錯誤訊息
                showMessage(`複製失敗: ${message.error}`, true);
                break;
        }
    }
    
    // 添加訊息樣式
    function addMessageStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .message {
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                padding: 8px 16px;
                background-color: var(--vscode-editor-foreground);
                color: var(--vscode-editor-background);
                border-radius: 4px;
                z-index: 1000;
                max-width: 80%;
                text-align: center;
                animation: fadeIn 0.3s ease;
            }
            
            .message.error {
                background-color: var(--vscode-errorForeground, #f44336);
                color: white;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translate(-50%, -20px); }
                to { opacity: 1; transform: translate(-50%, 0); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // 初始化消息樣式
    addMessageStyles();
    
    // 啟動初始化
    initialize();
})();