# 배포

운영 배포는 **운영이 push한 커밋을 실제로 서빙하는 것을 확인했을 때** 끝난다.

## 흐름

1. `git push origin {{MAIN_BRANCH}}`
2. CI(`.github/workflows/deploy.yml`)가 테스트 → 배포 → 검증을 순서대로 한다.
3. 검증 단계는 `VERSION_URL`이 push한 커밋을 연속 3회 돌려줄 때까지 기다린다(최대 15분). 도달하지 못하면 실패한다.
4. 매시간 같은 검증을 다시 돌려, 운영이 `{{MAIN_BRANCH}}`의 최신 커밋에서 벗어나면 실패로 알린다.

## 운영이 커밋을 알려 주게 하기

빌드할 때 커밋 SHA를 응답에 넣는다. 예:

```bash
# 정적 사이트: 빌드 결과물에 version.json을 쓴다
echo "{\"sha\":\"$GITHUB_SHA\"}" > public/version.json
```

API 서버라면 `/version` 같은 경로에서 `{ "sha": "<commit>" }`를 돌려주거나, 응답 헤더(`X-Commit`)로 내보내고 `--header X-Commit`으로 읽는다.

## 로컬 배포가 막혀 있는 이유

- 로컬 배포는 CI 배포와 경합해 운영이 어떤 커밋을 서빙하는지 모르게 만든다.
- 에이전트가 테스트 없이 운영에 올리는 길을 없앤다.
- 운영 배포 토큰이 개발 PC와 에이전트 환경에 없으므로, 규칙을 잊어도 구조가 막는다.

## 비상시

CI를 쓸 수 없고 운영을 바로 고쳐야 할 때만:

```bash
ALLOW_LOCAL_DEPLOY=I_UNDERSTAND_THIS_BYPASSES_CI npm run deploy
node scripts/verify-deploy.mjs --url "$VERSION_URL" --sha "$(git rev-parse HEAD)"
```

그 뒤 `STATUS.md`에 이유와 검증 결과를 적고, CI 검증을 다시 돌린다.
