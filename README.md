# ai-agent-guardrails

**AI 코딩 에이전트에게 코드를 맡기고, 품질은 규칙과 배포 관문으로 지키는 프로젝트 템플릿.**

개발자가 없던 회사에서 혼자 Claude Code와 Codex로 원격 장비 관제 시스템(웹 + 현장 PC 프로그램 + iOS·Android 앱)을 만들어 15개 현장에서 운영하면서 쓴 규칙을, 회사 정보 없이 일반화했습니다. 그 시스템은 자동 테스트 600개 이상과 로컬 배포 사고 0건으로 두 앱 스토어 출시까지 갔습니다. ([사례 정리](https://jin-jeongmo-portfolio.vercel.app/works/flag-beam))

## 원칙

1. **끝 조건을 먼저 정한다.** 테스트 통과 + push한 SHA + 운영이 그 SHA를 서빙함 + 핵심 경로 응답. 넷 다 확인돼야 "완료".
2. **운영 배포는 CI에서만.** 배포 토큰을 CI에만 둬서, 규칙을 잊어도 구조가 막는다.
3. **보고와 관측을 나눈다.** "처리했다"는 보고는 "실제로 그렇게 됐다"가 아니다.
4. **기다리는 동안의 빈 값은 "없음"이 아니다.** 조회 중·확인 불가·없음을 분리한다.
5. **대화 기록은 근거가 아니다.** 저장소의 소스·검증 기록·STATUS만으로 이어갈 수 있어야 한다.
6. **비밀은 이름과 위치만 적는다.**

이유와 실제 사례는 [docs/principles.md](docs/principles.md), AI가 실제로 틀린 패턴은 [docs/ai-mistakes.md](docs/ai-mistakes.md)에 있습니다.

## 구성

```text
template/                        내 프로젝트에 복사할 파일
├── AGENTS.md                    에이전트와 사람이 같이 지키는 규칙
├── docs/
│   ├── DEPLOYMENT.md            배포 흐름과 비상 절차
│   └── continuity/
│       ├── START_HERE.md        다른 도구·PC에서 이어가기
│       └── STATUS.md            진행 기록 양식
├── .github/workflows/deploy.yml 테스트 → 배포 → 운영 커밋 확인, 매시간 드리프트 점검
└── scripts/
    ├── verify-deploy.mjs        운영이 push한 커밋을 연속 N회 서빙하는지 확인
    └── guard-local-deploy.mjs   CI 밖의 운영 배포를 막음
docs/                            원칙과 실제 사례
test/                            스크립트 테스트 (node:test)
```

스크립트는 Node 내장 모듈만 씁니다. 설치할 패키지가 없습니다.

## 빠른 시작

1. `template/`의 내용을 내 저장소 루트에 복사합니다.
2. `AGENTS.md`의 `{{PROJECT_NAME}}`, `{{MAIN_BRANCH}}`를 채웁니다.
3. 배포 스크립트 앞에 가드를 둡니다.
   ```json
   { "scripts": { "deploy": "node scripts/guard-local-deploy.mjs && <배포 명령>" } }
   ```
4. 운영이 자기 커밋을 알려 주게 합니다. 예: 빌드 때 `public/version.json`에 `{"sha":"<commit>"}`를 씁니다.
5. GitHub 저장소에 Secret `DEPLOY_TOKEN`과 Variable `VERSION_URL`을 넣습니다. 배포 토큰은 개발 PC에 두지 않습니다.

## verify-deploy

```bash
node scripts/verify-deploy.mjs --url https://example.com/version.json --sha "$(git rev-parse HEAD)"
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--key` | `sha` | 커밋이 들어 있는 JSON 필드. `build.commit`처럼 점으로 이어도 된다 |
| `--header` | | 본문 대신 응답 헤더에서 커밋을 읽는다 |
| `--consecutive` | `3` | 연속으로 맞아야 하는 횟수. 엣지 노드 하나가 우연히 맞는 경우를 거른다 |
| `--timeout` | `900` | 초. 넘으면 실패 |
| `--interval` | `15` | 초. 확인 간격 |
| `--route` | | 커밋 확인 뒤 2xx를 돌려줘야 하는 추가 URL (여러 번 쓸 수 있다) |

종료 코드: `0` 반영됨, `1` 반영 안 됨, `2` 잘못된 사용.

## 테스트

```bash
npm test
```

## English

A project template for shipping production software with AI coding agents (Claude Code, Codex) while keeping quality behind rules and deploy gates. It generalizes the rules I used to build and run a remote device-control system alone (web + on-site PC agent + iOS/Android apps, 15 live sites, 600+ automated tests, zero local-deploy incidents). It contains an `AGENTS.md` template, handoff docs, a CI-only deploy workflow, and two dependency-free Node scripts: `verify-deploy` (waits until production serves the pushed commit N times in a row) and `guard-local-deploy` (refuses production deploys outside CI). Docs are in Korean.

## License

[MIT](LICENSE) © 2026 Jin Jeongmo
