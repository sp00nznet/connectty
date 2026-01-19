package com.connectty.android.data.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.gson.Gson
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Manages encryption/decryption using AES-256-GCM
 * Compatible with the Node.js desktop app's crypto implementation
 */
class CryptoManager {
    companion object {
        private const val ALGORITHM = "AES/GCM/NoPadding"
        private const val KEY_LENGTH = 256
        private const val IV_LENGTH = 16
        private const val TAG_LENGTH = 128 // bits
        private const val SALT_LENGTH = 32
        private const val ITERATIONS = 100000
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val MASTER_KEY_ALIAS = "connectty_master_key"

        private val gson = Gson()
    }

    data class EncryptedData(
        val encrypted: String,
        val iv: String,
        val tag: String,
        val salt: String
    )

    /**
     * Derives a key from a password using PBKDF2
     */
    private fun deriveKey(password: String, salt: ByteArray): SecretKey {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH)
        val tmp = factory.generateSecret(spec)
        return SecretKeySpec(tmp.encoded, "AES")
    }

    /**
     * Encrypts plaintext using AES-256-GCM with a password
     */
    fun encrypt(plaintext: String, password: String): EncryptedData {
        val salt = ByteArray(SALT_LENGTH)
        SecureRandom().nextBytes(salt)

        val key = deriveKey(password, salt)
        val iv = ByteArray(IV_LENGTH)
        SecureRandom().nextBytes(iv)

        val cipher = Cipher.getInstance(ALGORITHM)
        val gcmSpec = GCMParameterSpec(TAG_LENGTH, iv)
        cipher.init(Cipher.ENCRYPT_MODE, key, gcmSpec)

        val plaintextBytes = plaintext.toByteArray(StandardCharsets.UTF_8)
        val ciphertext = cipher.doFinal(plaintextBytes)

        // In GCM mode, the authentication tag is appended to the ciphertext
        // We need to separate them for compatibility with Node.js implementation
        val encryptedDataLength = ciphertext.size - (TAG_LENGTH / 8)
        val encryptedData = ciphertext.copyOfRange(0, encryptedDataLength)
        val tag = ciphertext.copyOfRange(encryptedDataLength, ciphertext.size)

        return EncryptedData(
            encrypted = Base64.encodeToString(encryptedData, Base64.NO_WRAP),
            iv = Base64.encodeToString(iv, Base64.NO_WRAP),
            tag = Base64.encodeToString(tag, Base64.NO_WRAP),
            salt = Base64.encodeToString(salt, Base64.NO_WRAP)
        )
    }

    /**
     * Decrypts ciphertext using AES-256-GCM with a password
     */
    fun decrypt(data: EncryptedData, password: String): String {
        val salt = Base64.decode(data.salt, Base64.NO_WRAP)
        val key = deriveKey(password, salt)
        val iv = Base64.decode(data.iv, Base64.NO_WRAP)
        val tag = Base64.decode(data.tag, Base64.NO_WRAP)
        val encryptedData = Base64.decode(data.encrypted, Base64.NO_WRAP)

        // Concatenate encrypted data and tag for GCM
        val ciphertext = encryptedData + tag

        val cipher = Cipher.getInstance(ALGORITHM)
        val gcmSpec = GCMParameterSpec(TAG_LENGTH, iv)
        cipher.init(Cipher.DECRYPT_MODE, key, gcmSpec)

        val plaintext = cipher.doFinal(ciphertext)
        return String(plaintext, StandardCharsets.UTF_8)
    }

    /**
     * Encrypts data and returns as JSON string
     */
    fun encryptToJson(plaintext: String, password: String): String {
        val encrypted = encrypt(plaintext, password)
        return gson.toJson(encrypted)
    }

    /**
     * Decrypts data from JSON string
     */
    fun decryptFromJson(json: String, password: String): String {
        val data = gson.fromJson(json, EncryptedData::class.java)
        return decrypt(data, password)
    }

    /**
     * Generates a random master key (32 bytes, base64 encoded)
     */
    fun generateMasterKey(): String {
        val key = ByteArray(32)
        SecureRandom().nextBytes(key)
        return Base64.encodeToString(key, Base64.NO_WRAP)
    }

    /**
     * Hashes a password using PBKDF2-HMAC-SHA512
     */
    fun hashPassword(password: String): String {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)

        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512")
        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 512)
        val hash = factory.generateSecret(spec).encoded

        val saltHex = salt.joinToString("") { "%02x".format(it) }
        val hashHex = hash.joinToString("") { "%02x".format(it) }

        return "$saltHex:$hashHex"
    }

    /**
     * Verifies a password against a stored hash
     */
    fun verifyPassword(password: String, storedHash: String): Boolean {
        val parts = storedHash.split(":")
        if (parts.size != 2) return false

        val saltHex = parts[0]
        val hashHex = parts[1]

        val salt = saltHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val storedHashBytes = hashHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512")
        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 512)
        val hash = factory.generateSecret(spec).encoded

        // Constant-time comparison to prevent timing attacks
        if (hash.size != storedHashBytes.size) return false

        var result = 0
        for (i in hash.indices) {
            result = result or (hash[i].toInt() xor storedHashBytes[i].toInt())
        }
        return result == 0
    }
}

/**
 * Manages secure storage using Android Keystore
 * For storing the master encryption key securely
 */
class KeystoreManager {
    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }

    /**
     * Gets or creates a master key in Android Keystore
     */
    fun getOrCreateMasterKey(alias: String = "connectty_master_key"): SecretKey {
        if (keyStore.containsAlias(alias)) {
            return keyStore.getKey(alias, null) as SecretKey
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )

        val keySpec = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(false)
            .build()

        keyGenerator.init(keySpec)
        return keyGenerator.generateKey()
    }

    /**
     * Encrypts data using the Android Keystore key
     */
    fun encryptWithKeystoreKey(data: String, alias: String = "connectty_master_key"): Pair<ByteArray, ByteArray> {
        val key = getOrCreateMasterKey(alias)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)

        val iv = cipher.iv
        val encrypted = cipher.doFinal(data.toByteArray(StandardCharsets.UTF_8))

        return Pair(encrypted, iv)
    }

    /**
     * Decrypts data using the Android Keystore key
     */
    fun decryptWithKeystoreKey(
        encryptedData: ByteArray,
        iv: ByteArray,
        alias: String = "connectty_master_key"
    ): String {
        val key = getOrCreateMasterKey(alias)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, key, spec)

        val decrypted = cipher.doFinal(encryptedData)
        return String(decrypted, StandardCharsets.UTF_8)
    }
}
