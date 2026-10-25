#!/usr/bin/env bash
# 核对：当前工作区（所在分支 + 未提交的改动）相对 upstream 改动过的「官方文件」，
# 是否都登记在 UPSTREAM-PATCHES.md。在功能分支上和合并进 main 之后都能用。
#
# 用法（仓库根目录，Git Bash）：tools/check-patches.sh
# 新增文件（eSIM 模块自己的目录）不算插入点，不检查；
# 只检查 upstream 里存在、工作区里被修改(M)或删除(D)的文件。
# 清单里的路径可以写全（`Storify-main-app/lib/...`），也可以写成相对
# `Storify-main-app/` 的形式（`lib/...`，如「P10 明细」表）。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
LIST="$ROOT/UPSTREAM-PATCHES.md"
APP="Storify-main-app/"
cd "$ROOT"

changed="$(git diff --diff-filter=MD --name-only upstream -- . ':!UPSTREAM-PATCHES.md' ':!tools/' ':!CLAUDE.md')"
missing=0

echo "== 改动过的官方文件（相对 upstream，含未提交改动） =="
if [ -z "$changed" ]; then
  echo "(无)"
else
  while IFS= read -r file; do
    short="${file#"$APP"}"
    if grep -qF "\`$file\`" "$LIST" || grep -qF "\`$short\`" "$LIST"; then
      marks="$(grep -c "\[esim-patch\]" "$file" 2>/dev/null || true)"
      echo "  已登记  $file（标记 ${marks:-0} 处）"
      if [ "${marks:-0}" -eq 0 ]; then
        echo "          ↑ 没有 [esim-patch] 标记"
        missing=$((missing + 1))
      fi
    else
      echo "  未登记  $file"
      missing=$((missing + 1))
    fi
  done <<< "$changed"
fi

echo
if [ "$missing" -gt 0 ]; then
  echo "有 $missing 个改动过的官方文件未登记或没有标记，请补进 UPSTREAM-PATCHES.md。"
  exit 1
fi
echo "全部已登记，且都有标记。"
