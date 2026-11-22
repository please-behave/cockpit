// Verifies REQ-0004, REQ-0006, REQ-0007, REQ-0011, REQ-0012, REQ-0013,
// REQ-0014 and REQ-0015.

#[path = "support/auth_settings.rs"]
mod support;

use std::{collections::HashMap, future::pending, time::Duration};

use axum::{
    Router,
    extract::{Path, RawQuery},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use axum_extra::extract::cookie::{Cookie, Key, PrivateCookieJar, SameSite};
use cockpit::{
    auth::{Auth, GitHubEndpoints},
    ledger::LedgerClient,
    web,
};
use oauth2::{PkceCodeChallenge, PkceCodeVerifier};
use reqwest::{Client, Response, Url};
use serde_json::{Value, json};
use tokio::{net::TcpListener, task::JoinHandle};

const STATE: &str = "__Host-cockpit-state";
const SESSION: &str = "__Host-cockpit-session";
const ATTESTATION: &str = "00000000-0000-0000-0000-000000000001";
const API_LATEST: &str = "/v0/attestations/latest";
const API_LIST: &str = "/v0/attestations";
const API_DETAIL: &str = "/v0/attestations/00000000-0000-0000-0000-000000000001";
const DETAIL_PATH: &str = "/attestations/00000000-0000-0000-0000-000000000001";

struct Server {
    origin: String,
    task: JoinHandle<()>,
}

impl Server {
    async fn start(router: Router) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async { axum::serve(listener, router).await.unwrap() });
        Self { origin, task }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

struct TestSite {
    client: Client,
    cockpit: Server,
    github: Server,
    ledger: Server,
}

impl TestSite {
    async fn start() -> Self {
        Self::start_with_ledger(
            Router::new().route("/v0/attestations/latest", get(|| async { "[]" })),
        )
        .await
    }

    async fn start_with_ledger(ledger_router: Router) -> Self {
        let ledger = Server::start(ledger_router).await;
        let github = Server::start(
            Router::new()
                .route("/authorize", get(authorize))
                .route("/token", post(exchange))
                .route("/user", get(user)),
        )
        .await;
        let cockpit = Self::start_cockpit(&github, &ledger.origin, "42, 123").await;
        let client = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        Self {
            client,
            cockpit,
            github,
            ledger,
        }
    }

    async fn start_cockpit(github: &Server, ledger_origin: &str, allowed_ids: &str) -> Server {
        let auth = Auth::new(
            support::AUTH_SETTINGS[0].1,
            support::AUTH_SETTINGS[1].1,
            support::AUTH_SETTINGS[2].1,
            support::AUTH_SETTINGS[3].1,
            allowed_ids,
            GitHubEndpoints {
                authorize: &format!("{}/authorize", github.origin),
                token: &format!("{}/token", github.origin),
                user: &format!("{}/user", github.origin),
            },
        )
        .unwrap();
        let ledger = LedgerClient::new(ledger_origin).unwrap();
        Server::start(web::router(ledger, auth)).await
    }

    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.client.get(format!("{}{path}", self.cockpit.origin))
    }

    async fn begin(&self, account: &str) -> (Url, Cookie<'static>) {
        let response = self.get("/sign-in/github").send().await.unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        let state_cookie = cookie(&response, STATE).unwrap();
        check_attributes(&state_cookie, 600);
        let mut redirect = Url::parse(location(&response)).unwrap();
        let query: HashMap<_, _> = redirect.query_pairs().collect();
        assert_eq!(query["client_id"], support::AUTH_SETTINGS[0].1);
        assert_eq!(query["redirect_uri"], support::AUTH_SETTINGS[2].1);
        assert_eq!(query["code_challenge_method"], "S256");
        assert!(!query["state"].is_empty());
        assert!(!query.contains_key("scope"));
        assert!(!state_cookie.value().contains(query["state"].as_ref()));

        redirect.query_pairs_mut().append_pair("account", account);
        let provider = self.client.get(redirect).send().await.unwrap();
        assert_eq!(provider.status(), StatusCode::SEE_OTHER);
        let mut callback = Url::parse(&self.cockpit.origin).unwrap();
        let provider_callback = Url::parse(location(&provider)).unwrap();
        callback.set_path(provider_callback.path());
        callback.set_query(provider_callback.query());
        (callback, state_cookie)
    }

    async fn sign_in(&self, account: &str) -> Response {
        let (callback, state) = self.begin(account).await;
        self.client
            .get(callback)
            .header(header::COOKIE, cookie_header(&state))
            .send()
            .await
            .unwrap()
    }
}

