<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

interface PDIR_Model_Profile {
    public static function key();
    public static function label();
    public static function family();
    public static function version();
    public static function type();
    public static function prompt_strategy();
    public static function capabilities();
    public static function ui_schema();
    public static function sanitize_options( $options );
    public static function build_system_prompt( $context );
}
