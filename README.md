# Atlassian Copilot

Jira와 Confluence 업무를 대화로 조회하고 정리하는 다크 퍼스트 엔터프라이즈 코파일럿입니다. 브라우저는 항상 Broker API와만 통신하며, Jira/Confluence 조회와 LLM 호출은 Broker에서만 실행됩니다. 댓글 작성이나 변경 요청 같은 쓰기 작업은 실행 전에 반드시 작업 검토 단계를 거칩니다.

## 구현된 기능

- `/copilot`, `/history`, `/settings` 중심의 단순한 화면 구조
- ChatGPT 스타일에 가까운 채팅 중심 UI, 선택형 상세 정보 패널, 내용 길이에 맞는 말풍선
- 첫 진입 시 켜지는 시연 모드와 실제 계정 없이 보여줄 수 있는 가상 Jira/Confluence 데이터
- Broker가 제공하는 추천 질문과 Enter 전송, Shift+Enter 줄바꿈 입력 흐름
- 도구 실행 결과를 필요한 경우에만 펼쳐 보는 간결한 조회 상태 UI
- 답변 안의 Jira 이슈와 Confluence 문서 링크 연결
- 개인 Atlassian 연결 설정 저장/테스트/초기화
- OpenAI, Claude, OpenRouter, Mock LLM 제공자 설정과 모델 선택
- Broker 전용 Jira/Confluence 읽기 어댑터와 LLM 스트리밍 요약 어댑터
- 쓰기 작업 승인/취소 흐름과 감사 로그 기반 Action Review
- TypeScript/Zod 기반 공유 계약, Broker SSE 이벤트, 프론트엔드 보안 스캔
- 다크 모드와 라이트 모드, Pretendard 폰트, 반응형 레이아웃

## 로컬 실행

```bash
npm install
npm run dev
```

`npm run dev`는 Broker와 Web 개발 서버를 함께 실행합니다. WSL/Windows 환경에서 같은 포트를 다른 프로세스가 점유해 잘못된 `404`가 보이는 문제를 피하기 위해 브라우저에서 접근 가능한 Web 포트를 자동으로 선택합니다.

서비스를 직접 실행하려면 다음 명령을 사용할 수 있습니다.

```bash
npm run dev:broker
VITE_BROKER_PROXY_TARGET=http://localhost:8787 npm run dev:web -- --host 0.0.0.0 --port 5173 --strictPort
```

`5173`이 이미 사용 중이면 WSL과 Windows 양쪽에서 비어 있는 포트를 고른 뒤 `/copilot`으로 접속하세요. 예시는 다음과 같습니다.

```bash
VITE_DEV_PORT=5180 VITE_BROKER_PROXY_TARGET=http://localhost:8787 npm run dev:web -- --host 0.0.0.0 --port 5180 --strictPort
```

웹 앱은 Broker API/SSE 계약만 호출합니다. 시연 모드에서는 가상 데이터만 사용하고, 개인 Atlassian 설정이 저장되어 있으면 “나에게 할당된 JIRA 이슈를 조회해줘.” 같은 질문은 Broker에서 읽기 전용 Jira 검색으로 처리됩니다.

## 개인 Atlassian 연결

`http://localhost:<web-port>/settings`에서 다음 값을 입력합니다.

- Atlassian 사이트 URL
- Atlassian 이메일
- API 토큰
- Jira 프로젝트 허용 목록
- Confluence 스페이스 허용 목록

브라우저는 이 값을 `POST /api/settings/atlassian`으로 Broker에만 전송합니다. Broker는 서버 측 로컬 상태 디렉터리에 저장하고, 토큰을 브라우저로 다시 반환하지 않습니다. 기본 저장 위치는 `~/.atlassian-copilot/broker`이며, 필요하면 `AKC_BROKER_STATE_DIR`로 위치를 바꿀 수 있습니다.

저장된 개인 연결은 `/settings`에서 연결 테스트를 통과하면 활성 상태로 표시됩니다. `DELETE /api/settings/atlassian`은 저장된 개인 Atlassian 연결을 삭제합니다.

## 개인 LLM 연결

`/settings`에서 다음 제공자 중 하나를 선택할 수 있습니다.

- OpenAI / GPT
- Claude / Anthropic
- OpenRouter
- Mock fallback

API 키는 Broker로만 전송되며 브라우저 필드는 저장 후 비워집니다. ChatGPT Plus/Pro 또는 Claude Pro/Max 구독은 API 키가 아니므로, 각 제공자의 개발자 콘솔에서 별도 API 키를 발급해야 합니다. 연결 테스트는 실제 제공자 호출이 발생할 수 있어 사용자가 명시적으로 눌렀을 때만 실행됩니다.

LLM 설정 API는 다음 Broker 엔드포인트를 사용합니다.

```txt
POST   /api/settings/llm
POST   /api/settings/llm/test
DELETE /api/settings/llm
```

자세한 저장 방식, fallback, 비용 관련 주의사항은 `docs/LLM_PROVIDER_RUNBOOK.md`를 참고하세요.

## 품질 검증

```bash
npm run lint
npm run typecheck
npm run test
npm run security:scan
npm run build
```

빌드 후 연동 smoke check는 다음 명령으로 실행할 수 있습니다.

```bash
npm run smoke:mcp:jira-search
npm run smoke:mcp:jira-get-issue
npm run smoke:mcp:confluence-search
npm run smoke:mcp:confluence-get-page
npm run smoke:llm
```

실제 자격 증명이 없으면 smoke check는 안전하게 건너뜁니다.

## 보안 경계

- 브라우저는 OpenAI, Anthropic/Claude, OpenRouter, Jira, Confluence, MCP를 직접 호출하지 않습니다.
- `VITE_OPENAI_API_KEY`, `VITE_CHATGPT_API_KEY`, `VITE_ANTHROPIC_API_KEY`, `VITE_CLAUDE_API_KEY`, `VITE_OPENROUTER_API_KEY`, `VITE_ATLASSIAN_TOKEN` 같은 프론트엔드 비밀 환경 변수를 만들지 않습니다.
- 모든 제공자 키와 Atlassian 토큰은 Broker 전용입니다.
- P1 MCP 도구 범위는 읽기 전용입니다: `jira_search`, `jira_get_issue`, `confluence_search`, `confluence_get_page`.
- 쓰기 작업은 Action Review를 통과해야 하며, 파괴적 작업은 차단됩니다.
- 시연 모드는 가상 데이터만 사용합니다.

## 시연 질문 예시

```txt
나에게 할당된 JIRA 이슈를 조회해줘.
```

예상 흐름은 다음과 같습니다.

1. `/api/copilot/runs`로 실행을 생성합니다.
2. Broker SSE 스트림으로 조회 상태와 답변을 수신합니다.
3. 시연 모드에서는 가상 Jira 이슈와 Confluence 문서를 근거로 표시합니다.
4. 답변에는 표, 근거 링크, 필요한 다음 조치가 함께 표시됩니다.
5. 쓰기 작업이 필요하면 바로 실행하지 않고 작업 검토로 넘어갑니다.
