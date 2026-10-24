#!/usr/bin/env bash
# 核对：main 相对 upstream 改动过的「官方文件」，是否都登记在 UPSTREAM-PATCHES.md。
#
# 用法（仓库根目录，Git Bash）：tools/check-patches.sh
# 新增文件（eSIM 模块自己的目录）不算插入点，不检查；
# 只检查 upstream 里存在、main 里被修改(M)或删除(D)的文件。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
LIST="$ROOT/UPSTREAM-PATCHES.md"
cd "$ROOT"

changed="$(git diff --diff-filter=MD --name-only upstream main -- . ':!UPSTREAM-PATCHES.md' ':!tools/')"
missing=0

echo "== main 改动过的官方文件 =="
if [ -z "$changed" ]; then
  echo "(无)"
else
  while IFS= read -r file; do
    if grep -qF "\`$file\`" "$LIST"; then
      echo "  已登记  $file"
    else
      echo "  未登记  $file"
      missing=$((missing + 1))
    fi
  done <<< "$changed"
fi

echo
echo "== 代码里的 [esim-patch] 标记 =="
git grep -n "\[esim-patch\]" main -- . ':!UPSTREAM-PATCHES.md' ':!tools/' | sed 's/^main://' || echo "(无)"

echo
if [ "$missing" -gt 0 ]; then
  echo "有 $missing 个改动过的官方文件未登记，请补进 UPSTREAM-PATCHES.md。"
  exit 1
fi
echo "全部已登记。"
