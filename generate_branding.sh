#!/bin/bash

# generate_branding.sh - Gera vídeo de branding padrão com nome do bot
# Uso: ./generate_branding.sh "Nome do Bot"

set -e

BOT_NAME=${1:-"Recording Bot"}

echo "🎬 Gerando branding padrão para: $BOT_NAME"

# Criar vídeo simples com texto do nome do bot
ffmpeg -f lavfi -i "color=black:size=640x360:duration=5:rate=30" \
       -vf "drawtext=text='$BOT_NAME':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
       -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p \
       -y branding.mp4

echo "✅ Branding padrão gerado: branding.mp4"
