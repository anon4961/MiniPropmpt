/**
 * Mini Prompt - UI HTML 템플릿
 * 드로어(슬림)와 팝업(전체 편집)을 분리
 */

/**
 * 드로어 패널 - 글로벌 설정만 (슬림)
 */
export const DRAWER_HTML = `
<div class="mcp-container">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Mini Prompt</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">

            <!-- 마스터 스위치 -->
            <div class="mcp-section">
                <label class="checkbox_label">
                    <input type="checkbox" id="mcp-master-enabled">
                    <span>확장 전체 활성화</span>
                </label>
                <small class="mcp-hint">끄면 모든 슬롯 주입이 중지됩니다.</small>
            </div>

            <hr class="mcp-hr">

            <!-- 슬롯 편집 진입 -->
            <div class="mcp-section">
                <button type="button" class="menu_button mcp-primary-btn" id="mcp-open-editor">
                    <i class="fa-solid fa-sliders"></i>
                    <span>슬롯 편집 열기</span>
                </button>
                <small class="mcp-hint">현재 채팅방·캐릭터의 슬롯 세트를 편집합니다.</small>
            </div>

            <hr class="mcp-hr">

            <!-- 글로벌 설정 -->
            <div class="mcp-section">
                <div class="mcp-section-header">
                    <b>글로벌 설정</b>
                </div>
                <label class="checkbox_label">
                    <input type="checkbox" id="mcp-show-tokens">
                    <span>토큰 수 표시</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="mcp-confirm-delete">
                    <span>삭제 시 확인창 표시</span>
                </label>
            </div>

            <hr class="mcp-hr">

            <!-- 데이터 관리 -->
            <div class="mcp-section">
                <div class="mcp-section-header">
                    <b>데이터 관리</b>
                </div>
                <button type="button" class="menu_button mcp-small-btn" id="mcp-cleanup-orphan">
                    <i class="fa-solid fa-broom"></i>
                    <span>고아 데이터 정리</span>
                </button>
                <small class="mcp-hint">현재 존재하지 않는 캐릭터/채팅의 데이터를 검토합니다 (자동 삭제 안 함).</small>
                <button type="button" class="menu_button mcp-small-btn mcp-danger-btn" id="mcp-purge-all" style="margin-top:8px;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>전체 데이터 삭제</span>
                </button>
                <small class="mcp-hint">⚠️ 모든 캐릭터/채팅의 슬롯 세트를 삭제합니다. 두 단계 확인을 거칩니다.</small>
            </div>

        </div>
    </div>
</div>
`;

/**
 * 팝업 본체 - 슬롯 편집 메인 화면
 */
export const POPUP_HTML = `
<div class="mcp-popup-root">
    <h3 class="mcp-popup-title">
        <i class="fa-solid fa-sliders"></i>
        Mini Prompt - 슬롯 편집
    </h3>

    <!-- 활성 세트 요약 -->
    <div class="mcp-summary-box" id="mcp-summary-box">
        <div class="mcp-summary-header">
            <i class="fa-solid fa-list-check"></i>
            <b>현재 적용 중인 세트</b>
        </div>
        <div class="mcp-summary-content" id="mcp-summary-content">
            <!-- 동적 렌더링 -->
        </div>
    </div>

    <!-- 스코프 탭 -->
    <div class="mcp-tabs">
        <button type="button" class="menu_button mcp-tab-btn mcp-tab-active" data-scope="character">
            <i class="fa-solid fa-user"></i>
            <span>캐릭터별</span>
        </button>
        <button type="button" class="menu_button mcp-tab-btn" data-scope="chat">
            <i class="fa-solid fa-message"></i>
            <span>채팅방별</span>
        </button>
    </div>
    <div class="mcp-current-target">
        <span id="mcp-current-target-label"></span>
    </div>

    <!-- 세트 컨트롤 -->
    <div class="mcp-section">
        <div class="mcp-set-controls">
            <select id="mcp-set-select" class="text_pole flex1"></select>
            <button type="button" class="menu_button mcp-icon-btn" id="mcp-set-add" title="세트 추가">
                <i class="fa-solid fa-plus"></i>
            </button>
            <button type="button" class="menu_button mcp-icon-btn" id="mcp-set-rename" title="세트 이름 변경">
                <i class="fa-solid fa-pencil"></i>
            </button>
            <button type="button" class="menu_button mcp-icon-btn" id="mcp-set-delete" title="세트 삭제">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div class="mcp-set-meta">
            <label class="checkbox_label">
                <input type="checkbox" id="mcp-set-enabled">
                <span>이 세트 활성화</span>
            </label>
            <span id="mcp-set-token-info" class="mcp-token-info"></span>
        </div>
    </div>

    <hr class="mcp-hr">

    <!-- 슬롯 목록 -->
    <div class="mcp-section">
        <div class="mcp-section-header">
            <b>슬롯 목록</b>
            <div class="mcp-section-actions">
                <button type="button" class="menu_button mcp-small-btn" id="mcp-slot-add">
                    <i class="fa-solid fa-plus"></i>
                    <span>슬롯 추가</span>
                </button>
                <button type="button" class="menu_button mcp-small-btn" id="mcp-slots-toggle-all" title="전체 활성/비활성">
                    <i class="fa-solid fa-toggle-on"></i>
                    <span>전체 토글</span>
                </button>
            </div>
        </div>
        <div id="mcp-slot-list" class="mcp-slot-list">
            <div class="mcp-empty-msg">슬롯이 없습니다. "슬롯 추가" 버튼을 눌러 시작하세요.</div>
        </div>
    </div>

    <hr class="mcp-hr">

    <!-- Export / Import / Preview -->
    <div class="mcp-section">
        <div class="mcp-io-buttons">
            <button type="button" class="menu_button mcp-small-btn" id="mcp-export-btn">
                <i class="fa-solid fa-download"></i>
                <span>현재 세트 내보내기</span>
            </button>
            <button type="button" class="menu_button mcp-small-btn" id="mcp-import-btn">
                <i class="fa-solid fa-upload"></i>
                <span>파일 불러오기</span>
            </button>
            <button type="button" class="menu_button mcp-small-btn" id="mcp-preview-btn">
                <i class="fa-solid fa-eye"></i>
                <span>주입 프리뷰</span>
            </button>
            <input type="file" id="mcp-import-file-input" accept=".json" style="display:none;">
        </div>
        <small class="mcp-hint">
            내보내기: 현재 선택된 세트만 JSON 파일로 저장됩니다.<br>
            불러오기: 파일을 선택하면 현재 보고 있는 캐릭터/채팅에 추가됩니다.<br>
            프리뷰: 캐릭터+채팅 모든 활성 슬롯을 합친 최종 주입 결과를 확인합니다.
        </small>
    </div>
</div>
`;
