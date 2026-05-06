/**
 * Mini Prompt - UI 컨트롤러
 * 드로어(슬림 글로벌 설정) + 팝업(슬롯 편집)
 */

import { getContext } from '../../../../extensions.js';
import {
    EXTENSION_DISPLAY_NAME,
    LOG_PREFIX,
    LOG_PREFIX_DEV,
    POSITION_LABELS,
    createEmptySlot,
} from './constants.js';
import { DRAWER_HTML, POPUP_HTML } from './templates.js';
import {
    getSettings,
    save,
    getCurrentCharacterKey,
    getCurrentChatKey,
    getCharacterData,
    getChatData,
    addSet,
    updateSet,
    deleteSet,
    getAllSets,
    addSlot,
    updateSlot,
    deleteSlot,
    reorderSlots,
    findOrphanedData,
    removeOrphanedData,
    getActiveSetsSummary,
    purgeAllData,
} from './storage.js';
import { substituteMacros, estimateTokens } from './macros.js';
import { getPreviewMessages } from './injection.js';
import {
    exportSet,
    downloadAsFile,
    makeExportFilename,
    parseImportJson,
    importSet,
    checkImportConflict,
} from './import-export.js';

// UI 상태 (팝업이 열려있을 때만 의미 있음)
const uiState = {
    currentScope: 'character',
    currentSetId: null,
    popupInstance: null,
};

/**
 * 마지막 선택 캐시 (채팅방별로 분리)
 * 같은 채팅방에서 팝업을 다시 열면 이전 탭/세트 그대로 복원
 * 채팅방이 바뀌면 자동 무효화
 * Map<chatContextKey, {scope, characterSetId, chatSetId}>
 */
const lastSelectionCache = new Map();

function getContextKey() {
    // 캐릭터 키 + 채팅 키를 합쳐 컨텍스트 식별
    const charKey = getCurrentCharacterKey() || 'no-char';
    const chatKey = getCurrentChatKey() || 'no-chat';
    return `${charKey}::${chatKey}`;
}

function rememberSelection() {
    const key = getContextKey();
    let cached = lastSelectionCache.get(key);
    if (!cached) {
        cached = { scope: uiState.currentScope, characterSetId: null, chatSetId: null };
        lastSelectionCache.set(key, cached);
    }
    cached.scope = uiState.currentScope;
    if (uiState.currentScope === 'character') {
        cached.characterSetId = uiState.currentSetId;
    } else {
        cached.chatSetId = uiState.currentSetId;
    }
}

function recallSelection() {
    const key = getContextKey();
    const cached = lastSelectionCache.get(key);
    if (cached) {
        uiState.currentScope = cached.scope || 'character';
        uiState.currentSetId = uiState.currentScope === 'character'
            ? cached.characterSetId
            : cached.chatSetId;
    } else {
        // 새 컨텍스트: 채팅이 있으면 채팅 탭, 없으면 캐릭터 탭
        const charKey = getCurrentCharacterKey();
        const chatKey = getCurrentChatKey();
        if (chatKey) {
            uiState.currentScope = 'chat';
        } else if (charKey) {
            uiState.currentScope = 'character';
        } else {
            uiState.currentScope = 'character';
        }
        uiState.currentSetId = null;
    }
}

let _sortableInstance = null;

// ===== 유틸 =====

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 토스트 알림
 */
function toast(message, severity = 'info') {
    try {
        if (typeof toastr !== 'undefined' && toastr[severity]) {
            toastr[severity](message, EXTENSION_DISPLAY_NAME);
            return;
        }
    } catch (e) { /* fall through */ }
    console.log(`${LOG_PREFIX} ${message}`);
}

/**
 * Confirm 다이얼로그 (SillyTavern Popup 우선)
 */
async function confirmDialog(message, title = EXTENSION_DISPLAY_NAME) {
    try {
        const ctx = getContext();
        if (ctx?.Popup?.show?.confirm) {
            return await ctx.Popup.show.confirm(title, message);
        }
    } catch (e) { /* fall through */ }
    return window.confirm(message);
}

/**
 * Input 다이얼로그
 */
async function inputDialog(message, defaultValue = '', title = EXTENSION_DISPLAY_NAME) {
    try {
        const ctx = getContext();
        if (ctx?.Popup?.show?.input) {
            return await ctx.Popup.show.input(title, message, defaultValue);
        }
    } catch (e) { /* fall through */ }
    return window.prompt(message, defaultValue);
}

/**
 * Text 다이얼로그 (단순 표시)
 */
async function textDialog(html, title = EXTENSION_DISPLAY_NAME) {
    try {
        const ctx = getContext();
        if (ctx?.Popup?.show?.text) {
            return await ctx.Popup.show.text(title, html);
        }
    } catch (e) { /* fall through */ }
    window.alert(typeof html === 'string' ? html.replace(/<[^>]+>/g, '') : String(html));
    return null;
}

// ===== 컨텍스트 =====

function getCurrentTargetKey() {
    return uiState.currentScope === 'character'
        ? getCurrentCharacterKey()
        : getCurrentChatKey();
}

// ===== 활성 세트 요약 =====

/**
 * 팝업 상단 "현재 적용 중인 세트" 요약 렌더
 */
