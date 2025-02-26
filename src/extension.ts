import * as vscode from 'vscode';
import * as path from 'path';

// 當擴展被啟動時執行
export function activate(context: vscode.ExtensionContext) {
    console.log('擴展 "copy-for-ai" 已啟動！');

    // 註冊命令處理器
    const disposable = vscode.commands.registerCommand('copy-for-ai.copyForAI', () => {
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

        // 取得選取的文字
        const document = editor.document;
        const text = document.getText(selection);
        
        // 取得檔案資訊
        const fileName = document.fileName;
        const relativePath = vscode.workspace.asRelativePath(fileName);
        
        // 取得選取的行號範圍
        const startLine = selection.start.line + 1; // VSCode 行號從 0 開始，但顯示時從 1 開始
        const endLine = selection.end.line + 1;
        
        // 取得程式語言 ID
        const languageId = document.languageId;
        
        // 處理程式碼縮排
        const lines = text.split('\n');
        
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
        
        // 組合為 Markdown 格式
        const markdownHeader = `## File: ${relativePath} (${startLine}-${endLine})`;
        const markdownCode = '```' + languageId + '\n' + processedLines.join('\n') + '\n```';
        const markdownText = markdownHeader + '\n' + markdownCode;
        
        // 複製到剪貼簿
        vscode.env.clipboard.writeText(markdownText).then(() => {
            vscode.window.showInformationMessage('已複製程式碼到剪貼簿 (支援 AI 使用的格式)');
        });
    });

    context.subscriptions.push(disposable);
}

// 當擴展被停用時執行
export function deactivate() {}