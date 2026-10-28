<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/** Optional, administrator-managed prompt additions. Never replaces the legacy system prompt. */
final class PDIR_Presets {
    const OPTION = 'pdir_prompt_presets_v1';
    const MAX_ITEMS = 30;
    const MAX_LENGTH = 100000;

    public static function all() {
        $saved = get_option( self::OPTION, array() );
        if ( ! is_array( $saved ) ) { return array(); }
        $valid = array();
        foreach ( $saved as $entry ) {
            if ( ! is_array( $entry ) ) { continue; }
            $id = self::clean_id( $entry['id'] ?? '' );
            if ( $id === '' ) { continue; }
            $valid[$id] = array(
                'id' => $id,
                'name' => sanitize_text_field( (string) ( $entry['name'] ?? '' ) ),
                'type' => self::type($entry['type'] ?? 'positive'),
                'text' => is_string( $entry['text'] ?? null ) ? $entry['text'] : '',
            );
            if ( count( $valid ) >= self::MAX_ITEMS ) { break; }
        }
        return array_values( $valid );
    }

    public static function choices() {
        return array_map( static function( $item ) {
            return array( 'id' => $item['id'], 'name' => $item['name'], 'type' => $item['type'], 'bytes' => strlen($item['text']) );
        }, self::all() );
    }

    public static function type($type) { return $type === 'negative' ? 'negative' : 'positive'; }

    public static function clean_id( $id ) {
        $id = is_scalar($id) ? (string) $id : '';
        return preg_match('/^[a-z0-9_-]{1,60}$/', $id) ? $id : '';
    }

    /** Resolve by identifier on the server: never use client-submitted preset body. */
    public static function resolve( $id ) {
        $id = self::clean_id( $id );
        if ( $id === '' ) { return null; }
        foreach ( self::all() as $item ) {
            if ( $item['id'] === $id ) { return $item; }
        }
        return null;
    }

    /** An internal safe budget; 100 KB may be stored in the catalogue, not all can be rendered. */
    const FINAL_PROMPT_MAX_BYTES = 19000;
    const MIN_GENERATED_BUDGET_BYTES = 6000;

    const NEGATIVE_PROMPT_MAX_BYTES = 4000;
    const NEGATIVE_MIN_GENERATED_BYTES = 1000;

    public static function validate_for_generation( $preset, $kind = 'positive' ) {
        if ( !is_array($preset) || !is_string($preset['text'] ?? null) || trim($preset['text']) === '' ) {
            return new WP_Error('pdir_preset_missing', 'Ausgewähltes Prompt Preset nicht verfügbar.', array('status'=>409));
        }
        $kind=self::type($kind);
        if (self::type($preset['type']??'positive')!==$kind) {
            return new WP_Error('pdir_preset_type','Das ausgewählte Preset gehört zur anderen Prompt-Kategorie.',array('status'=>409));
        }
        if ($kind==='negative' && strlen($preset['text'])+2+self::NEGATIVE_MIN_GENERATED_BYTES>self::NEGATIVE_PROMPT_MAX_BYTES) {
            return new WP_Error('pdir_negative_preset_budget','Negatives Preset zu lang (maximal 2.998 Bytes; 1.000 Bytes bleiben für den negativen Grundprompt).',array('status'=>409));
        }
        if ($kind==='positive' && strlen($preset['text']) + 2 + self::MIN_GENERATED_BUDGET_BYTES > self::FINAL_PROMPT_MAX_BYTES) {
            return new WP_Error('pdir_preset_budget', 'Dieses Preset ist für eine Generierung zu lang. Für Grundprompt und Timing müssen mindestens 6.000 Bytes frei bleiben (maximal 12.998 Bytes Preset). Der Katalogeintrag bleibt erhalten.', array('status'=>409));
        }
        return true;
    }

    /** Returns the persisted literal parts. Timing is always assembled last. */
    public static function assemble( $generated, $snapshot = null, $shot = null, $translated_actions = null ) {
        $generated=trim((string)$generated);
        $content=$generated;
        if (is_array($snapshot) && isset($snapshot['text']) && is_string($snapshot['text']) && $snapshot['text'] !== '') {
            $text=$snapshot['text'];
            $content=(($snapshot['position']??'end')==='start') ? $text."\n\n".$content : $content."\n\n".$text;
        }
        $final_max_bytes = $snapshot ? self::FINAL_PROMPT_MAX_BYTES : 20000;
        if (strlen($content) > $final_max_bytes) {
            return new WP_Error('pdir_preset_too_long','Der Prompt überschreitet das Ausgabe-/Speicherlimit. Nichts wurde abgeschnitten oder gespeichert.',array('status'=>409));
        }
        if (is_array($shot)) {
            // Compute the deterministic timing suffix before validating the complete output.
            $content=PDIR_Timing::append($content,$shot,$translated_actions,false);
        }
        if (strlen($content) > $final_max_bytes) {
            return new WP_Error('pdir_preset_too_long','Endprompt einschließlich Timing überschreitet das Ausgabe-/Speicherlimit. Nichts wurde abgeschnitten oder gespeichert.',array('status'=>409));
        }
        return $content;
    }