function renderActiveSummary() {
    const el = document.getElementById('mcp-summary-content');
    if (!el) return;

    const summary = getActiveSetsSummary();

    if (!summary.masterEnabled) {
        el.innerHTML = '<div class="mcp-summary-empty">⚠️ 확장 전체가 비활성화되어 있습니다 (드로어 메뉴에서 켜세요)</div>';
        return;
    }

    const charSetsHtml = summary.characterSets.length === 0
        ? '<span class="mcp-summary-empty-text">없음</span>'
        : summary.characterSets.map(s => {
            const cls = s.enabled ? 'mcp-summary-tag mcp-summary-tag-on' : 'mcp-summary-tag mcp-summary-tag-off';
            return `<span class="${cls}" title="${escapeHtml(s.name)}">${escapeHtml(s.name)} <small>(${s.activeSlots}/${s.totalSlots})</small></span>`;
        }).join(' ');

    const chatSetsHtml = summary.chatSets.length === 0
        ? '<span class="mcp-summary-empty-text">없음</span>'
        : summary.chatSets.map(s => {
            const cls = s.enabled ? 'mcp-summary-tag mcp-summary-tag-on' : 'mcp-summary-tag mcp-summary-tag-off';
            return `<span class="${cls}" title="${escapeHtml(s.name)}">${escapeHtml(s.name)} <small>(${s.activeSlots}/${s.totalSlots})</small></span>`;
        }).join(' ');

    el.innerHTML = `
        <div class="mcp-summary-row">
            <span class="mcp-summary-label"><i class="fa-solid fa-user"></i> 캐릭터:</span>
            <span class="mcp-summary-tags">${charSetsHtml}</span>
        </div>
        <div class="mcp-summary-row">
            <span class="mcp-summary-label"><i class="fa-solid fa-message"></i> 채팅방:</span>
            <span class="mcp-summary-tags">${chatSetsHtml}</span>
        </div>
        <div class="mcp-summary-total">
            합계: 활성 슬롯 <b>${summary.totalActiveSlots}</b>개
        </div>
    `;
}

// ===== 팝업 - 대상 표시 =====

function updateCurrentTargetLabel() {
    const targetKey = getCurrentTargetKey();
    const labelEl = document.getElementById('mcp-current-target-label');
    if (!labelEl) return;
    if (!targetKey) {
        labelEl.innerHTML = uiState.currentScope === 'character'
            ? '⚠️ 캐릭터를 선택해주세요'
            : '⚠️ 채팅방을 선택해주세요';
        return;
    }
    labelEl.textContent = `대상: ${targetKey}`;
}

// ===== 세트 드롭다운 =====

function refreshSetSelect() {
    const select = document.getElementById('mcp-set-select');
    if (!select) return;
    const targetKey = getCurrentTargetKey();
    const sets = targetKey ? getAllSets(uiState.currentScope, targetKey) : [];

    select.innerHTML = '';
    if (sets.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(세트 없음)';
        select.appendChild(opt);
        select.disabled = true;
        uiState.currentSetId = null;
        rememberSelection();
    } else {
        select.disabled = false;
        for (const s of sets) {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name + (s.enabled ? '' : ' (비활성)');
            select.appendChild(opt);
        }
        if (!uiState.currentSetId || !sets.some(s => s.id === uiState.currentSetId)) {
            uiState.currentSetId = sets[0].id;
            rememberSelection();
        }
        select.value = uiState.currentSetId;
    }
}

function refreshSetMeta() {
    const targetKey = getCurrentTargetKey();
    const enabledChk = document.getElementById('mcp-set-enabled');
    const tokenInfo = document.getElementById('mcp-set-token-info');
    const settings = getSettings();

    if (!targetKey || !uiState.currentSetId) {
        if (enabledChk) {
            enabledChk.checked = false;
            enabledChk.disabled = true;
        }
        if (tokenInfo) tokenInfo.textContent = '';
        return;
    }

    const sets = getAllSets(uiState.currentScope, targetKey);
    const set = sets.find(s => s.id === uiState.currentSetId);
    if (!set) {
        if (enabledChk) {
            enabledChk.checked = false;
            enabledChk.disabled = true;
        }
        if (tokenInfo) tokenInfo.textContent = '';
        return;
    }

    if (enabledChk) {
        enabledChk.checked = !!set.enabled;
        enabledChk.disabled = false;
    }
    if (tokenInfo && settings.ui?.showTokenCount) {
        const totalTokens = (set.slots || [])
            .filter(s => s.enabled)
            .reduce((sum, s) => sum + estimateTokens(substituteMacros(s.content || '')), 0);
        tokenInfo.textContent = `활성 슬롯 합계: ~${totalTokens} 토큰`;
    } else if (tokenInfo) {
        tokenInfo.textContent = '';
    }
}

// ===== 슬롯 카드 =====

