/**
 * 미니프롬 - 데이터 저장/로드
 * extension_settings에 통합 저장 (Highlighter 패턴)
 */

import { extension_settings, getContext } from '../../../../extensions.js';
import { saveSettingsDebounced, characters, this_chid } from '../../../../../script.js';
import {
    SETTINGS_KEY,
    DATA_VERSION,
    DEFAULT_SETTINGS,
    LOG_PREFIX,
    LOG_PREFIX_DEV,
    createEmptySet,
    makeChatKey,
} from './constants.js';

/**
 * 그룹 정보를 안전하게 가져오기 (getContext 우회)
 */
function getGroupContext() {
    try {
        const ctx = getContext();
        return {
            selected_group: ctx?.groupId || null,
            groups: ctx?.groups || [],
        };
    } catch (e) {
        return { selected_group: null, groups: [] };
    }
}

/**
 * 설정 초기화 (확장 시작 시 1회 호출)
 */
export function initSettings() {
    if (!extension_settings[SETTINGS_KEY]) {
        extension_settings[SETTINGS_KEY] = structuredClone(DEFAULT_SETTINGS);
        saveSettingsDebounced();
        console.log(`${LOG_PREFIX_DEV} 설정 초기화 완료`);
        return;
    }

    // 누락된 필드 자동 보강 (마이그레이션)
    const settings = extension_settings[SETTINGS_KEY];
    let migrated = false;

    if (!settings.version) {
        settings.version = DATA_VERSION;
        migrated = true;
    }
    if (typeof settings.enabled !== 'boolean') {
        settings.enabled = true;
        migrated = true;
    }
    if (!settings.characters || typeof settings.characters !== 'object') {
        settings.characters = {};
        migrated = true;
    }
    if (!settings.chats || typeof settings.chats !== 'object') {
        settings.chats = {};
        migrated = true;
    }
    if (!settings.ui || typeof settings.ui !== 'object') {
        settings.ui = structuredClone(DEFAULT_SETTINGS.ui);
        migrated = true;
    } else {
        // ui 하위 필드 보강
        for (const key of Object.keys(DEFAULT_SETTINGS.ui)) {
            if (settings.ui[key] === undefined) {
                settings.ui[key] = DEFAULT_SETTINGS.ui[key];
                migrated = true;
            }
        }
    }

    if (migrated) {
        saveSettingsDebounced();
        console.log(`${LOG_PREFIX_DEV} 설정 마이그레이션 완료`);
    }
}

/**
 * 전체 설정 객체 반환
 */
export function getSettings() {
    if (!extension_settings[SETTINGS_KEY]) {
        initSettings();
    }
    return extension_settings[SETTINGS_KEY];
}

/**
 * 저장 (debounced - SillyTavern이 알아서 처리)
 */
export function save() {
    saveSettingsDebounced();
}

/**
 * 현재 캐릭터 키 반환 (avatar 파일명)
 * 그룹 채팅인 경우 'group_<groupId>' 형식
 */
export function getCurrentCharacterKey() {
    const { selected_group } = getGroupContext();
    if (selected_group) {
        return `group_${selected_group}`;
    }
    if (this_chid === undefined || this_chid === null) {
        return null;
    }
    const char = characters?.[this_chid];
    if (!char || !char.avatar) return null;
    return char.avatar;
}

/**
 * 현재 채팅 파일명 반환
 */
export function getCurrentChatFile() {
    const { selected_group, groups } = getGroupContext();
    if (selected_group) {
        const group = groups?.find(g => g.id === selected_group);
        return group?.chat_id || null;
    }
    if (this_chid === undefined || this_chid === null) return null;
    const char = characters?.[this_chid];
    return char?.chat || null;
}

/**
 * 현재 채팅 키 반환
 */
export function getCurrentChatKey() {
    const charKey = getCurrentCharacterKey();
    const chatFile = getCurrentChatFile();
    return makeChatKey(charKey, chatFile);
}

// ===== 캐릭터 단위 데이터 =====

/**
 * 특정 캐릭터의 데이터 조회 (없으면 빈 구조 반환, 자동 생성 X)
 */
export function getCharacterData(charKey) {
    if (!charKey) return null;
    const settings = getSettings();
    return settings.characters[charKey] || null;
}

/**
 * 특정 캐릭터의 데이터 조회 (없으면 자동 생성)
 */
export function getOrCreateCharacterData(charKey) {
    if (!charKey) return null;
    const settings = getSettings();
    if (!settings.characters[charKey]) {
        settings.characters[charKey] = { sets: [] };
        save();
    }
    return settings.characters[charKey];
}

/**
 * 캐릭터 데이터 삭제
 */
export function deleteCharacterData(charKey) {
    if (!charKey) return false;
    const settings = getSettings();
    if (settings.characters[charKey]) {
        delete settings.characters[charKey];
        save();
        return true;
    }
    return false;
}

// ===== 채팅 단위 데이터 =====

/**
 * 특정 채팅의 데이터 조회
 */
