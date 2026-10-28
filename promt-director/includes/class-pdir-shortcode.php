<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

final class PDIR_Shortcode {
    private static function enqueue_assets() {
        wp_register_script('pdir-dialogs',PDIR_URL.'assets/js/dialogs.js',array(),PDIR_VERSION,true);
        wp_enqueue_style('pdir-dialogs',PDIR_URL.'assets/css/dialogs.css',array(),PDIR_VERSION);
        wp_register_style(
            'pdir-app',
            PDIR_URL . 'assets/css/promt-director.css',
            array(),
            PDIR_VERSION
        );
        wp_register_script(
            'pdir-app',
            PDIR_URL . 'assets/js/promt-director.js',
            array('pdir-dialogs'),
            PDIR_VERSION,
            true
        );
        wp_enqueue_style( 'pdir-app' );
        wp_enqueue_script( 'pdir-app' );

        $config = array(
            'restUrl' => esc_url_raw( rest_url( 'promt-director/v1' ) ),
            'nonce' => wp_create_nonce( 'wp_rest' ),
            'version' => PDIR_VERSION,
            'defaultEngine' => PDIR_Settings::default_engine(),
            'enhancerChoices' => PDIR_Enhancers::choices(),
            'aiRequestStatsEnabled' => defined('PDIR_AI_REQUEST_STATS_ENABLED') && PDIR_AI_REQUEST_STATS_ENABLED,
            'referenceDefaults' => array('description' => PDIR_Settings::description_default(), 'format' => PDIR_Settings::format_default()),
            'userId' => get_current_user_id(),
            'dataResetAt' => (string)get_user_meta(get_current_user_id(),'pdir_data_reset_at_v1',true),
            'conflictPolicy' => array(
                'reference' => PDIR_Settings::reference_conflict_block_enabled(),
                'project' => PDIR_Settings::project_conflict_block_enabled(),
                'overrides' => PDIR_Settings::conflict_overrides_enabled(),
                'semantic' => PDIR_Settings::semantic_enabled(),
            ),
            'referencePurposePatterns' => PDIR_Model_Catalog_Profile::reference_purpose_patterns(),
            'referenceFidelityRules' => PDIR_Model_Catalog_Profile::reference_fidelity_rules(),
        );
        wp_add_inline_script(
            'pdir-app',
            'window.PROMTDIRECTOR_CONFIG=' . wp_json_encode( $config ) . ';',
            'before'
        );
    }

    public static function render() {
        if ( ! is_user_logged_in() ) {
            return '';
        }
        if ( ! current_user_can( PDIR_CAP ) ) {
            return '<div class="pdir-access-denied">Keine Berechtigung für den PromtDirector.</div>';
        }

        self::enqueue_assets();
        ob_start();
        include PDIR_DIR . 'templates/app.php';
        return ob_get_clean();
    }
}