function renderSlotCard(slot) {
    const settings = getSettings();
    const tokenCount = settings.ui?.showTokenCount
        ? estimateTokens(substituteMacros(slot.content || ''))
        : null;
    const isInChat = slot.position === 'in_chat';
    const cardCls = slot.enabled ? 'mcp-slot-card' : 'mcp-slot-card mcp-slot-disabled';

    return `
<div class="${cardCls}" data-slot-id="${escapeHtml(slot.id)}">
    <div class="mcp-slot-header">
        <div class="mcp-slot-handle" title="드래그하여 순서 변경">
            <i class="fa-solid fa-grip-vertical"></i>
        </div>
        <label class="checkbox_label mcp-slot-toggle" title="이 슬롯 활성/비활성">
            <input type="checkbox" class="mcp-slot-enabled" ${slot.enabled ? 'checked' : ''}>
        </label>
        <input type="text" class="text_pole mcp-slot-label" value="${escapeHtml(slot.label || '')}" placeholder="슬롯 이름">
        <button type="button" class="menu_button mcp-icon-btn mcp-slot-delete" title="슬롯 삭제">
            <i class="fa-solid fa-trash"></i>
        </button>
    </div>
    <div class="mcp-slot-body">
        <div class="mcp-slot-options">
            <div class="mcp-slot-radio-group">
                <label class="mcp-slot-radio">
                    <input type="radio" name="mcp-pos-${escapeHtml(slot.id)}" class="mcp-slot-position" value="before_main" ${slot.position === 'before_main' ? 'checked' : ''}>
                    <span>${escapeHtml(POSITION_LABELS.before_main)}</span>
                </label>
                <label class="mcp-slot-radio">
                    <input type="radio" name="mcp-pos-${escapeHtml(slot.id)}" class="mcp-slot-position" value="after_main" ${slot.position === 'after_main' ? 'checked' : ''}>
                    <span>${escapeHtml(POSITION_LABELS.after_main)}</span>
                </label>
                <label class="mcp-slot-radio">
                    <input type="radio" name="mcp-pos-${escapeHtml(slot.id)}" class="mcp-slot-position" value="in_chat" ${slot.position === 'in_chat' ? 'checked' : ''}>
                    <span title="주의: 같은 depth라도 작가노트보다 더 마지막 위치에 들어갑니다 (작가노트는 SillyTavern 내부 큐에서 합쳐진 후, 미니프롬은 그 직후 splice됩니다)">${escapeHtml(POSITION_LABELS.in_chat)}</span>
                    <input type="number" class="text_pole mcp-slot-depth" min="0" max="100" value="${escapeHtml(String(slot.depth || 0))}" ${isInChat ? '' : 'disabled'}>
                    <span class="mcp-slot-as-label">as</span>
                    <select class="text_pole mcp-slot-role">
                        <option value="system" ${slot.role === 'system' ? 'selected' : ''}>System</option>
                        <option value="user" ${slot.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="assistant" ${slot.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                    </select>
                </label>
            </div>
        </div>
        <textarea class="text_pole mcp-slot-content" rows="4" placeholder="여기에 주입할 프롬프트를 입력하세요. {{char}}, {{user}} 등 매크로 사용 가능">${escapeHtml(slot.content || '')}</textarea>
        <div class="mcp-slot-footer">
            <span class="mcp-slot-token-info">${tokenCount !== null ? `~${tokenCount} 토큰` : ''}</span>
        </div>
    </div>
</div>`;
}

function refreshSlotList() {
    const listEl = document.getElementById('mcp-slot-list');
    if (!listEl) return;

    const targetKey = getCurrentTargetKey();
    if (!targetKey || !uiState.currentSetId) {
        listEl.innerHTML = '<div class="mcp-empty-msg">대상이 선택되지 않았거나 세트가 없습니다.</div>';
        destroySortable();
        return;
    }

    const sets = getAllSets(uiState.currentScope, targetKey);
    const set = sets.find(s => s.id === uiState.currentSetId);
    if (!set || !Array.isArray(set.slots) || set.slots.length === 0) {
        listEl.innerHTML = '<div class="mcp-empty-msg">슬롯이 없습니다. "슬롯 추가" 버튼을 눌러 시작하세요.</div>';
        destroySortable();
        return;
    }

    listEl.innerHTML = set.slots.map(renderSlotCard).join('');
    bindSlotCardEvents();
    setupSortable(listEl);
}

