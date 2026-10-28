<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Optional, administrator-managed prompt additions. Never replaces the legacy system prompt. */
final class PDIR_Enhancers {
    const OPTION = 'pdir_enhancer_catalog_v1';
    const MAX_ITEMS = 30;
    const MAX_LENGTH = 100000;

    public static function starter() {
        return array(
            'id' => 'faithful_edit_v1',
            'name' => 'Faithful Edit – Kernregeln',
            'text' => "PROMPT ENHANCER — EDITING FIDELITY (supplementary guidance)\n"
                . "Distinguish a requested edit or revision of an existing subject from creating a new scene. For edits and revisions, change the explicitly requested properties decisively and preserve all unrelated aspects, including subject identity, composition and object design. Avoid unintended changes to lighting, color, crop, accessories, quantity and medium unless explicitly requested. Preserve every stated spatial relationship and constraint. Do not invent visual details that are not supported by the supplied text or accessible reference information. If the actual image content is not available to you, never claim to have visually inspected it. Resolve ambiguity only when the intended change is reasonably clear; preserve rather than invent uncertain attributes. For new scene generation, develop only open creative details as permitted by the existing creativity mode; do not impose editing-only preservation rules on a wholly new scene. The existing Prompt Director rules for language, visible text, references, timing, target models, project hierarchy and structured output take precedence. This supplement must not override those rules."
        );
    }

    public static function all() {
        $saved = get_option( self::OPTION, null );
        if ( $saved === null || $saved === false ) {
            // Seed once on first access, without modifying any preexisting setting.
            $saved = array( self::starter() );
            add_option( self::OPTION, $saved, '', false );
        }
        if ( ! is_array( $saved ) ) { return array(); }
        $valid = array();
        foreach ( $saved as $entry ) {
            if ( ! is_array( $entry ) ) { continue; }
            $id = self::clean_id( $entry['id'] ?? '' );
            if ( $id === '' ) { continue; }
            $valid[$id] = array(
                'id' => $id,
                'name' => sanitize_text_field( (string) ( $entry['name'] ?? '' ) ),
                'text' => is_string( $entry['text'] ?? null ) ? $entry['text'] : '',
            );
            if ( count( $valid ) >= self::MAX_ITEMS ) { break; }
        }
        return array_values( $valid );
    }

    public static function choices() {
        return array_map( static function( $item ) {
            return array( 'id' => $item['id'], 'name' => $item['name'] );
        }, self::all() );
    }

    public static function clean_id( $id ) {
        $id = is_scalar($id) ? (string) $id : '';
        return preg_match('/^[a-z0-9_-]{1,60}$/', $id) ? $id : '';
    }

    /** Resolve by identifier on the server: never use client-submitted enhancer body. */
    public static function resolve( $id ) {
        $id = self::clean_id( $id );
        if ( $id === '' ) { return null; }
        foreach ( self::all() as $item ) {
            if ( $item['id'] === $id ) { return $item; }
        }
        return null;
    }

    public static function admin_menu() {
        add_submenu_page('promt-director', 'Prompt Enhancer – Katalog', 'Prompt Enhancer', 'manage_options', 'pdir-enhancers', array(__CLASS__, 'render_admin'));
    }

    private static function redirect($notice) {
        wp_safe_redirect(add_query_arg(array('page' => 'pdir-enhancers', 'pdir_notice' => $notice), admin_url('admin.php')));
        exit;
    }

