# 如果有tree命令
tree -L 6 -I "*.gif|*.jpg|*.jpeg|*.JPEG|*.svg|$(cat .gitignore 2>/dev/null | grep -v '^#' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')"