function bindSlotCardEvents() {
    const listEl = document.getElementById('mcp-slot-list');
    if (!listEl) return;

    listEl.querySelectorAll('.mcp-slot-card').forEach(card => {
        const slotId = card.getAttribute('data-slot-id');
        if (!slotId) return;

        const enabledInput = card.querySelector('.mcp-slot-enabled');
        if (enabledInput) {
            enabledInput.addEventListener('change', () => {
                handleSlotUpdate(slotId, { enabled: enabledInput.checked });
                card.classList.toggle('mcp-slot-disabled', !enabledInput.checked);
                refreshSetMeta();
                renderActiveSummary();
            });
        }

        const labelInput = card.querySelector('.mcp-slot-label');
        if (labelInput) {
            labelInput.addEventListener('change', () => {
                handleSlotUpdate(slotId, { label: labelInput.value });
            });
        }

        const roleSelect = card.querySelector('.mcp-slot-role');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => {
                handleSlotUpdate(slotId, { role: roleSelect.value });
            });
        }

        // 위치 라디오
        const posRadios = card.querySelectorAll('.mcp-slot-position');
        const depthInput = card.querySelector('.mcp-slot-depth');
        posRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                const newPos = radio.value;
                handleSlotUpdate(slotId, { position: newPos });
                if (depthInput) depthInput.disabled = (newPos !== 'in_chat');
            });
        });

        if (depthInput) {
            depthInput.addEventListener('change', () => {
                const v = Math.max(0, parseInt(depthInput.value, 10) || 0);
                handleSlotUpdate(slotId, { depth: v });
            });
        }

        const contentArea = card.querySelector('.mcp-slot-content');
        const tokenInfo = card.querySelector('.mcp-slot-token-info');
        if (contentArea) {
            contentArea.addEventListener('input', () => {
                if (tokenInfo) {
                    const settings = getSettings();
                    if (settings.ui?.showTokenCount) {
                        const t = estimateTokens(substituteMacros(contentArea.value || ''));
                        tokenInfo.textContent = `~${t} 토큰`;
                    }
                }
            });
            contentArea.addEventListener('change', () => {
                handleSlotUpdate(slotId, { content: contentArea.value });
                refreshSetMeta();
            });
        }

        const deleteBtn = card.querySelector('.mcp-slot-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleSlotDelete(slotId));
        }
    });
}

function handleSlotUpdate(slotId, updates) {
    const targetKey = getCurrentTargetKey();
    if (!targetKey || !uiState.currentSetId) return;
    updateSlot(uiState.currentScope, targetKey, uiState.currentSetId, slotId, updates);
}

async function handleSlotDelete(slotId) {
    const targetKey = getCurrentTargetKey();
    if (!targetKey || !uiState.currentSetId) return;

    const settings = getSettings();
    if (settings.ui?.confirmBeforeDelete) {
        const ok = await confirmDialog('이 슬롯을 삭제하시겠습니까?');
        if (!ok) return;
    }
    deleteSlot(uiState.currentScope, targetKey, uiState.currentSetId, slotId);
    refreshSlotList();
    refreshSetMeta();
    renderActiveSummary();
    toast('슬롯이 삭제되었습니다', 'success');
}

// ===== Sortable (jQuery UI) =====

function setupSortable(listEl) {
    destroySortable();
    if (typeof $ === 'undefined' || typeof $.fn?.sortable !== 'function') {
        console.warn(`${LOG_PREFIX_DEV} jQuery UI sortable 미존재 - 드래그앤드롭 비활성`);
        return;
    }
    try {
        const $list = $(listEl);
        $list.sortable({
            handle: '.mcp-slot-handle',
            axis: 'y',
            tolerance: 'pointer',
            placeholder: 'mcp-sortable-placeholder',
            helper: 'clone',
            forcePlaceholderSize: true,
            cursor: 'grabbing',
            opacity: 0.7,
            update: function (event, ui) {
                try {
                    const cards = listEl.querySelectorAll('.mcp-slot-card');
                    const newOrder = Array.from(cards).map(c => c.getAttribute('data-slot-id')).filter(Boolean);
                    const targetKey = getCurrentTargetKey();
                    if (targetKey && uiState.currentSetId) {
                        reorderSlots(uiState.currentScope, targetKey, uiState.currentSetId, newOrder);
                    }
                } catch (e) {
                    console.error(`${LOG_PREFIX_DEV} sortable update 오류:`, e);
                }
            },
        });
        _sortableInstance = $list;
    } catch (e) {
        console.warn(`${LOG_PREFIX_DEV} jQuery UI sortable 초기화 실패:`, e);
    }
}

function destroySortable() {
    if (_sortableInstance) {
        try {
            // jQuery 객체인지 확인 후 destroy
            if (_sortableInstance.sortable && typeof _sortableInstance.sortable === 'function') {
                _sortableInstance.sortable('destroy');
            }
        } catch (e) { /* ignore */ }
        _sortableInstance = null;
    }
}

// ===== 팝업 전체 갱신 =====

function refreshPopup() {
    renderActiveSummary();
    updateCurrentTargetLabel();
    refreshSetSelect();
    refreshSetMeta();
    refreshSlotList();
}

// ===== 팝업 컨트롤 바인딩 =====

