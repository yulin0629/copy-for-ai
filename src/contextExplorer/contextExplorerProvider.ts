// src/contextExplorer/contextExplorerProvider.ts
import * as vscode from 'vscode';
import { FileTreeService } from './fileTreeService';
import { StateManager } from './stateManager';
import { ContextExplorerWebviewHandler } from './contextExplorerWebviewHandler';
import { ContextExplorerService } from './contextExplorerService';

/**
 * Context Explorer 視圖提供者
 * 協調 WebviewHandler 和 Service
 */
export class ContextExplorerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'copy-for-ai.contextExplorer';

    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _outputChannel: vscode.OutputChannel;
    private _fileTreeService: FileTreeService;
    private _stateManager: StateManager;
    private _webviewHandler: ContextExplorerWebviewHandler;
    private _service: ContextExplorerService;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._outputChannel = vscode.window.createOutputChannel('Copy For AI');
        this._fileTreeService = new FileTreeService(this._outputChannel);
        this._stateManager = new StateManager(context);

        // 創建 Handler 和 Service
        this._webviewHandler = new ContextExplorerWebviewHandler(context);
        this._service = new ContextExplorerService(context, this._outputChannel, this._fileTreeService, this._stateManager);

        // 互相設置引用
        this._webviewHandler.setService(this._service);
        this._service.setWebviewHandler(this._webviewHandler);

        this._service.log('Context Explorer Provider 已初始化');
    }

    /**
     * 解析並設置 WebView 視圖
     */
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): Promise<void> {
        this._view = webviewView;
        this._webviewHandler.setView(webviewView); // 將 view 傳遞給 Handler

        this._service.log('WebView 視圖已創建');

        // 視圖可見性變更處理
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._service.log('WebView 變為可見，初始化並啟動監聽');
                this._initializeAndStartWatching();
            } else {
                this._service.log('WebView 變為不可見，停止監聽');
                this._service.stopWatching();
            }
        });

        // 視圖銷毀處理
        webviewView.onDidDispose(() => {
            this._service.log('WebView 已銷毀，停止監聽並清理');
            this._service.stopWatching();
            this._webviewHandler.clearView();
            this._view = undefined;
        });

        // 如果初始時可見，則初始化
        if (webviewView.visible) {
            await this._initializeAndStartWatching();
        }
    }

    /**
     * 初始化 WebView 並啟動檔案監聽
     */
    private async _initializeAndStartWatching(): Promise<void> {
        try {
            const initialData = await this._service.getInitialData();
            await this._webviewHandler.initialize(
                initialData.files,
                initialData.savedState,
                initialData.tokenLimit,
                initialData.sessionId
            );
            this._service.log('WebView 初始化完成');
            this._service.startWatching(); // 啟動檔案監聽
        } catch (error) {
            this._service.logError('WebView 初始化或啟動監聽失敗', error);
        }
    }

    /**
     * 公開方法：刷新檔案列表 (供外部命令調用)
     */
    public refreshFiles(): Promise<void> {
        this._service.log('從外部命令觸發檔案列表刷新');
        return this._service.refreshFiles('從使用者命令觸發');
    }

    /**
     * 公開方法：添加檔案到瀏覽器 (供外部命令調用)
     */
    public addFileToExplorer(filePath: string): Promise<void> {
        return this._service.addFileToExplorer(filePath);
    }

    /**
     * 公開方法：添加資料夾到瀏覽器 (供外部命令調用)
     */
    public addFolderToExplorer(folderPath: string): Promise<void> {
        return this._service.addFolderToExplorer(folderPath);
    }
}