    /** Negative prompts are composed after model generation, never silently truncated. */
    public static function assemble_negative($generated, $snapshot = null) {
        $content=trim((string)$generated);
        if (is_array($snapshot) && is_string($snapshot['text']??null) && $snapshot['text']!=='') {
            $text=$snapshot['text'];
            $separator=$content===''?'':", ";
            $content=(($snapshot['position']??'end')==='start') ? $text.$separator.$content : $content.$separator.$text;
        }
        if (strlen($content)>self::NEGATIVE_PROMPT_MAX_BYTES) {
            return new WP_Error('pdir_negative_preset_too_long','Negativer Endprompt überschreitet 4.000 Bytes. Keine gekürzte Version gespeichert.',array('status'=>409));
        }
        return $content;
    }

    /** Strip only a known literal negative preset from a historical endprompt. */
    public static function legacy_negative_generated($entry) {
        if (is_string($entry['generated_negative_prompt']??null)) return $entry['generated_negative_prompt'];
        $value=(string)($entry['negative_prompt']??'');
        $snap=$entry['negative_preset_snapshot']??null;
        if (!is_array($snap) || !is_string($snap['text']??null) || $snap['text']==='') return $value;
        $text=$snap['text'];$sep=', ';
        if (($snap['position']??'end')==='start' && strncmp($value,$text.$sep,strlen($text.$sep))===0) return substr($value,strlen($text.$sep));
        if (($snap['position']??'end')!=='start' && substr($value,-strlen($sep.$text))===$sep.$text) return substr($value,0,-strlen($sep.$text));
        return $value;
    }

    /** Old versions did not store generated_prompt. Peel off the exact known literal preset only. */
    public static function legacy_generated( $entry ) {
        $prompt=(string)($entry['prompt']??'');
        $snapshot=$entry['preset_snapshot']??null;
        if (is_array($snapshot) && is_string($snapshot['text']??null) && $snapshot['text']!=='') {
            $text=$snapshot['text'];
            $start=$text."\n\n";
            $end="\n\n".$text;
            if (($snapshot['position']??'end')==='start' && strncmp($prompt,$start,strlen($start))===0) {
                $prompt=substr($prompt,strlen($start));
            } elseif (($snapshot['position']??'end')!=='start' && substr($prompt,-strlen($end))===$end) {
                $prompt=substr($prompt,0,-strlen($end));
            }
        }
        // Managed timing is removed only when present as a terminal suffix.
        return PDIR_Timing::without_managed_suffix($prompt);
    }

    public static function admin_menu() {
        add_submenu_page('promt-director', 'Prompt Presets – Katalog', 'Prompt Presets', 'manage_options', 'pdir-presets', array(__CLASS__, 'render_admin'));
    }

    private static function redirect($notice) {
        wp_safe_redirect(add_query_arg(array('page' => 'pdir-presets', 'pdir_notice' => $notice), admin_url('admin.php')));
        exit;
    }