function bindPopupControls() {
    // 탭 전환
    document.querySelectorAll('.mcp-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // 현재 선택 캐시 (이전 탭의 세트 ID 보존)
            rememberSelection();

            document.querySelectorAll('.mcp-tab-btn').forEach(b => b.classList.remove('mcp-tab-active'));
            btn.classList.add('mcp-tab-active');
            uiState.currentScope = btn.getAttribute('data-scope') || 'character';

            // 새 탭의 캐시된 세트 ID 복원
            const cached = lastSelectionCache.get(getContextKey());
            if (cached) {
                uiState.currentSetId = uiState.currentScope === 'character'
                    ? cached.characterSetId
                    : cached.chatSetId;
            } else {
                uiState.currentSetId = null;
            }

            updateCurrentTargetLabel();
            refreshSetSelect();
            refreshSetMeta();
            refreshSlotList();
        });
    });

    // 세트 선택
    const setSelect = document.getElementById('mcp-set-select');
    if (setSelect) {
        setSelect.addEventListener('change', () => {
            uiState.currentSetId = setSelect.value || null;
            rememberSelection();  // 캐시에 저장
            refreshSetMeta();
            refreshSlotList();
        });
    }

    // 세트 활성 토글
    const setEnabled = document.getElementById('mcp-set-enabled');
    if (setEnabled) {
        setEnabled.addEventListener('change', () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey || !uiState.currentSetId) return;
            updateSet(uiState.currentScope, targetKey, uiState.currentSetId, { enabled: setEnabled.checked });
            refreshSetSelect();
            const select = document.getElementById('mcp-set-select');
            if (select) select.value = uiState.currentSetId;
            renderActiveSummary();
        });
    }

    // 세트 추가
    const setAdd = document.getElementById('mcp-set-add');
    if (setAdd) {
        setAdd.addEventListener('click', async () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey) {
                toast('대상이 선택되지 않았습니다', 'warning');
                return;
            }
            const name = await inputDialog('새 세트 이름:', '새 세트');
            if (!name || !name.trim()) return;
            const newSet = addSet(uiState.currentScope, targetKey, name.trim());
            if (newSet) {
                uiState.currentSetId = newSet.id;
                refreshPopup();
                toast('세트가 추가되었습니다', 'success');
            }
        });
    }

    // 세트 이름 변경
    const setRename = document.getElementById('mcp-set-rename');
    if (setRename) {
        setRename.addEventListener('click', async () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey || !uiState.currentSetId) return;
            const sets = getAllSets(uiState.currentScope, targetKey);
            const set = sets.find(s => s.id === uiState.currentSetId);
            if (!set) return;
            const newName = await inputDialog('새 이름:', set.name);
            if (!newName || !newName.trim()) return;
            updateSet(uiState.currentScope, targetKey, uiState.currentSetId, { name: newName.trim() });
            refreshSetSelect();
            const select = document.getElementById('mcp-set-select');
            if (select) select.value = uiState.currentSetId;
            renderActiveSummary();
        });
    }

    // 세트 삭제
    const setDelete = document.getElementById('mcp-set-delete');
    if (setDelete) {
        setDelete.addEventListener('click', async () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey || !uiState.currentSetId) return;
            const settings = getSettings();
            if (settings.ui?.confirmBeforeDelete) {
                const ok = await confirmDialog('이 세트를 삭제하시겠습니까? 슬롯도 모두 삭제됩니다.');
                if (!ok) return;
            }
            deleteSet(uiState.currentScope, targetKey, uiState.currentSetId);
            uiState.currentSetId = null;
            refreshPopup();
            toast('세트가 삭제되었습니다', 'success');
        });
    }

    // 슬롯 추가
    const slotAdd = document.getElementById('mcp-slot-add');
    if (slotAdd) {
        slotAdd.addEventListener('click', () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey) {
                toast('대상이 선택되지 않았습니다', 'warning');
                return;
            }
            if (!uiState.currentSetId) {
                toast('먼저 세트를 추가/선택해주세요', 'warning');
                return;
            }
            const newSlot = createEmptySlot('새 슬롯');
            addSlot(uiState.currentScope, targetKey, uiState.currentSetId, newSlot);
            refreshSlotList();
            refreshSetMeta();
            renderActiveSummary();
        });
    }

    // 전체 토글
    const slotsToggleAll = document.getElementById('mcp-slots-toggle-all');
    if (slotsToggleAll) {
        slotsToggleAll.addEventListener('click', () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey || !uiState.currentSetId) return;
            const sets = getAllSets(uiState.currentScope, targetKey);
            const set = sets.find(s => s.id === uiState.currentSetId);
            if (!set || !Array.isArray(set.slots) || set.slots.length === 0) return;
            const allOn = set.slots.every(s => s.enabled);
            for (const s of set.slots) {
                updateSlot(uiState.currentScope, targetKey, uiState.currentSetId, s.id, { enabled: !allOn });
            }
            refreshSlotList();
            refreshSetMeta();
            renderActiveSummary();
        });
    }

    // Export
    const exportBtn = document.getElementById('mcp-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const targetKey = getCurrentTargetKey();
            if (!targetKey || !uiState.currentSetId) {
                toast('내보낼 세트가 없습니다', 'warning');
                return;
            }
            const sets = getAllSets(uiState.currentScope, targetKey);
            const set = sets.find(s => s.id === uiState.currentSetId);
            if (!set) return;
            const json = exportSet(uiState.currentScope, targetKey, uiState.currentSetId);
            if (!json) {
                toast('내보내기 실패', 'error');
                return;
            }
            const filename = makeExportFilename(set.name);
            const ok = downloadAsFile(filename, json);
            if (ok) toast(`내보내기 완료: ${filename}`, 'success');
            else toast('파일 다운로드 실패', 'error');
        });
    }

    // Import
    const importBtn = document.getElementById('mcp-import-btn');
    const fileInput = document.getElementById('mcp-import-file-input');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', () => {
            fileInput.value = '';
            fileInput.click();
        });
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await handleImportFile(file);
        });
    }

    // 프리뷰
    const previewBtn = document.getElementById('mcp-preview-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => showPreviewDialog());
    }
}

// ===== Import 파일 처리 =====

