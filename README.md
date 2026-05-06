# Mini Prompt

SillyTavern 확장 — 글로벌 세트 풀 + 캐릭터/채팅방별 자유로운 적용 매핑. 미니 프리셋처럼 가볍게 한 채팅방 혹은 한 캐릭터에 특화된 프롬프트 묶음을 관리합니다.

## 사용 흐름

1. **확장 활성화**: 확장 드로어에서 "확장 전체 활성화" 체크
2. **Mini Prompt 열기**: 마법봉 메뉴 또는 드로어의 "Mini Prompt 열기" 버튼
3. **세트 만들기**: "세트 관리" 탭에서 세트 추가 → 슬롯 추가 (위치/깊이/역할 지정)
4. **적용**: "현재 채팅방에 적용" 탭에서 체크박스로 원하는 세트 켜기
5. **자동 주입**: 채팅 시 적용된 세트의 활성 슬롯이 자동 주입됨

## 핵심 컨셉: 세트 풀 + 적용 매핑

세트는 **글로벌 풀**에 저장됩니다 (캐릭터/채팅방에 묶이지 않음). 각 채팅방·캐릭터는 풀에서 어떤 세트를 적용할지 **체크박스로 선택**만 합니다.

이 구조의 장점:
- **한 세트를 여러 채팅방에서 재사용**: "일본어 출력" 같은 범용 세트를 한 번 만들면 어디서든 체크 한 번으로 적용
- **편집 한 번이면 모든 곳 반영**: 세트 내용을 수정하면 그 세트를 사용 중인 모든 채팅방·캐릭터에 즉시 반영
- **채팅방 삭제 안전**: 채팅방을 지워도 세트 자체는 풀에 그대로 남음 (다른 곳에서 계속 쓸 수 있음)

## 주요 기능

- **마법봉 메뉴 + 드로어** 양쪽에서 접근
- **현재 채팅방 자동 인식** — 팝업을 열면 현재 컨텍스트로 자동 세팅
- **활성 세트 요약** — 팝업 상단에 캐릭터+채팅방 적용 중인 모든 세트 한눈에 표시
- 슬롯별 **위치 지정**:
  - Before Main Prompt / Story String
  - After Main Prompt / Story String
  - In-chat @ Depth (깊이 + 역할 지정)
- 슬롯별 **역할(role)** 선택: System / User / Assistant
- 슬롯별 **활성/비활성** 토글, 마스터 스위치
- **드래그앤드롭** 슬롯 순서 변경 (jQuery UI sortable)
- **{{char}}, {{user}}** 등 SillyTavern 매크로 자동 치환 ([지원 매크로 전체 목록](https://docs.sillytavern.app/usage/core-concepts/macros/) — `{{char}}`, `{{user}}`, `{{persona}}`, `{{description}}`, `{{personality}}`, `{{scenario}}`, `{{lastMessage}}`, `{{input}}`, `{{time}}`, `{{date}}`, `{{random:a,b,c}}`, `{{pick:a,b,c}}`, `{{roll:1d6}}`, `{{getvar::name}}`, `{{setvar::name::val}}` 등)
- **토큰 카운트** 추정 표시 + 세트별 적용 개수 표시
- **통합 프리뷰** — 캐릭터+채팅방 합쳐진 최종 주입 결과 확인
- **Export / Import** (JSON, 미니 프리셋 스타일) + 자동 적용 옵션
- **Import 충돌 처리** UI (이름 변경/덮어쓰기/추가 선택)
- **고아 적용 매핑** 감지·정리 (세트는 안전 보존)
- **전체 데이터 삭제** (두 단계 확인 + "DELETE" 키워드 검증)

## 캐릭터+채팅방 동시 적용

한 채팅방에서 캐릭터에 적용된 세트(A)와 채팅방에 적용된 세트(B)가 모두 활성이면, **A의 슬롯들 + B의 슬롯들이 합쳐져서 주입**됩니다. 팝업 상단의 "현재 적용 중인 세트" 박스에 캐릭터/채팅방 양쪽이 표시되며, "주입 프리뷰" 버튼으로 합쳐진 최종 결과를 확인할 수 있습니다.

## 주입 위치 설명

| 위치 | 설명 |
|---|---|
| **Before Main Prompt / Story String** | 시스템 프롬프트보다 더 앞 (가장 약한 위치) |
| **After Main Prompt / Story String** | 시스템 프롬프트 직후 |
| **In-chat @ Depth** | 채팅 메시지 사이. depth=0이면 가장 마지막. role(System/User/Assistant) 지정 가능 |

> ⚠️ **작가노트와의 깊이 차이**: Mini Prompt는 `CHAT_COMPLETION_PROMPT_READY` 이벤트가 끝나고 `messages` 배열에 직접 splice합니다. 반면 작가노트는 SillyTavern 내부 익스텐션 프롬프트 큐에서 그 이전에 합쳐집니다. 따라서 **같은 depth 0이라도 Mini Prompt가 더 마지막 위치(=AI에 더 강한 영향)**에 들어갑니다. 작가노트와 둘 다 depth 0으로 설정하면 Mini Prompt가 더 뒤(더 강력)입니다. 의도된 동작이며, 작가노트보다 앞에 두려면 Mini Prompt의 depth를 1 이상으로 설정하세요.
> 또한, Prefill 혹은 Direction Manager 확장과 같이 가장 끝에 위치해야 하는 프롬프트가 있는 경우, 본 확장에 의한 개별 프롬프트 주입위치는 1 이상으로 하는 것을 권장합니다.

## 데이터 저장

`SillyTavern/data/<user>/settings.json` 안의 `extension_settings.MiniCustomPrompt` 키에 저장됩니다. SillyTavern이 자동으로 백업·복원해주는 표준 위치입니다.

데이터 구조 (v2):
```
{
  sets: { setId: { name, slots, ... } },          // 글로벌 세트 풀
  bindings: {
    characters: { "Char.png": ["setId1"] },       // 캐릭터별 적용 매핑
    chats: { "Char.png__chatfile": ["setId2"] }   // 채팅방별 적용 매핑
  }
}
```

## Export 파일 포맷

미니 프리셋 스타일 JSON.

```json
{
  "type": "MiniCustomPrompt",
  "version": 2,
  "name": "세트 이름",
  "prompts": [
    {
      "name": "슬롯 이름",
      "enabled": true,
      "content": "...",
      "role": "system",
      "injection_position": 1,
      "injection_depth": 0,
      "injection_order": 100,
      "position_raw": "in_chat"
    }
  ]
}
```

`type: "MiniCustomPrompt"` 필드로 검증되므로 다른 JSON과 잘못 섞이지 않습니다. Import 시 세트 풀에 추가되며, 옵션으로 현재 채팅방·캐릭터에 즉시 적용할 수 있습니다.

## 제한사항

- **OpenAI 호환 API(Chat Completion)** 에서만 동작. NovelAI Classic, Kobold 등 Text Completion은 미지원
- 캐릭터 카드를 다시 import 하면 새 avatar로 인식되어 적용 매핑이 끊김 (세트는 안전, 다시 체크박스로 적용하면 됨)
- 채팅방 rename 자동 마이그레이션은 SillyTavern UI 셀렉터에 의존 (실패해도 데이터 유실은 없음 — 적용 매핑이 끊겨 다시 체크해야 할 수 있음)
- 다른 확장과 같은 이벤트(`CHAT_COMPLETION_PROMPT_READY`)를 후킹하면 등록 순서에 따라 미세 위치 차이 가능
