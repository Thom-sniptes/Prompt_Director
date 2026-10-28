<?php
/**
 * Plugin Name: PromtDirector
 * Description: Sicherer PromtDirector mit serverseitigem OpenRouter API-Key, Passwortfreigabe und zeitlich begrenzten Sitzungen.
 * Version: 3.0.0-Change03.5-OpenRouterStatusFix
 * Author: Thomas Schumacher
 * Text Domain: promt-director
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'PDIR_VERSION', '3.0.0-Change03.5-OpenRouterStatusFix' );
// Optional diagnostic UI: set false to remove the request counter without affecting generation.
if (!defined('PDIR_AI_REQUEST_STATS_ENABLED')) { define('PDIR_AI_REQUEST_STATS_ENABLED', true); }
define( 'PDIR_FILE', __FILE__ );
define( 'PDIR_DIR', plugin_dir_path( __FILE__ ) );
define( 'PDIR_URL', plugin_dir_url( __FILE__ ) );
define( 'PDIR_CAP', 'promt_director_use' );

require_once PDIR_DIR . 'includes/class-pdir-crypto.php';
require_once PDIR_DIR . 'includes/models/interface-pdir-model.php';
require_once PDIR_DIR . 'includes/models/class-pdir-catalog.php';
require_once PDIR_DIR . 'includes/models/class-pdir-model-catalog-profile.php';
require_once PDIR_DIR . 'includes/models/class-pdir-model-registry.php';
require_once PDIR_DIR . 'includes/class-pdir-settings.php';
require_once PDIR_DIR . 'includes/class-pdir-enhancers.php';
require_once PDIR_DIR . 'includes/class-pdir-presets.php';
require_once PDIR_DIR . 'includes/class-pdir-catalog-admin.php';
require_once PDIR_DIR . 'includes/class-pdir-quality.php';
require_once PDIR_DIR . 'includes/class-pdir-timing.php';
require_once PDIR_DIR . 'includes/class-pdir-ai-request-meter.php';
require_once PDIR_DIR . 'includes/class-pdir-semantic.php';
require_once PDIR_DIR . 'includes/class-pdir-rest.php';
require_once PDIR_DIR . 'includes/class-pdir-integration.php';
require_once PDIR_DIR . 'includes/class-pdir-shortcode.php';

final class PDIR_Plugin {
    public static function init() {
        PDIR_Catalog_Admin::init();
        add_action( 'admin_menu', array( 'PDIR_Settings', 'admin_menu' ) );
        add_action( 'admin_menu', array( 'PDIR_Enhancers', 'admin_menu' ) );
        add_action( 'admin_menu', array( 'PDIR_Presets', 'admin_menu' ) );
        add_action( 'admin_post_pdir_preset_save', array( 'PDIR_Presets', 'save' ) );
        add_action( 'admin_post_pdir_preset_delete', array( 'PDIR_Presets', 'delete' ) );
        add_action( 'admin_post_pdir_enhancer_save', array( 'PDIR_Enhancers', 'save' ) );
        add_action( 'admin_post_pdir_enhancer_delete', array( 'PDIR_Enhancers', 'delete' ) );
        add_action( 'admin_post_pdir_save_settings', array( 'PDIR_Settings', 'save_settings' ) );
        add_action( 'admin_post_pdir_refresh_models', array( 'PDIR_Settings', 'refresh_models' ) );
        add_action( 'admin_post_pdir_test_connection', array( 'PDIR_Settings', 'test_connection' ) );
        add_action( 'rest_api_init', array( 'PDIR_REST', 'register_routes' ) );
        add_shortcode( 'promt_director', array( 'PDIR_Shortcode', 'render' ) );
    }

    public static function activate() {
        add_role( 'promt_director_user', 'PromtDirector Benutzer', array(
            'read' => true,
            PDIR_CAP => true,
        ) );

        $admin = get_role( 'administrator' );
        if ( $admin ) { $admin->add_cap( PDIR_CAP ); }

        if ( ! get_option( 'pdir_session_minutes' ) ) {
            update_option( 'pdir_session_minutes', 45, false );
        }
        if ( ! get_option( 'pdir_openrouter_model' ) ) {
            update_option( 'pdir_openrouter_model', 'qwen/qwen-2.5-72b-instruct', false );
        }
        if ( get_option( 'pdir_allowed_roles', null ) === null ) {
            update_option( 'pdir_allowed_roles', array( 'administrator', 'promt_director_user' ), false );
        }
        PDIR_Settings::sync_role_caps( get_option( 'pdir_allowed_roles', array() ) );
    }
}

register_activation_hook( __FILE__, array( 'PDIR_Plugin', 'activate' ) );
add_action( 'plugins_loaded', array( 'PDIR_Plugin', 'init' ) );
