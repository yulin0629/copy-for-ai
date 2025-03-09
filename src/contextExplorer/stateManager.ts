import * as vscode from 'vscode';
import { ExplorerState } from './types';

/**
 * Context Explorer 狀態管理類
 * 負責統一管理檔案選擇狀態的保存和讀取
 */
export class StateManager {
    private static readonly STATE_KEY = 'contextExplorer.state';
    
    constructor(private context: vscode.ExtensionContext) {}
    
    /**
     * 獲取當前狀態
     * @returns 檔案瀏覽器狀態
     */
    public getState(): ExplorerState {
        return this.context.workspaceState.get<ExplorerState>(
            StateManager.STATE_KEY, 
            { selectionState: {}, expandedFolders: {} }
        ) as ExplorerState;
    }
    
    /**
     * 更新整體狀態
     * @param state 新的狀態
     */
    public updateState(state: ExplorerState): Thenable<void> {
        return this.context.workspaceState.update(StateManager.STATE_KEY, state);
    }
    
    /**
     * 更新單個檔案的選擇狀態
     * @param filePath 檔案路徑
     * @param isSelected 是否選中
     */
    public updateFileSelection(filePath: string, isSelected: boolean): Thenable<void> {
        const state = this.getState();
        const relativePath = vscode.workspace.asRelativePath(filePath);
        
        state.selectionState[relativePath] = isSelected;
        
        return this.updateState(state);
    }
    
    /**
     * 展開檔案的所有父資料夾
     * @param filePath 檔案路徑
     */
    public expandParentFolders(filePath: string): Thenable<void> {
        const state = this.getState();
        const relativePath = vscode.workspace.asRelativePath(filePath);
        const parts = relativePath.split(/[\/\\]/);
        
        let parentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
            parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
            state.expandedFolders[parentPath] = true;
        }
        
        return this.updateState(state);
    }
    
    /**
     * 更新檔案選擇狀態並展開父資料夾
     * @param filePath 檔案路徑
     * @param isSelected 是否選中
     */
    public async selectFileAndExpandParents(filePath: string, isSelected: boolean): Promise<ExplorerState> {
        const state = this.getState();
        const relativePath = vscode.workspace.asRelativePath(filePath);
        
        // 更新選擇狀態
        state.selectionState[relativePath] = isSelected;
        
        // 如果是選中，則展開父資料夾
        if (isSelected) {
            const parts = relativePath.split(/[\/\\]/);
            let parentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
                state.expandedFolders[parentPath] = true;
            }
        }
        
        // 保存狀態
        await this.updateState(state);
        
        // 返回更新後的狀態
        return state;
    }
    
    /**
     * 批量更新檔案選擇狀態
     * @param filePaths 檔案路徑列表
     * @param isSelected 是否選中
     */
    public async selectFilesAndExpandParents(filePaths: string[], isSelected: boolean): Promise<ExplorerState> {
        const state = this.getState();
        
        for (const filePath of filePaths) {
            const relativePath = vscode.workspace.asRelativePath(filePath);
            
            // 更新選擇狀態
            state.selectionState[relativePath] = isSelected;
            
            // 如果是選中，則展開父資料夾
            if (isSelected) {
                const parts = relativePath.split(/[\/\\]/);
                let parentPath = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
                    state.expandedFolders[parentPath] = true;
                }
            }
        }
        
        // 保存狀態
        await this.updateState(state);
        
        // 返回更新後的狀態
        return state;
    }
} 