async function handleImportFile(file) {
    try {
        const text = await file.text();
        const result = parseImportJson(text);
        if (!result.valid) {
            toast(`불러오기 실패: ${result.error}`, 'error');
            return;
        }

        const targetKey = getCurrentTargetKey();
        if (!targetKey) {
            toast('적용할 대상이 없습니다 (캐릭터/채팅방 선택 필요)', 'warning');
            return;
        }

        const conflict = checkImportConflict(result.data, uiState.currentScope, targetKey);
        let conflictMode = 'rename';
        if (conflict.hasConflict) {
            const choice = await showConflictDialog(conflict);
            if (choice === null) return;
            conflictMode = choice;
        }

        const importResult = importSet(result.data, uiState.currentScope, targetKey, conflictMode);
        if (importResult.success) {
            uiState.currentSetId = importResult.set.id;
            refreshPopup();
            toast(`불러오기 완료: ${importResult.set.name}`, 'success');
        } else {
            toast(`불러오기 실패: ${importResult.error}`, 'error');
        }
    } catch (e) {
        console.error(`${LOG_PREFIX_DEV} Import 오류:`, e);
        toast(`불러오기 실패: ${e.message}`, 'error');
    }
}

async function showConflictDialog(conflict) {
    const html = `
<div>
    <p>이미 같은 이름의 세트가 있습니다:</p>
    <p><b>${escapeHtml(conflict.importSetName)}</b></p>
    <p>어떻게 처리할까요?</p>
    <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
        <button type="button" class="menu_button" data-mcp-choice="rename">이름 변경 후 추가 (권장)</button>
        <button type="button" class="menu_button" data-mcp-choice="overwrite">기존 세트 덮어쓰기</button>
        <button type="button" class="menu_button" data-mcp-choice="append">같은 이름으로 추가</button>
    </div>
</div>`;

    return new Promise((resolve) => {
        try {
            const ctx = getContext();
            if (ctx?.Popup) {
                const popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, '', {
                    okButton: '취소',
                    wide: false,
                });
                popup.show();

                setTimeout(() => {
                    document.querySelectorAll('[data-mcp-choice]').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const choice = btn.getAttribute('data-mcp-choice');
                            try { popup.complete(0); } catch (e) { /* ignore */ }
                            resolve(choice);
                        });
                    });
                }, 100);

                popup.completePromise?.then(() => resolve(null)).catch(() => resolve(null));
                return;
            }
        } catch (e) {
            console.warn(`${LOG_PREFIX_DEV} 충돌 다이얼로그 폴백:`, e);
        }

        const choice = window.prompt(
            `이미 같은 이름의 세트가 있습니다: ${conflict.importSetName}\n` +
            `1=이름 변경, 2=덮어쓰기, 3=같은 이름 추가, 그 외=취소`,
            '1'
        );
        if (choice === '1') resolve('rename');
        else if (choice === '2') resolve('overwrite');
        else if (choice === '3') resolve('append');
        else resolve(null);
    });
}

// ===== 프리뷰 =====

async function showPreviewDialog() {
    const messages = getPreviewMessages();
    if (messages.length === 0) {
        await textDialog('현재 활성화된 슬롯이 없습니다.');
        return;
    }

    // 총 토큰 + 슬롯별 토큰 계산
    let totalTokens = 0;
    const messagesWithTokens = messages.map(m => {
        const tokens = estimateTokens(m.content || '');
        totalTokens += tokens;
        return { ...m, _tokens: tokens };
    });

    const html = `
<div class="mcp-preview-content">
    <div class="mcp-preview-summary">
        <div>
            주입될 메시지: <b>${messages.length}</b>개 (캐릭터+채팅방 합산)
        </div>
        <div>
            총 토큰 수 (추정): <b>${totalTokens}</b>
        </div>
    </div>
    ${messagesWithTokens.map((m, i) => `
        <div class="mcp-preview-msg">
            <div class="mcp-preview-msg-header">
                <span><b>#${i+1}</b> [${escapeHtml(m.role)}] ${escapeHtml(m._label || '')}</span>
                <span>${escapeHtml(m._scope === 'character' ? '캐릭터' : '채팅')} / ${escapeHtml(m._setName || '')} / ${escapeHtml(m._position || '')}${m._position === 'in_chat' ? ` (depth:${m._depth})` : ''} · ~${m._tokens} 토큰</span>
            </div>
            <div class="mcp-preview-msg-content">${escapeHtml(m.content || '')}</div>
        </div>
    `).join('')}
</div>`;

    await textDialog(html, '주입 프리뷰');
}

// ===== 고아 데이터 정리 =====

