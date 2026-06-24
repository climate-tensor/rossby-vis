//! Integration tests for the rossby-vis HTTP server against the current
//! Svelte single-page-application frontend.
//!
//! The legacy `metadata-ui.js` server-rendered UI was removed when the frontend
//! was rewritten as a Svelte SPA (see `frontend/`). The metadata/variable
//! analysis logic now lives in TypeScript and is covered by the frontend's
//! Vitest suite. These Rust tests therefore focus on what the Rust server is
//! actually responsible for: serving the embedded SPA, serving static assets
//! with correct content types, applying security headers, and proxying
//! requests to the Rossby backend (including graceful error behaviour when the
//! backend is unavailable).

use serde_json::Value;
use std::time::Duration;

/// Spawn the server on the given port pointed at `api_url`, and wait until it is
/// accepting connections. Each test uses a unique high port to avoid colliding
/// with a running dev server (typically on 8081) or with sibling tests.
async fn spawn_server(port: u16, api_url: &str) {
    let api_url = api_url.to_string();
    tokio::spawn(async move {
        rossby_vis::run_server(port, api_url)
            .await
            .expect("server should start");
    });

    // Poll the root path until the server responds (or time out).
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/", port);
    for _ in 0..50 {
        if client.get(&url).send().await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("server on port {} did not become ready", port);
}

/// Extract the hashed SPA module bundle path (e.g. `/assets/index-abc123.js`)
/// from the index HTML so the test does not depend on a specific build hash.
fn extract_module_src(html: &str) -> String {
    let marker = "/assets/index-";
    let start = html
        .find(marker)
        .expect("index.html should reference the SPA bundle");
    let rest = &html[start..];
    let end = rest.find('"').expect("module src should be quoted");
    rest[..end].to_string()
}

/// The root path serves the Svelte SPA shell: an HTML document that mounts the
/// app and loads the hashed module bundle. It must NOT reference the removed
/// legacy `metadata-ui.js`.
#[tokio::test]
async fn serves_spa_index() {
    let port = 18171;
    spawn_server(port, "http://127.0.0.1:9").await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://127.0.0.1:{}/", port))
        .send()
        .await
        .expect("should fetch index");

    assert!(response.status().is_success(), "index should return 2xx");
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    assert!(
        content_type.contains("text/html"),
        "index should be served as HTML, got {content_type}"
    );

    let html = response.text().await.unwrap();
    assert!(
        html.contains("id=\"app\""),
        "SPA shell should contain the #app mount point"
    );
    assert!(
        html.contains("/assets/index-") && html.contains(".js"),
        "SPA shell should load the hashed module bundle"
    );
    assert!(
        !html.contains("metadata-ui.js"),
        "legacy metadata-ui.js must not be referenced by the new frontend"
    );
}

/// The hashed module bundle referenced by index.html is served from the
/// embedded assets with a JavaScript content type.
#[tokio::test]
async fn serves_hashed_module_bundle() {
    let port = 18172;
    spawn_server(port, "http://127.0.0.1:9").await;

    let client = reqwest::Client::new();
    let html = client
        .get(format!("http://127.0.0.1:{}/", port))
        .send()
        .await
        .expect("should fetch index")
        .text()
        .await
        .unwrap();

    let bundle = extract_module_src(&html);
    let response = client
        .get(format!("http://127.0.0.1:{}{}", port, bundle))
        .send()
        .await
        .expect("should fetch bundle");

    assert!(
        response.status().is_success(),
        "module bundle {bundle} should be served"
    );
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    assert!(
        content_type.contains("javascript"),
        "bundle should have a JavaScript content type, got {content_type}"
    );
}

/// Unknown static assets return 404 rather than the SPA shell or a panic.
#[tokio::test]
async fn unknown_asset_returns_404() {
    let port = 18173;
    spawn_server(port, "http://127.0.0.1:9").await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "http://127.0.0.1:{}/assets/this-asset-does-not-exist.js",
            port
        ))
        .send()
        .await
        .expect("should get a response");

    assert_eq!(
        response.status(),
        reqwest::StatusCode::NOT_FOUND,
        "missing assets should return 404"
    );
}

/// Security headers middleware is applied to served responses.
#[tokio::test]
async fn applies_security_headers() {
    let port = 18174;
    spawn_server(port, "http://127.0.0.1:9").await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://127.0.0.1:{}/", port))
        .send()
        .await
        .expect("should fetch index");

    let headers = response.headers();
    assert_eq!(
        headers
            .get("x-content-type-options")
            .and_then(|v| v.to_str().ok()),
        Some("nosniff"),
        "responses should set x-content-type-options: nosniff"
    );
    assert_eq!(
        headers.get("x-frame-options").and_then(|v| v.to_str().ok()),
        Some("DENY"),
        "responses should set x-frame-options: DENY"
    );
}

/// When the Rossby backend is unreachable, the metadata proxy returns a clean
/// 502 Bad Gateway with a JSON error body instead of crashing.
#[tokio::test]
async fn proxy_metadata_bad_gateway_when_backend_down() {
    let port = 18175;
    // 127.0.0.1:9 (discard) is not listening, so the proxy request fails fast.
    spawn_server(port, "http://127.0.0.1:9").await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://127.0.0.1:{}/proxy/metadata", port))
        .send()
        .await
        .expect("should get a response from the proxy");

    assert_eq!(
        response.status(),
        reqwest::StatusCode::BAD_GATEWAY,
        "unreachable backend should yield 502"
    );

    let body: Value = response.json().await.expect("error body should be JSON");
    assert!(
        body.get("error").and_then(|v| v.as_str()).is_some(),
        "error response should contain an 'error' field, got {body}"
    );
}

/// The data proxy behaves the same way as the metadata proxy when the backend
/// is unreachable: a 502 with a JSON error body.
#[tokio::test]
async fn proxy_data_bad_gateway_when_backend_down() {
    let port = 18176;
    spawn_server(port, "http://127.0.0.1:9").await;

    let client = reqwest::Client::new();
    let response = client
        .get(format!(
            "http://127.0.0.1:{}/proxy/data?vars=t2m&time=0",
            port
        ))
        .send()
        .await
        .expect("should get a response from the proxy");

    assert_eq!(
        response.status(),
        reqwest::StatusCode::BAD_GATEWAY,
        "unreachable backend should yield 502"
    );

    let body: Value = response.json().await.expect("error body should be JSON");
    assert!(
        body.get("error").and_then(|v| v.as_str()).is_some(),
        "error response should contain an 'error' field, got {body}"
    );
}
