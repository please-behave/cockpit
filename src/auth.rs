use std::{
    collections::HashSet,
    env,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    extract::{FromRef, Query, Request, State, rejection::QueryRejection},
    http::{HeaderMap, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect, Response},
    routing::get,
};
use axum_extra::extract::cookie::{Cookie, Key, PrivateCookieJar, SameSite};
use oauth2::{
    AuthType, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, EndpointNotSet,
    EndpointSet, HttpRequest, HttpResponse, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl,
    TokenResponse, TokenUrl, basic::BasicClient,
};
use reqwest::Url;
use serde::Deserialize;

const SIGN_IN: &str = "/sign-in";
const CALLBACK: &str = "/sign-in/callback";
const STATE_COOKIE: &str = "__Host-cockpit-state";
const SESSION_COOKIE: &str = "__Host-cockpit-session";
const STATE_AGE: Duration = Duration::from_mins(10);
const SESSION_AGE: Duration = Duration::from_hours(8);

type OAuthClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

pub struct GitHubEndpoints<'a> {
    pub authorize: &'a str,
    pub token: &'a str,
    pub user: &'a str,
}

#[derive(Clone)]
pub struct Auth {
    oauth: OAuthClient,
    http: reqwest::Client,
    user_url: Url,
    key: Key,
    allowed_ids: HashSet<u64>,
}

impl Auth {
    pub fn from_env() -> Result<Self> {
        Self::new(
            &setting("COCKPIT_GITHUB_CLIENT_ID")?,
            &setting("COCKPIT_GITHUB_CLIENT_SECRET")?,
            &setting("COCKPIT_GITHUB_CALLBACK_URL")?,
            &setting("COCKPIT_COOKIE_KEY")?,
            &setting("COCKPIT_GITHUB_ALLOWED_IDS")?,
            GitHubEndpoints {
                authorize: "https://github.com/login/oauth/authorize",
                token: "https://github.com/login/oauth/access_token",
                user: "https://api.github.com/user",
            },
        )
    }

    pub fn new(
        client_id: &str,
        client_secret: &str,
        callback_url: &str,
        cookie_key: &str,
        allowed_ids: &str,
        endpoints: GitHubEndpoints<'_>,
    ) -> Result<Self> {
        ensure!(
            valid_credential(client_id),
            "Invalid COCKPIT_GITHUB_CLIENT_ID"
        );
        ensure!(
            valid_credential(client_secret),
            "Invalid COCKPIT_GITHUB_CLIENT_SECRET"
        );

        let callback_error =
            "COCKPIT_GITHUB_CALLBACK_URL must be an HTTPS URL ending in /sign-in/callback";
        let callback = RedirectUrl::new(callback_url.to_owned())
            .map_err(|_| anyhow::anyhow!(callback_error))?;
        let url = callback.url();
        ensure!(
            url.scheme() == "https"
                && url.host().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.path() == CALLBACK
                && url.query().is_none()
                && url.fragment().is_none(),
            "{callback_error}"
        );

        let key =
            parse_key(cookie_key).context("COCKPIT_COOKIE_KEY must contain 128 hex digits")?;
        let allow_list_error =
            "COCKPIT_GITHUB_ALLOWED_IDS must contain comma-separated positive integer IDs";
        let allowed_ids = allowed_ids
            .split(',')
            .map(|id| {
                let id = id.trim();
                ensure!(
                    !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit()),
                    "{allow_list_error}"
                );
                let id = id
                    .parse::<u64>()
                    .map_err(|_| anyhow::anyhow!(allow_list_error))?;
                ensure!(id > 0, "{allow_list_error}");
                Ok(id)
            })
            .collect::<Result<_>>()?;

        let oauth = BasicClient::new(ClientId::new(client_id.to_owned()))
            .set_client_secret(ClientSecret::new(client_secret.to_owned()))
            .set_auth_type(AuthType::RequestBody)
            .set_auth_uri(AuthUrl::new(endpoints.authorize.to_owned())?)
            .set_token_uri(TokenUrl::new(endpoints.token.to_owned())?)
            .set_redirect_uri(callback);
        let http = reqwest::Client::builder()
            .user_agent(concat!("please-behave-cockpit/", env!("CARGO_PKG_VERSION")))
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .build()
            .context("Cannot initialize the GitHub HTTP client")?;

        Ok(Self {
            oauth,
            http,
            user_url: Url::parse(endpoints.user)?,
            key,
            allowed_ids,
        })
    }

    pub(crate) fn sign_in_routes(&self) -> Router {
        Router::new()
            .route(SIGN_IN, get(sign_in))
            .route("/sign-in/github", get(begin))
            .route(CALLBACK, get(callback))
            .with_state(self.clone())
    }

    pub(crate) fn protect(&self, router: Router) -> Router {
        router
            .merge(
                Router::new()
                    .route("/sign-out", get(sign_out))
                    .with_state(self.clone()),
            )
            .layer(middleware::from_fn_with_state(
                self.clone(),
                require_session,
            ))
    }

    pub(crate) fn has_live_session(&self, jar: &PrivateCookieJar) -> bool {
        jar.get(SESSION_COOKIE)
            .and_then(|cookie| live_value(&cookie)?.parse::<u64>().ok())
            .is_some_and(|id| self.allowed_ids.contains(&id))
    }

    async fn github_id(&self, code: String, verifier: PkceCodeVerifier) -> Result<u64, ()> {
        let oauth_http = |request| exchange(self.http.clone(), request);
        let token = self
            .oauth
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(verifier)
            .request_async(&oauth_http)
            .await
            .map_err(|_| ())?;
        let user = self
            .http
            .get(self.user_url.clone())
            .header("accept", "application/vnd.github+json")
            .bearer_auth(token.access_token().secret())
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|_| ())?
            .json::<GitHubUser>()
            .await
            .map_err(|_| ())?;
        Ok(user.id)
    }
}

