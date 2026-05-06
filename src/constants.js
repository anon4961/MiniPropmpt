/**
 * Mini Prompt (MiniCustomPrompt)
 * 상수 및 기본값 정의
 */

export const EXTENSION_NAME = 'MiniCustomPrompt';
export const EXTENSION_DISPLAY_NAME = 'Mini Prompt';
export const SETTINGS_KEY = 'MiniCustomPrompt';
export const DATA_VERSION = 1;
export const EXPORT_TYPE = 'MiniCustomPrompt';

// UI 식별자 prefix (DOM 충돌 방지)
export const UI_PREFIX = 'mcp-';

// 로그 prefix
export const LOG_PREFIX = '[Mini Prompt]';
export const LOG_PREFIX_DEV = '[MiniCustomPrompt]';

// 슬롯 기본값
export const DEFAULT_SLOT = {
    label: '새 슬롯',
    enabled: true,
    content: '',
    role: 'system',                  // 'system' | 'user' | 'assistant'
    position: 'in_chat',             // 'before_main' | 'after_main' | 'in_chat'
    depth: 0,
    order: 100,
};

// 위치 옵션 (SillyTavern 작가노트와 동일한 라벨)
export const POSITION_LABELS = {
    'before_main': 'Before Main Prompt / Story String',
    'after_main': 'After Main Prompt / Story String',
    'in_chat': 'In-chat @ Depth',
};

// 역할 옵션
export const ROLE_LABELS = {
    'system': 'System',
    'user': 'User',
    'assistant': 'Assistant',
};

// 기본 설정 구조
export const DEFAULT_SETTINGS = {
    version: DATA_VERSION,
    enabled: true,                   // 확장 전체 ON/OFF (마스터 스위치)
    characters: {},                  // { "avatar.png": { sets: [...] } }
    chats: {},                       // { "avatarKey__chatFile": { sets: [...] } }
    ui: {
        showTokenCount: true,
        confirmBeforeDelete: true,
    },
};

// 슬롯 세트 기본 구조
export function createEmptySet(name = '기본 세트') {
    return {
        id: generateId('set'),
        name: name,
        enabled: true,
        slots: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

export function createEmptySlot(label = '새 슬롯') {
    return {
        id: generateId('slot'),
        ...DEFAULT_SLOT,
        label: label,
    };
}

// 고유 ID 생성
export function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// 채팅방 키 합성
export function makeChatKey(charKey, chatFile) {
    if (!charKey || !chatFile) return null;
    return `${charKey}__${chatFile}`;
}