    public static function save() {
        if ( ! current_user_can('manage_options') ) { wp_die('Keine Berechtigung.', 403); }
        check_admin_referer('pdir_enhancer_save');
        $id = self::clean_id(sanitize_text_field(wp_unslash($_POST['enhancer_id'] ?? '')));
        $name = sanitize_text_field(wp_unslash($_POST['enhancer_name'] ?? ''));
        $content = wp_unslash($_POST['enhancer_text'] ?? '');
        if ( ! is_string($content) || ! is_string($name) ) { self::redirect('invalid'); }
        $content = trim(str_replace("\r\n", "\n", $content));
        if ($name === '' || (function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') > 100 : strlen($name) > 100) || $content === '' || strlen($content) > self::MAX_LENGTH) { self::redirect('invalid'); }
        $catalog = self::all();
        $found = false;
        foreach ($catalog as &$entry) {
            if ($entry['id'] === $id && $id !== '') {
                $entry['name'] = $name;
                $entry['text'] = $content;
                $found = true;
                break;
            }
        }
        unset($entry);
        if (!$found) {
            if ($id !== '') { self::redirect('missing'); } // Prevent silent recreation of deleted entries.
            if (count($catalog) >= self::MAX_ITEMS) { self::redirect('limit'); }
            $id = 'enh_' . str_replace('-', '', wp_generate_uuid4());
            $catalog[] = array('id' => $id, 'name' => $name, 'text' => $content);
        }
        update_option(self::OPTION, $catalog, false);
        self::redirect('saved');
    }

    public static function delete() {
        if ( ! current_user_can('manage_options') ) { wp_die('Keine Berechtigung.', 403); }
        check_admin_referer('pdir_enhancer_delete');
        $id = self::clean_id(sanitize_text_field(wp_unslash($_POST['enhancer_id'] ?? '')));
        $catalog = array_values(array_filter(self::all(), static function($item) use ($id) { return $item['id'] !== $id; }));
        update_option(self::OPTION, $catalog, false);
        self::redirect('deleted');
    }

    public static function render_admin() {
        if ( ! current_user_can('manage_options') ) { return; }
        $catalog = self::all();
        $selected = self::clean_id(sanitize_text_field(wp_unslash($_GET['edit'] ?? '')));
        $item = self::resolve($selected);
        $name = $item['name'] ?? '';
        $content = $item['text'] ?? '';
        $notice = sanitize_key(wp_unslash($_GET['pdir_notice'] ?? ''));
        ?>
        <div class="wrap" style="max-width:1020px">
            <h1>Prompt Director – Prompt-Enhancer-Katalog</h1>
            <p>Hier können mehrere ergänzende Systemanweisungen gespeichert werden. Im Frontend kann jeweils <strong>ein</strong> Enhancer oder <strong>Original (ohne Enhancer)</strong> ausgewählt werden. Der originale Generierungsweg bleibt unangetastet.</p>
            <?php if($notice): ?>
                <div class="notice <?php echo in_array($notice, array('saved','deleted'), true) ? 'notice-success':'notice-error'; ?> is-dismissible"><p><?php echo esc_html(array('saved'=>'Enhancer gespeichert.','deleted'=>'Enhancer gelöscht.','invalid'=>'Bitte einen Namen (max. 100 Zeichen) und Anweisungstext (max. 100.000 Bytes) eintragen.','missing'=>'Der zu bearbeitende Enhancer wurde nicht gefunden.','limit'=>'Maximal 30 Enhancer möglich.')[$notice] ?? 'Aktion konnte nicht abgeschlossen werden.'); ?></p></div>
            <?php endif; ?>
            <h2>Gespeicherte Enhancer</h2>
            <table class="widefat striped"><thead><tr><th>Name</th><th>Aktionen</th></tr></thead><tbody>
            <?php foreach($catalog as $entry): ?>
                <tr><td><strong><?php echo esc_html($entry['name']); ?></strong></td><td style="display:flex;gap:14px;align-items:center">
                    <a href="<?php echo esc_url(add_query_arg(array('page'=>'pdir-enhancers','edit'=>$entry['id']), admin_url('admin.php'))); ?>">Bearbeiten</a>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('Enhancer wirklich löschen? Bereits generierte Prompts bleiben unverändert.');" style="margin:0">
                      <input type="hidden" name="action" value="pdir_enhancer_delete">
                      <input type="hidden" name="enhancer_id" value="<?php echo esc_attr($entry['id']); ?>">
                      <?php wp_nonce_field('pdir_enhancer_delete'); ?>
                      <button type="submit" class="button-link-delete">Löschen</button>
                    </form>
                </td></tr>
            <?php endforeach; ?>
            <?php if (!$catalog): ?><tr><td colspan="2">Noch keine Enhancer gespeichert.</td></tr><?php endif; ?>
            </tbody></table>
            <h2><?php echo $item ? 'Enhancer bearbeiten' : 'Neuen Enhancer erstellen'; ?></h2>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="pdir_enhancer_save">
                <input type="hidden" name="enhancer_id" value="<?php echo esc_attr($item['id'] ?? ''); ?>">
                <?php wp_nonce_field('pdir_enhancer_save'); ?>
                <table class="form-table" role="presentation"><tr><th><label for="pdir_enhancer_name">Name</label></th><td><input id="pdir_enhancer_name" class="regular-text" maxlength="100" required name="enhancer_name" value="<?php echo esc_attr($name); ?>"></td></tr>
                <tr><th><label for="pdir_enhancer_text">Zusätzliche KI-Anweisungen</label></th><td><textarea id="pdir_enhancer_text" name="enhancer_text" rows="17" style="width:100%;font-family:monospace" required><?php echo esc_textarea($content); ?></textarea><p class="description">Nur ergänzende Regeln: Hier keine JSON-Antwortformate, Referenz-Tags, Timing-Syntax oder Spracheinstellungen vorschreiben. Maximal 100.000 Bytes pro Enhancer-Text. Der Original-Modus verwendet diesen Text niemals. Änderungen am gespeicherten Text gelten für künftige Generierungen, nicht rückwirkend für die Historie.</p></td></tr></table>
                <?php submit_button($item ? 'Änderungen speichern' : 'Enhancer speichern'); ?>
                <?php if($item): ?><a class="button button-secondary" href="<?php echo esc_url(add_query_arg(array('page'=>'pdir-enhancers'), admin_url('admin.php'))); ?>">Neuen Enhancer anlegen</a><?php endif; ?>
            </form>
            <p><a href="<?php echo esc_url(add_query_arg('page','promt-director',admin_url('admin.php'))); ?>">Zurück zu den Grundeinstellungen</a></p>
        </div>
        <?php
    }
}
