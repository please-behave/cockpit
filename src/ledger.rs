use std::time::Duration;

use anyhow::{Context, Result, ensure};
use reqwest::{Client, StatusCode, Url, redirect::Policy};
use serde::{Deserialize, de::DeserializeOwned};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct LedgerClient {
    client: Client,
    attestations_url: Url,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadError {
    InvalidId,
    NotFound,
    Unavailable,
}

// Ledger read API v0 (ledger:CON-0002 and ledger:CON-0003).
#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct Summary {
    pub id: String,
    pub received_at: String,
    pub sender: String,
    pub repository: String,
    pub commit: String,
    pub execution_points: Vec<String>,
    pub overall: Overall,
    pub warn_count: u64,
    pub not_run_count: u64,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct Attestation {
    #[serde(flatten)]
    pub summary: Summary,
    pub results: Vec<ReportedResult>,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Overall {
    Pass,
    Fail,
    Error,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct ReportedResult {
    pub id: String,
    pub kind: ResultKind,
    pub status: ReportedStatus,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResultKind {
    Check,
    Review,
    Integrity,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReportedStatus {
    Pass,
    Fail,
    Error,
    NotRun,
    Warn,
}

impl Overall {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Pass => "PASS",
            Self::Fail => "FAIL",
            Self::Error => "ERROR",
        }
    }
}

impl ResultKind {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Check => "check",
            Self::Review => "review",
            Self::Integrity => "integrity",
        }
    }
}

impl ReportedStatus {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Pass => "PASS",
            Self::Fail => "FAIL",
            Self::Error => "ERROR",
            Self::NotRun => "NOT_RUN",
            Self::Warn => "WARN",
        }
    }
}

impl LedgerClient {
    pub fn new(base_url: &str) -> Result<Self> {
        let mut attestations_url =
            Url::parse(base_url).context("Expected an absolute ledger URL")?;
        ensure!(
            matches!(attestations_url.scheme(), "http" | "https")
                && attestations_url.has_host()
                && attestations_url.username().is_empty()
                && attestations_url.password().is_none()
                && attestations_url.path() == "/"
                && attestations_url.query().is_none()
                && attestations_url.fragment().is_none(),
            "Expected an HTTP or HTTPS origin without credentials, path, query or fragment"
        );
        attestations_url.set_path("/v0/attestations");

        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .no_proxy()
            .build()
            .context("Cannot initialize the ledger HTTP client")?;

        Ok(Self {
            client,
            attestations_url,
        })
    }

    pub async fn latest(&self) -> Result<Vec<Summary>, ReadError> {
        self.read("latest", false).await
    }

    pub async fn attestation(&self, id: &str) -> Result<Attestation, ReadError> {
        if matches!(id, "" | "." | ".." | "latest") {
            return Err(ReadError::InvalidId);
        }
        self.read(id, true).await
    }

    async fn read<T: DeserializeOwned>(&self, segment: &str, detail: bool) -> Result<T, ReadError> {
        let mut url = self.attestations_url.clone();
        url.path_segments_mut()
            .expect("a validated ledger URL has path segments")
            .push(segment);

        let response = self.client.get(url).send().await.map_err(|error| {
            // The reqwest error may contain a URL. Log only the failure class.
            let reason = if error.is_timeout() {
                "timeout"
            } else {
                "request"
            };
            tracing::warn!(reason, "Ledger read failed");
            ReadError::Unavailable
        })?;

        match response.status() {
            StatusCode::OK => response.json().await.map_err(|error| {
                let reason = if error.is_timeout() {
                    "timeout"
                } else {
                    "response body"
                };
                tracing::warn!(reason, "Ledger read failed");
                ReadError::Unavailable
            }),
            StatusCode::BAD_REQUEST if detail => Err(ReadError::InvalidId),
            StatusCode::NOT_FOUND if detail => Err(ReadError::NotFound),
            status => {
                tracing::warn!(status = status.as_u16(), "Unexpected ledger status");
                Err(ReadError::Unavailable)
            }
        }
    }
}
