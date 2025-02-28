import * as vscode from 'vscode';
import { processCode, removeComments } from './codeAnalyzer';
import { formatOutput } from './formatter';
import { ContextExplorerProvider } from './contextExplorer/contextExplorerProvider';
import { ExclusionSettingsPanel } from './contextExplorer/exclusionSettingsPanel';

/**
 * 當擴展被啟動時執行
 * @param context 擴展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('擴展 "copy-for-ai" 已啟動！');

    // 註冊基本的複製命令
    const basicCopyCommand = vscode.commands.registerCommand('copy-for-ai.copyForAI', async () => {
        await copyForAI(false);
    });

    // 註冊帶有上下文的複製命令
    const contextCopyCommand = vscode.commands.registerCommand('copy-for-ai.copyForAIWithContext', async () => {
        await copyForAI(true);
    });

    // 註冊設定排除模式命令 - 現在開啟排除規則設定面板
    const configureCommand = vscode.commands.registerCommand('copy-for-ai.configureExcludePatterns', () => {
        ExclusionSettingsPanel.createOrShow(context.extensionUri, context);
    });
    
    // 註冊刷新檔案瀏覽器命令
    const refreshCommand = vscode.commands.registerCommand('copy-for-ai.refreshFileExplorer', () => {
        // 通知 ContextExplorerProvider 刷新檔案列表
        vscode.commands.executeCommand('copy-for-ai.contextExplorer.refresh');
    });

    // 註冊 Context Explorer 視圖
    const contextExplorerProvider = new ContextExplorerProvider(context);
    const contextExplorerView = vscode.window.registerWebviewViewProvider(
        ContextExplorerProvider.viewType,
        contextExplorerProvider
    );
    
    // 在 ContextExplorerProvider 中處理刷新命令
    context.subscriptions.push(
        vscode.commands.registerCommand('copy-for-ai.contextExplorer.refresh', () => {
            // 這裡我們可以呼叫 contextExplorerProvider 的方法來刷新檔案列表
            // 但須修改 ContextExplorerProvider 類添加 refreshFiles 方法
            contextExplorerProvider.refreshFiles(); // 確保 ContextExplorerProvider 有此方法
        })
    );

    context.subscriptions.push(
        basicCopyCommand, 
        contextCopyCommand, 
        configureCommand,
        refreshCommand,
        contextExplorerView
    );
    
    // 註冊檔案關聯擴展
    registerFileAssociations();
}

/**
 * 註冊檔案關聯擴展
 * 確保 .mjs 和 .cjs 等檔案類型能正確識別
 */
function registerFileAssociations() {
    // 設定 .mjs 檔案為 JavaScript
    vscode.languages.setLanguageConfiguration('javascript', {
        wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
    });
    
    // 確保 .mjs 和 .cjs 檔案被識別為 JavaScript
    const jsConfig = vscode.workspace.getConfiguration('files');
    const associations = jsConfig.get<{[key: string]: string}>('associations', {});
    
    // 檢查是否已經有相關關聯
    let hasChanged = false;
    
    if (!associations['*.mjs']) {
        associations['*.mjs'] = 'javascript';
        hasChanged = true;
    }
    
    if (!associations['*.cjs']) {
        associations['*.cjs'] = 'javascript';
        hasChanged = true;
    }
    
    // 如果有變更，更新設定
    if (hasChanged) {
        jsConfig.update('associations', associations, vscode.ConfigurationTarget.Global);
    }
}

/**
 * 複製程式碼到剪貼簿（適用於 AI 分析）
 * @param includeContext 是否包含上下文資訊
 */
async function copyForAI(includeContext: boolean) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('沒有開啟的編輯器');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('沒有選取任何程式碼');
        return;
    }

    // 顯示進度指示（如果需要上下文分析）
    if (includeContext) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "分析程式碼...",
            cancellable: false
        }, async (progress) => {
            await doCopy(editor, selection, includeContext, progress);
        });
    } else {
        await doCopy(editor, selection, includeContext);
    }
}

/**
 * 執行複製操作
 * @param editor 編輯器
 * @param selection 選取範圍
 * @param includeContext 是否包含上下文
 * @param progress 進度報告（可選）
 */
async function doCopy(
    editor: vscode.TextEditor, 
    selection: vscode.Selection, 
    includeContext: boolean,
    progress?: vscode.Progress<{ message?: string; increment?: number }>
) {
    const document = editor.document;
    const text = document.getText(selection);
    const fileName = document.fileName;
    const relativePath = vscode.workspace.asRelativePath(fileName);
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const languageId = document.languageId;

    // 讀取設定
    const config = vscode.workspace.getConfiguration('copyForAI');
    let outputFormat = config.get<string>('outputFormat', 'markdown');
    
    // 確保格式是有效的，否則使用預設值
    if (!['markdown', 'xml', 'json', 'custom'].includes(outputFormat)) {
        outputFormat = 'markdown';
        vscode.window.showWarningMessage(`不支援的輸出格式: ${outputFormat}，已改用預設 Markdown 格式`);
    }

    // 檢查是否需要過濾註解
    const includeComments = config.get<boolean>('includeComments', true);
    
    // 處理程式碼（包括結構分析等）
    let extraContext: any = {};
    let processedCode = text;
    
    if (includeContext) {
        progress?.report({ message: "分析程式碼結構..." });
        
        const includeStructure = config.get<boolean>('includeStructureInfo', true);
        const includeImports = config.get<boolean>('includeRelatedImports', true);
        
        const result = await processCode(document, selection, {
            includeStructure,
            includeImports,
            includeComments
        });
        
        extraContext.structure = result.structure;
        extraContext.imports = result.imports;
        processedCode = result.code;
    } else if (!includeComments) {
        // 僅移除註解但不需要上下文分析
        processedCode = removeComments(text);
    }
    
    // 處理程式碼縮排
    processedCode = normalizeIndentation(processedCode);
    
    // 格式化輸出
    const formattedOutput = formatOutput({
        format: outputFormat as any,
        filePath: relativePath,
        startLine,
        endLine,
        languageId,
        code: processedCode,
        ...extraContext
    });
    
    // 複製到剪貼簿
    await vscode.env.clipboard.writeText(formattedOutput);
    
    // 顯示成功訊息
    if (includeContext) {
        vscode.window.showInformationMessage(`已複製程式碼和上下文到剪貼簿 (格式: ${outputFormat})`);
    } else {
        vscode.window.showInformationMessage('已複製程式碼到剪貼簿');
    }
}

/**
 * 正規化程式碼縮排
 * @param code 原始程式碼
 * @returns 處理後的程式碼
 */
function normalizeIndentation(code: string): string {
    const lines = code.split('\n');
    
    // 找出共同的前導空白字元數量 (非空白行)
    let minIndent = Number.MAX_VALUE;
    for (const line of lines) {
        // 跳過空白行
        if (line.trim().length === 0) {
            continue;
        }
        // 計算每行前面有多少空白
        const indent = line.search(/\S|$/);
        if (indent < minIndent) {
            minIndent = indent;
        }
    }
    
    // 如果全都是空白行，設置為0
    if (minIndent === Number.MAX_VALUE) {
        minIndent = 0;
    }
    
    // 移除共同的前導空白，確保所有行都從第一欄開始
    const processedLines = lines.map(line => {
        // 處理空白行
        if (line.trim().length === 0) {
            return '';
        }
        // 移除每行的共同前導空白字元
        return line.substring(minIndent);
    });
    
    return processedLines.join('\n');
}

/**
 * 當擴展被停用時執行
 */
export function deactivate() {}