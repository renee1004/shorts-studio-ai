# NotebookLM 원문 가져오기

`/create` → **NotebookLM에서 가져오기** → 노트북 → 노트·대본 선택 → 미리보기 → **원문 그대로 저장**.

노트 텍스트와 완료된 보고서의 Markdown 내보내기를 읽습니다. NotebookLM의 화면 서식이나 첨부파일 복제는 아닙니다. 대본은 NotebookLM에서 노트 또는 보고서로 저장해 두어야 목록에 나옵니다. 채팅 답변, 미완성 보고서, 오디오, 마인드맵은 이 목록에 포함하지 않습니다.

원문 최대 500,000자, 제목 최대 2,000자입니다. 초과하면 오류를 표시하며 잘라서 저장하지 않습니다. 공백·줄바꿈·Markdown을 보존하고 같은 원문은 재사용하며 변경된 원문은 새 저장본으로 남깁니다. 저장 직전에 다시 읽어 미리보기와 다르면 재확인을 요구합니다. 저장본은 가져온 사용자에게만 보입니다. 제작용 대본 준비는 별도의 편집 사본을 열며 기존 제작 입력 제한이 적용됩니다.

## 최초 연결 (운영자)

Google의 소비자용 NotebookLM 공식 API가 아닌 [notebooklm-py](https://github.com/teng-lin/notebooklm-py) **0.8.2**를 사용합니다. Google 변경으로 연결이 중단될 수 있습니다. 연결 실패를 빈 자료나 성공으로 처리하지 않습니다. 가져오기는 읽기 작업만 수행하며 조사·대본·이미지 생성 API를 호출하지 않습니다.

1. 앱에서 `AUTH_PROVIDER=supabase` 이메일 로그인을 구성합니다. 누구나 동일 사용자로 들어올 수 있는 체험 계정에는 개인 Google 자료를 연결하지 않습니다.
2. 이메일로 로그인하고 가져오기 화면의 **노트북 불러오기**에서 표시되는 앱 사용자 UUID를 확인합니다.
3. 브라우저가 있는 신뢰할 수 있는 PC에서 저장소 루트 기준으로 아래를 실행합니다. `<사용자-UUID>`는 위 ID로 교체합니다. Python 3.10 이상이 필요합니다.

```bash
python3 -m venv .venv-notebooklm
.venv-notebooklm/bin/pip install 'notebooklm-py[browser]==0.8.2'
.venv-notebooklm/bin/playwright install chromium
mkdir -p .data/notebooklm/<사용자-UUID>
.venv-notebooklm/bin/notebooklm --storage .data/notebooklm/<사용자-UUID>/storage_state.json login
```

Windows에서는 `python3` 대신 `python`, `.venv-notebooklm/bin/` 대신 `.venv-notebooklm/Scripts/`를 사용합니다. Google 로그인은 사용자가 직접 완료합니다. 계정 쿠키를 채팅에 붙여 넣거나 Git에 커밋하지 않습니다.

4. 서버의 `.data/notebooklm/<사용자-UUID>/storage_state.json`에 그 사용자의 세션 파일을 배치합니다. Linux Docker에서는 컨테이너의 node 사용자 UID 1000만 해당 사용자 폴더와 파일을 읽고 쓸 수 있도록 소유권과 권한을 설정합니다. 라이브러리가 세션을 갱신하므로 쓰기 권한도 필요합니다. 다른 사용자와 세션 파일을 공유하지 않습니다.
5. `.env.docker`에 `NOTEBOOKLM_ENABLED=true`를 추가하고 `node scripts/start-docker.mjs`로 재빌드합니다. 기존 데이터베이스는 유지되고 새 원문 저장 테이블이 추가됩니다. 웹 서비스에만 세션 폴더가 마운트됩니다.
6. 앱에서 노트북을 불러와 노트 하나를 미리 보고 저장합니다. 로그인이 만료되면 같은 사용자 경로로 로그인 과정을 다시 진행합니다.

Docker 외 개발 실행은 웹 서버 환경에 `NOTEBOOKLM_PYTHON`(가상환경 Python 절대 경로), `NOTEBOOKLM_STORAGE_ROOT`(사용자 폴더들의 상위 절대 경로), `NOTEBOOKLM_BRIDGE_SCRIPT`(scripts/notebooklm_bridge.py 절대 경로), `NOTEBOOKLM_ENABLED=true`를 설정합니다. 자격증명 파일은 브라우저로 전달하지 않습니다.

## 검증

`python3 -m unittest discover -s scripts -p 'test_notebooklm_bridge.py'`는 읽기 전용 가짜 클라이언트로 목록/원문/CRLF/미완성 보고서 제외/임시 파일 삭제를 검증합니다. 서비스 통합 테스트는 PostgreSQL RLS, 동시 중복 저장, 불변 원문을 검증합니다. CI는 실제 Google 계정에 접근하지 않습니다. 실제 계정 연결과 가져오기는 위 마지막 단계에서 따로 확인해야 합니다.
