// Verifies REQ-0001, REQ-0004 and REQ-0005.

mod support;

use std::{
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpListener},
    process::{Child, Stdio},
    sync::mpsc,
    time::Duration,
};

use axum::{body::to_bytes, http::StatusCode, response::IntoResponse};
use cockpit::web::ErrorPage;
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

#[tokio::test]
async fn health_and_protective_headers_work_without_a_responding_ledger() {
    let ledger = TcpListener::bind("127.0.0.1:0").unwrap();
    let mut cockpit = RunningCockpit(
        support::command()
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
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
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
            "/style.css",
            reqwest::Method::GET,
            StatusCode::OK,
            "text/css",
            "main {",
        ),
        (
            "/missing",
            reqwest::Method::GET,
            StatusCode::NOT_FOUND,
            "text/html",
            "Page not found",
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
            "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        );
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
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

#[tokio::test]
async fn templates_escape_hostile_values_in_title_and_body() {
    let hostile = r#"</title><script>alert("x")</script><img src=x onerror='x'>&"#;
    let response = ErrorPage {
        status: StatusCode::BAD_REQUEST,
        title: hostile,
        message: hostile,
    }
    .into_response();
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    let html = std::str::from_utf8(&body).unwrap();

    assert_eq!(html.matches("&#60;/title&#62;").count(), 3);
    assert_eq!(
        html.matches("&#60;script&#62;alert(&#34;x&#34;)").count(),
        3
    );
    assert_eq!(html.matches("onerror=&#39;x&#39;&#62;&#38;").count(), 3);
    assert!(!html.contains("<script"));
    assert!(!html.contains("<img"));
    assert!(html.contains(r#"<link rel="stylesheet" href="/style.css">"#));
}
