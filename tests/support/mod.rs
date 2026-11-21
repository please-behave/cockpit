use std::process::Command;

pub fn command() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_cockpit"));
    command.env_remove("COCKPIT_BIND_ADDR");
    command.env_remove("COCKPIT_LEDGER_URL");
    command
}
