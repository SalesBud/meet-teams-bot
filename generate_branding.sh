#!/bin/bash

set -e

BOT_NAME=${1:-"Recording Bot"}

echo "Generating branding for: $BOT_NAME"

echo "Generating MP4 (v4l2loopback)..."
ffmpeg -f lavfi -i "color=black:size=640x360:duration=5:rate=30" \
       -vf "drawtext=text='$BOT_NAME':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
       -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p \
       -y branding.mp4

echo "Generating Y4M (Chrome fake video capture)..."
ffmpeg -f lavfi -i "color=black:size=640x360:duration=5:rate=30" \
       -vf "drawtext=text='$BOT_NAME':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
       -pix_fmt yuv420p \
       -y branding.y4m

echo "Branding generated: branding.mp4 e branding.y4m"
