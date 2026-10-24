#!/usr/bin/env bash
# 把官方新版源码导入 upstream 分支（不碰 main）。
#
# 用法（在仓库根目录，Git Bash 下运行）：
#   tools/import-upstream.sh <子项目目录名> <新版源码解压路径> <版本号>
# 例：
#   tools/import-upstream.sh Storify-main-app /c/Downloads/storify-3.2.0 3.2.0
#   tools/import-upstream.sh storify-customer-app  /c/Downloads/customer-app-1.1.0 customer-1.1.0
#
# 做的事：在临时 worktree 里检出 upstream，用新版源码整体替换该子项目目录
# （官方删掉的文件也会被删掉），提交并打标签 upstream/<版本号>。
# 之后由你手动执行 `git merge upstream` 合并进 main。
set -euo pipefail

if [ $# -ne 3 ]; then
  sed -n '2,14p' "$0"
  exit 1
fi

TARGET="$1"
SOURCE="$2"
VERSION="$3"
ROOT="$(git rev-parse --show-toplevel)"
TAG="upstream/$VERSION"
WT="$ROOT/../.upstream-import-$$"

case "$TARGET" in
  Storify-main-app|storify-customer-app|Storify-business-app|Documentation) ;;
  *) echo "未知子项目目录：$TARGET" >&2; exit 1 ;;
esac
[ -d "$SOURCE" ] || { echo "源码目录不存在：$SOURCE" >&2; exit 1; }
[ -f "$SOURCE/package.json" ] || [ "$TARGET" = "Documentation" ] || {
  echo "警告：$SOURCE 下没有 package.json，确认路径指向解压后的项目根目录" >&2; exit 1; }
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && {
  echo "标签 $TAG 已存在" >&2; exit 1; }

git worktree add "$WT" upstream
trap 'git -C "$ROOT" worktree remove --force "$WT"' EXIT

cd "$WT"
git rm -r -q --ignore-unmatch "$TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
# 不带入新版里的 node_modules / 构建产物 / 本地 env
tar -C "$SOURCE" \
  --exclude=node_modules --exclude=.next --exclude=.expo --exclude=dist \
  --exclude=.git --exclude=.env --exclude=.env.local \
  -cf - . | tar -C "$TARGET" -xf -
git add -A "$TARGET"

if git diff --cached --quiet; then
  echo "与 upstream 当前内容没有差异，未提交。"
  exit 0
fi

git diff --cached --stat | tail -3
git commit -q -m "Import official $TARGET $VERSION"
git tag "$TAG"
echo
echo "已提交到 upstream 并打标签 $TAG。"
echo "下一步（在 main 上）："
echo "  git merge upstream"
echo "  然后按 UPSTREAM-PATCHES.md 的「升级后检查」逐项核对。"
