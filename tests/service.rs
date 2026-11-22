// Verifies REQ-0001, REQ-0004, REQ-0005, REQ-0008 and REQ-0014.

mod support;

use std::{
    fs,
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpListener},
    path::Path,
    process::{Child, Stdio},
    sync::mpsc,
    time::Duration,
};

use axum::http::StatusCode;
use reqwest::{Client, header};
use serde_json::Value;

struct RunningCockpit(Child);

impl Drop for RunningCockpit {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn startup_rejects_invalid_configuration_with_json_diagnostics() {
    for (ledger_url, bind, setting) in [
        (None, None, "COCKPIT_LEDGER_URL"),
        (
            Some("not a url synthetic-secret"),
            None,
            "COCKPIT_LEDGER_URL",
        ),
        (Some("ftp://example.test"), None, "COCKPIT_LEDGER_URL"),
        (
            Some("https://someone:synthetic-secret@example.test"),
            None,
            "COCKPIT_LEDGER_URL",
        ),
        (
            Some("https://example.test/extra"),
            None,
            "COCKPIT_LEDGER_URL",
        ),
        (
            Some("https://example.test?token=synthetic-secret"),
            None,
            "COCKPIT_LEDGER_URL",
        ),
        (
            Some("http://127.0.0.1:8080"),
            Some("synthetic-secret"),
            "COCKPIT_BIND_ADDR",
        ),
    ] {
        let mut command = support::command();
        command.envs(support::AUTH_SETTINGS);
        if let Some(url) = ledger_url {
            command.env("COCKPIT_LEDGER_URL", url);
        }
        if let Some(addr) = bind {
            command.env("COCKPIT_BIND_ADDR", addr);
        }
        let output = command.output().expect("run cockpit");
        assert!(!output.status.success());
        assert!(output.stdout.is_empty());
        let stderr = String::from_utf8(output.stderr).expect("UTF-8 logs");
        let log: Value = serde_json::from_str(&stderr).expect("JSON log");
        assert_eq!(log["level"], "ERROR");
        assert!(log["fields"]["error"].as_str().unwrap().contains(setting));
        assert!(!stderr.contains("synthetic-secret"));
    }
}

#[test]
fn startup_requires_valid_github_configuration() {
    for (setting, invalid_value) in [
        ("COCKPIT_GITHUB_CLIENT_ID", "bad synthetic-secret"),
        ("COCKPIT_GITHUB_CLIENT_SECRET", "bad synthetic-secret"),
        (
            "COCKPIT_GITHUB_CALLBACK_URL",
            "http://synthetic-secret.example.test/sign-in/callback",
        ),
        ("COCKPIT_COOKIE_KEY", "bad synthetic-secret"),
        ("COCKPIT_GITHUB_ALLOWED_IDS", "42, synthetic-secret"),
        ("COCKPIT_GITHUB_ALLOWED_IDS", ""),
        ("COCKPIT_GITHUB_ALLOWED_IDS", "0"),
        ("COCKPIT_GITHUB_ALLOWED_IDS", "18446744073709551616"),
    ] {
        for value in [None, Some(invalid_value)] {
            let mut command = support::command();
            command
                .env("COCKPIT_LEDGER_URL", "http://127.0.0.1:8080")
                .envs(support::AUTH_SETTINGS);
            match value {
                Some(value) => command.env(setting, value),
                None => command.env_remove(setting),
            };
            let output = command.output().expect("run cockpit");
            assert!(!output.status.success());
            let stderr = String::from_utf8(output.stderr).unwrap();
            let log: Value = serde_json::from_str(&stderr).expect("one startup error");
            assert_eq!(log["level"], "ERROR");
            assert!(log["fields"]["error"].as_str().unwrap().contains(setting));
            assert!(!stderr.contains("synthetic-secret"));
            assert!(!stderr.contains("syntheticsecret"));
        }
    }
}

#[tokio::test]
async fn public_routes_and_protective_headers_work_without_a_responding_ledger() {
    let ledger = TcpListener::bind("127.0.0.1:0").unwrap();
    let mut cockpit = RunningCockpit(
        support::command()
            .envs(support::AUTH_SETTINGS)
            .env(
                "COCKPIT_LEDGER_URL",
                format!("http://{}", ledger.local_addr().unwrap()),
            )
            .env("COCKPIT_BIND_ADDR", "127.0.0.1:0")
            .stderr(Stdio::piped())
            .spawn()
            .expect("start cockpit"),
    );
    let stderr = cockpit.0.stderr.take().unwrap();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        BufReader::new(stderr).read_line(&mut line).unwrap();
        let _ = sender.send(line);
    });
    let line = receiver
        .recv_timeout(Duration::from_secs(10))
        .expect("startup log");
    let log: Value = serde_json::from_str(&line).expect("JSON startup log");
    assert_eq!(log["level"], "INFO");
    let address: SocketAddr = log["fields"]["address"].as_str().unwrap().parse().unwrap();

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    assert_frontend_assets(&client, address).await;

    for (path, method, status, content_type, text) in [
        (
            "/healthz",
            reqwest::Method::GET,
            StatusCode::OK,
            "text/plain",
            "ok\n",
        ),
        (
            "/readyz",
            reqwest::Method::GET,
            StatusCode::OK,
            "text/plain",
            "ok\n",
        ),
        (
            "/missing",
            reqwest::Method::GET,
            StatusCode::SEE_OTHER,
            "",
            "",
        ),
        (
            "/readyz",
            reqwest::Method::POST,
            StatusCode::METHOD_NOT_ALLOWED,
            "",
            "",
        ),
    ] {
        let response = client
            .request(method, format!("http://{address}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        let headers = response.headers();
        assert_eq!(
            headers[header::CONTENT_SECURITY_POLICY],
            "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        );
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
        assert_eq!(headers[header::CACHE_CONTROL], "no-store");
        if !content_type.is_empty() {
            assert!(
                headers[header::CONTENT_TYPE]
                    .to_str()
                    .unwrap()
                    .starts_with(content_type)
            );
        }
        let body = response.text().await.unwrap();
        assert!(body.contains(text));
        assert!(!body.contains("<script"));
    }
}

async fn assert_frontend_assets(client: &Client, address: SocketAddr) {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("frontend/dist");
    let index = fs::read_to_string(directory.join("index.html")).unwrap();
    let (asset_url, _) = index
        .split_once(r#"src="/assets/"#)
        .and_then(|(_, path)| path.split_once('"'))
        .expect("built entry script in index.html");
    let hash = asset_url
        .strip_prefix("index-")
        .and_then(|name| name.strip_suffix(".js"))
        .expect("content-hashed JavaScript name");
    assert!(hash.len() >= 8);

    let url = format!("http://{address}/assets/{asset_url}");
    let response = client.get(&url).send().await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();
    assert!(matches!(
        headers[header::CONTENT_TYPE].to_str().unwrap(),
        "text/javascript" | "application/javascript"
    ));
    assert_eq!(
        headers[header::CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(
        response.bytes().await.unwrap().as_ref(),
        fs::read(directory.join("assets").join(asset_url)).unwrap()
    );

    let response = client.head(url).send().await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()[header::CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert!(response.bytes().await.unwrap().is_empty());

    for path in [
        "/assets",
        "/assets/",
        "/assets/unknown.js",
        "/assets/missing/nested.js",
    ] {
        let response = client
            .get(format!("http://{address}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    }
}
