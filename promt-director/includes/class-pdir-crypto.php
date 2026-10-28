<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class PDIR_Crypto {
    private static function key() {
        $material = wp_salt( 'auth' ) . '|' . wp_salt( 'secure_auth' ) . '|' . home_url( '/' ) . '|pdir-v1';
        return hash( 'sha256', $material, true );
    }

    public static function encrypt( $plaintext ) {
        $plaintext = (string) $plaintext;
        if ( $plaintext === '' ) { return ''; }
        $key = self::key();

        if ( function_exists( 'sodium_crypto_secretbox' ) ) {
            $nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
            $cipher = sodium_crypto_secretbox( $plaintext, $nonce, $key );
            return 'sodium:' . base64_encode( $nonce . $cipher );
        }

        if ( function_exists( 'openssl_encrypt' ) ) {
            $iv = random_bytes( 12 );
            $tag = '';
            $cipher = openssl_encrypt( $plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'tspg:v1', 16 );
            if ( $cipher === false ) { return new WP_Error( 'pdir_encrypt', 'API-Key konnte nicht verschlüsselt werden.' ); }
            return 'gcm:' . base64_encode( $iv . $tag . $cipher );
        }

        return new WP_Error( 'pdir_crypto_missing', 'Auf diesem Server ist keine geeignete Verschlüsselungsfunktion verfügbar.' );
    }

    public static function decrypt( $payload ) {
        $payload = (string) $payload;
        if ( $payload === '' ) { return new WP_Error( 'pdir_no_key', 'Kein API-Key gespeichert.' ); }
        $key = self::key();

        if ( strpos( $payload, 'sodium:' ) === 0 ) {
            if ( ! function_exists( 'sodium_crypto_secretbox_open' ) ) {
                return new WP_Error( 'pdir_crypto_missing', 'Sodium ist auf diesem Server nicht verfügbar.' );
            }
            $raw = base64_decode( substr( $payload, 7 ), true );
            if ( $raw === false || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
                return new WP_Error( 'pdir_key_corrupt', 'Gespeicherter API-Key ist beschädigt.' );
            }
            $nonce = substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
            $cipher = substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
            $plain = sodium_crypto_secretbox_open( $cipher, $nonce, $key );
            if ( $plain === false ) { return new WP_Error( 'pdir_key_decrypt', 'Gespeicherter API-Key konnte nicht entschlüsselt werden.' ); }
            return $plain;
        }

        if ( strpos( $payload, 'gcm:' ) === 0 ) {
            if ( ! function_exists( 'openssl_decrypt' ) ) {
                return new WP_Error( 'pdir_crypto_missing', 'OpenSSL ist auf diesem Server nicht verfügbar.' );
            }
            $raw = base64_decode( substr( $payload, 4 ), true );
            if ( $raw === false || strlen( $raw ) < 29 ) {
                return new WP_Error( 'pdir_key_corrupt', 'Gespeicherter API-Key ist beschädigt.' );
            }
            $iv = substr( $raw, 0, 12 );
            $tag = substr( $raw, 12, 16 );
            $cipher = substr( $raw, 28 );
            $plain = openssl_decrypt( $cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'tspg:v1' );
            if ( $plain === false ) { return new WP_Error( 'pdir_key_decrypt', 'Gespeicherter API-Key konnte nicht entschlüsselt werden.' ); }
            return $plain;
        }

        return new WP_Error( 'pdir_key_format', 'Unbekanntes API-Key-Format.' );
    }
}