export function getChatData(chatKey) {
    if (!chatKey) return null;
    const settings = getSettings();
    return settings.chats[chatKey] || null;
}

/**
 * 특정 채팅의 데이터 조회 (없으면 자동 생성)
 */
export function getOrCreateChatData(chatKey) {
    if (!chatKey) return null;
    const settings = getSettings();
    if (!settings.chats[chatKey]) {
        settings.chats[chatKey] = { sets: [] };
        save();
    }
    return settings.chats[chatKey];
}

/**
 * 채팅 데이터 삭제
 */
export function deleteChatData(chatKey) {
    if (!chatKey) return false;
    const settings = getSettings();
    if (settings.chats[chatKey]) {
        delete settings.chats[chatKey];
        save();
        return true;
    }
    return false;
}

// ===== 세트 CRUD =====

/**
 * 세트 추가
 */
export function addSet(scope, targetKey, setName) {
    const data = scope === 'character'
        ? getOrCreateCharacterData(targetKey)
        : getOrCreateChatData(targetKey);
    if (!data) return null;

    const newSet = createEmptySet(setName);
    data.sets.push(newSet);
    save();
    return newSet;
}

/**
 * 세트 업데이트
 */
export function updateSet(scope, targetKey, setId, updates) {
    const data = scope === 'character'
        ? getCharacterData(targetKey)
        : getChatData(targetKey);
    if (!data) return false;

    const set = data.sets.find(s => s.id === setId);
    if (!set) return false;

    Object.assign(set, updates, { updatedAt: Date.now() });
    save();
    return true;
}

/**
 * 세트 삭제
 */
export function deleteSet(scope, targetKey, setId) {
    const data = scope === 'character'
        ? getCharacterData(targetKey)
        : getChatData(targetKey);
    if (!data) return false;

    const idx = data.sets.findIndex(s => s.id === setId);
    if (idx === -1) return false;

    data.sets.splice(idx, 1);
    save();
    return true;
}

/**
 * 세트 가져오기 (단일)
 */
export function getSet(scope, targetKey, setId) {
    const data = scope === 'character'
        ? getCharacterData(targetKey)
        : getChatData(targetKey);
    if (!data) return null;
    return data.sets.find(s => s.id === setId) || null;
}

/**
 * 모든 세트 가져오기 (특정 대상)
 */
export function getAllSets(scope, targetKey) {
    const data = scope === 'character'
        ? getCharacterData(targetKey)
        : getChatData(targetKey);
    return data?.sets || [];
}

// ===== 슬롯 CRUD =====

/**
 * 슬롯 추가
 */
export function addSlot(scope, targetKey, setId, slot) {
    const set = getSet(scope, targetKey, setId);
    if (!set) return false;
    if (!Array.isArray(set.slots)) set.slots = [];
    set.slots.push(slot);
    set.updatedAt = Date.now();
    save();
    return true;
}

/**
 * 슬롯 업데이트
 */
export function updateSlot(scope, targetKey, setId, slotId, updates) {
    const set = getSet(scope, targetKey, setId);
    if (!set || !Array.isArray(set.slots)) return false;
    const slot = set.slots.find(s => s.id === slotId);
    if (!slot) return false;
    Object.assign(slot, updates);
    set.updatedAt = Date.now();
    save();
    return true;
}

/**
 * 슬롯 삭제
 */
export function deleteSlot(scope, targetKey, setId, slotId) {
    const set = getSet(scope, targetKey, setId);
    if (!set || !Array.isArray(set.slots)) return false;
    const idx = set.slots.findIndex(s => s.id === slotId);
    if (idx === -1) return false;
    set.slots.splice(idx, 1);
    set.updatedAt = Date.now();
    save();
    return true;
}

/**
 * 슬롯 순서 재정렬 (drag & drop 결과 반영)
 */
export function reorderSlots(scope, targetKey, setId, newSlotIds) {
    const set = getSet(scope, targetKey, setId);
    if (!set || !Array.isArray(set.slots)) return false;

    const idMap = new Map(set.slots.map(s => [s.id, s]));
    const reordered = [];
    for (const id of newSlotIds) {
        if (idMap.has(id)) {
            reordered.push(idMap.get(id));
            idMap.delete(id);
        }
    }
    // 누락된 슬롯도 마지막에 보존 (안전장치)
    for (const remaining of idMap.values()) {
        reordered.push(remaining);
    }

    set.slots = reordered;
    set.updatedAt = Date.now();
    save();
    return true;
}

// ===== 채팅방 이름 변경 마이그레이션 =====

/**
 * 채팅방 이름 변경 시 데이터 키 이전
 */
