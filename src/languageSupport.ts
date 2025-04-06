/**
 * 獲取特定語言的關鍵字列表
 * @param languageId 語言 ID
 * @returns 關鍵字列表
 */
export function getLanguageKeywords(languageId: string): string[] {
    switch (languageId) {
        case 'typescript':
        case 'javascript':
        case 'typescriptreact':
        case 'javascriptreact':
            return jsKeywords;
        case 'python':
            return pythonKeywords;
        case 'java':
            return javaKeywords;
        case 'csharp':
            return csharpKeywords;
        case 'razor': // 新增對 cshtml (razor) 的支援
            return csharpKeywords; // 使用 C# 關鍵字
        case 'cpp':
        case 'c':
            return cppKeywords;
        case 'go':
            return goKeywords;
        case 'ruby':
            return rubyKeywords;
        case 'php':
            return phpKeywords;
        case 'swift':
            return swiftKeywords;
        case 'rust':
            return rustKeywords;
        case 'kotlin':
            return kotlinKeywords;
        case 'markdown': // 新增對 markdown 的支援
            return []; // Markdown 沒有關鍵字
        default:
            return [];
    }
}

// JavaScript/TypeScript 關鍵字
const jsKeywords = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 
    'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 
    'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package', 
    'private', 'protected', 'public', 'return', 'super', 'switch', 'static', 'this', 'throw', 
    'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'await', 
    'of', 'get', 'set', 'constructor'
];

// Python 關鍵字
const pythonKeywords = [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 
    'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 
    'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 
    'return', 'try', 'while', 'with', 'yield'
];

// Java 關鍵字
const javaKeywords = [
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 
    'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 
    'finally', 'float', 'for', 'if', 'goto', 'implements', 'import', 'instanceof', 'int', 
    'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 
    'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 
    'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null'
];

// C# 關鍵字
const csharpKeywords = [
    'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 
    'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 
    'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 
    'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 
    'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 
    'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 
    'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 
    'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual', 
    'void', 'volatile', 'while'
];

// C/C++ 關鍵字
const cppKeywords = [
    'alignas', 'alignof', 'and', 'and_eq', 'asm', 'atomic_cancel', 'atomic_commit', 
    'atomic_noexcept', 'auto', 'bitand', 'bitor', 'bool', 'break', 'case', 'catch', 'char', 
    'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept', 'const', 'consteval', 
    'constexpr', 'const_cast', 'continue', 'co_await', 'co_return', 'co_yield', 'decltype', 
    'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export', 
    'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 
    'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 
    'or_eq', 'private', 'protected', 'public', 'register', 'reinterpret_cast', 'requires', 
    'return', 'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 
    'switch', 'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef', 'typeid', 
    'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t', 'while', 
    'xor', 'xor_eq'
];

// Go 關鍵字
const goKeywords = [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 
    'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 
    'return', 'select', 'struct', 'switch', 'type', 'var'
];

// Ruby 關鍵字
const rubyKeywords = [
    'BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 
    'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 
    'nil', 'not', 'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 
    'true', 'undef', 'unless', 'until', 'when', 'while', 'yield'
];

// PHP 關鍵字
const phpKeywords = [
    '__halt_compiler', 'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 
    'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default', 'die', 'do', 
    'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 
    'endswitch', 'endwhile', 'eval', 'exit', 'extends', 'final', 'finally', 'for', 
    'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include', 'include_once', 
    'instanceof', 'insteadof', 'interface', 'isset', 'list', 'namespace', 'new', 'or', 
    'print', 'private', 'protected', 'public', 'require', 'require_once', 'return', 
    'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield'
];

// Swift 關鍵字
const swiftKeywords = [
    'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 
    'init', 'inout', 'internal', 'let', 'open', 'operator', 'private', 'protocol', 'public', 
    'rethrows', 'static', 'struct', 'subscript', 'typealias', 'var', 'break', 'case', 
    'continue', 'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard', 'if', 'in', 
    'repeat', 'return', 'switch', 'where', 'while', 'as', 'Any', 'catch', 'false', 'is', 
    'nil', 'super', 'self', 'Self', 'throw', 'throws', 'true', 'try'
];

// Rust 關鍵字
const rustKeywords = [
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 
    'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 
    'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 
    'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'abstract', 'become', 
    'box', 'do', 'final', 'macro', 'override', 'priv', 'typeof', 'unsized', 'virtual', 'yield'
];

// Kotlin 關鍵字
const kotlinKeywords = [
    'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 
    'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 
    'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while', 'by', 'catch', 
    'constructor', 'delegate', 'dynamic', 'field', 'file', 'finally', 'get', 'import', 
    'init', 'param', 'property', 'receiver', 'set', 'setparam', 'value', 'where'
];