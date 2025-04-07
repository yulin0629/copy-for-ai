// src/contextExplorer/contextExplorerService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { formatOutput } from '../formatter';
import { FileTreeService, TreeNode } from './fileTreeService';
import { StateManager } from './stateManager';
import { ContextExplorerWebviewHandler } from './contextExplorerWebviewHandler';
import { ExplorerState } from './types';

/**
 * Context Explorer 的後端服務邏輯
 */
export class ContextExplorerService {
    private _context: vscode.ExtensionContext;
    private _outputChannel: vscode.OutputChannel;
    private _fileTreeService: FileTreeService;
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
            if (this._watcherListeners.length > 0) {
                this.stopWatching();
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
            const savedState = this._stateManager.getState();
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
            return { files: [], savedState: { selectionState: {}, expandedFolders: {} }, tokenLimit: 0, sessionId: this._sessionId };
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
            this._webviewHandler.updateFiles(workspaceFiles, reason);
            this.log(`檔案列表已刷新${reason ? ': ' + reason : ''}`);
        } catch (error) {
            this.logError('刷新檔案列表失敗', error);
        }
    }

    /**
     * 保存 WebView 狀態
     */
    public async saveWebViewState(state: ExplorerState): Promise<void> {
        await this._stateManager.updateState(state);
        this.log('已儲存 WebView 狀態');
    }

    /**
     * 複製選取的檔案到剪貼簿
     */
    public async copySelectedFilesToClipboard(selectedFiles: string[]): Promise<void> {
        if (!this._webviewHandler) {
            this.logError('複製檔案失敗: WebviewHandler 未設置');
            return;
        }

        if (!selectedFiles || selectedFiles.length === 0) {
            this.logError('沒有選取任何檔案');
            this._webviewHandler.sendCopyStatus('failed', { error: '沒有選取任何檔案' });
            return;
        }

        this.log(`開始複製 ${selectedFiles.length} 個檔案到剪貼簿`);
        this._webviewHandler.sendCopyStatus('started');

        try {
            const contents: { path: string; content: string }[] = [];
            let totalTokens = 0;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "複製檔案內容...",
                cancellable: false
            }, async (progress) => {
                const total = selectedFiles.length;
                for (let i = 0; i < selectedFiles.length; i++) {
                    const filePath = selectedFiles[i];
                    const fileName = path.basename(filePath);
                    this.log(`處理檔案 (${i + 1}/${total}): ${filePath}`);
                    progress.report({ message: `(${i + 1}/${total}) ${fileName}`, increment: 100 / total });

                    const fileContent = this._fileTreeService.readFileContent(filePath);
                    if (fileContent) {
                        contents.push({ path: vscode.workspace.asRelativePath(filePath), content: fileContent });
                        totalTokens += this._fileTreeService.estimateTokens(filePath);
                        this.log(`已讀取檔案: ${filePath}, 大小: ${fileContent.length} 字元`);
                    }
                }
            });

            if (contents.length === 0) {
                this.logError('沒有成功讀取任何檔案內容');
                this._webviewHandler.sendCopyStatus('failed', { error: '沒有成功讀取任何檔案內容' });
                return;
            }

            const config = vscode.workspace.getConfiguration('copyForAI');
            const outputFormat = config.get<string>('outputFormat', 'markdown');
            this.log(`使用輸出格式: ${outputFormat}, 格式化 ${contents.length} 個檔案`);

            let formattedContent = '';
            for (const { path: relativeFilePath, content } of contents) {
                const languageId = this._fileTreeService.getLanguageId(relativeFilePath);
                const formattedFile = formatOutput({
                    format: outputFormat as any,
                    filePath: relativeFilePath,
                    startLine: 1,
                    endLine: content.split('\n').length,
                    languageId: languageId,
                    code: content
                });
                formattedContent += formattedFile + '\n\n';
                this.log(`已格式化檔案: ${relativeFilePath}`);
            }

            await vscode.env.clipboard.writeText(formattedContent);
            this.log('已將格式化內容複製到剪貼簿');

            this._webviewHandler.sendCopyStatus('completed', { fileCount: contents.length, totalTokens: totalTokens });
            vscode.window.showInformationMessage(`已複製 ${contents.length} 個檔案到剪貼簿 (共 ${totalTokens} tokens)`);

        } catch (error) {
            this.logError('複製檔案時出錯', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._webviewHandler.sendCopyStatus('failed', { error: errorMessage });
            vscode.window.showErrorMessage(`複製檔案失敗: ${errorMessage}`);
        }
    }

    /**
     * 添加檔案到 Context Explorer 選擇列表
     */
    public async addFileToExplorer(filePath: string): Promise<void> {
        try {
            const updatedState = await this._stateManager.selectFileAndExpandParents(filePath, true);
            if (this._webviewHandler) {
                this._webviewHandler.updateState(updatedState);
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
                const files = await vscode.workspace.findFiles(folderPattern);
                const textFiles = files.filter(file => this._fileTreeService.isTextFile(file.fsPath));
                const filePaths = textFiles.map(file => file.fsPath);

                for (let i = 0; i < filePaths.length; i++) {
                    progress.report({ message: `(${i + 1}/${filePaths.length}) ${path.basename(filePaths[i])}`, increment: 100 / filePaths.length });
                }

                const updatedState = await this._stateManager.selectFilesAndExpandParents(filePaths, true);
                if (this._webviewHandler) {
                    this._webviewHandler.updateState(updatedState);
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
        const allExcludePatterns = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/bin/**', ...userExcludePatterns];
        const excludePattern = allExcludePatterns.length > 0 ? `{${allExcludePatterns.join(',')}}` : undefined;

        this.log(`啟動檔案監聽器，排除模式: ${excludePattern || '無'}`);
        this._fileSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspacePath, '**/*'), false, false, false);

        const handleEvent = (uri: vscode.Uri, eventType: string) => {
            this.log(`檔案事件 [${eventType}]: ${uri.fsPath}`);
            if (!this._fileTreeService.isIgnoredFile(uri.fsPath)) {
                this.refreshFiles(`檔案${eventType}: ${vscode.workspace.asRelativePath(uri)}`);
            } else {
                this.log(`忽略${eventType}事件 (符合排除規則): ${uri.fsPath}`);
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

        for (const folder of workspaceFolders) {
            const gitignorePattern = new vscode.RelativePattern(folder, '.gitignore');
            this._gitignoreWatcher = vscode.workspace.createFileSystemWatcher(gitignorePattern);
            this._context.subscriptions.push(this._gitignoreWatcher);

            const handleGitignoreEvent = (uri: vscode.Uri, eventType: string) => {
                this.log(`.gitignore 檔案事件 [${eventType}]: ${uri.fsPath}`);
                this.refreshFiles(`.gitignore ${eventType}`);
            };

            this._gitignoreListeners.push(this._gitignoreWatcher.onDidChange(uri => handleGitignoreEvent(uri, '變更')));
            this._gitignoreListeners.push(this._gitignoreWatcher.onDidCreate(uri => handleGitignoreEvent(uri, '建立')));
            this._gitignoreListeners.push(this._gitignoreWatcher.onDidDelete(uri => handleGitignoreEvent(uri, '刪除')));
            this.log(`.gitignore 檔案監視器已創建: ${folder.uri.fsPath}`);
        }
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