#!/bin/sh
set -eu

repo="Chillsbro/parterre"
install_dir="${PARTERRE_INSTALL_DIR:-$HOME/.local/share/parterre}"
bin_dir="${PARTERRE_BIN_DIR:-$HOME/.local/bin}"
version="${PARTERRE_VERSION:-latest}"
disk_reserve_kib=65536

if [ "$version" = "latest" ]; then
  archive_url="https://github.com/$repo/releases/latest/download/parterre.tar.gz"
else
  archive_url="https://github.com/$repo/releases/download/$version/parterre.tar.gz"
fi
archive_url="${PARTERRE_ARCHIVE_URL:-$archive_url}"

install_parent=$(dirname "$install_dir")
mkdir -p "$install_parent" "$bin_dir"
temporary_dir=$(mktemp -d "$install_parent/.parterre-update.XXXXXX")
staged_install="$temporary_dir/staged-install"
previous_install="$temporary_dir/previous-install"
swap_started=false
rollback_failed=false
candidate_marker=".parterre-update-candidate-$(basename "$temporary_dir")"
atomic_swap_script="$temporary_dir/atomic-swap.js"

cleanup() {
  status=$?
  trap - EXIT
  trap '' HUP INT TERM
  candidate_is_installed=false
  if [ -e "$install_dir/$candidate_marker" ]; then
    candidate_is_installed=true
  fi
  if [ "$status" -ne 0 ] && { [ "$swap_started" = true ] || [ "$candidate_is_installed" = true ]; }; then
    if ! atomic_swap "$previous_install" "$install_dir"; then
      rollback_failed=true
    fi
    if [ "$rollback_failed" = true ]; then
      printf '%s\n' "Rollback failed; the previous install remains at $previous_install." >&2
      exit "$status"
    fi
    printf '%s\n' "Update failed; restored the previous Parterre installation." >&2
  fi
  rm -rf "$temporary_dir"
  exit "$status"
}
trap 'cleanup' EXIT
trap 'exit 1' HUP INT TERM

directory_kib() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    du -sk "$1" | awk '{print $1}'
  else
    printf '%s\n' 0
  fi
}

available_kib() {
  df -Pk "$install_parent" | awk 'NR == 2 {print $4}'
}

require_disk_space() {
  required_kib=$1
  free_kib=$(available_kib)
  case "$free_kib" in
    ''|*[!0-9]*)
      printf '%s\n' "Could not determine free disk space for $install_parent." >&2
      return 1
      ;;
  esac
  if [ "$free_kib" -lt "$required_kib" ]; then
    required_mib=$(((required_kib + 1023) / 1024))
    free_mib=$((free_kib / 1024))
    printf '%s\n' "Not enough disk space to update Parterre: need ${required_mib} MiB free, found ${free_mib} MiB." >&2
    return 1
  fi
}

smoke_test() {
  candidate_dir=$1
  candidate_version=$(cat "$candidate_dir/VERSION")
  if [ -z "$candidate_version" ]; then
    printf '%s\n' "Parterre smoke test failed: the candidate has no version." >&2
    return 1
  fi
  if [ "$version" != latest ] && [ "$candidate_version" != "$version" ]; then
    printf '%s\n' "Parterre smoke test failed: expected $version, got $candidate_version." >&2
    return 1
  fi
  reported_version=$("$bun_executable" "$candidate_dir/bin/parterre.js" --v)
  if [ "$reported_version" != "$candidate_version" ]; then
    printf '%s\n' "Parterre smoke test failed: expected $candidate_version, got ${reported_version:-no version}." >&2
    return 1
  fi
}

atomic_swap() {
  "$bun_executable" "$atomic_swap_script" "$1" "$2"
}

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

printf '%s\n' "Downloading Parterre ${version}…"
mkdir -p "$staged_install"
curl -fsSL "$archive_url" -o "$temporary_dir/parterre.tar.gz"

archive_kib=$(directory_kib "$temporary_dir/parterre.tar.gz")
installed_kib=$(directory_kib "$install_dir")
estimated_install_kib=$installed_kib
archive_expansion_kib=$((archive_kib * 4))
if [ "$estimated_install_kib" -lt "$archive_expansion_kib" ]; then
  estimated_install_kib=$archive_expansion_kib
fi
require_disk_space $((estimated_install_kib + archive_kib + disk_reserve_kib))

tar -xzf "$temporary_dir/parterre.tar.gz" -C "$staged_install"
printf '%s\n' "$bin_dir" > "$staged_install/.parterre-bin-dir"
cp "$staged_install/bin/atomic-swap.js" "$atomic_swap_script"

"$bun_executable" install \
  --production \
  --omit peer \
  --frozen-lockfile \
  --cwd "$staged_install"

require_disk_space "$disk_reserve_kib"
smoke_test "$staged_install"

if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
  : > "$staged_install/$candidate_marker"
  previous_install=$staged_install
  atomic_swap "$staged_install" "$install_dir"
  swap_started=true
  rm "$install_dir/$candidate_marker"
else
  mv "$staged_install" "$install_dir"
fi
if [ "$installed_bun" = true ] && [ ! -e "$bin_dir/bun" ] && [ ! -L "$bin_dir/bun" ]; then
  ln -sf "$bun_executable" "$bin_dir/bun"
fi
ln -sf "$install_dir/bin/parterre.js" "$bin_dir/parterre"
smoke_test "$install_dir"
swap_started=false

printf '\nParterre installed in %s.\n' "$install_dir"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) printf 'Add %s to PATH, then open a new shell.\n' "$bin_dir" ;;
esac
printf '%s\n' 'Next: parterre setup'
