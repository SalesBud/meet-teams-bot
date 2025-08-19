#!/bin/bash

# generate_custom_branding.sh - Converte imagem da URL em vídeo para branding do bot
# Uso: ./generate_custom_branding.sh "https://exemplo.com/imagem.jpg"

set -e

IMAGE_URL=${1:-""}

if [ -z "$IMAGE_URL" ]; then
    echo "❌ Erro: URL da imagem não fornecida"
    echo "Uso: ./generate_custom_branding.sh 'https://exemplo.com/imagem.jpg'"
    exit 1
fi

echo "🎬 Baixando e convertendo imagem: $IMAGE_URL"

# Baixar a imagem diretamente
curl -L -o temp_image.jpg "$IMAGE_URL"

# Verificar se o download foi bem-sucedido
if [ ! -f "temp_image.jpg" ] || [ ! -s "temp_image.jpg" ]; then
    echo "❌ Erro: Falha ao baixar imagem de $IMAGE_URL"
    exit 1
fi

# Check if we're in WSL2 environment
if [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ]; then
    echo "🔧 WSL2 detected - using image directly for branding"

    # In WSL2, we'll use the image directly instead of converting to video
    cp temp_image.jpg branding_image.jpg
    echo "✅ Branding image saved: branding_image.jpg"

    # Clean up temporary file
    rm temp_image.jpg
else
    # Standard approach for Linux with v4l2loopback
    echo "🎥 Convertendo para vídeo..."
    ffmpeg -loop 1 -i temp_image.jpg \
           -c:v libx264 -preset fast -crf 23 \
           -t 5 -pix_fmt yuv420p \
           -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" \
           -y branding.mp4

    # Verificar se o arquivo foi criado
    if [ -f "branding.mp4" ]; then
        echo "✅ Arquivo branding.mp4 criado com sucesso"
        ls -la branding.mp4
    else
        echo "❌ Erro: branding.mp4 não foi criado"
        exit 1
    fi

    # Limpar arquivo temporário
    rm temp_image.jpg
    echo "✅ Branding personalizado gerado: branding.mp4"
fi
