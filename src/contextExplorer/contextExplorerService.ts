// src/contextExplorer/contextExplorerService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { formatOutput } from '../formatter';
import { FileTreeService } from './fileTreeService';
import { StateManager } from './stateManager';
import { ContextExplorerWebviewHandler } from './contextExplorerWebviewHandler';
import { ExplorerState, TreeNode, Snippet } from './types'; // 引入 Snippet
import * as fs from 'fs'; // 引入 fs 模組

/**
 * Context Explorer 的後端服務邏輯
 */
export class ContextExplorerService {
    private _context: vscode.ExtensionContext;
    private _outputChannel: vscode.OutputChannel;
    public _fileTreeService: FileTreeService; // 改為 public 以便 Provider 訪問
    private _stateManager: StateManager;
    private _webviewHandler?: ContextExplorerWebviewHandler; // 引用 WebviewHandler 來發送消息

    private _fileSystemWatcher: vscode.FileSystemWatcher | undefined;
    private _watcherListeners: vscode.Disposable[] = [];
    private _gitignoreWatcher: vscode.FileSystemWatcher | undefined;
    private _gitignoreListeners: vscode.Disposable[] = [];
    private _sessionId: string;

    constructor(
        context: vscode.ExtensionContext,
        outputChannel: vscode.OutputChannel,
        fileTreeService: FileTreeService,
        stateManager: StateManager
    ) {
        this._context = context;
        this._outputChannel = outputChannel;
        this._fileTreeService = fileTreeService;
        this._stateManager = stateManager;
        this._sessionId = this._generateSessionId();
        this.log(`已生成新的會話 ID: ${this._sessionId}`);

        // 監聽配置變更
        vscode.workspace.onDidChangeConfiguration(e => this._handleConfigurationChange(e), null, this._context.subscriptions);

        // 確保清理監聽器
        context.subscriptions.push(vscode.Disposable.from(...this._watcherListeners));
        context.subscriptions.push(vscode.Disposable.from(...this._gitignoreListeners));
        context.subscriptions.push({ dispose: () => this.stopWatching() });
        context.subscriptions.push({ dispose: () => this._stopGitignoreWatching() });
    }

    /**
     * 設置 WebviewHandler 引用 (避免循環依賴)
     */
    public setWebviewHandler(handler: ContextExplorerWebviewHandler): void {
        this._webviewHandler = handler;
    }

    /**
     * 處理設定變更
     */
    private _handleConfigurationChange(e: vscode.ConfigurationChangeEvent): void {
        if (e.affectsConfiguration('copyForAI.tokenLimit')) {
            this.updateTokenLimit();
        }

        if (e.affectsConfiguration('copyForAI.contextExplorer.excludePatterns') ||
            e.affectsConfiguration('copyForAI.contextExplorer.followGitignore')) {
            this.log('排除設定已變更，重新載入...');
            // 如果正在監聽，則停止再重新啟動
            if (this._watcherListeners.length > 0 || this._gitignoreListeners.length > 0) {
                this.stopWatching(); // stopWatching 會同時停止 gitignore 監聽
                this.startWatching();
            }
            this.refreshFiles('排除設定已變更');
        }
    }

    /**
     * 初始化 WebView 所需的數據
     */
    public async getInitialData(): Promise<{ files: TreeNode[], savedState: ExplorerState, tokenLimit: number, sessionId: string }> {
        try {
            const workspaceFiles = await this._fileTreeService.getWorkspaceFiles();
            this.log(`已載入 ${workspaceFiles.length} 個頂層項目`);
            const savedState = this._stateManager.getState(); // savedState 現在包含 snippets
            const config = vscode.workspace.getConfiguration('copyForAI');
            const tokenLimit = config.get<number>('tokenLimit', 0);

            return {
                files: workspaceFiles,
                savedState,
                tokenLimit,
                sessionId: this._sessionId
            };
        } catch (error) {
            this.logError('獲取初始數據失敗', error);
            return { files: [], savedState: { selectionState: {}, expandedFolders: {}, snippets: [] }, tokenLimit: 0, sessionId: this._sessionId };
        }
    }

    /**
     * 更新 Token 上限並通知 WebView
     */
    public updateTokenLimit(): void {
        if (!this._webviewHandler) {
            this.logError('更新 Token Limit 失敗: WebviewHandler 未設置');
            return;
        }
        const config = vscode.workspace.getConfiguration('copyForAI');
        const tokenLimit = config.get<number>('tokenLimit', 0);
        this._webviewHandler.updateTokenLimit(tokenLimit);
        this.log('已通知 WebView 更新 Token Limit: ' + tokenLimit);
    }

