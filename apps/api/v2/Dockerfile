FROM node:20-alpine AS build

ARG DATABASE_DIRECT_URL
ARG DATABASE_URL

WORKDIR /calcom

RUN set -eux;
RUN ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3
# deasync (used by @calcom/features) has no prebuilt binary for Alpine, so yarn compiles it.
RUN apk add --no-cache python3 make g++

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV DATABASE_DIRECT_URL=${DATABASE_DIRECT_URL}
ENV DATABASE_URL=${DATABASE_URL}
ENV USE_POOL="true"

COPY . .

RUN yarn install
RUN yarn workspace @calcom/api-v2 run generate-schemas
RUN yarn workspace @calcom/api-v2 run build:docker
RUN yarn workspace @calcom/api-v2 run build

EXPOSE 80

# The web app container used to run the migrations. The API runs alone now, so it applies them on start.
CMD [ "sh", "-c", "yarn workspace @calcom/prisma db-deploy && yarn workspace @calcom/api-v2 start:prod" ]