    public static function save() {
        if ( ! current_user_can('manage_options') ) { wp_die('Keine Berechtigung.', 403); }
        check_admin_referer('pdir_preset_save');
        $id = self::clean_id(sanitize_text_field(wp_unslash($_POST['preset_id'] ?? '')));
        $name = sanitize_text_field(wp_unslash($_POST['preset_name'] ?? ''));
        $content = wp_unslash($_POST['preset_text'] ?? '');
        $kind = self::type(sanitize_key(wp_unslash($_POST['preset_type'] ?? 'positive')));
        if ( ! is_string($content) || ! is_string($name) ) { self::redirect('invalid'); }
        $content = trim(str_replace("\r\n", "\n", $content));
        if ($name === '' || (function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') > 100 : strlen($name) > 100) || $content === '' || strlen($content) > self::MAX_LENGTH) { self::redirect('invalid'); }
        $catalog = self::all();
        $found = false;
        foreach ($catalog as &$entry) {
            if ($entry['id'] === $id && $id !== '') {
                $entry['name'] = $name;
                $entry['type'] = $kind;
                $entry['text'] = $content;
                $found = true;
                break;
            }
        }
        unset($entry);
        if (!$found) {
            if ($id !== '') { self::redirect('missing'); } // Prevent silent recreation of deleted entries.
            if (count($catalog) >= self::MAX_ITEMS) { self::redirect('limit'); }
            $id = 'pre_' . str_replace('-', '', wp_generate_uuid4());
            $catalog[] = array('id' => $id, 'name' => $name, 'type' => $kind, 'text' => $content);
        }
        update_option(self::OPTION, $catalog, false);
        self::redirect('saved');
    }

    public static function delete() {
        if ( ! current_user_can('manage_options') ) { wp_die('Keine Berechtigung.', 403); }
        check_admin_referer('pdir_preset_delete');
        $id = self::clean_id(sanitize_text_field(wp_unslash($_POST['preset_id'] ?? '')));
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
        $type = $item['type'] ?? 'positive';
        $content = $item['text'] ?? '';
        $notice = sanitize_key(wp_unslash($_GET['pdir_notice'] ?? ''));
        ?>
        <div class="wrap" style="max-width:1020px">
            <h1>Prompt Director – Prompt-Preset-Katalog</h1>
            <p>Hier werden Textbausteine gespeichert, die erst nach der KI-Generierung wortgetreu eingefügt werden. Im Frontend kann unabhängig für den positiven und negativen Prompt jeweils <strong>ein</strong> Preset oder <strong>kein Preset</strong> ausgewählt werden. Die Generierung wird nicht beeinflusst; die nachgelagerte Preset-Konfliktprüfung meldet Widersprüche ohne Korrektur.</p>
            <?php if($notice): ?>
                <div class="notice <?php echo in_array($notice, array('saved','deleted'), true) ? 'notice-success':'notice-error'; ?> is-dismissible"><p><?php echo esc_html(array('saved'=>'Preset gespeichert.','deleted'=>'Preset gelöscht.','invalid'=>'Bitte einen Namen (max. 100 Zeichen) und Anweisungstext (max. 100.000 Bytes) eintragen.','missing'=>'Der zu bearbeitende Preset wurde nicht gefunden.','limit'=>'Maximal 30 Presets möglich.')[$notice] ?? 'Aktion konnte nicht abgeschlossen werden.'); ?></p></div>
            <?php endif; ?>
            <h2>Gespeicherte Presets</h2>
            <table class="widefat striped"><thead><tr><th>Name</th><th>Typ</th><th>Aktionen</th></tr></thead><tbody>
            <?php foreach($catalog as $entry): ?>
                <tr><td><strong><?php echo esc_html($entry['name']); ?></strong><br><small><?php echo esc_html(number_format_i18n(strlen($entry['text']))); ?> Bytes<?php if(strlen($entry['text'])>($entry['type']==='negative'?2998:12998)): ?> · Für Generierung zu lang<?php endif; ?></small></td><td><?php echo $entry['type']==='negative'?'Negativ':'Positiv'; ?></td><td style="display:flex;gap:14px;align-items:center">
                    <a href="<?php echo esc_url(add_query_arg(array('page'=>'pdir-presets','edit'=>$entry['id']), admin_url('admin.php'))); ?>">Bearbeiten</a>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('Preset wirklich löschen? Bereits generierte Prompts bleiben unverändert.');" style="margin:0">
                      <input type="hidden" name="action" value="pdir_preset_delete">
                      <input type="hidden" name="preset_id" value="<?php echo esc_attr($entry['id']); ?>">
                      <?php wp_nonce_field('pdir_preset_delete'); ?>
                      <button type="submit" class="button-link-delete">Löschen</button>
                    </form>
                </td></tr>
            <?php endforeach; ?>
            <?php if (!$catalog): ?><tr><td colspan="3">Noch keine Presets gespeichert.</td></tr><?php endif; ?>
            </tbody></table>
            <h2><?php echo $item ? 'Preset bearbeiten' : 'Neues Preset erstellen'; ?></h2>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="pdir_preset_save">
                <input type="hidden" name="preset_id" value="<?php echo esc_attr($item['id'] ?? ''); ?>">
                <?php wp_nonce_field('pdir_preset_save'); ?>
                <table class="form-table" role="presentation"><tr><th><label for="pdir_preset_name">Name</label></th><td><input id="pdir_preset_name" class="regular-text" maxlength="100" required name="preset_name" value="<?php echo esc_attr($name); ?>"></td></tr>
                <tr><th><label for="pdir_preset_type">Prompt-Typ</label></th><td><select id="pdir_preset_type" name="preset_type"><option value="positive" <?php selected($type,'positive'); ?>>Positiver Prompt</option><option value="negative" <?php selected($type,'negative'); ?>>Negativer Prompt</option></select><p class="description">Bestehende Presets werden automatisch als positiv behandelt. Eine Typänderung beeinflusst historische Versionen nicht.</p></td></tr>
                <tr><th><label for="pdir_preset_text">Preset-Text</label></th><td><textarea id="pdir_preset_text" name="preset_text" rows="17" style="width:100%;font-family:monospace" required><?php echo esc_textarea($content); ?></textarea><p class="description">Maximal 100.000 Bytes im Katalog. Positiv: maximal 12.998 Bytes für das Preset, 19.000 Bytes Endprompt. Negativ: maximal 2.998 Bytes für das Preset, 4.000 Bytes Endprompt. Überschreitungen führen zu einer Fehlermeldung, ohne Abschneiden. Bei deaktiviertem Preset wird dieser Text nicht verwendet. Änderungen am gespeicherten Text gelten für künftige Einfügungen, nicht rückwirkend für die Historie.</p></td></tr></table>
                <?php submit_button($item ? 'Änderungen speichern' : 'Preset speichern'); ?>
                <?php if($item): ?><a class="button button-secondary" href="<?php echo esc_url(add_query_arg(array('page'=>'pdir-presets'), admin_url('admin.php'))); ?>">Neues Preset anlegen</a><?php endif; ?>
            </form>
            <p><a href="<?php echo esc_url(add_query_arg('page','promt-director',admin_url('admin.php'))); ?>">Zurück zu den Grundeinstellungen</a></p>
        </div>
        <?php
    }
}
