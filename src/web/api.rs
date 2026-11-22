use axum::{
    Router,
    body::Bytes,
    extract::{Path, Request, State, rejection::PathRejection},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use axum_extra::extract::cookie::PrivateCookieJar;
use uuid::Uuid;

use crate::{
    auth::Auth,
    ledger::{LedgerClient, ReadError},
};

pub(super) fn router(ledger: LedgerClient, auth: &Auth) -> Router {
    Router::new()
        .route("/v0/attestations/latest", get(latest))
        .route("/v0/attestations/{id}", get(attestation))
        .method_not_allowed_fallback(|| async { ApiError::MethodNotAllowed })
        .with_state(ledger)
        .layer(middleware::from_fn_with_state(
            auth.clone(),
            require_session,
        ))
}

async fn require_session(
    State(auth): State<Auth>,
    jar: PrivateCookieJar,
    request: Request,
    next: Next,
) -> Response {
    if auth.has_live_session(&jar) {
        next.run(request).await
    } else {
        ApiError::Unauthorized.into_response()
    }
}

async fn latest(State(ledger): State<LedgerClient>) -> Result<Response, ApiError> {
    let (_, body) = ledger.latest_response().await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn attestation(
    State(ledger): State<LedgerClient>,
    id: Result<Path<String>, PathRejection>,
) -> Result<Response, ApiError> {
    let Path(id) = id.map_err(|_| ReadError::InvalidId)?;
    Uuid::parse_str(&id).map_err(|_| ReadError::InvalidId)?;
    let (_, body) = ledger.attestation_response(&id).await?;
    Ok(json_response(StatusCode::OK, body))
}

enum ApiError {
    Unauthorized,
    MethodNotAllowed,
    Ledger(ReadError),
}

impl From<ReadError> for ApiError {
    fn from(error: ReadError) -> Self {
        Self::Ledger(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, r#"{"code":"unauthorized"}"#),
            Self::MethodNotAllowed => (
                StatusCode::METHOD_NOT_ALLOWED,
                r#"{"code":"method_not_allowed"}"#,
            ),
            Self::Ledger(ReadError::InvalidId) => {
                (StatusCode::BAD_REQUEST, r#"{"code":"invalid_identifier"}"#)
            }
            Self::Ledger(ReadError::NotFound) => {
                (StatusCode::NOT_FOUND, r#"{"code":"attestation_not_found"}"#)
            }
            Self::Ledger(ReadError::Unavailable) => (
                StatusCode::SERVICE_UNAVAILABLE,
                r#"{"code":"ledger_unavailable"}"#,
            ),
        };
        json_response(status, Bytes::from_static(body.as_bytes()))
    }
}

fn json_response(status: StatusCode, body: Bytes) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}
