#!/usr/bin/env bash
# WSL/Ubuntu에서 한 줄로 Demo Mode를 띄운다.
# 사용:  bash scripts/start-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.local/bin:$HOME/.nvm/current/bin:/usr/local/bin:$PATH"

step() {
  printf '\n==> %s\n' "$1"
}

die() {
  printf '\n[오류] %s\n' "$1" >&2
  exit 1
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    echo "Node $(node -v)"
    return
  fi
  die "Node.js가 없습니다. https://nodejs.org 에서 20 이상을 설치한 뒤 터미널을 다시 여세요."
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm $(pnpm -v)"
    return
  fi

  step "pnpm 설치"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@10.33.3 --activate
  elif command -v npm >/dev/null 2>&1; then
    npm install -g pnpm
  else
    die "corepack/npm이 없어 pnpm을 설치할 수 없습니다. Node.js를 다시 설치해 주세요."
  fi

  hash -r || true
  command -v pnpm >/dev/null 2>&1 || die "pnpm 설치 후에도 PATH에서 찾지 못했습니다. 터미널을 닫았다가 다시 연 뒤 이 스크립트를 재실행하세요."
  echo "pnpm $(pnpm -v)"
}

ensure_env() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo ".env 를 만들었습니다."
  fi
  mkdir -p apps/web
  if [[ ! -f apps/web/.env.local ]]; then
    cp .env.example apps/web/.env.local
    echo "apps/web/.env.local 을 만들었습니다."
  fi
}

postgres_ready() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1
    return
  fi
  (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1
}

ensure_postgres() {
  if postgres_ready; then
    echo "PostgreSQL이 127.0.0.1:5432 에서 응답합니다."
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    step "Docker로 PostgreSQL 시작"
    if docker compose version >/dev/null 2>&1; then
      docker compose up -d postgres
    else
      docker-compose up -d postgres
    fi
    for _ in $(seq 1 40); do
      if postgres_ready; then
        echo "PostgreSQL이 준비됐습니다."
        return
      fi
      sleep 1
    done
  fi

  if command -v sudo >/dev/null 2>&1 && [[ -d /usr/lib/postgresql ]]; then
    step "시스템 PostgreSQL 시작"
    sudo service postgresql start || true
    if postgres_ready; then
      echo "시스템 PostgreSQL이 준비됐습니다."
      sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='shorts_os'" | grep -q 1 \
        || sudo -u postgres createdb shorts_os || true
      return
    fi
  fi

  die "PostgreSQL이 없습니다. Docker Desktop(WSL)을 켜거나 'sudo apt install postgresql postgresql-contrib' 후 다시 실행하세요."
}

step "저장소: $ROOT"
ensure_node
ensure_pnpm
ensure_env
ensure_postgres

step "의존성 설치"
pnpm install

step "마이그레이션과 Demo 시드"
pnpm db:migrate
pnpm db:seed

step "웹 서버 시작  http://127.0.0.1:43117/login"
echo "로그인 화면에서 'Demo 워크스페이스로 들어가기'를 누르세요."
echo "끄려면 Ctrl+C"
exec pnpm --filter @shorts-os/web dev