async function showOrphanDialog() {
    const result = findOrphanedData();
    const totalOrphan = result.orphanedCharacters.length + result.orphanedChats.length;
    if (totalOrphan === 0) {
        await textDialog('고아 데이터가 없습니다. 모든 데이터가 유효한 캐릭터/채팅방에 연결되어 있습니다.');
        return;
    }

    const html = `
<div>
    <p>다음 데이터는 현재 존재하지 않는 캐릭터/채팅방에 속해 있습니다:</p>
    ${result.orphanedCharacters.length > 0 ? `
        <div style="margin-top: 10px;">
            <b>고아 캐릭터 데이터 (${result.orphanedCharacters.length}개):</b>
            <ul style="max-height: 150px; overflow-y: auto; margin: 4px 0;">
                ${result.orphanedCharacters.map(k => `<li>${escapeHtml(k)}</li>`).join('')}
            </ul>
        </div>
    ` : ''}
    ${result.orphanedChats.length > 0 ? `
        <div style="margin-top: 10px;">
            <b>고아 채팅 데이터 (${result.orphanedChats.length}개):</b>
            <ul style="max-height: 150px; overflow-y: auto; margin: 4px 0;">
                ${result.orphanedChats.map(k => `<li>${escapeHtml(k)}</li>`).join('')}
            </ul>
        </div>
    ` : ''}
    <p style="margin-top: 10px; color: #d97706;">⚠️ 삭제 전에 export로 백업하는 것을 권장합니다.</p>
</div>`;

    const ok = await confirmDialog(html, '고아 데이터 정리');
    if (!ok) return;

    const removed = removeOrphanedData(result.orphanedCharacters, result.orphanedChats);
    toast(`정리 완료: 캐릭터 ${removed.removedChars}개 / 채팅 ${removed.removedChats}개 삭제`, 'success');
}

/**
 * 전체 데이터 삭제 (두 단계 확인 + 키워드 입력 검증)
 */
async function showPurgeAllDialog() {
    const settings = getSettings();
    const charCount = Object.keys(settings.characters || {}).length;
    const chatCount = Object.keys(settings.chats || {}).length;

    if (charCount === 0 && chatCount === 0) {
        await textDialog('삭제할 데이터가 없습니다.');
        return;
    }

    // 1단계: 안내 + 첫 확인
    const firstHtml = `
<div>
    <p style="color:#dc2626; font-weight:bold; font-size:1.1em;">
        ⚠️ 모든 미니프롬 데이터를 삭제합니다
    </p>
    <ul style="margin: 8px 0; line-height: 1.6;">
        <li>캐릭터 데이터: <b>${charCount}개</b></li>
        <li>채팅방 데이터: <b>${chatCount}개</b></li>
    </ul>
    <p>이 작업은 <b>되돌릴 수 없습니다.</b></p>
    <p style="margin-top: 10px;">삭제 전에 필요한 세트는 반드시 <b>Export로 백업</b>해주세요.</p>
    <p style="margin-top: 10px;">계속 진행하시겠습니까?</p>
</div>`;

    const firstOk = await confirmDialog(firstHtml, '전체 데이터 삭제 - 1단계 확인');
    if (!firstOk) return;

    // 2단계: 키워드 입력
    const keyword = await inputDialog(
        '확인을 위해 정확히 "DELETE" 라고 입력해주세요 (대소문자 구분):',
        '',
        '전체 데이터 삭제 - 2단계 확인'
    );

    if (keyword === null) return;  // 취소

    if (keyword !== 'DELETE') {
        toast('"DELETE"가 정확히 입력되지 않아 취소되었습니다', 'warning');
        return;
    }

    // 실행
    try {
        const removed = purgeAllData();
        // UI 캐시도 비우기
        lastSelectionCache.clear();
        uiState.currentSetId = null;
        toast(`전체 데이터 삭제 완료: 캐릭터 ${removed.removedChars}개 / 채팅 ${removed.removedChats}개`, 'success');
        // 팝업이 열려있으면 갱신
        if (uiState.popupInstance) {
            refreshPopup();
        }
    } catch (e) {
        console.error(`${LOG_PREFIX_DEV} 전체 삭제 실패:`, e);
        toast(`삭제 실패: ${e.message}`, 'error');
    }
}

// ===== 팝업 열기 =====

/**
 * 슬롯 편집 팝업 열기
 */
export async function openSlotEditorPopup() {
    try {
        const ctx = getContext();
        if (!ctx?.Popup) {
            toast('SillyTavern Popup API를 찾을 수 없습니다', 'error');
            return;
        }

        // 마지막 선택 복원 (같은 채팅방이면 이전 탭/세트 그대로)
        recallSelection();

        // 팝업 생성
        const popup = new ctx.Popup(POPUP_HTML, ctx.POPUP_TYPE.TEXT, '', {
            okButton: '닫기',
            wide: true,
            large: true,
            allowVerticalScrolling: true,
        });
        uiState.popupInstance = popup;

        const popupPromise = popup.show();

        // DOM이 준비될 때까지 짧게 대기 후 바인딩 + 탭 활성화 일치
        setTimeout(() => {
            try {
                bindPopupControls();

                // 복원된 currentScope에 맞게 탭 active 클래스 동기화
                document.querySelectorAll('.mcp-tab-btn').forEach(b => {
                    const isActive = b.getAttribute('data-scope') === uiState.currentScope;
                    b.classList.toggle('mcp-tab-active', isActive);
                });

                refreshPopup();
            } catch (e) {
                console.error(`${LOG_PREFIX_DEV} 팝업 컨트롤 바인딩 실패:`, e);
            }
        }, 50);

        await popupPromise;

        // 팝업 닫힘 후 정리
        rememberSelection();  // 다음 오픈 위해 현재 선택 저장
        destroySortable();
        uiState.popupInstance = null;
    } catch (e) {
        const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
        console.error(`${LOG_PREFIX_DEV} 팝업 오픈 실패:`, msg, e);
        toast('팝업을 열 수 없습니다 (콘솔 확인)', 'error');
    }
}

