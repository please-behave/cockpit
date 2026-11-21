use std::process::Command;

mod auth_settings;
pub use auth_settings::AUTH_SETTINGS;

pub fn command() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_cockpit"));
    command.env_remove("COCKPIT_BIND_ADDR");
    command.env_remove("COCKPIT_LEDGER_URL");
    for (name, _) in AUTH_SETTINGS {
        command.env_remove(name);
    }
    command
}
