use axum::{
    Router,
    body::Bytes,
    extract::{Path, RawQuery, Request, State, rejection::PathRejection},
    http::{Method, StatusCode, header},
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
        .route("/v0/attestations", get(list))
        .route("/v0/attestations/latest", get(latest))
        .route("/v0/repositories/overview", get(repository_overview))
        .route(
            "/v0/repositories/completed-rule-sets",
            get(completed_rule_sets),
        )
        .route("/v0/attestations/{id}", get(attestation))
        .route("/v0/rules", get(rules))
        .route("/v0/rules/detail", get(rule_versions))
        .route("/v0/rule-sets", get(rule_sets))
        .route("/v0/rule-sets/detail", get(rule_set_versions))
        .route("/v0/rule-sets/compliance", get(rule_set_compliance))
        .route("/v0/releases/latest", get(latest_releases))
        .route("/v0/releases", get(release_history))
        .route("/v0/releases/detail", get(release_detail))
        .route("/v0/deployments", get(deployments))
        .method_not_allowed_fallback(|| async { ApiError::MethodNotAllowed })
        .with_state(ledger)
        .layer(middleware::from_fn_with_state(
            auth.clone(),
            require_session,
        ))
}

pub(super) async fn not_found(method: Method) -> Response {
    let body = if method == Method::HEAD {
        Bytes::new()
    } else {
        Bytes::from_static(br#"{"code":"route_not_found"}"#)
    };
    json_response(StatusCode::NOT_FOUND, body)
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

async fn repository_overview(State(ledger): State<LedgerClient>) -> Result<Response, ApiError> {
    let body = ledger.repository_overview_response().await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn completed_rule_sets(State(ledger): State<LedgerClient>) -> Result<Response, ApiError> {
    let body = ledger.completed_rule_sets_response().await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn list(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let (_, body) = ledger.list_response(query.as_deref()).await?;
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

async fn rules(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.rules_response(query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn rule_versions(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.rule_versions_response(query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn rule_sets(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.rule_sets_response(query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn rule_set_versions(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.rule_set_versions_response(query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn rule_set_compliance(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger
        .rule_set_compliance_response(query.as_deref())
        .await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn latest_releases(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.releases_response(true, query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn release_history(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.releases_response(false, query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn release_detail(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.release_response(query.as_deref()).await?;
    Ok(json_response(StatusCode::OK, body))
}

async fn deployments(
    State(ledger): State<LedgerClient>,
    RawQuery(query): RawQuery,
) -> Result<Response, ApiError> {
    let body = ledger.deployments_response(query.as_deref()).await?;
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
            Self::Ledger(ReadError::InvalidQuery) => {
                (StatusCode::BAD_REQUEST, r#"{"code":"invalid_query"}"#)
            }
            Self::Ledger(ReadError::NotFound) => {
                (StatusCode::NOT_FOUND, r#"{"code":"attestation_not_found"}"#)
            }
            Self::Ledger(ReadError::InvalidRuleIdentity) => (
                StatusCode::BAD_REQUEST,
                r#"{"code":"invalid_rule_identity"}"#,
            ),
            Self::Ledger(ReadError::RuleNotFound) => {
                (StatusCode::NOT_FOUND, r#"{"code":"rule_not_found"}"#)
            }
            Self::Ledger(ReadError::InvalidRuleSetIdentity) => (
                StatusCode::BAD_REQUEST,
                r#"{"code":"invalid_rule_set_identity"}"#,
            ),
            Self::Ledger(ReadError::RuleSetNotFound) => {
                (StatusCode::NOT_FOUND, r#"{"code":"rule_set_not_found"}"#)
            }
            Self::Ledger(ReadError::ReleaseNotFound) => {
                (StatusCode::NOT_FOUND, r#"{"code":"release_not_found"}"#)
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
