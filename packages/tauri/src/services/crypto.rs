//! AES-256-GCM encryption compatible with @connectty/shared/crypto.ts
//!
//! Node.js format: { encrypted: base64, iv: base64(16 bytes), tag: base64(16 bytes), salt: base64(32 bytes) }
//! Key derivation: PBKDF2-HMAC-SHA256, 100,000 iterations, 32-byte key

use aes_gcm::{
    aead::{Aead, KeyInit, generic_array::GenericArray},
    AesGcm, Nonce,
    aes::Aes256,
};
use aes_gcm::aead::consts::U16;
use base64::Engine;
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use serde::{Deserialize, Serialize};

const PBKDF2_ITERATIONS: u32 = 100_000;
const KEY_LENGTH: usize = 32;
const IV_LENGTH: usize = 16;
const SALT_LENGTH: usize = 32;

/// Matches the EncryptedData interface from @connectty/shared/crypto.ts
#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptedData {
    pub encrypted: String,
    pub iv: String,
    pub tag: String,
    pub salt: String,
}

/// Type alias for AES-256-GCM with 16-byte nonce (matching Node.js behavior)
type Aes256Gcm16 = AesGcm<Aes256, U16>;

fn derive_key(password: &str, salt: &[u8]) -> [u8; KEY_LENGTH] {
    let mut key = [0u8; KEY_LENGTH];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

/// Encrypt plaintext, returns EncryptedData compatible with Node.js
pub fn encrypt(plaintext: &str, master_key: &str) -> Result<EncryptedData, String> {
    let b64 = base64::engine::general_purpose::STANDARD;

    let mut salt = [0u8; SALT_LENGTH];
    let mut iv = [0u8; IV_LENGTH];
    getrandom::getrandom(&mut salt).map_err(|e| e.to_string())?;
    getrandom::getrandom(&mut iv).map_err(|e| e.to_string())?;

    let key = derive_key(master_key, &salt);
    let cipher = Aes256Gcm16::new(GenericArray::from_slice(&key));
    let nonce = Nonce::from_slice(&iv);

    let ciphertext_with_tag = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // aes-gcm appends the 16-byte tag to ciphertext
    let tag_start = ciphertext_with_tag.len() - 16;
    let ciphertext = &ciphertext_with_tag[..tag_start];
    let auth_tag = &ciphertext_with_tag[tag_start..];

    Ok(EncryptedData {
        encrypted: b64.encode(ciphertext),
        iv: b64.encode(iv),
        tag: b64.encode(auth_tag),
        salt: b64.encode(salt),
    })
}

/// Decrypt EncryptedData from Node.js format
pub fn decrypt(data: &EncryptedData, master_key: &str) -> Result<String, String> {
    let b64 = base64::engine::general_purpose::STANDARD;

    let salt = b64.decode(&data.salt).map_err(|e| format!("Invalid salt: {}", e))?;
    let iv = b64.decode(&data.iv).map_err(|e| format!("Invalid IV: {}", e))?;
    let auth_tag = b64.decode(&data.tag).map_err(|e| format!("Invalid tag: {}", e))?;
    let ciphertext = b64.decode(&data.encrypted).map_err(|e| format!("Invalid ciphertext: {}", e))?;

    let key = derive_key(master_key, &salt);
    let cipher = Aes256Gcm16::new(GenericArray::from_slice(&key));
    let nonce = Nonce::from_slice(&iv);

    // Reconstruct ciphertext + tag
    let mut combined = ciphertext;
    combined.extend_from_slice(&auth_tag);

    let plaintext = cipher
        .decrypt(nonce, combined.as_ref())
        .map_err(|_| "Decryption failed - key mismatch or corrupted data".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}