// ===== 드로어 컨트롤 =====

function bindDrawerControls() {
    const settings = getSettings();

    // 마스터 스위치
    const master = document.getElementById('mcp-master-enabled');
    if (master) {
        master.checked = !!settings.enabled;
        master.addEventListener('change', () => {
            const s = getSettings();
            s.enabled = master.checked;
            save();
            toast(master.checked ? '확장 활성화' : '확장 비활성화', 'info');
        });
    }

    // 슬롯 편집 열기
    const openEditorBtn = document.getElementById('mcp-open-editor');
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', () => openSlotEditorPopup());
    }

    // 토큰 표시
    const showTokens = document.getElementById('mcp-show-tokens');
    if (showTokens) {
        showTokens.checked = settings.ui?.showTokenCount !== false;
        showTokens.addEventListener('change', () => {
            const s = getSettings();
            s.ui.showTokenCount = showTokens.checked;
            save();
            // 팝업이 열려있으면 갱신
            if (uiState.popupInstance) {
                refreshSlotList();
                refreshSetMeta();
            }
        });
    }

    // 삭제 확인
    const confirmDelete = document.getElementById('mcp-confirm-delete');
    if (confirmDelete) {
        confirmDelete.checked = settings.ui?.confirmBeforeDelete !== false;
        confirmDelete.addEventListener('change', () => {
            const s = getSettings();
            s.ui.confirmBeforeDelete = confirmDelete.checked;
            save();
        });
    }

    // 고아 데이터 정리
    const cleanupBtn = document.getElementById('mcp-cleanup-orphan');
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', () => showOrphanDialog());
    }

    // 전체 데이터 삭제
    const purgeBtn = document.getElementById('mcp-purge-all');
    if (purgeBtn) {
        purgeBtn.addEventListener('click', () => showPurgeAllDialog());
    }
}

// ===== 마법봉 메뉴 =====

const MAX_WAND_RETRIES = 15;
const WAND_RETRY_INTERVAL = 1000;

function addWandMenuButton(retryCount = 0) {
    if (document.getElementById('mcp-wand-menu-item')) return;

    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) {
        if (retryCount < MAX_WAND_RETRIES) {
            setTimeout(() => addWandMenuButton(retryCount + 1), WAND_RETRY_INTERVAL);
        } else {
            console.warn(`${LOG_PREFIX_DEV} extensionsMenu를 찾을 수 없어 마법봉 메뉴 등록 실패`);
        }
        return;
    }

    const menuItem = document.createElement('div');
    menuItem.id = 'mcp-wand-menu-item';
    menuItem.className = 'list-group-item flex-container flexGap5 interactable';
    menuItem.tabIndex = 0;
    menuItem.setAttribute('role', 'listitem');
    menuItem.innerHTML = `
        <div class="fa-solid fa-sliders extensionsMenuExtensionButton"></div>
        <span>Mini Prompt</span>
    `;
    menuItem.addEventListener('click', async () => {
        try { $('#extensionsMenu').hide(); } catch (e) { /* ignore */ }
        await openSlotEditorPopup();
    });
    extensionsMenu.appendChild(menuItem);
    console.log(`${LOG_PREFIX_DEV} 마법봉 메뉴 등록 완료`);
}

// ===== 메인 갱신 (외부 호출용) =====

/**
 * 채팅방 변경 등 외부 이벤트 시 호출
 */
export function onContextChanged() {
    // 팝업이 열려있으면 새 컨텍스트로 갱신
    if (uiState.popupInstance && document.getElementById('mcp-summary-content')) {
        try {
            // 컨텍스트가 바뀌었으니 캐시에서 새 선택 복원
            recallSelection();

            // 탭 active 클래스 동기화
            document.querySelectorAll('.mcp-tab-btn').forEach(b => {
                const isActive = b.getAttribute('data-scope') === uiState.currentScope;
                b.classList.toggle('mcp-tab-active', isActive);
            });

            refreshPopup();
        } catch (e) {
            console.error(`${LOG_PREFIX_DEV} 컨텍스트 변경 시 갱신 실패:`, e);
        }
    }
}

// 호환성: 기존 refreshUI 이름 유지
export const refreshUI = onContextChanged;

// ===== 초기화 =====

/**
 * UI 초기화 (확장 시작 시)
 */
export async function initUI() {
    try {
        const container = document.getElementById('extensions_settings');
        if (!container) {
            console.warn(`${LOG_PREFIX_DEV} #extensions_settings 컨테이너를 찾을 수 없음`);
            return;
        }

        // 드로어 HTML 삽입
        if (!document.getElementById('mcp-master-enabled')) {
            container.insertAdjacentHTML('beforeend', DRAWER_HTML);
            bindDrawerControls();
        }

        // 마법봉 메뉴 등록
        addWandMenuButton();

        console.log(`${LOG_PREFIX_DEV} UI 초기화 완료`);
    } catch (e) {
        const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
        console.error(`${LOG_PREFIX_DEV} UI 초기화 오류:`, msg, e);
    }
}
