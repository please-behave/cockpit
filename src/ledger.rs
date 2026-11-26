use std::time::Duration;

use anyhow::{Context, Result, ensure};
use axum::body::Bytes;
use reqwest::{Client, Response, StatusCode, Url, redirect::Policy};
use serde::{Deserialize, de::DeserializeOwned};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct LedgerClient {
    client: Client,
    base_url: Url,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadError {
    InvalidId,
    InvalidQuery,
    NotFound,
    InvalidRuleIdentity,
    RuleNotFound,
    InvalidRuleSetIdentity,
    RuleSetNotFound,
    ReleaseNotFound,
    Unavailable,
}

// Ledger read API v0 (ledger:CON-0002, ledger:CON-0003 and ledger:CON-0004).
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
    pub result_count: u64,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct Attestation {
    #[serde(flatten)]
    pub summary: Summary,
    pub results: Vec<ReportedResult>,
    #[serde(default)]
    pub rule_sets: Vec<BoundRuleSet>,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct BoundRuleSet {
    pub source: String,
    pub path: String,
    pub id: String,
    pub version: String,
    pub execution_points: Vec<String>,
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
    pub name: Option<String>,
    pub kind: ResultKind,
    pub status: ReportedStatus,
    pub verification: Verification,
    pub rule: Option<RuleIdentity>,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct RuleIdentity {
    pub source: String,
    pub path: String,
    pub id: String,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum Verification {
    Verified {},
    Unverified { reason: UnverifiedReason },
}

#[derive(Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UnverifiedReason {
    Unregistered,
    Mismatch,
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

// Deserialize to validate the compliance response before forwarding the original bytes.
#[allow(
    dead_code,
    reason = "compliance fields are used only for response validation"
)]
#[derive(Deserialize)]
struct CompletedRuleSets {
    repository: String,
    sets: Vec<RuleSetRegistration>,
}

// Release and deployment reads follow ledger:CON-0017 through ledger:CON-0019 and ledger:CON-0022.
#[allow(
    dead_code,
    reason = "release and deployment fields are used only for response validation"
)]
mod releases {
    use serde::{Deserialize, Deserializer};

    use super::{Overall, RuleSetRegistration};

    #[derive(Deserialize)]
    pub(super) struct Summary {
        repository: String,
        version: String,
        commit: String,
        sender: String,
        auth_method: AuthMethod,
        received_at: String,
        #[serde(deserialize_with = "evidence")]
        evidence: Option<Evidence>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "snake_case")]
    enum AuthMethod {
        ApiKey,
        GithubOidc,
    }

    #[derive(Deserialize)]
    struct Evidence {
        overall: Overall,
        completed_rule_sets: Vec<RuleSetRegistration>,
    }

    #[derive(Deserialize)]
    pub(super) struct Deployment {
        id: String,
        target: Target,
        repository: String,
        sender: String,
        auth_method: AuthMethod,
        received_at: String,
        #[serde(flatten)]
        state: DeploymentState,
    }

    #[derive(Deserialize)]
    struct Target {
        owner: String,
        name: String,
    }

    #[derive(Deserialize)]
    #[serde(tag = "state", rename_all = "snake_case")]
    enum DeploymentState {
        Evidence {
            commit: String,
            evidence: Evidence,
            #[serde(flatten)]
            reference: DeploymentReference,
        },
        NoEvidence {
            commit: String,
            evidence: (),
            #[serde(flatten)]
            reference: DeploymentReference,
        },
        ReleaseNotRecorded {
            version: String,
            reported_commit: (),
            commit: (),
            evidence: (),
        },
    }

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum DeploymentReference {
        Version {
            version: String,
            reported_commit: (),
        },
        Commit {
            version: (),
            reported_commit: String,
        },
    }

    #[derive(Deserialize)]
    pub(super) struct Detail {
        repository: String,
        version: String,
        commit: String,
        sender: String,
        auth_method: AuthMethod,
        received_at: String,
        #[serde(deserialize_with = "evidence")]
        evidence: Option<CommitEvidence>,
    }

    #[derive(Deserialize)]
    struct CommitEvidence {
        id: String,
        overall: Overall,
        received_at: String,
        sender: String,
        auth_method: Option<AuthMethod>,
        rule_sets: Vec<BoundRuleSet>,
    }

    #[derive(Deserialize)]
    struct BoundRuleSet {
        source: String,
        path: String,
        id: String,
        version: String,
        name: String,
        registered: bool,
        complete: bool,
        non_passing_members: Vec<NonPassingMember>,
    }

    #[derive(Deserialize)]
    struct NonPassingMember {
        source: String,
        path: String,
        id: String,
        version: String,
        status: String,
    }

    // The ledger must report absent evidence explicitly as null.
    fn evidence<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
        deserializer: D,
    ) -> Result<Option<T>, D::Error> {
        Option::deserialize(deserializer)
    }
}

