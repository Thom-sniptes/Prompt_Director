<?php
if (!defined('ABSPATH')) { exit; }

/** Validated data only: imported catalogs never execute PHP or JavaScript. */
final class PDIR_Catalog {
    const OPTION = 'pdir_catalog_state_v1';
    const MAX_PROFILES = 200;
    private static $cache = null;
    public static function reset_cache() { self::$cache = null; }
    public static function state() {
        $state = get_option(self::OPTION, array());
        return is_array($state) ? array_merge(array('revision'=>0,'imported'=>null,'custom'=>array(),'backups'=>array()),$state) : array('revision'=>0,'imported'=>null,'custom'=>array(),'backups'=>array());
    }
    public static function bundled() {
        $raw = file_get_contents(PDIR_DIR . 'catalog/models.json');
        return self::validate_catalog(json_decode($raw,true));
    }
    public static function profiles($include_disabled=false) {
        if (self::$cache === null) {
            $state = self::state(); $base = $state['imported'] ?: self::bundled();
            if (is_wp_error($base)) { self::$cache = array(); }
            else {
                self::$cache = array();
                $updates=array();$baseline=array();
                if($state['imported']){
                    $latest=self::bundled();$previous=self::validate_catalog(json_decode(file_get_contents(PDIR_DIR.'catalog/reference-baseline.json'),true));
                    if(!is_wp_error($latest) && !is_wp_error($previous)){foreach($latest['profiles'] as $p){$updates[$p['key']]=$p;}foreach($previous['profiles'] as $p){$baseline[$p['key']]=$p;}}
                }
                foreach ($base['profiles'] as $profile) {
                    $key=$profile['key'];
                    if(isset($baseline[$key],$updates[$key]) && $profile==$baseline[$key]){$profile=$updates[$key];}
                    $profile['origin']='catalog'; self::$cache[$key]=$profile;
                }
                foreach ($state['custom'] as $key=>$profile) { $profile['origin']='custom'; self::$cache[$key]=$profile; }
            }
        }
        return $include_disabled ? self::$cache : array_filter(self::$cache, function($p){return !empty($p['enabled']);});
    }
    public static function profile($key) { $profiles=self::profiles(); return $profiles[$key] ?? null; }
    public static function fail($message) { return new WP_Error('pdir_catalog_invalid', $message); }
    private static function text($v,$max) { return is_string($v) && strlen($v)<=$max && strpos($v,"\0")===false; }
    private static function id($v) { return is_string($v) && preg_match('/^[a-z][a-z0-9_-]{0,63}$/D',$v); }
    private static function is_list($v) { return is_array($v) && (!$v || array_keys($v)===range(0,count($v)-1)); }
    private static function scalar($v) { return is_bool($v) || is_int($v) || is_float($v) || (is_string($v) && strlen($v)<=1200); }
    public static function validate_profile($p) {
        $allowed=array('key','label','family','version','profile_version','type','enabled','review_status','reviewed_on','review_interval_days','sources','review_note','prompt_strategy','prompt_rules','capabilities','ui_schema','workflows','option_rules','reference_support');
        if (!is_array($p) || array_diff(array_keys($p),$allowed)) { return self::fail('Profil enthält unbekannte Felder.'); }
        foreach (array('key','label','family','version','profile_version','type','review_status','prompt_rules') as $key) {
            if (!isset($p[$key]) || !self::text($p[$key], $key==='prompt_rules'?12000:160) || trim($p[$key])==='') { return self::fail('Profilfeld fehlt oder ist ungültig: '.$key); }
        }
        if (!self::id($p['key']) || !in_array($p['type'],array('image','video'),true) || !preg_match('/^\d+\.\d+\.\d+$/D',$p['profile_version'])) { return self::fail('Profil-ID, Typ oder Profilversion ungültig.'); }
        if (!in_array($p['review_status'],array('verified','unverified','generic','custom'),true)) { return self::fail('Prüfstatus ungültig.'); }
        $p['enabled']=$p['enabled'] ?? true;
        if (!is_bool($p['enabled'])) { return self::fail('enabled muss true oder false sein.'); }
        $p['review_interval_days']=$p['review_interval_days']??90;
        if(!is_int($p['review_interval_days']) || $p['review_interval_days']<7 || $p['review_interval_days']>365){return self::fail('Prüfintervall muss 7–365 Tage betragen.');}
        $p['reviewed_on']=$p['reviewed_on'] ?? ''; $p['review_note']=$p['review_note'] ?? '';
        if (!self::text($p['review_note'],2000) || !self::text($p['reviewed_on'],10)) { return self::fail('Prüfnotiz oder Datum ungültig.'); }
        if ($p['reviewed_on']!=='') {
            $parts=explode('-',$p['reviewed_on']);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$p['reviewed_on']) || !checkdate((int)($parts[1]??0),(int)($parts[2]??0),(int)($parts[0]??0)) || $p['reviewed_on']>gmdate('Y-m-d')) { return self::fail('Prüfdatum ungültig oder in der Zukunft.'); }
        }
        $p['sources']=$p['sources'] ?? array();
        if (!self::is_list($p['sources']) || count($p['sources'])>10) { return self::fail('Maximal zehn Quellen pro Profil.'); }
        foreach($p['sources'] as $source) {
            if (!is_array($source) || array_diff(array_keys($source),array('title','url')) || !self::text($source['title']??'',200) || !self::text($source['url']??null,2000)) { return self::fail('Quellenformat ungültig.'); }
            $url=$source['url']; $host=parse_url($url,PHP_URL_HOST);
            if (!filter_var($url,FILTER_VALIDATE_URL) || parse_url($url,PHP_URL_SCHEME)!=='https' || !$host || parse_url($url,PHP_URL_USER)!==null || parse_url($url,PHP_URL_PASS)!==null) { return self::fail('Quellen benötigen gültige HTTPS-URLs ohne Zugangsdaten.'); }
        }
        if ($p['review_status']==='verified' && (!$p['sources'] || $p['reviewed_on']==='' || $p['version']==='generic')) { return self::fail('Geprüfte Profile benötigen Quellen, Prüfdatum und eine konkrete Modellversion.'); }
        $caps=$p['capabilities']??null;
        $cap_fields=array('t2i','t2v','camera_motion','clip_only','video','edit','multi_reference','rgba','cutout','local_edit','visible_text','negative_prompt','external_negative_prompt','inline_exclusions','image_reference_guidance','max_reference_guidance','max_reference_images','native_2k','up_to_4k','video_context','world_knowledge','custom_resolution','i2v','first_last_frame','video_extension','native_audio','native_reference_video','native_first_last_frame','native_reference_frames','temporal_reference_guidance','reference_video_guidance','frame_reference_guidance','timestamps');
        if (!is_array($caps) || array_diff(array_keys($caps),$cap_fields)) { return self::fail('Unbekannte Fähigkeiten im Profil.'); }
        foreach($caps as $key=>$value) {
            if (in_array($key,array('max_reference_guidance','max_reference_images'),true)) {
                if (!is_int($value) || $value<0 || $value>32) { return self::fail('Referenzgrenze muss 0–32 sein.'); }
            } elseif (!is_bool($value)) { return self::fail('Fähigkeiten müssen boolesche Werte sein.'); }
        }
        if (($caps['video']??false)!==($p['type']==='video')) { return self::fail('Profiltyp und Video-Fähigkeit widersprechen sich.'); }
        $schema=$p['ui_schema']??null;
        if (!self::is_list($schema) || count($schema)>25) { return self::fail('Maximal 25 Einstellungsfelder.'); }
        $fields=array();
        foreach($schema as $field) {
            if (!is_array($field) || array_diff(array_keys($field),array('key','label','type','default','options','min','max','advanced','help','show_for_modes')) || !self::id($field['key']??null) || isset($fields[$field['key']]) || !self::text($field['label']??null,160) || !in_array($field['type']??'',array('select','number','text','checkbox'),true)) { return self::fail('Einstellungsfeld ungültig oder doppelt.'); }
            if (!array_key_exists('default',$field) || !self::scalar($field['default'])) { return self::fail('Standardwert fehlt oder ist ungültig.'); }
            if (isset($field['help']) && !self::text($field['help'],2000)) { return self::fail('Hilfetext zu lang.'); }
            if (isset($field['advanced']) && !is_bool($field['advanced'])) { return self::fail('advanced muss boolesch sein.'); }
            if ($field['type']==='select') {
                if (!is_array($field['options']??null) || !$field['options'] || count($field['options'])>60) { return self::fail('Auswahloptionen ungültig.'); }
                foreach($field['options'] as $value=>$label) { if (!self::text((string)$value,100) || !self::text($label,200)) { return self::fail('Auswahloption ungültig.'); } }
                if (!is_string($field['default']) || !array_key_exists($field['default'],$field['options'])) { return self::fail('Auswahl-Standardwert fehlt in Optionen.'); }
            }
            if ($field['type']==='text' && !self::text($field['default'],1200)) { return self::fail('Text-Standardwert muss eine Zeichenkette sein.'); }
            if ($field['type']==='checkbox' && !is_bool($field['default'])) { return self::fail('Checkbox-Standardwert muss boolesch sein.'); }
            if ($field['type']==='number') {
                if (!is_numeric($field['min']??null) || !is_numeric($field['max']??null) || !is_numeric($field['default']) || $field['min'] < -10000000 || $field['max'] > 10000000 || $field['min']>$field['max'] || $field['default']<$field['min'] || $field['default']>$field['max']) { return self::fail('Zahlenbereich oder Standardwert ungültig.'); }
            }
            $fields[$field['key']]=$field;
        }
        $flows=$p['workflows']??null;
        if (!is_array($flows) || !$flows || count($flows)>20 || !isset($fields['mode']) || $fields['mode']['type']!=='select' || array_diff(array_keys($flows),array_keys($fields['mode']['options'])) || array_diff(array_keys($fields['mode']['options']),array_keys($flows))) { return self::fail('Workflows müssen exakt zu den mode-Auswahloptionen passen.'); }
        foreach($flows as $id=>$flow) {
            if (!self::id($id) || !is_array($flow) || array_diff(array_keys($flow),array('label','prompt_rules','min_images','max_images','min_videos','max_videos','requires_first_last','native_image_kinds','forced_options')) || !self::text($flow['label']??null,160) || !self::text($flow['prompt_rules']??null,6000)) { return self::fail('Workflow ungültig.'); }
            foreach(array('min_images','max_images','min_videos') as $n) { if (!is_int($flow[$n]??null) || $flow[$n]<0 || $flow[$n]>32) { return self::fail('Workflow-Referenzgrenze ungültig.'); } }
            if (isset($flow['max_videos']) && (!is_int($flow['max_videos']) || $flow['max_videos']<$flow['min_videos'] || $flow['max_videos']>32)) { return self::fail('Video-Referenzgrenze ungültig.'); }
            if ($flow['min_images']>$flow['max_images'] || $flow['max_images']>($caps['max_reference_images']??0) || !is_bool($flow['requires_first_last']??null) || ($flow['requires_first_last'] && ($p['type']!=='video' || $flow['min_images']!==2))) { return self::fail('Workflow-Anforderungen widersprechen Referenzgrenzen.'); }
            if ($flow['min_images']+$flow['min_videos'] > max($caps['max_reference_guidance']??0,$caps['max_reference_images']??0) || ($p['type']==='image' && $flow['min_videos']>0)) { return self::fail('Pflichtreferenzen überschreiten die Gesamtgrenze oder passen nicht zum Bildtyp.'); }
            if (!self::is_list($flow['native_image_kinds']??null) || array_diff($flow['native_image_kinds'],array('image','first_frame','last_frame','key_frame'))) { return self::fail('Native Referenztypen ungültig.'); }
            if ($flow['requires_first_last'] && (!in_array('first_frame',$flow['native_image_kinds'],true) || !in_array('last_frame',$flow['native_image_kinds'],true))) { return self::fail('Anfangs-/Endframe-Typen fehlen im Workflow.'); }
            if (!is_array($flow['forced_options']??null)) { return self::fail('Workflow-Einstellungen ungültig.'); }
            foreach($flow['forced_options'] as $k=>$v) { if (in_array($k,array('mode','reference_count'),true) || !isset($fields[$k]) || !self::valid_field_value($fields[$k],$v)) { return self::fail('Workflow setzt unbekannte oder ungültige Einstellung.'); } }
        }
        foreach($fields as $field) { if (isset($field['show_for_modes']) && (!self::is_list($field['show_for_modes']) || array_diff($field['show_for_modes'],array_keys($flows)))) { return self::fail('Sichtbarkeitsregel enthält unbekannten Workflow.'); } }
        $p['option_rules']=$p['option_rules']??array();
        if (!self::is_list($p['option_rules']) || count($p['option_rules'])>30) { return self::fail('Zu viele Einstellungsregeln.'); }
        foreach($p['option_rules'] as $rule) {
            if (!is_array($rule) || array_diff(array_keys($rule),array('when','set')) || !is_array($rule['when']??null) || !$rule['when'] || !is_array($rule['set']??null)) { return self::fail('Einstellungsregel ungültig.'); }
            foreach($rule['when'] as $k=>$values) { if (!isset($fields[$k]) || !is_array($values) || !$values || count($values)>60) { return self::fail('Regelbedingung ungültig.'); } foreach($values as $v) { if (!self::valid_field_value($fields[$k],$v)) { return self::fail('Regelbedingung enthält ungültigen Wert.'); } } }
            foreach($rule['set'] as $k=>$v) { if ($k==='mode' || !isset($fields[$k]) || !self::valid_field_value($fields[$k],$v)) { return self::fail('Regelziel ungültig.'); } }
        }
        $p['reference_support']=$p['reference_support']??array();
        if (!is_array($p['reference_support']) || array_diff(array_keys($p['reference_support']),array('images','videos','frames','note'))) { return self::fail('Referenzhinweise ungültig.'); }
        foreach($p['reference_support'] as $v) { if (!self::text($v,2000)) { return self::fail('Referenzhinweis zu lang.'); } }
        $p['prompt_strategy']='catalog';
        return $p;
    }
    public static function valid_field_value($field,$value) {
        if ($field['type']==='select') { return is_string($value) && array_key_exists($value,$field['options']); }
        if ($field['type']==='checkbox') { return is_bool($value); }
        if ($field['type']==='number') { return is_numeric($value) && $value>=$field['min'] && $value<=$field['max']; }
        return self::text($value,1200);
    }
    public static function validate_catalog($catalog) {
        if (!is_array($catalog) || array_diff(array_keys($catalog),array('schema_version','catalog_version','profiles')) || ($catalog['schema_version']??null)!==1 || !self::text($catalog['catalog_version']??null,40) || !preg_match('/^\d+\.\d+\.\d+$/D',$catalog['catalog_version']) || !self::is_list($catalog['profiles']??null) || !$catalog['profiles'] || count($catalog['profiles'])>self::MAX_PROFILES) { return self::fail('Katalogformat ungültig (Schema 1, semantische Version, 1–200 Profile).'); }
        $out=array(); $seen=array();
        foreach($catalog['profiles'] as $p) { $p=self::validate_profile($p); if(is_wp_error($p)){return $p;} if(isset($seen[$p['key']])){return self::fail('Doppelte Profil-ID: '.$p['key']);} $seen[$p['key']]=true;$out[]=$p; }
        $catalog['profiles']=$out; return $catalog;
    }
    public static function diff($catalog) {
        $state=self::state(); $old=$state['imported']?:self::bundled(); $before=array();$after=array();
        foreach($old['profiles'] as $p){$before[$p['key']]=$p;} foreach($catalog['profiles'] as $p){$after[$p['key']]=$p;}
        $out=array('added'=>array(),'changed'=>array(),'removed'=>array(),'protected'=>array_keys($state['custom']));
        foreach($after as $k=>$p){if(!isset($before[$k])){$out['added'][]=$k;}elseif($before[$k]!==$p){$out['changed'][]=$k;}}
        $out['removed']=array_values(array_diff(array_keys($before),array_keys($after))); return $out;
    }
    /** Short DB lock; optimistic revision check protects admin forms and import previews. */
    public static function mutate($expected,$callback) {
        global $wpdb; $lock='pdir_catalog_'.substr(hash('sha256',$wpdb->options),0,30);
        if((string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 3)',$lock))!=='1'){return self::fail('Katalog wird gerade bearbeitet. Bitte erneut versuchen.');}
        try {
            wp_cache_delete(self::OPTION,'options');wp_cache_delete('alloptions','options');wp_cache_delete('notoptions','options');
            $state=self::state();
            if ((int)$state['revision']!==(int)$expected){return self::fail('Katalog wurde geändert. Bitte Seite neu laden; Import erneut prüfen.');}
            $next=$callback($state);if(is_wp_error($next)){return $next;}
            $base=$next['imported']?:self::bundled(); if(is_wp_error($base)){return $base;} $effective=array();foreach($base['profiles'] as $p){$effective[$p['key']]=$p;}foreach($next['custom'] as $k=>$p){$effective[$k]=$p;}
            if(count($effective)>self::MAX_PROFILES || !array_filter($effective,function($p){return $p['enabled'];})){return self::fail('Mindestens ein aktives Profil und maximal 200 Profile erforderlich.');}
            $backup=array('created_at'=>gmdate('c'),'revision'=>$state['revision'],'imported'=>$state['imported'],'custom'=>$state['custom']);
            $next['backups']=array_slice(array_merge(array($backup),$state['backups']),0,5);$next['revision']=$state['revision']+1;
            if(!update_option(self::OPTION,$next,false)){return self::fail('Katalog konnte nicht gespeichert werden.');}
            self::reset_cache();return $next;
        } finally {$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));}
    }
}
