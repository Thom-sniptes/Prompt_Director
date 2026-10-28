<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class PDIR_Settings {
    const OPT_KEY = 'pdir_api_key_encrypted';
    const OPT_PASSWORD = 'pdir_unlock_password_hash';
    // Configurable password retry lock; existing installations default to 5 attempts / 10 minutes.
    const OPT_UNLOCK_MAX_ATTEMPTS = 'pdir_unlock_max_attempts';
    const OPT_UNLOCK_LOCK_MINUTES = 'pdir_unlock_lock_minutes';
    public static function unlock_max_attempts() {
        $n = (int) get_option( self::OPT_UNLOCK_MAX_ATTEMPTS, 5 );
        return ( $n >= 1 && $n <= 20 ) ? $n : 5;
    }
    public static function unlock_lock_minutes() {
        $n = (int) get_option( self::OPT_UNLOCK_LOCK_MINUTES, 10 );
        return ( $n >= 1 && $n <= 1440 ) ? $n : 10;
    }
    const OPT_REF_DESCRIPTION = 'pdir_default_reference_description';
    const OPT_REF_FORMAT = 'pdir_default_reference_format';
    const OPT_REF_CONFLICT_BLOCK = 'pdir_reference_conflict_block';
    const OPT_PROJECT_CONFLICT_BLOCK = 'pdir_project_conflict_block';
    const OPT_CONFLICT_OVERRIDES = 'pdir_conflict_frontend_overrides';
    const OPT_SEMANTIC_ENABLED = 'pdir_semantic_conflict_enabled';
    const OPT_SEMANTIC_MODE = 'pdir_semantic_conflict_mode';
    const OPT_DEFAULT_ENGINE = 'pdir_default_generation_engine';
    public static function default_engine() { return get_option(self::OPT_DEFAULT_ENGINE, 'direct') === 'standard' ? 'standard' : 'direct'; }
    public static function semantic_mode() { return get_option(self::OPT_SEMANTIC_MODE,'conflicts')==='extended'?'extended':'conflicts'; }
    public static function project_conflict_block_enabled() { return get_option(self::OPT_PROJECT_CONFLICT_BLOCK, '0') === '1'; }
    public static function conflict_overrides_enabled() { return get_option(self::OPT_CONFLICT_OVERRIDES, '1') === '1'; }
    public static function semantic_enabled() { return get_option(self::OPT_SEMANTIC_ENABLED, '0') === '1'; }
    public static function effective_conflict_block($type, $workspace) {
        $base = $type === 'reference' ? self::reference_conflict_block_enabled() : self::project_conflict_block_enabled();
        if (!self::conflict_overrides_enabled() || !is_array($workspace)) return $base;
        $overrides = is_array($workspace['conflict_overrides'] ?? null) ? $workspace['conflict_overrides'] : array();
        $choice = $overrides[$type] ?? 'default';
        if ($choice === 'block') return true;
        if ($choice === 'warn') return false;
        return $base;
    }


    public static function reference_conflict_block_enabled() {
        return get_option( self::OPT_REF_CONFLICT_BLOCK, '1' ) !== '0';
    }

    public static function description_default() {
        $value = get_option( self::OPT_REF_DESCRIPTION, 'reference' );
        return in_array($value, array('reference','description'), true) ? $value : 'reference';
    }
    public static function format_default() {
        $value = get_option( self::OPT_REF_FORMAT, 'combined' );
        return in_array($value, array('combined','inline','mapping'), true) ? $value : 'combined';
    }

    public static function admin_menu() {
        add_menu_page(
            'PromtDirector',
            'PromtDirector',
            'manage_options',
            'promt-director',
            array( __CLASS__, 'render_page' ),
            'dashicons-lock',
            81
        );
    }

    public static function sync_role_caps( $allowed_roles ) {
        $allowed_roles = is_array( $allowed_roles ) ? array_map( 'sanitize_key', $allowed_roles ) : array();
        $allowed_roles[] = 'administrator';
        $allowed_roles = array_unique( $allowed_roles );

        if ( ! function_exists( 'wp_roles' ) ) { return; }
        $roles = wp_roles();
        foreach ( $roles->roles as $role_key => $data ) {
            $role = get_role( $role_key );
            if ( ! $role ) { continue; }
            if ( in_array( $role_key, $allowed_roles, true ) ) {
                $role->add_cap( PDIR_CAP );
            } else {
                $role->remove_cap( PDIR_CAP );
            }
        }
    }

    /** Public OpenRouter model catalogue; cached to avoid repeated remote calls. */
    private static function available_models( $force = false ) {
        $cache_key = 'pdir_openrouter_models_v1';
        $cached = get_transient( $cache_key );
        if ( ! $force && is_array( $cached ) && ! empty( $cached ) ) {
            return $cached;
        }
        if ( ! $force && get_transient( 'pdir_openrouter_models_retry' ) ) {
            return is_array( $cached ) ? $cached : array();
        }
        $response = wp_remote_get( 'https://openrouter.ai/api/v1/models', array(
            'timeout' => 12,
            'redirection' => 0,
            'limit_response_size' => 3000000,
            'headers' => array( 'Accept' => 'application/json' ),
        ) );
        if ( is_wp_error( $response ) || (int) wp_remote_retrieve_response_code( $response ) !== 200 ) {
            set_transient( 'pdir_openrouter_models_retry', 1, 10 * MINUTE_IN_SECONDS );
            return is_array( $cached ) ? $cached : array();
        }
        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        if ( ! is_array( $body ) || ! isset( $body['data'] ) || ! is_array( $body['data'] ) ) {
            set_transient( 'pdir_openrouter_models_retry', 1, 10 * MINUTE_IN_SECONDS );
            return is_array( $cached ) ? $cached : array();
        }
        $models = array();
        foreach ( $body['data'] as $item ) {
            if ( ! is_array( $item ) || empty( $item['id'] ) || ! is_string( $item['id'] ) ) { continue; }
            $id = $item['id'];
            if ( strlen( $id ) > 160 || ! preg_match( '/^[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+$/', $id ) ) { continue; }
            // Exclude image/audio-only output models where the API reports their modalities.
            if ( isset( $item['architecture']['output_modalities'] ) && is_array( $item['architecture']['output_modalities'] )
                && ! in_array( 'text', $item['architecture']['output_modalities'], true ) ) { continue; }
            $name = isset( $item['name'] ) && is_string( $item['name'] ) ? sanitize_text_field( $item['name'] ) : $id;
            $models[$id] = $name;
        }
        if ( empty( $models ) ) {
            set_transient( 'pdir_openrouter_models_retry', 1, 10 * MINUTE_IN_SECONDS );
            return is_array( $cached ) ? $cached : array();
        }
        natcasesort( $models );
        delete_transient( 'pdir_openrouter_models_retry' );
        set_transient( $cache_key, $models, 6 * HOUR_IN_SECONDS );
        return $models;
    }

    public static function refresh_models() {
        if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Keine Berechtigung.', 403 ); }
        check_admin_referer( 'pdir_refresh_models' );
        delete_transient( 'pdir_openrouter_models_retry' );
        delete_transient( 'pdir_openrouter_models_v1' );
        $models = self::available_models( true );
        set_transient( 'pdir_models_notice_' . get_current_user_id(),
            $models ? count( $models ) . ' OpenRouter-Textmodelle geladen.' : 'Die OpenRouter-Modellliste ist aktuell nicht erreichbar. Die manuelle Modell-ID bleibt verwendbar.', 60 );
        wp_safe_redirect( add_query_arg( array( 'page' => 'promt-director', 'pdir_status' => 'models' ), admin_url( 'admin.php' ) ) );
        exit;
    }

    public static function save_settings() {
        if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Keine Berechtigung.', 403 ); }
        check_admin_referer( 'pdir_save_settings' );

        $errors = array();
        $engine = isset($_POST['pdir_default_generation_engine']) ? sanitize_key(wp_unslash($_POST['pdir_default_generation_engine'])) : self::default_engine();
        if (in_array($engine, array('direct','standard'), true)) update_option(self::OPT_DEFAULT_ENGINE, $engine, false);
        else $errors[] = 'Ungültige Standard-Engine.';
        $description_default = isset($_POST['pdir_default_reference_description']) ? sanitize_key(wp_unslash($_POST['pdir_default_reference_description'])) : self::description_default();
        $format_default = isset($_POST['pdir_default_reference_format']) ? sanitize_key(wp_unslash($_POST['pdir_default_reference_format'])) : self::format_default();
        if (in_array($description_default, array('reference','description'), true)) update_option(self::OPT_REF_DESCRIPTION, $description_default, false);
        else $errors[] = 'Ungültiger Standard für What is shown.';
        if (in_array($format_default, array('combined','inline','mapping'), true)) update_option(self::OPT_REF_FORMAT, $format_default, false);
        else $errors[] = 'Ungültiger Standard für Referenzdarstellung.';
        // Checkbox absent means disabled. Default remains enabled for existing installations.
        update_option(self::OPT_REF_CONFLICT_BLOCK, isset($_POST['pdir_reference_conflict_block']) && (string) wp_unslash($_POST['pdir_reference_conflict_block']) === '1' ? '1' : '0', false);
        update_option(self::OPT_PROJECT_CONFLICT_BLOCK, isset($_POST['pdir_project_conflict_block']) ? '1':'0', false);
        update_option(self::OPT_CONFLICT_OVERRIDES, isset($_POST['pdir_conflict_frontend_overrides']) ? '1':'0', false);
        update_option(self::OPT_SEMANTIC_ENABLED, isset($_POST['pdir_semantic_conflict_enabled']) ? '1':'0', false);
        $semantic_mode=isset($_POST['pdir_semantic_conflict_mode'])?sanitize_key(wp_unslash($_POST['pdir_semantic_conflict_mode'])):'conflicts';
        update_option(self::OPT_SEMANTIC_MODE, $semantic_mode==='extended'?'extended':'conflicts', false);
        $request_profile = isset($_POST['pdir_request_profile']) ? sanitize_key(wp_unslash($_POST['pdir_request_profile'])) : get_option('pdir_request_profile', 'legacy');
        if (in_array($request_profile, array('legacy','compact'), true)) update_option('pdir_request_profile', $request_profile, false);
        else $errors[] = 'Ungültiges Request-Profil.';
        $api_key = isset( $_POST['pdir_api_key'] ) ? trim( wp_unslash( $_POST['pdir_api_key'] ) ) : '';
        $password = isset( $_POST['pdir_password'] ) ? (string) wp_unslash( $_POST['pdir_password'] ) : '';
        $password2 = isset( $_POST['pdir_password_confirm'] ) ? (string) wp_unslash( $_POST['pdir_password_confirm'] ) : '';

        // Missing fields (e.g. from an old cached admin form) preserve previous settings.
        $lock_fields = array(
            'pdir_unlock_max_attempts' => array( self::OPT_UNLOCK_MAX_ATTEMPTS, 1, 20, 'Fehlversuche' ),
            'pdir_unlock_lock_minutes' => array( self::OPT_UNLOCK_LOCK_MINUTES, 1, 1440, 'Sperrdauer' ),
        );
        foreach ( $lock_fields as $field => $config ) {
            if ( ! isset( $_POST[$field] ) ) { continue; }
            $raw = $_POST[$field];
            $raw = is_scalar( $raw ) ? trim( (string) wp_unslash( $raw ) ) : '';
            if ( ! preg_match( '/^[0-9]+$/D', $raw ) || (float) $raw < $config[1] || (float) $raw > $config[2] ) {
                $errors[] = 'Ungültiger Wert für ' . $config[3] . ' (erlaubt: ' . $config[1] . ' bis ' . $config[2] . ').';
                continue;
            }
            update_option( $config[0], (int) $raw, false );
        }
        $minutes = isset( $_POST['pdir_session_minutes'] ) ? absint( $_POST['pdir_session_minutes'] ) : 45;
        $model = isset( $_POST['pdir_openrouter_model'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['pdir_openrouter_model'] ) ) ) : '';
        $roles = isset( $_POST['pdir_roles'] ) && is_array( $_POST['pdir_roles'] ) ? array_map( 'sanitize_key', wp_unslash( $_POST['pdir_roles'] ) ) : array();

        if ( $api_key !== '' ) {
            if ( ! preg_match( '/^sk-or-[^\s]{20,500}$/', $api_key ) ) {
                $errors[] = 'Der OpenRouter API-Key hat kein gültiges Format.';
            } else {
                $encrypted = PDIR_Crypto::encrypt( $api_key );
                if ( is_wp_error( $encrypted ) ) {
                    $errors[] = $encrypted->get_error_message();
                } else {
                    update_option( self::OPT_KEY, $encrypted, false );
                }
            }
        }

        if ( $password !== '' || $password2 !== '' ) {
            if ( strlen( $password ) < 9 ) {
                $errors[] = 'Das Freigabe-Passwort muss mindestens 9 Zeichen lang sein.';
            } elseif ( ! hash_equals( $password, $password2 ) ) {
                $errors[] = 'Die beiden Passwortfelder stimmen nicht überein.';
            } else {
                update_option( self::OPT_PASSWORD, wp_hash_password( $password ), false );
            }
        }

        $allowed_minutes = array( 15, 30, 45, 60, 120 );
        if ( ! in_array( $minutes, $allowed_minutes, true ) ) { $minutes = 45; }
        update_option( 'pdir_session_minutes', $minutes, false );

        if ( ! preg_match( '/^[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+$/', $model ) || strlen( $model ) > 160 ) {
            $errors[] = 'Der OpenRouter Modellname ist ungültig.';
        } else {
            update_option( 'pdir_openrouter_model', $model, false );
        }

        $valid_roles = array_keys( wp_roles()->roles );
        $roles = array_values( array_intersect( $roles, $valid_roles ) );
        if ( ! in_array( 'administrator', $roles, true ) ) { $roles[] = 'administrator'; }
        update_option( 'pdir_allowed_roles', $roles, false );
        self::sync_role_caps( $roles );

        $args = array( 'page' => 'promt-director' );
        if ( $errors ) {
            set_transient( 'pdir_admin_errors_' . get_current_user_id(), $errors, 60 );
            $args['pdir_status'] = 'error';
        } else {
            $args['pdir_status'] = 'saved';
        }
        wp_safe_redirect( add_query_arg( $args, admin_url( 'admin.php' ) ) );
        exit;
    }

    public static function test_connection() {
        if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Keine Berechtigung.', 403 ); }
        check_admin_referer( 'pdir_test_connection' );
        $key = PDIR_REST::api_key();
        if ( is_wp_error( $key ) ) {
            self::redirect_test( false, $key->get_error_message() );
        }

        $model = get_option( 'pdir_openrouter_model', 'qwen/qwen-2.5-72b-instruct' );
        $response = wp_remote_post( 'https://openrouter.ai/api/v1/chat/completions', array(
            'timeout' => 20,
            'redirection' => 0,
            'headers' => array(
                'Authorization' => 'Bearer ' . $key,
                'Content-Type' => 'application/json',
                'HTTP-Referer' => home_url( '/' ),
                'X-Title' => 'PromtDirector',
            ),
            'body' => wp_json_encode( array(
                'model' => $model,
                'messages' => array( array( 'role' => 'user', 'content' => 'Reply with OK only.' ) ),
                'temperature' => 0,
                'max_tokens' => 3,
            ) ),
            'data_format' => 'body',
        ) );

        if ( is_wp_error( $response ) ) {
            self::redirect_test( false, $response->get_error_message() );
        }
        $code = (int) wp_remote_retrieve_response_code( $response );
        if ( $code < 200 || $code >= 300 ) {
            self::redirect_test( false, 'OpenRouter antwortete mit HTTP ' . $code . '.' );
        }
        self::redirect_test( true, 'OpenRouter-Verbindung erfolgreich.' );
    }

    private static function redirect_test( $ok, $message ) {
        set_transient( 'pdir_admin_test_' . get_current_user_id(), array( 'ok' => (bool) $ok, 'message' => $message ), 60 );
        wp_safe_redirect( add_query_arg( array( 'page' => 'promt-director', 'pdir_status' => 'test' ), admin_url( 'admin.php' ) ) );
        exit;
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) { return; }
        $has_key = (bool) get_option( self::OPT_KEY );
        $has_password = (bool) get_option( self::OPT_PASSWORD );
        $minutes = (int) get_option( 'pdir_session_minutes', 45 );
        $max_attempts = self::unlock_max_attempts();
        $lock_minutes = self::unlock_lock_minutes();
        $model = get_option( 'pdir_openrouter_model', 'qwen/qwen-2.5-72b-instruct' );
        $models = self::available_models();
        $models_notice = get_transient( 'pdir_models_notice_' . get_current_user_id() );
        delete_transient( 'pdir_models_notice_' . get_current_user_id() );
        $allowed = (array) get_option( 'pdir_allowed_roles', array( 'administrator', 'promt_director_user' ) );
        $errors = get_transient( 'pdir_admin_errors_' . get_current_user_id() );
        delete_transient( 'pdir_admin_errors_' . get_current_user_id() );
        $test = get_transient( 'pdir_admin_test_' . get_current_user_id() );
        delete_transient( 'pdir_admin_test_' . get_current_user_id() );
        ?>
        <div class="wrap">
            <h1>PromtDirector</h1>
            <p>Der OpenRouter API-Key wird ausschließlich serverseitig gespeichert und niemals an den Browser ausgegeben.</p>

            <?php if ( isset( $_GET['pdir_status'] ) && $_GET['pdir_status'] === 'saved' ) : ?>
                <div class="notice notice-success is-dismissible"><p>Einstellungen gespeichert.</p></div>
            <?php endif; ?>
            <?php if ( $errors ) : ?>
                <div class="notice notice-error"><p><?php echo esc_html( implode( ' ', $errors ) ); ?></p></div>
            <?php endif; ?>
            <?php if ( $models_notice ) : ?>
                <div class="notice notice-info is-dismissible"><p><?php echo esc_html( $models_notice ); ?></p></div>
            <?php endif; ?>
            <?php if ( is_array( $test ) ) : ?>
                <div class="notice <?php echo $test['ok'] ? 'notice-success' : 'notice-error'; ?>"><p><?php echo esc_html( $test['message'] ); ?></p></div>
            <?php endif; ?>

            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="max-width:900px">
                <input type="hidden" name="action" value="pdir_save_settings">
                <?php wp_nonce_field( 'pdir_save_settings' ); ?>

                <h2>API-Einstellungen</h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="pdir_api_key">OpenRouter API-Key</label></th>
                        <td>
                            <input type="password" class="regular-text" id="pdir_api_key" name="pdir_api_key" autocomplete="new-password" value="" placeholder="<?php echo $has_key ? 'API-Key ist gespeichert – leer lassen, um ihn beizubehalten' : 'sk-or-…'; ?>">
                            <p class="description">Der Key wird verschlüsselt in WordPress gespeichert. Er wird im Frontend nie ausgegeben.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdir_openrouter_model">OpenRouter-Modell</label></th>
                        <td>
                            <input type="text" class="regular-text" id="pdir_openrouter_model" name="pdir_openrouter_model"
                                value="<?php echo esc_attr( $model ); ?>" list="pdir_openrouter_model_options"
                                autocomplete="off" spellcheck="false" placeholder="Anbieter/Modell-ID">
                            <datalist id="pdir_openrouter_model_options">
                                <?php foreach ( $models as $id => $name ) : ?>
                                    <option value="<?php echo esc_attr( $id ); ?>" label="<?php echo esc_attr( $name ); ?>"></option>
                                <?php endforeach; ?>
                            </datalist>
                            <p class="description">
                                Modellname oder Anbieter eingeben, um die Vorschläge zu durchsuchen. Modell-ID auswählen oder direkt selbst eintragen.
                                <?php if ( $models ) : ?><?php echo esc_html( count( $models ) ); ?> Textmodelle in der Liste.<?php else : ?>OpenRouter-Liste nicht verfügbar; die manuelle Eingabe funktioniert weiterhin.<?php endif; ?>
                                Die Modellverfügbarkeit und Kosten hängen von OpenRouter ab. Die Auswahl wird erst mit „Einstellungen speichern“ aktiv.
                            </p>
                        </td>
                    </tr>
                </table>

                <h2>Generierungs-Engine</h2>
                <table class="form-table" role="presentation"><tr><th scope="row"><label for="pdir_default_generation_engine">Standard-Engine</label></th><td>
                  <select id="pdir_default_generation_engine" name="pdir_default_generation_engine">
                    <option value="direct" <?php selected(self::default_engine(),'direct'); ?>>Direct Generation (empfohlen)</option>
                    <option value="standard" <?php selected(self::default_engine(),'standard'); ?>>Bisherige Engine</option>
                  </select><p class="description">Globale Vorgabe für neue Aufrufe; im Frontend weiterhin umschaltbar.</p>
                </td></tr></table>
                <h2>TECH-04A – OpenRouter-Request (experimentell)</h2>
                <p>Für kontrollierte A/B-Tests. Die bisherige Promptlogik bleibt als Standard erhalten. Die Temperature, das gewählte OpenRouter-Modell und die Projektinhalte werden nicht umgestellt.</p>
                <table class="form-table" role="presentation">
                    <tr><th scope="row"><label for="pdir_request_profile">Systemanweisungen</label></th><td>
                        <select id="pdir_request_profile" name="pdir_request_profile">
                            <option value="legacy" <?php selected(get_option('pdir_request_profile','legacy'),'legacy'); ?>>Bisherige Version (Standard / Vergleichsbasis)</option>
                            <option value="compact" <?php selected(get_option('pdir_request_profile','legacy'),'compact'); ?>>Kompakt (Testmodus TECH-04A)</option>
                        </select>
                        <p class="description">Gilt global für neue Generierungen. Nicht ungeprüft produktiv verwenden. Über „Request Summary“ lässt sich der gesendete Systemtext vergleichen. Rückkehr zur bisherigen Version jederzeit möglich.</p>
                    </td></tr>
                </table>

                <h2>REF-02 – Konflikte zwischen Referenzrolle und Verwendungszweck</h2>
                <table class="form-table" role="presentation">
                    <tr><th scope="row">Generierung bei Konflikten sperren</th><td>
                        <label for="pdir_reference_conflict_block">
                            <input type="checkbox" id="pdir_reference_conflict_block" name="pdir_reference_conflict_block" value="1" <?php checked(self::reference_conflict_block_enabled()); ?>>
                            Sperre aktivieren (empfohlen)
                        </label>
                        <p class="description">Aktiviert: Eindeutig erkannte Widersprüche zwischen Referenzrolle und „Use this reference for“ verhindern die Generierung bis zur Korrektur. Deaktiviert: Dieselben Warnungen bleiben sichtbar; nach ausdrücklicher Bestätigung darf generiert werden. Gilt global für alle Projekte. Standard: aktiviert.</p>
                    </td></tr>
                </table>

                <h2>VAL – Projekt- und Referenzkonflikte</h2>
                <table class="form-table" role="presentation">
                  <tr><th scope="row">Projektkonflikte blockieren</th><td><label><input type="checkbox" name="pdir_project_conflict_block" value="1" <?php checked(self::project_conflict_block_enabled()); ?>> Erkannte eindeutige Projekt-/Kundenvorgaben-Konflikte blockieren</label><p class="description">Standard AUS. Die Regelprüfung bleibt immer aktiv; bei ausgeschalteter Sperre ist eine Bestätigung nötig.</p></td></tr>
                  <tr><th scope="row">Frontend-Overrides</th><td><label><input type="checkbox" name="pdir_conflict_frontend_overrides" value="1" <?php checked(self::conflict_overrides_enabled()); ?>> Projektbezogene Wahl unter „Eingabeprüfung“ erlauben</label><p class="description">Standard AN. Bei AUS gelten ausschließlich die Backend-Sperrwerte.</p></td></tr>
                  <tr><th scope="row">Semantische KI-Konfliktprüfung</th><td><label><input type="checkbox" name="pdir_semantic_conflict_enabled" value="1" <?php checked(self::semantic_enabled()); ?>> Optionale OpenRouter-Prüfung ermöglichen</label><p class="description">Standard AUS. Ein KI-Aufruf erfolgt nur nach explizitem Klick im Frontend, nicht durch Autosave oder Generieren. Es entstehen gegebenenfalls OpenRouter-Kosten. KI-Ergebnisse sind Hinweise und blockieren nicht automatisch. Die PHP-Prüfung interpretiert keine freien Projekttexte mehr als harte Farb- oder Mengenkonflikte.</p></td></tr>
                  <tr><th scope="row"><label for="pdir_semantic_conflict_mode">KI-Prüfmodus</label></th><td>
                    <select id="pdir_semantic_conflict_mode" name="pdir_semantic_conflict_mode">
                      <option value="conflicts" <?php selected(self::semantic_mode(),'conflicts'); ?>>Nur tatsächliche Widersprüche (Standard)</option>
                      <option value="extended" <?php selected(self::semantic_mode(),'extended'); ?>>Erweiterte kreative Plausibilitätsprüfung</option>
                    </select>
                    <p class="description">Im erweiterten Modus werden auch kreative Beobachtungen und Unklarheiten als nicht blockierende KI-Hinweise angezeigt. Die Prüfung wird weiterhin ausschließlich manuell gestartet.</p>
                  </td></tr>
                </table>

                <h2>Referenzen – Standardverhalten</h2>
                <p>Gilt für neue Projekte und Projekte mit „Backend-Standard verwenden“. Bereits gespeicherte individuelle Auswahlen bleiben erhalten.</p>
                <table class="form-table" role="presentation">
                    <tr><th scope="row"><label for="pdir_default_reference_description">„What is shown“ verarbeiten</label></th><td>
                        <select id="pdir_default_reference_description" name="pdir_default_reference_description">
                            <option value="reference" <?php selected(self::description_default(),'reference'); ?>>Referenzgeführt – Beschreibung als Zuordnungskontext</option>
                            <option value="description" <?php selected(self::description_default(),'description'); ?>>Beschreibungsgeführt – beschriebene Merkmale in den Prompt integrieren</option>
                        </select>
                    </td></tr>
                    <tr><th scope="row"><label for="pdir_default_reference_format">Referenz-Einbettung</label></th><td>
                        <select id="pdir_default_reference_format" name="pdir_default_reference_format">
                            <option value="combined" <?php selected(self::format_default(),'combined'); ?>>Kombiniert – Inline + Mapping</option>
                            <option value="inline" <?php selected(self::format_default(),'inline'); ?>>Nur Inline</option>
                            <option value="mapping" <?php selected(self::format_default(),'mapping'); ?>>Nur Mapping</option>
                        </select>
                    </td></tr>
                </table>

                <h2>Zugriff</h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="pdir_password">Freigabe-Passwort</label></th>
                        <td>
                            <input type="password" class="regular-text" id="pdir_password" name="pdir_password" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="<?php echo $has_password ? 'Passwort ist gesetzt – leer lassen zum Beibehalten' : 'Mindestens 9 Zeichen'; ?>">
                            <p><input type="password" class="regular-text" name="pdir_password_confirm" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="Passwort wiederholen"></p>
                            <p class="description">Das Passwort wird nur als WordPress-Passwort-Hash gespeichert.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdir_session_minutes">Freigabedauer</label></th>
                        <td>
                            <select id="pdir_session_minutes" name="pdir_session_minutes">
                                <?php foreach ( array(15,30,45,60,120) as $m ) : ?>
                                    <option value="<?php echo $m; ?>" <?php selected( $minutes, $m ); ?>><?php echo $m; ?> Minuten</option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdir_unlock_max_attempts">Maximale falsche Passwortversuche</label></th>
                        <td>
                            <input type="number" id="pdir_unlock_max_attempts" name="pdir_unlock_max_attempts" min="1" max="20" step="1" value="<?php echo esc_attr( $max_attempts ); ?>" class="small-text" required>
                            <p class="description">Anzahl falscher Eingaben bis zur Sperre (1–20). Standard: 5.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdir_unlock_lock_minutes">Sperrdauer nach Fehlversuchen</label></th>
                        <td>
                            <input type="number" id="pdir_unlock_lock_minutes" name="pdir_unlock_lock_minutes" min="1" max="1440" step="1" value="<?php echo esc_attr( $lock_minutes ); ?>" class="small-text" required>
                            <span>Minuten</span>
                            <p class="description">Zeit ab dem letzten falschen Versuch, der zur Sperre führt (1–1440 Minuten). Standard: 10. Unabhängig von der Freigabedauer oben.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Erlaubte Benutzerrollen</th>
                        <td>
                            <?php foreach ( wp_roles()->roles as $role_key => $role_data ) : ?>
                                <label style="display:block;margin:5px 0">
                                    <input type="checkbox" name="pdir_roles[]" value="<?php echo esc_attr( $role_key ); ?>" <?php checked( in_array( $role_key, $allowed, true ) || $role_key === 'administrator' ); ?> <?php disabled( $role_key === 'administrator' ); ?>>
                                    <?php echo esc_html( translate_user_role( $role_data['name'] ) ); ?><?php echo $role_key === 'administrator' ? ' (immer erlaubt)' : ''; ?>
                                </label>
                            <?php endforeach; ?>
                            <input type="hidden" name="pdir_roles[]" value="administrator">
                        </td>
                    </tr>
                </table>

                <?php submit_button( 'Einstellungen speichern' ); ?>
            </form>

            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="max-width:900px;margin-top:-12px">
                <input type="hidden" name="action" value="pdir_refresh_models">
                <?php wp_nonce_field( 'pdir_refresh_models' ); ?>
                <?php submit_button( 'OpenRouter-Modellliste aktualisieren', 'secondary', 'submit', false ); ?>
                <p class="description">Lädt die Vorschläge erneut von OpenRouter. Nicht gespeicherte Änderungen im Formular darüber gehen dabei verloren.</p>
            </form>

            <hr style="margin:30px 0;max-width:900px">
            <h2>Verbindungstest</h2>
            <p>API-Key: <strong><?php echo $has_key ? 'gespeichert' : 'nicht eingerichtet'; ?></strong> &nbsp;·&nbsp; Freigabe-Passwort: <strong><?php echo $has_password ? 'gesetzt' : 'nicht gesetzt'; ?></strong></p>
            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <input type="hidden" name="action" value="pdir_test_connection">
                <?php wp_nonce_field( 'pdir_test_connection' ); ?>
                <?php if ( $has_key ) : ?>
                    <?php submit_button( 'OpenRouter-Verbindung testen', 'secondary', 'submit', false ); ?>
                <?php else : ?>
                    <button type="button" class="button button-secondary" disabled>OpenRouter-Verbindung testen</button>
                <?php endif; ?>
            </form>

            <hr style="margin:30px 0;max-width:900px">
            <h2>Shortcode</h2>
            <code>[promt_director]</code>
        </div>
        <?php
    }
}
