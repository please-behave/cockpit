pub const AUTH_SETTINGS: [(&str, &str); 5] = [
    ("COCKPIT_GITHUB_CLIENT_ID", "syntheticclient"),
    ("COCKPIT_GITHUB_CLIENT_SECRET", "syntheticsecret"),
    (
        "COCKPIT_GITHUB_CALLBACK_URL",
        "https://cockpit.example.test/sign-in/callback",
    ),
    (
        "COCKPIT_COOKIE_KEY",
        concat!(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
            "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f"
        ),
    ),
    ("COCKPIT_GITHUB_ALLOWED_IDS", "42, 123"),
];
