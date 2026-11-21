use askama::Template;
use axum::{
    Router,
    http::{HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use tower_http::set_header::SetResponseHeaderLayer;

use crate::ledger::{LedgerClient, ReadError};

const CONTENT_SECURITY_POLICY: &str = "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

#[derive(Template)]
#[template(
    ext = "html",
    source = r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ title }} | Please Behave</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <main>
        <h1>{{ title }}</h1>
        <p>{{ message }}</p>
    </main>
</body>
</html>
"#
)]
pub struct ErrorPage<'a> {
    pub status: StatusCode,
    pub title: &'a str,
    pub message: &'a str,
}

impl IntoResponse for ErrorPage<'_> {
    fn into_response(self) -> Response {
        match self.render() {
            Ok(html) => (self.status, Html(html)).into_response(),
            Err(_) => {
                tracing::error!("Error page rendering failed");
                (StatusCode::INTERNAL_SERVER_ERROR, "Page rendering failed.").into_response()
            }
        }
    }
}

impl IntoResponse for ReadError {
    fn into_response(self) -> Response {
        let (status, title, message) = match self {
            Self::InvalidId => (
                StatusCode::BAD_REQUEST,
                "Invalid attestation identifier",
                "The attestation identifier is malformed.",
            ),
            Self::NotFound => (
                StatusCode::NOT_FOUND,
                "Attestation not found",
                "The ledger has no attestation with that identifier.",
            ),
            Self::Unavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Ledger unavailable",
                "Cockpit could not load data from the ledger. Try again later.",
            ),
        };
        ErrorPage {
            status,
            title,
            message,
        }
        .into_response()
    }
}

pub fn router(ledger: LedgerClient) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/readyz", get(health))
        .route("/style.css", get(stylesheet))
        .fallback(not_found)
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
        .with_state(ledger)
}

async fn health() -> &'static str {
    "ok\n"
}

async fn stylesheet() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("style.css"),
    )
}

async fn not_found() -> ErrorPage<'static> {
    ErrorPage {
        status: StatusCode::NOT_FOUND,
        title: "Page not found",
        message: "There is no page at this address.",
    }
}
