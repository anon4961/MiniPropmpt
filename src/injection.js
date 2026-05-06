/**
 * 미니프롬 - 프롬프트 주입 엔진
 * CHAT_COMPLETION_PROMPT_READY 이벤트를 후킹하여 messages 배열에 직접 주입
 */

import { eventSource, event_types } from '../../../../../script.js';
import {
    LOG_PREFIX_DEV,
} from './constants.js';
import {
    getSettings,
    getCurrentCharacterKey,
    getCurrentChatKey,
    getCharacterData,
    getChatData,
} from './storage.js';
import { substituteMacros } from './macros.js';

let _injectionListener = null;

/**
 * 활성 슬롯 수집
 * 캐릭터 + 채팅 양쪽에서 활성화된 모든 슬롯을 합쳐서 반환
 */
function collectActiveSlots() {
    const settings = getSettings();
    if (!settings.enabled) return [];

    const charKey = getCurrentCharacterKey();
    const chatKey = getCurrentChatKey();
    const slots = [];

    // 캐릭터 단위 세트
    if (charKey) {
        const charData = getCharacterData(charKey);
        if (charData?.sets) {
            for (const set of charData.sets) {
                if (!set.enabled) continue;
                if (!Array.isArray(set.slots)) continue;
                for (const slot of set.slots) {
                    if (!slot.enabled) continue;
                    if (!slot.content) continue;
                    slots.push({ ...slot, _scope: 'character', _setName: set.name });
                }
            }
        }
    }

    // 채팅 단위 세트
    if (chatKey) {
        const chatData = getChatData(chatKey);
        if (chatData?.sets) {
            for (const set of chatData.sets) {
                if (!set.enabled) continue;
                if (!Array.isArray(set.slots)) continue;
                for (const slot of set.slots) {
                    if (!slot.enabled) continue;
                    if (!slot.content) continue;
                    slots.push({ ...slot, _scope: 'chat', _setName: set.name });
                }
            }
        }
    }

    return slots;
}

/**
 * CHAT_COMPLETION_PROMPT_READY 이벤트 핸들러
 * eventData.chat = OpenAI messages 배열
 */
function onPromptReady(eventData) {
    try {
        if (!eventData || !Array.isArray(eventData.chat)) return;
        if (eventData.dryRun) return;  // 테스트 호출 시 주입 안 함

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

            // 위치별 처리
            if (slot.position === 'before_main') {
                // 맨 앞에 삽입 (시스템 프롬프트보다 먼저)
                messages.unshift(message);
            } else if (slot.position === 'after_main') {
                // 메인 프롬프트 직후 — messages 배열의 1번 인덱스에 삽입
                // (0번은 시스템 프롬프트인 경우가 많음)
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
        // 이벤트 핸들러 내부 에러는 다른 확장으로 전파 안 되도록 차단
        console.error(`${LOG_PREFIX_DEV} 주입 중 오류:`, e);
    }
}

/**
 * 주입 엔진 시작
 */
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

/**
 * 주입 엔진 중지
 */
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
 * 프리뷰용: 현재 활성 슬롯들을 messages 형식으로 반환 (실제 주입 X)
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
