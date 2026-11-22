// Verifies REQ-0002 and REQ-0024.

use std::{
    future::pending,
    time::{Duration, Instant},
};

use axum::{
    Router,
    extract::{Path, RawQuery},
    http::{StatusCode, header},
    routing::get,
};
use cockpit::ledger::{
    LedgerClient, Overall, ReadError, ReportedStatus, ResultKind, UnverifiedReason, Verification,
};
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
        "not_run_count": 1,
        "result_count": 3
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
                            {"id": "first", "kind": "review", "status": "WARN",
                             "verification": {"status": "verified"}},
                            {"id": "second", "kind": "integrity", "status": "NOT_RUN",
                             "verification": {"status": "unverified", "reason": "unregistered"}},
                            {"id": "third", "kind": "check", "status": "FAIL",
                             "verification": {"status": "unverified", "reason": "mismatch"}}
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
    assert_eq!(attestation.summary.result_count, 3);
    assert_eq!(attestation.results[0].kind, ResultKind::Review);
    assert_eq!(attestation.results[0].status, ReportedStatus::Warn);
    assert_eq!(attestation.results[1].status, ReportedStatus::NotRun);
    assert_eq!(attestation.results[2].status, ReportedStatus::Fail);
    assert_eq!(
        attestation.results[0].verification,
        Verification::Verified {}
    );
    assert_eq!(
        attestation.results[1].verification,
        Verification::Unverified {
            reason: UnverifiedReason::Unregistered,
        }
    );
    assert_eq!(
        attestation.results[2].verification,
        Verification::Unverified {
            reason: UnverifiedReason::Mismatch,
        }
    );
    assert_eq!(ledger.attestation(OTHER_ID).await, Err(ReadError::NotFound));
    for id in ["bad", "fake/../../latest", "?", "latest", ".."] {
        assert_eq!(ledger.attestation(id).await, Err(ReadError::InvalidId));
    }
}

#[test]
fn rejects_missing_or_invalid_verification() {
    let mut result = json!({"id": "rule", "kind": "check", "status": "PASS"});
    assert!(serde_json::from_value::<cockpit::ledger::ReportedResult>(result.clone()).is_err());
    for verification in [
        json!({"status": "unverified"}),
        json!({"status": "unverified", "reason": "unknown"}),
        json!({"status": "verified", "reason": "mismatch"}),
        json!({"status": "unknown"}),
    ] {
        result["verification"] = verification;
        assert!(serde_json::from_value::<cockpit::ledger::ReportedResult>(result.clone()).is_err());
    }
}

#[tokio::test]
async fn accepts_an_empty_latest_list() {
    let (ledger, _mock) =
        mock_ledger(Router::new().route("/v0/attestations/latest", get(|| async { "[]" }))).await;
    assert!(ledger.latest().await.unwrap().is_empty());
}

#[tokio::test]
async fn redirects_and_invalid_payloads_are_ledger_failures() {
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
    assert_eq!(ledger.attestation(ID).await, Err(ReadError::Unavailable));
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

#[tokio::test]
async fn reads_a_page_of_the_list_with_the_given_query() {
    let router = Router::new().route(
        "/v0/attestations",
        get(|RawQuery(query): RawQuery| async move {
            match query.as_deref() {
                None => (
                    StatusCode::OK,
                    json!([summary(OTHER_ID, "org/second")]).to_string(),
                ),
                Some("limit=1&before=x") => (StatusCode::OK, "[]".to_owned()),
                Some(_) => (StatusCode::BAD_REQUEST, String::new()),
            }
        }),
    );
    let (ledger, _mock) = mock_ledger(router).await;
    assert_eq!(ledger.list(None).await.unwrap()[0].id, OTHER_ID);
    assert!(
        ledger
            .list(Some("limit=1&before=x"))
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        ledger.list(Some("limit=0")).await,
        Err(ReadError::InvalidQuery)
    );
}

#[tokio::test]
async fn a_failed_list_read_is_a_ledger_failure() {
    let router = Router::new().route(
        "/v0/attestations",
        get(|| async { (StatusCode::BAD_GATEWAY, "synthetic upstream detail") }),
    );
    let (ledger, _mock) = mock_ledger(router).await;
    assert_eq!(ledger.list(None).await, Err(ReadError::Unavailable));
}
