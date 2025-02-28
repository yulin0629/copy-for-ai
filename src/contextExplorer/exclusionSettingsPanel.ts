// 為 Context Explorer 添加排除規則設定面板
// 新檔案: src/contextExplorer/exclusionSettingsPanel.ts

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 排除規則設定面板
 * 提供更友善的介面來管理排除規則
 */
export class ExclusionSettingsPanel {
    public static readonly viewType = 'copyForAI.exclusionSettings';
    
    private static _panel: vscode.WebviewPanel | undefined;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    
    /**
     * 建立並顯示設定面板
     */
    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
            
        // 如果面板已經存在，直接顯示
        if (ExclusionSettingsPanel._panel) {
            ExclusionSettingsPanel._panel.reveal(column);
            return;
        }
        
        // 否則，建立新的面板
        const panel = vscode.window.createWebviewPanel(
            ExclusionSettingsPanel.viewType,
            '排除規則設定 - Copy For AI',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );
        
        ExclusionSettingsPanel._panel = panel;
        
        // 當面板關閉時，釋放資源
        panel.onDidDispose(() => {
            ExclusionSettingsPanel._panel = undefined;
        }, null, context.subscriptions);
        
        // 建立設定面板
        new ExclusionSettingsPanel(panel, extensionUri, context);
    }
    
    /**
     * 建構函數
     */
    private constructor(
        private readonly _panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        this._extensionUri = extensionUri;
        this._context = context;
        
        // 設定 WebView 內容
        this._update();
        
        // 處理訊息
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'getExcludePatterns':
                        await this._sendExcludePatterns();
                        break;
                        
                    case 'updateExcludePatterns':
                        await this._updateExcludePatterns(message.patterns);
                        break;
                        
                    case 'toggleGitignore':
                        await this._toggleGitignore(message.enabled);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    }
    
    /**
     * 更新 WebView 內容
     */
    private _update() {
        const webview = this._panel.webview;
        this._panel.title = '排除規則設定 - Copy For AI';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }
    
    /**
     * 發送排除規則給 WebView
     */
    private async _sendExcludePatterns() {
        const config = vscode.workspace.getConfiguration('copyForAI');
        const excludePatterns = config.get<string[]>('contextExplorer.excludePatterns', []);
        const followGitignore = config.get<boolean>('contextExplorer.followGitignore', true);
        
        // 讀取 .gitignore 檔案內容
        let gitignoreContent = '';
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const gitignorePath = path.join(workspaceFolders[0].uri.fsPath, '.gitignore');
                const fs = require('fs');
                if (fs.existsSync(gitignorePath)) {
                    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                }
            }
        } catch (error) {
            console.error('讀取 .gitignore 失敗', error);
        }
        
        // 發送資料給 WebView
        this._panel.webview.postMessage({
            command: 'excludePatterns',
            patterns: excludePatterns,
            followGitignore: followGitignore,
            gitignoreContent: gitignoreContent
        });
    }
    
    /**
     * 更新排除規則設定
     */
    private async _updateExcludePatterns(patterns: string[]) {
        const config = vscode.workspace.getConfiguration('copyForAI');
        await config.update('contextExplorer.excludePatterns', patterns, vscode.ConfigurationTarget.Workspace);
        
        // 通知更新成功
        this._panel.webview.postMessage({
            command: 'updateSuccess',
            message: '排除規則已成功更新'
        });
        
        // 通知檔案瀏覽器更新
        vscode.commands.executeCommand('copy-for-ai.refreshFileExplorer');
    }
    
    /**
     * 切換是否遵循 .gitignore
     */
    private async _toggleGitignore(enabled: boolean) {
        const config = vscode.workspace.getConfiguration('copyForAI');
        await config.update('contextExplorer.followGitignore', enabled, vscode.ConfigurationTarget.Workspace);
        
        // 通知更新成功
        this._panel.webview.postMessage({
            command: 'updateSuccess',
            message: `.gitignore 規則已${enabled ? '啟用' : '禁用'}`
        });
        
        // 通知檔案瀏覽器更新
        vscode.commands.executeCommand('copy-for-ai.refreshFileExplorer');
    }
    
    /**
     * 生成 WebView 的 HTML 內容
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'exclusionSettings', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'exclusionSettings', 'styles.css')
        );
        
        const nonce = this._getNonce();
        
        return /* html */`
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>排除規則設定 - Copy For AI</title>
        </head>
        <body>
            <div class="container">
                <h1>排除規則設定</h1>
                
                <!-- 說明區域 -->
                <div class="description">
                    <p>在這裡設定要從檔案瀏覽器中排除的檔案模式。這些檔案將不會顯示在檔案瀏覽器中，也不能被選取。</p>
                    <p>支援 glob 模式，例如：</p>
                    <ul>
                        <li><code>**/node_modules/**</code> - 排除所有 node_modules 資料夾</li>
                        <li><code>**/*.log</code> - 排除所有 .log 檔案</li>
                        <li><code>**/build/**</code> - 排除所有 build 資料夾</li>
                    </ul>
                </div>
                
                <!-- .gitignore 選項 -->
                <div class="gitignore-section">
                    <label class="checkbox-container">
                        <input type="checkbox" id="follow-gitignore">
                        <span class="checkbox-label">遵循 .gitignore 規則</span>
                    </label>
                    <p class="gitignore-info">
                        啟用此選項後，將自動排除 .gitignore 檔案中定義的檔案。
                    </p>
                    
                    <!-- .gitignore 內容預覽 -->
                    <div class="gitignore-preview" id="gitignore-preview-container">
                        <div class="header">
                            <span>.gitignore 內容預覽</span>
                        </div>
                        <pre id="gitignore-content">加載中...</pre>
                    </div>
                </div>
                
                <!-- 排除規則清單 -->
                <div class="patterns-section">
                    <div class="section-header">
                        <h2>排除規則</h2>
                        <button id="add-pattern" class="primary-button small">新增規則</button>
                    </div>
                    
                    <div class="patterns-list" id="patterns-list">
                        <!-- 模板項目 -->
                        <div class="pattern-item template">
                            <input type="text" class="pattern-input" placeholder="輸入排除規則，例如 **/node_modules/**">
                            <button class="delete-button">✕</button>
                        </div>
                        
                        <!-- 動態產生的項目將插入這裡 -->
                    </div>
                </div>
                
                <!-- 動作按鈕區 -->
                <div class="actions">
                    <button id="save-patterns" class="primary-button">儲存變更</button>
                    <button id="reset-patterns" class="secondary-button">重設為預設值</button>
                </div>
                
                <!-- 訊息提示區 -->
                <div id="message" class="message" style="display: none;"></div>
            </div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
    
    /**
     * 生成隨機 nonce 值
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}