#!/bin/sh
# Adds AI eval results to eval-history.csv on the `eval-results` branch and
# pushes it (the branch is made the first time). The arguments go to
# scripts/record-eval.mjs: --result=FILE for a GitHub run, --site=URL for the
# site's own runs. Run by .github/workflows/eval-outlines.yml and
# eval-history.yml, which give it permission to push; that branch holds only
# the record, so this never touches main or deploys anything.
set -eu
here=$(pwd)
record=$(mktemp -d)
trap 'cd "$here"; git worktree remove --force "$record" 2>/dev/null || true' EXIT
git config --global user.name 'github-actions[bot]'
git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'
if git fetch --quiet --depth=1 origin eval-results 2>/dev/null; then
  git worktree add --quiet --detach "$record" FETCH_HEAD
else
  git worktree add --quiet --detach "$record"
  cd "$record"
  git checkout --quiet --orphan "eval-results-$$"
  git rm -rq --cached .
  find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cd "$here"
fi
node scripts/record-eval.mjs --csv="$record/eval-history.csv" "$@"
cd "$record"
git add eval-history.csv
if git diff --cached --quiet; then exit 0; fi
git commit --quiet -m "Record AI outline eval results"
git push --quiet origin HEAD:refs/heads/eval-results
