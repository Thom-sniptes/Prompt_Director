<?php
if (!defined('ABSPATH')) { exit; }
/** Deliberately conservative checks: warnings, never claims of semantic certainty. */
final class PDIR_Quality {
    private static function text($value) { return is_scalar($value)?substr((string)$value,0,20000):''; }
    private static function normalize($value) { return strtolower(trim(preg_replace('/\s+/u',' ',self::text($value)))); }
    public static function semantic_key($params) {
        $ws = is_array($params['workspace'] ?? null) ? $params['workspace'] : array();
        $prod = is_array($ws['production'] ?? null) ? $ws['production'] : array();
        $source = array(
            'idea' => self::text($params['idea'] ?? $ws['idea'] ?? ''),
            'groups' => $params['groups'] ?? $ws['groups'] ?? array(),
            'selected_shot' => self::selected_shot($prod),
            'target_model' => self::text($params['target_model'] ?? ''),
            'target_media_type' => self::text($params['target_media_type'] ?? ''),
            'briefing' => $prod['briefing'] ?? array(),
            'series' => $prod['series_rules'] ?? '',
            'direction' => $ws['direction'] ?? $params['project_direction'] ?? '',
            'project_rules' => $ws['project_rules'] ?? '',
            'technical' => array('distance'=>$params['distance']??'','angle'=>$params['angle']??'','style'=>$params['style']??'','lighting'=>$params['lighting']??''),
            'customer' => $ws['customer_snapshot'] ?? array(),
            'exceptions' => $ws['exceptions'] ?? '',
            'references' => $params['references'] ?? $ws['references'] ?? array(),
        );
        return 'pdir_sem_' . get_current_user_id() . '_' . hash('sha256', PDIR_Settings::semantic_mode() . '|' . wp_json_encode($source));
    }
    public static function selected_shot($production) {
        $id=(string)($production['selected_shot_id']??'');
        if($id==='')return array();
        foreach(is_array($production['shots']??null)?$production['shots']:array() as $shot){
            if(is_array($shot) && ($shot['id']??'')===$id)return $shot;
        }
        return array();
    }
    public static function preflight($params) {
        $warnings=array();$ws=is_array($params['workspace']??null)?$params['workspace']:array();$production=is_array($ws['production']??null)?$ws['production']:array();$shot=array();
        foreach(is_array($production['shots']??null)?$production['shots']:array() as $candidate){if(is_array($candidate)&&($candidate['id']??'')===($production['selected_shot_id']??'')){$shot=$candidate;break;}}
        // Technical and structural checks only. Unstructured creative prose is
        // deliberately NOT parsed into blocking color/count/pose/location claims.
        // Semantic interpretation belongs to the OpenRouter audit (input check optional, finished-prompt check automatic).
        if (isset($params['references']) && !is_array($params['references'])) {
            $warnings[]=array('code'=>'invalid_references','message'=>'Referenzen haben ein ungültiges Datenformat.','fix'=>'Referenzen erneut laden.');
        }
        if($shot && ($params['target_media_type']??'')==='video'){
            // All shot detail fields are optional. Only an explicit, objectively
            // conflicting numeric duration can create a technical hint.
            $duration=self::text($shot['duration']??'');
            if(preg_match('/^(\d+(?:[.,]\d+)?)\s*(?:s|sec|seconds|sekunden)?$/iu',trim($duration),$m)){
                $seconds=(float)str_replace(',','.',$m[1]);
                $option=$params['model_options']['duration']??null;
                if(is_scalar($option)&&is_numeric($option)&&abs($seconds-(float)$option)>0.1){
                    $warnings[]=array('code'=>'duration_conflict','message'=>'Shot-Dauer und ausgewählte Modelldauer unterscheiden sich.','fix'=>'Timing im Shot und Modelldauer aufeinander abstimmen.');
                }
            }
        }
        // Role/purpose meaning belongs to the semantic LLM audit.
        // Exact IDs, supported roles and reference limits remain validated
        // by the model profile and REST generation layer.
        $blocking=array();
        // Project/brief/idea meaning is not inferred by PHP keyword heuristics.
        // The project block toggle is retained for compatibility and possible
        // future verified structured conflicts; AI findings remain advisory.
        // Cached semantic findings are advisory, never treated as deterministic
        // blocking evidence. A different input hash cannot reuse old findings.
        if(PDIR_Settings::semantic_enabled()){
            $cached=get_transient(self::semantic_key($params));
            if(is_array($cached)){
                foreach($cached as $issue){if(is_array($issue))$warnings[]=$issue;}
            }
        }
        $warnings=array_slice($warnings,0,20);
        return array('warnings'=>$warnings,'blocking'=>$blocking,'notice'=>'Eingaben technisch geprüft. Die KI-Konfliktprüfung ist optional; jeder generierte Prompt wird automatisch semantisch geprüft.');
    }
    public static function revision($base,$prompt,$mandatory='') {
        // Advisory lexical diff only. Semantic completeness is checked by the
        // post-generation KI audit. This is never blocking evidence.
        $a=preg_split('/\s+/u',self::normalize($base),-1,PREG_SPLIT_NO_EMPTY);
        $b=preg_split('/\s+/u',self::normalize($prompt),-1,PREG_SPLIT_NO_EMPTY);
        $ratio=count($a)?1-count(array_intersect($a,$b))/count($a):0;
        $warnings=array();
        if($ratio>0.35)$warnings[]=array('code'=>'broad_change',
            'message'=>'Ein größerer Teil des ursprünglichen Wortlauts wurde geändert. Dies ist nur ein Textvergleich.');
        return array('warnings'=>$warnings,'removed_word_ratio'=>round($ratio,3),
            'notice'=>'Wortlautvergleich zur Orientierung; semantische Änderungen prüft die KI.');
    }

}
