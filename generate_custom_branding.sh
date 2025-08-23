#!/bin/bash

set -e

IMAGE_URL=${1:-""}
QUIET=${2:-"true"}

if [ -z "$IMAGE_URL" ]; then
    echo "Error: Image URL not provided"
    echo "Usage: ./generate_custom_branding.sh 'https://example.com/image.jpg' [quiet]"
    echo "  quiet: Set to 'true' to suppress FFmpeg output (default: false)"
    exit 1
fi

echo "Downloading and converting image: $IMAGE_URL"

curl -L -o temp_image.jpg "$IMAGE_URL"

if [ ! -f "temp_image.jpg" ] || [ ! -s "temp_image.jpg" ]; then
    echo "Error: Failed to download image from $IMAGE_URL"
    exit 1
fi

if [ -n "$WSL_DISTRO_NAME" ] || [ -n "$WSLENV" ]; then
    echo "WSL2 detected - using image directly for branding"

    cp temp_image.jpg branding_image.jpg
    echo "Branding image saved: branding_image.jpg"

    rm temp_image.jpg
else
    echo "Converting to MP4 (v4l2loopback)..."
    if [ "$QUIET" = "true" ]; then
        ffmpeg -loglevel quiet -loop 1 -i temp_image.jpg \
               -c:v libx264 -preset fast -crf 23 \
               -t 5 -pix_fmt yuv420p \
               -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" \
               -y branding.mp4
    else
        ffmpeg -loglevel error -loop 1 -i temp_image.jpg \
               -c:v libx264 -preset fast -crf 23 \
               -t 5 -pix_fmt yuv420p \
               -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" \
               -y branding.mp4
    fi

    echo "Converting to Y4M (Chrome fake video capture)..."
    if [ "$QUIET" = "true" ]; then
        ffmpeg -loglevel quiet -loop 1 -i temp_image.jpg \
               -t 5 -pix_fmt yuv420p \
               -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" \
               -y branding.y4m
    else
        ffmpeg -loglevel error -loop 1 -i temp_image.jpg \
               -t 5 -pix_fmt yuv420p \
               -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" \
               -y branding.y4m
    fi

    if [ -f "branding.mp4" ] && [ -f "branding.y4m" ]; then
        echo "Branding files created: branding.mp4 and branding.y4m"
        ls -la branding.mp4 branding.y4m
    else
        echo "Error: Failed to create branding files"
        exit 1
    fi

    rm temp_image.jpg
    echo "Branding generated: branding.mp4 and branding.y4m"
fi