async fn exchange(
    http: reqwest::Client,
    request: HttpRequest,
) -> Result<HttpResponse, reqwest::Error> {
    let upstream = http.execute(request.try_into()?).await?;
    let status = upstream.status();
    let headers = upstream.headers().clone();
    let mut response = HttpResponse::new(upstream.bytes().await?.to_vec());
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    Ok(response)
}

impl FromRef<Auth> for Key {
    fn from_ref(auth: &Auth) -> Self {
        auth.key.clone()
    }
}

fn setting(name: &str) -> Result<String> {
    env::var(name).map_err(|_| anyhow::anyhow!("{name} must be set"))
}

fn valid_credential(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

fn parse_key(value: &str) -> Option<Key> {
    if value.len() != 128 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut bytes = [0; 64];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
    }
    Key::try_from(bytes.as_slice()).ok()
}

#[derive(Deserialize)]
struct GitHubUser {
    id: u64,
}

#[derive(Deserialize)]
struct Callback {
    code: String,
    state: String,
}

async fn begin(State(auth): State<Auth>, jar: PrivateCookieJar) -> impl IntoResponse {
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, state) = auth
        .oauth
        .authorize_url(CsrfToken::new_random)
        .set_pkce_challenge(challenge)
        .url();
    let value = format!("{}.{}", state.secret(), verifier.secret());
    let jar = jar.add(expiring_cookie(STATE_COOKIE, &value, STATE_AGE));
    (jar, Redirect::to(url.as_str()))
}

async fn callback(
    State(auth): State<Auth>,
    jar: PrivateCookieJar,
    query: Result<Query<Callback>, QueryRejection>,
) -> impl IntoResponse {
    let verifier = query
        .as_ref()
        .ok()
        .and_then(|Query(query)| verify_state(&jar, &query.state));
    let jar = jar.remove(cookie(STATE_COOKIE, ""));
    let (Ok(Query(query)), Some(verifier)) = (query, verifier) else {
        return (
            jar,
            (StatusCode::BAD_REQUEST, "Invalid sign-in request.").into_response(),
        );
    };
    let Ok(id) = auth.github_id(query.code, verifier).await else {
        tracing::warn!("GitHub sign-in failed");
        return (
            jar,
            (StatusCode::BAD_GATEWAY, "GitHub sign-in failed.").into_response(),
        );
    };
    if !auth.allowed_ids.contains(&id) {
        return (
            jar.remove(cookie(SESSION_COOKIE, "")),
            (
                StatusCode::FORBIDDEN,
                "This GitHub account is not authorized.",
            )
                .into_response(),
        );
    }
    let jar = jar.add(expiring_cookie(
        SESSION_COOKIE,
        &id.to_string(),
        SESSION_AGE,
    ));
    (jar, Redirect::to("/").into_response())
}

fn verify_state(jar: &PrivateCookieJar, returned_state: &str) -> Option<PkceCodeVerifier> {
    let state = jar.get(STATE_COOKIE)?;
    let (state, verifier) = live_value(&state)?.split_once('.')?;
    (CsrfToken::new(state.to_owned()) == CsrfToken::new(returned_state.to_owned()))
        .then(|| PkceCodeVerifier::new(verifier.to_owned()))
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
        Redirect::to(SIGN_IN).into_response()
    }
}

async fn sign_out(method: Method, headers: HeaderMap, jar: PrivateCookieJar) -> Response {
    // The site's CSP blocks forms. Accept the sign-out link only from this origin.
    if method != Method::GET
        || headers
            .get("sec-fetch-site")
            .is_none_or(|value| value != "same-origin")
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let jar = jar
        .remove(cookie(SESSION_COOKIE, ""))
        .remove(cookie(STATE_COOKIE, ""));
    (jar, Redirect::to(SIGN_IN)).into_response()
}

fn cookie(name: &'static str, value: impl Into<String>) -> Cookie<'static> {
    Cookie::build((name, value.into()))
        .path("/")
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .build()
}

fn expiring_cookie(name: &'static str, value: &str, age: Duration) -> Cookie<'static> {
    let expiry = unix_time() + age.as_secs();
    Cookie::build(cookie(name, format!("{expiry}:{value}")))
        .max_age(age.try_into().expect("cookie lifetime fits"))
        .build()
}

fn live_value<'a>(cookie: &'a Cookie<'_>) -> Option<&'a str> {
    let (expiry, value) = cookie.value().split_once(':')?;
    let expiry = expiry.parse::<u64>().ok()?;
    (expiry > unix_time()).then_some(value)
}

fn unix_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time after Unix epoch")
        .as_secs()
}

async fn sign_in() -> Html<&'static str> {
    Html(include_str!("../frontend/dist/sign-in.html"))
}
