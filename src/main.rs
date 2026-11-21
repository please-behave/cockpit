use std::{env, net::SocketAddr};

use anyhow::{Context, Result, bail};
use cockpit::{ledger::LedgerClient, web};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> std::process::ExitCode {
    tracing_subscriber::fmt()
        .json()
        .with_writer(std::io::stderr)
        .init();

    match run().await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(error = %format_args!("{error:#}"), "Cockpit stopped");
            std::process::ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<()> {
    let ledger_url =
        env::var("COCKPIT_LEDGER_URL").context("COCKPIT_LEDGER_URL must be set to a ledger URL")?;
    let ledger = LedgerClient::new(&ledger_url).context("Invalid COCKPIT_LEDGER_URL")?;

    let bind_addr: SocketAddr = match env::var("COCKPIT_BIND_ADDR") {
        Ok(value) => value
            .parse()
            .map_err(|_| anyhow::anyhow!("COCKPIT_BIND_ADDR must be an IP address and port"))?,
        Err(env::VarError::NotPresent) => SocketAddr::from(([127, 0, 0, 1], 8080)),
        Err(env::VarError::NotUnicode(_)) => {
            bail!("COCKPIT_BIND_ADDR must be an IP address and port");
        }
    };

    let listener = TcpListener::bind(bind_addr)
        .await
        .context("Cannot bind COCKPIT_BIND_ADDR")?;
    tracing::info!(address = %listener.local_addr()?, "Cockpit listening");
    axum::serve(listener, web::router(ledger))
        .await
        .context("HTTP server failed")
}
