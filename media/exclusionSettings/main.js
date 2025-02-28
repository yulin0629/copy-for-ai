// 排除規則設定頁面的 JavaScript
// 新檔案: media/exclusionSettings/main.js

(function() {
    // 獲取 VS Code API
    const vscode = acquireVsCodeApi();
    
    // 初始化狀態
    const state = {
        excludePatterns: [],
        followGitignore: true,
        gitignoreContent: ''
    };
    
    // DOM 元素
    const patternsListElement = document.getElementById('patterns-list');
    const followGitignoreCheckbox = document.getElementById('follow-gitignore');
    const gitignoreContentElement = document.getElementById('gitignore-content');
    const gitignorePreviewContainer = document.getElementById('gitignore-preview-container');
    const addPatternButton = document.getElementById('add-pattern');
    const saveButton = document.getElementById('save-patterns');
    const resetButton = document.getElementById('reset-patterns');
    const messageElement = document.getElementById('message');
    
    // 預設的排除規則
    const defaultPatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/bin/**'
    ];
    
    // 初始化頁面
    function initialize() {
        // 設定事件監聽器
        addPatternButton.addEventListener('click', addEmptyPattern);
        saveButton.addEventListener('click', savePatterns);
        resetButton.addEventListener('click', resetToDefaults);
        followGitignoreCheckbox.addEventListener('change', toggleGitignorePreview);
        
        // 請求目前的設定
        vscode.postMessage({ command: 'getExcludePatterns' });
    }
    
    // 處理從擴展來的訊息
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'excludePatterns':
                // 接收並顯示排除規則
                state.excludePatterns = message.patterns || [];
                state.followGitignore = message.followGitignore;
                state.gitignoreContent = message.gitignoreContent || '此專案沒有 .gitignore 檔案';
                
                // 更新 UI
                renderPatternsList();
                followGitignoreCheckbox.checked = state.followGitignore;
                gitignoreContentElement.textContent = state.gitignoreContent;
                toggleGitignorePreview();
                break;
                
            case 'updateSuccess':
                // 顯示成功訊息
                showMessage(message.message, false);
                break;
        }
    });
    
    // 渲染排除規則列表
    function renderPatternsList() {
        // 清空現有列表
        patternsListElement.innerHTML = '';
        
        // 如果沒有規則，顯示一個空白項目
        if (state.excludePatterns.length === 0) {
            addPatternItem('');
            return;
        }
        
        // 為每個規則建立一個項目
        state.excludePatterns.forEach(pattern => {
            addPatternItem(pattern);
        });
    }
    
    // 添加排除規則項目
    function addPatternItem(pattern) {
        const itemElement = document.createElement('div');
        itemElement.className = 'pattern-item';
        
        // 建立輸入框
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.className = 'pattern-input';
        inputElement.value = pattern;
        inputElement.placeholder = '輸入排除規則，例如 **/node_modules/**';
        
        // 建立刪除按鈕
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '✕';
        deleteButton.addEventListener('click', () => {
            patternsListElement.removeChild(itemElement);
        });
        
        // 添加到項目
        itemElement.appendChild(inputElement);
        itemElement.appendChild(deleteButton);
        
        // 添加到列表
        patternsListElement.appendChild(itemElement);
    }
    
    // 添加空白規則
    function addEmptyPattern() {
        addPatternItem('');
        
        // 讓最後一個輸入框獲得焦點
        const inputs = patternsListElement.querySelectorAll('.pattern-input');
        if (inputs.length > 0) {
            inputs[inputs.length - 1].focus();
        }
    }
    
    // 收集目前的規則
    function collectPatterns() {
        const inputs = patternsListElement.querySelectorAll('.pattern-input');
        const patterns = [];
        
        inputs.forEach(input => {
            const pattern = input.value.trim();
            if (pattern) {
                patterns.push(pattern);
            }
        });
        
        return patterns;
    }
    
    // 儲存規則
    function savePatterns() {
        const patterns = collectPatterns();
        
        // 更新狀態
        state.excludePatterns = patterns;
        
        // 發送到擴展
        vscode.postMessage({
            command: 'updateExcludePatterns',
            patterns: patterns
        });
        
        showMessage('儲存中...', false);
    }
    
    // 重設為預設值
    function resetToDefaults() {
        if (confirm('確定要重設為預設值嗎？這將覆蓋您的自定義規則。')) {
            // 更新狀態
            state.excludePatterns = [...defaultPatterns];
            
            // 更新 UI
            renderPatternsList();
            
            // 不立即儲存，讓使用者可以再次確認
            showMessage('已重設為預設值，請點擊「儲存變更」以應用', false);
        }
    }
    
    // 切換 .gitignore 預覽
    function toggleGitignorePreview() {
        if (followGitignoreCheckbox.checked) {
            gitignorePreviewContainer.style.display = 'block';
            
            // 發送到擴展
            vscode.postMessage({
                command: 'toggleGitignore',
                enabled: true
            });
        } else {
            gitignorePreviewContainer.style.display = 'none';
            
            // 發送到擴展
            vscode.postMessage({
                command: 'toggleGitignore',
                enabled: false
            });
        }
    }
    
    // 顯示訊息
    function showMessage(text, isError = false) {
        messageElement.textContent = text;
        messageElement.className = isError ? 'message error' : 'message success';
        messageElement.style.display = 'block';
        
        // 5秒後自動隱藏
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 5000);
    }
    
    // 初始化頁面
    initialize();
})();