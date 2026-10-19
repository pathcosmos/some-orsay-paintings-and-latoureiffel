#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOSITORY="${1:-pathcosmos/some-orsay-paintings-and-latoureiffel}"
DESCRIPTION='빛을 따라, 파리 — 오르세 회화 51점과 에펠탑 사진으로 만든 개인 감상 사이트'

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ "$REPOSITORY" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]] || fail '저장소 이름은 owner/name 형식이어야 합니다.'
for tool in git gh python3 curl; do
  command -v "$tool" >/dev/null || fail "$tool 명령이 필요합니다."
done

cd "$PROJECT_DIR"
python3 - <<'PY'
import json
from pathlib import Path
works = json.loads(Path('data/catalog.json').read_text())
assert len(works) == 52 and len({w['id'] for w in works}) == 52
paths = [Path(p) for p in (
    '.gitignore', '.nojekyll', 'README.md', 'index.html', 'favicon.svg',
    'styles.css', 'app.js', 'works.js', 'details.js',
    'data/catalog.json', 'data/photo-map.csv',
    'scripts/convert-photos.py', 'scripts/deploy-github-pages.sh')]
for work in works:
    ident = work['id']
    paths.append(Path(ident + '.heic'))
    for folder, ext in [('jpg', 'jpg'), ('lossless', 'png'), ('web', 'jpg'), ('thumbs', 'jpg')]:
        paths.append(Path(folder) / (ident + '.' + ext))
for path in paths:
    assert path.is_file(), f'파일 누락: {path}'
    assert path.stat().st_size < 100 * 1024 * 1024, f'GitHub 개별 파일 크기 초과: {path}'
total = sum(p.stat().st_size for p in paths)
assert total < 1024 ** 3, 'GitHub Pages 사이트 크기 제한 초과'
print(f'배포 파일 {len(paths)}개 확인: {total / 1024 ** 2:.1f} MiB')
PY

gh auth status -h github.com || fail 'GitHub 로그인 후 다시 실행하세요: gh auth login -h github.com'
LOGIN="$(gh api user --jq .login)"
USER_ID="$(gh api user --jq .id)"
[[ "${REPOSITORY%%/*}" == "$LOGIN" ]] || fail "현재 로그인 계정은 $LOGIN 입니다. 이 스크립트는 본인 소유 저장소에 배포합니다."

if [[ ! -e .git ]]; then
  git init -b main
fi
[[ "$(git rev-parse --show-toplevel)" == "$PROJECT_DIR" ]] || fail '프로젝트 폴더가 Git 저장소 최상위가 아닙니다.'
[[ "$(git branch --show-current)" == main ]] || fail 'main 브랜치에서 실행해 주세요. 현재 브랜치는 변경하지 않았습니다.'

ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
case "$ORIGIN" in
  ''|"https://github.com/$REPOSITORY"|"https://github.com/$REPOSITORY.git"|"git@github.com:$REPOSITORY"|"git@github.com:$REPOSITORY.git") ;;
  *) fail "다른 origin이 설정되어 있습니다: $ORIGIN" ;;
esac

git config user.name >/dev/null || git config --local user.name "$LOGIN"
git config user.email >/dev/null || git config --local user.email "${USER_ID}+${LOGIN}@users.noreply.github.com"
git add -- .gitignore .nojekyll README.md index.html favicon.svg styles.css app.js works.js details.js data scripts jpg lossless web thumbs IMG_*.heic
if ! git diff --cached --quiet; then
  git commit -m 'Publish Orsay and Eiffel photo collection'
fi

if VISIBILITY="$(gh repo view "$REPOSITORY" --json visibility --jq .visibility 2>/dev/null)"; then
  [[ "$VISIBILITY" == PUBLIC ]] || fail '같은 이름의 비공개 저장소가 있습니다. 기존 저장소의 공개 범위는 변경하지 않았습니다.'
else
  gh repo create "$REPOSITORY" --public --description "$DESCRIPTION"
fi

if [[ -z "$ORIGIN" ]]; then
  git remote add origin "https://github.com/$REPOSITORY.git"
fi
# Use the existing GitHub CLI login without changing global Git configuration.
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin main

if gh api "repos/$REPOSITORY/pages" >/dev/null 2>&1; then
  gh api --method PUT "repos/$REPOSITORY/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
else
  gh api --method POST "repos/$REPOSITORY/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
fi

SITE_URL="$(gh api "repos/$REPOSITORY/pages" --jq .html_url)"
EXPECTED_COMMIT="$(git rev-parse HEAD)"
printf '저장소: https://github.com/%s\n배포 대기: %s\n' "$REPOSITORY" "$SITE_URL"
for ((attempt=1; attempt<=60; attempt++)); do
  BUILD="$(gh api "repos/$REPOSITORY/pages/builds/latest" --jq '.status + " " + .commit' 2>/dev/null || true)"
  if [[ "$BUILD" == "built $EXPECTED_COMMIT" ]]; then
    if curl --fail --silent --show-error --location "$SITE_URL" --output /dev/null; then
      printf '\n배포 완료: %s\n' "$SITE_URL"
      exit 0
    fi
  elif [[ "$BUILD" == "errored $EXPECTED_COMMIT" ]]; then
    fail "GitHub Pages 빌드가 실패했습니다. 확인: https://github.com/$REPOSITORY/actions"
  fi
  sleep 10
done
fail "업로드와 Pages 설정은 완료했지만 배포 확인 시간이 초과되었습니다. 확인: $SITE_URL 또는 https://github.com/$REPOSITORY/actions"
