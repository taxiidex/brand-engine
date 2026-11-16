# Brand Engine production image.
# Same as upstream Dockerfile.dev plus the media toolchain the brand engine needs
# (ffmpeg for video rendering, fonts for canvas/drawtext). Kept as a separate file so
# upstream merges of Dockerfile.dev stay conflict-free.
FROM node:22.23.4-bookworm-slim
ARG NEXT_PUBLIC_VERSION
ENV NEXT_PUBLIC_VERSION=$NEXT_PUBLIC_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    make \
    python3-pip \
    bash \
    nginx \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    fonts-inter \
    fonts-noto-core \
    fonts-noto-color-emoji \
&& rm -rf /var/lib/apt/lists/*

RUN addgroup --system www \
 && adduser --system --ingroup www --home /www --shell /usr/sbin/nologin www \
 && mkdir -p /www \
 && chown -R www:www /www /var/lib/nginx

RUN npm --no-update-notifier --no-fund --global install pnpm@10.6.1 pm2

WORKDIR /app

COPY . /app
COPY var/docker/nginx.conf /etc/nginx/nginx.conf

RUN pnpm install
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build

CMD ["sh", "-c", "nginx && pnpm run pm2"]
