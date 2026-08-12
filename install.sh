#!/bin/sh
set -eu

repo="Chillsbro/parterre"
install_dir="${PARTERRE_INSTALL_DIR:-$HOME/.local/share/parterre}"
bin_dir="${PARTERRE_BIN_DIR:-$HOME/.local/bin}"
version="${PARTERRE_VERSION:-latest}"

if [ "$version" = "latest" ]; then
  archive_url="https://github.com/$repo/releases/latest/download/parterre.tar.gz"
else
  archive_url="https://github.com/$repo/releases/download/$version/parterre.tar.gz"
fi
archive_url="${PARTERRE_ARCHIVE_URL:-$archive_url}"

temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM

if command -v bun >/dev/null 2>&1; then
  bun_executable=$(command -v bun)
  installed_bun=false
else
  printf '%s\n' "Installing Bun…"
  curl -fsSL https://bun.com/install -o "$temporary_dir/install-bun.sh"
  BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}" sh "$temporary_dir/install-bun.sh"
  bun_executable="${BUN_INSTALL:-$HOME/.bun}/bin/bun"
  installed_bun=true
fi

printf '%s\n' "Downloading Parterre $version…"
mkdir -p "$temporary_dir/parterre"
curl -fsSL "$archive_url" -o "$temporary_dir/parterre.tar.gz"
tar -xzf "$temporary_dir/parterre.tar.gz" -C "$temporary_dir/parterre"
printf '%s\n' "$bin_dir" > "$temporary_dir/parterre/.parterre-bin-dir"

"$bun_executable" install \
  --production \
  --omit peer \
  --frozen-lockfile \
  --cwd "$temporary_dir/parterre"

mkdir -p "$(dirname "$install_dir")" "$bin_dir"
if [ -e "$install_dir" ]; then
  mv "$install_dir" "$temporary_dir/previous-install"
fi
if ! mv "$temporary_dir/parterre" "$install_dir"; then
  if [ -e "$temporary_dir/previous-install" ]; then
    mv "$temporary_dir/previous-install" "$install_dir"
  fi
  exit 1
fi
if [ "$installed_bun" = true ] && [ ! -e "$bin_dir/bun" ] && [ ! -L "$bin_dir/bun" ]; then
  ln -sf "$bun_executable" "$bin_dir/bun"
fi
ln -sf "$install_dir/bin/parterre.js" "$bin_dir/parterre"

printf '\nParterre installed in %s.\n' "$install_dir"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) printf 'Add %s to PATH, then open a new shell.\n' "$bin_dir" ;;
esac
printf '%s\n' 'Next: parterre setup'
