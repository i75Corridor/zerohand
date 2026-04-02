FROM node:22-slim

RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 runner && useradd -u 1000 -g runner -m runner

# Install common packages skills might need
RUN npm install -g @google/genai

ENV NODE_PATH=/usr/local/lib/node_modules

USER runner
WORKDIR /scripts

ENTRYPOINT []
CMD ["node"]
