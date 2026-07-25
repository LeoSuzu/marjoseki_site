#!/usr/bin/env bash
# Pidä paikallinen IDE-kopio ajan tasalla, kun Marjo julkaisee sisältöä
# muokkaustilan "Julkaise sivulle" -painikkeella (committaa suoraan GitHubiin).
#
# Käynnistä oman terminaali-välilehdessä työskennellessäsi:
#   bin/watch-content.sh
#
# Pysäytä Ctrl+C:llä. Ei tee mitään pysyvää koneellesi eikä repon
# asetuksiin — pelkkä ajastettu "git fetch" + turvallinen "git pull".

set -euo pipefail
cd "$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

BRANCH="${GIT_BRANCH:-main}"
INTERVAL="${WATCH_INTERVAL:-20}"
was_dirty=0

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

log "Seurataan origin/${BRANCH} ${INTERVAL}s välein. Ctrl+C lopettaa."

while true; do
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$current_branch" != "$BRANCH" ]; then
    log "Nykyinen haara on '${current_branch}', ei '${BRANCH}' — ohitetaan tämä kierros."
    sleep "$INTERVAL"
    continue
  fi

  git fetch --quiet origin "$BRANCH"

  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "origin/${BRANCH}")"

  if [ "$local_sha" = "$remote_sha" ]; then
    was_dirty=0
    sleep "$INTERVAL"
    continue
  fi

  if [ -n "$(git status --porcelain)" ]; then
    if [ "$was_dirty" -eq 0 ]; then
      log "Uusi julkaisu GitHubissa, mutta paikallisia tallentamattomia muutoksia — ei pullata automaattisesti. Committaa/stashaa ja odota seuraavaa kierrosta."
      was_dirty=1
    fi
    sleep "$INTERVAL"
    continue
  fi

  was_dirty=0
  if git merge-base --is-ancestor HEAD "origin/${BRANCH}"; then
    changed="$(git diff --stat "HEAD..origin/${BRANCH}" | tail -1)"
    git pull --ff-only origin "$BRANCH" --quiet
    log "Pullattu uusi sisältö (${remote_sha:0:7}): ${changed:-ei tiedostomuutoksia}"
  else
    log "Paikallinen haara on edennyt eri suuntaan kuin origin/${BRANCH} — ei automaattista pullia, tarkista tilanne itse."
  fi

  sleep "$INTERVAL"
done
