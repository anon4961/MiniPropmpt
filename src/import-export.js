/**
 * 미니프롬 - Export / Import
 * 포맷: 미니 프리셋 스타일 (자체 JSON, type 필드로 검증)
 */

import {
    EXPORT_TYPE,
    DATA_VERSION,
    LOG_PREFIX,
    LOG_PREFIX_DEV,
    generateId,
} from './constants.js';
import {
    getSet,
    addSet,
    getOrCreateCharacterData,
    getOrCreateChatData,
    save,
} from './storage.js';

/**
 * 슬롯 세트를 export 객체로 변환
 */
function setToExportFormat(set, scope, originalTarget) {
    return {
        type: EXPORT_TYPE,
        version: DATA_VERSION,
        exportDate: new Date().toISOString(),
        name: set.name,
        scope: scope,                         // 'character' | 'chat'
        originalTarget: originalTarget || '', // 원본 캐릭터/채팅 식별자 (참고용)
        enabled: set.enabled,
        prompts: (set.slots || []).map(slot => ({
            id: slot.id,                      // import 시 새 ID 부여 가능
            name: slot.label,                 // 미니프리셋 스타일: name
            enabled: slot.enabled,
            content: slot.content,
            role: slot.role,
            injection_position: slot.position === 'in_chat' ? 1 : 0,
            injection_depth: slot.depth,
            injection_order: slot.order,
            position_raw: slot.position,      // 본 확장 전용 필드 (기본 보존)
        })),
    };
}

/**
 * Export 객체를 슬롯 세트 구조로 변환
 */
function importFormatToSet(data) {
    if (!data || data.type !== EXPORT_TYPE) {
        throw new Error(`잘못된 파일 형식입니다 (type: ${data?.type})`);
    }
    if (!Array.isArray(data.prompts)) {
        throw new Error('prompts 배열이 없습니다');
    }

    const slots = data.prompts.map(p => ({
        id: generateId('slot'),               // import 시 항상 새 ID 부여 (충돌 방지)
        label: p.name || '이름 없음',
        enabled: p.enabled !== false,
        content: p.content || '',
        role: ['system', 'user', 'assistant'].includes(p.role) ? p.role : 'system',
        position: p.position_raw
            || (p.injection_position === 1 ? 'in_chat' : 'before_main'),
        depth: typeof p.injection_depth === 'number' ? p.injection_depth : 0,
        order: typeof p.injection_order === 'number' ? p.injection_order : 100,
    }));

    return {
        id: generateId('set'),
        name: data.name || 'Imported Set',
        enabled: data.enabled !== false,
        slots: slots,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        _importedFrom: data.originalTarget || '',
        _importDate: new Date().toISOString(),
    };
}

/**
 * 단일 세트 export → JSON 문자열
 */
export function exportSet(scope, targetKey, setId) {
    const set = getSet(scope, targetKey, setId);
    if (!set) return null;
    const exportData = setToExportFormat(set, scope, targetKey);
    return JSON.stringify(exportData, null, 2);
}

/**
 * 파일 다운로드 트리거 (브라우저)
 */
export function downloadAsFile(filename, jsonString) {
    try {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        return true;
    } catch (e) {
        console.error(`${LOG_PREFIX_DEV} 파일 다운로드 실패:`, e);
        return false;
    }
}

/**
 * 파일명 생성 (날짜 포함)
 */
export function makeExportFilename(setName) {
    const safe = String(setName || 'set').replace(/[^a-zA-Z0-9가-힣\-_ ]/g, '_').trim();
    const date = new Date().toISOString().slice(0, 10);
    return `MiniCustomPrompt_${safe}_${date}.json`;
}

/**
 * JSON 문자열 파싱 + 검증
 * @returns {{valid: boolean, data?: object, error?: string}}
 */
export function parseImportJson(jsonString) {
    let data;
    try {
        data = JSON.parse(jsonString);
    } catch (e) {
        return { valid: false, error: 'JSON 파싱 실패: ' + e.message };
    }
    if (!data || typeof data !== 'object') {
        return { valid: false, error: '올바른 객체가 아닙니다' };
    }
    if (data.type !== EXPORT_TYPE) {
        return { valid: false, error: `미니프롬 파일이 아닙니다 (type: ${data.type || '없음'})` };
    }
    if (!Array.isArray(data.prompts)) {
        return { valid: false, error: 'prompts 배열이 없습니다' };
    }
    return { valid: true, data };
}

/**
 * Import 실행
 * @param {object} parsedData - parseImportJson의 data
 * @param {string} targetScope - 'character' | 'chat' (사용자가 선택)
 * @param {string} targetKey - 적용할 캐릭터/채팅 키
 * @param {string} conflictMode - 'append' | 'overwrite' | 'rename' (이름 충돌 처리)
 * @returns {{success: boolean, set?: object, error?: string}}
 */
export function importSet(parsedData, targetScope, targetKey, conflictMode = 'rename') {
    try {
        if (!targetKey) {
            return { success: false, error: '적용 대상이 지정되지 않았습니다' };
        }

        const newSet = importFormatToSet(parsedData);

        // 데이터 컨테이너 가져오기
        const data = targetScope === 'character'
            ? getOrCreateCharacterData(targetKey)
            : getOrCreateChatData(targetKey);
        if (!data) {
            return { success: false, error: '대상 데이터를 가져올 수 없습니다' };
        }
        if (!Array.isArray(data.sets)) data.sets = [];

        // 이름 충돌 검사
        const existingIdx = data.sets.findIndex(s => s.name === newSet.name);
        if (existingIdx !== -1) {
            if (conflictMode === 'overwrite') {
                data.sets[existingIdx] = newSet;
            } else if (conflictMode === 'append') {
                data.sets.push(newSet);  // 같은 이름 그대로 추가
            } else {
                // rename: 이름 뒤에 (n) 추가
                let counter = 2;
                let candidate = `${newSet.name} (${counter})`;
                while (data.sets.some(s => s.name === candidate)) {
                    counter++;
                    candidate = `${newSet.name} (${counter})`;
                }
                newSet.name = candidate;
                data.sets.push(newSet);
            }
        } else {
            data.sets.push(newSet);
        }

        save();
        return { success: true, set: newSet };
    } catch (e) {
        console.error(`${LOG_PREFIX_DEV} Import 실패:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * 충돌 검사 (Import 전 사용자 확인용)
 */
export function checkImportConflict(parsedData, targetScope, targetKey) {
    if (!parsedData || !targetKey) return { hasConflict: false };

    const data = targetScope === 'character'
        ? getOrCreateCharacterData(targetKey)
        : getOrCreateChatData(targetKey);
    if (!data || !Array.isArray(data.sets)) return { hasConflict: false };

    const conflictSet = data.sets.find(s => s.name === parsedData.name);
    return {
        hasConflict: !!conflictSet,
        conflictSetName: conflictSet?.name || null,
        importSetName: parsedData.name,
    };
}
