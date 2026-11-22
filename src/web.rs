mod api;
mod assets;

use axum::{
    Router,
    http::{HeaderValue, Method, header},
    response::Html,
    routing::{any, get},
};
use tower_http::set_header::SetResponseHeaderLayer;

use crate::{auth::Auth, ledger::LedgerClient};

const CONTENT_SECURITY_POLICY: &str = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

pub fn router(ledger: LedgerClient, auth: Auth) -> Router {
    auth.protect(Router::new().fallback(shell))
        .merge(api::router(ledger, &auth))
        .merge(auth.sign_in_routes())
        .route("/healthz", get(health))
        .route("/readyz", get(health))
        .route("/v0", any(api::not_found))
        .route("/v0/", any(api::not_found))
        .route("/v0/{*path}", any(api::not_found))
        .route("/assets", any(assets::not_found))
        .route("/assets/", any(assets::not_found))
        .route("/assets/{*path}", get(assets::get))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(CONTENT_SECURITY_POLICY),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
}

async fn health() -> &'static str {
    "ok\n"
}

async fn shell(method: Method) -> Html<&'static str> {
    Html(if method == Method::HEAD {
        ""
    } else {
        include_str!("../frontend/dist/index.html")
    })
}
