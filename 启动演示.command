#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/node-v24.16.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ ! -f dist/index.html ]]; then
  npm run build || exit 1
fi
npm start
