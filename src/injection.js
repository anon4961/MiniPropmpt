/**
 * Mini Prompt - 프롬프트 주입 엔진 (v2: binding 기반)
 * CHAT_COMPLETION_PROMPT_READY 이벤트를 후킹하여 messages 배열에 직접 주입
 */

import { eventSource, event_types } from '../../../../../script.js';
import { LOG_PREFIX_DEV } from './constants.js';
import {
    getSettings,
    getCurrentCharacterKey,
    getCurrentChatKey,
    getBoundSets,
} from './storage.js';
import { substituteMacros } from './macros.js';

let _injectionListener = null;

/**
 * 활성 슬롯 수집
 * 현재 채팅방에 binding된 모든 세트의 enabled 슬롯들을 수집
 */
function collectActiveSlots() {
    const settings = getSettings();
    if (!settings.enabled) return [];

    const charKey = getCurrentCharacterKey();
    const chatKey = getCurrentChatKey();
    const slots = [];

    // 캐릭터 binding된 세트들
    if (charKey) {
        const charSets = getBoundSets('character', charKey);
        for (const set of charSets) {
            if (!Array.isArray(set.slots)) continue;
            for (const slot of set.slots) {
                if (!slot.enabled) continue;
                if (!slot.content) continue;
                slots.push({ ...slot, _scope: 'character', _setName: set.name });
            }
        }
    }

    // 채팅 binding된 세트들
    if (chatKey) {
        const chatSets = getBoundSets('chat', chatKey);
        for (const set of chatSets) {
            if (!Array.isArray(set.slots)) continue;
            for (const slot of set.slots) {
                if (!slot.enabled) continue;
                if (!slot.content) continue;
                slots.push({ ...slot, _scope: 'chat', _setName: set.name });
            }
        }
    }

    return slots;
}

/**
 * CHAT_COMPLETION_PROMPT_READY 이벤트 핸들러
 */
function onPromptReady(eventData) {
    try {
        if (!eventData || !Array.isArray(eventData.chat)) return;
        if (eventData.dryRun) return;

        const slots = collectActiveSlots();
        if (slots.length === 0) return;

        const messages = eventData.chat;

        for (const slot of slots) {
            const content = substituteMacros(slot.content);
            if (!content) continue;

            const message = {
                role: slot.role || 'system',
                content: content,
            };

            if (slot.position === 'before_main') {
                messages.unshift(message);
            } else if (slot.position === 'after_main') {
                if (messages.length > 0 && messages[0]?.role === 'system') {
                    messages.splice(1, 0, message);
                } else {
                    messages.unshift(message);
                }
            } else {
                // in_chat: depth 만큼 끝에서 역산
                const depth = Math.max(0, parseInt(slot.depth, 10) || 0);
                const insertIdx = Math.max(0, messages.length - depth);
                messages.splice(insertIdx, 0, message);
            }
        }
    } catch (e) {
        console.error(`${LOG_PREFIX_DEV} 주입 중 오류:`, e);
    }
}

export function startInjection() {
    if (_injectionListener) {
        console.warn(`${LOG_PREFIX_DEV} 주입 엔진 이미 실행 중`);
        return;
    }

    const evName = event_types?.CHAT_COMPLETION_PROMPT_READY;
    if (!evName) {
        console.warn(`${LOG_PREFIX_DEV} CHAT_COMPLETION_PROMPT_READY 이벤트를 찾을 수 없음`);
        return;
    }

    _injectionListener = onPromptReady;
    eventSource.on(evName, _injectionListener);
    console.log(`${LOG_PREFIX_DEV} 주입 엔진 시작`);
}

export function stopInjection() {
    if (!_injectionListener) return;

    const evName = event_types?.CHAT_COMPLETION_PROMPT_READY;
    if (evName && typeof eventSource.removeListener === 'function') {
        eventSource.removeListener(evName, _injectionListener);
    }
    _injectionListener = null;
    console.log(`${LOG_PREFIX_DEV} 주입 엔진 중지`);
}

/**
 * 프리뷰용
 */
export function getPreviewMessages() {
    const slots = collectActiveSlots();
    return slots.map(slot => ({
        role: slot.role || 'system',
        content: substituteMacros(slot.content),
        _label: slot.label,
        _position: slot.position,
        _depth: slot.depth,
        _scope: slot._scope,
        _setName: slot._setName,
    }));
}