async fn authorize(
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let mut callback = Url::parse(&params["redirect_uri"]).unwrap();
    callback
        .query_pairs_mut()
        .append_pair("state", &params["state"])
        .append_pair(
            "code",
            &format!("{}.{}", params["account"], params["code_challenge"]),
        );
    axum::response::Redirect::to(callback.as_str())
}

async fn exchange(headers: HeaderMap, body: String) -> impl IntoResponse {
    assert_eq!(headers[header::ACCEPT], "application/json");
    let mut form = Url::parse("http://example.test").unwrap();
    form.set_query(Some(&body));
    let params: HashMap<_, _> = form.query_pairs().collect();
    assert_eq!(params["client_id"], support::AUTH_SETTINGS[0].1);
    assert_eq!(params["client_secret"], support::AUTH_SETTINGS[1].1);
    assert_eq!(params["redirect_uri"], support::AUTH_SETTINGS[2].1);
    assert_eq!(params["grant_type"], "authorization_code");
    let (account, challenge) = params["code"].split_once('.').unwrap();
    let verifier = PkceCodeVerifier::new(params["code_verifier"].to_string());
    assert_eq!(
        PkceCodeChallenge::from_code_verifier_sha256(&verifier).as_str(),
        challenge
    );
    (
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({"access_token": format!("synthetic-token-{account}"), "token_type": "bearer"}).to_string(),
    )
}

async fn user(headers: HeaderMap) -> impl IntoResponse {
    let id = match headers[header::AUTHORIZATION].to_str().unwrap() {
        "Bearer synthetic-token-allowed" => 42,
        "Bearer synthetic-token-denied" => 99,
        _ => panic!("unexpected synthetic token"),
    };
    (
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({"id": id, "login": "same-login"}).to_string(),
    )
}

fn location(response: &Response) -> &str {
    response.headers()[header::LOCATION].to_str().unwrap()
}

fn cookie(response: &Response, name: &str) -> Option<Cookie<'static>> {
    response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|value| Cookie::parse_encoded(value.to_str().unwrap().to_owned()).unwrap())
        .find(|cookie| cookie.name() == name)
}

fn cookie_header(cookie: &Cookie<'_>) -> String {
    format!("{}", cookie.encoded().stripped())
}

fn check_attributes(cookie: &Cookie<'_>, age: i64) {
    assert_eq!(cookie.http_only(), Some(true));
    assert_eq!(cookie.secure(), Some(true));
    assert_eq!(cookie.same_site(), Some(SameSite::Lax));
    assert_eq!(cookie.path(), Some("/"));
    assert_eq!(cookie.domain(), None);
    assert_eq!(cookie.max_age().unwrap().whole_seconds(), age);
}

fn test_key() -> Key {
    let bytes: Vec<_> = (0..64).collect();
    Key::from(&bytes)
}

