FROM node:26.13.1-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit
COPY frontend/ ./
RUN npm run build

FROM rust:1.100.0-slim-trixie@sha256:51fdc80ccc3fb83bf14481f2cd8d0d11703eeb9f416ab47476c32a793a822307 AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock build.rs ./
COPY --from=frontend /src/frontend/dist/assets ./frontend/dist/assets
COPY --from=frontend /src/frontend/dist/index.html ./frontend/dist/index.html
COPY --from=frontend /src/frontend/dist/sign-in.html ./frontend/dist/sign-in.html
COPY src ./src
RUN cargo build --release --locked

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:532c7a94f9e96ba9db75eb9388f4227751131c7cb0a411d1a8521af4096135de
COPY --from=build /src/target/release/cockpit /usr/local/bin/cockpit
USER nonroot
ENTRYPOINT ["/usr/local/bin/cockpit"]
