// Verifies REQ-0004, REQ-0006 and REQ-0007.

#[path = "support/auth_settings.rs"]
mod support;

use std::{collections::HashMap, time::Duration};

use axum::{
    Router,
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
use tokio::{net::TcpListener, task::JoinHandle};

const STATE: &str = "__Host-cockpit-state";
const SESSION: &str = "__Host-cockpit-session";

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
}

impl TestSite {
    async fn start() -> Self {
        let github = Server::start(
            Router::new()
                .route("/authorize", get(authorize))
                .route("/token", post(exchange))
                .route("/user", get(user)),
        )
        .await;
        let cockpit = Self::start_cockpit(&github, "42, 123").await;
        let client = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        Self {
            client,
            cockpit,
            github,
        }
    }

    async fn start_cockpit(github: &Server, allowed_ids: &str) -> Server {
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
        let ledger = LedgerClient::new("http://127.0.0.1:1").unwrap();
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
async fn only_live_untampered_sessions_grant_access() {
    let site = TestSite::start().await;
    for path in ["/", "/style.css", "/missing", "/sign-out"] {
        let response = site.get(path).send().await.unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(location(&response), "/sign-in");
    }
    let response = site
        .client
        .post(format!("{}/style.css", site.cockpit.origin))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(location(&response), "/sign-in");
    assert_eq!(
        site.get("/sign-in").send().await.unwrap().status(),
        StatusCode::OK
    );

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

    for (path, status, content) in [
        ("/", StatusCode::OK, "Sign out"),
        ("/style.css", StatusCode::OK, "main {"),
        ("/missing", StatusCode::NOT_FOUND, "Page not found"),
    ] {
        let response = site
            .get(path)
            .header(header::COOKIE, &original)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        assert!(response.text().await.unwrap().contains(content));
    }

    let second_instance = TestSite::start_cockpit(&site.github, "42, 123").await;
    let response = site
        .client
        .get(&second_instance.origin)
        .header(header::COOKIE, &original)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let changed_allow_list = TestSite::start_cockpit(&site.github, "123").await;
    let response = site
        .client
        .get(&changed_allow_list.origin)
        .header(header::COOKIE, &original)
        .send()
        .await
        .unwrap();
    assert_eq!(location(&response), "/sign-in");

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