#[tokio::test]
async fn missing_or_unbound_state_cannot_create_a_session() {
    let site = TestSite::start().await;
    let (callback, _) = site.begin("allowed").await;
    let response = site.client.get(callback.clone()).send().await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(cookie(&response, SESSION).is_none());

    let (_, other_browser) = site.begin("allowed").await;
    let response = site
        .client
        .get(callback.clone())
        .header(header::COOKIE, cookie_header(&other_browser))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(cookie(&response, SESSION).is_none());
    check_attributes(&cookie(&response, STATE).unwrap(), 0);

    let (mut callback, state) = site.begin("allowed").await;
    let code = callback
        .query_pairs()
        .find(|(name, _)| name == "code")
        .unwrap()
        .1
        .into_owned();
    callback
        .query_pairs_mut()
        .clear()
        .append_pair("code", &code);
    let response = site
        .client
        .get(callback)
        .header(header::COOKIE, cookie_header(&state))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(cookie(&response, SESSION).is_none());
}

#[tokio::test]
async fn unauthorized_id_is_refused_with_no_session() {
    let site = TestSite::start().await;
    let response = site.sign_in("denied").await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(cookie(&response, SESSION).is_none());
    assert!(
        response.headers()[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/plain")
    );
    assert_eq!(
        response.text().await.unwrap(),
        "This GitHub account is not authorized."
    );
}

#[tokio::test]
async fn sign_in_serves_static_html_and_public_assets_without_a_session() {
    let site = TestSite::start().await;
    let response = site.get("/sign-in").send().await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    assert_browser_headers(&response);

    let page = response.text().await.unwrap();
    assert_eq!(page, include_str!("../frontend/dist/sign-in.html"));
    assert!(page.contains(r#"href="/sign-in/github">Sign in with GitHub</a>"#));
    assert_eq!(
        page.matches("<script").count(),
        page.matches(r#"<script type="module" crossorigin src="/assets/"#)
            .count()
    );
    for inline in ["<style", " style="] {
        assert!(!page.contains(inline), "{inline}");
    }

    for (attribute, prefix, kind) in [
        ("href", "main-", "text/css"),
        ("src", "logo-", "image/svg+xml"),
        ("src", "logo-dark-", "image/svg+xml"),
        ("href", "favicon-", "image/svg+xml"),
    ] {
        let reference = format!(r#"{attribute}="/assets/{prefix}"#);
        let (_, tail) = page.split_once(&reference).expect("built asset reference");
        let (name, _) = tail.split_once('"').unwrap();
        let asset = site
            .get(&format!("/assets/{prefix}{name}"))
            .send()
            .await
            .unwrap();
        assert_eq!(asset.status(), StatusCode::OK);
        assert_eq!(asset.headers()[header::CONTENT_TYPE], kind);
        assert_eq!(
            asset.headers()[header::CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );
        assert!(!asset.bytes().await.unwrap().is_empty());
    }
}

#[tokio::test]
async fn only_live_untampered_sessions_grant_access() {
    let site = TestSite::start().await;
    for path in ["/", DETAIL_PATH, "/missing/view", "/sign-out"] {
        let response = site.get(path).send().await.unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(location(&response), "/sign-in");
    }
    for path in [API_LATEST, API_LIST, API_DETAIL] {
        let response = site.get(path).send().await.unwrap();
        assert_api_error(response, StatusCode::UNAUTHORIZED, "unauthorized").await;
    }

    let response = site
        .client
        .post(format!("{}/missing/view", site.cockpit.origin))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/sign-in");

    let response = site.sign_in("allowed").await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/");
    let session = cookie(&response, SESSION).unwrap();
    check_attributes(&session, 28_800);
    check_attributes(&cookie(&response, STATE).unwrap(), 0);
    let original = cookie_header(&session);
    let mut headers = HeaderMap::new();
    headers.insert(header::COOKIE, original.parse().unwrap());
    let jar: PrivateCookieJar = PrivateCookieJar::from_headers(&headers, test_key());
    let cookie = jar.get(SESSION).expect("session decrypts");
    let (expiry, id) = cookie.value().split_once(':').unwrap();
    assert!(expiry.parse::<u64>().is_ok());
    assert_eq!(id, "42");

    let second_instance =
        TestSite::start_cockpit(&site.github, &site.ledger.origin, "42, 123").await;
    let response = site
        .client
        .get(&second_instance.origin)
        .header(header::COOKIE, &original)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let changed_allow_list =
        TestSite::start_cockpit(&site.github, &site.ledger.origin, "123").await;
    let response = site
        .client
        .get(&changed_allow_list.origin)
        .header(header::COOKIE, &original)
        .send()
        .await
        .unwrap();
    assert_eq!(location(&response), "/sign-in");

    let response = site
        .client
        .get(format!("{}{API_LATEST}", changed_allow_list.origin))
        .header(header::COOKIE, &original)
        .send()
        .await
        .unwrap();
    assert_api_error(response, StatusCode::UNAUTHORIZED, "unauthorized").await;

    let mut tampered = session.clone();
    let mut value = session.value().to_owned();
    value.replace_range(..1, if value.starts_with('A') { "B" } else { "A" });
    tampered.set_value(value);
    let expired = jar.add(Cookie::new(SESSION, "1:42")).into_response();
    let expired = expired.headers()[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    for invalid in [cookie_header(&tampered).as_str(), expired] {
        let response = site
            .get("/")
            .header(header::COOKIE, invalid)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(location(&response), "/sign-in");
        let response = site
            .get(API_DETAIL)
            .header(header::COOKIE, invalid)
            .send()
            .await
            .unwrap();
        assert_api_error(response, StatusCode::UNAUTHORIZED, "unauthorized").await;
    }
}

#[tokio::test]
async fn same_origin_sign_out_clears_the_browser_session() {
    let site = TestSite::start().await;
    let session = cookie(&site.sign_in("allowed").await, SESSION).unwrap();
    for source in ["cross-site", "same-site"] {
        let response = site
            .get("/sign-out")
            .header(header::COOKIE, cookie_header(&session))
            .header("sec-fetch-site", source)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(cookie(&response, SESSION).is_none());
    }
    let response = site
        .get("/sign-out")
        .header(header::COOKIE, cookie_header(&session))
        .header("sec-fetch-site", "same-origin")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/sign-in");
    let removed = cookie(&response, SESSION).unwrap();
    check_attributes(&removed, 0);
    assert!(removed.value().is_empty());
    let response = site
        .get("/")
        .header(header::COOKIE, cookie_header(&removed))
        .send()
        .await
        .unwrap();
    assert_eq!(location(&response), "/sign-in");
}

fn reported_summary(id: &str, repository: &str, point: &str, overall: &str) -> Value {
    json!({
        "id": id,
        "repository": repository,
        "execution_points": [point, "release"],
        "sender": "github<&>",
        "received_at": "2026-10-20T00:00:00Z",
        "commit": "e2c8d2abcde01234",
        "overall": overall,
        "warn_count": 3,
        "not_run_count": 5,
        "result_count": 9
    })
}

#[tokio::test]
async fn authenticated_page_requests_return_the_embedded_shell() {
    let site = TestSite::start_with_ledger(Router::new().fallback(|| async {
        panic!("a shell request reached the ledger");
    }))
    .await;
    let session = cookie_header(&cookie(&site.sign_in("allowed").await, SESSION).unwrap());

    for path in [
        "/",
        DETAIL_PATH,
        "/attestations/invalid",
        "/future/view?query=1",
    ] {
        let response = site
            .get(path)
            .header(header::COOKIE, &session)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_browser_headers(&response);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
        assert_eq!(
            response.text().await.unwrap(),
            include_str!("../frontend/dist/index.html")
        );
    }

    let response = site
        .client
        .head(format!("{}{DETAIL_PATH}", site.cockpit.origin))
        .header(header::COOKIE, &session)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.bytes().await.unwrap().is_empty());
}

#[tokio::test]
async fn unknown_api_routes_return_json_with_or_without_a_session() {
    let site = TestSite::start().await;
    let session = cookie_header(&cookie(&site.sign_in("allowed").await, SESSION).unwrap());
    for path in [
        "/v0",
        "/v0/",
        "/v0/unknown",
        "/v0/attestations/unknown/nested",
    ] {
        let response = site.get(path).send().await.unwrap();
        assert_api_error(response, StatusCode::NOT_FOUND, "route_not_found").await;
        let response = site
            .get(path)
            .header(header::COOKIE, &session)
            .send()
            .await
            .unwrap();
        assert_api_error(response, StatusCode::NOT_FOUND, "route_not_found").await;
    }
}

fn assert_api_headers(response: &Response) {
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
    assert_browser_headers(response);
}

fn assert_browser_headers(response: &Response) {
    let headers = response.headers();
    assert_eq!(headers[header::CACHE_CONTROL], "no-store");
    assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
    assert_eq!(
        headers[header::CONTENT_SECURITY_POLICY],
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    assert!(!headers.contains_key(header::LOCATION));
}

async fn assert_api_error(response: Response, status: StatusCode, code: &str) {
    assert_eq!(response.status(), status);
    assert_api_headers(&response);
    assert_eq!(
        serde_json::from_str::<Value>(&response.text().await.unwrap()).unwrap(),
        json!({ "code": code })
    );
}

#[tokio::test]
async fn browser_api_preserves_ledger_json_and_distinguishes_identifier_errors() {
    let pass = reported_summary(ATTESTATION, "a/pass", "release", "PASS");
    let fail = reported_summary(
        "00000000-0000-0000-0000-000000000002",
        "z/<reported>",
        "check",
        "FAIL",
    );
    let latest = json!([pass, fail]).to_string();
    let mut attestation = pass;
    attestation["results"] = json!([
        {"id": "z/review", "kind": "review", "status": "WARN"},
        {"id": "a/check", "kind": "check", "status": "NOT_RUN"}
    ]);
    attestation["additional_reported_field"] = json!(["second", "first"]);
    let detail = serde_json::to_string_pretty(&attestation).unwrap();
    let ledger_latest = latest.clone();
    let ledger_detail = detail.clone();
    let site = TestSite::start_with_ledger(
        Router::new()
            .route(API_LATEST, get(move || async { ledger_latest }))
            .route(
                "/v0/attestations/{id}",
                get(move |Path(id): Path<String>| async move {
                    match id.as_str() {
                        ATTESTATION => (StatusCode::OK, ledger_detail),
                        "00000000-0000-0000-0000-000000000099" => {
                            (StatusCode::NOT_FOUND, "synthetic upstream message".into())
                        }
                        _ => panic!("malformed identifier reached the ledger"),
                    }
                }),
            ),
    )
    .await;
    let session = cookie_header(&cookie(&site.sign_in("allowed").await, SESSION).unwrap());
    for (path, body) in [(API_LATEST, latest), (API_DETAIL, detail)] {
        let response = site
            .get(path)
            .header(header::COOKIE, &session)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_api_headers(&response);
        assert_eq!(response.text().await.unwrap(), body);
    }
    for (id, status, code) in [
        ("malformed", StatusCode::BAD_REQUEST, "invalid_identifier"),
        ("%FF", StatusCode::BAD_REQUEST, "invalid_identifier"),
        (
            "00000000-0000-0000-0000-000000000099",
            StatusCode::NOT_FOUND,
            "attestation_not_found",
        ),
    ] {
        let response = site
            .get(&format!("/v0/attestations/{id}"))
            .header(header::COOKIE, &session)
            .send()
            .await
            .unwrap();
        assert_api_error(response, status, code).await;
    }

    let response = site
        .client
        .post(format!("{}{API_LATEST}", site.cockpit.origin))
        .header(header::COOKIE, &session)
        .send()
        .await
        .unwrap();
    assert_api_error(
        response,
        StatusCode::METHOD_NOT_ALLOWED,
        "method_not_allowed",
    )
    .await;
}

#[tokio::test]
async fn browser_api_hides_ledger_failures() {
    let site = TestSite::start_with_ledger(
        Router::new()
            .route(API_LATEST, get(pending::<&'static str>))
            .route(
                API_DETAIL,
                get(|| async { r#"{"upstream":"unexpected shape"}"# }),
            )
            .route(
                "/v0/attestations/00000000-0000-0000-0000-000000000002",
                get(|| async { (StatusCode::BAD_GATEWAY, "synthetic upstream error") }),
            ),
    )
    .await;
    let unreachable = TestSite::start_cockpit(&site.github, "http://127.0.0.1:0", "42").await;
    let session = cookie_header(&cookie(&site.sign_in("allowed").await, SESSION).unwrap());
    let urls = [
        format!("{}{API_LATEST}", unreachable.origin),
        format!("{}{API_DETAIL}", site.cockpit.origin),
        format!(
            "{}/v0/attestations/00000000-0000-0000-0000-000000000002",
            site.cockpit.origin
        ),
        format!("{}{API_LATEST}", site.cockpit.origin),
    ];
    for url in urls {
        let response = site
            .client
            .get(url)
            .header(header::COOKIE, &session)
            .send()
            .await
            .unwrap();
        assert_api_error(
            response,
            StatusCode::SERVICE_UNAVAILABLE,
            "ledger_unavailable",
        )
        .await;
    }
}

#[tokio::test]
async fn browser_api_forwards_the_list_and_its_query() {
    let page = json!([
        reported_summary(
            "00000000-0000-0000-0000-000000000003",
            "b/second",
            "check",
            "PASS"
        ),
        reported_summary(ATTESTATION, "a/first", "release", "FAIL")
    ])
    .to_string();
    let ledger_page = page.clone();
    let site = TestSite::start_with_ledger(Router::new().route(
        API_LIST,
        get(move |RawQuery(query): RawQuery| async move {
            match query.as_deref() {
                None | Some("limit=2&before=00000000-0000-0000-0000-000000000009") => {
                    (StatusCode::OK, ledger_page)
                }
                Some("limit=0") => (StatusCode::BAD_REQUEST, "synthetic upstream message".into()),
                Some(_) => (StatusCode::BAD_GATEWAY, String::new()),
            }
        }),
    ))
    .await;
    let session = cookie_header(&cookie(&site.sign_in("allowed").await, SESSION).unwrap());
    for path in [
        API_LIST,
        "/v0/attestations?limit=2&before=00000000-0000-0000-0000-000000000009",
    ] {
        let response = site
            .get(path)
            .header(header::COOKIE, &session)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_api_headers(&response);
        assert_eq!(response.text().await.unwrap(), page);
    }
    let response = site
        .get("/v0/attestations?limit=0")
        .header(header::COOKIE, &session)
        .send()
        .await
        .unwrap();
    assert_api_error(response, StatusCode::BAD_REQUEST, "invalid_query").await;
    let response = site
        .get("/v0/attestations?limit=3")
        .header(header::COOKIE, &session)
        .send()
        .await
        .unwrap();
    assert_api_error(
        response,
        StatusCode::SERVICE_UNAVAILABLE,
        "ledger_unavailable",
    )
    .await;
}

#[tokio::test]
async fn browser_api_list_hides_an_unreachable_ledger() {
    let site = TestSite::start().await;
    let unreachable = TestSite::start_cockpit(&site.github, "http://127.0.0.1:0", "42").await;
    let session = cookie_header(&cookie(&site.sign_in("allowed").await, SESSION).unwrap());
    let response = site
        .client
        .get(format!("{}{API_LIST}", unreachable.origin))
        .header(header::COOKIE, &session)
        .send()
        .await
        .unwrap();
    assert_api_error(
        response,
        StatusCode::SERVICE_UNAVAILABLE,
        "ledger_unavailable",
    )
    .await;
}