#[allow(
    dead_code,
    reason = "registration fields are used only for response validation"
)]
#[derive(Deserialize)]
struct RuleSetRegistration {
    source: String,
    path: String,
    id: String,
    version: String,
    name: String,
}

// Deserialize to validate the registry response before forwarding the original bytes.
#[allow(
    dead_code,
    reason = "registry fields are used only for response validation"
)]
mod registry {
    use serde::Deserialize;

    use super::RuleSetRegistration;

    #[derive(Deserialize)]
    pub(super) struct RegisteredRule {
        #[serde(flatten)]
        identity: RegisteredRuleSummary,
        kind: RegisteredRuleKind,
        scan: RuleScan,
        rule_sets: Option<Vec<RuleSetRegistration>>,
    }

    #[derive(Deserialize)]
    pub(super) struct RegisteredRuleSet {
        #[serde(flatten)]
        registration: RuleSetRegistration,
        description: Option<String>,
        member_count: u64,
        scan: RuleScan,
    }

    #[derive(Deserialize)]
    pub(super) struct RegisteredRuleSetVersion {
        source: String,
        path: String,
        id: String,
        version: String,
        name: Option<String>,
        description: Option<String>,
        knowledge: Option<serde_json::Map<String, serde_json::Value>>,
        members: Vec<RuleSetMember>,
        digest: String,
        commit: String,
        registered_at: String,
    }

    #[derive(Deserialize)]
    struct RuleSetMember {
        source: String,
        path: String,
        id: String,
        version: String,
        digest: String,
        enabled: bool,
    }

    #[derive(Deserialize)]
    pub(super) struct RuleSetCompliance {
        repository: String,
        version: String,
        registered: bool,
        complete: bool,
        non_passing_members: Vec<NonPassingMember>,
    }

    #[derive(Deserialize)]
    struct NonPassingMember {
        source: String,
        path: String,
        id: String,
        version: String,
        status: NonPassingStatus,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "SCREAMING_SNAKE_CASE")]
    enum NonPassingStatus {
        Fail,
        Error,
        Warn,
        NotRun,
    }

    #[derive(Deserialize)]
    struct RuleScan {
        through: i64,
        registrations: std::num::NonZeroU64,
    }

    #[derive(Deserialize)]
    pub(super) struct RegisteredVersion {
        #[serde(flatten)]
        identity: RegisteredRuleSummary,
        #[serde(flatten)]
        kind: RegisteredVersionKind,
        knowledge: Option<serde_json::Map<String, serde_json::Value>>,
        digest: String,
        commit: String,
        registered_at: String,
        rule_sets: Option<Vec<RuleSetRegistration>>,
    }

    #[derive(Deserialize)]
    struct RegisteredRuleSummary {
        source: String,
        path: String,
        id: String,
        version: String,
        name: Option<String>,
        description: Option<String>,
        owner: Option<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "snake_case")]
    enum RegisteredRuleKind {
        Check,
        Review,
    }

    #[derive(Deserialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    enum RegisteredVersionKind {
        Check,
        Review { blocking: bool, prompt: String },
    }
}

#[derive(Clone, Copy)]
enum Endpoint<'a> {
    Latest,
    CompletedRuleSets,
    List,
    Attestation(&'a str),
    Rules,
    RuleVersions,
    RuleSets,
    RuleSetVersions,
    RuleSetCompliance,
    LatestReleases,
    ReleaseHistory,
    ReleaseDetail,
    Deployments,
}

