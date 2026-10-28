<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) { exit; }

// Secrets are removed on uninstall. User role/cap cleanup is also performed.
delete_option( 'pdir_api_key_encrypted' );
delete_option( 'pdir_unlock_password_hash' );
delete_option( 'pdir_session_minutes' );
delete_option( 'pdir_unlock_max_attempts' );
delete_option( 'pdir_unlock_lock_minutes' );
delete_option( 'pdir_openrouter_model' );
delete_option( 'pdir_allowed_roles' );
delete_option('pdir_catalog_state_v1');
delete_metadata( 'user', 0, 'pdir_project_presets_v1', '', true );
delete_metadata( 'user', 0, 'pdir_projects_v1', '', true );
delete_metadata('user',0,'pdir_projects_migrated_v1','',true);
delete_metadata('user',0,'pdir_customers_v1','',true);

if ( function_exists( 'wp_roles' ) ) {
    foreach ( wp_roles()->roles as $role_key => $data ) {
        $role = get_role( $role_key );
        if ( $role ) { $role->remove_cap( 'promt_director_use' ); }
    }
}
remove_role( 'promt_director_user' );