    /**
     * 刷新檔案列表並通知 WebView
     */
    public async refreshFiles(reason?: string): Promise<void> {
        if (!this._webviewHandler) {
            this.logError('刷新檔案列表失敗: WebviewHandler 未設置');
            return;
        }
        try {
            const workspaceFiles = await this._fileTreeService.getWorkspaceFiles();
            // 刷新時不需要傳遞 snippets，它們由 StateManager 管理
            this._webviewHandler.updateFiles(workspaceFiles, reason);
            this.log(`檔案列表已刷新${reason ? ': ' + reason : ''}`);
        } catch (error) {
            this.logError('刷新檔案列表失敗', error);
        }
    }

    /**
     * 保存 WebView 狀態 (僅檔案選擇和展開狀態)
     * 注意：片段狀態由 addSnippet/removeSnippet 直接更新 StateManager
     */
    public async saveWebViewState(state: Pick<ExplorerState, 'selectionState' | 'expandedFolders'>): Promise<void> {
        const currentState = this._stateManager.getState();
        // 僅更新檔案選擇和展開狀態
        currentState.selectionState = state.selectionState || {}; // 確保存在
        currentState.expandedFolders = state.expandedFolders || {}; // 確保存在
        await this._stateManager.updateState(currentState);
        this.log('已儲存 WebView 檔案選擇和展開狀態');
    }

    /**
     * 複製選取的檔案和片段到剪貼簿
     */
    public async copySelectedItemsToClipboard(selectedFilesAbsolutePaths: string[], selectedSnippetIds: string[]): Promise<void> {
        if (!this._webviewHandler) {
            this.logError('複製項目失敗: WebviewHandler 未設置');
            return;
        }

        const hasFiles = selectedFilesAbsolutePaths && selectedFilesAbsolutePaths.length > 0;
        const hasSnippets = selectedSnippetIds && selectedSnippetIds.length > 0;

        if (!hasFiles && !hasSnippets) {
            this.logError('沒有選取任何檔案或片段');
            this._webviewHandler.sendCopyStatus('failed', { error: '沒有選取任何檔案或片段' });
            return;
        }

        // **** 日誌 1: 打印剛收到的參數 ****
        this.log(`[Service Entry] Received files: ${JSON.stringify(selectedFilesAbsolutePaths)}`);
        this.log(`[Service Entry] Received snippets: ${JSON.stringify(selectedSnippetIds)}`);

        this._webviewHandler.sendCopyStatus('started');

        try {
            const itemsToFormat: { path: string; content: string; languageId: string; startLine: number; endLine: number; structure?: string; imports?: string }[] = [];
            let totalTokens = 0;
            let fileCount = 0;
            let snippetCount = 0;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "複製項目內容...",
                cancellable: false
            }, async (progress) => {
                const totalItems = (selectedFilesAbsolutePaths?.length || 0) + (selectedSnippetIds?.length || 0);
                let processedItems = 0;

                // 處理檔案
                if (hasFiles) {
                    // **** 日誌 2: 打印進入循環前的原始陣列 ****
                    this.log(`[Service Before File Loop] Original files array: ${JSON.stringify(selectedFilesAbsolutePaths)}`);

                    // **** 使用傳統 for 循環和索引訪問，避免 for...of 可能的奇怪行為 ****
                    for (let i = 0; i < selectedFilesAbsolutePaths.length; i++) {
                        processedItems++;
                        // **** 日誌 3: 直接從原始陣列取值 ****
                        const currentPathFromArray = selectedFilesAbsolutePaths[i];
                        this.log(`[Service Inside File Loop] (${processedItems}/${totalItems}) Path from array[${i}]: ${currentPathFromArray}`); // <-- 觀察這個值

                        // **** 使用從陣列直接取出的值 ****
                        const absolutePathToProcess = currentPathFromArray;

                        // **** 日誌 4: 再次確認要處理的路徑 ****
                        this.log(`[Service Inside File Loop] Path being processed: ${absolutePathToProcess}`);

                        const fileName = path.basename(absolutePathToProcess);
                        progress.report({ message: `(${processedItems}/${totalItems}) ${fileName}`, increment: 100 / totalItems });

                        const fileContent = this._fileTreeService.readFileContent(absolutePathToProcess);
                        if (fileContent !== null) {
                            const languageId = this._fileTreeService.getLanguageId(absolutePathToProcess);
                            const tokens = this._fileTreeService.estimateTokens(absolutePathToProcess);
                            const relativePathForFormat = vscode.workspace.asRelativePath(absolutePathToProcess);
                            this.log(`[Service Inside File Loop] Relative path for format: ${relativePathForFormat}`);

                            itemsToFormat.push({
                                path: relativePathForFormat,
                                content: fileContent,
                                languageId: languageId,
                                startLine: 1,
                                endLine: fileContent.split('\n').length,
                            });
                            totalTokens += tokens;
                            fileCount++;
                            this.log(`[Service Inside File Loop] Successfully read: ${absolutePathToProcess}, Size: ${fileContent.length}, Tokens: ${tokens}`);
                        } else {
                            this.logWarn(`[Service Inside File Loop] Failed to read content for: ${absolutePathToProcess}`);
                        }
                    }
                }

                // 處理片段 (保持不變或類似修改)
                if (hasSnippets) {
                    this.log(`[Service Before Snippet Loop] Processing snippets array: ${JSON.stringify(selectedSnippetIds)}`);
                    for (const snippetId of selectedSnippetIds) {
                        processedItems++;
                        this.log(`[Service Inside Snippet Loop] (${processedItems}/${totalItems}) Current snippetId: ${snippetId}`);
                        const snippet = this._stateManager.getSnippetById(snippetId);
                        if (snippet) {
                            const snippetName = `${path.basename(snippet.relativePath)} (${snippet.startLine}-${snippet.endLine})`;
                            this.log(`[Service Inside Snippet Loop] Processing snippet: ${snippetName}`);
                            progress.report({ message: `(${processedItems}/${totalItems}) ${snippetName}`, increment: 100 / totalItems });

                            itemsToFormat.push({
                                path: snippet.relativePath,
                                content: snippet.code,
                                languageId: snippet.languageId,
                                startLine: snippet.startLine,
                                endLine: snippet.endLine,
                                structure: snippet.structure,
                                imports: snippet.imports
                            });
                            totalTokens += snippet.estimatedTokens;
                            snippetCount++;
                            this.log(`[Service Inside Snippet Loop] Snippet added: ${snippetName}, Tokens: ${snippet.estimatedTokens}`);
                        } else {
                            this.logWarn(`[Service Inside Snippet Loop] Snippet not found: ${snippetId}`);
                        }
                    }
                }
            });

