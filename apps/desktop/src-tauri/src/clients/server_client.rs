//! Client for the Blink sync server — the only thing that talks to it (auth today,
//! encrypted task sync later). One public method per endpoint we call; each owns its
//! path + request body and returns the raw response for the service to interpret.
//! Base URL overridable via `BLINK_SERVER_URL`.

use reqwest::Response;
use serde::Serialize;

use crate::core::config::config;

pub struct ServerClient {
    http: reqwest::Client,
}

impl ServerClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    /// `POST /v1/auth/sign-in/email`
    pub async fn sign_in_email(&self, email: &str, password: &str) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/sign-in/email"))
            .json(&SignIn { email, password })
            .send()
            .await
    }

    /// `POST /v1/auth/sign-up/email`
    pub async fn sign_up_email(
        &self,
        email: &str,
        password: &str,
        name: &str,
    ) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/sign-up/email"))
            .json(&SignUp {
                email,
                password,
                name,
            })
            .send()
            .await
    }

    /// `POST /v1/auth/sign-out` (authenticated by the session bearer token).
    pub async fn sign_out(&self, token: &str) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/sign-out"))
            .bearer_auth(token)
            .send()
            .await
    }

    /// `POST /v1/auth/email-otp/send-verification-otp` — (re)send the verification code.
    pub async fn send_verification_otp(&self, email: &str) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/email-otp/send-verification-otp"))
            .json(&SendVerificationOtp {
                email,
                kind: "email-verification",
            })
            .send()
            .await
    }

    /// `POST /v1/auth/email-otp/verify-email` — confirm the account with the code.
    pub async fn verify_email_otp(&self, email: &str, otp: &str) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/email-otp/verify-email"))
            .json(&VerifyEmailOtp { email, otp })
            .send()
            .await
    }

    /// `POST /v1/auth/email-otp/request-password-reset` — email a password-reset code.
    pub async fn request_password_reset(&self, email: &str) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/email-otp/request-password-reset"))
            .json(&RequestPasswordReset { email })
            .send()
            .await
    }

    /// `POST /v1/auth/email-otp/reset-password` — set a new password with the emailed code.
    pub async fn reset_password(
        &self,
        email: &str,
        otp: &str,
        password: &str,
    ) -> reqwest::Result<Response> {
        self.http
            .post(url("v1/auth/email-otp/reset-password"))
            .json(&ResetPassword {
                email,
                otp,
                password,
            })
            .send()
            .await
    }
}

/// Join a path onto the configured server base URL.
fn url(path: &str) -> String {
    format!(
        "{}/{}",
        config().server_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

#[derive(Serialize)]
struct SignIn<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
struct SignUp<'a> {
    email: &'a str,
    password: &'a str,
    name: &'a str,
}

#[derive(Serialize)]
struct SendVerificationOtp<'a> {
    email: &'a str,
    #[serde(rename = "type")]
    kind: &'a str,
}

#[derive(Serialize)]
struct VerifyEmailOtp<'a> {
    email: &'a str,
    otp: &'a str,
}

#[derive(Serialize)]
struct RequestPasswordReset<'a> {
    email: &'a str,
}

#[derive(Serialize)]
struct ResetPassword<'a> {
    email: &'a str,
    otp: &'a str,
    password: &'a str,
}