export function migrateChatKey(charKey, oldChatFile, newChatFile) {
    if (!charKey || !oldChatFile || !newChatFile) return false;
    if (oldChatFile === newChatFile) return false;

    const oldKey = makeChatKey(charKey, oldChatFile);
    const newKey = makeChatKey(charKey, newChatFile);
    const settings = getSettings();

    if (!settings.chats[oldKey]) return false;
    if (settings.chats[newKey]) {
        // 충돌: 새 이름에 이미 데이터가 있음. 안전을 위해 이전 안 함.
        console.warn(`${LOG_PREFIX_DEV} 채팅방 이름 변경 마이그레이션 충돌: ${newKey}에 이미 데이터 존재`);
        return false;
    }

    settings.chats[newKey] = settings.chats[oldKey];
    delete settings.chats[oldKey];
    save();
    console.log(`${LOG_PREFIX_DEV} 채팅방 데이터 이전: ${oldKey} → ${newKey}`);
    return true;
}

// ===== 고아 데이터 감지 =====

/**
 * 현재 존재하지 않는 캐릭터·채팅방의 데이터 찾기
 * @returns {{orphanedCharacters: string[], orphanedChats: string[]}}
 */
export function findOrphanedData() {
    const settings = getSettings();
    const result = { orphanedCharacters: [], orphanedChats: [] };

    if (!characters || characters.length === 0) {
        // 캐릭터 데이터가 아직 로드 안 됐음 - 검사 스킵
        return result;
    }

    const { groups } = getGroupContext();
    const validAvatars = new Set(characters.map(c => c.avatar));
    const validGroupKeys = new Set((groups || []).map(g => `group_${g.id}`));

    // 캐릭터 데이터 검사
    for (const charKey of Object.keys(settings.characters)) {
        if (!validAvatars.has(charKey) && !validGroupKeys.has(charKey)) {
            result.orphanedCharacters.push(charKey);
        }
    }

    // 채팅 데이터 검사 (채팅 파일 존재 여부는 확인 어려움 - 캐릭터 존재 여부만 체크)
    for (const chatKey of Object.keys(settings.chats)) {
        const idx = chatKey.indexOf('__');
        if (idx === -1) {
            result.orphanedChats.push(chatKey);
            continue;
        }
        const charKey = chatKey.substring(0, idx);
        if (!validAvatars.has(charKey) && !validGroupKeys.has(charKey)) {
            result.orphanedChats.push(chatKey);
        }
    }

    return result;
}

/**
 * 고아 데이터 삭제 (사용자 확인 후 호출)
 */
export function removeOrphanedData(charKeys = [], chatKeys = []) {
    const settings = getSettings();
    let removedChars = 0;
    let removedChats = 0;

    for (const k of charKeys) {
        if (settings.characters[k]) {
            delete settings.characters[k];
            removedChars++;
        }
    }
    for (const k of chatKeys) {
        if (settings.chats[k]) {
            delete settings.chats[k];
            removedChats++;
        }
    }

    if (removedChars > 0 || removedChats > 0) {
        save();
    }
    return { removedChars, removedChats };
}

/**
 * 전체 데이터 삭제 (모든 캐릭터·채팅 세트 + 슬롯)
 * 마스터 스위치, UI 설정은 유지
 * @returns {{removedChars: number, removedChats: number}}
 */
export function purgeAllData() {
    const settings = getSettings();
    const removedChars = Object.keys(settings.characters || {}).length;
    const removedChats = Object.keys(settings.chats || {}).length;
    settings.characters = {};
    settings.chats = {};
    save();
    console.log(`${LOG_PREFIX_DEV} 전체 데이터 삭제: 캐릭터 ${removedChars}개, 채팅 ${removedChats}개`);
    return { removedChars, removedChats };
}

// ===== 현재 컨텍스트 통합 요약 =====

/**
 * 현재 채팅방에 적용 중인 모든 세트(캐릭터+채팅) 통합 정보 반환
 * UI 요약 뷰용
 */
export function getActiveSetsSummary() {
    const settings = getSettings();
    const charKey = getCurrentCharacterKey();
    const chatKey = getCurrentChatKey();
    const result = {
        masterEnabled: !!settings.enabled,
        characterKey: charKey,
        chatKey: chatKey,
        characterSets: [],
        chatSets: [],
        totalActiveSlots: 0,
    };

    if (charKey) {
        const charData = settings.characters[charKey];
        if (charData?.sets) {
            for (const s of charData.sets) {
                const activeSlotCount = (s.slots || []).filter(sl => sl.enabled).length;
                result.characterSets.push({
                    id: s.id,
                    name: s.name,
                    enabled: !!s.enabled,
                    totalSlots: (s.slots || []).length,
                    activeSlots: activeSlotCount,
                });
                if (s.enabled) {
                    result.totalActiveSlots += activeSlotCount;
                }
            }
        }
    }

    if (chatKey) {
        const chatData = settings.chats[chatKey];
        if (chatData?.sets) {
            for (const s of chatData.sets) {
                const activeSlotCount = (s.slots || []).filter(sl => sl.enabled).length;
                result.chatSets.push({
                    id: s.id,
                    name: s.name,
                    enabled: !!s.enabled,
                    totalSlots: (s.slots || []).length,
                    activeSlots: activeSlotCount,
                });
                if (s.enabled) {
                    result.totalActiveSlots += activeSlotCount;
                }
            }
        }
    }

    return result;
}