            if (itemsToFormat.length === 0) {
                this.logError('沒有成功讀取任何項目內容');
                this._webviewHandler.sendCopyStatus('failed', { error: '沒有成功讀取任何項目內容' });
                return;
            }

            const config = vscode.workspace.getConfiguration('copyForAI');
            const outputFormat = config.get<string>('outputFormat', 'markdown');
            this.log(`使用輸出格式: ${outputFormat}, 格式化 ${itemsToFormat.length} 個項目`);

            let formattedContent = '';
            for (const item of itemsToFormat) {
                const formattedItem = formatOutput({
                    format: outputFormat as any,
                    filePath: item.path,
                    startLine: item.startLine,
                    endLine: item.endLine,
                    languageId: item.languageId,
                    code: item.content,
                    structure: item.structure,
                    imports: item.imports
                });
                formattedContent += formattedItem + '\n\n';
                this.log(`已格式化項目: ${item.path} (${item.startLine}-${item.endLine})`);
            }

            await vscode.env.clipboard.writeText(formattedContent.trim());
            this.log('已將格式化內容複製到剪貼簿');

            const message = `已複製 ${fileCount} 個檔案和 ${snippetCount} 個片段到剪貼簿 (共 ${totalTokens} tokens)`;
            this._webviewHandler.sendCopyStatus('completed', { fileCount: fileCount, snippetCount: snippetCount, totalTokens: totalTokens });
            vscode.window.showInformationMessage(message);

        } catch (error) {
            this.logError('複製項目時出錯', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._webviewHandler.sendCopyStatus('failed', { error: errorMessage });
            vscode.window.showErrorMessage(`複製項目失敗: ${errorMessage}`);
        }
    }


    /**
     * 添加檔案到 Context Explorer 選擇列表
     */
    public async addFileToExplorer(filePath: string): Promise<void> {
        try {
            const updatedState = await this._stateManager.selectFileAndExpandParents(filePath, true);
            if (this._webviewHandler) {
                // 只需更新檔案相關狀態，片段狀態不變
                this._webviewHandler.updateState({
                    selectionState: updatedState.selectionState,
                    expandedFolders: updatedState.expandedFolders,
                    snippets: updatedState.snippets // 確保傳遞最新的 snippets
                });
            }
            this.log(`已添加檔案到選擇列表: ${vscode.workspace.asRelativePath(filePath)}`);
            vscode.window.showInformationMessage(`已添加 ${path.basename(filePath)} 到 Copy For AI Explorer`);
        } catch (error) {
            this.logError('添加檔案到選擇列表失敗', error);
            vscode.window.showErrorMessage(`添加檔案失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 添加資料夾下所有檔案到 Context Explorer 選擇列表
     */
    public async addFolderToExplorer(folderPath: string): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在添加資料夾中的檔案...",
                cancellable: false
            }, async (progress) => {
                const folderUri = vscode.Uri.file(folderPath);
                const folderPattern = new vscode.RelativePattern(folderUri, '**/*');

                // 獲取設定以進行過濾
                const config = vscode.workspace.getConfiguration('copyForAI');
                const excludePatterns = config.get<string[]>('contextExplorer.excludePatterns', []);
                const followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);
                const excludeGlob = excludePatterns.length > 0 ? `{${excludePatterns.join(',')}}` : undefined;

                // 使用 findFiles 並應用排除規則
                const files = await vscode.workspace.findFiles(folderPattern, excludeGlob);

                let textFiles = files.filter(file => this._fileTreeService.isTextFile(file.fsPath));

                // 如果需要，應用 .gitignore 過濾
                if (followGitignore) {
                    // 確保 gitignore 已載入 (FileSystemReader 內部處理)
                    const wsFolder = vscode.workspace.getWorkspaceFolder(folderUri);
                    if (wsFolder) {
                        await this._fileTreeService['_fileSystemReader'].loadGitignoreFilter(wsFolder.uri.fsPath); // 確保載入
                        textFiles = textFiles.filter(file => !this._fileTreeService['_fileSystemReader'].isIgnoredByGitignore(file.fsPath));
                    }
                }


                const filePaths = textFiles.map(file => file.fsPath);

                for (let i = 0; i < filePaths.length; i++) {
                    progress.report({ message: `(${i + 1}/${filePaths.length}) ${path.basename(filePaths[i])}`, increment: 100 / filePaths.length });
                }

                const updatedState = await this._stateManager.selectFilesAndExpandParents(filePaths, true);
                if (this._webviewHandler) {
                     // 只需更新檔案相關狀態，片段狀態不變
                    this._webviewHandler.updateState({
                        selectionState: updatedState.selectionState,
                        expandedFolders: updatedState.expandedFolders,
                        snippets: updatedState.snippets // 確保傳遞最新的 snippets
                    });
                }

                const relativeFolder = vscode.workspace.asRelativePath(folderPath);
                this.log(`已添加資料夾 ${relativeFolder} 下的 ${textFiles.length} 個檔案到選擇列表`);
                vscode.window.showInformationMessage(`已添加 ${path.basename(folderPath)} 資料夾下的 ${textFiles.length} 個檔案到 Copy For AI Explorer`);
            });
        } catch (error) {
            this.logError('添加資料夾到選擇列表失敗', error);
            vscode.window.showErrorMessage(`添加資料夾失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // --- Snippet Specific Methods ---

    /**
     * 添加程式碼片段到 Context Explorer
     */
    public async addSnippetToExplorer(snippet: Snippet): Promise<void> {
        try {
            const updatedState = await this._stateManager.addSnippet(snippet);
            if (this._webviewHandler) {
                // 通知 WebView 更新整個狀態，因為 snippets 列表已改變
                this._webviewHandler.updateState(updatedState);
            }
            this.log(`已添加片段: ${snippet.relativePath} (${snippet.startLine}-${snippet.endLine})`);
            vscode.window.showInformationMessage(`已添加程式碼片段到 Copy For AI Explorer`);
        } catch (error) {
            this.logError('添加片段失敗', error);
            vscode.window.showErrorMessage(`添加片段失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 處理從 WebView 來的檢視檔案請求
     */
    public async viewFile(filePath: string): Promise<void> {
        if (!filePath) {
            this.logError('viewFile 請求缺少檔案路徑');
            vscode.window.showErrorMessage('無法開啟檔案：缺少路徑');
            return;
        }
        try {
            const uri = vscode.Uri.file(filePath);
            // 使用 showTextDocument 直接開啟並顯示
            await vscode.window.showTextDocument(uri, {
                preview: true, // 使用預覽模式
                // viewColumn: vscode.ViewColumn.Active, // 在當前活動的編輯器組中開啟
                preserveFocus: false // 將焦點移到開啟的編輯器
            });
            this.log(`已在編輯器中開啟檔案: ${vscode.workspace.asRelativePath(filePath)}`);
        } catch (error) {
            this.logError(`開啟檔案時出錯: ${filePath}`, error);
            vscode.window.showErrorMessage(`無法開啟檔案: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    /**
     * 處理從 WebView 來的檢視片段請求
     */
    public async viewSnippet(snippetId: string): Promise<void> {
        const snippet = this._stateManager.getSnippetById(snippetId);
        if (!snippet) {
            this.logError(`找不到要檢視的片段 ID: ${snippetId}`);
            vscode.window.showErrorMessage('找不到指定的程式碼片段');
            return;
        }

        try {
            const uri = vscode.Uri.file(snippet.filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, {
                 preview: true, // 使用預覽模式
                 preserveFocus: false // 將焦點移到開啟的編輯器
            });

            // *** 關鍵：確保使用 0-based 行號 ***
            // startLine 是 1-based，所以 Position 需要減 1
            const startLineIndex = snippet.startLine - 1;
            // endLine 是 1-based，表示片段結束在哪一行。選取的結束位置通常是該行的末尾。
            // 需要檢查 endLine 是否超出文件範圍
            const endLineIndex = Math.min(snippet.endLine - 1, document.lineCount - 1);

            // 檢查行號是否有效
            if (startLineIndex < 0 || startLineIndex >= document.lineCount || endLineIndex < 0 || endLineIndex < startLineIndex) {
                 this.logError(`片段行號無效: ${snippet.startLine}-${snippet.endLine} (檔案總行數: ${document.lineCount})`);
                 vscode.window.showErrorMessage('片段行號無效');
                 return;
            }

            const startPosition = new vscode.Position(startLineIndex, 0);
            const endPosition = document.lineAt(endLineIndex).range.end;

            const selection = new vscode.Selection(startPosition, endPosition);

            // 設定選取並滾動到可見區域
            editor.selection = selection;
            editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);

            this.log(`已在編輯器中顯示片段: ${snippet.relativePath} (${snippet.startLine}-${snippet.endLine})`);

        } catch (error) {
            this.logError(`顯示片段時出錯 (ID: ${snippetId})`, error);
            vscode.window.showErrorMessage(`無法開啟或顯示片段來源檔案: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 處理從 WebView 來的移除片段請求
     */
    public async removeSnippet(snippetId: string): Promise<void> {
        try {
            const updatedState = await this._stateManager.removeSnippet(snippetId);
            if (this._webviewHandler) {
                // 通知 WebView 更新整個狀態
                this._webviewHandler.updateState(updatedState);
            }
            this.log(`已移除片段 ID: ${snippetId}`);
        } catch (error) {
            this.logError(`移除片段時出錯 (ID: ${snippetId})`, error);
            vscode.window.showErrorMessage(`移除片段失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    // --- File Watching ---

    /**
     * 啟動檔案系統監聽
     */
    public startWatching(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this.log('無工作區資料夾，無法啟動監聽');
            return;
        }
        const workspacePath = workspaceFolders[0].uri.fsPath;
        this.stopWatching(); // 確保停止舊的

        const config = vscode.workspace.getConfiguration('copyForAI');
        const userExcludePatterns = config.get<string[]>('contextExplorer.excludePatterns', []);
        const followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);
        // 增加一些常見的編譯/日誌目錄
        const defaultExcludes = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/bin/**', '**/obj/**', '**/*.log'];
        const allExcludePatterns = [...new Set([...defaultExcludes, ...userExcludePatterns])]; // 合併並去重
        const excludePattern = allExcludePatterns.length > 0 ? `{${allExcludePatterns.join(',')}}` : undefined;


        this.log(`啟動檔案監聽器，排除模式: ${excludePattern || '無'}`);
        // 忽略 node_modules 和 .git 等常見目錄，減少事件數量
        this._fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspacePath, '**/*'),
            false, // create
            false, // change
            false  // delete
        );

        const handleEvent = (uri: vscode.Uri, eventType: string) => {
            const relativePath = vscode.workspace.asRelativePath(uri.fsPath);
            this.log(`檔案事件 [${eventType}]: ${relativePath}`);

            // 使用 FileTreeService 的 isIgnoredFile 檢查是否應忽略
            if (!this._fileTreeService.isIgnoredFile(uri.fsPath)) {
                 // 檢查是否為文字檔，避免非文字檔變更觸發刷新
                 if (this._fileTreeService.isTextFile(uri.fsPath) || eventType === '刪除') { // 刪除事件總是觸發刷新
                    this.refreshFiles(`檔案${eventType}: ${relativePath}`);
                 } else {
                     this.log(`忽略${eventType}事件 (非文字檔): ${relativePath}`);
                 }
            } else {
                this.log(`忽略${eventType}事件 (符合排除規則): ${relativePath}`);
            }
        };

        this._watcherListeners.push(this._fileSystemWatcher.onDidCreate(uri => handleEvent(uri, '創建')));
        this._watcherListeners.push(this._fileSystemWatcher.onDidChange(uri => handleEvent(uri, '變更')));
        this._watcherListeners.push(this._fileSystemWatcher.onDidDelete(uri => handleEvent(uri, '刪除')));

        this._context.subscriptions.push(this._fileSystemWatcher);
        this.log('檔案監聽器已啟動');

        if (followGitignore) {
            this._ensureGitignoreWatcher();
        } else {
            this._stopGitignoreWatching();
        }
    }

    /**
     * 停止檔案系統監聽
     */
    public stopWatching(): void {
        this.log('停止檔案監聽器...');
        this._watcherListeners.forEach(listener => listener.dispose());
        this._watcherListeners = [];
        if (this._fileSystemWatcher) {
            this._fileSystemWatcher.dispose();
            this._fileSystemWatcher = undefined;
        }
        this._stopGitignoreWatching(); // 同步停止 gitignore 監聽
    }

    /**
     * 創建 .gitignore 監聽器
     */
    private _ensureGitignoreWatcher(): void {
        if (this._gitignoreWatcher) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const config = vscode.workspace.getConfiguration('copyForAI');
        if (!config.get<boolean>('contextExplorer.followGitignore', true)) return;

        // 只監聽第一個工作區的 .gitignore
        const folder = workspaceFolders[0];
        const gitignorePath = path.join(folder.uri.fsPath, '.gitignore');

        // 檢查 .gitignore 是否存在
        if (!fs.existsSync(gitignorePath)) {
            this.log(`.gitignore 不存在於 ${folder.uri.fsPath}，不啟動監聽`);
            return;
        }


        const gitignorePattern = new vscode.RelativePattern(folder, '.gitignore');
        this._gitignoreWatcher = vscode.workspace.createFileSystemWatcher(gitignorePattern);
        this._context.subscriptions.push(this._gitignoreWatcher);

        const handleGitignoreEvent = (uri: vscode.Uri, eventType: string) => {
            this.log(`.gitignore 檔案事件 [${eventType}]: ${uri.fsPath}`);
            // 重新載入 gitignore 規則並刷新檔案列表
            this._fileTreeService['_fileSystemReader'].loadGitignoreFilter(folder.uri.fsPath).then(() => {
                 this.refreshFiles(`.gitignore ${eventType}`);
            });
        };

        this._gitignoreListeners.push(this._gitignoreWatcher.onDidChange(uri => handleGitignoreEvent(uri, '變更')));
        this._gitignoreListeners.push(this._gitignoreWatcher.onDidCreate(uri => handleGitignoreEvent(uri, '建立')));
        this._gitignoreListeners.push(this._gitignoreWatcher.onDidDelete(uri => handleGitignoreEvent(uri, '刪除')));
        this.log(`.gitignore 檔案監視器已創建: ${folder.uri.fsPath}`);

    }

    /**
     * 停止 .gitignore 監聽
     */
    private _stopGitignoreWatching(): void {
        this.log('停止 .gitignore 監聽器...');
        this._gitignoreListeners.forEach(listener => listener.dispose());
        this._gitignoreListeners = [];
        if (this._gitignoreWatcher) {
            this._gitignoreWatcher.dispose();
            this._gitignoreWatcher = undefined;
        }
    }

    /**
     * 生成唯一的會話 ID
     */
    private _generateSessionId(): string {
        return Date.now().toString() + '-' + Math.random().toString(36).substring(2, 15);
    }

    /**
     * 輸出日誌
     */
    public log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * 輸出警告日誌
     */
    public logWarn(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] [警告] ${message}`);
    }


    /**
     * 輸出錯誤日誌
     */
    public logError(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] 錯誤: ${message}`);
        if (error) {
            const details = error instanceof Error ? `${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}` : String(error);
            this._outputChannel.appendLine(`詳細資訊: ${details}`);
        }
    }
}