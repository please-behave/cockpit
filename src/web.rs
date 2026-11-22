mod api;

use askama::Template;
use axum::{
    Router,
    extract::{Path, State},
    http::{HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use tower_http::set_header::SetResponseHeaderLayer;

use crate::{
    auth::Auth,
    ledger::{Attestation, LedgerClient, Overall, ReadError, Summary},
};

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
        render_page(self.status, &self)
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

pub fn router(ledger: LedgerClient, auth: Auth) -> Router {
    let api = api::router(ledger.clone(), &auth);
    let protected = Router::new()
        .route("/", get(overview))
        .route("/attestations/{id}", get(detail))
        .route("/style.css", get(stylesheet))
        .fallback(not_found)
        .with_state(ledger);

    auth.protect(protected)
        .merge(api)
        .merge(auth.sign_in_routes())
        .route("/healthz", get(health))
        .route("/readyz", get(health))
        .layer(SetResponseHeaderLayer::overriding(
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

#[derive(Template)]
#[template(
    ext = "html",
    source = r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Latest attestations | Please Behave</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <main class="attestations">
        <nav aria-label="Account"><a href="/sign-out">Sign out</a></nav>
        <h1>Latest attestations</h1>
        <p>These outcomes are shown as reported to the ledger.</p>
        {% if rows.is_empty() %}
        <p>No attestations have been reported yet.</p>
        {% else %}
        <div class="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th scope="col">Repository</th>
                        <th scope="col">Execution points</th>
                        <th scope="col">Sender</th>
                        <th scope="col">Commit</th>
                        <th scope="col">Overall</th>
                        <th scope="col">Warnings</th>
                        <th scope="col">Not run</th>
                        <th scope="col">Last reported</th>
                    </tr>
                </thead>
                <tbody>
                    {% for row in rows %}
                    <tr>
                        <th scope="row"><a href="/attestations/{{ row.id|urlencode_strict }}">{{ row.repository }}</a></th>
                        <td>{{ row.execution_points|join(", ") }}</td>
                        <td>{{ row.sender }}</td>
                        <td><code>{{ short_commit(row.commit.as_str()) }}</code></td>
                        <td>{{ row.overall.as_str() }}</td>
                        <td>{{ row.warn_count }}</td>
                        <td>{{ row.not_run_count }}</td>
                        <td><time datetime="{{ row.received_at }}">{{ row.received_at }}</time></td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        {% endif %}
    </main>
</body>
</html>
"#
)]
struct OverviewPage {
    rows: Vec<Summary>,
}

impl OverviewPage {
    fn short_commit<'a>(&self, commit: &'a str) -> &'a str {
        commit
            .char_indices()
            .nth(7)
            .map_or(commit, |(index, _)| &commit[..index])
    }
}

#[derive(Template)]
#[template(
    ext = "html",
    source = r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ attestation.summary.repository }} | Please Behave</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <main>
        <nav aria-label="Cockpit"><a href="/">Latest attestations</a> <a href="/sign-out">Sign out</a></nav>
        <h1>{{ attestation.summary.repository }}</h1>
        <p>These outcomes are shown as reported to the ledger.</p>
        <dl>
            <dt>Commit</dt>
            <dd><code>{{ attestation.summary.commit }}</code></dd>
            <dt>Execution points</dt>
            <dd>{{ attestation.summary.execution_points|join(", ") }}</dd>
            <dt>Sender</dt>
            <dd>{{ attestation.summary.sender }}</dd>
            <dt>Overall</dt>
            <dd>{{ attestation.summary.overall.as_str() }}</dd>
            <dt>Reported</dt>
            <dd><time datetime="{{ attestation.summary.received_at }}">{{ attestation.summary.received_at }}</time></dd>
        </dl>
        <h2>Rules</h2>
        <div class="table-scroll">
            <table>
                <thead>
                    <tr><th scope="col">Rule</th><th scope="col">Kind</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                    {% for result in attestation.results %}
                    <tr>
                        <th scope="row">{{ result.id }}</th>
                        <td>{{ result.kind.as_str() }}</td>
                        <td>{{ result.status.as_str() }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
    </main>
</body>
</html>
"#
)]
struct DetailPage {
    attestation: Attestation,
}

async fn overview(State(ledger): State<LedgerClient>) -> Result<Response, ReadError> {
    let mut rows = ledger.latest().await?;
    rows.sort_by(|left, right| {
        overview_priority(&left.overall)
            .cmp(&overview_priority(&right.overall))
            .then_with(|| left.repository.cmp(&right.repository))
            .then_with(|| left.execution_points.cmp(&right.execution_points))
    });
    Ok(render_page(StatusCode::OK, &OverviewPage { rows }))
}

async fn detail(
    State(ledger): State<LedgerClient>,
    Path(id): Path<String>,
) -> Result<Response, ReadError> {
    let attestation = ledger.attestation(&id).await?;
    Ok(render_page(StatusCode::OK, &DetailPage { attestation }))
}

fn overview_priority(overall: &Overall) -> u8 {
    match overall {
        Overall::Error => 0,
        Overall::Fail => 1,
        Overall::Pass => 2,
    }
}

fn render_page(status: StatusCode, template: &impl Template) -> Response {
    match template.render() {
        Ok(html) => (status, Html(html)).into_response(),
        Err(_) => {
            tracing::error!("Page rendering failed");
            (StatusCode::INTERNAL_SERVER_ERROR, "Page rendering failed.").into_response()
        }
    }
}
