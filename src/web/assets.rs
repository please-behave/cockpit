use axum::{
    extract::Path,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "frontend/dist/assets/"]
struct FrontendAssets;

pub(super) async fn not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}

pub(super) async fn get(Path(path): Path<String>) -> Result<Response, StatusCode> {
    let asset = FrontendAssets::get(&path).ok_or(StatusCode::NOT_FOUND)?;
    Ok((
        [
            (header::CONTENT_TYPE, asset.metadata.mimetype()),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        asset.data,
    )
        .into_response())
}
