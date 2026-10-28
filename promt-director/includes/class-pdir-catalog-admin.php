<?php
if (!defined('ABSPATH')) { exit; }
final class PDIR_Catalog_Admin {
    public static function init() {
        add_action('admin_menu',array(__CLASS__,'menu'),20);
        add_action('admin_post_pdir_catalog_action',array(__CLASS__,'handle'));
    }
    public static function menu() { add_submenu_page('promt-director','Modellkatalog','Modellkatalog','manage_options','promt-director-models',array(__CLASS__,'render')); }
    private static function url($args=array()) { return add_query_arg($args,admin_url('admin.php?page=promt-director-models')); }
    private static function json($value) { return wp_json_encode($value,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); }
    private static function notice($message,$error=false) {
        set_transient('pdir_catalog_notice_'.get_current_user_id(),array('message'=>$message,'error'=>$error),60);
    }
    public static function template() {
        return array('key'=>'new_model','label'=>'Neues Modell','family'=>'new-family','version'=>'generic','profile_version'=>'1.0.0','type'=>'image','enabled'=>true,'review_status'=>'custom','reviewed_on'=>'','review_interval_days'=>90,'sources'=>array(),'review_note'=>'Eigenes Profil; technische Angaben bitte anhand der Dokumentation prüfen.','prompt_strategy'=>'catalog','prompt_rules'=>'Write a precise natural-language creative brief. Preserve all explicit user details.','capabilities'=>array('t2i'=>true,'video'=>false,'negative_prompt'=>false,'image_reference_guidance'=>true,'max_reference_guidance'=>8,'max_reference_images'=>0),'ui_schema'=>array(array('key'=>'mode','label'=>'Workflow','type'=>'select','default'=>'t2i','options'=>array('t2i'=>'Text → Bild'))),'workflows'=>array('t2i'=>array('label'=>'Text → Bild','prompt_rules'=>'Describe subject, scene, composition, lighting and exact visible text.','min_images'=>0,'max_images'=>0,'min_videos'=>0,'requires_first_last'=>false,'native_image_kinds'=>array('image'),'forced_options'=>array())),'option_rules'=>array(),'reference_support'=>array('note'=>'Referenzen werden nur als Text beschrieben.'));
    }
    private static function input($key) { return isset($_POST[$key]) && is_string($_POST[$key]) ? wp_unslash($_POST[$key]) : ''; }
    private static function profile_from_form() {
        $p=array();
        foreach(array('key','label','family','version','profile_version','type','review_status','reviewed_on','review_note','prompt_rules') as $key){$p[$key]=self::input($key);}
        $interval=self::input('review_interval_days');
        $p['review_interval_days']=preg_match('/^\d+$/D',$interval)?(int)$interval:0;
        $p['enabled']=self::input('enabled')==='1';$p['prompt_strategy']='catalog';
        $sources=array();foreach(preg_split('/\r?\n/',trim(self::input('sources'))) as $line){$line=trim($line);if($line===''){continue;} $parts=explode('|',$line,2);$sources[]=array('url'=>trim($parts[0]),'title'=>isset($parts[1])?trim($parts[1]):trim($parts[0]));}$p['sources']=$sources;
        foreach(array('capabilities','ui_schema','workflows','option_rules','reference_support') as $key){$raw=self::input($key);if(strlen($raw)>250000){return PDIR_Catalog::fail('JSON-Feld zu groß.');}$value=json_decode($raw,true,32);if(json_last_error()!==JSON_ERROR_NONE){return PDIR_Catalog::fail('Ungültiges JSON in '.$key.': '.json_last_error_msg());}$p[$key]=$value;}
        return PDIR_Catalog::validate_profile($p);
    }
    public static function check_update($catalog) {
        $state=PDIR_Catalog::state();$base=$state['imported']?:PDIR_Catalog::bundled();if(is_wp_error($base)){return $base;}
        if(version_compare($catalog['catalog_version'],$base['catalog_version'],'<=')){return PDIR_Catalog::fail('Import benötigt eine höhere Katalogversion. Für ältere Fassungen die Wiederherstellung verwenden.');}
        $old=array();foreach($base['profiles'] as $p){$old[$p['key']]=$p;}
        foreach($catalog['profiles'] as $p){if(isset($old[$p['key']]) && $old[$p['key']]!==$p && version_compare($p['profile_version'],$old[$p['key']]['profile_version'],'<=')){return PDIR_Catalog::fail('Geändertes Profil benötigt eine höhere Profilversion: '.$p['key']);}}
        return true;
    }
    public static function handle() {
        if(!current_user_can('manage_options')){wp_die('Keine Berechtigung.',403);}
        check_admin_referer('pdir_catalog_action');$op=self::input('op');$expected=(int)self::input('revision');$result=null;$redirect=array();
        if($op==='export') {
            $state=PDIR_Catalog::state();$base=$state['imported']?:PDIR_Catalog::bundled();if(is_wp_error($base)){wp_die(esc_html($base->get_error_message()));}
            $profiles=array();foreach(PDIR_Catalog::profiles(true) as $p){unset($p['origin']);$profiles[]=$p;}
            nocache_headers();header('Content-Type: application/json; charset=utf-8');header('Content-Disposition: attachment; filename="PromtDirector-models.json"');echo self::json(array('schema_version'=>1,'catalog_version'=>$base['catalog_version'],'profiles'=>$profiles));exit;
        } elseif($op==='save') {
            $profile=self::profile_from_form();
            if(is_wp_error($profile)){$result=$profile;}
            else {
                $edit_key=self::input('edit_key');$copy=self::input('copy')==='1';$profiles=PDIR_Catalog::profiles(true);
                if($edit_key!=='' && !$copy && $edit_key!==$profile['key']){$result=PDIR_Catalog::fail('Die ID eines bestehenden Profils ist unveränderlich. Bitte als neues Profil kopieren.');}
                elseif(($edit_key===''||$copy) && isset($profiles[$profile['key']])){$result=PDIR_Catalog::fail('Profil-ID existiert bereits. Für eine Kopie eine neue ID verwenden.');}
                elseif(isset($profiles[$profile['key']]) && version_compare($profile['profile_version'],$profiles[$profile['key']]['profile_version'],'<=')){$result=PDIR_Catalog::fail('Bitte eine höhere Profilversion vergeben, zum Beispiel 1.0.1.');}
                else {$result=PDIR_Catalog::mutate($expected,function($state)use($profile){$state['custom'][$profile['key']]=$profile;return $state;});$redirect=array('edit'=>$profile['key']);}
            }
        } elseif($op==='remove_override') {
            $key=self::input('key');$result=PDIR_Catalog::mutate($expected,function($state)use($key){if(!isset($state['custom'][$key])){return PDIR_Catalog::fail('Kein eigenes Profil vorhanden.');}unset($state['custom'][$key]);return $state;});
        } elseif($op==='preview') {
            $file=$_FILES['catalog']??array();
            if(($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK || ($file['size']??0)>2*1024*1024 || !is_string($file['tmp_name']??null) || !is_uploaded_file($file['tmp_name'])){$result=PDIR_Catalog::fail('Bitte eine JSON-Datei bis 2 MB hochladen.');}
            else {
                $raw=file_get_contents($file['tmp_name']);$catalog=PDIR_Catalog::validate_catalog(json_decode($raw,true,32));
                if(is_wp_error($catalog)){$result=$catalog;} else {
                    $check=self::check_update($catalog);
                    if(is_wp_error($check)){$result=$check;}else{
                        $token=wp_generate_password(24,false,false);$state=PDIR_Catalog::state();
                        set_transient('pdir_catalog_preview_'.get_current_user_id().'_'.$token,array('catalog'=>$catalog,'revision'=>$state['revision']),30*MINUTE_IN_SECONDS);
                        $redirect=array('preview'=>$token);$result=true;
                    }
                }
            }
        } elseif($op==='apply') {
            $token=self::input('token');$preview=preg_match('/^[A-Za-z0-9]{24}$/D',$token)?get_transient('pdir_catalog_preview_'.get_current_user_id().'_'.$token):false;
            if(!$preview || (int)$preview['revision']!==$expected){$result=PDIR_Catalog::fail('Importvorschau abgelaufen oder ungültig. Bitte erneut prüfen.');}
            else {
                $catalog=PDIR_Catalog::validate_catalog($preview['catalog']);$check=is_wp_error($catalog)?$catalog:self::check_update($catalog);
                if(is_wp_error($check)){$result=$check;}else{$result=PDIR_Catalog::mutate($expected,function($state)use($catalog){$state['imported']=$catalog;return $state;});if(!is_wp_error($result)){delete_transient('pdir_catalog_preview_'.get_current_user_id().'_'.$token);}}
            }
        } elseif($op==='restore') {
            $index=(int)self::input('backup');$result=PDIR_Catalog::mutate($expected,function($state)use($index){if(!isset($state['backups'][$index])){return PDIR_Catalog::fail('Sicherung nicht vorhanden.');}$b=$state['backups'][$index];$state['imported']=$b['imported'];$state['custom']=$b['custom'];return $state;});
        } else {$result=PDIR_Catalog::fail('Unbekannte Aktion.');}
        if(is_wp_error($result)){
            if($op==='save'){ $draft=array();foreach(array('edit_key','copy','key','label','family','version','profile_version','type','enabled','review_status','reviewed_on','review_interval_days','review_note','prompt_rules','sources','capabilities','ui_schema','workflows','option_rules','reference_support') as $key){$draft[$key]=substr(self::input($key),0,250000);}set_transient('pdir_catalog_draft_'.get_current_user_id(),$draft,30*MINUTE_IN_SECONDS);$redirect=array('draft'=>1); }
            self::notice($result->get_error_message(),true);
        }elseif($op!=='preview'){self::notice('Modellkatalog gespeichert. Eigene Profile bleiben bei Katalogimporten geschützt.');}
        wp_safe_redirect(self::url($redirect));exit;
    }
    private static function form_start($op,$revision,$multipart=false) {
        echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"'.($multipart?' enctype="multipart/form-data"':'').'>';
        echo '<input type="hidden" name="action" value="pdir_catalog_action"><input type="hidden" name="op" value="'.esc_attr($op).'"><input type="hidden" name="revision" value="'.(int)$revision.'">';wp_nonce_field('pdir_catalog_action');
    }
    public static function render() {
        if(!current_user_can('manage_options')){return;}$state=PDIR_Catalog::state();$profiles=PDIR_Catalog::profiles(true);$base=$state['imported']?:PDIR_Catalog::bundled();
        $edit=isset($_GET['edit'])&&is_string($_GET['edit'])?sanitize_key(wp_unslash($_GET['edit'])):'';$copy=isset($_GET['copy']);$profile=$profiles[$edit]??self::template();unset($profile['origin']);if($copy){$profile['key']='new_model';$profile['label'].=' – Kopie';$profile['profile_version']='1.0.0';$profile['review_status']='custom';}
        $draft=isset($_GET['draft'])?get_transient('pdir_catalog_draft_'.get_current_user_id()):false;
        if($draft){$edit=$draft['edit_key'];$copy=$draft['copy']==='1';foreach(array('key','label','family','version','profile_version','type','review_status','reviewed_on','review_note','prompt_rules') as $key){$profile[$key]=$draft[$key];}$profile['enabled']=$draft['enabled']==='1';}
        echo '<div class="wrap"><h1>PromtDirector · Modellkatalog</h1><p>Familie → Modellversion → Workflow. Katalogregeln sind Daten; zum Ergänzen eines Modells ist keine PHP-Änderung erforderlich.</p>';
        $notice=get_transient('pdir_catalog_notice_'.get_current_user_id());delete_transient('pdir_catalog_notice_'.get_current_user_id());if($notice){echo '<div class="notice '.($notice['error']?'notice-error':'notice-success').'"><p>'.esc_html($notice['message']).'</p></div>';}
        if(is_wp_error($base)){echo '<div class="notice notice-error"><p>'.esc_html($base->get_error_message()).'</p></div></div>';return;}
        echo '<p>Katalogversion <strong>'.esc_html($base['catalog_version']).'</strong> · '.count($profiles).' Profile · Verwaltungsstand '.(int)$state['revision'].'</p><p>„Geprüft“ dokumentiert deine Prüfung anhand der Quellen. Der Import prüft Datenstruktur und Regeln, bestätigt aber keine Herstellerangaben.</p>';
        $token=isset($_GET['preview'])&&is_string($_GET['preview'])?wp_unslash($_GET['preview']):'';
        $preview=preg_match('/^[A-Za-z0-9]{24}$/D',$token)?get_transient('pdir_catalog_preview_'.get_current_user_id().'_'.$token):false;
        if($preview){$diff=PDIR_Catalog::diff($preview['catalog']);echo '<div class="notice notice-info"><h2>Importvorschau · '.esc_html($preview['catalog']['catalog_version']).'</h2>';foreach(array('added'=>'Neu','changed'=>'Geändert','removed'=>'Entfernt','protected'=>'Eigene Profile bleiben geschützt') as $k=>$label){echo '<p><strong>'.esc_html($label).':</strong> '.esc_html(implode(', ',$diff[$k])?:'Keine').'</p>';}
            echo '<details><summary>Vollständigen geprüften Import ansehen</summary><pre style="max-height:420px;overflow:auto;white-space:pre-wrap">'.esc_html(self::json($preview['catalog'])).'</pre></details>';
            self::form_start('apply',$preview['revision']);echo '<input type="hidden" name="token" value="'.esc_attr($token).'">';submit_button('Geprüften Katalog übernehmen','primary');echo '</form></div>';}
        echo '<h2>Profile</h2><p><a class="button" href="'.esc_url(self::url()).'">Neues Profil</a></p><table class="widefat striped"><thead><tr><th>Modell</th><th>Familie / Version</th><th>Workflows</th><th>Prüfung / Profilversion</th><th>Aktionen</th></tr></thead><tbody>';
        $status_labels=array('verified'=>'Geprüft','unverified'=>'Ungeprüft','generic'=>'Generisch','custom'=>'Eigenes Profil');
        foreach($profiles as $key=>$p){echo '<tr><td>'.esc_html($p['label']).(!$p['enabled']?' (deaktiviert)':'').'<br><code>'.esc_html($key).'</code></td><td>'.esc_html($p['family'].' / '.$p['version']).'</td><td>'.esc_html(implode(', ',array_column($p['workflows'],'label'))).'</td><td>'.esc_html($status_labels[$p['review_status']].' / '.$p['profile_version']).'<br>'.esc_html((!$p['reviewed_on'] || gmdate('Y-m-d',strtotime($p['reviewed_on'].' UTC')+($p['review_interval_days']??90)*86400)<=gmdate('Y-m-d')?'⚠ Prüfung fällig · ':'').($p['reviewed_on']?:'Kein Prüfdatum').' · Nächste Prüfung: '.($p['reviewed_on']?gmdate('Y-m-d',strtotime($p['reviewed_on'].' UTC')+($p['review_interval_days']??90)*86400):'jetzt')).'</td><td><a href="'.esc_url(self::url(array('edit'=>$key))).'">Bearbeiten</a> · <a href="'.esc_url(self::url(array('edit'=>$key,'copy'=>1))).'">Kopieren</a>'.(isset($state['custom'][$key])?' · Eigenes Profil':'').'</td></tr>';}
        echo '</tbody></table><h2>'.($edit&&!$copy?'Profil bearbeiten':'Neues Profil / Kopie').'</h2><p>Für Bearbeitungen eine höhere Profilversion vergeben. Eigene Anpassungen ersetzen nur dieses Profil und bleiben von Katalogupdates unberührt.</p>';
        self::form_start('save',$state['revision']);echo '<input type="hidden" name="edit_key" value="'.esc_attr($edit).'"><input type="hidden" name="copy" value="'.($copy?'1':'0').'"><table class="form-table">';
        $labels=array('key'=>'Profil-ID (klein, ohne Leerzeichen)','label'=>'Anzeigename','family'=>'Modellfamilie','version'=>'Konkrete Modellversion (oder generic)','profile_version'=>'Profilversion (z. B. 1.0.1)','reviewed_on'=>'Prüfdatum (JJJJ-MM-TT)');
        foreach($labels as $key=>$label){echo '<tr><th><label for="catalog_'.$key.'">'.esc_html($label).'</label></th><td><input class="regular-text" id="catalog_'.$key.'" name="'.$key.'" value="'.esc_attr($profile[$key]).'"'.($key==='key'&&$edit&&!$copy?' readonly':'').'></td></tr>';}
        echo '<tr><th><label for="catalog_review_interval_days">Prüfintervall in Tagen</label></th><td><input id="catalog_review_interval_days" name="review_interval_days" type="number" min="7" max="365" value="'.esc_attr($draft ? ($draft['review_interval_days']??90) : ($profile['review_interval_days']??90)).'"><p>Fälligkeit wird angezeigt; Updates weiterhin per Importvorschau prüfen und übernehmen.</p></td></tr>';
        echo '<tr><th>Ausgabetyp</th><td><select name="type">';foreach(array('image'=>'Bild','video'=>'Video') as $v=>$label){echo '<option value="'.$v.'" '.selected($profile['type'],$v,false).'>'.$label.'</option>';}echo '</select></td></tr><tr><th>Prüfstatus</th><td><select name="review_status">';foreach($status_labels as $v=>$label){echo '<option value="'.$v.'" '.selected($profile['review_status'],$v,false).'>'.esc_html($label).'</option>';}echo '</select></td></tr><tr><th>Aktiv</th><td><label><input type="checkbox" name="enabled" value="1" '.checked($profile['enabled'],true,false).'> Im Prompt-Assistenten anbieten</label></td></tr>';
        $source_lines=array();foreach($profile['sources'] as $source){$source_lines[]=$source['url'].' | '.$source['title'];}
        $areas=array('sources'=>array('Quellen · eine HTTPS-URL | Titel pro Zeile',($draft?$draft['sources']:implode("\n",$source_lines))),'review_note'=>array('Prüfnotiz',$profile['review_note']),'prompt_rules'=>array('Modellspezifische Prompt-Regeln',$profile['prompt_rules']));
        foreach($areas as $key=>$item){echo '<tr><th><label for="catalog_'.$key.'">'.esc_html($item[0]).'</label></th><td><textarea class="large-text" rows="5" id="catalog_'.$key.'" name="'.$key.'">'.esc_textarea($item[1]).'</textarea></td></tr>';}
        foreach(array('capabilities'=>'Fähigkeiten (JSON)','ui_schema'=>'Einstellungsfelder (JSON)','workflows'=>'Workflow-Regeln und Referenzgrenzen (JSON)','option_rules'=>'Abhängigkeiten zwischen Einstellungen (JSON)','reference_support'=>'Referenzhinweise (JSON)') as $key=>$label){echo '<tr><th><label for="catalog_'.$key.'">'.esc_html($label).'</label></th><td><textarea class="large-text code" rows="9" id="catalog_'.$key.'" name="'.$key.'">'.esc_textarea($draft?$draft[$key]:self::json($profile[$key])).'</textarea></td></tr>';}
        echo '</table><p>Neue Workflows müssen in <code>workflows</code> und den <code>mode</code>-Optionen von <code>ui_schema</code> dieselbe ID besitzen. Grenzen und Standardwerte werden beim Speichern geprüft. Für den Einstieg ein ähnliches Profil kopieren.</p>';submit_button('Profil prüfen und speichern');echo '</form>';
        if(isset($state['custom'][$edit])&&!$copy){self::form_start('remove_override',$state['revision']);echo '<input type="hidden" name="key" value="'.esc_attr($edit).'"><p>Entfernt das eigene Profil bzw. die Anpassung. Ein vorhandenes Katalogprofil mit derselben ID wird wieder verwendet.</p>';submit_button('Eigene Anpassung entfernen','secondary');echo '</form>';}
        echo '<hr><h2>Katalog importieren / exportieren</h2><p>JSON-Datei bis 2 MB. Der Import ersetzt den Grundkatalog erst nach Vorschau. Eigene Profile bleiben erhalten; bis zu fünf vorherige Verwaltungsstände werden gesichert.</p>';
        self::form_start('preview',$state['revision'],true);echo '<input type="file" name="catalog" accept="application/json,.json" required>';submit_button('Import prüfen','secondary');echo '</form>';self::form_start('export',$state['revision']);submit_button('Aktiven Katalog als JSON exportieren','secondary');echo '</form>';
        if($state['backups']){echo '<h2>Vorherigen Stand wiederherstellen</h2>';self::form_start('restore',$state['revision']);echo '<select name="backup">';foreach($state['backups'] as $i=>$b){echo '<option value="'.(int)$i.'">'.esc_html($b['created_at'].' · Verwaltungsstand '.$b['revision']).'</option>';}echo '</select><p>Stellt Grundkatalog und eigene Profile dieses Sicherungsstands wieder her. Der aktuelle Stand wird vorher gesichert.</p>';submit_button('Ausgewählten Stand wiederherstellen','secondary');echo '</form>';}
        echo '<link rel="stylesheet" href="'.esc_url(PDIR_URL.'assets/css/dialogs.css?ver='.PDIR_VERSION).'">';
        echo '<script src="'.esc_url(PDIR_URL.'assets/js/dialogs.js?ver='.PDIR_VERSION).'" defer></script>';
        echo '<script src="'.esc_url(PDIR_URL.'assets/js/catalog-editor.js?ver='.PDIR_VERSION).'" defer></script>';
        echo '</div>';
    }
}
