// Verifies REQ-0002 and REQ-0003.

use std::{
    future::pending,
    time::{Duration, Instant},
};

use axum::{
    Router,
    body::to_bytes,
    extract::Path,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use cockpit::ledger::{LedgerClient, Overall, ReadError, ReportedStatus, ResultKind};
use serde_json::{Value, json};
use tokio::{net::TcpListener, task::JoinHandle};

const ID: &str = "00000000-0000-0000-0000-000000000001";
const OTHER_ID: &str = "00000000-0000-0000-0000-000000000002";

struct MockLedger(JoinHandle<()>);

impl Drop for MockLedger {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn mock_ledger(router: Router) -> (LedgerClient, MockLedger) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (LedgerClient::new(&base).unwrap(), MockLedger(task))
}

fn summary(id: &str, repository: &str) -> Value {
    json!({
        "id": id,
        "received_at": "2026-10-20T00:00:00Z",
        "sender": "github",
        "repository": repository,
        "commit": "e2c8d2a",
        "execution_points": ["check", "release"],
        "overall": "FAIL",
        "warn_count": 1,
        "not_run_count": 1
    })
}

#[tokio::test]
async fn reads_the_two_v0_contracts_and_preserves_reported_values() {
    let router = Router::new()
        .route(
            "/v0/attestations/latest",
            get(|| async {
                json!([
                    summary(ID, "org/<reported>"),
                    summary(OTHER_ID, "org/second")
                ])
                .to_string()
            }),
        )
        .route(
            "/v0/attestations/{id}",
            get(|Path(id): Path<String>| async move {
                match id.as_str() {
                    ID => {
                        let mut value = summary(ID, "org/<reported>");
                        value["results"] = json!([
                            {"id": "first", "kind": "review", "status": "WARN"},
                            {"id": "second", "kind": "integrity", "status": "NOT_RUN"},
                            {"id": "third", "kind": "check", "status": "FAIL"}
                        ]);
                        (StatusCode::OK, value.to_string())
                    }
                    OTHER_ID => (StatusCode::NOT_FOUND, String::new()),
                    _ => (StatusCode::BAD_REQUEST, String::new()),
                }
            }),
        );
    let (ledger, _mock) = mock_ledger(router).await;

    let latest = ledger.latest().await.unwrap();
    assert_eq!(
        latest
            .iter()
            .map(|summary| summary.id.as_str())
            .collect::<Vec<_>>(),
        [ID, OTHER_ID]
    );
    let attestation = ledger.attestation(ID).await.unwrap();
    assert_eq!(attestation.summary, latest[0]);
    assert_eq!(attestation.summary.repository, "org/<reported>");
    assert_eq!(attestation.summary.execution_points, ["check", "release"]);
    assert_eq!(attestation.summary.overall, Overall::Fail);
    assert_eq!(attestation.summary.warn_count, 1);
    assert_eq!(attestation.summary.not_run_count, 1);
    assert_eq!(attestation.results[0].kind, ResultKind::Review);
    assert_eq!(attestation.results[0].status, ReportedStatus::Warn);
    assert_eq!(attestation.results[1].status, ReportedStatus::NotRun);
    assert_eq!(attestation.results[2].status, ReportedStatus::Fail);
    assert_eq!(ledger.attestation(OTHER_ID).await, Err(ReadError::NotFound));
    for id in ["bad", "fake/../../latest", "?", "latest", ".."] {
        assert_eq!(ledger.attestation(id).await, Err(ReadError::InvalidId));
    }
}

#[tokio::test]
async fn accepts_an_empty_latest_list() {
    let (ledger, _mock) =
        mock_ledger(Router::new().route("/v0/attestations/latest", get(|| async { "[]" }))).await;
    assert!(ledger.latest().await.unwrap().is_empty());
}

#[tokio::test]
async fn upstream_errors_have_a_plain_error_page() {
    let router = Router::new()
        .route(
            "/v0/attestations/latest",
            get(|| async {
                (
                    StatusCode::TEMPORARY_REDIRECT,
                    [(header::LOCATION, "/elsewhere")],
                )
            }),
        )
        .route("/elsewhere", get(|| async { "[]" }))
        .route(
            "/v0/attestations/{id}",
            get(|| async { "synthetic upstream detail" }),
        );
    let (ledger, _mock) = mock_ledger(router).await;
    assert_eq!(ledger.latest().await, Err(ReadError::Unavailable));
    let error = ledger.attestation(ID).await.unwrap_err();
    let response = error.into_response();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
    let page = std::str::from_utf8(&bytes).unwrap();
    assert!(page.contains("Ledger unavailable"));
    assert!(!page.contains("synthetic upstream detail"));
}

#[tokio::test]
async fn ledger_read_has_a_request_deadline() {
    let router = Router::new().route("/v0/attestations/latest", get(pending::<&'static str>));
    let (ledger, _mock) = mock_ledger(router).await;
    let start = Instant::now();
    let result = tokio::time::timeout(Duration::from_secs(10), ledger.latest()).await;
    assert_eq!(result.unwrap(), Err(ReadError::Unavailable));
    assert!(start.elapsed() >= Duration::from_secs(4));
}