impl LedgerClient {
    pub fn new(base_url: &str) -> Result<Self> {
        let base_url = Url::parse(base_url).context("Expected an absolute ledger URL")?;
        ensure!(
            matches!(base_url.scheme(), "http" | "https")
                && base_url.has_host()
                && base_url.username().is_empty()
                && base_url.password().is_none()
                && base_url.path() == "/"
                && base_url.query().is_none()
                && base_url.fragment().is_none(),
            "Expected an HTTP or HTTPS origin without credentials, path, query or fragment"
        );

        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .no_proxy()
            .build()
            .context("Cannot initialize the ledger HTTP client")?;

        Ok(Self { client, base_url })
    }

    pub async fn latest(&self) -> Result<Vec<Summary>, ReadError> {
        self.latest_response().await.map(|(summaries, _)| summaries)
    }

    pub async fn attestation(&self, id: &str) -> Result<Attestation, ReadError> {
        self.attestation_response(id)
            .await
            .map(|(attestation, _)| attestation)
    }

    pub(crate) async fn latest_response(&self) -> Result<(Vec<Summary>, Bytes), ReadError> {
        self.read(Endpoint::Latest, None).await
    }

    pub(crate) async fn completed_rule_sets_response(&self) -> Result<Bytes, ReadError> {
        let (repositories, body) = self
            .read::<Vec<CompletedRuleSets>>(Endpoint::CompletedRuleSets, None)
            .await?;
        if repositories.iter().any(|entry| entry.sets.is_empty()) {
            tracing::warn!(reason = "empty completed set list", "Ledger read failed");
            return Err(ReadError::Unavailable);
        }
        Ok(body)
    }

    pub async fn list(&self, query: Option<&str>) -> Result<Vec<Summary>, ReadError> {
        self.list_response(query)
            .await
            .map(|(summaries, _)| summaries)
    }

    pub(crate) async fn list_response(
        &self,
        query: Option<&str>,
    ) -> Result<(Vec<Summary>, Bytes), ReadError> {
        self.read(Endpoint::List, query).await
    }

    pub(crate) async fn attestation_response(
        &self,
        id: &str,
    ) -> Result<(Attestation, Bytes), ReadError> {
        if matches!(id, "" | "." | ".." | "latest") {
            return Err(ReadError::InvalidId);
        }
        self.read(Endpoint::Attestation(id), None).await
    }

    pub(crate) async fn rules_response(&self, query: Option<&str>) -> Result<Bytes, ReadError> {
        let (_, body) = self
            .read::<Vec<registry::RegisteredRule>>(Endpoint::Rules, query)
            .await?;
        Ok(body)
    }

    pub(crate) async fn rule_sets_response(&self, query: Option<&str>) -> Result<Bytes, ReadError> {
        let (_, body) = self
            .read::<Vec<registry::RegisteredRuleSet>>(Endpoint::RuleSets, query)
            .await?;
        Ok(body)
    }

    pub(crate) async fn rule_set_compliance_response(
        &self,
        query: Option<&str>,
    ) -> Result<Bytes, ReadError> {
        let (_, body) = self
            .read::<Vec<registry::RuleSetCompliance>>(Endpoint::RuleSetCompliance, query)
            .await?;
        Ok(body)
    }

    pub(crate) async fn rule_versions_response(
        &self,
        query: Option<&str>,
    ) -> Result<Bytes, ReadError> {
        self.version_history::<registry::RegisteredVersion>(Endpoint::RuleVersions, query)
            .await
    }

    pub(crate) async fn rule_set_versions_response(
        &self,
        query: Option<&str>,
    ) -> Result<Bytes, ReadError> {
        self.version_history::<registry::RegisteredRuleSetVersion>(Endpoint::RuleSetVersions, query)
            .await
    }

    pub(crate) async fn releases_response(
        &self,
        latest: bool,
        query: Option<&str>,
    ) -> Result<Bytes, ReadError> {
        let endpoint = if latest {
            Endpoint::LatestReleases
        } else {
            Endpoint::ReleaseHistory
        };
        let (_, body) = self.read::<Vec<releases::Summary>>(endpoint, query).await?;
        Ok(body)
    }

    pub(crate) async fn release_response(&self, query: Option<&str>) -> Result<Bytes, ReadError> {
        let (_, body) = self
            .read::<releases::Detail>(Endpoint::ReleaseDetail, query)
            .await?;
        Ok(body)
    }

    pub(crate) async fn deployments_response(
        &self,
        query: Option<&str>,
    ) -> Result<Bytes, ReadError> {
        let (_, body) = self
            .read::<Vec<releases::Deployment>>(Endpoint::Deployments, query)
            .await?;
        Ok(body)
    }

    async fn version_history<T: DeserializeOwned>(
        &self,
        endpoint: Endpoint<'_>,
        query: Option<&str>,
    ) -> Result<Bytes, ReadError> {
        let (versions, body) = self.read::<Vec<T>>(endpoint, query).await?;
        if versions.is_empty() {
            tracing::warn!(reason = "empty version history", "Ledger read failed");
            return Err(ReadError::Unavailable);
        }
        Ok(body)
    }

    async fn read<T: DeserializeOwned>(
        &self,
        endpoint: Endpoint<'_>,
        query: Option<&str>,
    ) -> Result<(T, Bytes), ReadError> {
        let mut url = self.base_url.clone();
        url.set_path(match endpoint {
            Endpoint::Latest => "/v0/attestations/latest",
            Endpoint::CompletedRuleSets => "/v0/repositories/completed-rule-sets",
            Endpoint::List | Endpoint::Attestation(_) => "/v0/attestations",
            Endpoint::Rules => "/v0/rules",
            Endpoint::RuleVersions => "/v0/rules/detail",
            Endpoint::RuleSets => "/v0/rule-sets",
            Endpoint::RuleSetVersions => "/v0/rule-sets/detail",
            Endpoint::RuleSetCompliance => "/v0/rule-sets/compliance",
            Endpoint::LatestReleases => "/v0/releases/latest",
            Endpoint::ReleaseHistory => "/v0/releases",
            Endpoint::ReleaseDetail => "/v0/releases/detail",
            Endpoint::Deployments => "/v0/deployments",
        });
        if let Endpoint::Attestation(id) = endpoint {
            url.path_segments_mut()
                .expect("a validated ledger URL has path segments")
                .push(id);
        }
        url.set_query(query);

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

        match (response.status(), endpoint) {
            (StatusCode::OK, _) => validated_body(response).await,
            (StatusCode::BAD_REQUEST, Endpoint::Attestation(_)) => Err(ReadError::InvalidId),
            (
                StatusCode::BAD_REQUEST,
                Endpoint::List
                | Endpoint::Rules
                | Endpoint::RuleSets
                | Endpoint::RuleSetCompliance
                | Endpoint::LatestReleases
                | Endpoint::ReleaseHistory
                | Endpoint::ReleaseDetail
                | Endpoint::Deployments,
            ) => Err(ReadError::InvalidQuery),
            (StatusCode::NOT_FOUND, Endpoint::ReleaseDetail) => Err(ReadError::ReleaseNotFound),
            (StatusCode::NOT_FOUND, Endpoint::Attestation(_)) => Err(ReadError::NotFound),
            (StatusCode::BAD_REQUEST, Endpoint::RuleVersions) => {
                Err(ReadError::InvalidRuleIdentity)
            }
            (StatusCode::NOT_FOUND, Endpoint::RuleVersions) => Err(ReadError::RuleNotFound),
            (StatusCode::BAD_REQUEST, Endpoint::RuleSetVersions) => {
                Err(ReadError::InvalidRuleSetIdentity)
            }
            (StatusCode::NOT_FOUND, Endpoint::RuleSetVersions) => Err(ReadError::RuleSetNotFound),
            (status, _) => {
                tracing::warn!(status = status.as_u16(), "Unexpected ledger status");
                Err(ReadError::Unavailable)
            }
        }
    }
}

async fn validated_body<T: DeserializeOwned>(response: Response) -> Result<(T, Bytes), ReadError> {
    let body = response.bytes().await.map_err(|error| {
        let reason = if error.is_timeout() {
            "timeout"
        } else {
            "response body"
        };
        tracing::warn!(reason, "Ledger read failed");
        ReadError::Unavailable
    })?;
    let parsed = serde_json::from_slice(&body).map_err(|_| {
        tracing::warn!(reason = "response body", "Ledger read failed");
        ReadError::Unavailable
    })?;
    Ok((parsed, body))
}
